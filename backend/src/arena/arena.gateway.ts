import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ArenaService } from './arena.service';
import { RtcService } from './rtc.service';

/**
 * Socket.io event reference
 * ─────────────────────────────────────────────
 * CLIENT → SERVER
 *   arena:join          { competitionId, token }           → join a competition room
 *   arena:leave         { competitionId }                  → leave room
 *   arena:participant-answer { roundId, participantId, selectedOption } → competitor submits answer
 *
 * SERVER → CLIENT
 *   arena:joined        { competitionId, state }           → initial state
 *   arena:round-start   { round, leaderboard }
 *   arena:round-end     { correctOption, explanation, leaderboard }
 *   arena:competition-end { winnerParticipantUserId, podium }
 *   arena:leaderboard   { leaderboard }                    → live score push
 *   arena:viewers-count { count }                          → Redis heartbeat count (every 8s)
 *   arena:hls-url       { url }                            → HLS broadcast URL
 *   arena:error         { message }
 *
 * NOTE: WebRTC signaling (webrtc.*) has been REMOVED.
 *       The stage now uses LiveKit SFU — tokens are issued via REST.
 */

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/arena',
})
export class ArenaGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ArenaGateway.name);

  /** Map<socketId, { userId, competitionId, participantId, role }> */
  private readonly connections = new Map<
    string,
    { userId: string; competitionId: string; participantId: string; role: string }
  >();

  /**
   * Per-competition online participant tracking.
   * Map<competitionId, Map<participantId, Set<socketId>>>
   */
  private readonly competitionMembers = new Map<string, Map<string, Set<string>>>();

  /** Active viewer-count push intervals per competitionId */
  private readonly viewerCountIntervals = new Map<string, ReturnType<typeof setInterval>>();

  /** Tracks one oral signal per participant per active question. */
  private readonly oralSignals = new Map<string, Set<string>>();

  constructor(
    private readonly arenaService: ArenaService,
    private readonly rtcService: RtcService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private isOralV1() {
    return this.configService.get<string>('ARENA_MODE', 'oral_v1') === 'oral_v1';
  }

  handleConnection(client: Socket) {
    // Auth is validated on arena:join — connection just registers the socket
    client.emit('arena:connected', { socketId: client.id });
  }

  handleDisconnect(client: Socket) {
    const ctx = this.connections.get(client.id);
    if (ctx) {
      const { competitionId, participantId } = ctx;
      const participantsInComp = this.competitionMembers.get(competitionId);
      if (participantsInComp) {
        const sockets = participantsInComp.get(participantId);
        if (sockets) {
          sockets.delete(client.id);
          if (sockets.size === 0) {
            participantsInComp.delete(participantId);
            if (!this.isReservedParticipantId(participantId)) {
              this.server
                .to(`competition:${competitionId}`)
                .emit('arena:participant-disconnected', { participantId, anyoneLeft: false });
            }
          }
        }
      }

      this.emitOnlineParticipants(competitionId);
      this.emitOnlineUsers(competitionId);
      this.emitViewerCount(competitionId);
      this.server.to(`match:${competitionId}`).emit('webrtc.peer-left', { userId: ctx.userId });
    }
    this.connections.delete(client.id);
  }

  // ─── Join competition room ───────────────────

  @SubscribeMessage('arena:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { competitionId: string; userId: string; participantId: string; role: string; token?: string },
  ) {
    const { competitionId, participantId } = payload;

    // ── Verify JWT to get authoritative userId/role (prevents role spoofing) ──
    const rawToken = payload.token ?? (client.handshake.auth?.token as string | undefined);
    if (!rawToken) {
      client.emit('arena:error', { message: 'Authentification requise.' });
      client.disconnect();
      return;
    }
    let verifiedUserId: string;
    let verifiedRole: string;
    try {
      const secret = this.configService.get<string>('JWT_SECRET', 'konesans-dev-secret');
      const decoded = this.jwtService.verify<{ sub: string; role: string }>(rawToken, { secret });
      verifiedUserId = decoded.sub;
      verifiedRole = decoded.role;
    } catch {
      client.emit('arena:error', { message: 'Token invalide ou expiré.' });
      client.disconnect();
      return;
    }

    // Validate participation (team is approved for this competition)
    const allowed = await this.arenaService.canJoinRoom(verifiedUserId, competitionId, participantId);
    if (!allowed) {
      client.emit('arena:error', { message: 'Accès refusé à cette compétition.' });
      return;
    }

    const room = `competition:${competitionId}`;
    await client.join(room);

    const matchRoom = `match:${competitionId}`;
    const spectatorRoom = `match:${competitionId}:spectators`;
    if (participantId === '__spectator__') {
      await client.join(spectatorRoom);
    } else {
      await client.join(matchRoom);
    }

    // Admins and moderators get dedicated admin room for privileged broadcasts
    if (verifiedRole === 'admin' || verifiedRole === 'moderator') {
      await client.join(`admin:${competitionId}`);
    }

    const participantRoom = `participant:${competitionId}:${participantId}`;
    await client.join(participantRoom);

    this.connections.set(client.id, {
      userId: verifiedUserId,
      competitionId,
      participantId,
      role: verifiedRole,
    });

    // Track online team members and spectators
    if (!this.competitionMembers.has(competitionId)) {
      this.competitionMembers.set(competitionId, new Map());
    }
    const participantsInComp = this.competitionMembers.get(competitionId)!;
    if (!participantsInComp.has(participantId)) {
      participantsInComp.set(participantId, new Set());
      if (!this.isReservedParticipantId(participantId)) {
        this.server
          .to(`competition:${competitionId}`)
          .emit('arena:participant-connected', { participantId });
      }
    }
    participantsInComp.get(participantId)!.add(client.id);

    this.emitOnlineParticipants(competitionId);
    this.emitOnlineUsers(competitionId);
    this.emitViewerCount(competitionId);

    // Send current state
    const state = await this.arenaService.getCompetitionLiveState(competitionId);
    client.emit('arena:joined', state);

    // Start periodic viewer-count push for this room (no-op if already started)
    this.startViewerCountInterval(competitionId);
  }

  // ─── Submit answer (captain only) ───────────

  @SubscribeMessage('arena:participant-answer')
  async handleParticipantAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { roundId: string; participantId: string; selectedOption: 'A' | 'B' | 'C' | 'D' },
  ) {
    const ctx = this.connections.get(client.id);
    if (!ctx) {
      client.emit('arena:error', { message: 'Non connecté.' });
      return;
    }

    try {
      if (this.isOralV1()) {
        const signal = await this.arenaService.signalOralAnswer(
          ctx.userId,
          payload.roundId,
          payload.participantId,
        );

        const alreadySignaled = this.oralSignals.get(signal.roundId) ?? new Set<string>();
        if (alreadySignaled.has(payload.participantId)) {
          client.emit('arena:error', { message: 'Votre prise de parole est déjà signalée pour cette question.' });
          return;
        }

        alreadySignaled.add(payload.participantId);
        this.oralSignals.set(signal.roundId, alreadySignaled);

        const event = {
          participantId: payload.participantId,
          option: null,
          at: new Date().toISOString(),
        };

        this.server.to(`competition:${signal.competitionId}`).emit('arena:answer-submitted', event);
        return;
      }

      const result = await this.arenaService.submitParticipantAnswer(
        ctx.userId,
        payload.roundId,
        payload.participantId,
        payload.selectedOption,
      );

      // Push updated leaderboard to the whole competition room
      const room = `competition:${ctx.competitionId}`;
      this.server.to(room).emit('arena:leaderboard', result.leaderboard);
      const submissionEvent = {
        participantId: payload.participantId,
        option: payload.selectedOption,
        at: new Date().toISOString(),
      };
      this.server.to(room).emit('arena:answer-submitted', submissionEvent);
      this.server.to(`admin:${ctx.competitionId}`).emit('arena:answer-submitted', submissionEvent);
    } catch (err) {
      client.emit('arena:error', { message: (err as Error).message });
    }
  }

  // ─── Server-initiated events (called by service) ─

  /**
   * Called by ArenaService when admin launches a round.
   */
  broadcastRoundStart(competitionId: string, roundPayload: unknown, leaderboard: unknown) {
    if (roundPayload && typeof roundPayload === 'object' && 'id' in roundPayload) {
      const roundId = (roundPayload as { id?: string }).id;
      if (roundId) {
        this.oralSignals.delete(roundId);
      }
    }

    this.server
      .to(`competition:${competitionId}`)
      .emit('arena:round-start', { round: roundPayload, question: roundPayload, leaderboard });
  }

  /**
   * Called by ArenaService when a round timer expires.
   */
  broadcastRoundEnd(competitionId: string, correctOption: string, explanation: string | null, leaderboard: unknown) {
    this.server
      .to(`competition:${competitionId}`)
      .emit('arena:round-end', { correctOption, explanation, leaderboard });
  }

  /**
   * Called by ArenaService when competition finishes.
   */
  broadcastCompetitionEnd(competitionId: string, result: unknown) {
    this.server.to(`competition:${competitionId}`).emit('arena:competition-end', result);
  }

  broadcastPause(competitionId: string) {
    this.server.to(`competition:${competitionId}`).emit('arena:competition-paused', {});
  }

  broadcastResume(competitionId: string) {
    this.server.to(`competition:${competitionId}`).emit('arena:competition-resumed', {});
  }

  broadcastDisqualification(competitionId: string, participantId: string, leaderboard: unknown) {
    this.server
      .to(`competition:${competitionId}`)
      .emit('arena:participant-disqualified', { participantId, leaderboard });
  }

  broadcastScoreAdjustment(competitionId: string, leaderboard: unknown) {
    this.server.to(`competition:${competitionId}`).emit('arena:score-adjusted', leaderboard);
  }

  broadcastScoreUpdated(competitionId: string, leaderboard: unknown) {
    // Single namespaced event; score.updated kept as alias for backward compat
    this.server.to(`competition:${competitionId}`).emit('arena:leaderboard', leaderboard);
    this.server.to(`competition:${competitionId}`).emit('score.updated', { leaderboard });
  }

  broadcastChatDeleted(competitionId: string, participantId: string, messageId: string) {
    this.server
      .to(`competition:${competitionId}`)
      .emit('arena:chat-deleted', { participantId, messageId });
  }

  /** Push the HLS broadcast URL to everyone watching this competition. */
  broadcastHlsUrl(competitionId: string, url: string) {
    this.server.to(`competition:${competitionId}`).emit('arena:hls-url', { url });
  }

  // ─── Viewer count push (Redis heartbeat, every 8s per active room) ───────

  private startViewerCountInterval(competitionId: string) {
    if (this.viewerCountIntervals.has(competitionId)) return;
    const interval = setInterval(async () => {
      const hasListeners = (await this.server.in(`competition:${competitionId}`).fetchSockets()).length > 0;
      if (!hasListeners) {
        clearInterval(interval);
        this.viewerCountIntervals.delete(competitionId);
        return;
      }
      const count = await this.rtcService.getViewerCountSafe(competitionId);
      this.server.to(`competition:${competitionId}`).emit('arena:viewers-count', { count });
    }, 8_000);
    this.viewerCountIntervals.set(competitionId, interval);
  }

  // ─────────────────────────────────────────────────────────────────────────

  private isReservedParticipantId(participantId: string) {
    return participantId === '__admin__' || participantId === '__spectator__';
  }

  private emitOnlineParticipants(competitionId: string) {
    const participantsInComp = this.competitionMembers.get(competitionId);
    const onlineParticipantIds = participantsInComp
      ? Array.from(participantsInComp.keys()).filter((id) => !this.isReservedParticipantId(id))
      : [];
    this.server
      .to(`competition:${competitionId}`)
      .emit('arena:online-participants', { participantIds: onlineParticipantIds });
  }

  private emitOnlineUsers(competitionId: string) {
    const dedup = new Map<string, { userId: string; participantId: string; role: string }>();
    for (const ctx of this.connections.values()) {
      if (ctx.competitionId !== competitionId) continue;
      if (!dedup.has(ctx.userId)) {
        dedup.set(ctx.userId, {
          userId: ctx.userId,
          participantId: ctx.participantId,
          role: ctx.role,
        });
      }
    }
    this.server
      .to(`competition:${competitionId}`)
      .emit('arena:online-users', { users: Array.from(dedup.values()) });
  }

  private emitViewerCount(competitionId: string) {
    // Count WS-connected spectators (fallback when Redis is unavailable)
    const viewers = Array.from(this.connections.values()).filter(
      (ctx) => ctx.competitionId === competitionId && ctx.participantId === '__spectator__',
    ).length;
    this.server.to(`competition:${competitionId}`).emit('arena:viewers-count', { count: viewers });
  }
}

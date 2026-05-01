import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ArenaService } from './arena.service';
import { ArenaGateway } from './arena.gateway';
import { RtcService } from './rtc.service';
import { ConfigService } from '@nestjs/config';
import { EgressStatus } from '@livekit/protocol';
import { JwtAuthGuard } from '../mvp/auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../mvp/auth/roles.guard';
import { UserRole } from '../mvp/entities';
import {
  AdjustScoreDto,
  AssignModeratorDto,
  CreateArenaCompetitionDto,
  DisqualifyParticipantDto,
  RegisterParticipantDto,
  ReviewParticipantRegistrationDto,
  ScoreRoundDto,
  SetArenaPublicStreamStatusDto,
  SetWinnerDto,
  UpdateArenaPublicStreamDto,
  ViewerPingDto,
} from './arena.dto';

type AuthenticatedRequest = {
  user: { id: string; email: string; role: UserRole };
};

@Controller('api/arena')
export class ArenaController {
  constructor(
    private readonly arenaService: ArenaService,
    private readonly arenaGateway: ArenaGateway,
    private readonly rtcService: RtcService,
    private readonly configService: ConfigService,
  ) {}

  private isOralV1() {
    return this.configService.get<string>('ARENA_MODE', 'oral_v1') === 'oral_v1';
  }

  // ─── Competitions ─────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('competitions')
  createCompetition(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateArenaCompetitionDto,
  ) {
    return this.arenaService.createCompetition(req.user.id, dto);
  }

  @Get('competitions')
  getCompetitions(
    @Query('status') status?: string,
  ) {
    return this.arenaService.getCompetitions(status);
  }

  @Get('competitions/:id')
  getCompetition(@Param('id') id: string) {
    return this.arenaService.getCompetitionById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('competitions/:id/open')
  openRegistrations(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.arenaService.openRegistrations(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Post('competitions/register')
  registerParticipant(@Req() req: AuthenticatedRequest, @Body() dto: RegisterParticipantDto) {
    return this.arenaService.registerParticipant(req.user.id, dto.competitionId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('competitions/registrations/review')
  reviewRegistration(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReviewParticipantRegistrationDto,
  ) {
    return this.arenaService.reviewRegistration(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Get('competitions/:id/registrations')
  getRegistrations(@Param('id') id: string) {
    return this.arenaService.getRegistrations(id);
  }

  // ─── Live management (Admin only) ─────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('competitions/:id/launch')
  async launchCompetition(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body?: { questionIds?: string[] },
  ) {
    return this.arenaService.launchCompetition(req.user.id, id, body?.questionIds ?? []);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Post('competitions/:id/next-round')
  async startNextRound(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const result = await this.arenaService.startNextRound(req.user.id, id);

    // Broadcast start of the new round
    this.arenaGateway.broadcastRoundStart(id, result.round, result.leaderboard);

    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('rounds/:roundId/end')
  async endRound(@Req() req: AuthenticatedRequest, @Param('roundId') roundId: string) {
    const result = await this.arenaService.endRound(req.user.id, roundId);

    this.arenaGateway.broadcastRoundEnd(
      result.competitionId,
      result.correctOption,
      result.explanation,
      result.leaderboard
    );

    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('rounds/:roundId/score')
  async scoreRound(
    @Req() req: AuthenticatedRequest,
    @Param('roundId') roundId: string,
    @Body() dto: ScoreRoundDto,
  ) {
    const result = await this.arenaService.scoreRound(req.user.id, roundId, dto);
    this.arenaGateway.broadcastScoreUpdated(result.competitionId, result.leaderboard);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('competitions/:id/complete')
  async completeCompetition(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SetWinnerDto,
  ) {
    const competition = await this.arenaService.completeCompetition(req.user.id, id, dto);
    if (competition.broadcastEgressId) {
      await this.rtcService.stopBroadcast(competition.broadcastEgressId);
    }
    await this.arenaService.setBroadcastInfo(id, {
      egressId: null,
      status: 'stopped',
      playbackUrl: null,
    });
    if (competition.publicStreamProvider === 'youtube' && competition.publicStreamUrl) {
      await this.arenaService.setPublicStreamStatus(req.user.id, id, { status: 'stopped' });
    }
    this.arenaGateway.broadcastHlsUrl(id, '');
    const leaderboard = await this.arenaService.getLiveLeaderboard(id);
    this.arenaGateway.broadcastCompetitionEnd(id, {
      winnerParticipantUserId: dto.participantUserId,
      podium: leaderboard.slice(0, 3),
    });
    return competition;
  }

  // ─── Spectator / State ────────────────────────

  @Get('competitions/:id/state')
  getLiveState(@Param('id') id: string) {
    return this.arenaService.getCompetitionLiveState(id);
  }

  @Get('competitions/:id/public-stream')
  getPublicStream(@Param('id') id: string) {
    return this.arenaService.getPublicStream(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('competitions/:id/public-stream')
  updatePublicStream(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateArenaPublicStreamDto,
  ) {
    return this.arenaService.configurePublicStream(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('competitions/:id/public-stream/status')
  async updatePublicStreamStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SetArenaPublicStreamStatusDto,
  ) {
    const competition = await this.arenaService.getCompetitionById(id);

    if (dto.status === 'live') {
      if (competition.status !== 'live' && competition.status !== 'paused') {
        throw new ForbiddenException('Le match doit etre lance avant d\'ouvrir la diffusion publique.');
      }
      if (competition.publicStreamProvider === 'youtube' && competition.publicStreamUrl) {
        let egressId = competition.broadcastEgressId;

        if (egressId) {
          const roomEgresses = await this.rtcService.listEgressForRoom(id);
          const currentEgress = roomEgresses.find((item) => item.egressId === egressId);
          const isActiveEgress = currentEgress
            && [EgressStatus.EGRESS_ACTIVE, EgressStatus.EGRESS_STARTING].includes(currentEgress.status);

          if (!isActiveEgress) {
            egressId = null;
            await this.arenaService.setBroadcastInfo(id, {
              egressId: null,
              status: 'idle',
              playbackUrl: competition.publicStreamUrl ?? null,
            });
          }
        }

        if (!egressId) {
          const result = await this.rtcService.startYoutubeBroadcast(id);
          egressId = result.egressId;
          await this.arenaService.setBroadcastInfo(id, {
            egressId,
            status: 'live',
            playbackUrl: competition.publicStreamUrl ?? null,
          });
        }
        await this.arenaService.syncPublicStreamStatus(id, 'live');
      }
    }

    if (dto.status === 'stopped' && competition.broadcastEgressId) {
      await this.rtcService.stopBroadcast(competition.broadcastEgressId);
      await this.arenaService.setBroadcastInfo(id, {
        egressId: null,
        status: 'stopped',
        playbackUrl: competition.publicStreamUrl ?? null,
      });
      await this.arenaService.syncPublicStreamStatus(id, 'stopped');
    }

    if (dto.status === 'idle') {
      await this.arenaService.setBroadcastInfo(id, {
        egressId: null,
        status: 'idle',
        playbackUrl: competition.publicStreamUrl ?? null,
      });
      await this.arenaService.syncPublicStreamStatus(id, 'idle');
    }

    return this.arenaService.setPublicStreamStatus(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('questions/:questionId')
  getArenaQuestion(@Param('questionId') questionId: string) {
    if (this.isOralV1()) {
      throw new ForbiddenException('Le mode oral_v1 ne permet pas l\'accès aux questions QCM.');
    }
    return this.arenaService.getArenaQuestion(questionId);
  }

  @Get('competitions/:id/leaderboard')
  getLiveLeaderboard(@Param('id') id: string) {
    return this.arenaService.getLiveLeaderboard(id);
  }

  // ─── Chat history (for reconnect) ─────────────

  @UseGuards(JwtAuthGuard)
  @Get('competitions/:id/chat/:participantId')
  getChatHistory(@Param('id') id: string, @Param('participantId') participantId: string) {
    if (this.isOralV1()) {
      throw new ForbiddenException('Le chat Arena est désactivé en mode oral_v1.');
    }
    return this.arenaService.getChatHistory(id, participantId);
  }

  // ─── History ──────────────────────────────────

  @Get('history')
  getHistory() {
    return this.arenaService.getHistory();
  }

  @UseGuards(JwtAuthGuard)
  @Get('history/my')
  getMyHistory(@Req() req: AuthenticatedRequest) {
    return this.arenaService.getMyParticipantHistory(req.user.id);
  }
  // ─── Admin Live Control ─────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('competitions/:id/pause')
  async pauseCompetition(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const result = await this.arenaService.pauseCompetition(req.user.id, id);
    this.arenaGateway.broadcastPause(id);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('competitions/:id/resume')
  async resumeCompetition(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const result = await this.arenaService.resumeCompetition(req.user.id, id);
    this.arenaGateway.broadcastResume(id);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('competitions/:id/participants/:participantUserId/disqualify')
  async disqualifyParticipant(
    @Req() req: AuthenticatedRequest,
    @Param('id') competitionId: string,
    @Param('participantUserId') participantUserId: string,
    @Body() dto: DisqualifyParticipantDto,
  ) {
    const result = await this.arenaService.disqualifyParticipant(
      req.user.id,
      competitionId,
      participantUserId,
      dto,
    );
    this.arenaGateway.broadcastDisqualification(competitionId, participantUserId, result.leaderboard);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('competitions/:id/adjust-score')
  async adjustScore(
    @Req() req: AuthenticatedRequest,
    @Param('id') competitionId: string,
    @Body() dto: AdjustScoreDto,
  ) {
    const result = await this.arenaService.adjustScore(req.user.id, competitionId, dto);
    this.arenaGateway.broadcastScoreAdjustment(competitionId, result.leaderboard);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Delete('chat/messages/:messageId')
  async deleteChatMessage(
    @Req() req: AuthenticatedRequest,
    @Param('messageId') messageId: string,
  ) {
    if (this.isOralV1()) {
      throw new ForbiddenException('Le chat Arena est désactivé en mode oral_v1.');
    }
    const result = await this.arenaService.deleteChatMessage(req.user.id, messageId);
    this.arenaGateway.broadcastChatDeleted(result.competitionId, result.participantId, result.deleted);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Get('competitions/:id/admin-state')
  getAdminLiveState(@Param('id') id: string) {
    return this.arenaService.getAdminLiveState(id);
  }

  // ─── Moderator Management ────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('moderatable')
  getModeratable() {
    return this.arenaService.getModeratable();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Post('competitions/:id/claim-moderator')
  claimModerator(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.arenaService.claimModerator(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('competitions/:id/assign-moderator')
  assignModerator(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AssignModeratorDto,
  ) {
    return this.arenaService.assignModerator(req.user.id, id, dto.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Post('competitions/:id/release-moderator')
  releaseModerator(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.arenaService.releaseModerator(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admins')
  getAdminUsers() {
    return this.arenaService.getAdminUsers();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('moderators')
  getModeratorUsers() {
    return this.arenaService.getModeratorUsers();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Get('moderator/my-matches')
  getMyModeratorMatches(@Req() req: AuthenticatedRequest) {
    return this.arenaService.getMyModeratorMatches(req.user.id);
  }

  // ─── RTC Stage Token ──────────────────────────────────────────────────

  /**
   * POST /api/arena/competitions/:id/rtc-token
   * Returns a LiveKit JWT token for the 3 stage participants
   * (moderator | competitorA | competitorB). Spectators are refused.
   */
  @UseGuards(JwtAuthGuard)
  @Post('competitions/:id/rtc-token')
  async getRtcToken(
    @Req() req: AuthenticatedRequest,
    @Param('id') matchId: string,
  ) {
    const role = await this.arenaService.getMatchRole(req.user.id, matchId);
    if (role === 'spectator') {
      throw new ForbiddenException(
        'Les spectateurs ne peuvent pas rejoindre la scène RTC. Regardez le live HLS.',
      );
    }
    const user = await this.arenaService.getUserById(req.user.id);
    const displayName = user
      ? `${user.firstName} ${user.lastName}`.trim()
      : req.user.email;

    return this.rtcService.generateStageToken(
      matchId,
      req.user.id,
      displayName,
      role,
    );
  }

  // ─── Broadcast (HLS Egress) ──────────────────────────────────────────

  /**
   * POST /api/arena/competitions/:id/broadcast/start
   * Starts the LiveKit Room Composite Egress and writes the egressId + URL to DB.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Post('competitions/:id/broadcast/start')
  async startBroadcast(
    @Req() req: AuthenticatedRequest,
    @Param('id') matchId: string,
  ) {
    const competition = await this.arenaService.getCompetitionById(matchId);
    if (!competition) throw new ForbiddenException('Compétition introuvable.');

    let egressId = competition.broadcastEgressId;
    let playbackUrl = competition.broadcastUrl;

    if (egressId) {
      const roomEgresses = await this.rtcService.listEgressForRoom(matchId);
      const currentEgress = roomEgresses.find((item) => item.egressId === egressId);
      const isActiveEgress = currentEgress
        && [EgressStatus.EGRESS_ACTIVE, EgressStatus.EGRESS_STARTING].includes(currentEgress.status);

      if (!isActiveEgress) {
        egressId = null;
        await this.arenaService.setBroadcastInfo(matchId, {
          egressId: null,
          status: 'idle',
          playbackUrl: competition.broadcastUrl ?? null,
        });
      }
    }

    if (!egressId) {
      const result = await this.rtcService.startBroadcast(matchId);
      egressId = result.egressId;
      playbackUrl = result.playbackUrl;
      await this.arenaService.setBroadcastInfo(matchId, {
        egressId,
        status: 'live',
        playbackUrl,
      });
    }

    this.arenaGateway.broadcastHlsUrl(matchId, playbackUrl ?? '');
    return { egressId, status: 'live', playbackUrl };
  }

  /**
   * POST /api/arena/competitions/:id/broadcast/stop
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @HttpCode(200)
  @Post('competitions/:id/broadcast/stop')
  async stopBroadcast(
    @Req() req: AuthenticatedRequest,
    @Param('id') matchId: string,
  ) {
    const competition = await this.arenaService.getCompetitionById(matchId);
    if (competition.broadcastEgressId) {
      await this.rtcService.stopBroadcast(competition.broadcastEgressId);
    }
    await this.arenaService.setBroadcastInfo(matchId, {
      egressId: null,
      status: 'stopped',
      playbackUrl: competition.broadcastUrl,
    });
    return { status: 'stopped' };
  }

  /**
   * GET /api/arena/competitions/:id/broadcast
   * Public — returns current broadcast status and playback URL.
   */
  @Get('competitions/:id/broadcast')
  async getBroadcast(@Param('id') matchId: string) {
    const competition = await this.arenaService.getCompetitionById(matchId);
    if (competition.publicStreamProvider === 'youtube' && competition.publicStreamUrl) {
      if (competition.broadcastEgressId) {
        const roomEgresses = await this.rtcService.listEgressForRoom(matchId);
        const currentEgress = roomEgresses.find((item) => item.egressId === competition.broadcastEgressId);
        const isActiveEgress = currentEgress
          && [EgressStatus.EGRESS_ACTIVE, EgressStatus.EGRESS_STARTING].includes(currentEgress.status);

        if (!isActiveEgress) {
          await this.arenaService.setBroadcastInfo(matchId, {
            egressId: null,
            status: 'stopped',
            playbackUrl: competition.publicStreamUrl ?? null,
          });
          await this.arenaService.syncPublicStreamStatus(matchId, 'stopped');
        }
      }
      return this.arenaService.getPublicStream(matchId);
    }

    if (competition.status === 'completed' || competition.status === 'cancelled') {
      return {
        provider: 'hls',
        status: 'stopped',
        playbackUrl: null,
        startedAt: competition.broadcastStartedAt ?? null,
      };
    }

    if (competition.broadcastEgressId) {
      const roomEgresses = await this.rtcService.listEgressForRoom(matchId);
      const currentEgress = roomEgresses.find((item) => item.egressId === competition.broadcastEgressId);
      const isActiveEgress = currentEgress
        && [EgressStatus.EGRESS_ACTIVE, EgressStatus.EGRESS_STARTING].includes(currentEgress.status);

      if (!isActiveEgress) {
        await this.arenaService.setBroadcastInfo(matchId, {
          egressId: null,
          status: 'stopped',
          playbackUrl: null,
        });
        return {
          provider: 'hls',
          status: 'stopped',
          playbackUrl: null,
          startedAt: competition.broadcastStartedAt ?? null,
        };
      }
    }

    return {
      provider: 'hls',
      status: competition.broadcastStatus ?? 'idle',
      playbackUrl: competition.broadcastUrl ?? null,
      startedAt: competition.broadcastStartedAt ?? null,
    };
  }

  // ─── Viewer Counter ──────────────────────────────────────────────────

  /**
   * POST /api/arena/competitions/:id/viewers/join
   * No auth — any visitor (with or without account) can register as a viewer.
   * Returns a viewerId to store in localStorage for pinging.
   */
  @HttpCode(200)
  @Post('competitions/:id/viewers/join')
  async viewerJoin(@Param('id') matchId: string) {
    const viewerId = await this.rtcService.viewerJoin(matchId);
    return { viewerId };
  }

  /**
   * POST /api/arena/competitions/:id/viewers/ping
   * body { viewerId } — refresh the TTL (call every 20–30s from the watch page).
   */
  @HttpCode(200)
  @Post('competitions/:id/viewers/ping')
  async viewerPing(
    @Param('id') matchId: string,
    @Body() dto: ViewerPingDto,
  ) {
    await this.rtcService.viewerPing(matchId, dto.viewerId);
    return { ok: true };
  }

  /**
   * GET /api/arena/competitions/:id/viewers/count
   * Public — returns current active viewer count.
   */
  @Get('competitions/:id/viewers/count')
  async viewerCount(@Param('id') matchId: string) {
    const count = await this.rtcService.getViewerCountSafe(matchId);
    return { count };
  }
}

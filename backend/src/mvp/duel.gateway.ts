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

/**
 * Socket.io event reference — namespace /duels
 * ─────────────────────────────────────────────
 * CLIENT → SERVER
 *   duel:join   { duelId, token }  → join room duel-{duelId}
 *   duel:leave  { duelId }         → leave room
 *
 * SERVER → CLIENT
 *   duel:joined        { duelId }
 *   duel:state         { duelId, mode, status, participants[], moderatorUserId, ... }
 *   duel:score-update  same shape as duel:state
 *   duel:ended         { ...state, result: 'A'|'B'|'DRAW' }
 *   duel:error         { message }
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/duels',
})
export class DuelGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DuelGateway.name);

  /** socketId → { userId, duelId } */
  private readonly connections = new Map<string, { userId: string; duelId: string }>();

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    client.emit('duel:connected', { socketId: client.id });
  }

  handleDisconnect(client: Socket) {
    const ctx = this.connections.get(client.id);
    if (ctx) {
      void client.leave(`duel-${ctx.duelId}`);
      this.connections.delete(client.id);
    }
  }

  @SubscribeMessage('duel:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { duelId: string; token: string },
  ) {
    const { duelId, token } = payload ?? {};
    if (!duelId || !token) {
      client.emit('duel:error', { message: 'duelId and token are required' });
      return;
    }

    let userId: string;
    try {
      const decoded = this.jwtService.verify<{ sub: string }>(token);
      userId = decoded.sub;
    } catch {
      client.emit('duel:error', { message: 'Invalid token' });
      return;
    }

    const room = `duel-${duelId}`;
    await client.join(room);
    this.connections.set(client.id, { userId, duelId });

    this.logger.log(`User ${userId} joined duel room ${room}`);
    client.emit('duel:joined', { duelId });
  }

  @SubscribeMessage('duel:leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { duelId: string },
  ) {
    const room = `duel-${payload?.duelId}`;
    void client.leave(room);
    this.connections.delete(client.id);
  }

  /** Emit an event to all clients in a duel room. Used by DuelOralService. */
  emitToRoom(duelId: string, event: string, data: unknown): void {
    this.server.to(`duel-${duelId}`).emit(event, data);
  }
}

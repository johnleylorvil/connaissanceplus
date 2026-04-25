import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  EgressClient,
  SegmentedFileOutput,
  SegmentedFileProtocol,
  S3Upload,
} from 'livekit-server-sdk';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { rm } from 'fs/promises';
import { join } from 'path';

export type StageRole = 'moderator' | 'competitorA' | 'competitorB';

export interface RtcTokenPayload {
  url: string;
  token: string;
  roomName: string;
  identity: string;
  role: StageRole;
}

export interface BroadcastInfo {
  status: 'idle' | 'starting' | 'live' | 'stopped';
  egressId: string | null;
  playbackUrl: string | null;
  startedAt: string | null;
}

@Injectable()
export class RtcService {
  private readonly logger = new Logger(RtcService.name);
  private readonly redis: Redis;
  private readonly egressClient: EgressClient;
  private readonly livekitHttpUrl: string;
  private readonly livekitWsUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly hlsBaseUrl: string;
  private readonly hlsOutputDir: string;
  private readonly hlsS3Bucket: string | null;
  private readonly hlsS3Region: string;
  private readonly hlsS3AccessKey: string | null;
  private readonly hlsS3SecretKey: string | null;
  private readonly hlsS3Endpoint: string | null;
  private readonly hlsS3ForcePathStyle: boolean;
  /**
   * ZADD score = expiry epoch ms — viewers are counted by
   * ZCOUNT key nowMs +inf (only entries with score > now are active).
   */
  private readonly viewerTtlMs = 90_000;

  constructor(private readonly configService: ConfigService) {
    this.livekitWsUrl = configService.get<string>('LIVEKIT_URL', 'ws://localhost:7880');
    // EgressClient needs http(s):// protocol
    this.livekitHttpUrl = this.livekitWsUrl
      .replace('wss://', 'https://')
      .replace('ws://', 'http://');
    this.apiKey = configService.get<string>('LIVEKIT_API_KEY', 'devkey');
    this.apiSecret = configService.get<string>('LIVEKIT_API_SECRET', 'devsecret');
    this.hlsBaseUrl = configService.get<string>(
      'HLS_BASE_URL',
      'http://localhost:3000/hls',
    );
    this.hlsOutputDir = configService
      .get<string>('HLS_OUTPUT_DIR', '/output')
      .replace(/[\\/]+$/, '');
    this.hlsS3Bucket = configService.get<string>('LIVEKIT_EGRESS_S3_BUCKET')?.trim() || null;
    this.hlsS3Region = configService.get<string>('LIVEKIT_EGRESS_S3_REGION', 'us-east-1');
    this.hlsS3AccessKey =
      configService.get<string>('LIVEKIT_EGRESS_S3_ACCESS_KEY')?.trim() || null;
    this.hlsS3SecretKey =
      configService.get<string>('LIVEKIT_EGRESS_S3_SECRET_KEY')?.trim() || null;
    this.hlsS3Endpoint =
      configService.get<string>('LIVEKIT_EGRESS_S3_ENDPOINT')?.trim() || null;
    this.hlsS3ForcePathStyle = ['1', 'true', 'yes', 'on'].includes(
      configService
        .get<string>('LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE', 'false')
        .trim()
        .toLowerCase(),
    );

    this.redis = new Redis({
      host: configService.get<string>('REDIS_HOST', 'localhost'),
      port: configService.get<number>('REDIS_PORT', 6379),
      lazyConnect: true,
      // Do not retry — Redis is optional; viewer counts degrade gracefully.
      retryStrategy: () => null,
      maxRetriesPerRequest: 0,
    });
    this.redis.on('error', () => { /* suppress — errors handled in getViewerCountSafe */ });
    this.redis.connect().catch(() => {
      this.logger.warn('Redis unavailable — viewer count feature disabled.');
    });

    this.egressClient = new EgressClient(
      this.livekitHttpUrl,
      this.apiKey,
      this.apiSecret,
    );
  }

  // ── RTC Stage Token ─────────────────────────────────────────────────────

  async generateStageToken(
    matchId: string,
    userId: string,
    displayName: string,
    role: StageRole,
    ttlSeconds = 3600,
  ): Promise<RtcTokenPayload> {
    const roomName = `arena-${matchId}`;

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      name: displayName,
      ttl: ttlSeconds,
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,       // stage participants always can publish
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return {
      url: this.livekitWsUrl,
      token,
      roomName,
      identity: userId,
      role,
    };
  }

  // ── HLS Broadcast (LiveKit Egress) ──────────────────────────────────────

  /**
   * Start a Room Composite Egress that writes HLS segments to the shared
   * /output volume (bind-mounted from hls_output Docker volume).
   * Returns the egressId and the playback URL.
   *
   * NOTE: Requires the LiveKit Egress service to be running and configured
   * with local file output. See docker-compose.yml for the commented service.
   * For production, configure S3 output via LIVEKIT_EGRESS_S3_* env vars.
   */
  async startBroadcast(
    matchId: string,
  ): Promise<{ egressId: string; playbackUrl: string }> {
    const roomName = `arena-${matchId}`;
    const broadcastSessionId = randomUUID();
    const filenamePrefix = `${this.hlsOutputDir}/${matchId}/${broadcastSessionId}/segment`;

    if (!this.usesS3BroadcastOutput()) {
      await this.resetLocalBroadcastOutput(matchId);
    }

    const output = new SegmentedFileOutput({
      protocol: SegmentedFileProtocol.HLS_PROTOCOL,
      filenamePrefix,
      playlistName: 'index.m3u8',
      segmentDuration: 3,
      ...(this.usesS3BroadcastOutput()
        ? {
            output: {
              case: 's3' as const,
              value: new S3Upload({
                accessKey: this.hlsS3AccessKey ?? '',
                secret: this.hlsS3SecretKey ?? '',
                region: this.hlsS3Region,
                bucket: this.hlsS3Bucket ?? '',
                endpoint: this.hlsS3Endpoint ?? '',
                forcePathStyle: this.hlsS3ForcePathStyle,
              }),
            },
          }
        : {
            // No storage field → LiveKit Egress writes to its local filesystem.
            // HLS_OUTPUT_DIR must match the path mounted into the egress container.
          }),
    });

    let info;
    try {
      info = await this.egressClient.startRoomCompositeEgress(
        roomName,
        output,
        { layout: 'grid' },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Egress indisponible';
      this.logger.error(`Unable to start HLS broadcast for ${roomName}: ${message}`);
      throw new ServiceUnavailableException(
        this.usesS3BroadcastOutput()
          ? 'Diffusion HLS indisponible. Vérifiez que LiveKit Egress est démarré et que les identifiants S3 de LIVEKIT_EGRESS_S3_* sont valides.'
          : 'Diffusion HLS indisponible. Vérifiez que LiveKit Egress est démarré, connecté à Redis et que HLS_OUTPUT_DIR pointe vers /output.',
      );
    }

    const playbackUrl = `${this.hlsBaseUrl}/${matchId}/${broadcastSessionId}/index.m3u8`;
    return { egressId: info.egressId, playbackUrl };
  }

  async stopBroadcast(egressId: string): Promise<void> {
    try {
      await this.egressClient.stopEgress(egressId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown egress stop failure';
      this.logger.warn(`Ignoring egress stop failure for ${egressId}: ${message}`);
    }
  }

  private async resetLocalBroadcastOutput(matchId: string): Promise<void> {
    const outputDir = join(process.cwd(), 'hls_output', matchId);
    await rm(outputDir, { recursive: true, force: true });
  }

  private usesS3BroadcastOutput(): boolean {
    return !!this.hlsS3Bucket;
  }

  async listEgressForRoom(matchId: string) {
    const roomName = `arena-${matchId}`;
    return this.egressClient.listEgress({ roomName });
  }

  // ── Viewer Counter (Redis sorted-set, score = expiry epoch ms) ──────────

  async viewerJoin(matchId: string): Promise<string> {
    const viewerId = randomUUID();
    const expiryScore = Date.now() + this.viewerTtlMs;
    await this.redis.zadd(`viewers:${matchId}`, expiryScore, viewerId);
    return viewerId;
  }

  async viewerPing(matchId: string, viewerId: string): Promise<void> {
    const expiryScore = Date.now() + this.viewerTtlMs;
    // ZADD updates the score if the member already exists (NX not set)
    await this.redis.zadd(`viewers:${matchId}`, expiryScore, viewerId);
  }

  async viewerLeave(matchId: string, viewerId: string): Promise<void> {
    await this.redis.zrem(`viewers:${matchId}`, viewerId);
  }

  async getViewerCount(matchId: string): Promise<number> {
    const now = Date.now();
    // Purge expired entries (score < now) then count active ones
    await this.redis.zremrangebyscore(`viewers:${matchId}`, '-inf', now - 1);
    return this.redis.zcount(`viewers:${matchId}`, now, '+inf');
  }

  /** Called by the Gateway on an interval to broadcast the count. */
  async getViewerCountSafe(matchId: string): Promise<number> {
    try {
      return await this.getViewerCount(matchId);
    } catch {
      return 0; // Redis unavailable — degrade gracefully
    }
  }

  assertLivekitConfigured(): void {
    if (this.apiKey === 'devkey' && this.apiSecret === 'devsecret') {
      throw new ForbiddenException(
        'LiveKit non configuré. Définissez LIVEKIT_API_KEY, LIVEKIT_API_SECRET et LIVEKIT_URL dans le .env.',
      );
    }
  }

  // Re-exported for controller use
  assertMatchRole(
    actual: string | null,
    expected: StageRole,
    matchId: string,
  ): void {
    if (actual !== expected) {
      throw new ForbiddenException(
        `Rôle RTC insuffisant pour cette compétition (${matchId}).`,
      );
    }
  }

  assertDefined<T>(value: T | null | undefined, label: string): T {
    if (value === null || value === undefined) {
      throw new NotFoundException(`${label} introuvable.`);
    }
    return value;
  }
}

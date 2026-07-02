import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DuelMatch,
  DuelMode,
  DuelProgress,
  DuelScoreEvent,
  DuelStatus,
  User,
  UserRole,
} from './entities';
import { OralScoreDto, OralScoreTarget, CreateOralDuelDto } from './dto/mvp.dto';
import { ChimeService } from './chime.service';
import { DuelGateway } from './duel.gateway';

@Injectable()
export class DuelOralService {
  private readonly logger = new Logger(DuelOralService.name);

  constructor(
    @InjectRepository(DuelMatch)
    private readonly duelMatchRepo: Repository<DuelMatch>,
    @InjectRepository(DuelProgress)
    private readonly duelProgressRepo: Repository<DuelProgress>,
    @InjectRepository(DuelScoreEvent)
    private readonly duelScoreEventRepo: Repository<DuelScoreEvent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly chimeService: ChimeService,
    private readonly duelGateway: DuelGateway,
  ) {}

  // ── Admin: create an ORAL_LIVE duel (players already known) ───────────

  async isOralLiveDuel(duelId: string) {
    const duel = await this.duelMatchRepo.findOne({ where: { id: duelId } });
    return duel?.mode === DuelMode.ORAL_LIVE;
  }

  async createOralDuel(dto: CreateOralDuelDto) {
    const [p1, p2] = await Promise.all([
      this.userRepo.findOne({ where: { id: dto.playerOneId } }),
      this.userRepo.findOne({ where: { id: dto.playerTwoId } }),
    ]);
    if (!p1) throw new NotFoundException('Player one not found');
    if (!p2) throw new NotFoundException('Player two not found');

    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const duel = await this.duelMatchRepo.save(
      this.duelMatchRepo.create({
        joinCode,
        competitionId: dto.competitionId,
        competitionName: dto.competitionName,
        playerOneId: dto.playerOneId,
        playerTwoId: dto.playerTwoId,
        status: DuelStatus.WAITING,
        mode: DuelMode.ORAL_LIVE,
        questionCount: 0, // oral live duels are open-ended
        moderatorUserId: null,
        chimeMeetingId: null,
        chimeMediaRegion: null,
        winnerUserId: null,
        liveStartedAt: null,
        liveEndedAt: null,
        startedAt: null,
        completedAt: null,
      }),
    );

    this.logger.log(`Created ORAL_LIVE duel ${duel.id} for players ${p1.id} ${p2.id}`);
    return { duelId: duel.id, joinCode: duel.joinCode };
  }

  // ── Start the live session ────────────────────────────────────────────

  async startOralLive(moderatorUserId: string, duelId: string) {
    const duel = await this.loadDuel(duelId);

    if (duel.mode !== DuelMode.ORAL_LIVE) {
      throw new BadRequestException('Duel is not in ORAL_LIVE mode');
    }
    if (duel.status === DuelStatus.COMPLETED) {
      throw new BadRequestException('Duel is already completed');
    }

    // Assign moderator (first caller wins the lock, similar to Arena pattern)
    if (!duel.moderatorUserId) {
      duel.moderatorUserId = moderatorUserId;
    } else if (duel.moderatorUserId !== moderatorUserId) {
      throw new ForbiddenException('Another moderator is already running this duel');
    }

    // Create Chime meeting (idempotent via ClientRequestToken)
    if (!duel.chimeMeetingId) {
      const meeting = await this.chimeService.createMeeting(duelId);
      duel.chimeMeetingId = meeting.MeetingId ?? null;
      duel.chimeMediaRegion = meeting.MediaRegion ?? null;
    }

    duel.status = DuelStatus.IN_PROGRESS;
    duel.startedAt = duel.startedAt ?? new Date();
    duel.liveStartedAt = duel.liveStartedAt ?? new Date();
    await this.duelMatchRepo.save(duel);

    // Ensure DuelProgress rows exist for both players
    await this.ensureProgress(duel);

    this.logger.log(`Oral live STARTED for duel ${duelId} by moderator ${moderatorUserId}`);

    const state = await this.buildDuelState(duel);
    this.duelGateway.emitToRoom(duelId, 'duel:state', state);

    return { message: 'Oral live started', duelId };
  }

  // ── Join: get Chime credentials for authorised participants ──────────

  async joinOralLive(requestingUserId: string, duelId: string) {
    const duel = await this.loadDuel(duelId);

    if (duel.mode !== DuelMode.ORAL_LIVE) {
      throw new BadRequestException('Duel is not in ORAL_LIVE mode');
    }
    if (duel.status === DuelStatus.WAITING) {
      throw new BadRequestException('Duel has not been started yet; wait for the moderator');
    }
    if (duel.status === DuelStatus.COMPLETED) {
      throw new BadRequestException('Duel is already completed');
    }

    // Authorization: only competitors and the assigned moderator may join
    const isAuthorised =
      requestingUserId === duel.playerOneId ||
      requestingUserId === duel.playerTwoId ||
      requestingUserId === duel.moderatorUserId;

    if (!isAuthorised) {
      // Fallback: admins are always allowed
      const user = await this.userRepo.findOne({ where: { id: requestingUserId } });
      if (!user || user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('You are not a participant in this duel');
      }
    }

    if (!duel.chimeMeetingId) {
      throw new BadRequestException('Chime meeting not yet initialised; start the duel first');
    }

    const [meeting, attendee] = await Promise.all([
      // Re-fetch meeting details by creating an attendee — SDK does not have a GetMeeting
      // in the simplified flow; we reconstruct meeting info from stored fields.
      Promise.resolve(this.reconstructMeetingInfo(duel)),
      this.chimeService.createAttendee(duel.chimeMeetingId, requestingUserId),
    ]);

    return { meeting, attendee };
  }

  // ── Score: moderator awards points ───────────────────────────────────

  async scoreOralLive(moderatorUserId: string, duelId: string, dto: OralScoreDto) {
    const duel = await this.loadDuel(duelId);

    if (duel.mode !== DuelMode.ORAL_LIVE) {
      throw new BadRequestException('Duel is not in ORAL_LIVE mode');
    }
    if (duel.status !== DuelStatus.IN_PROGRESS) {
      throw new BadRequestException('Duel is not in progress');
    }

    await this.assertModerator(moderatorUserId, duel);

    const points = dto.points ?? 1;
    const progresses = await this.duelProgressRepo.find({
      where: { duelMatchId: duelId },
    });

    const progressByUserId = new Map(progresses.map((p) => [p.userId, p]));

    const toUpdate: DuelProgress[] = [];

    if (dto.awardedTo === OralScoreTarget.A || dto.awardedTo === OralScoreTarget.BOTH) {
      const prog = progressByUserId.get(duel.playerOneId);
      if (prog) {
        prog.score += points;
        toUpdate.push(prog);
      }
    }
    if (dto.awardedTo === OralScoreTarget.B || dto.awardedTo === OralScoreTarget.BOTH) {
      const prog = progressByUserId.get(duel.playerTwoId ?? '');
      if (prog) {
        prog.score += points;
        toUpdate.push(prog);
      }
    }

    if (toUpdate.length > 0) {
      await this.duelProgressRepo.save(toUpdate);
    }

    // Audit trail
    await this.duelScoreEventRepo.save(
      this.duelScoreEventRepo.create({
        duelMatchId: duelId,
        awardedToUserId:
          dto.awardedTo === OralScoreTarget.A
            ? duel.playerOneId
            : dto.awardedTo === OralScoreTarget.B
              ? (duel.playerTwoId ?? null)
              : null,
        awardedByModeratorId: moderatorUserId,
        points,
        awardTarget: dto.awardedTo,
        reason: dto.reason ?? null,
      }),
    );

    this.logger.log(
      `Score awarded in duel ${duelId}: ${dto.awardedTo} +${points} by moderator ${moderatorUserId}`,
    );

    const state = await this.buildDuelState(duel);
    this.duelGateway.emitToRoom(duelId, 'duel:score-update', state);
    this.duelGateway.emitToRoom(duelId, 'duel:state', state);

    return state;
  }

  // ── End: moderator closes the match ──────────────────────────────────

  async endOralLive(moderatorUserId: string, duelId: string) {
    const duel = await this.loadDuel(duelId);

    if (duel.mode !== DuelMode.ORAL_LIVE) {
      throw new BadRequestException('Duel is not in ORAL_LIVE mode');
    }
    if (duel.status === DuelStatus.COMPLETED) {
      throw new BadRequestException('Duel is already completed');
    }

    await this.assertModerator(moderatorUserId, duel);

    const progresses = await this.duelProgressRepo.find({
      where: { duelMatchId: duelId },
    });

    const scoreA = progresses.find((p) => p.userId === duel.playerOneId)?.score ?? 0;
    const scoreB = progresses.find((p) => p.userId === duel.playerTwoId)?.score ?? 0;

    let winnerUserId: string | null = null;
    let resultLabel: 'A' | 'B' | 'DRAW' = 'DRAW';

    if (scoreA > scoreB) {
      winnerUserId = duel.playerOneId;
      resultLabel = 'A';
    } else if (scoreB > scoreA) {
      winnerUserId = duel.playerTwoId ?? null;
      resultLabel = 'B';
    }

    duel.winnerUserId = winnerUserId;
    duel.status = DuelStatus.COMPLETED;
    duel.completedAt = new Date();
    duel.liveEndedAt = new Date();
    await this.duelMatchRepo.save(duel);

    this.logger.log(`Oral live ENDED for duel ${duelId} — winner: ${winnerUserId ?? 'DRAW'}`);

    // Clean up Chime meeting asynchronously — non-blocking
    if (duel.chimeMeetingId) {
      void this.chimeService.deleteMeeting(duel.chimeMeetingId);
    }

    const state = await this.buildDuelState(duel);
    this.duelGateway.emitToRoom(duelId, 'duel:ended', { ...state, result: resultLabel });

    return { ...state, result: resultLabel };
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private async loadDuel(duelId: string): Promise<DuelMatch> {
    const duel = await this.duelMatchRepo.findOne({ where: { id: duelId } });
    if (!duel) throw new NotFoundException('Duel not found');
    return duel;
  }

  private async ensureProgress(duel: DuelMatch): Promise<void> {
    const participants = [duel.playerOneId, duel.playerTwoId].filter(Boolean) as string[];

    for (const userId of participants) {
      const exists = await this.duelProgressRepo.findOne({
        where: { duelMatchId: duel.id, userId },
      });
      if (!exists) {
        await this.duelProgressRepo.save(
          this.duelProgressRepo.create({
            duelMatchId: duel.id,
            userId,
            score: 0,
            answeredCount: 0,
            startedAt: new Date(),
          }),
        );
      }
    }
  }

  private async assertModerator(userId: string, duel: DuelMatch): Promise<void> {
    if (duel.moderatorUserId && duel.moderatorUserId !== userId) {
      // Check if they are admin, admins bypass
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.MODERATOR)) {
        throw new ForbiddenException('Only the assigned moderator or admin can perform this action');
      }
    }
  }

  private reconstructMeetingInfo(duel: DuelMatch) {
    // We store meetingId & mediaRegion; reconstruct a minimal structure for the client.
    // The amazon-chime-sdk-js client only needs MeetingId, MediaRegion, MediaPlacement.
    // MediaPlacement cannot be reconstructed; clients must re-call join to get attendee tokens.
    return {
      MeetingId: duel.chimeMeetingId,
      MediaRegion: duel.chimeMediaRegion,
      ExternalMeetingId: `konesans-duel-${duel.id}`,
    };
  }

  async getPublicState(requestingUserId: string, duelId: string) {
    const duel = await this.loadDuel(duelId);

    const isParticipant =
      requestingUserId === duel.playerOneId ||
      requestingUserId === duel.playerTwoId ||
      requestingUserId === duel.moderatorUserId;

    if (!isParticipant) {
      const user = await this.userRepo.findOne({ where: { id: requestingUserId } });
      if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.MODERATOR)) {
        throw new ForbiddenException('You are not a participant in this duel');
      }
    }

    return this.buildDuelState(duel);
  }

  async buildDuelState(duel: DuelMatch) {
    const progresses = await this.duelProgressRepo.find({
      where: { duelMatchId: duel.id },
      relations: ['user', 'user.academicClass'],
    });

    const participants = progresses.map((p) => ({
      userId: p.userId,
      name: p.user ? `${p.user.firstName} ${p.user.lastName}` : 'Unknown',
      score: p.score,
      academicLevelName: p.user?.academicClass?.name ?? null,
      avatarUrl: p.user?.avatarUrl ?? null,
      gender: p.user?.gender ?? null,
      role: p.userId === duel.playerOneId ? 'A' : 'B',
    }));

    return {
      duelId: duel.id,
      mode: duel.mode,
      status: duel.status,
      competitionName: duel.competitionName,
      moderatorUserId: duel.moderatorUserId,
      winnerUserId: duel.winnerUserId,
      participants,
      liveStartedAt: duel.liveStartedAt,
    };
  }
}


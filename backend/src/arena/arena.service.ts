import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import {
  ArenaParticipantMessage,
  ArenaCompetition,
  ArenaCompetitionStatus,
  ArenaParticipantAnswer,
  ArenaParticipantRegistration,
  ArenaParticipantRegistrationStatus,
  ArenaParticipantScoreAdjustment,
  ArenaRoundMode,
  ArenaRound,
} from './arena.entities';
import {
  AdjustScoreDto,
  CreateArenaCompetitionDto,
  DisqualifyParticipantDto,
  RegisterParticipantDto,
  ReviewParticipantRegistrationDto,
  SetWinnerDto,
} from './arena.dto';
import { Notification, Question, User, UserRole } from '../mvp/entities';

@Injectable()
export class ArenaService {
  constructor(
    @InjectRepository(ArenaCompetition)
    private readonly competitionRepo: Repository<ArenaCompetition>,
    @InjectRepository(ArenaParticipantRegistration)
    private readonly registrationRepo: Repository<ArenaParticipantRegistration>,
    @InjectRepository(ArenaRound)
    private readonly roundRepo: Repository<ArenaRound>,
    @InjectRepository(ArenaParticipantAnswer)
    private readonly answerRepo: Repository<ArenaParticipantAnswer>,
    @InjectRepository(ArenaParticipantMessage)
    private readonly chatRepo: Repository<ArenaParticipantMessage>,
    @InjectRepository(ArenaParticipantScoreAdjustment)
    private readonly adjustmentRepo: Repository<ArenaParticipantScoreAdjustment>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  // ─────────────────────────────────────────────
  // COMPETITION
  // ─────────────────────────────────────────────

  async createCompetition(adminId: string, dto: CreateArenaCompetitionDto) {
    const competition = await this.competitionRepo.save(
      this.competitionRepo.create({
        ...dto,
        scheduledAt: new Date(dto.scheduledAt),
        description: dto.description ?? null,
        createdByAdminId: adminId,
        status: ArenaCompetitionStatus.PENDING,
      }),
    );

    const students = await this.userRepo.find({
      where: { role: UserRole.STUDENT },
      select: {
        id: true,
      },
    });

    if (students.length > 0) {
      const scheduledLabel = competition.scheduledAt.toLocaleString('fr-HT');
      await this.notificationRepo.save(
        this.notificationRepo.create(
          students.map((student) => ({
            userId: student.id,
            title: 'Nouveau challenge Arena',
            message: `${competition.name} est maintenant programme pour ${scheduledLabel}. Consultez Arena pour vous inscrire.`,
            type: 'arena_competition',
          })),
        ),
      );
    }

    return competition;
  }

  async getCompetitions(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;
    const competitions = await this.competitionRepo.find({
      where,
      order: { scheduledAt: 'DESC' },
      take: 50,
    });
    return this.decorateCompetitions(competitions);
  }

  async getCompetitionById(id: string) {
    const competition = await this.competitionRepo.findOne({
      where: { id },
      relations: ['registrations', 'rounds'],
    });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    return this.decorateCompetition(competition);
  }

  async openRegistrations(adminId: string, competitionId: string) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    competition.status = ArenaCompetitionStatus.APPROVED;
    return this.competitionRepo.save(competition);
  }

  async registerParticipant(userId: string, competitionId: string) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    if (competition.status === ArenaCompetitionStatus.PENDING) {
      throw new BadRequestException('Les inscriptions ne sont pas encore ouvertes.');
    }
    if (
      competition.status === ArenaCompetitionStatus.LIVE ||
      competition.status === ArenaCompetitionStatus.COMPLETED
    ) {
      throw new BadRequestException('Les inscriptions sont closes.');
    }

    const existing = await this.registrationRepo.findOne({
      where: { competitionId, participantUserId: userId },
    });
    if (existing) throw new BadRequestException('Vous êtes déjà inscrit à cette compétition.');

    return this.registrationRepo.save(
      this.registrationRepo.create({
        competitionId,
        participantUserId: userId,
        status: ArenaParticipantRegistrationStatus.PENDING,
      }),
    );
  }

  async reviewRegistration(adminId: string, dto: ReviewParticipantRegistrationDto) {
    const registration = await this.registrationRepo.findOne({
      where: { id: dto.registrationId },
    });
    if (!registration) throw new NotFoundException('Inscription introuvable.');
    registration.status = dto.status;
    return this.registrationRepo.save(registration);
  }

  async getRegistrations(competitionId: string) {
    const registrations = await this.registrationRepo.find({ where: { competitionId } });
    if (registrations.length === 0) return registrations;

    const users = await this.userRepo.find({
      where: { id: In(registrations.map((r) => r.participantUserId)) },
    });
    const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    return registrations.map((reg) => ({
      ...reg,
      participantUserId: reg.participantUserId,
      participantName: names.get(reg.participantUserId) ?? null,
    }));
  }

  // ─────────────────────────────────────────────
  // LIVE – Round management (called from admin action)
  // ─────────────────────────────────────────────

  async launchCompetition(adminId: string, competitionId: string, questionIds: string[]) {
    void questionIds;
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    if (competition.status === ArenaCompetitionStatus.LIVE) {
      throw new BadRequestException('Compétition déjà en cours.');
    }

    const approvedRegs = await this.registrationRepo.find({
      where: { competitionId, status: ArenaParticipantRegistrationStatus.APPROVED },
      order: { registeredAt: 'ASC' },
    });

    if (approvedRegs.length < 2) {
      const pendingRegs = await this.registrationRepo.find({
        where: { competitionId, status: ArenaParticipantRegistrationStatus.PENDING },
        order: { registeredAt: 'ASC' },
      });
      for (const reg of pendingRegs) {
        reg.status = ArenaParticipantRegistrationStatus.APPROVED;
      }
      if (pendingRegs.length > 0) {
        await this.registrationRepo.save(pendingRegs);
      }
    }

    const approvedAfterAuto = await this.registrationRepo.find({
      where: { competitionId, status: ArenaParticipantRegistrationStatus.APPROVED },
      order: { registeredAt: 'ASC' },
    });

    if (approvedAfterAuto.length < 2) {
      throw new BadRequestException('Au moins 2 compétiteurs approuvés sont requis pour lancer le live.');
    }

    competition.competitorAUserId = approvedAfterAuto[0].participantUserId;
    competition.competitorBUserId = approvedAfterAuto[1].participantUserId;
    competition.moderatorUserId = adminId;

    competition.status = ArenaCompetitionStatus.LIVE;
    competition.startedAt = new Date();
    competition.currentRound = 0;
    await this.competitionRepo.save(competition);

    // Create rounds
    const roundsToCreate = competition.questionCount;
    const rounds = await this.roundRepo.save(
      Array.from({ length: roundsToCreate }, (_, index) =>
        this.roundRepo.create({
          competitionId,
          questionId: null,
          roundMode: ArenaRoundMode.ORAL,
          position: index + 1,
          startedAt: null,
          endedAt: null,
        }),
      ),
    );

    return { competition, rounds };
  }

  async startNextRound(adminId: string, competitionId: string) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    await this.ensureModeratorControl(adminId, competition);
    if (competition.status !== ArenaCompetitionStatus.LIVE) {
      throw new BadRequestException('La compétition n\'est pas en cours.');
    }

    // Ensure current round is ended before starting a new one
    if (competition.currentRound > 0) {
      const prevRound = await this.roundRepo.findOne({
        where: { competitionId, position: competition.currentRound },
      });
      if (prevRound && !prevRound.endedAt) {
        throw new BadRequestException('Veuillez clôturer le round actuel avant d\'en lancer un nouveau.');
      }
    }

    // ── Start next round ──────────────────────────────────────────────
    const nextPosition = (competition.currentRound ?? 0) + 1;
    const round = await this.roundRepo.findOne({
      where: { competitionId, position: nextPosition },
    });

    if (!round) throw new NotFoundException('Plus de rounds disponibles.');

    round.startedAt = new Date();
    round.endTime = new Date(Date.now() + competition.secondsPerQuestion * 1000);
    competition.currentRound = nextPosition;

    await Promise.all([this.roundRepo.save(round), this.competitionRepo.save(competition)]);

    const leaderboard = await this.getLiveLeaderboard(competitionId);
    return { round, position: nextPosition, leaderboard };
  }

  async endRound(adminId: string, roundId: string) {
    const targetRound = await this.roundRepo.findOne({ where: { id: roundId } });
    if (!targetRound) throw new NotFoundException('Round introuvable.');
    const competition = await this.competitionRepo.findOne({ where: { id: targetRound.competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    await this.ensureModeratorControl(adminId, competition);

    // ── Atomic update: only end the round if it hasn't been ended yet (prevents race condition) ──
    const updateResult = await this.roundRepo
      .createQueryBuilder()
      .update()
      .set({ endedAt: new Date() })
      .where('id = :id AND endedAt IS NULL', { id: roundId })
      .execute();

    if (updateResult.affected === 0) {
      // Could be already ended (concurrent admin click) or not found
      const round = await this.roundRepo.findOne({ where: { id: roundId } });
      if (!round) throw new NotFoundException('Round introuvable.');
      throw new BadRequestException('Ce round est déjà terminé.');
    }

    const round = await this.roundRepo.findOne({ where: { id: roundId } });
    if (!round) throw new NotFoundException('Round introuvable.');

    const leaderboard = await this.getLiveLeaderboard(round.competitionId);
    return {
      competitionId: round.competitionId,
      correctOption: '',
      explanation: null,
      leaderboard,
    };
  }

  async scoreRound(adminId: string, roundId: string, result: 'A' | 'B' | 'BOTH' | 'NONE') {
    const round = await this.roundRepo.findOne({ where: { id: roundId } });
    if (!round) throw new NotFoundException('Round introuvable.');

    const competition = await this.competitionRepo.findOne({ where: { id: round.competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    await this.ensureModeratorControl(adminId, competition);
    const competitorAId = competition.competitorAUserId;
    const competitorBId = competition.competitorBUserId;
    if (!competitorAId || !competitorBId) {
      throw new BadRequestException('Slots compétiteurs non initialisés pour ce match.');
    }

    const pointsA = result === 'A' || result === 'BOTH' ? 100 : 0;
    const pointsB = result === 'B' || result === 'BOTH' ? 100 : 0;

    const existing = await this.answerRepo.find({
      where: { roundId: round.id, participantUserId: In([competitorAId, competitorBId]) },
    });
    const byParticipant = new Map(existing.map((ans) => [ans.participantUserId, ans]));

    const upsertA = byParticipant.get(competitorAId)
      ? { ...byParticipant.get(competitorAId)!, isCorrect: pointsA > 0, pointsAwarded: pointsA, selectedOption: result, submittedAt: new Date(), submittedByUserId: adminId }
      : this.answerRepo.create({ roundId: round.id, participantUserId: competitorAId, submittedByUserId: adminId, selectedOption: result, isCorrect: pointsA > 0, pointsAwarded: pointsA, submittedAt: new Date() });
    const upsertB = byParticipant.get(competitorBId)
      ? { ...byParticipant.get(competitorBId)!, isCorrect: pointsB > 0, pointsAwarded: pointsB, selectedOption: result, submittedAt: new Date(), submittedByUserId: adminId }
      : this.answerRepo.create({ roundId: round.id, participantUserId: competitorBId, submittedByUserId: adminId, selectedOption: result, isCorrect: pointsB > 0, pointsAwarded: pointsB, submittedAt: new Date() });

    await this.answerRepo.save([upsertA, upsertB]);

    const leaderboard = await this.getLiveLeaderboard(round.competitionId);
    return {
      competitionId: round.competitionId,
      roundId: round.id,
      result,
      leaderboard,
    };
  }

  async completeCompetition(adminId: string, competitionId: string, dto: SetWinnerDto) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    await this.ensureModeratorControl(adminId, competition);

    const leaderboard = await this.getLiveLeaderboard(competitionId);
    const winner = leaderboard.find((entry) => entry.participantUserId === dto.participantUserId);
    if (!winner) {
      throw new BadRequestException('Le vainqueur sélectionné ne fait pas partie du classement actif.');
    }

    const topScore = leaderboard.length > 0 ? Math.max(...leaderboard.map((entry) => entry.score)) : null;
    const leaders = topScore === null ? [] : leaderboard.filter((entry) => entry.score === topScore);
    if (leaders.length !== 1) {
      throw new BadRequestException('Impossible de terminer le match: égalité en tête. Départagez les scores avant de clôturer.');
    }
    if (winner.score !== topScore) {
      throw new BadRequestException('Le vainqueur doit être le participant actuellement en tête du classement.');
    }

    competition.status = ArenaCompetitionStatus.COMPLETED;
    competition.completedAt = new Date();
    competition.winnerParticipantUserId = dto.participantUserId;

    await this.competitionRepo.save(competition);
    return this.decorateCompetition(competition);
  }

  // ─────────────────────────────────────────────
  // PARTICIPANT ANSWER (solo 1v1)
  // ─────────────────────────────────────────────

  async submitParticipantAnswer(
    userId: string,
    roundId: string,
    participantId: string,
    selectedOption: 'A' | 'B' | 'C' | 'D',
  ) {
    if (participantId !== userId) {
      throw new ForbiddenException('Chaque compétiteur ne peut soumettre que pour lui-même.');
    }

    const round = await this.roundRepo.findOne({ where: { id: roundId } });
    if (!round) throw new NotFoundException('Round introuvable.');
    if (round.endedAt) throw new BadRequestException('Ce round est déjà terminé.');

    const already = await this.answerRepo.findOne({ where: { roundId, participantUserId: participantId } });
    if (already) throw new BadRequestException('Réponse déjà soumise pour ce round.');

    if (!round.questionId) {
      throw new BadRequestException('Ce round oral ne permet pas de soumettre une réponse QCM.');
    }

    // Compute correctness immediately
    const question = await this.questionRepo.findOne({ where: { id: round.questionId } });
    const isCorrect = question?.correctOption === selectedOption;
    const pointsAwarded = isCorrect ? 100 : 0;

    const answer = await this.answerRepo.save(
      this.answerRepo.create({
        roundId,
        participantUserId: participantId,
        submittedByUserId: userId,
        selectedOption,
        isCorrect,
        pointsAwarded,
        submittedAt: new Date(),
      }),
    );

    const leaderboard = await this.getLiveLeaderboard(round.competitionId);
    return { answer, leaderboard };
  }

  async getLiveLeaderboard(competitionId: string) {
    const registrations = await this.registrationRepo.find({
      where: {
        competitionId,
        status: ArenaParticipantRegistrationStatus.APPROVED,
      },
    });

    const participantIds = registrations.map((r) => r.participantUserId);

    const scores: Record<string, number> = {};
    for (const participantId of participantIds) scores[participantId] = 0;

    if (participantIds.length === 0) return [];

    const answers = await this.answerRepo
      .createQueryBuilder('a')
      .innerJoin('arena_rounds', 'r', 'r.id = a.roundId')
      .where('r.competitionId = :competitionId', { competitionId })
      .andWhere('a.isCorrect = true')
      .select(['a.participantUserId', 'SUM(a.pointsAwarded) as pts'])
      .groupBy('a.participantUserId')
      .getRawMany<{ a_participantUserId: string; pts: string }>();

    for (const row of answers) {
      scores[row.a_participantUserId] = parseInt(row.pts, 10);
    }

    // Include manual score adjustments
    const adjustments = await this.adjustmentRepo.find({ where: { competitionId } });
    for (const adj of adjustments) {
      if (scores[adj.participantUserId] !== undefined) {
        scores[adj.participantUserId] = Math.max(0, scores[adj.participantUserId] + adj.pointsDelta);
      }
    }

    const participantNameMap: Record<string, string> = {};
    const users = await this.userRepo.find({ where: { id: In(participantIds) } });
    for (const u of users) {
      participantNameMap[u.id] = `${u.firstName} ${u.lastName}`.trim();
    }

    return Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .map(([participantUserId, score], index) => ({
        rank: index + 1,
        participantUserId,
        displayName: participantNameMap[participantUserId] ?? 'Participant inconnu',
        score,
      }));
  }

  // ─────────────────────────────────────────────
  // SPECTATOR / STATE
  // ─────────────────────────────────────────────

  async getCompetitionLiveState(competitionId: string) {
    const competition = await this.competitionRepo.findOne({
      where: { id: competitionId },
      relations: ['rounds'],
    });
    if (!competition) throw new NotFoundException('Compétition introuvable.');

    const leaderboard = await this.getLiveLeaderboard(competitionId);
    const currentRound =
      competition.currentRound > 0
        ? competition.rounds?.find((r) => r.position === competition.currentRound) ?? null
        : null;

    const userIds = [competition.competitorAUserId, competition.competitorBUserId, competition.moderatorUserId]
      .filter((id): id is string => !!id);
    const users = userIds.length > 0 ? await this.userRepo.find({ where: { id: In(userIds) } }) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const matchParticipants = [
      {
        userId: competition.competitorAUserId,
        role: 'competitorA' as const,
      },
      {
        userId: competition.competitorBUserId,
        role: 'competitorB' as const,
      },
      {
        userId: competition.moderatorUserId,
        role: 'moderator' as const,
      },
    ]
      .filter((entry): entry is { userId: string; role: 'competitorA' | 'competitorB' | 'moderator' } => !!entry.userId)
      .map((entry) => {
        const u = userMap.get(entry.userId);
        return {
          userId: entry.userId,
          role: entry.role,
          slot: entry.role === 'competitorA' ? 'A' : entry.role === 'competitorB' ? 'B' : 'M',
          displayName: u ? `${u.firstName} ${u.lastName}`.trim() : entry.role,
        };
      });

    const participants = matchParticipants.filter((p) => p.role !== 'moderator');

    return {
      competitionId,
      competitionName: competition.name,
      status: competition.status,
      secondsPerQuestion: competition.secondsPerQuestion,
      currentRoundNumber: competition.currentRound,
      totalRounds: competition.questionCount,
      currentRound,
      leaderboard,
      participants,
      matchParticipants,
    };
  }

  async canJoinRoom(userId: string, competitionId: string, participantId: string): Promise<boolean> {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) return false;

    // Admins and moderators always have access
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user?.role === UserRole.ADMIN || user?.role === UserRole.MODERATOR) return true;

    // Any authenticated non-admin can join as spectator
    if (participantId === '__spectator__') return true;

    if (participantId !== userId) return false;

    const registration = await this.registrationRepo.findOne({
      where: {
        competitionId,
        participantUserId: participantId,
        status: ArenaParticipantRegistrationStatus.APPROVED,
      },
    });
    return !!registration;
  }

  async getMatchRole(userId: string, competitionId: string): Promise<'competitorA' | 'competitorB' | 'moderator' | 'spectator'> {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) return 'spectator';
    if (competition.competitorAUserId === userId) return 'competitorA';
    if (competition.competitorBUserId === userId) return 'competitorB';
    if (competition.moderatorUserId === userId) return 'moderator';
    return 'spectator';
  }

  async getMatchPublishers(competitionId: string) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) return [];

    return [
      { userId: competition.competitorAUserId, role: 'competitorA' as const },
      { userId: competition.competitorBUserId, role: 'competitorB' as const },
      { userId: competition.moderatorUserId, role: 'moderator' as const },
    ].filter((entry): entry is { userId: string; role: 'competitorA' | 'competitorB' | 'moderator' } => !!entry.userId);
  }

  // ─────────────────────────────────────────────
  // CHAT
  // ─────────────────────────────────────────────

  async saveChatMessage(
    competitionId: string,
    participantId: string,
    userId: string,
    senderName: string,
    message: string,
  ) {
    return this.chatRepo.save(
      this.chatRepo.create({ competitionId, participantUserId: participantId, userId, message, senderName }),
    );
  }

  async getChatHistory(competitionId: string, participantId: string) {
    return this.chatRepo.find({
      where: { competitionId, participantUserId: participantId },
      order: { createdAt: 'ASC' },
      take: 100,
    });
  }

  // ─────────────────────────────────────────────
  // HISTORY
  // ─────────────────────────────────────────────

  async getHistory() {
    const competitions = await this.competitionRepo.find({
      where: { status: ArenaCompetitionStatus.COMPLETED },
      order: { completedAt: 'DESC' },
      take: 30,
    });
    return this.decorateCompetitions(competitions);
  }

  async getMyParticipantHistory(userId: string) {
    const registrations = await this.registrationRepo.find({
      where: { participantUserId: userId },
    });

    const ids = registrations.map((r) => r.competitionId);
    if (ids.length === 0) return [];

    const competitions = await this.competitionRepo
      .createQueryBuilder('c')
      .where('c.id IN (:...ids)', { ids })
      .orderBy('c.completedAt', 'DESC')
      .getMany();
    return this.decorateCompetitions(competitions);
  }

  // ─────────────────────────────────────────────
  // QUESTION (for live display — no correct answer)
  // ─────────────────────────────────────────────

  async getArenaQuestion(questionId: string) {
    const q = await this.questionRepo.findOne({ where: { id: questionId } });
    if (!q) throw new NotFoundException('Question introuvable.');
    // Never expose correctOption during a live round
    return {
      id: q.id,
      prompt: q.prompt,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
    };
  }

  // ─────────────────────────────────────────────
  // ADMIN LIVE ACTIONS
  // ─────────────────────────────────────────────

  async pauseCompetition(adminId: string, competitionId: string) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    await this.ensureModeratorControl(adminId, competition);
    if (competition.status !== ArenaCompetitionStatus.LIVE) {
      throw new BadRequestException('La compétition n\'est pas en cours.');
    }
    competition.status = ArenaCompetitionStatus.PAUSED;
    competition.pausedAt = new Date();
    return this.competitionRepo.save(competition);
  }

  async resumeCompetition(adminId: string, competitionId: string) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    await this.ensureModeratorControl(adminId, competition);
    if (competition.status !== ArenaCompetitionStatus.PAUSED) {
      throw new BadRequestException('La compétition n\'est pas en pause.');
    }
    competition.status = ArenaCompetitionStatus.LIVE;
    return this.competitionRepo.save(competition);
  }

  async disqualifyParticipant(
    adminId: string,
    competitionId: string,
    participantUserId: string,
    dto: DisqualifyParticipantDto,
  ) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    await this.ensureModeratorControl(adminId, competition);

    const registration = await this.registrationRepo.findOne({
      where: { competitionId, participantUserId },
    });
    if (!registration) throw new NotFoundException('Compétiteur non inscrit à cette compétition.');

    registration.status = ArenaParticipantRegistrationStatus.REJECTED;
    registration.disqualifiedAt = new Date();
    registration.disqualifiedReason = dto.reason ?? 'Disqualification par l\'administrateur';
    await this.registrationRepo.save(registration);

    const leaderboard = await this.getLiveLeaderboard(competitionId);
    return { participantUserId, disqualifiedAt: registration.disqualifiedAt, leaderboard };
  }

  async adjustScore(adminId: string, competitionId: string, dto: AdjustScoreDto) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    await this.ensureModeratorControl(adminId, competition);

    const registration = await this.registrationRepo.findOne({
      where: { competitionId, participantUserId: dto.participantUserId },
    });
    if (!registration) throw new NotFoundException('Compétiteur non inscrit dans cette compétition.');

    const adjustment = await this.adjustmentRepo.save(
      this.adjustmentRepo.create({
        competitionId,
        participantUserId: dto.participantUserId,
        adminId,
        pointsDelta: dto.pointsDelta,
        reason: dto.reason ?? null,
      }),
    );

    const leaderboard = await this.getLiveLeaderboard(competitionId);
    return { adjustment, leaderboard };
  }

  async deleteChatMessage(adminId: string, messageId: string) {
    void adminId;
    const msg = await this.chatRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message introuvable.');
    const { participantUserId, competitionId } = msg;
    await this.chatRepo.remove(msg);
    return { deleted: messageId, participantId: participantUserId, competitionId };
  }

  async getAdminLiveState(competitionId: string) {
    const base = await this.getCompetitionLiveState(competitionId);
    const registrations = await this.registrationRepo.find({ where: { competitionId } });

    const participantStatuses = await Promise.all(
      registrations.map(async (reg) => {
        const participant = await this.userRepo.findOne({ where: { id: reg.participantUserId } });
        const score = base.leaderboard.find((l) => l.participantUserId === reg.participantUserId)?.score ?? 0;

        let submission: { submitted: boolean; option: string | null; submittedAt: string | null } = {
          submitted: false,
          option: null,
          submittedAt: null,
        };

        if (base.currentRound) {
          const answer = await this.answerRepo.findOne({
            where: { roundId: base.currentRound.id, participantUserId: reg.participantUserId },
          });
          if (answer) {
            submission = {
              submitted: true,
              option: answer.selectedOption,
              submittedAt: answer.submittedAt.toISOString(),
            };
          }
        }

        return {
          participantUserId: reg.participantUserId,
          displayName: participant ? `${participant.firstName} ${participant.lastName}`.trim() : 'Participant',
          registrationStatus: reg.status,
          disqualifiedAt: reg.disqualifiedAt ?? null,
          disqualifiedReason: reg.disqualifiedReason ?? null,
          score,
          memberCount: 1,
          submission,
        };
      }),
    );

    return { ...base, participantStatuses };
  }

  private async decorateCompetition(competition: ArenaCompetition) {
    const [winnerParticipant] = competition.winnerParticipantUserId
      ? await this.userRepo.find({ where: { id: competition.winnerParticipantUserId } })
      : [null];

    return {
      ...competition,
      winnerParticipantUserId: competition.winnerParticipantUserId,
      winnerParticipantName: winnerParticipant
        ? `${winnerParticipant.firstName} ${winnerParticipant.lastName}`.trim()
        : null,
    };
  }

  private async decorateCompetitions(competitions: ArenaCompetition[]) {
    const winnerIds = competitions
      .map((competition) => competition.winnerParticipantUserId)
      .filter((winnerId): winnerId is string => !!winnerId);

    const winners = winnerIds.length > 0
      ? await this.userRepo.find({ where: { id: In(winnerIds) } })
      : [];
    const winnerMap = new Map(winners.map((winner) => [winner.id, `${winner.firstName} ${winner.lastName}`.trim()]));

    return competitions.map((competition) => ({
      ...competition,
      winnerParticipantUserId: competition.winnerParticipantUserId,
      winnerParticipantName: competition.winnerParticipantUserId
        ? (winnerMap.get(competition.winnerParticipantUserId) ?? null)
        : null,
    }));
  }

  async getModeratable() {
    const competitions = await this.competitionRepo.find({
      where: { status: Not(In([ArenaCompetitionStatus.COMPLETED, ArenaCompetitionStatus.CANCELLED])) },
      order: { scheduledAt: 'ASC' },
    });

    const moderatorIds = competitions
      .map((c) => c.moderatorUserId)
      .filter((id): id is string => !!id);

    const moderators =
      moderatorIds.length > 0 ? await this.userRepo.find({ where: { id: In(moderatorIds) } }) : [];

    const modMap = new Map(moderators.map((m) => [m.id, m]));

    return competitions.map((comp) => {
      const mod = comp.moderatorUserId ? modMap.get(comp.moderatorUserId) : null;
      return {
        ...comp,
        moderatorName: mod ? `${mod.firstName} ${mod.lastName}` : null,
        moderatorEmail: mod ? mod.email : null,
      };
    });
  }

  async claimModerator(callerId: string, competitionId: string) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');

    const caller = await this.userRepo.findOne({ where: { id: callerId } });
    if (!caller) throw new ForbiddenException('Utilisateur introuvable.');

    // ADMIN can always take over. MODERATOR can only claim if unassigned.
    if (caller.role === UserRole.MODERATOR) {
      if (competition.moderatorUserId && competition.moderatorUserId !== callerId) {
        throw new ForbiddenException('Ce match est déjà pris en charge par un autre modérateur.');
      }
    }

    competition.moderatorUserId = callerId;
    return this.competitionRepo.save(competition);
  }

  async assignModerator(adminId: string, competitionId: string, targetUserId: string) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');

    const targetUser = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!targetUser || (targetUser.role !== UserRole.ADMIN && targetUser.role !== UserRole.MODERATOR)) {
      throw new BadRequestException("L'utilisateur ciblé n'est pas un administrateur ou modérateur.");
    }

    competition.moderatorUserId = targetUserId;
    return this.competitionRepo.save(competition);
  }

  async releaseModerator(callerId: string, competitionId: string) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');

    const caller = await this.userRepo.findOne({ where: { id: callerId } });
    // ADMIN can release any match; MODERATOR can only release their own
    if (caller?.role !== UserRole.ADMIN && competition.moderatorUserId !== callerId) {
      throw new ForbiddenException('Vous n\'êtes pas le modérateur de ce match.');
    }

    competition.moderatorUserId = null;
    return this.competitionRepo.save(competition);
  }

  async getMyModeratorMatches(userId: string) {
    const competitions = await this.competitionRepo.find({
      where: { moderatorUserId: userId },
      order: { scheduledAt: 'ASC' },
    });
    return competitions.map((comp) => ({
      ...comp,
      moderatorName: null,
      moderatorEmail: null,
    }));
  }

  async getAdminUsers() {
    return this.userRepo.find({
      where: { role: UserRole.ADMIN },
      select: ['id', 'firstName', 'lastName', 'email'],
      order: { firstName: 'ASC' },
    });
  }

  async getModeratorUsers() {
    return this.userRepo.find({
      where: { role: UserRole.MODERATOR },
      select: ['id', 'firstName', 'lastName', 'email'],
      order: { firstName: 'ASC' },
    });
  }

  async getUserById(userId: string) {
    return this.userRepo.findOne({ where: { id: userId } });
  }

  async setBroadcastInfo(
    competitionId: string,
    info: {
      egressId: string | null;
      status: 'idle' | 'starting' | 'live' | 'stopped';
      playbackUrl: string | null;
    },
  ) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) return;
    competition.broadcastEgressId = info.egressId;
    competition.broadcastStatus = info.status;
    competition.broadcastUrl = info.playbackUrl;
    if (info.status === 'live' && !competition.broadcastStartedAt) {
      competition.broadcastStartedAt = new Date();
    }
    await this.competitionRepo.save(competition);
  }

  private async ensureModeratorControl(callerId: string, competition: ArenaCompetition) {
    const caller = await this.userRepo.findOne({ where: { id: callerId } });

    // ADMIN can always control any match (backward-compat: also auto-claims if unassigned)
    if (caller?.role === UserRole.ADMIN) {
      if (!competition.moderatorUserId) {
        competition.moderatorUserId = callerId;
        await this.competitionRepo.save(competition);
      }
      return;
    }

    // MODERATOR: must be the assigned moderator for this match
    if (caller?.role === UserRole.MODERATOR) {
      if (!competition.moderatorUserId) {
        throw new ForbiddenException('Aucun modérateur assigné pour ce match. Contactez un administrateur.');
      }
      if (competition.moderatorUserId !== callerId) {
        throw new ForbiddenException('Action réservée au modérateur assigné pour ce match.');
      }
      return;
    }

    throw new ForbiddenException('Accès refusé.');
  }
}

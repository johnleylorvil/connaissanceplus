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
  ArenaPublicStreamProvider,
  ArenaRoundMode,
  ArenaRound,
} from './arena.entities';
import {
  AdjustScoreDto,
  CreateArenaCompetitionDto,
  DisqualifyParticipantDto,
  RegisterParticipantDto,
  ReviewParticipantRegistrationDto,
  ScoreRoundDto,
  SetArenaPublicStreamStatusDto,
  SetWinnerDto,
  UpdateArenaPublicStreamDto,
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
    if (dto.competitorAUserId === dto.competitorBUserId) {
      throw new BadRequestException('Choisissez deux compétiteurs distincts pour ce match.');
    }

    const participantIds = [dto.competitorAUserId, dto.competitorBUserId];
    const participantUsers = await this.userRepo.find({
      where: { id: In(participantIds) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    if (participantUsers.length !== 2 || participantUsers.some((user) => user.role !== UserRole.STUDENT)) {
      throw new BadRequestException('Les deux compétiteurs sélectionnés doivent être des étudiants valides.');
    }

    let moderatorUser: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'> | null = null;
    if (dto.moderatorUserId) {
      moderatorUser = await this.userRepo.findOne({ where: { id: dto.moderatorUserId } });
      if (!moderatorUser || ![UserRole.ADMIN, UserRole.MODERATOR].includes(moderatorUser.role)) {
        throw new BadRequestException('Le modérateur sélectionné doit être un administrateur ou un modérateur valide.');
      }
    }

    const competition = await this.competitionRepo.save(
      this.competitionRepo.create({
        ...dto,
        scheduledAt: new Date(dto.scheduledAt),
        description: dto.description ?? null,
        createdByAdminId: adminId,
        status: ArenaCompetitionStatus.PENDING,
        competitorAUserId: dto.competitorAUserId,
        competitorBUserId: dto.competitorBUserId,
        moderatorUserId: dto.moderatorUserId ?? null,
      }),
    );

    await this.registrationRepo.save(
      participantIds.map((participantUserId) => ({
        competitionId: competition.id,
        participantUserId,
        status: ArenaParticipantRegistrationStatus.APPROVED,
      })),
    );

    const notificationRecipients = Array.from(
      new Set([
        ...participantUsers.map((user) => user.id),
        moderatorUser?.id ?? null,
      ].filter((userId): userId is string => !!userId)),
    );

    if (notificationRecipients.length > 0) {
      const scheduledLabel = competition.scheduledAt.toLocaleString('fr-HT');
      await this.notificationRepo.save(
        this.notificationRepo.create(
          notificationRecipients.map((userId) => ({
            userId,
            title: 'Match Arena programmé',
            message: `${competition.name} est programmé pour ${scheduledLabel}. Consultez Arena pour confirmer votre présence au direct.`,
            type: 'arena_competition',
          })),
        ),
      );
    }

    return this.decorateCompetition(competition);
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
    if (competition.competitorAUserId || competition.competitorBUserId) {
      throw new BadRequestException('Ce match fonctionne avec deux compétiteurs désignés à l’avance et n’ouvre pas les inscriptions publiques.');
    }
    competition.status = ArenaCompetitionStatus.APPROVED;
    return this.competitionRepo.save(competition);
  }

  async registerParticipant(userId: string, competitionId: string) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    if (competition.competitorAUserId || competition.competitorBUserId) {
      throw new BadRequestException('Ce match est fermé aux inscriptions: les deux compétiteurs ont déjà été désignés.');
    }
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
    if (![ArenaCompetitionStatus.PENDING, ArenaCompetitionStatus.APPROVED].includes(competition.status)) {
      throw new BadRequestException('Ce match ne peut pas être lancé dans son état actuel.');
    }

    const configuredParticipantIds = [competition.competitorAUserId, competition.competitorBUserId].filter(
      (participantId): participantId is string => !!participantId,
    );

    if (configuredParticipantIds.length === 1) {
      throw new BadRequestException('Le match doit avoir deux compétiteurs assignés avant le lancement.');
    }

    if (configuredParticipantIds.length === 2) {
      const existingRegistrations = await this.registrationRepo.find({ where: { competitionId } });
      const registrationsByParticipant = new Map(
        existingRegistrations.map((registration) => [registration.participantUserId, registration]),
      );
      const registrationsToSave = configuredParticipantIds.flatMap((participantUserId) => {
        const existingRegistration = registrationsByParticipant.get(participantUserId);
        if (!existingRegistration) {
          return [{
            competitionId,
            participantUserId,
            status: ArenaParticipantRegistrationStatus.APPROVED,
          }];
        }
        if (existingRegistration.status !== ArenaParticipantRegistrationStatus.APPROVED) {
          existingRegistration.status = ArenaParticipantRegistrationStatus.APPROVED;
          return [existingRegistration];
        }
        return [];
      });

      if (registrationsToSave.length > 0) {
        await this.registrationRepo.save(registrationsToSave);
      }
    } else {
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
    }

    competition.moderatorUserId = competition.moderatorUserId ?? adminId;

    competition.status = ArenaCompetitionStatus.LIVE;
    competition.startedAt = new Date();
    competition.currentRound = 0;
    await this.competitionRepo.save(competition);

    const existingRounds = await this.roundRepo.find({
      where: { competitionId },
      order: { position: 'ASC' },
    });

    const existingPositions = new Set(existingRounds.map((round) => round.position));
    const missingPositions = Array.from({ length: competition.questionCount }, (_, index) => index + 1)
      .filter((position) => !existingPositions.has(position));

    const createdRounds = missingPositions.length > 0
      ? await this.roundRepo.save(
          missingPositions.map((position) =>
            this.roundRepo.create({
              competitionId,
              questionId: null,
              roundMode: ArenaRoundMode.ORAL,
              position,
              startedAt: null,
              endedAt: null,
            }),
          ),
        )
      : [];

    const rounds = [...existingRounds, ...createdRounds].sort((left, right) => left.position - right.position);

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

    if (!round) throw new NotFoundException('Plus de questions disponibles pour ce match.');

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

  async scoreRound(adminId: string, roundId: string, dto: ScoreRoundDto) {
    const round = await this.roundRepo.findOne({ where: { id: roundId } });
    if (!round) throw new NotFoundException('Round introuvable.');
    if (!round.endedAt) {
      throw new BadRequestException('Clôturez la question avant d’enregistrer la décision du modérateur.');
    }

    const competition = await this.competitionRepo.findOne({ where: { id: round.competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    await this.ensureModeratorControl(adminId, competition);
    const competitorAId = competition.competitorAUserId;
    const competitorBId = competition.competitorBUserId;
    if (!competitorAId || !competitorBId) {
      throw new BadRequestException('Slots compétiteurs non initialisés pour ce match.');
    }

    const normalizedVerdict = dto.verdict?.trim().toLowerCase();
    const legacyResult = dto.result?.trim().toUpperCase() as 'A' | 'B' | 'BOTH' | 'NONE' | undefined;
    if (!normalizedVerdict && !legacyResult) {
      throw new BadRequestException('Précisez une décision de modération pour cette question.');
    }

    const directed = this.getDirectedParticipant(competition, round);
    const opposingParticipantId = directed.slot === 'A' ? competitorBId : competitorAId;

    const existing = await this.answerRepo.find({
      where: { roundId: round.id, participantUserId: In([competitorAId, competitorBId]) },
    });
    const byParticipant = new Map(existing.map((ans) => [ans.participantUserId, ans]));

    const now = new Date();
    const buildAnswerRecord = (
      participantUserId: string,
      selectedOption: string | null,
      pointsAwarded: number,
    ) => {
      const existingAnswer = byParticipant.get(participantUserId);
      const payload = {
        ...(existingAnswer ?? {}),
        roundId: round.id,
        participantUserId,
        submittedByUserId: adminId,
        selectedOption,
        isCorrect: pointsAwarded > 0,
        pointsAwarded,
        submittedAt: now,
      };
      return existingAnswer ? payload : this.answerRepo.create(payload);
    };

    const answersToSave: Array<ReturnType<typeof buildAnswerRecord>> = [];
    if (normalizedVerdict) {
      switch (normalizedVerdict) {
        case 'correct':
          answersToSave.push(buildAnswerRecord(directed.participantUserId, `CORRECT_${directed.slot}`, 1));
          break;
        case 'incorrect':
          answersToSave.push(buildAnswerRecord(directed.participantUserId, `INCORRECT_${directed.slot}`, 0));
          break;
        case 'cancelled':
          answersToSave.push(buildAnswerRecord(directed.participantUserId, 'CANCELLED', 0));
          break;
        default:
          throw new BadRequestException('Décision de modération invalide.');
      }

      const opposingAnswer = byParticipant.get(opposingParticipantId);
      if (opposingAnswer) {
        answersToSave.push(buildAnswerRecord(opposingParticipantId, 'OVERRIDDEN', 0));
      }
    } else {
      const pointsA = legacyResult === 'A' || legacyResult === 'BOTH' ? 1 : 0;
      const pointsB = legacyResult === 'B' || legacyResult === 'BOTH' ? 1 : 0;
      answersToSave.push(buildAnswerRecord(competitorAId, legacyResult ?? null, pointsA));
      answersToSave.push(buildAnswerRecord(competitorBId, legacyResult ?? null, pointsB));
    }

    await this.answerRepo.save(answersToSave);

    const leaderboard = await this.getLiveLeaderboard(round.competitionId);
    return {
      competitionId: round.competitionId,
      roundId: round.id,
      result: legacyResult ?? normalizedVerdict ?? null,
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

  async signalOralAnswer(userId: string, roundId: string, participantId: string) {
    if (participantId !== userId) {
      throw new ForbiddenException('Chaque compétiteur ne peut signaler sa prise de parole que pour lui-même.');
    }

    const round = await this.roundRepo.findOne({ where: { id: roundId } });
    if (!round) throw new NotFoundException('Question introuvable.');
    if (round.endedAt) throw new BadRequestException('Cette question est déjà clôturée.');

    const competition = await this.competitionRepo.findOne({ where: { id: round.competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    if (competition.status !== ArenaCompetitionStatus.LIVE) {
      throw new BadRequestException('Le direct n\'est pas actif pour cette question.');
    }

    const isActiveCompetitor =
      participantId === competition.competitorAUserId || participantId === competition.competitorBUserId;

    if (!isActiveCompetitor) {
      throw new BadRequestException('Seuls les deux compétiteurs du match peuvent signaler une réponse.');
    }

    const directed = this.getDirectedParticipant(competition, round);
    if (participantId !== directed.participantUserId) {
      throw new BadRequestException('Cette question est actuellement adressée à l’autre compétiteur.');
    }

    return {
      competitionId: round.competitionId,
      roundId: round.id,
    };
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
    const currentQuestionTarget = currentRound
      ? this.buildQuestionTargetSnapshot(competition, currentRound, userMap)
      : null;

    return {
      competitionId,
      competitionName: competition.name,
      status: competition.status,
      secondsPerQuestion: competition.secondsPerQuestion,
      currentRoundNumber: competition.currentRound,
      currentQuestionNumber: competition.currentRound,
      totalRounds: competition.questionCount,
      totalQuestions: competition.questionCount,
      currentRound,
      currentQuestion: currentRound,
      leaderboard,
      participants,
      matchParticipants,
      currentQuestionTarget,
      publicStream: this.buildPublicStreamSnapshot(competition),
    };
  }

  async configurePublicStream(
    callerId: string,
    competitionId: string,
    dto: UpdateArenaPublicStreamDto,
  ) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    await this.ensurePublicStreamControl(callerId, competition);

    if (dto.provider === ArenaPublicStreamProvider.NONE) {
      competition.publicStreamProvider = ArenaPublicStreamProvider.NONE;
      competition.publicStreamUrl = null;
      competition.publicStreamChatUrl = null;
      competition.publicStreamStatus = 'idle';
      competition.publicStreamStartedAt = null;
      await this.competitionRepo.save(competition);
      return this.decorateCompetition(competition);
    }

    const videoId = this.extractYouTubeVideoId(dto.streamUrl ?? '');
    if (!videoId) {
      throw new BadRequestException('Entrez un lien YouTube valide pour le live public.');
    }

    competition.publicStreamProvider = ArenaPublicStreamProvider.YOUTUBE;
    competition.publicStreamUrl = this.buildYouTubeWatchUrl(videoId);
    competition.publicStreamChatUrl = dto.chatUrl?.trim() || this.buildYouTubeChatUrl(videoId);
    if (competition.publicStreamStatus === 'stopped') {
      competition.publicStreamStatus = 'idle';
    }

    await this.competitionRepo.save(competition);
    return this.decorateCompetition(competition);
  }

  async setPublicStreamStatus(
    callerId: string,
    competitionId: string,
    dto: SetArenaPublicStreamStatusDto,
  ) {
    if (!['idle', 'live', 'stopped'].includes(dto.status)) {
      throw new BadRequestException('Statut de diffusion publique invalide.');
    }

    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    await this.ensurePublicStreamControl(callerId, competition);

    if (competition.publicStreamProvider !== ArenaPublicStreamProvider.YOUTUBE || !competition.publicStreamUrl) {
      throw new BadRequestException('Configurez d\'abord un lien YouTube pour la diffusion publique.');
    }

    competition.publicStreamStatus = dto.status;
    if (dto.status === 'live') {
      competition.publicStreamStartedAt = new Date();
    }
    if (dto.status === 'idle') {
      competition.publicStreamStartedAt = null;
    }

    await this.competitionRepo.save(competition);
    return this.decorateCompetition(competition);
  }

  async getPublicStream(competitionId: string) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException('Compétition introuvable.');
    return this.buildPublicStreamSnapshot(competition);
  }

  async syncPublicStreamStatus(
    competitionId: string,
    status: 'idle' | 'live' | 'stopped',
  ) {
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!competition) return null;

    competition.publicStreamStatus = status;
    if (status === 'live') {
      competition.publicStreamStartedAt = new Date();
    }
    if (status === 'idle') {
      competition.publicStreamStartedAt = null;
    }

    await this.competitionRepo.save(competition);
    return this.decorateCompetition(competition);
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
    const relatedUserIds = [
      competition.winnerParticipantUserId,
      competition.competitorAUserId,
      competition.competitorBUserId,
      competition.moderatorUserId,
    ].filter((userId): userId is string => !!userId);

    const users = relatedUserIds.length > 0
      ? await this.userRepo.find({ where: { id: In(relatedUserIds) } })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));
    const winnerParticipant = competition.winnerParticipantUserId
      ? userMap.get(competition.winnerParticipantUserId) ?? null
      : null;
    const competitorA = competition.competitorAUserId
      ? userMap.get(competition.competitorAUserId) ?? null
      : null;
    const competitorB = competition.competitorBUserId
      ? userMap.get(competition.competitorBUserId) ?? null
      : null;
    const moderator = competition.moderatorUserId
      ? userMap.get(competition.moderatorUserId) ?? null
      : null;

    return {
      ...competition,
      publicStream: this.buildPublicStreamSnapshot(competition),
      competitorAUserId: competition.competitorAUserId,
      competitorAName: competitorA ? `${competitorA.firstName} ${competitorA.lastName}`.trim() : null,
      competitorBUserId: competition.competitorBUserId,
      competitorBName: competitorB ? `${competitorB.firstName} ${competitorB.lastName}`.trim() : null,
      moderatorUserId: competition.moderatorUserId,
      moderatorName: moderator ? `${moderator.firstName} ${moderator.lastName}`.trim() : null,
      moderatorEmail: moderator?.email ?? null,
      winnerParticipantUserId: competition.winnerParticipantUserId,
      winnerParticipantName: winnerParticipant
        ? `${winnerParticipant.firstName} ${winnerParticipant.lastName}`.trim()
        : null,
    };
  }

  private async decorateCompetitions(competitions: ArenaCompetition[]) {
    const relatedUserIds = Array.from(
      new Set(
        competitions
          .flatMap((competition) => [
            competition.winnerParticipantUserId,
            competition.competitorAUserId,
            competition.competitorBUserId,
            competition.moderatorUserId,
          ])
          .filter((userId): userId is string => !!userId),
      ),
    );

    const users = relatedUserIds.length > 0
      ? await this.userRepo.find({ where: { id: In(relatedUserIds) } })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    return competitions.map((competition) => ({
      ...competition,
      publicStream: this.buildPublicStreamSnapshot(competition),
      competitorAUserId: competition.competitorAUserId,
      competitorAName: competition.competitorAUserId
        ? `${userMap.get(competition.competitorAUserId)?.firstName ?? ''} ${userMap.get(competition.competitorAUserId)?.lastName ?? ''}`.trim() || null
        : null,
      competitorBUserId: competition.competitorBUserId,
      competitorBName: competition.competitorBUserId
        ? `${userMap.get(competition.competitorBUserId)?.firstName ?? ''} ${userMap.get(competition.competitorBUserId)?.lastName ?? ''}`.trim() || null
        : null,
      moderatorUserId: competition.moderatorUserId,
      moderatorName: competition.moderatorUserId
        ? `${userMap.get(competition.moderatorUserId)?.firstName ?? ''} ${userMap.get(competition.moderatorUserId)?.lastName ?? ''}`.trim() || null
        : null,
      moderatorEmail: competition.moderatorUserId
        ? userMap.get(competition.moderatorUserId)?.email ?? null
        : null,
      winnerParticipantUserId: competition.winnerParticipantUserId,
      winnerParticipantName: competition.winnerParticipantUserId
        ? (`${userMap.get(competition.winnerParticipantUserId)?.firstName ?? ''} ${userMap.get(competition.winnerParticipantUserId)?.lastName ?? ''}`.trim() || null)
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
      where: [{ role: UserRole.MODERATOR }, { role: UserRole.ADMIN }],
      select: ['id', 'firstName', 'lastName', 'email', 'role'],
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

  private buildPublicStreamSnapshot(competition: ArenaCompetition) {
    const videoId = competition.publicStreamProvider === ArenaPublicStreamProvider.YOUTUBE
      ? this.extractYouTubeVideoId(competition.publicStreamUrl ?? '')
      : null;

    return {
      provider: competition.publicStreamProvider ?? ArenaPublicStreamProvider.NONE,
      status: competition.publicStreamStatus ?? 'idle',
      streamUrl: competition.publicStreamUrl ?? null,
      playbackUrl: competition.publicStreamUrl ?? null,
      chatUrl: competition.publicStreamChatUrl ?? (videoId ? this.buildYouTubeChatUrl(videoId) : null),
      embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0` : null,
      videoId,
      startedAt: competition.publicStreamStartedAt ?? null,
    };
  }

  private extractYouTubeVideoId(rawUrl: string) {
    const input = rawUrl.trim();
    if (!input) return null;

    const directMatch = input.match(/^[A-Za-z0-9_-]{11}$/);
    if (directMatch) return directMatch[0];

    try {
      const url = new URL(input);
      const host = url.hostname.toLowerCase();

      if (host === 'youtu.be') {
        const candidate = url.pathname.replace(/^\//, '').split('/')[0];
        return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
      }

      if (host.endsWith('youtube.com')) {
        const watchId = url.searchParams.get('v');
        if (watchId && /^[A-Za-z0-9_-]{11}$/.test(watchId)) {
          return watchId;
        }

        const pathParts = url.pathname.split('/').filter(Boolean);
        const candidate = pathParts[pathParts.length - 1] ?? '';
        return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
      }
    } catch {
      return null;
    }

    return null;
  }

  private buildYouTubeWatchUrl(videoId: string) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  private buildYouTubeChatUrl(videoId: string) {
    return `https://www.youtube.com/live_chat?v=${videoId}`;
  }

  private getDirectedParticipant(competition: ArenaCompetition, round: ArenaRound) {
    const slot = round.position % 2 === 1 ? 'A' as const : 'B' as const;
    const participantUserId = slot === 'A' ? competition.competitorAUserId : competition.competitorBUserId;

    if (!participantUserId) {
      throw new BadRequestException('Impossible de déterminer le compétiteur attendu pour cette question.');
    }

    return {
      slot,
      participantUserId,
    };
  }

  private buildQuestionTargetSnapshot(
    competition: ArenaCompetition,
    round: ArenaRound,
    userMap: Map<string, User>,
  ) {
    const slot = round.position % 2 === 1 ? 'A' as const : 'B' as const;
    const participantUserId = slot === 'A' ? competition.competitorAUserId : competition.competitorBUserId;
    if (!participantUserId) {
      return null;
    }

    const participant = userMap.get(participantUserId);
    return {
      slot,
      participantUserId,
      displayName: participant ? `${participant.firstName} ${participant.lastName}`.trim() : null,
    };
  }

  private async ensurePublicStreamControl(callerId: string, competition: ArenaCompetition) {
    const caller = await this.userRepo.findOne({ where: { id: callerId } });

    if (caller?.role === UserRole.ADMIN) {
      return;
    }

    if (caller?.role === UserRole.MODERATOR && competition.moderatorUserId === callerId) {
      return;
    }

    throw new ForbiddenException('Action réservée à l\'administrateur ou au modérateur assigné.');
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

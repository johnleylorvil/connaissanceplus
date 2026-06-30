import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ArenaCompetition,
  ArenaCompetitionStatus,
  ArenaParticipantAnswer,
  ArenaParticipantRegistration,
  ArenaParticipantRegistrationStatus,
  ArenaParticipantScoreAdjustment,
} from '../arena/arena.entities';
import {
  Assignment,
  ContestSessionStatus,
  CorrespondenceMessage,
  CorrespondenceThread,
  Letter,
  LetterStatus,
} from '../correspondence/correspondence.entities';
import {
  DuelAnswer,
  DuelProgress,
  DuelStatus,
  QuizSession,
  QuizStatus,
  Subject,
  User,
} from '../mvp/entities';
import {
  StudentDailyRecommendation,
  StudentInsightAction,
} from './student-daily-recommendation.entity';

const INSIGHT_DAYS = 30;
const TIME_ZONE = 'America/Port-au-Prince';

type SubjectInsight = {
  subjectId: string;
  subjectName: string;
  answered: number;
  correct: number;
  accuracy: number | null;
  level: 'strong' | 'needs_work' | 'insufficient_data';
};

type RecommendationCandidate = {
  key: string;
  category: 'learning' | 'competition' | 'participation';
  title: string;
  reason: string;
  action: StudentInsightAction;
  priority: number;
};

@Injectable()
export class StudentInsightsService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(QuizSession)
    private readonly quizRepo: Repository<QuizSession>,
    @InjectRepository(DuelProgress)
    private readonly duelProgressRepo: Repository<DuelProgress>,
    @InjectRepository(DuelAnswer)
    private readonly duelAnswerRepo: Repository<DuelAnswer>,
    @InjectRepository(ArenaCompetition)
    private readonly competitionRepo: Repository<ArenaCompetition>,
    @InjectRepository(ArenaParticipantRegistration)
    private readonly registrationRepo: Repository<ArenaParticipantRegistration>,
    @InjectRepository(ArenaParticipantAnswer)
    private readonly arenaAnswerRepo: Repository<ArenaParticipantAnswer>,
    @InjectRepository(ArenaParticipantScoreAdjustment)
    private readonly arenaAdjustmentRepo: Repository<ArenaParticipantScoreAdjustment>,
    @InjectRepository(Letter) private readonly letterRepo: Repository<Letter>,
    @InjectRepository(Assignment)
    private readonly assignmentRepo: Repository<Assignment>,
    @InjectRepository(CorrespondenceThread)
    private readonly threadRepo: Repository<CorrespondenceThread>,
    @InjectRepository(CorrespondenceMessage)
    private readonly messageRepo: Repository<CorrespondenceMessage>,
    @InjectRepository(StudentDailyRecommendation)
    private readonly recommendationRepo: Repository<StudentDailyRecommendation>,
  ) {}

  async getInsights(userId: string, now = new Date()) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Student not found');

    const today = this.localDateKey(now);
    const periodStart = this.shiftDateKey(today, -(INSIGHT_DAYS - 1));
    const previousStart = this.shiftDateKey(today, -(INSIGHT_DAYS * 2 - 1));
    const previousEnd = this.shiftDateKey(today, -INSIGHT_DAYS);

    const [
      subjects,
      quizzes,
      duelProgresses,
      duelAnswers,
      registrations,
      arenaAnswers,
      arenaAdjustments,
      competitions,
      letters,
      assignments,
      threads,
      messages,
    ] = await Promise.all([
      user.classId
        ? this.subjectRepo.find({
            where: { classId: user.classId },
            order: { name: 'ASC' },
          })
        : Promise.resolve([]),
      this.quizRepo.find({
        where: { userId, status: QuizStatus.COMPLETED },
        relations: ['subject', 'questions'],
        order: { startedAt: 'DESC' },
      }),
      this.duelProgressRepo.find({
        where: { userId },
        relations: ['duelMatch'],
        order: { startedAt: 'DESC' },
      }),
      this.duelAnswerRepo.find({
        where: { userId },
        relations: [
          'duelMatchQuestion',
          'duelMatchQuestion.question',
          'duelMatchQuestion.duelMatch',
        ],
        order: { answeredAt: 'DESC' },
      }),
      this.registrationRepo.find({
        where: { participantUserId: userId },
        relations: ['competition'],
        order: { registeredAt: 'DESC' },
      }),
      this.arenaAnswerRepo.find({
        where: { participantUserId: userId },
        relations: ['round', 'round.competition'],
        order: { submittedAt: 'DESC' },
      }),
      this.arenaAdjustmentRepo.find({
        where: { participantUserId: userId },
        order: { createdAt: 'DESC' },
      }),
      this.competitionRepo.find({
        order: { scheduledAt: 'ASC' },
      }),
      this.letterRepo.find({
        where: { authorUserId: userId },
        relations: ['session'],
        order: { createdAt: 'DESC' },
      }),
      this.assignmentRepo.find({
        where: { recipientUserId: userId },
        relations: ['letter', 'letter.session', 'thread'],
        order: { assignedAt: 'DESC' },
      }),
      this.threadRepo.find({
        relations: ['assignment', 'assignment.letter', 'messages'],
      }),
      this.messageRepo.find({
        where: { senderUserId: userId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const completedDuels = duelProgresses.filter(
      (progress) => progress.duelMatch?.status === DuelStatus.COMPLETED,
    );
    const recentQuizzes = quizzes.filter((quiz) =>
      this.inRange(quiz.startedAt, periodStart, today),
    );
    const previousQuizzes = quizzes.filter((quiz) =>
      this.inRange(quiz.startedAt, previousStart, previousEnd),
    );
    const recentDuels = completedDuels.filter((progress) =>
      this.inRange(progress.duelMatch.completedAt, periodStart, today),
    );
    const previousDuels = completedDuels.filter((progress) =>
      this.inRange(progress.duelMatch.completedAt, previousStart, previousEnd),
    );
    const recentDuelAnswers = duelAnswers.filter(
      (answer) =>
        answer.duelMatchQuestion?.duelMatch?.status === DuelStatus.COMPLETED &&
        this.inRange(answer.answeredAt, periodStart, today),
    );
    const previousDuelAnswers = duelAnswers.filter((answer) =>
      this.inRange(answer.answeredAt, previousStart, previousEnd),
    );
    const recentArenaAnswers = arenaAnswers.filter((answer) =>
      this.inRange(answer.submittedAt, periodStart, today),
    );
    const completedRegistrations = registrations.filter(
      (registration) =>
        registration.competition?.status === ArenaCompetitionStatus.COMPLETED,
    );
    const recentCompletedRegistrations = completedRegistrations.filter(
      (registration) =>
        this.inRange(registration.competition.completedAt, periodStart, today),
    );
    const previousCompletedRegistrations = completedRegistrations.filter(
      (registration) =>
        this.inRange(
          registration.competition.completedAt,
          previousStart,
          previousEnd,
        ),
    );
    const previousArenaAnswers = arenaAnswers.filter((answer) =>
      this.inRange(answer.submittedAt, previousStart, previousEnd),
    );
    const recentLetters = letters.filter(
      (letter) =>
        letter.status !== LetterStatus.DRAFT &&
        this.inRange(letter.submittedAt, periodStart, today),
    );
    const previousLetters = letters.filter(
      (letter) =>
        letter.status !== LetterStatus.DRAFT &&
        this.inRange(letter.submittedAt, previousStart, previousEnd),
    );
    const recentMessages = messages.filter((message) =>
      this.inRange(message.createdAt, periodStart, today),
    );
    const previousMessages = messages.filter((message) =>
      this.inRange(message.createdAt, previousStart, previousEnd),
    );
    const recentAdjustments = arenaAdjustments.filter((adjustment) =>
      this.inRange(adjustment.createdAt, periodStart, today),
    );

    const previousAdjustments = arenaAdjustments.filter((adjustment) =>
      this.inRange(adjustment.createdAt, previousStart, previousEnd),
    );

    const subjectStats = this.buildSubjectStats(subjects, quizzes, duelAnswers);
    const recentQuizAccuracy = this.quizAccuracy(recentQuizzes);
    const previousQuizAccuracy = this.quizAccuracy(previousQuizzes);
    const recentDuelAccuracy = this.answerAccuracy(recentDuelAnswers);
    const previousDuelAccuracy = this.answerAccuracy(previousDuelAnswers);
    const activeDays = new Set<string>();
    const markActive = (date: Date | null | undefined) => {
      if (date && this.inRange(date, periodStart, today))
        activeDays.add(this.localDateKey(date));
    };
    recentQuizzes.forEach((item) => markActive(item.startedAt));
    recentDuels.forEach((item) =>
      markActive(item.duelMatch.completedAt ?? item.lastActivityAt),
    );
    recentArenaAnswers.forEach((item) => markActive(item.submittedAt));
    recentLetters.forEach((item) => markActive(item.submittedAt));
    recentMessages.forEach((item) => markActive(item.createdAt));

    const wins = completedDuels.filter(
      (progress) => progress.duelMatch.winnerUserId === userId,
    ).length;
    const losses = completedDuels.filter(
      (progress) =>
        progress.duelMatch.winnerUserId !== null &&
        progress.duelMatch.winnerUserId !== userId,
    ).length;
    const draws = completedDuels.length - wins - losses;
    const arenaWins = completedRegistrations.filter(
      (registration) =>
        registration.competition.winnerParticipantUserId === userId,
    ).length;
    const recentArenaWins = recentCompletedRegistrations.filter(
      (registration) =>
        registration.competition.winnerParticipantUserId === userId,
    ).length;
    const unopenedAssignments = assignments.filter(
      (assignment) => !assignment.openedAt,
    );
    const drafts = letters.filter(
      (letter) =>
        letter.status === LetterStatus.DRAFT &&
        (!letter.session ||
          [ContestSessionStatus.OPEN, ContestSessionStatus.DRAFT].includes(
            letter.session.status,
          )),
    );
    const relevantThreads = threads.filter(
      (thread) =>
        thread.assignment?.recipientUserId === userId ||
        thread.assignment?.letter?.authorUserId === userId,
    );
    const awaitingReplies = relevantThreads.filter((thread) => {
      const latest = [...(thread.messages ?? [])].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )[0];
      return latest && latest.senderUserId !== userId;
    });

    const activityByDate = new Map(
      Array.from({ length: INSIGHT_DAYS }, (_, index) => {
        const date = this.shiftDateKey(periodStart, index);
        return [
          date,
          {
            date,
            quizzes: 0,
            duels: 0,
            arena: 0,
            correspondence: 0,
            total: 0,
          },
        ];
      }),
    );
    const addActivity = (
      date: Date | null | undefined,
      type: 'quizzes' | 'duels' | 'arena' | 'correspondence',
    ) => {
      if (!date) return;
      const day = activityByDate.get(this.localDateKey(date));
      if (!day) return;
      day[type] += 1;
      day.total += 1;
    };
    recentQuizzes.forEach((item) => addActivity(item.startedAt, 'quizzes'));
    recentDuels.forEach((item) =>
      addActivity(item.duelMatch.completedAt ?? item.lastActivityAt, 'duels'),
    );
    recentCompletedRegistrations.forEach((item) =>
      addActivity(item.competition.completedAt, 'arena'),
    );
    recentLetters.forEach((item) =>
      addActivity(item.submittedAt, 'correspondence'),
    );
    recentMessages.forEach((item) =>
      addActivity(item.createdAt, 'correspondence'),
    );

    const summary = {
      activeDays: activeDays.size,
      quizzes: {
        periodSessions: recentQuizzes.length,
        previousSessions: previousQuizzes.length,
        totalSessions: quizzes.length,
        accuracy: recentQuizAccuracy,
        previousAccuracy: previousQuizAccuracy,
        trend: this.trend(recentQuizAccuracy, previousQuizAccuracy),
      },
      duels: {
        periodParticipations: recentDuels.length,
        previousParticipations: previousDuels.length,
        totalParticipations: completedDuels.length,
        wins,
        losses,
        draws,
        accuracy: recentDuelAccuracy,
        previousAccuracy: previousDuelAccuracy,
        trend: this.trend(recentDuelAccuracy, previousDuelAccuracy),
      },
      arena: {
        periodCompetitions: recentCompletedRegistrations.length,
        previousCompetitions: previousCompletedRegistrations.length,
        totalCompetitions: completedRegistrations.length,
        periodWins: recentArenaWins,
        totalWins: arenaWins,
        periodCorrectAnswers: recentArenaAnswers.filter(
          (answer) => answer.isCorrect,
        ).length,
        periodPoints:
          recentArenaAnswers.reduce(
            (sum, answer) => sum + answer.pointsAwarded,
            0,
          ) +
          recentAdjustments.reduce(
            (sum, adjustment) => sum + adjustment.pointsDelta,
            0,
          ),
        previousPoints:
          previousArenaAnswers.reduce(
            (sum, answer) => sum + answer.pointsAwarded,
            0,
          ) +
          previousAdjustments.reduce(
            (sum, adjustment) => sum + adjustment.pointsDelta,
            0,
          ),
        upcomingRegistrations: registrations.filter(
          (registration) =>
            registration.status ===
              ArenaParticipantRegistrationStatus.APPROVED &&
            [
              ArenaCompetitionStatus.APPROVED,
              ArenaCompetitionStatus.LIVE,
            ].includes(registration.competition?.status),
        ).length,
      },
      correspondence: {
        periodLettersSubmitted: recentLetters.length,
        previousLettersSubmitted: previousLetters.length,
        totalLettersSubmitted: letters.filter(
          (letter) => letter.status !== LetterStatus.DRAFT,
        ).length,
        periodMessagesSent: recentMessages.length,
        previousMessagesSent: previousMessages.length,
        totalMessagesSent: messages.length,
        drafts: drafts.length,
        unopenedAssignments: unopenedAssignments.length,
        awaitingReplies: awaitingReplies.length,
      },
      subjects: subjectStats,
      activityTimeline: [...activityByDate.values()],
    };

    const candidates = this.buildCandidates({
      subjects,
      subjectStats,
      registrations,
      competitions,
      unopenedAssignments,
      drafts,
      awaitingReplies,
    });
    const recommendations = await this.syncDailyRecommendations(
      userId,
      today,
      candidates,
    );

    return {
      generatedFor: today,
      period: {
        from: periodStart,
        to: today,
        days: INSIGHT_DAYS,
        previousFrom: previousStart,
        previousTo: previousEnd,
        activeDays: activeDays.size,
      },
      summary,
      recommendations: recommendations.map((recommendation) => ({
        id: recommendation.id,
        category: recommendation.category,
        title: recommendation.title,
        reason: recommendation.reason,
        action: recommendation.action,
      })),
    };
  }

  private buildSubjectStats(
    subjects: Subject[],
    quizzes: QuizSession[],
    duelAnswers: DuelAnswer[],
  ): SubjectInsight[] {
    const values = new Map(
      subjects.map((subject) => [
        subject.id,
        {
          subjectId: subject.id,
          subjectName: subject.name,
          answered: 0,
          correct: 0,
        },
      ]),
    );

    for (const quiz of quizzes) {
      const current = values.get(quiz.subjectId) ?? {
        subjectId: quiz.subjectId,
        subjectName: quiz.subject?.name ?? 'Matière',
        answered: 0,
        correct: 0,
      };
      current.answered += quiz.questions?.length ?? 0;
      current.correct += quiz.score;
      values.set(quiz.subjectId, current);
    }
    for (const answer of duelAnswers) {
      const question = answer.duelMatchQuestion?.question;
      if (!question) continue;
      const current = values.get(question.subjectId) ?? {
        subjectId: question.subjectId,
        subjectName: 'Matière',
        answered: 0,
        correct: 0,
      };
      current.answered += 1;
      if (answer.isCorrect) current.correct += 1;
      values.set(question.subjectId, current);
    }

    const measured = [...values.values()].filter(
      (value) => value.answered >= 3,
    );
    const bestAccuracy = measured.length
      ? Math.max(...measured.map((value) => value.correct / value.answered))
      : null;
    const worstAccuracy = measured.length
      ? Math.min(...measured.map((value) => value.correct / value.answered))
      : null;

    return [...values.values()]
      .map((value) => {
        const accuracy =
          value.answered > 0
            ? Math.round((value.correct / value.answered) * 100)
            : null;
        const ratio =
          value.answered > 0 ? value.correct / value.answered : null;
        let level: SubjectInsight['level'] = 'insufficient_data';
        if (value.answered >= 3 && ratio !== null) {
          if (bestAccuracy === worstAccuracy) {
            if (ratio >= 0.8) level = 'strong';
            if (ratio < 0.6) level = 'needs_work';
          } else {
            if (ratio === bestAccuracy) level = 'strong';
            if (ratio === worstAccuracy) level = 'needs_work';
          }
        }
        return { ...value, accuracy, level };
      })
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'fr'));
  }

  private buildCandidates(context: {
    subjects: Subject[];
    subjectStats: SubjectInsight[];
    registrations: ArenaParticipantRegistration[];
    competitions: ArenaCompetition[];
    unopenedAssignments: Assignment[];
    drafts: Letter[];
    awaitingReplies: CorrespondenceThread[];
  }): RecommendationCandidate[] {
    const candidates: RecommendationCandidate[] = [];
    const weakest =
      [...context.subjectStats]
        .filter((subject) => subject.answered >= 3)
        .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101))[0] ??
      [...context.subjectStats].sort(
        (a, b) =>
          a.answered - b.answered || a.subjectName.localeCompare(b.subjectName),
      )[0];

    if (weakest) {
      candidates.push({
        key: `learning:${weakest.subjectId}`,
        category: 'learning',
        title:
          weakest.answered >= 3
            ? `Renforcer ${weakest.subjectName}`
            : `Découvrir ${weakest.subjectName}`,
        reason:
          weakest.answered >= 3
            ? `Votre précision est de ${weakest.accuracy}% dans cette matière. Une manche ciblée aidera à progresser.`
            : 'Cette matière est encore peu pratiquée dans votre parcours.',
        action: { type: 'start_quiz', subjectId: weakest.subjectId },
        priority: weakest.answered >= 3 ? 70 : 45,
      });
    } else if (context.subjects.length === 0) {
      candidates.push({
        key: 'learning:profile',
        category: 'learning',
        title: 'Compléter le profil scolaire',
        reason: 'Ajoutez votre classe pour recevoir des entraînements adaptés.',
        action: { type: 'view_history' },
        priority: 40,
      });
    }

    const registeredCompetition = context.registrations
      .filter(
        (registration) =>
          registration.status === ArenaParticipantRegistrationStatus.APPROVED &&
          [
            ArenaCompetitionStatus.APPROVED,
            ArenaCompetitionStatus.LIVE,
          ].includes(registration.competition?.status),
      )
      .sort(
        (a, b) =>
          a.competition.scheduledAt.getTime() -
          b.competition.scheduledAt.getTime(),
      )[0];
    const openCompetition = context.competitions.find((competition) =>
      [ArenaCompetitionStatus.APPROVED, ArenaCompetitionStatus.LIVE].includes(
        competition.status,
      ),
    );

    if (registeredCompetition) {
      candidates.push({
        key: `competition:arena:${registeredCompetition.competitionId}`,
        category: 'competition',
        title: `Préparer ${registeredCompetition.competition.name}`,
        reason:
          'Votre inscription est approuvée. Consultez Arena avant le début de la compétition.',
        action: {
          type: 'open_arena',
          competitionId: registeredCompetition.competitionId,
        },
        priority: 85,
      });
    } else if (openCompetition) {
      candidates.push({
        key: `competition:arena:${openCompetition.id}`,
        category: 'competition',
        title: 'Une Arena est disponible',
        reason: `${openCompetition.name} accepte actuellement les participants.`,
        action: { type: 'open_arena', competitionId: openCompetition.id },
        priority: 60,
      });
    } else {
      candidates.push({
        key: `competition:duel:${weakest?.subjectId ?? 'any'}`,
        category: 'competition',
        title: 'Relever un défi en duel',
        reason:
          'Mettez votre entraînement en pratique face à un étudiant de votre niveau.',
        action: {
          type: 'open_duels',
          ...(weakest ? { subjectId: weakest.subjectId } : {}),
        },
        priority: 35,
      });
    }

    const unopened = context.unopenedAssignments[0];
    const draft = context.drafts.sort(
      (a, b) =>
        (a.session?.endAt?.getTime() ?? Infinity) -
        (b.session?.endAt?.getTime() ?? Infinity),
    )[0];
    const awaiting = context.awaitingReplies[0];
    if (unopened) {
      candidates.push({
        key: `participation:inbox:${unopened.id}`,
        category: 'participation',
        title: 'Découvrir une lettre reçue',
        reason: `Une correspondance de ${unopened.letter?.session?.title ?? 'votre concours'} attend votre lecture.`,
        action: {
          type: 'open_correspondence',
          view: 'inbox',
          targetId: unopened.id,
        },
        priority: 100,
      });
    } else if (draft) {
      candidates.push({
        key: `participation:draft:${draft.id}`,
        category: 'participation',
        title: 'Terminer votre lettre',
        reason: `Votre brouillon pour ${draft.session?.title ?? 'le concours'} peut encore être complété.`,
        action: {
          type: 'open_correspondence',
          view: 'myletters',
          targetId: draft.id,
        },
        priority: 90,
      });
    } else if (awaiting) {
      candidates.push({
        key: `participation:reply:${awaiting.id}`,
        category: 'participation',
        title: 'Répondre à votre correspondant',
        reason: 'Un nouveau message attend votre réponse.',
        action: {
          type: 'open_correspondence',
          view: 'inbox',
          targetId: awaiting.id,
        },
        priority: 80,
      });
    } else {
      candidates.push({
        key: 'participation:sessions',
        category: 'participation',
        title: 'Explorer les concours de lettres',
        reason:
          'Découvrez les thèmes ouverts et partagez vos idées avec un autre étudiant.',
        action: { type: 'open_correspondence', view: 'sessions' },
        priority: 25,
      });
    }

    return candidates.sort((a, b) => b.priority - a.priority).slice(0, 3);
  }

  private async syncDailyRecommendations(
    userId: string,
    recommendationDate: string,
    candidates: RecommendationCandidate[],
  ): Promise<StudentDailyRecommendation[]> {
    const existing = await this.recommendationRepo.find({
      where: { userId, recommendationDate },
      order: { slot: 'ASC' },
    });
    const existingByKey = new Map(
      existing.map((recommendation) => [
        recommendation.candidateKey,
        recommendation,
      ]),
    );
    const selected = candidates.slice(0, 3).map((candidate, slot) => {
      const retained = existingByKey.get(candidate.key);
      return this.recommendationRepo.create({
        userId,
        recommendationDate,
        candidateKey: candidate.key,
        category: retained?.category ?? candidate.category,
        title: retained?.title ?? candidate.title,
        reason: retained?.reason ?? candidate.reason,
        action: retained?.action ?? candidate.action,
        slot,
      });
    });

    if (existing.length) {
      await this.recommendationRepo.delete({ userId, recommendationDate });
    }
    return this.recommendationRepo.save(selected);
  }

  private quizAccuracy(quizzes: QuizSession[]): number | null {
    const total = quizzes.reduce(
      (sum, quiz) => sum + (quiz.questions?.length ?? 0),
      0,
    );
    return total
      ? Math.round(
          (quizzes.reduce((sum, quiz) => sum + quiz.score, 0) / total) * 100,
        )
      : null;
  }

  private answerAccuracy(
    answers: Array<{ isCorrect: boolean }>,
  ): number | null {
    return answers.length
      ? Math.round(
          (answers.filter((answer) => answer.isCorrect).length /
            answers.length) *
            100,
        )
      : null;
  }

  private trend(
    current: number | null,
    previous: number | null,
  ): number | null {
    return current === null || previous === null ? null : current - previous;
  }

  private inRange(
    date: Date | null | undefined,
    from: string,
    to: string,
  ): boolean {
    if (!date) return false;
    const key = this.localDateKey(date);
    return key >= from && key <= to;
  }

  private localDateKey(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  private shiftDateKey(dateKey: string, days: number): string {
    const date = new Date(`${dateKey}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
}

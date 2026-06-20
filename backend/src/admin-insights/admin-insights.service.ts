import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import {
  AcademicClass,
  DuelAnswer,
  Question,
  QuizSession,
  QuizStatus,
  Subject,
  User,
  UserRole,
} from '../mvp/entities';
import {
  ArenaCompetition,
  ArenaParticipantAnswer,
  ArenaParticipantRegistration,
} from '../arena/arena.entities';
import {
  CorrespondenceMessage,
  ModerationCase,
} from '../correspondence/correspondence.entities';
import { Chapter, TutorConversation } from '../learning/learning.entities';
import { buildAdminInsights } from './admin-insights.calculator';

@Injectable()
export class AdminInsightsService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(AcademicClass)
    private readonly classRepo: Repository<AcademicClass>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(QuizSession)
    private readonly quizRepo: Repository<QuizSession>,
    @InjectRepository(DuelAnswer)
    private readonly duelAnswerRepo: Repository<DuelAnswer>,
    @InjectRepository(ArenaCompetition)
    private readonly competitionRepo: Repository<ArenaCompetition>,
    @InjectRepository(ArenaParticipantRegistration)
    private readonly arenaRegistrationRepo: Repository<ArenaParticipantRegistration>,
    @InjectRepository(ArenaParticipantAnswer)
    private readonly arenaAnswerRepo: Repository<ArenaParticipantAnswer>,
    @InjectRepository(CorrespondenceMessage)
    private readonly correspondenceMessageRepo: Repository<CorrespondenceMessage>,
    @InjectRepository(ModerationCase)
    private readonly moderationRepo: Repository<ModerationCase>,
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(TutorConversation)
    private readonly tutorConversationRepo: Repository<TutorConversation>,
  ) {}

  async getInsights(now = new Date()) {
    const historyFrom = new Date(now.getTime() - 61 * 86_400_000);
    const [
      students,
      classes,
      subjects,
      questions,
      chapters,
      quizzes,
      duelAnswers,
      arenaAnswers,
      correspondenceMessages,
      tutorConversations,
      competitions,
      arenaRegistrations,
      moderationCases,
    ] = await Promise.all([
      this.userRepo.find({ where: { role: UserRole.STUDENT } }),
      this.classRepo.find({ order: { name: 'ASC' } }),
      this.subjectRepo.find({ order: { name: 'ASC' } }),
      this.questionRepo.find(),
      this.chapterRepo.find(),
      this.quizRepo.find({
        where: {
          status: QuizStatus.COMPLETED,
          startedAt: MoreThanOrEqual(historyFrom),
        },
        relations: { questions: true },
      }),
      this.duelAnswerRepo.find({
        where: { answeredAt: MoreThanOrEqual(historyFrom) },
      }),
      this.arenaAnswerRepo.find({
        where: { submittedAt: MoreThanOrEqual(historyFrom) },
      }),
      this.correspondenceMessageRepo.find({
        where: { createdAt: MoreThanOrEqual(historyFrom) },
      }),
      this.tutorConversationRepo.find({
        where: { updatedAt: MoreThanOrEqual(historyFrom) },
      }),
      this.competitionRepo.find(),
      this.arenaRegistrationRepo.find(),
      this.moderationRepo.find(),
    ]);

    return buildAdminInsights(
      {
        students: students.map((item) => ({
          id: item.id,
          classId: item.classId,
          createdAt: item.createdAt,
        })),
        classes: classes.map((item) => ({ id: item.id, name: item.name })),
        subjects: subjects.map((item) => ({
          id: item.id,
          name: item.name,
          classId: item.classId,
        })),
        questions: questions.map((item) => ({
          id: item.id,
          subjectId: item.subjectId,
        })),
        chapters: chapters.map((item) => ({
          id: item.id,
          subjectId: item.subjectId,
          title: item.title,
          status: item.status,
        })),
        quizzes: quizzes.map((item) => ({
          userId: item.userId,
          score: item.score,
          startedAt: item.startedAt,
          questions: item.questions.map((question) => ({ id: question.id })),
        })),
        duelAnswers: duelAnswers.map((item) => ({
          userId: item.userId,
          answeredAt: item.answeredAt,
        })),
        arenaAnswers: arenaAnswers.map((item) => ({
          participantUserId: item.participantUserId,
          submittedAt: item.submittedAt,
        })),
        correspondenceMessages: correspondenceMessages.map((item) => ({
          senderUserId: item.senderUserId,
          createdAt: item.createdAt,
        })),
        tutorConversations: tutorConversations.map((item) => ({
          userId: item.userId,
          updatedAt: item.updatedAt,
        })),
        competitions: competitions.map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
          scheduledAt: item.scheduledAt,
          moderatorUserId: item.moderatorUserId,
          competitorAUserId: item.competitorAUserId,
          competitorBUserId: item.competitorBUserId,
        })),
        arenaRegistrations: arenaRegistrations.map((item) => ({
          status: item.status,
        })),
        moderationCases: moderationCases.map((item) => ({
          status: item.status,
          createdAt: item.createdAt,
        })),
      },
      now,
    );
  }
}

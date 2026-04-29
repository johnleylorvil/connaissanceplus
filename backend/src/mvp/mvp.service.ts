import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import {
  AcademicClass,
  AccountVerificationCode,
  Answer,
  AdminBroadcast,
  BroadcastTargetType,
  DuelAnswer,
  DuelMatch,
  DuelMatchQuestion,
  DuelMode,
  DuelProgress,
  DuelStatus,
  Difficulty,
  Notification,
  Question,
  QuizSession,
  QuizSessionQuestion,
  QuizStatus,
  Subject,
  User,
  UserRole,
  VerificationPurpose,
} from './entities';
import {
  BootstrapAdminDto,
  CreateClassDto,
  CreateModeratorDto,
  CreateQuestionDto,
  CreateSubjectDto,
  DuelAnswerDto,
  JoinMatchmakingDto,
  LoginDto,
  OtpVerificationDto,
  RegisterStudentDto,
  SendBroadcastDto,
  StartQuizDto,
  SubmitQuizDto,
  UpdateProfileDto,
} from './dto/mvp.dto';
import { Profile as GoogleProfile } from 'passport-google-oauth20';
import * as crypto from 'crypto';
import { HAITI_DEPARTMENTS } from './constants/haiti-geography';
import { MailService } from './mail.service';

const QUIZ_QUESTION_COUNT = 10;
const DUEL_QUESTION_COUNT = 10;
const ACCOUNT_OTP_TTL_MINUTES = 10;

type StudentRegistrationPayload = {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  classId: string;
  school: string | null;
  city: string | null;
  department: string | null;
  sectionName: string | null;
  canBeContacted: boolean;
};

type ModeratorRegistrationPayload = {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  temporaryPassword: string | null;
};

@Injectable()
export class MvpService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AccountVerificationCode)
    private readonly verificationRepo: Repository<AccountVerificationCode>,
    @InjectRepository(AcademicClass)
    private readonly classRepo: Repository<AcademicClass>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(QuizSession)
    private readonly quizSessionRepo: Repository<QuizSession>,
    @InjectRepository(QuizSessionQuestion)
    private readonly quizSessionQuestionRepo: Repository<QuizSessionQuestion>,
    @InjectRepository(Answer)
    private readonly answerRepo: Repository<Answer>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(DuelMatch)
    private readonly duelMatchRepo: Repository<DuelMatch>,
    @InjectRepository(DuelMatchQuestion)
    private readonly duelMatchQuestionRepo: Repository<DuelMatchQuestion>,
    @InjectRepository(DuelProgress)
    private readonly duelProgressRepo: Repository<DuelProgress>,
    @InjectRepository(DuelAnswer)
    private readonly duelAnswerRepo: Repository<DuelAnswer>,
    @InjectRepository(AdminBroadcast)
    private readonly adminBroadcastRepo: Repository<AdminBroadcast>,
  ) {}

  async requestStudentRegistrationOtp(dto: RegisterStudentDto) {
    if (!dto.acceptedPrivacyPolicy) {
      throw new BadRequestException('You must accept the privacy policy to register');
    }

    const email = this.normalizeEmail(dto.email);
    const academicClass = await this.classRepo.findOne({ where: { id: dto.classId } });
    if (!academicClass) {
      throw new NotFoundException('Class not found');
    }

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) {
      throw new BadRequestException('Email already used');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const payload: StudentRegistrationPayload = {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      passwordHash: hashedPassword,
      classId: dto.classId,
      school: dto.school?.trim() || null,
      city: dto.city?.trim() || null,
      department: dto.department?.trim() || null,
      sectionName: this.normalizeSectionName(dto.sectionName),
      canBeContacted: dto.canBeContacted,
    };

    const { verification, code } = await this.issueVerificationCode(email, VerificationPurpose.STUDENT_REGISTRATION, payload);

    try {
      await this.mailService.sendOtpEmail({
        email,
        firstName: payload.firstName,
        code,
        purpose: VerificationPurpose.STUDENT_REGISTRATION,
        expiresInMinutes: ACCOUNT_OTP_TTL_MINUTES,
      });
    } catch (error) {
      await this.verificationRepo.delete(verification.id);
      throw error;
    }

    return {
      status: 'otp_sent',
      verificationId: verification.id,
      email,
      expiresInSeconds: ACCOUNT_OTP_TTL_MINUTES * 60,
    };
  }

  async verifyStudentRegistrationOtp(dto: OtpVerificationDto) {
    const verification = await this.consumeVerificationCode(
      dto.verificationId,
      VerificationPurpose.STUDENT_REGISTRATION,
      dto.code,
    );
    const payload = this.parseVerificationPayload<StudentRegistrationPayload>(verification.payload);

    const academicClass = await this.classRepo.findOne({ where: { id: payload.classId } });
    if (!academicClass) {
      throw new NotFoundException('Class not found');
    }

    const exists = await this.userRepo.findOne({ where: { email: payload.email } });
    if (exists) {
      throw new BadRequestException('Email already used');
    }

    const student = this.userRepo.create({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      password: payload.passwordHash,
      classId: payload.classId,
      school: payload.school,
      city: payload.city,
      department: payload.department,
      sectionName: payload.sectionName,
      canBeContacted: payload.canBeContacted,
      role: UserRole.STUDENT,
      acceptedPrivacyPolicy: true,
    });

    const saved = await this.userRepo.save(student);
    return this.buildAuthResponse(saved);
  }

  async bootstrapAdmin(dto: BootstrapAdminDto) {
    const setupKey = this.configService.get<string>('ADMIN_SETUP_KEY')?.trim();
    if (!setupKey) {
      throw new ServiceUnavailableException('Admin bootstrap is disabled');
    }

    if (dto.setupKey !== setupKey) {
      throw new UnauthorizedException('Invalid setup key');
    }

    const alreadyAdmin = await this.userRepo.findOne({ where: { role: UserRole.ADMIN } });
    if (alreadyAdmin) {
      throw new BadRequestException('Admin already exists');
    }

    const normalizedEmail = this.normalizeEmail(dto.email);
    const emailExists = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    if (emailExists) {
      throw new BadRequestException('Email already used');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const admin = await this.userRepo.save(
      this.userRepo.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: normalizedEmail,
        password: hashedPassword,
        role: UserRole.ADMIN,
        canBeContacted: false,
      }),
    );

    return this.buildAuthResponse(admin);
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: this.normalizeEmail(dto.email) } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async findProfile(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  createClass(dto: CreateClassDto): Promise<AcademicClass> {
    const academicClass = this.classRepo.create(dto);
    return this.classRepo.save(academicClass);
  }

  findClasses(): Promise<AcademicClass[]> {
    return this.classRepo.find({ order: { name: 'ASC' } });
  }

  async createSubject(dto: CreateSubjectDto): Promise<Subject> {
    const academicClass = await this.classRepo.findOne({ where: { id: dto.classId } });
    if (!academicClass) {
      throw new NotFoundException('Class not found');
    }

    const subject = this.subjectRepo.create(dto);
    return this.subjectRepo.save(subject);
  }

  findSubjects(classId?: string): Promise<Subject[]> {
    if (!classId) {
      return this.subjectRepo.find({ order: { name: 'ASC' } });
    }

    return this.subjectRepo.find({
      where: { classId },
      order: { name: 'ASC' },
    });
  }

  async createQuestion(dto: CreateQuestionDto): Promise<Question> {
    const [academicClass, subject] = await Promise.all([
      this.classRepo.findOne({ where: { id: dto.classId } }),
      this.subjectRepo.findOne({ where: { id: dto.subjectId } }),
    ]);

    if (!academicClass) {
      throw new NotFoundException('Class not found');
    }
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    if (subject.classId !== dto.classId) {
      throw new BadRequestException('Subject does not belong to this class');
    }

    const question = this.questionRepo.create(dto);
    return this.questionRepo.save(question);
  }

  findQuestions(classId?: string, subjectId?: string): Promise<Question[]> {
    const where: Record<string, string> = {};
    if (classId) {
      where.classId = classId;
    }
    if (subjectId) {
      where.subjectId = subjectId;
    }

    return this.questionRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async startQuiz(userId: string, dto: StartQuizDto): Promise<{
    sessionId: string;
    questions: Array<{
      sessionQuestionId: string;
      questionId: string;
      prompt: string;
      options: { A: string; B: string; C: string; D: string };
      difficulty: Difficulty;
    }>;
  }> {
    const [student, subject] = await Promise.all([
      this.userRepo.findOne({ where: { id: userId } }),
      this.subjectRepo.findOne({ where: { id: dto.subjectId } }),
    ]);

    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    if (student.role !== UserRole.STUDENT) {
      throw new BadRequestException('Only students can start quizzes');
    }
    this.assertStudentProfileComplete(student);
    if (!student.classId) {
      throw new BadRequestException('Student class is required');
    }
    if (subject.classId !== student.classId) {
      throw new BadRequestException('Student cannot start quiz outside assigned class');
    }

    const questionCount = QUIZ_QUESTION_COUNT;

    const allQuestions = await this.questionRepo.find({
      where: {
        classId: student.classId,
        subjectId: dto.subjectId,
      },
    });

    if (allQuestions.length < questionCount) {
      throw new BadRequestException(
        `Not enough questions. Required ${questionCount}, available ${allQuestions.length}`,
      );
    }

    const selectedQuestions = this.shuffle(allQuestions).slice(0, questionCount);

    const session = await this.quizSessionRepo.save(
      this.quizSessionRepo.create({
        userId: student.id,
        classId: student.classId,
        subjectId: subject.id,
        status: QuizStatus.IN_PROGRESS,
      }),
    );

    const sessionQuestions = await this.quizSessionQuestionRepo.save(
      selectedQuestions.map((question, index) =>
        this.quizSessionQuestionRepo.create({
          quizSessionId: session.id,
          questionId: question.id,
          position: index + 1,
        }),
      ),
    );

    const questionMap = new Map(selectedQuestions.map((question) => [question.id, question]));

    return {
      sessionId: session.id,
      questions: sessionQuestions.map((sessionQuestion) => {
        const question = questionMap.get(sessionQuestion.questionId);
        if (!question) {
          throw new NotFoundException('Question not found for session');
        }

        return {
          sessionQuestionId: sessionQuestion.id,
          questionId: question.id,
          prompt: question.prompt,
          options: {
            A: question.optionA,
            B: question.optionB,
            C: question.optionC,
            D: question.optionD,
          },
          difficulty: question.difficulty,
        };
      }),
    };
  }

  async submitQuiz(userId: string, sessionId: string, dto: SubmitQuizDto) {
    const session = await this.quizSessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Quiz session not found');
    }
    if (session.userId !== userId) {
      throw new UnauthorizedException('Cannot submit another user session');
    }
    if (session.status === QuizStatus.COMPLETED) {
      throw new BadRequestException('Quiz already submitted');
    }

    const sessionQuestions = await this.quizSessionQuestionRepo.find({
      where: { quizSessionId: sessionId },
      relations: ['question'],
      order: { position: 'ASC' },
    });

    const answerMap = new Map(dto.answers.map((answer) => [answer.sessionQuestionId, answer]));

    let score = 0;
    const answerEntities: Answer[] = [];

    for (const sessionQuestion of sessionQuestions) {
      const submitted = answerMap.get(sessionQuestion.id);
      if (!submitted) {
        continue;
      }

      const isCorrect = submitted.selectedOption === sessionQuestion.question.correctOption;
      if (isCorrect) {
        score += 1;
      }

      answerEntities.push(
        this.answerRepo.create({
          sessionQuestionId: sessionQuestion.id,
          selectedOption: submitted.selectedOption,
          isCorrect,
        }),
      );
    }

    await this.answerRepo.save(answerEntities);

    session.status = QuizStatus.COMPLETED;
    session.score = score;
    await this.quizSessionRepo.save(session);

    const percentage = Math.round((score / sessionQuestions.length) * 100);
    const emoji = percentage >= 80 ? '🏆' : percentage >= 50 ? '👍' : '📚';
    await this.createNotification(
      userId,
      `${emoji} Résultat du Quiz`,
      `Vous avez obtenu ${score}/${sessionQuestions.length} (${percentage}%). ${percentage >= 80 ? 'Excellent travail !' : percentage >= 50 ? 'Bon effort, continuez !' : 'Revisez et retentez demain !'} Ce quiz sert a votre entrainement personnel.`,
      'quiz_result',
    );

    return {
      sessionId: session.id,
      score,
      totalQuestions: sessionQuestions.length,
      submittedAnswers: answerEntities.length,
      percentage,
    };
  }

  async joinDuelMatchmaking(userId: string, dto: JoinMatchmakingDto) {
    const [student, subject] = await Promise.all([
      this.userRepo.findOne({ where: { id: userId } }),
      this.subjectRepo.findOne({ where: { id: dto.subjectId } }),
    ]);

    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    if (student.role !== UserRole.STUDENT) {
      throw new BadRequestException('Only students can join matchmaking');
    }
    this.assertStudentProfileComplete(student);
    if (!student.classId) {
      throw new BadRequestException('Student class is required');
    }
    if (subject.classId !== student.classId) {
      throw new BadRequestException('Student cannot join a duel outside assigned class');
    }

    const competitionId = `subject-duel:${subject.id}`;
    const competitionName = `Concours de ${subject.name}`;

    const activeDuel = await this.duelMatchRepo.findOne({
      where: [
        { playerOneId: userId, status: DuelStatus.WAITING },
        { playerOneId: userId, status: DuelStatus.IN_PROGRESS },
        { playerTwoId: userId, status: DuelStatus.IN_PROGRESS },
      ],
      order: { createdAt: 'DESC' },
    });

    if (activeDuel) {
      if (
        activeDuel.status === DuelStatus.WAITING &&
        !activeDuel.playerTwoId &&
        (!activeDuel.subjectId || !activeDuel.classId)
      ) {
        activeDuel.status = DuelStatus.COMPLETED;
        activeDuel.completedAt = new Date();
        await this.duelMatchRepo.save(activeDuel);
      } else if (
        activeDuel.status === DuelStatus.WAITING &&
        !activeDuel.playerTwoId &&
        activeDuel.subjectId === subject.id &&
        activeDuel.classId === student.classId
      ) {
        return {
          duelId: activeDuel.id,
          status: activeDuel.status,
          competitionId: activeDuel.competitionId,
        };
      } else if (
        activeDuel.status === DuelStatus.WAITING &&
        (activeDuel.subjectId !== subject.id || activeDuel.classId !== student.classId)
      ) {
        throw new BadRequestException('Vous etes deja en attente d\'un autre concours dans une autre matiere.');
      } else {
        return {
          duelId: activeDuel.id,
          status: activeDuel.status,
          competitionId: activeDuel.competitionId,
        };
      }
    }

    const waitingDuel = await this.duelMatchRepo.findOne({
      where: {
        status: DuelStatus.WAITING,
        subjectId: subject.id,
        classId: student.classId,
        mode: DuelMode.QCM,
      },
      order: { createdAt: 'ASC' },
    });

    if (waitingDuel && waitingDuel.playerOneId === userId) {
      return {
        duelId: waitingDuel.id,
        status: waitingDuel.status,
        competitionId: waitingDuel.competitionId,
      };
    }

    if (waitingDuel && waitingDuel.playerOneId !== userId) {
      const now = new Date();
      waitingDuel.playerTwoId = userId;
      waitingDuel.status = DuelStatus.IN_PROGRESS;
      waitingDuel.startedAt = now;
      await this.duelMatchRepo.save(waitingDuel);

      await this.duelProgressRepo.save(
        this.duelProgressRepo.create({
          duelMatchId: waitingDuel.id,
          userId,
          answeredCount: 0,
          score: 0,
          startedAt: now,
          submittedAt: null,
          totalTimeSeconds: null,
        }),
      );

      const playerOneProgress = await this.duelProgressRepo.findOne({
        where: { duelMatchId: waitingDuel.id, userId: waitingDuel.playerOneId },
      });
      if (!playerOneProgress) {
        throw new NotFoundException('Duel progress not found for creator');
      }

      playerOneProgress.startedAt = now;
      await this.duelProgressRepo.save(playerOneProgress);

      await this.createNotification(
        waitingDuel.playerOneId,
        '⚔️ Match trouvé',
        `Un adversaire a été trouvé pour ${competitionName}.`,
        'duel',
      );

      return {
        duelId: waitingDuel.id,
        status: waitingDuel.status,
        competitionId: waitingDuel.competitionId,
      };
    }

    const allQuestions = await this.questionRepo.find({
      where: {
        classId: student.classId,
        subjectId: subject.id,
      },
    });

    if (allQuestions.length < DUEL_QUESTION_COUNT) {
      throw new BadRequestException(
        `Not enough duel questions. Required ${DUEL_QUESTION_COUNT}, available ${allQuestions.length}`,
      );
    }

    const joinCode = await this.generateUniqueJoinCode();
    const createdDuel = await this.duelMatchRepo.save(
      this.duelMatchRepo.create({
        joinCode,
        competitionId,
        competitionName,
        subjectId: subject.id,
        classId: student.classId,
        playerOneId: userId,
        playerTwoId: null,
        status: DuelStatus.WAITING,
        questionCount: DUEL_QUESTION_COUNT,
        winnerUserId: null,
        startedAt: null,
        completedAt: null,
      }),
    );

    const selectedQuestions = this.shuffle(allQuestions).slice(0, DUEL_QUESTION_COUNT);
    await this.duelMatchQuestionRepo.save(
      selectedQuestions.map((question, index) =>
        this.duelMatchQuestionRepo.create({
          duelMatchId: createdDuel.id,
          questionId: question.id,
          position: index + 1,
        }),
      ),
    );

    await this.duelProgressRepo.save(
      this.duelProgressRepo.create({
        duelMatchId: createdDuel.id,
        userId,
        answeredCount: 0,
        score: 0,
        startedAt: null,
        submittedAt: null,
        totalTimeSeconds: null,
      }),
    );

    return {
      duelId: createdDuel.id,
      status: createdDuel.status,
      competitionId: createdDuel.competitionId,
    };
  }

  async getDuelState(userId: string, duelId: string) {
    const duelMatch = await this.duelMatchRepo.findOne({
      where: { id: duelId },
      relations: ['playerOne', 'playerTwo'],
    });

    if (!duelMatch) {
      throw new NotFoundException('Duel not found');
    }
    if (duelMatch.playerOneId !== userId && duelMatch.playerTwoId !== userId) {
      throw new UnauthorizedException('You are not part of this duel');
    }

    const [duelQuestions, progresses] = await Promise.all([
      this.duelMatchQuestionRepo.find({
        where: { duelMatchId: duelId },
        relations: ['question'],
        order: { position: 'ASC' },
      }),
      this.duelProgressRepo.find({
        where: { duelMatchId: duelId },
        relations: ['user'],
      }),
    ]);

    const duelQuestionIds = duelQuestions.map((question) => question.id);
    const answers =
      duelQuestionIds.length > 0
        ? await this.duelAnswerRepo.find({
            where: { duelMatchQuestionId: In(duelQuestionIds) },
            relations: ['duelMatchQuestion'],
          })
        : [];

    const answerByUserAndQuestion = new Map(
      answers.map((answer) => [`${answer.userId}:${answer.duelMatchQuestionId}`, answer]),
    );

    const myProgress = progresses.find((progress) => progress.userId === userId);

    return {
      duelId: duelMatch.id,
      joinCode: duelMatch.joinCode,
      competitionId: duelMatch.competitionId,
      competitionName: duelMatch.competitionName,
      status: duelMatch.status,
      questionCount: duelMatch.questionCount,
      winnerUserId: duelMatch.winnerUserId,
      currentUserId: userId,
      questions: duelQuestions.map((duelQuestion) => ({
        duelQuestionId: duelQuestion.id,
        position: duelQuestion.position,
        prompt: duelQuestion.question.prompt,
        options: {
          A: duelQuestion.question.optionA,
          B: duelQuestion.question.optionB,
          C: duelQuestion.question.optionC,
          D: duelQuestion.question.optionD,
        },
        difficulty: duelQuestion.question.difficulty,
      })),
      participants: progresses.map((progress) => ({
        userId: progress.userId,
        name: `${progress.user.firstName} ${progress.user.lastName}`,
        score: progress.score,
        answeredCount: progress.answeredCount,
        currentQuestion:
          progress.answeredCount >= duelMatch.questionCount
            ? duelMatch.questionCount
            : progress.answeredCount + 1,
        isFinished: !!progress.submittedAt,
        totalTimeSeconds: progress.totalTimeSeconds,
        answers: duelQuestions.map((duelQuestion) => {
          const answer = answerByUserAndQuestion.get(`${progress.userId}:${duelQuestion.id}`);
          return {
            duelQuestionId: duelQuestion.id,
            position: duelQuestion.position,
            isCorrect: answer ? answer.isCorrect : null,
          };
        }),
      })),
      canAnswer:
        duelMatch.status === DuelStatus.IN_PROGRESS &&
        !!myProgress &&
        !myProgress.submittedAt &&
        myProgress.answeredCount < duelMatch.questionCount,
      myAnsweredCount: myProgress?.answeredCount ?? 0,
    };
  }

  async submitDuelAnswer(userId: string, duelId: string, dto: DuelAnswerDto) {
    const duelMatch = await this.duelMatchRepo.findOne({ where: { id: duelId } });
    if (!duelMatch) {
      throw new NotFoundException('Duel not found');
    }
    if ((duelMatch as { mode?: string }).mode === 'oral_live') {
      throw new BadRequestException('QCM answers are not supported for oral live duels');
    }
    if (duelMatch.playerOneId !== userId && duelMatch.playerTwoId !== userId) {
      throw new UnauthorizedException('You are not part of this duel');
    }
    if (duelMatch.status !== DuelStatus.IN_PROGRESS) {
      throw new BadRequestException('Duel is not in progress');
    }

    const progress = await this.duelProgressRepo.findOne({
      where: { duelMatchId: duelId, userId },
    });
    if (!progress) {
      throw new NotFoundException('Duel progress not found');
    }
    if (progress.submittedAt) {
      throw new BadRequestException('You already finished this duel');
    }

    const duelQuestion = await this.duelMatchQuestionRepo.findOne({
      where: { id: dto.duelQuestionId, duelMatchId: duelId },
      relations: ['question'],
    });

    if (!duelQuestion) {
      throw new NotFoundException('Duel question not found');
    }

    const expectedPosition = progress.answeredCount + 1;
    if (duelQuestion.position !== expectedPosition) {
      throw new BadRequestException('Answer out of order');
    }

    const alreadyAnswered = await this.duelAnswerRepo.findOne({
      where: { duelMatchQuestionId: duelQuestion.id, userId },
    });
    if (alreadyAnswered) {
      throw new BadRequestException('This question was already answered');
    }

    const selectedOption = dto.selectedOption ?? null;
    const isCorrect =
      selectedOption !== null && selectedOption === duelQuestion.question.correctOption;

    await this.duelAnswerRepo.save(
      this.duelAnswerRepo.create({
        duelMatchQuestionId: duelQuestion.id,
        userId,
        selectedOption,
        isCorrect,
      }),
    );

    if (!progress.startedAt) {
      progress.startedAt = duelMatch.startedAt ?? new Date();
    }
    progress.answeredCount += 1;
    if (isCorrect) {
      progress.score += 1;
    }

    if (progress.answeredCount >= duelMatch.questionCount) {
      const submittedAt = new Date();
      progress.submittedAt = submittedAt;
      progress.totalTimeSeconds = Math.max(
        1,
        Math.round((submittedAt.getTime() - progress.startedAt.getTime()) / 1000),
      );
    }

    await this.duelProgressRepo.save(progress);

    const allProgresses = await this.duelProgressRepo.find({ where: { duelMatchId: duelId } });
    if (
      allProgresses.length === 2 &&
      allProgresses.every((entry) => !!entry.submittedAt)
    ) {
      const [left, right] = allProgresses;
      const winnerUserId = this.resolveDuelWinner(left, right);

      duelMatch.status = DuelStatus.COMPLETED;
      duelMatch.completedAt = new Date();
      duelMatch.winnerUserId = winnerUserId;
      await this.duelMatchRepo.save(duelMatch);

      if (winnerUserId) {
        await this.createNotification(
          winnerUserId,
          '🥇 Duel gagné',
          `Vous avez remporte ${duelMatch.competitionName}.`,
          'duel',
        );
      }
    }

    return this.getDuelState(userId, duelId);
  }

  async getWeeklyLeaderboard(classId?: string) {
    const weekStart = this.getStartOfWeek();

    const qb = this.duelProgressRepo
      .createQueryBuilder('progress')
      .innerJoin('duel_matches', 'match', 'match.id = progress.duelMatchId')
      .innerJoin('users', 'user', 'user.id = progress.userId')
      .select('progress.userId', 'userId')
      .addSelect('user.firstName', 'firstName')
      .addSelect('user.lastName', 'lastName')
      .addSelect(
        'SUM(CASE WHEN match.winnerUserId = progress.userId THEN 1 ELSE 0 END)',
        'winCount',
      )
      .addSelect(
        'SUM(CASE WHEN match.winnerUserId IS NOT NULL AND match.winnerUserId <> progress.userId THEN 1 ELSE 0 END)',
        'lossCount',
      )
      .addSelect('COUNT(progress.id)', 'duelCount')
      .addSelect('SUM(progress.score)', 'totalCorrectAnswers')
      .addSelect(
        'SUM(CASE WHEN match.winnerUserId = progress.userId THEN COALESCE(progress.totalTimeSeconds, 0) ELSE 0 END)',
        'winTimeSeconds',
      )
      .addSelect(
        'MAX(CASE WHEN match.winnerUserId = progress.userId THEN match.completedAt ELSE NULL END)',
        'lastWinAt',
      )
      .where('match.status = :status', { status: DuelStatus.COMPLETED })
      .andWhere('match.mode = :mode', { mode: DuelMode.QCM })
      .andWhere('match.playerTwoId IS NOT NULL')
      .andWhere('match.completedAt >= :weekStart', { weekStart })
      .groupBy('progress.userId')
      .addGroupBy('user.firstName')
      .addGroupBy('user.lastName')
      .orderBy('winCount', 'DESC')
      .addOrderBy('totalCorrectAnswers', 'DESC')
      .addOrderBy('winTimeSeconds', 'ASC')
      .addOrderBy('lossCount', 'ASC')
      .addOrderBy('lastWinAt', 'DESC');

    if (classId) {
      qb.andWhere('user.levelId = :classId', { classId });
    }

    const rows = await qb.getRawMany<{
      userId: string;
      firstName: string;
      lastName: string;
      winCount: string;
      lossCount: string;
      duelCount: string;
      totalCorrectAnswers: string;
      winTimeSeconds: string;
      lastWinAt: string | null;
    }>();

    return rows.map((row) => ({
      userId: row.userId,
      studentName: `${row.firstName} ${row.lastName}`,
      winCount: Number(row.winCount),
      lossCount: Number(row.lossCount),
      duelCount: Number(row.duelCount),
      totalCorrectAnswers: Number(row.totalCorrectAnswers),
      winTimeSeconds: Number(row.winTimeSeconds),
      lastWinAt: row.lastWinAt,
    }));
  }

  async getNotifications(userId: string) {
    return this.notificationRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 30,
    });
  }

  async markNotificationRead(userId: string, notifId: string) {
    const notif = await this.notificationRepo.findOne({ where: { id: notifId } });
    if (!notif) throw new NotFoundException('Notification not found');
    if (notif.userId !== userId) throw new UnauthorizedException();
    notif.isRead = true;
    return this.notificationRepo.save(notif);
  }

  async markAllNotificationsRead(userId: string) {
    await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('userId = :userId AND isRead = false', { userId })
      .execute();
    return { success: true };
  }

  async deleteNotification(userId: string, notifId: string) {
    const notif = await this.notificationRepo.findOne({ where: { id: notifId } });
    if (!notif) throw new NotFoundException('Notification not found');
    if (notif.userId !== userId) throw new UnauthorizedException();

    await this.notificationRepo.delete({ id: notifId });
    return { success: true };
  }

  async getQuizHistory(userId: string) {
    const sessions = await this.quizSessionRepo.find({
      where: { userId, status: QuizStatus.COMPLETED },
      order: { startedAt: 'DESC' },
      take: 20,
    });

    if (sessions.length === 0) return [];

    const sessionIds = sessions.map((session) => session.id);

    const subjectIds = [...new Set(sessions.map((s) => s.subjectId))];
    const classIds = [...new Set(sessions.map((s) => s.classId))];

    const [subjects, classes, questionCounts] = await Promise.all([
      this.subjectRepo.findBy(subjectIds.map((id) => ({ id }))),
      this.classRepo.findBy(classIds.map((id) => ({ id }))),
      this.quizSessionQuestionRepo
        .createQueryBuilder('sessionQuestion')
        .select('sessionQuestion.quizSessionId', 'quizSessionId')
        .addSelect('COUNT(*)', 'questionCount')
        .where('sessionQuestion.quizSessionId IN (:...sessionIds)', { sessionIds })
        .groupBy('sessionQuestion.quizSessionId')
        .getRawMany<{ quizSessionId: string; questionCount: string }>(),
    ]);

    const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
    const classMap = new Map(classes.map((item) => [item.id, item.name]));
    const questionCountMap = new Map(
      questionCounts.map((entry) => [entry.quizSessionId, Number(entry.questionCount)]),
    );

    return sessions.map((session) => ({
      sessionId: session.id,
      subjectName: subjectMap.get(session.subjectId) ?? 'N/A',
      className: classMap.get(session.classId) ?? 'N/A',
      score: session.score,
      totalQuestions: questionCountMap.get(session.id) ?? 0,
      playedAt: session.startedAt,
    }));
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.newPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password required to change password');
      }
      const valid = await bcrypt.compare(dto.currentPassword, user.password);
      if (!valid) throw new UnauthorizedException('Current password is incorrect');
      user.password = await bcrypt.hash(dto.newPassword, 10);
    }

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.school !== undefined) user.school = dto.school?.trim() || null;
    if (dto.city !== undefined) user.city = dto.city?.trim() || null;
    if (dto.department !== undefined) user.department = dto.department?.trim() || null;
    if (dto.sectionName !== undefined) user.sectionName = this.normalizeSectionName(dto.sectionName);
    if (dto.canBeContacted !== undefined) user.canBeContacted = dto.canBeContacted;

    if (user.role === UserRole.STUDENT) {
      if (dto.classId !== undefined) {
        const academicClass = await this.classRepo.findOne({ where: { id: dto.classId } });
        if (!academicClass) {
          throw new NotFoundException('Class not found');
        }
        user.classId = academicClass.id;
      }

      if (dto.acceptedPrivacyPolicy === false) {
        throw new BadRequestException('Privacy policy consent cannot be revoked here');
      }
      if (dto.acceptedPrivacyPolicy === true) {
        user.acceptedPrivacyPolicy = true;
      }

      if (this.requiresStudentProfileCompletion(user)) {
        throw new BadRequestException('Student profile requires a class and accepted privacy policy');
      }
    }

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  async getAdminStats() {
    const [studentCount, questionCount, subjectCount, sessionCount] = await Promise.all([
      this.userRepo.count({ where: { role: UserRole.STUDENT } }),
      this.questionRepo.count(),
      this.subjectRepo.count(),
      this.quizSessionRepo.count({ where: { status: QuizStatus.COMPLETED } }),
    ]);
    return { studentCount, questionCount, subjectCount, sessionCount };
  }

  async getStudents() {
    const students = await this.userRepo.find({
      where: { role: UserRole.STUDENT },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return students.map((s) => this.sanitizeUser(s));
  }

  async googleAuth(profile: GoogleProfile) {
    const email = profile.emails?.[0]?.value;
    if (!email) throw new BadRequestException('Google account has no email');

    let user = await this.userRepo.findOne({ where: { googleId: profile.id } });
    if (!user) {
      user = await this.userRepo.findOne({ where: { email } });
    }

    if (user) {
      if (!user.googleId) {
        user.googleId = profile.id;
        await this.userRepo.save(user);
      }
      return this.buildAuthResponse(user);
    }

    // Create new user from Google profile
    const firstName = profile.name?.givenName ?? profile.displayName?.split(' ')[0] ?? 'Utilisateur';
    const lastName = profile.name?.familyName ?? profile.displayName?.split(' ').slice(1).join(' ') ?? '';
    const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    const newUser = this.userRepo.create({
      email,
      firstName,
      lastName,
      password: randomPassword,
      googleId: profile.id,
      role: UserRole.STUDENT,
      canBeContacted: false,
      acceptedPrivacyPolicy: false,
    });
    const saved = await this.userRepo.save(newUser);
    return this.buildAuthResponse(saved);
  }

  async sendBroadcast(adminId: string, dto: SendBroadcastDto) {
    const filters = this.normalizeBroadcastFilters(dto);

    if (filters.department) {
      this.assertValidDepartment(filters.department);
    }

    if (filters.classId) {
      const academicClass = await this.classRepo.findOne({ where: { id: filters.classId } });
      if (!academicClass) {
        throw new NotFoundException('Class not found');
      }
    }

    const users = await this.userRepo.find({
      where: {
        role: UserRole.STUDENT,
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.department ? { department: filters.department } : {}),
        ...(filters.city ? { city: filters.city } : {}),
        ...(filters.sectionName ? { sectionName: filters.sectionName } : {}),
      },
    });

    await Promise.all(
      users.map((u) => this.createNotification(u.id, dto.title, dto.message, 'broadcast')),
    );

    const targetType = this.getBroadcastTargetType(filters);

    const broadcast = this.adminBroadcastRepo.create({
      adminId,
      title: dto.title,
      message: dto.message,
      targetType,
      targetId: this.getBroadcastTargetId(targetType, filters),
      classId: filters.classId ?? null,
      department: filters.department ?? null,
      city: filters.city ?? null,
      sectionName: filters.sectionName ?? null,
      recipientCount: users.length,
    });
    return this.adminBroadcastRepo.save(broadcast);
  }

  async getBroadcasts() {
    return this.adminBroadcastRepo.find({ order: { createdAt: 'DESC' }, take: 50 });
  }

  getFrontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
  }

  private async createNotification(userId: string, title: string, message: string, type: string) {
    const notif = this.notificationRepo.create({ userId, title, message, type });
    return this.notificationRepo.save(notif);
  }

  private async generateUniqueJoinCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const exists = await this.duelMatchRepo.findOne({ where: { joinCode: code } });
      if (!exists) {
        return code;
      }
    }

    throw new BadRequestException('Could not generate duel join code');
  }

  private resolveDuelWinner(first: DuelProgress, second: DuelProgress) {
    if (first.score > second.score) {
      return first.userId;
    }
    if (second.score > first.score) {
      return second.userId;
    }

    const firstTime = first.totalTimeSeconds ?? Number.MAX_SAFE_INTEGER;
    const secondTime = second.totalTimeSeconds ?? Number.MAX_SAFE_INTEGER;

    if (firstTime < secondTime) {
      return first.userId;
    }
    if (secondTime < firstTime) {
      return second.userId;
    }

    return null;
  }

  private shuffle<T>(items: T[]): T[] {
    const list = [...items];
    for (let index = list.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [list[index], list[randomIndex]] = [list[randomIndex], list[index]];
    }
    return list;
  }

  async requestModeratorCreationOtp(dto: CreateModeratorDto) {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      if (existing.role === UserRole.ADMIN || existing.role === UserRole.MODERATOR) {
        const { password: _pw, ...safeUser } = existing;
        return {
          status: 'already_eligible',
          message: 'Cet utilisateur peut deja moderer les competitions.',
          ...safeUser,
        };
      }

      throw new ConflictException('Email already in use');
    }

    let rawPassword: string;
    let temporaryPassword: string | null = null;

    if (dto.generatePassword || !dto.password) {
      rawPassword = crypto.randomBytes(8).toString('hex');
      temporaryPassword = rawPassword;
    } else {
      rawPassword = dto.password;
    }

    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const payload: ModeratorRegistrationPayload = {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      passwordHash: hashedPassword,
      temporaryPassword,
    };

    const { verification, code } = await this.issueVerificationCode(email, VerificationPurpose.MODERATOR_REGISTRATION, payload);

    try {
      await this.mailService.sendOtpEmail({
        email,
        firstName: payload.firstName,
        code,
        purpose: VerificationPurpose.MODERATOR_REGISTRATION,
        expiresInMinutes: ACCOUNT_OTP_TTL_MINUTES,
        temporaryPassword,
      });
    } catch (error) {
      await this.verificationRepo.delete(verification.id);
      throw error;
    }

    return {
      status: 'otp_sent',
      verificationId: verification.id,
      email,
      expiresInSeconds: ACCOUNT_OTP_TTL_MINUTES * 60,
    };
  }

  async verifyModeratorCreationOtp(dto: OtpVerificationDto) {
    const verification = await this.consumeVerificationCode(
      dto.verificationId,
      VerificationPurpose.MODERATOR_REGISTRATION,
      dto.code,
    );
    const payload = this.parseVerificationPayload<ModeratorRegistrationPayload>(verification.payload);

    const existing = await this.userRepo.findOne({ where: { email: payload.email } });
    if (existing) {
      if (existing.role === UserRole.ADMIN || existing.role === UserRole.MODERATOR) {
        const { password: _pw, ...safeUser } = existing;
        return {
          status: 'already_eligible',
          message: 'Cet utilisateur peut deja moderer les competitions.',
          ...safeUser,
        };
      }

      throw new ConflictException('Email already in use');
    }

    const moderator = await this.userRepo.save(
      this.userRepo.create({
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        password: payload.passwordHash,
        role: UserRole.MODERATOR,
        canBeContacted: false,
      }),
    );

    const { password: _pw, ...safeUser } = moderator;

    return {
      status: 'created',
      ...safeUser,
    };
  }

  listModerators() {
    return this.userRepo.find({
      where: [{ role: UserRole.MODERATOR }, { role: UserRole.ADMIN }],
      select: ['id', 'firstName', 'lastName', 'email', 'createdAt', 'role'],
      order: { firstName: 'ASC', lastName: 'ASC' },
    });
  }

  private buildAuthResponse(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '7d') as never,
      }),
      user: this.sanitizeUser(user),
    };
  }

  private sanitizeUser(user: User) {
    const { password: _password, ...safeUser } = user;
    return {
      ...safeUser,
      acceptedPrivacyPolicy: this.hasAcceptedPrivacyPolicy(user),
      requiresProfileCompletion: this.requiresStudentProfileCompletion(user),
    };
  }

  private hasAcceptedPrivacyPolicy(user: User) {
    if (user.role !== UserRole.STUDENT) {
      return true;
    }
    if (typeof user.acceptedPrivacyPolicy === 'boolean') {
      return user.acceptedPrivacyPolicy;
    }
    return !!user.classId;
  }

  private requiresStudentProfileCompletion(user: User) {
    return user.role === UserRole.STUDENT && (!user.classId || !this.hasAcceptedPrivacyPolicy(user));
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private generateOtpCode() {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashOtpCode(code: string) {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private async issueVerificationCode<TPayload>(
    email: string,
    purpose: VerificationPurpose,
    payload: TPayload,
  ) {
    await this.verificationRepo.delete({ email, purpose });

    const code = this.generateOtpCode();
    const verification = await this.verificationRepo.save(
      this.verificationRepo.create({
        email,
        purpose,
        codeHash: this.hashOtpCode(code),
        payload: JSON.stringify(payload),
        expiresAt: new Date(Date.now() + ACCOUNT_OTP_TTL_MINUTES * 60 * 1000),
      }),
    );

    return { verification, code };
  }

  private async consumeVerificationCode(
    verificationId: string,
    purpose: VerificationPurpose,
    code: string,
  ) {
    const verification = await this.verificationRepo.findOne({ where: { id: verificationId, purpose } });
    if (!verification) {
      throw new BadRequestException('Verification code not found');
    }

    if (verification.expiresAt.getTime() < Date.now()) {
      await this.verificationRepo.delete(verification.id);
      throw new BadRequestException('Verification code expired');
    }

    if (verification.codeHash !== this.hashOtpCode(code.trim())) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.verificationRepo.delete(verification.id);
    return verification;
  }

  private parseVerificationPayload<TPayload>(payload: string): TPayload {
    try {
      return JSON.parse(payload) as TPayload;
    } catch {
      throw new BadRequestException('Verification payload is invalid');
    }
  }

  private assertStudentProfileComplete(user: User) {
    if (this.requiresStudentProfileCompletion(user)) {
      throw new BadRequestException('Complete your profile before using student features');
    }
  }

  private assertValidDepartment(department: string) {
    if (!HAITI_DEPARTMENTS.includes(department as (typeof HAITI_DEPARTMENTS)[number])) {
      throw new BadRequestException('Department is invalid');
    }
  }

  private normalizeSectionName(sectionName?: string | null) {
    const trimmed = sectionName?.trim().replace(/\s+/g, ' ') || '';
    if (!trimmed) {
      return null;
    }

    const withoutPrefix = trimmed.replace(/^sect(?:ion)?\.?\s+/i, '').trim();
    if (!withoutPrefix) {
      return null;
    }

    return withoutPrefix.toUpperCase();
  }

  private normalizeBroadcastFilters(dto: SendBroadcastDto) {
    let department = dto.department?.trim() || undefined;
    let city = dto.city?.trim() || undefined;
    let sectionName = this.normalizeSectionName(dto.sectionName) ?? undefined;
    let classId = dto.classId || undefined;
    const legacyTarget = dto.targetId?.trim();

    if (legacyTarget && (dto.targetType === BroadcastTargetType.CLASS || dto.targetType === ('level' as BroadcastTargetType)) && !classId) {
      classId = legacyTarget;
    }

    if (legacyTarget && dto.targetType === BroadcastTargetType.DEPARTMENT && !department) {
      department = legacyTarget;
    }

    if (legacyTarget && dto.targetType === BroadcastTargetType.CITY && !city) {
      city = legacyTarget;
    }

    if (legacyTarget && (dto.targetType === BroadcastTargetType.SECTION || dto.targetType === ('class' as BroadcastTargetType)) && !sectionName) {
      const [legacyDepartment, legacySectionName] = legacyTarget.includes('::')
        ? legacyTarget.split('::', 2).map((value) => value.trim())
        : ['', legacyTarget];

      department ||= legacyDepartment || undefined;
      sectionName = this.normalizeSectionName(legacySectionName) ?? undefined;
    }

    return { classId, department, city, sectionName };
  }

  private getBroadcastTargetType(filters: {
    classId?: string;
    department?: string;
    city?: string;
    sectionName?: string;
  }): BroadcastTargetType {
    const activeFilters = [filters.classId, filters.department, filters.city, filters.sectionName].filter(Boolean).length;

    if (activeFilters === 0) {
      return BroadcastTargetType.ALL;
    }
    if (activeFilters > 1) {
      return BroadcastTargetType.FILTERED;
    }
    if (filters.classId) {
      return BroadcastTargetType.CLASS;
    }
    if (filters.department) {
      return BroadcastTargetType.DEPARTMENT;
    }
    if (filters.city) {
      return BroadcastTargetType.CITY;
    }
    return BroadcastTargetType.SECTION;
  }

  private getBroadcastTargetId(
    targetType: BroadcastTargetType,
    filters: {
      classId?: string;
      department?: string;
      city?: string;
      sectionName?: string;
    },
  ): string | null {
    if (targetType === BroadcastTargetType.CLASS) {
      return filters.classId ?? null;
    }
    if (targetType === BroadcastTargetType.DEPARTMENT) {
      return filters.department ?? null;
    }
    if (targetType === BroadcastTargetType.CITY) {
      return filters.city ?? null;
    }
    if (targetType === BroadcastTargetType.SECTION) {
      return filters.sectionName ?? null;
    }
    return null;
  }

  private getStartOfWeek() {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(now);
    start.setDate(now.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    return start;
  }
}

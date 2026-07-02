import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, LessThan, MoreThan, Repository } from 'typeorm';
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
  DuelBuzzerPhase,
  DuelMatch,
  DuelMatchQuestion,
  DuelMode,
  DuelProgress,
  DuelStatus,
  Difficulty,
  Notification,
  OptionChoice,
  Question,
  QuizSession,
  QuizSessionQuestion,
  QuizStatus,
  Subject,
  User,
  UserGender,
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
  ListAdminUsersDto,
  OtpResendDto,
  OtpVerificationDto,
  RegisterStudentDto,
  SendBroadcastDto,
  StartQuizDto,
  SuspendUserDto,
  SubmitQuizDto,
  UpdateProfileDto,
} from './dto/mvp.dto';
import { Profile as GoogleProfile } from 'passport-google-oauth20';
import * as crypto from 'crypto';
import { HAITI_DEPARTMENTS } from './constants/haiti-geography';
import { MailService } from './mail.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

const QUIZ_QUESTION_COUNT = 10;
const DUEL_QUESTION_COUNT = 10;
const DUEL_BUZZER_RESPONSE_SECONDS = 8;
const DEFAULT_DUEL_DURATION_MINUTES = 3;
const MATCHED_LOBBY_SECONDS = 4;
const DUEL_GLOBAL_SECONDS = DEFAULT_DUEL_DURATION_MINUTES * 60;
const MATCHMAKING_EXPIRE_MINUTES = 15;
const FORFEIT_INACTIVE_SECONDS = 60; // if a player has no activity for 60s during a match, they forfeit
const ACCOUNT_OTP_TTL_MINUTES = 10;
const ACCOUNT_OTP_RESEND_COOLDOWN_SECONDS = 60;
const ACCOUNT_OTP_MAX_SENDS = 5;
const ACCOUNT_OTP_MAX_VERIFY_ATTEMPTS = 5;
const ACCOUNT_OTP_BLOCK_MINUTES = 15;

type StudentRegistrationPayload = {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  classId: string;
  gender: UserGender;
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
    @Optional() private readonly platformSettings?: PlatformSettingsService,
  ) {}

  async requestStudentRegistrationOtp(dto: RegisterStudentDto) {
    if (this.platformSettings && !this.platformSettings.get().registrationEnabled) {
      throw new ServiceUnavailableException('Les nouvelles inscriptions sont temporairement désactivées.');
    }
    this.platformSettings?.assertPassword(dto.password);
    if (!dto.acceptedPrivacyPolicy) {
      throw new BadRequestException("Vous devez accepter la politique de confidentialite pour vous inscrire.");
    }

    const email = this.normalizeEmail(dto.email);
    const academicClass = await this.classRepo.findOne({ where: { id: dto.classId } });
    if (!academicClass) {
      throw new NotFoundException('Classe introuvable.');
    }

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) {
      throw new BadRequestException('Cette adresse email est deja utilisee.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const payload: StudentRegistrationPayload = {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      passwordHash: hashedPassword,
      classId: dto.classId,
      gender: dto.gender,
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
      resendAvailableInSeconds: ACCOUNT_OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  async resendStudentRegistrationOtp(dto: OtpResendDto) {
    const { verification, code, payload } = await this.resendVerificationCode<StudentRegistrationPayload>(
      dto.verificationId,
      VerificationPurpose.STUDENT_REGISTRATION,
    );

    await this.mailService.sendOtpEmail({
      email: verification.email,
      firstName: payload.firstName,
      code,
      purpose: VerificationPurpose.STUDENT_REGISTRATION,
      expiresInMinutes: ACCOUNT_OTP_TTL_MINUTES,
    });

    return {
      status: 'otp_sent',
      verificationId: verification.id,
      email: verification.email,
      expiresInSeconds: ACCOUNT_OTP_TTL_MINUTES * 60,
      resendAvailableInSeconds: ACCOUNT_OTP_RESEND_COOLDOWN_SECONDS,
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
      throw new NotFoundException('Classe introuvable.');
    }

    const exists = await this.userRepo.findOne({ where: { email: payload.email } });
    if (exists) {
      throw new BadRequestException('Cette adresse email est deja utilisee.');
    }

    const student = this.userRepo.create({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      password: payload.passwordHash,
      classId: payload.classId,
      gender: payload.gender,
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
    this.platformSettings?.assertPassword(dto.password);
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
    if (!user.isActive) {
      throw new UnauthorizedException('Ce compte est suspendu. Contactez un administrateur.');
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
      correctOption: OptionChoice;
      explanation: string | null;
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
          correctOption: question.correctOption,
          explanation: question.explanation,
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

    const corrections = sessionQuestions.map((sessionQuestion) => {
      const selectedOption = answerMap.get(sessionQuestion.id)?.selectedOption ?? null;
      const question = sessionQuestion.question;

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
        selectedOption,
        correctOption: question.correctOption,
        isCorrect: selectedOption === question.correctOption,
        explanation: question.explanation,
      };
    });

    return {
      sessionId: session.id,
      score,
      totalQuestions: sessionQuestions.length,
      submittedAnswers: answerEntities.length,
      percentage,
      corrections,
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
    const durationMinutes = dto.durationMinutes ?? DEFAULT_DUEL_DURATION_MINUTES;
    const now = new Date();

    // --- Check if user already has an active duel ---
    const activeDuel = await this.duelMatchRepo.findOne({
      where: [
        { playerOneId: userId, status: DuelStatus.WAITING },
        { playerOneId: userId, status: DuelStatus.MATCHED },
        { playerOneId: userId, status: DuelStatus.IN_PROGRESS },
        { playerTwoId: userId, status: DuelStatus.MATCHED },
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
        // Legacy data quality fix: cancel old incomplete duel
        activeDuel.status = DuelStatus.CANCELLED;
        activeDuel.completedAt = now;
        await this.duelMatchRepo.save(activeDuel);
      } else if (
        activeDuel.status === DuelStatus.WAITING &&
        !activeDuel.playerTwoId &&
        (!activeDuel.waitingExpiresAt || activeDuel.waitingExpiresAt < now)
      ) {
        // User's own waiting duel has expired — cancel it and allow re-joining
        activeDuel.status = DuelStatus.CANCELLED;
        activeDuel.completedAt = now;
        await this.duelMatchRepo.save(activeDuel);
      } else if (
        activeDuel.status === DuelStatus.WAITING &&
        !activeDuel.playerTwoId &&
        activeDuel.subjectId === subject.id &&
        activeDuel.classId === student.classId &&
        activeDuel.durationMinutes === durationMinutes
      ) {
        return {
          duelId: activeDuel.id,
          status: activeDuel.status,
          competitionId: activeDuel.competitionId,
        };
      } else if (
        activeDuel.status === DuelStatus.WAITING &&
        (activeDuel.subjectId !== subject.id || activeDuel.classId !== student.classId || activeDuel.durationMinutes !== durationMinutes)
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

    // --- Pre-fetch questions for potential duel creation (outside transaction) ---
    const allQuestions = await this.questionRepo.find({
      where: { classId: student.classId, subjectId: subject.id },
    });

    if (allQuestions.length < DUEL_QUESTION_COUNT) {
      throw new BadRequestException(
        `Not enough duel questions. Required ${DUEL_QUESTION_COUNT}, available ${allQuestions.length}`,
      );
    }

    const joinCode = await this.generateUniqueJoinCode();
    const expiresAt = new Date(now.getTime() + MATCHMAKING_EXPIRE_MINUTES * 60_000);

    // --- Critical section: find-or-create with pessimistic lock to prevent race conditions ---
    let notifyPlayerOneId: string | null = null;
    let notifyCompetitionName = competitionName;

    const result = await this.duelMatchRepo.manager.transaction(async (manager) => {
      const txDuelRepo = manager.getRepository(DuelMatch);
      const txProgressRepo = manager.getRepository(DuelProgress);
      const txDuelQRepo = manager.getRepository(DuelMatchQuestion);
      const txNow = new Date();

      const waitingDuel = await txDuelRepo.findOne({
        where: {
          status: DuelStatus.WAITING,
          subjectId: subject.id,
          classId: student.classId ?? IsNull(),
          durationMinutes,
          mode: DuelMode.QCM,
          waitingExpiresAt: MoreThan(txNow),
        },
        order: { createdAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      if (waitingDuel && waitingDuel.playerOneId === userId) {
        // This user's own duel somehow made it to the waitingDuel query — just return it
        return { duelId: waitingDuel.id, status: waitingDuel.status, competitionId: waitingDuel.competitionId };
      }

      if (waitingDuel) {
        // Guard: verify the waiting duel still has its questions (they could have been cascade-deleted).
        const questionCount = await manager.getRepository(DuelMatchQuestion).count({
          where: { duelMatchId: waitingDuel.id },
        });
        if (questionCount === 0) {
          // Cancel the broken waiting duel and fall through to create a fresh one.
          waitingDuel.status = DuelStatus.CANCELLED;
          waitingDuel.completedAt = txNow;
          await txDuelRepo.save(waitingDuel);
          // Fall through to the "no waiting duel" branch below.
        } else {
        // Join the existing waiting duel
        waitingDuel.playerTwoId = userId;
        waitingDuel.status = DuelStatus.MATCHED;
        waitingDuel.matchStartsAt = new Date(txNow.getTime() + MATCHED_LOBBY_SECONDS * 1000);
        waitingDuel.startedAt = null;
        waitingDuel.responseDeadlineAt = null;
        await txDuelRepo.save(waitingDuel);

        await txProgressRepo.save(
          txProgressRepo.create({
            duelMatchId: waitingDuel.id,
            userId,
            answeredCount: 0,
            score: 0,
            startedAt: null,
            submittedAt: null,
            totalTimeSeconds: null,
          }),
        );

        const playerOneProgress = await txProgressRepo.findOne({
          where: { duelMatchId: waitingDuel.id, userId: waitingDuel.playerOneId },
        });
        if (!playerOneProgress) {
          throw new NotFoundException('Duel progress not found for creator');
        }

        playerOneProgress.startedAt = null;
        await txProgressRepo.save(playerOneProgress);

        // Schedule notification after transaction (using outer scope variable)
        notifyPlayerOneId = waitingDuel.playerOneId;
        notifyCompetitionName = waitingDuel.competitionName;

        return {
          duelId: waitingDuel.id,
          status: waitingDuel.status,
          competitionId: waitingDuel.competitionId,
        };
        } // end else (questions exist)
      }

      // No valid waiting duel found — create a new one
      const createdDuel = await txDuelRepo.save(
        txDuelRepo.create({
          joinCode,
          competitionId,
          competitionName,
          subjectId: subject.id,
          classId: student.classId,
          playerOneId: userId,
          playerTwoId: null,
          status: DuelStatus.WAITING,
          questionCount: DUEL_QUESTION_COUNT,
          durationMinutes,
          currentQuestionPosition: 1,
          buzzerPhase: DuelBuzzerPhase.WAITING_FOR_BUZZ,
          activeResponderUserId: null,
          firstResponderUserId: null,
          responseDeadlineAt: null,
          winnerUserId: null,
          startedAt: null,
          matchStartsAt: null,
          completedAt: null,
          waitingExpiresAt: expiresAt,
        }),
      );

      const selectedQuestions = this.shuffle(allQuestions).slice(0, DUEL_QUESTION_COUNT);
      await txDuelQRepo.save(
        selectedQuestions.map((question, index) =>
          txDuelQRepo.create({
            duelMatchId: createdDuel.id,
            questionId: question.id,
            position: index + 1,
          }),
        ),
      );

      await txProgressRepo.save(
        txProgressRepo.create({
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
    });

    // Notify player one outside the transaction to avoid holding locks
    if (notifyPlayerOneId) {
      await this.createNotification(
        notifyPlayerOneId,
        '⚔️ Match trouvé',
        `Un adversaire a été trouvé pour ${notifyCompetitionName}.`,
        'duel',
      );
    }

    return result;
  }

  async cancelMatchmaking(userId: string) {
    const waitingDuel = await this.duelMatchRepo.findOne({
      where: { playerOneId: userId, status: DuelStatus.WAITING },
      order: { createdAt: 'DESC' },
    });

    if (!waitingDuel) return { cancelled: false };

    waitingDuel.status = DuelStatus.CANCELLED;
    waitingDuel.completedAt = new Date();
    await this.duelMatchRepo.save(waitingDuel);

    return { cancelled: true };
  }

  async getDuelState(userId: string, duelId: string) {
    const duelMatch = await this.duelMatchRepo.findOne({
      where: { id: duelId },
      relations: ['playerOne', 'playerTwo', 'playerOne.academicClass', 'playerTwo.academicClass'],
    });

    if (!duelMatch) {
      throw new NotFoundException('Duel not found');
    }
    if (duelMatch.playerOneId !== userId && duelMatch.playerTwoId !== userId) {
      throw new UnauthorizedException('You are not part of this duel');
    }

    if (
      duelMatch.status === DuelStatus.WAITING &&
      duelMatch.waitingExpiresAt &&
      duelMatch.waitingExpiresAt < new Date()
    ) {
      duelMatch.status = DuelStatus.CANCELLED;
      duelMatch.completedAt = new Date();
      await this.duelMatchRepo.save(duelMatch);
    }

    if (duelMatch.status === DuelStatus.MATCHED && duelMatch.mode === DuelMode.QCM) {
      await this.startMatchedDuelIfReady(duelMatch);
    }

    if (duelMatch.status === DuelStatus.IN_PROGRESS && duelMatch.mode === DuelMode.QCM) {
      await this.applyExpiredMinuteDuelDeadline(duelMatch);
    }

    const [duelQuestions, progresses] = await Promise.all([
      this.duelMatchQuestionRepo.find({
        where: { duelMatchId: duelId },
        relations: ['question'],
        order: { position: 'ASC' },
      }),
      this.duelProgressRepo.find({
        where: { duelMatchId: duelId },
        relations: ['user', 'user.academicClass'],
      }),
    ]);

    // If the duel is still in_progress but has no questions (e.g. source questions were deleted),
    // cancel it so the players aren't stuck on a blank page.
    if (duelMatch.status === DuelStatus.IN_PROGRESS && duelQuestions.length === 0) {
      duelMatch.status = DuelStatus.CANCELLED;
      duelMatch.completedAt = new Date();
      await this.duelMatchRepo.save(duelMatch);
    }

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
    const answeredQuestionIds = new Set(
      answers.filter((answer) => answer.userId === userId).map((answer) => answer.duelMatchQuestionId),
    );
    const currentQuestion = duelQuestions.find((duelQuestion) => !answeredQuestionIds.has(duelQuestion.id)) ?? null;
    const currentQuestionAnswers = currentQuestion
      ? answers.filter((answer) => answer.duelMatchQuestionId === currentQuestion.id)
      : [];
    const now = Date.now();
    const effectiveDeadline =
      duelMatch.responseDeadlineAt ??
      (duelMatch.startedAt
        ? new Date(duelMatch.startedAt.getTime() + this.getDuelDurationSeconds(duelMatch) * 1000)
        : null);
    const globalTimeLeft = effectiveDeadline
      ? Math.max(0, Math.ceil((effectiveDeadline.getTime() - now) / 1000))
      : this.getDuelDurationSeconds(duelMatch);

    return {
      duelId: duelMatch.id,
      joinCode: duelMatch.joinCode,
      competitionId: duelMatch.competitionId,
      competitionName: duelMatch.competitionName,
      status: duelMatch.status,
      questionCount: duelMatch.questionCount,
      durationMinutes: duelMatch.durationMinutes ?? DEFAULT_DUEL_DURATION_MINUTES,
      mode: duelMatch.mode,
      matchStartsAt: duelMatch.matchStartsAt,
      currentQuestionPosition: currentQuestion?.position ?? duelMatch.questionCount,
      buzzerPhase: duelMatch.buzzerPhase ?? DuelBuzzerPhase.WAITING_FOR_BUZZ,
      activeResponderUserId: userId,
      firstResponderUserId: null,
      responseDeadlineAt: duelMatch.responseDeadlineAt,
      responseSeconds: globalTimeLeft,
      winnerUserId: duelMatch.winnerUserId,
      currentUserId: userId,
      currentQuestion: currentQuestion
        ? {
            duelQuestionId: currentQuestion.id,
            position: currentQuestion.position,
            prompt: currentQuestion.question.prompt,
            options: {
              A: currentQuestion.question.optionA,
              B: currentQuestion.question.optionB,
              C: currentQuestion.question.optionC,
              D: currentQuestion.question.optionD,
            },
            difficulty: currentQuestion.question.difficulty,
            correctOption: duelMatch.status === DuelStatus.COMPLETED ? currentQuestion.question.correctOption : undefined,
            explanation: duelMatch.status === DuelStatus.COMPLETED ? currentQuestion.question.explanation : undefined,
          }
        : null,
      questionAttempts: currentQuestionAnswers
        .sort((a, b) => a.answeredAt.getTime() - b.answeredAt.getTime())
        .map((answer, index) => ({
          userId: answer.userId,
          selectedOption: answer.selectedOption,
          isCorrect: answer.isCorrect,
          attemptNumber: index + 1,
          answeredAt: answer.answeredAt,
        })),
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
        correctOption: duelMatch.status === DuelStatus.COMPLETED ? duelQuestion.question.correctOption : undefined,
        explanation: duelMatch.status === DuelStatus.COMPLETED ? duelQuestion.question.explanation : undefined,
      })),
      participants: progresses.map((progress) => {
        const participantAnswers = duelQuestions.map((duelQuestion) => {
          const answer = answerByUserAndQuestion.get(`${progress.userId}:${duelQuestion.id}`);
          return {
            duelQuestionId: duelQuestion.id,
            position: duelQuestion.position,
            selectedOption: answer?.selectedOption ?? null,
            isCorrect: answer ? answer.isCorrect : null,
          };
        });
        const nextQuestion = duelQuestions.find((duelQuestion) => !answerByUserAndQuestion.has(`${progress.userId}:${duelQuestion.id}`));

        return {
          userId: progress.userId,
          name: `${progress.user.firstName} ${progress.user.lastName}`,
          academicLevelName: progress.user.academicClass?.name ?? null,
          avatarUrl: progress.user.avatarUrl ?? null,
          gender: progress.user.gender ?? null,
          score: progress.score,
          answeredCount: progress.answeredCount,
          currentQuestion: nextQuestion?.position ?? duelMatch.questionCount,
          isFinished: !!progress.submittedAt,
          totalTimeSeconds: progress.totalTimeSeconds,
          answers: participantAnswers,
        };
      }),
      canBuzz: false,
      canAnswer:
        duelMatch.status === DuelStatus.IN_PROGRESS &&
        duelMatch.mode === DuelMode.QCM &&
        !!myProgress &&
        !myProgress.submittedAt &&
        !!currentQuestion &&
        globalTimeLeft > 0,
      myAnsweredCount: myProgress?.answeredCount ?? 0,
    };
  }

  async buzzDuel(userId: string, duelId: string) {
    const duelMatch = await this.duelMatchRepo.findOne({ where: { id: duelId } });
    if (!duelMatch) {
      throw new NotFoundException('Duel not found');
    }
    this.assertQcmDuelParticipant(duelMatch, userId);
    return this.getDuelState(userId, duelId);
  }

  async submitDuelAnswer(userId: string, duelId: string, dto: DuelAnswerDto) {
    const duelMatch = await this.duelMatchRepo.findOne({ where: { id: duelId } });
    if (!duelMatch) {
      throw new NotFoundException('Duel not found');
    }
    this.assertQcmDuelParticipant(duelMatch, userId);
    if (duelMatch.status !== DuelStatus.IN_PROGRESS) {
      throw new BadRequestException('Duel is not in progress');
    }

    await this.applyExpiredMinuteDuelDeadline(duelMatch);
    if (duelMatch.status !== DuelStatus.IN_PROGRESS) {
      return this.getDuelState(userId, duelId);
    }
    if (!duelMatch.responseDeadlineAt || duelMatch.responseDeadlineAt.getTime() <= Date.now()) {
      await this.applyExpiredMinuteDuelDeadline(duelMatch);
      return this.getDuelState(userId, duelId);
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
      where: { id: dto.duelQuestionId, duelMatchId: duelMatch.id },
      relations: ['question'],
    });
    if (!duelQuestion) {
      throw new NotFoundException('Duel question not found');
    }

    const duelQuestions = await this.duelMatchQuestionRepo.find({
      where: { duelMatchId: duelMatch.id },
      order: { position: 'ASC' },
    });
    const existingAnswers = await this.duelAnswerRepo.find({
      where: { userId, duelMatchQuestionId: In(duelQuestions.map((question) => question.id)) },
    });
    const answeredQuestionIds = new Set(existingAnswers.map((answer) => answer.duelMatchQuestionId));
    const expectedQuestion = duelQuestions.find((question) => !answeredQuestionIds.has(question.id));
    if (!expectedQuestion || expectedQuestion.id !== duelQuestion.id) {
      throw new BadRequestException('Cette question n\'est plus active.');
    }

    const selectedOption = dto.selectedOption ?? null;
    const isCorrect = selectedOption !== null && selectedOption === duelQuestion.question.correctOption;
    const now = new Date();

    await this.duelAnswerRepo.save(
      this.duelAnswerRepo.create({
        duelMatchQuestionId: duelQuestion.id,
        userId,
        selectedOption,
        isCorrect,
      }),
    );

    if (!progress.startedAt) {
      progress.startedAt = duelMatch.startedAt ?? now;
    }
    progress.answeredCount += 1;
    progress.lastActivityAt = now;
    if (isCorrect) {
      progress.score += 1;
    }
    if (progress.answeredCount >= duelMatch.questionCount) {
      progress.submittedAt = now;
      const startedAt = progress.startedAt ?? duelMatch.startedAt ?? now;
      progress.totalTimeSeconds = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 1000));
    }
    await this.duelProgressRepo.save(progress);

    await this.completeMinuteDuelIfReady(duelMatch);

    return this.getDuelState(userId, duelId);
  }

    async getWeeklyLeaderboard(classId?: string) {
    const thisWeekStart = this.getStartOfWeek(0);
    let rows = await this.runWeeklyLeaderboardQuery(thisWeekStart, null, classId);

    if (rows.length === 0) {
      // No completed QCM duels yet this week — fall back to last week.
      const lastWeekStart = this.getStartOfWeek(1);
      rows = await this.runWeeklyLeaderboardQuery(lastWeekStart, thisWeekStart, classId);

      // If there are still no duel results, use completed quiz activity as a
      // secondary fallback so the weekly podium can still highlight active students.
      if (rows.length === 0) {
        rows = await this.runWeeklyQuizFallbackQuery(thisWeekStart, null, classId);
      }

      if (rows.length === 0) {
        rows = await this.runWeeklyQuizFallbackQuery(lastWeekStart, thisWeekStart, classId);
      }
    }

    return rows;
  }

  private async runWeeklyQuizFallbackQuery(
    weekStart: Date,
    weekEnd: Date | null,
    classId?: string,
  ) {
    const qb = this.quizSessionRepo
      .createQueryBuilder('session')
      .innerJoin('users', 'user', 'user.id = session.userId')
      .select('session.userId', 'userId')
      .addSelect('user.firstName', 'firstName')
      .addSelect('user.lastName', 'lastName')
      .addSelect('COUNT(session.id)', 'winCount')
      .addSelect('0', 'lossCount')
      .addSelect('COUNT(session.id)', 'duelCount')
      .addSelect('SUM(session.score)', 'totalCorrectAnswers')
      .addSelect('0', 'winTimeSeconds')
      .addSelect('MAX(session.updatedAt)', 'lastWinAt')
      .where('session.status = :status', { status: QuizStatus.COMPLETED })
      .andWhere('session.updatedAt >= :weekStart', { weekStart });

    if (weekEnd) {
      qb.andWhere('session.updatedAt < :weekEnd', { weekEnd });
    }

    if (classId) {
      qb.andWhere('session.classId = :classId', { classId });
    }

    qb.groupBy('session.userId')
      .addGroupBy('user.firstName')
      .addGroupBy('user.lastName')
      .orderBy('winCount', 'DESC')
      .addOrderBy('totalCorrectAnswers', 'DESC')
      .addOrderBy('lastWinAt', 'DESC');

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

  private async runWeeklyLeaderboardQuery(
    weekStart: Date,
    weekEnd: Date | null,
    classId?: string,
  ) {
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
      .andWhere('match.completedAt >= :weekStart', { weekStart });

    if (weekEnd) {
      qb.andWhere('match.completedAt < :weekEnd', { weekEnd });
    }

    if (classId) {
      qb.andWhere('user.levelId = :classId', { classId });
    }

    qb.groupBy('progress.userId')
      .addGroupBy('user.firstName')
      .addGroupBy('user.lastName')
      .orderBy('winCount', 'DESC')
      .addOrderBy('totalCorrectAnswers', 'DESC')
      .addOrderBy('winTimeSeconds', 'ASC')
      .addOrderBy('lossCount', 'ASC')
      .addOrderBy('lastWinAt', 'DESC');

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
    if (this.platformSettings && !this.platformSettings.get().notificationsEnabled) return [];
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: { id: true, notificationsEnabled: true },
    });
    if (user?.notificationsEnabled === false) return [];

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
      this.platformSettings?.assertPassword(dto.newPassword);
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
    if (dto.preferredTutorLanguage !== undefined) user.preferredTutorLanguage = dto.preferredTutorLanguage;
    if (dto.notificationsEnabled !== undefined) user.notificationsEnabled = dto.notificationsEnabled;
    if (dto.gender !== undefined) user.gender = dto.gender;

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

  async updateAvatar(userId: string, avatarUrl: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.avatarUrl = avatarUrl;
    return this.sanitizeUser(await this.userRepo.save(user));
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

  async getUsers(query: ListAdminUsersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const builder = this.userRepo.createQueryBuilder('user')
      .leftJoinAndSelect('user.academicClass', 'academicClass')
      .orderBy('user.createdAt', 'DESC');

    if (query.scope === 'team') {
      builder.andWhere('user.role IN (:...teamRoles)', { teamRoles: [UserRole.ADMIN, UserRole.MODERATOR] });
    } else if (query.role) {
      builder.andWhere('user.role = :role', { role: query.role });
    }
    if (query.status) builder.andWhere('user.isActive = :isActive', { isActive: query.status === 'active' });
    const search = query.search?.trim().toLowerCase();
    if (search) {
      builder.andWhere(new Brackets((where) => {
        where.where('LOWER(user.firstName) LIKE :search', { search: `%${search}%` })
          .orWhere('LOWER(user.lastName) LIKE :search', { search: `%${search}%` })
          .orWhere('LOWER(user.email) LIKE :search', { search: `%${search}%` });
      }));
    }

    const [users, total, students, moderators, admins, active, suspended] = await Promise.all([
      builder.clone().skip((page - 1) * pageSize).take(pageSize).getMany(),
      builder.getCount(),
      this.userRepo.count({ where: { role: UserRole.STUDENT } }),
      this.userRepo.count({ where: { role: UserRole.MODERATOR } }),
      this.userRepo.count({ where: { role: UserRole.ADMIN } }),
      this.userRepo.count({ where: query.scope === 'team' ? { role: In([UserRole.ADMIN, UserRole.MODERATOR]), isActive: true } : { isActive: true } }),
      this.userRepo.count({ where: query.scope === 'team' ? { role: In([UserRole.ADMIN, UserRole.MODERATOR]), isActive: false } : { isActive: false } }),
    ]);

    return {
      items: users.map((user) => this.sanitizeUser(user)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      countsByRole: { student: students, moderator: moderators, admin: admins },
      countsByStatus: { active, suspended },
    };
  }

  async suspendUser(adminId: string, userId: string, dto: SuspendUserDto) {
    if (adminId === userId) throw new BadRequestException('Vous ne pouvez pas suspendre votre propre compte.');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    if (!user.isActive) return this.sanitizeUser(user);
    if (user.role === UserRole.ADMIN) {
      const activeAdminCount = await this.userRepo.count({ where: { role: UserRole.ADMIN, isActive: true } });
      if (activeAdminCount <= 1) {
        throw new BadRequestException('Le dernier administrateur actif ne peut pas être suspendu.');
      }
    }
    user.isActive = false;
    user.suspendedAt = new Date();
    user.suspendedByUserId = adminId;
    user.suspensionReason = dto.reason.trim();
    return this.sanitizeUser(await this.userRepo.save(user));
  }

  async reactivateUser(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    user.isActive = true;
    user.suspendedAt = null;
    user.suspendedByUserId = null;
    user.suspensionReason = null;
    return this.sanitizeUser(await this.userRepo.save(user));
  }
  async googleAuth(profile: GoogleProfile) {
    const email = profile.emails?.[0]?.value;
    if (!email) throw new BadRequestException('Google account has no email');

    let user = await this.userRepo.findOne({ where: { googleId: profile.id } });
    if (!user) {
      user = await this.userRepo.findOne({ where: { email } });
    }

    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedException('Ce compte est suspendu. Contactez un administrateur.');
      }
      if (!user.googleId) {
        user.googleId = profile.id;
        await this.userRepo.save(user);
      }
      return this.buildAuthResponse(user);
    }

    if (this.platformSettings && !this.platformSettings.get().registrationEnabled) {
      throw new ServiceUnavailableException('Les nouvelles inscriptions sont temporairement désactivées.');
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

  private assertQcmDuelParticipant(duelMatch: DuelMatch, userId: string) {
    if (duelMatch.mode === DuelMode.ORAL_LIVE) {
      throw new BadRequestException('QCM answers are not supported for oral live duels');
    }
    if (duelMatch.playerOneId !== userId && duelMatch.playerTwoId !== userId) {
      throw new UnauthorizedException('You are not part of this duel');
    }
  }

  private getOtherDuelParticipantId(duelMatch: DuelMatch, userId: string) {
    if (duelMatch.playerOneId === userId) {
      return duelMatch.playerTwoId;
    }
    if (duelMatch.playerTwoId === userId) {
      return duelMatch.playerOneId;
    }
    return null;
  }

  private getCurrentDuelQuestion(duelMatch: DuelMatch) {
    return this.duelMatchQuestionRepo.findOne({
      where: {
        duelMatchId: duelMatch.id,
        position: duelMatch.currentQuestionPosition,
      },
      relations: ['question'],
    });
  }

  private getDuelDurationSeconds(duelMatch: DuelMatch) {
    return (duelMatch.durationMinutes ?? DEFAULT_DUEL_DURATION_MINUTES) * 60;
  }

  private async startMatchedDuelIfReady(duelMatch: DuelMatch) {
    if (duelMatch.status !== DuelStatus.MATCHED || duelMatch.mode !== DuelMode.QCM) {
      return;
    }
    if (duelMatch.matchStartsAt && duelMatch.matchStartsAt.getTime() > Date.now()) {
      return;
    }

    const startedAt = new Date();
    duelMatch.status = DuelStatus.IN_PROGRESS;
    duelMatch.startedAt = startedAt;
    duelMatch.responseDeadlineAt = new Date(startedAt.getTime() + this.getDuelDurationSeconds(duelMatch) * 1000);
    await this.duelMatchRepo.save(duelMatch);

    const progresses = await this.duelProgressRepo.find({ where: { duelMatchId: duelMatch.id } });
    for (const progress of progresses) {
      if (!progress.startedAt) {
        progress.startedAt = startedAt;
      }
      progress.lastActivityAt = startedAt;
    }
    if (progresses.length > 0) {
      await this.duelProgressRepo.save(progresses);
    }
  }
  private async applyExpiredMinuteDuelDeadline(duelMatch: DuelMatch) {
    if (
      duelMatch.mode !== DuelMode.QCM ||
      duelMatch.status !== DuelStatus.IN_PROGRESS
    ) {
      return;
    }

    // Use the explicit deadline or fall back to startedAt + global seconds for legacy duels
    // that were created before responseDeadlineAt was tracked.
    const effectiveDeadline =
      duelMatch.responseDeadlineAt ??
      (duelMatch.startedAt
        ? new Date(duelMatch.startedAt.getTime() + this.getDuelDurationSeconds(duelMatch) * 1000)
        : null);

    if (!effectiveDeadline || effectiveDeadline.getTime() > Date.now()) {
      return;
    }

    await this.completeMinuteDuel(duelMatch, effectiveDeadline);
  }

  private async completeMinuteDuelIfReady(duelMatch: DuelMatch) {
    if (duelMatch.status !== DuelStatus.IN_PROGRESS || duelMatch.mode !== DuelMode.QCM) {
      return;
    }

    const progresses = await this.duelProgressRepo.find({ where: { duelMatchId: duelMatch.id } });
    if (progresses.length > 0 && progresses.every((progress) => !!progress.submittedAt)) {
      await this.completeMinuteDuel(duelMatch, new Date());
    }
  }

  private async completeMinuteDuel(duelMatch: DuelMatch, completedAt: Date) {
    const progresses = await this.duelProgressRepo.find({ where: { duelMatchId: duelMatch.id } });
    const finishAt = completedAt;

    for (const progress of progresses) {
      if (!progress.submittedAt) {
        progress.submittedAt = finishAt;
      }
      const startedAt = progress.startedAt ?? duelMatch.startedAt ?? finishAt;
      progress.totalTimeSeconds = Math.max(
        1,
        Math.round((finishAt.getTime() - startedAt.getTime()) / 1000),
      );
    }
    await this.duelProgressRepo.save(progresses);

    duelMatch.status = DuelStatus.COMPLETED;
    duelMatch.completedAt = finishAt;
    duelMatch.winnerUserId = this.resolveDuelWinnerByScore(progresses);
    duelMatch.buzzerPhase = DuelBuzzerPhase.WAITING_FOR_BUZZ;
    duelMatch.activeResponderUserId = null;
    duelMatch.firstResponderUserId = null;
    await this.duelMatchRepo.save(duelMatch);

    if (duelMatch.winnerUserId) {
      await this.createNotification(
        duelMatch.winnerUserId,
        'Duel gagne',
        `Vous avez remporte ${duelMatch.competitionName}.`,
        'duel',
      );
    }
  }

  private async applyExpiredBuzzerDeadline(duelMatch: DuelMatch) {
    if (
      duelMatch.mode !== DuelMode.QCM ||
      duelMatch.status !== DuelStatus.IN_PROGRESS ||
      (duelMatch.buzzerPhase ?? DuelBuzzerPhase.WAITING_FOR_BUZZ) !== DuelBuzzerPhase.ANSWERING ||
      !duelMatch.activeResponderUserId ||
      !duelMatch.responseDeadlineAt ||
      duelMatch.responseDeadlineAt.getTime() > Date.now()
    ) {
      return;
    }

    const currentQuestion = await this.getCurrentDuelQuestion(duelMatch);
    if (!currentQuestion) {
      await this.advanceBuzzerQuestion(duelMatch);
      return;
    }

    const userId = duelMatch.activeResponderUserId;
    const existing = await this.duelAnswerRepo.findOne({
      where: { duelMatchQuestionId: currentQuestion.id, userId },
    });

    if (!existing) {
      await this.duelAnswerRepo.save(
        this.duelAnswerRepo.create({
          duelMatchQuestionId: currentQuestion.id,
          userId,
          selectedOption: null,
          isCorrect: false,
        }),
      );

      const progress = await this.duelProgressRepo.findOne({
        where: { duelMatchId: duelMatch.id, userId },
      });
      if (progress) {
        if (!progress.startedAt) {
          progress.startedAt = duelMatch.startedAt ?? new Date();
        }
        progress.answeredCount += 1;
        progress.lastActivityAt = new Date();
        await this.duelProgressRepo.save(progress);
      }
    }

    if (duelMatch.firstResponderUserId === userId) {
      const secondResponderId = this.getOtherDuelParticipantId(duelMatch, userId);
      const secondAlreadyAnswered = secondResponderId
        ? await this.duelAnswerRepo.findOne({
            where: { duelMatchQuestionId: currentQuestion.id, userId: secondResponderId },
          })
        : null;

      if (secondResponderId && !secondAlreadyAnswered) {
        duelMatch.activeResponderUserId = secondResponderId;
        duelMatch.responseDeadlineAt = new Date(Date.now() + DUEL_BUZZER_RESPONSE_SECONDS * 1000);
        await this.duelMatchRepo.save(duelMatch);
        return;
      }
    }

    await this.advanceBuzzerQuestion(duelMatch);
  }

  private async advanceBuzzerQuestion(duelMatch: DuelMatch) {
    if (duelMatch.currentQuestionPosition >= duelMatch.questionCount) {
      await this.completeBuzzerDuel(duelMatch);
      return;
    }

    duelMatch.currentQuestionPosition += 1;
    duelMatch.buzzerPhase = DuelBuzzerPhase.WAITING_FOR_BUZZ;
    duelMatch.activeResponderUserId = null;
    duelMatch.firstResponderUserId = null;
    duelMatch.responseDeadlineAt = null;
    await this.duelMatchRepo.save(duelMatch);
  }

  private async completeBuzzerDuel(duelMatch: DuelMatch) {
    const completedAt = new Date();
    const progresses = await this.duelProgressRepo.find({
      where: { duelMatchId: duelMatch.id },
    });
    const winnerUserId = this.resolveDuelWinnerByScore(progresses);

    for (const progress of progresses) {
      progress.submittedAt = completedAt;
      const startedAt = progress.startedAt ?? duelMatch.startedAt ?? completedAt;
      progress.totalTimeSeconds = Math.max(
        1,
        Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
      );
    }
    await this.duelProgressRepo.save(progresses);

    duelMatch.status = DuelStatus.COMPLETED;
    duelMatch.completedAt = completedAt;
    duelMatch.winnerUserId = winnerUserId;
    duelMatch.buzzerPhase = DuelBuzzerPhase.WAITING_FOR_BUZZ;
    duelMatch.activeResponderUserId = null;
    duelMatch.firstResponderUserId = null;
    duelMatch.responseDeadlineAt = null;
    await this.duelMatchRepo.save(duelMatch);

    if (winnerUserId) {
      await this.createNotification(
        winnerUserId,
        'Duel gagne',
        `Vous avez remporte ${duelMatch.competitionName}.`,
        'duel',
      );
    }
  }

  private resolveDuelWinnerByScore(progresses: DuelProgress[]) {
    if (progresses.length < 2) {
      return progresses[0]?.userId ?? null;
    }

    const [first, second] = progresses;
    if (first.score > second.score) {
      return first.userId;
    }
    if (second.score > first.score) {
      return second.userId;
    }
    return null;
  }

  private async createNotification(userId: string, title: string, message: string, type: string) {
    if (this.platformSettings && !this.platformSettings.get().notificationsEnabled) return null;
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: { id: true, notificationsEnabled: true },
    });
    if (user?.notificationsEnabled === false) return null;

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
    if (dto.password) this.platformSettings?.assertPassword(dto.password);
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
      resendAvailableInSeconds: ACCOUNT_OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  async resendModeratorCreationOtp(dto: OtpResendDto) {
    const { verification, code, payload } = await this.resendVerificationCode<ModeratorRegistrationPayload>(
      dto.verificationId,
      VerificationPurpose.MODERATOR_REGISTRATION,
    );

    await this.mailService.sendOtpEmail({
      email: verification.email,
      firstName: payload.firstName,
      code,
      purpose: VerificationPurpose.MODERATOR_REGISTRATION,
      expiresInMinutes: ACCOUNT_OTP_TTL_MINUTES,
      temporaryPassword: payload.temporaryPassword,
    });

    return {
      status: 'otp_sent',
      verificationId: verification.id,
      email: verification.email,
      expiresInSeconds: ACCOUNT_OTP_TTL_MINUTES * 60,
      resendAvailableInSeconds: ACCOUNT_OTP_RESEND_COOLDOWN_SECONDS,
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
      where: [{ role: UserRole.MODERATOR, isActive: true }, { role: UserRole.ADMIN, isActive: true }],
      select: ['id', 'firstName', 'lastName', 'email', 'createdAt', 'role', 'isActive'],
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

  private async cleanupExpiredVerificationCodes() {
    await this.verificationRepo.delete({ expiresAt: LessThan(new Date()) });
  }

  private getOtpBlockedUntil() {
    return new Date(Date.now() + ACCOUNT_OTP_BLOCK_MINUTES * 60 * 1000);
  }

  private formatOtpWaitSeconds(seconds: number) {
    return Math.max(1, Math.ceil(seconds));
  }

  private formatOtpBlockMinutes(until: Date) {
    return Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
  }

  private otpRateLimitException(message: string) {
    return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }

  private async issueVerificationCode<TPayload>(
    email: string,
    purpose: VerificationPurpose,
    payload: TPayload,
  ) {
    await this.cleanupExpiredVerificationCodes();

    const now = new Date();
    const existing = await this.verificationRepo.findOne({ where: { email, purpose } });

    if (existing?.blockedUntil && existing.blockedUntil.getTime() > now.getTime()) {
      throw this.otpRateLimitException(
        `Trop de demandes OTP. Reessayez dans ${this.formatOtpBlockMinutes(existing.blockedUntil)} minute(s).`,
      );
    }

    if (existing) {
      const resendAvailableAt = existing.lastSentAt.getTime() + ACCOUNT_OTP_RESEND_COOLDOWN_SECONDS * 1000;
      if (resendAvailableAt > now.getTime()) {
        throw this.otpRateLimitException(
          `Veuillez attendre ${this.formatOtpWaitSeconds((resendAvailableAt - now.getTime()) / 1000)} seconde(s) avant de demander un nouveau code.`,
        );
      }

      if (existing.sendCount >= ACCOUNT_OTP_MAX_SENDS) {
        const blockedUntil = this.getOtpBlockedUntil();
        await this.verificationRepo.update(existing.id, { blockedUntil });
        throw this.otpRateLimitException(
          `Trop de demandes OTP. Reessayez dans ${this.formatOtpBlockMinutes(blockedUntil)} minute(s).`,
        );
      }
    }

    const code = this.generateOtpCode();

    const verification = await this.verificationRepo.save(
      existing
        ? this.verificationRepo.merge(existing, {
            codeHash: this.hashOtpCode(code),
            payload: JSON.stringify(payload),
            expiresAt: new Date(now.getTime() + ACCOUNT_OTP_TTL_MINUTES * 60 * 1000),
            verifyAttempts: 0,
            sendCount: existing.sendCount + 1,
            lastSentAt: now,
            blockedUntil: null,
          })
        : this.verificationRepo.create({
            email,
            purpose,
            codeHash: this.hashOtpCode(code),
            payload: JSON.stringify(payload),
            verifyAttempts: 0,
            sendCount: 1,
            lastSentAt: now,
            blockedUntil: null,
            expiresAt: new Date(now.getTime() + ACCOUNT_OTP_TTL_MINUTES * 60 * 1000),
          }),
    );

    return { verification, code };
  }

  private async resendVerificationCode<TPayload>(
    verificationId: string,
    purpose: VerificationPurpose,
  ) {
    await this.cleanupExpiredVerificationCodes();

    const verification = await this.verificationRepo.findOne({ where: { id: verificationId, purpose } });
    if (!verification) {
      throw new BadRequestException('Cette demande OTP est introuvable. Recommencez.');
    }

    const payload = this.parseVerificationPayload<TPayload>(verification.payload);
    const refreshed = await this.issueVerificationCode(verification.email, purpose, payload);
    return { ...refreshed, payload };
  }

  private async consumeVerificationCode(
    verificationId: string,
    purpose: VerificationPurpose,
    code: string,
  ) {
    await this.cleanupExpiredVerificationCodes();

    const verification = await this.verificationRepo.findOne({ where: { id: verificationId, purpose } });
    if (!verification) {
      throw new BadRequestException('Ce code OTP est introuvable. Demandez-en un nouveau.');
    }

    if (verification.blockedUntil && verification.blockedUntil.getTime() > Date.now()) {
      throw this.otpRateLimitException(
        `Trop de tentatives. Demandez un nouveau code dans ${this.formatOtpBlockMinutes(verification.blockedUntil)} minute(s).`,
      );
    }

    if (verification.expiresAt.getTime() < Date.now()) {
      await this.verificationRepo.delete(verification.id);
      throw new BadRequestException('Ce code OTP a expire. Demandez-en un nouveau.');
    }

    if (verification.codeHash !== this.hashOtpCode(code.trim())) {
      const nextAttempts = verification.verifyAttempts + 1;
      if (nextAttempts >= ACCOUNT_OTP_MAX_VERIFY_ATTEMPTS) {
        const blockedUntil = this.getOtpBlockedUntil();
        await this.verificationRepo.update(verification.id, {
          verifyAttempts: nextAttempts,
          blockedUntil,
        });
        throw this.otpRateLimitException(
          `Trop de tentatives. Demandez un nouveau code dans ${this.formatOtpBlockMinutes(blockedUntil)} minute(s).`,
        );
      }

      await this.verificationRepo.update(verification.id, {
        verifyAttempts: nextAttempts,
      });
      throw new UnauthorizedException(
        `Code OTP invalide. Il vous reste ${ACCOUNT_OTP_MAX_VERIFY_ATTEMPTS - nextAttempts} tentative(s).`,
      );
    }

    await this.verificationRepo.delete(verification.id);
    return verification;
  }

  private parseVerificationPayload<TPayload>(payload: string): TPayload {
    try {
      return JSON.parse(payload) as TPayload;
    } catch {
      throw new BadRequestException('Cette demande OTP est invalide. Recommencez.');
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

  /**
   * Returns the UTC timestamp that corresponds to Monday 00:00:00 in Haiti's
   * timezone (UTC-5), going back `weeksAgo` complete weeks.
   * Using Haiti's local timezone prevents the leaderboard week from resetting
   * at 19:00 Haiti-time (midnight UTC) instead of the correct midnight.
   */
  private getStartOfWeek(weeksAgo = 0): Date {
    const HAITI_OFFSET_MS = -5 * 60 * 60 * 1000; // Haiti is UTC-5
    const now = new Date();
    // Shift current UTC instant into Haiti local time (expressed as UTC date object)
    const haitiNow = new Date(now.getTime() + HAITI_OFFSET_MS);
    const dayOfWeek = haitiNow.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStartHaiti = new Date(haitiNow);
    weekStartHaiti.setUTCDate(haitiNow.getUTCDate() + diffToMonday - weeksAgo * 7);
    weekStartHaiti.setUTCHours(0, 0, 0, 0);
    // Shift back to UTC so the result can be compared with DB timestamps
    return new Date(weekStartHaiti.getTime() - HAITI_OFFSET_MS);
  }
}





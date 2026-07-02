import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

const dateTimeColumnType = process.env.DB_TYPE === 'postgres' ? 'timestamp' : 'datetime';

export enum UserRole {
  STUDENT = 'student',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
}


export enum UserGender {
  MASCULIN = 'masculin',
  FEMININ = 'feminin',
}

export enum VerificationPurpose {
  STUDENT_REGISTRATION = 'student_registration',
  MODERATOR_REGISTRATION = 'moderator_registration',
}

export enum BroadcastTargetType {
  ALL = 'all',
  CLASS = 'class',
  DEPARTMENT = 'department',
  CITY = 'city',
  SECTION = 'section',
  FILTERED = 'filtered',
}

export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export enum QuizStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum DuelStatus {
  WAITING = 'waiting',
  MATCHED = 'matched',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum DuelMode {
  QCM = 'qcm',
  ORAL_LIVE = 'oral_live',
}

export enum DuelBuzzerPhase {
  WAITING_FOR_BUZZ = 'waiting_for_buzz',
  ANSWERING = 'answering',
}

export enum OptionChoice {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
}

@Entity('levels')
@Unique(['name'])
export class AcademicClass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @OneToMany(() => Subject, (subject) => subject.academicClass)
  subjects: Subject[];

  @OneToMany(() => User, (user) => user.academicClass)
  students: User[];
}

@Entity('subjects')
@Unique(['name', 'classId'])
export class Subject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('uuid', { name: 'levelId' })
  classId: string;

  @ManyToOne(() => AcademicClass, (academicClass) => academicClass.subjects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'levelId' })
  academicClass: AcademicClass;

  @OneToMany(() => Question, (question) => question.subject)
  questions: Question[];
}

@Entity('users')
@Unique(['email'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column()
  email: string;

  @Column()
  password: string;

  @Column({ type: 'text', default: UserRole.STUDENT })
  role: UserRole;

  
  @Column({ type: 'text', nullable: true })
  gender: UserGender | null;

  @Column({ type: 'text', nullable: true })
  avatarUrl: string | null;

@Column('uuid', { name: 'levelId', nullable: true })
  classId: string | null;

  @ManyToOne(() => AcademicClass, (academicClass) => academicClass.students, { nullable: true })
  @JoinColumn({ name: 'levelId' })
  academicClass: AcademicClass | null;

  @Column({ type: 'text', nullable: true })
  school: string | null;

  @Column({ type: 'text', nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  department: string | null;

  @Column({ name: 'className', type: 'text', nullable: true })
  sectionName: string | null;

  @Column({ default: false })
  canBeContacted: boolean;

  @Column({ type: 'text', default: 'fr' })
  preferredTutorLanguage: 'fr' | 'ht';

  @Column({ type: 'boolean', default: true })
  notificationsEnabled: boolean;

  @Column({ type: 'boolean', nullable: true, default: null })
  acceptedPrivacyPolicy: boolean | null;

  @Column({ type: 'text', nullable: true })
  googleId: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: dateTimeColumnType, nullable: true })
  suspendedAt: Date | null;

  @Column('uuid', { nullable: true })
  suspendedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'suspendedByUserId' })
  suspendedBy: User | null;

  @Column({ type: 'text', nullable: true })
  suspensionReason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('account_verification_codes')
@Unique(['email', 'purpose'])
export class AccountVerificationCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ type: 'text' })
  purpose: VerificationPurpose;

  @Column({ type: 'text' })
  codeHash: string;

  @Column({ type: 'text' })
  payload: string;

  @Column({ default: 0 })
  verifyAttempts: number;

  @Column({ default: 1 })
  sendCount: number;

  @Column({ type: dateTimeColumnType })
  lastSentAt: Date;

  @Column({ type: dateTimeColumnType, nullable: true })
  blockedUntil: Date | null;

  @Column({ type: dateTimeColumnType })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'levelId' })
  classId: string;

  @Column('uuid')
  subjectId: string;

  @ManyToOne(() => AcademicClass, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'levelId' })
  academicClass: AcademicClass;

  @ManyToOne(() => Subject, (subject) => subject.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @Column('text')
  prompt: string;

  @Column('text')
  optionA: string;

  @Column('text')
  optionB: string;

  @Column('text')
  optionC: string;

  @Column('text')
  optionD: string;

  @Column({ type: 'text' })
  correctOption: OptionChoice;

  @Column({ type: 'text', default: Difficulty.MEDIUM })
  difficulty: Difficulty;

  @Column('text', { nullable: true })
  explanation: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('quiz_sessions')
export class QuizSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('uuid', { name: 'levelId' })
  classId: string;

  @Column('uuid')
  subjectId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => AcademicClass, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'levelId' })
  academicClass: AcademicClass;

  @ManyToOne(() => Subject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @Column({ type: 'text', default: QuizStatus.IN_PROGRESS })
  status: QuizStatus;

  @Column({ type: 'int', default: 0 })
  score: number;

  @CreateDateColumn()
  startedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => QuizSessionQuestion, (sessionQuestion) => sessionQuestion.quizSession, {
    cascade: true,
  })
  questions: QuizSessionQuestion[];
}

@Entity('quiz_session_questions')
export class QuizSessionQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  quizSessionId: string;

  @Column('uuid')
  questionId: string;

  @Column('int')
  position: number;

  @ManyToOne(() => QuizSession, (quizSession) => quizSession.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quizSessionId' })
  quizSession: QuizSession;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'questionId' })
  question: Question;

  @OneToMany(() => Answer, (answer) => answer.sessionQuestion, { cascade: true })
  answers: Answer[];
}

@Entity('answers')
export class Answer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  sessionQuestionId: string;

  @ManyToOne(() => QuizSessionQuestion, (sessionQuestion) => sessionQuestion.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionQuestionId' })
  sessionQuestion: QuizSessionQuestion;

  @Column({ type: 'text' })
  selectedOption: OptionChoice;

  @Column({ default: false })
  isCorrect: boolean;
}

@Entity('duel_matches')
@Unique(['joinCode'])
export class DuelMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  joinCode: string;

  @Column({ type: 'text' })
  competitionId: string;

  @Column({ type: 'text' })
  competitionName: string;

  @Column('uuid', { nullable: true })
  subjectId: string | null;

  @Column('uuid', { name: 'levelId', nullable: true })
  classId: string | null;

  @Column('uuid')
  playerOneId: string;

  @Column('uuid', { nullable: true })
  playerTwoId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'playerOneId' })
  playerOne: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'playerTwoId' })
  playerTwo: User | null;

  @Column({ type: 'text', default: DuelStatus.WAITING })
  status: DuelStatus;

  @Column({ type: 'int', default: 10 })
  questionCount: number;

  
  @Column({ type: 'int', default: 3 })
  durationMinutes: number;

@Column({ type: 'text', default: DuelMode.QCM })
  mode: DuelMode;

  @Column({ type: 'int', default: 1 })
  currentQuestionPosition: number;

  @Column({ type: 'text', default: DuelBuzzerPhase.WAITING_FOR_BUZZ })
  buzzerPhase: DuelBuzzerPhase;

  @Column('uuid', { nullable: true })
  activeResponderUserId: string | null;

  @Column('uuid', { nullable: true })
  firstResponderUserId: string | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  responseDeadlineAt: Date | null;

  @Column('uuid', { nullable: true })
  moderatorUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'moderatorUserId' })
  moderator: User | null;

  @Column({ type: 'text', nullable: true })
  chimeMeetingId: string | null;

  @Column({ type: 'text', nullable: true })
  chimeMediaRegion: string | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  liveStartedAt: Date | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  liveEndedAt: Date | null;

  @Column('uuid', { nullable: true })
  winnerUserId: string | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  waitingExpiresAt: Date | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  startedAt: Date | null;

  
  @Column({ type: dateTimeColumnType, nullable: true })
  matchStartsAt: Date | null;

@Column({ type: dateTimeColumnType, nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => DuelMatchQuestion, (question) => question.duelMatch, { cascade: true })
  questions: DuelMatchQuestion[];

  @OneToMany(() => DuelProgress, (progress) => progress.duelMatch, { cascade: true })
  progresses: DuelProgress[];

  @OneToMany(() => DuelScoreEvent, (event) => event.duelMatch, { cascade: true })
  scoreEvents: DuelScoreEvent[];
}

@Entity('duel_match_questions')
export class DuelMatchQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  duelMatchId: string;

  @Column('uuid')
  questionId: string;

  @Column('int')
  position: number;

  @ManyToOne(() => DuelMatch, (duelMatch) => duelMatch.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'duelMatchId' })
  duelMatch: DuelMatch;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'questionId' })
  question: Question;

  @OneToMany(() => DuelAnswer, (answer) => answer.duelMatchQuestion, { cascade: true })
  answers: DuelAnswer[];
}

@Entity('duel_progresses')
@Unique(['duelMatchId', 'userId'])
export class DuelProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  duelMatchId: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => DuelMatch, (duelMatch) => duelMatch.progresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'duelMatchId' })
  duelMatch: DuelMatch;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int', default: 0 })
  answeredCount: number;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ type: dateTimeColumnType, nullable: true })
  startedAt: Date | null;
  @Column({ type: dateTimeColumnType, nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  totalTimeSeconds: number | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  lastActivityAt: Date | null;
}

@Entity('duel_answers')
@Unique(['duelMatchQuestionId', 'userId'])
export class DuelAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  duelMatchQuestionId: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => DuelMatchQuestion, (duelMatchQuestion) => duelMatchQuestion.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'duelMatchQuestionId' })
  duelMatchQuestion: DuelMatchQuestion;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text', nullable: true })
  selectedOption: OptionChoice | null;

  @Column({ default: false })
  isCorrect: boolean;

  @CreateDateColumn()
  answeredAt: Date;
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', default: 'system' })
  type: string;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('admin_broadcasts')
export class AdminBroadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  adminId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'adminId' })
  admin: User;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', default: BroadcastTargetType.ALL })
  targetType: BroadcastTargetType;

  @Column({ type: 'text', nullable: true })
  targetId: string | null;

  @Column({ name: 'levelId', type: 'uuid', nullable: true })
  classId: string | null;

  @Column({ type: 'text', nullable: true })
  department: string | null;

  @Column({ type: 'text', nullable: true })
  city: string | null;

  @Column({ name: 'className', type: 'text', nullable: true })
  sectionName: string | null;

  @Column({ type: 'int', default: 0 })
  recipientCount: number;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('duel_score_events')
export class DuelScoreEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  duelMatchId: string;

  @ManyToOne(() => DuelMatch, (duelMatch) => duelMatch.scoreEvents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'duelMatchId' })
  duelMatch: DuelMatch;

  @Column('uuid', { nullable: true })
  awardedToUserId: string | null;

  @Column('uuid')
  awardedByModeratorId: string;

  @Column({ type: 'int', default: 1 })
  points: number;

  /** 'A' | 'B' | 'BOTH' | 'NONE' */
  @Column({ type: 'text' })
  awardTarget: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}




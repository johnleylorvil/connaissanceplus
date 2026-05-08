import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../mvp/entities';

const dateTimeColumnType = process.env.DB_TYPE === 'postgres' ? 'timestamp' : 'datetime';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export enum ContestSessionStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  CLOSED = 'closed',
  SCORING = 'scoring',
  PUBLISHED = 'published',
}

export enum LetterStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  ASSIGNED = 'assigned',
  DELIVERED = 'delivered',
  ARCHIVED = 'archived',
}

export enum ModerationTargetType {
  LETTER = 'letter',
  MESSAGE = 'message',
  USER = 'user',
}

export enum ModerationCaseStatus {
  PENDING = 'pending',
  HANDLED = 'handled',
  DISMISSED = 'dismissed',
}

// ─────────────────────────────────────────────────────────────────────────────
// Value types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON rules blob stored on ContestSession.
 * All fields have defaults in DEFAULT_RULES (correspondence.service.ts).
 * TODO: add `locale` support once user profile locale field is available.
 */
export type ContestSessionRules = {
  /** Max letters a single user may submit in this session (default 1). */
  maxLettersPerUser: number;
  /** Max letters a single user may receive in this session (default 1). */
  maxLettersReceived: number;
  /** Minimum body length in characters (default 500). */
  minBodyLength: number;
  /** Maximum body length in characters (default 5000). */
  maxBodyLength: number;
  /** Whether the voting phase is enabled (default false). */
  allowVoting: boolean;
  /** Optional locale filter for matching (e.g. "fr"). */
  locale?: string;
  /** Avoid re-pairing users matched within the last N days across sessions (0 = disabled). */
  avoidRecentPairingDays?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Entities
// ─────────────────────────────────────────────────────────────────────────────

@Entity('correspondence_sessions')
export class ContestSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  themePrompt: string;

  @Column({ type: dateTimeColumnType })
  startAt: Date;

  @Column({ type: dateTimeColumnType })
  endAt: Date;

  /** Extra time (in hours) after endAt during which replies are still allowed. */
  @Column({ default: 48 })
  gracePeriodHours: number;

  @Column({ type: 'text', default: ContestSessionStatus.DRAFT })
  status: ContestSessionStatus;

  /** JSON rules blob — missing keys fall back to DEFAULT_RULES. */
  @Column({ type: 'simple-json', nullable: true })
  rules: ContestSessionRules | null;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @CreateDateColumn({ type: dateTimeColumnType })
  createdAt: Date;

  @OneToMany(() => Letter, (letter) => letter.session)
  letters: Letter[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Entity('correspondence_letters')
@Index('IDX_letter_session_author', ['sessionId', 'authorUserId'])
@Index('IDX_letter_session_status', ['sessionId', 'status'])
export class Letter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => ContestSession, (session) => session.letters, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: ContestSession;

  @Column({ type: 'uuid' })
  authorUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorUserId' })
  author: User;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: { mood?: string; tags?: string[] } | null;

  @CreateDateColumn({ type: dateTimeColumnType })
  createdAt: Date;

  @Column({ type: dateTimeColumnType, nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'text', default: LetterStatus.DRAFT })
  status: LetterStatus;

  @OneToOne(() => Assignment, (assignment) => assignment.letter)
  assignment: Assignment | null;
}

// ─────────────────────────────────────────────────────────────────────────────

@Entity('correspondence_assignments')
@Index('IDX_assignment_session_recipient', ['sessionId', 'recipientUserId'])
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => ContestSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: ContestSession;

  /** Each letter can be assigned only once. */
  @Column({ type: 'uuid', unique: true })
  letterId: string;

  @OneToOne(() => Letter, (letter) => letter.assignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'letterId' })
  letter: Letter;

  @Column({ type: 'uuid' })
  recipientUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipientUserId' })
  recipient: User;

  @Column({ type: dateTimeColumnType })
  assignedAt: Date;

  @Column({ type: dateTimeColumnType, nullable: true })
  deliveredAt: Date | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  openedAt: Date | null;

  @OneToOne(() => CorrespondenceThread, (thread) => thread.assignment)
  thread: CorrespondenceThread | null;
}

// ─────────────────────────────────────────────────────────────────────────────

@Entity('correspondence_threads')
export class CorrespondenceThread {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => ContestSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: ContestSession;

  /** One thread per assignment. */
  @Column({ type: 'uuid', unique: true })
  assignmentId: string;

  @OneToOne(() => Assignment, (assignment) => assignment.thread, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignmentId' })
  assignment: Assignment;

  @CreateDateColumn({ type: dateTimeColumnType })
  createdAt: Date;

  @Column({ type: dateTimeColumnType, nullable: true })
  lastMessageAt: Date | null;

  /** When true, senders are shown as "Anonyme #XXXX" to the other party. */
  @Column({ default: true })
  isAnonymous: boolean;

  @OneToMany(() => CorrespondenceMessage, (message) => message.thread)
  messages: CorrespondenceMessage[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Entity('correspondence_messages')
@Index('IDX_message_thread_created', ['threadId', 'createdAt'])
export class CorrespondenceMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  threadId: string;

  @ManyToOne(() => CorrespondenceThread, (thread) => thread.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'threadId' })
  thread: CorrespondenceThread;

  @Column({ type: 'uuid' })
  senderUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderUserId' })
  sender: User;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ type: dateTimeColumnType })
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Optional — only active when session rules.allowVoting === true. */
@Entity('correspondence_votes')
@Unique('UQ_vote_session_voter_letter', ['sessionId', 'voterUserId', 'letterId'])
export class CorrespondenceVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => ContestSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: ContestSession;

  @Column({ type: 'uuid' })
  voterUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voterUserId' })
  voter: User;

  @Column({ type: 'uuid' })
  letterId: string;

  @ManyToOne(() => Letter, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'letterId' })
  letter: Letter;

  /** Score value 1-5 (defaults to 1 for simple upvote). */
  @Column({ default: 1 })
  score: number;

  @CreateDateColumn({ type: dateTimeColumnType })
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────

@Entity('correspondence_moderation_cases')
@Index('IDX_modcase_target', ['targetType', 'targetId'])
@Index('IDX_modcase_status', ['status'])
export class ModerationCase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  reporterUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporterUserId' })
  reporter: User;

  @Column({ type: 'text' })
  targetType: ModerationTargetType;

  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Column({ type: 'text', default: ModerationCaseStatus.PENDING })
  status: ModerationCaseStatus;

  @CreateDateColumn({ type: dateTimeColumnType })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true })
  handledBy: string | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  handledAt: Date | null;
}

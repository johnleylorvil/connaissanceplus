import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

const dateTimeColumnType = process.env.DB_TYPE === 'postgres' ? 'timestamp' : 'datetime';

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export enum ArenaCompetitionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',    // registrations open
  LIVE = 'live',
  PAUSED = 'paused',        // admin paused the session
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ArenaParticipantRegistrationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum ArenaRoundMode {
  ORAL = 'oral',
  QCM = 'qcm',
}

export enum ArenaPublicStreamProvider {
  NONE = 'none',
  YOUTUBE = 'youtube',
}

// ─────────────────────────────────────────────
// Competition
// ─────────────────────────────────────────────

@Entity('arena_competitions')
export class ArenaCompetition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: ArenaCompetitionStatus.PENDING })
  status: ArenaCompetitionStatus;

  @Column({ type: 'int', default: 10 })
  questionCount: number;

  @Column({ type: 'int', default: 30 })
  secondsPerQuestion: number;

  @Column({ type: dateTimeColumnType })
  scheduledAt: Date;

  @Column('uuid')
  createdByAdminId: string;

  @Column('uuid', { nullable: true })
  winnerParticipantUserId: string | null;

  @Column('uuid', { nullable: true })
  competitorAUserId: string | null;

  @Column('uuid', { nullable: true })
  competitorBUserId: string | null;

  @Column('uuid', { nullable: true })
  moderatorUserId: string | null;

  @Column({ type: 'int', default: 0 })
  currentRound: number;

  @Column({ type: dateTimeColumnType, nullable: true })
  startedAt: Date | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  completedAt: Date | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  pausedAt: Date | null;

  // ── Broadcast (HLS Egress) ──────────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  broadcastEgressId: string | null;

  @Column({ type: 'text', default: 'idle' })
  broadcastStatus: 'idle' | 'starting' | 'live' | 'stopped';

  @Column({ type: 'text', nullable: true })
  broadcastUrl: string | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  broadcastStartedAt: Date | null;

  @Column({ type: 'text', default: ArenaPublicStreamProvider.NONE })
  publicStreamProvider: ArenaPublicStreamProvider;

  @Column({ type: 'text', nullable: true })
  publicStreamUrl: string | null;

  @Column({ type: 'text', nullable: true })
  publicStreamChatUrl: string | null;

  @Column({ type: 'text', default: 'idle' })
  publicStreamStatus: 'idle' | 'live' | 'stopped';

  @Column({ type: dateTimeColumnType, nullable: true })
  publicStreamStartedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => ArenaParticipantRegistration, (r) => r.competition, { cascade: true })
  registrations: ArenaParticipantRegistration[];

  @OneToMany(() => ArenaRound, (r) => r.competition, { cascade: true })
  rounds: ArenaRound[];
}

// ─────────────────────────────────────────────
// Participant Registration
// ─────────────────────────────────────────────

@Entity('arena_participant_registrations')
@Unique(['competitionId', 'participantUserId'])
export class ArenaParticipantRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  competitionId: string;

  @Column('uuid')
  participantUserId: string;

  @Column({ type: 'text', default: ArenaParticipantRegistrationStatus.PENDING })
  status: ArenaParticipantRegistrationStatus;

  @Column({ type: dateTimeColumnType, nullable: true })
  disqualifiedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  disqualifiedReason: string | null;

  @ManyToOne(() => ArenaCompetition, (c) => c.registrations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'competitionId' })
  competition: ArenaCompetition;

  @CreateDateColumn()
  registeredAt: Date;
}

// ─────────────────────────────────────────────
// Round (one question = one round)
// ─────────────────────────────────────────────

@Entity('arena_rounds')
export class ArenaRound {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  competitionId: string;

  @Column('uuid', { nullable: true })
  questionId: string | null;

  @Column({ type: 'text', default: ArenaRoundMode.ORAL })
  roundMode: ArenaRoundMode;

  @Column({ type: 'int' })
  position: number;

  @Column({ type: dateTimeColumnType, nullable: true })
  startedAt: Date | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  endedAt: Date | null;

  @Column({ type: dateTimeColumnType, nullable: true })
  endTime: Date | null;   // authoritative scheduled end (startedAt + secondsPerQuestion)

  @ManyToOne(() => ArenaCompetition, (c) => c.rounds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'competitionId' })
  competition: ArenaCompetition;

  @OneToMany(() => ArenaParticipantAnswer, (a) => a.round, { cascade: true })
  answers: ArenaParticipantAnswer[];
}

// ─────────────────────────────────────────────
// Participant Answer
// ─────────────────────────────────────────────

@Entity('arena_participant_answers')
@Unique(['roundId', 'participantUserId'])
export class ArenaParticipantAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  roundId: string;

  @Column('uuid')
  participantUserId: string;

  @Column('uuid')
  submittedByUserId: string;

  @Column({ type: 'text', nullable: true })
  selectedOption: string | null;   // 'A' | 'B' | 'C' | 'D' | null (timeout)

  @Column({ default: false })
  isCorrect: boolean;

  @Column({ type: 'int', default: 0 })
  pointsAwarded: number;

  @Column({ type: dateTimeColumnType })
  submittedAt: Date;

  @ManyToOne(() => ArenaRound, (r) => r.answers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roundId' })
  round: ArenaRound;
}

// ─────────────────────────────────────────────
// Participant Chat message
// ─────────────────────────────────────────────

@Entity('arena_chat_messages')
export class ArenaParticipantMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  competitionId: string;

  @Column('uuid')
  participantUserId: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', nullable: true })
  senderName: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

// ─────────────────────────────────────────────
// Score Adjustment (manual admin correction)
// ─────────────────────────────────────────────

@Entity('arena_score_adjustments')
export class ArenaParticipantScoreAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  competitionId: string;

  @Column('uuid')
  participantUserId: string;

  @Column('uuid')
  adminId: string;

  @Column({ type: 'int' })
  pointsDelta: number;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../mvp/entities';

export type StudentInsightAction =
  | { type: 'start_quiz'; subjectId: string }
  | { type: 'open_duels'; subjectId?: string }
  | { type: 'open_arena'; competitionId?: string }
  | {
      type: 'open_correspondence';
      view: 'sessions' | 'write' | 'myletters' | 'inbox';
      targetId?: string;
    }
  | { type: 'view_history' };

@Entity('student_daily_recommendations')
@Unique('UQ_student_recommendation_day_slot', [
  'userId',
  'recommendationDate',
  'slot',
])
@Index('IDX_student_recommendation_user_day', ['userId', 'recommendationDate'])
export class StudentDailyRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  recommendationDate: string;

  @Column({ type: 'int' })
  slot: number;

  @Column({ type: 'text' })
  candidateKey: string;

  @Column({ type: 'text' })
  category: 'learning' | 'competition' | 'participation';

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'simple-json' })
  action: StudentInsightAction;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '../mvp/entities';

export enum FriendshipStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
}

@Entity('friendships')
@Unique(['requesterUserId', 'addresseeUserId'])
export class Friendship {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  requesterUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requesterUserId' })
  requester: User;

  @Column('uuid')
  addresseeUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'addresseeUserId' })
  addressee: User;

  @Column({ type: 'text', default: FriendshipStatus.PENDING })
  status: FriendshipStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

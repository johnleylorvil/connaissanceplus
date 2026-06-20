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
import { Subject, User } from '../mvp/entities';

export enum ChapterStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export enum TutorLanguage {
  FRENCH = 'fr',
  CREOLE = 'ht',
}

export enum TutorMessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

@Entity('learning_chapters')
export class Chapter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  subjectId: string;

  @ManyToOne(() => Subject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @Column('text')
  title: string;

  @Column('text')
  summary: string;

  @Column('text')
  content: string;

  @Column('int', { default: 0 })
  position: number;

  @Column({ type: 'text', default: ChapterStatus.DRAFT })
  status: ChapterStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => TutorConversation, (conversation) => conversation.chapter)
  conversations: TutorConversation[];
}

@Entity('tutor_conversations')
@Unique('UQ_tutor_conversation_user_chapter_language', [
  'userId',
  'chapterId',
  'language',
])
export class TutorConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  chapterId: string;

  @ManyToOne(() => Chapter, (chapter) => chapter.conversations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'chapterId' })
  chapter: Chapter;

  @Column({ type: 'text' })
  language: TutorLanguage;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => TutorMessage, (message) => message.conversation)
  messages: TutorMessage[];
}

@Entity('tutor_messages')
export class TutorMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  conversationId: string;

  @ManyToOne(() => TutorConversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: TutorConversation;

  @Column({ type: 'text' })
  role: TutorMessageRole;

  @Column('text')
  content: string;

  @CreateDateColumn()
  createdAt: Date;
}

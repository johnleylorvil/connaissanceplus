import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicClass, Subject, User } from '../mvp/entities';
import {
  AdminLearningController,
  LearningController,
} from './learning.controller';
import { Chapter, TutorConversation, TutorMessage } from './learning.entities';
import { LearningService } from './learning.service';
import { OpenAiTutorService } from './openai-tutor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Chapter,
      TutorConversation,
      TutorMessage,
      User,
      Subject,
      AcademicClass,
    ]),
  ],
  controllers: [LearningController, AdminLearningController],
  providers: [LearningService, OpenAiTutorService],
})
export class LearningModule {}

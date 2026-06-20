import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AcademicClass,
  DuelAnswer,
  Question,
  QuizSession,
  Subject,
  User,
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
import { RolesGuard } from '../mvp/auth/roles.guard';
import { AdminInsightsController } from './admin-insights.controller';
import { AdminInsightsService } from './admin-insights.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AcademicClass,
      Subject,
      Question,
      QuizSession,
      DuelAnswer,
      ArenaCompetition,
      ArenaParticipantRegistration,
      ArenaParticipantAnswer,
      CorrespondenceMessage,
      ModerationCase,
      Chapter,
      TutorConversation,
    ]),
  ],
  controllers: [AdminInsightsController],
  providers: [AdminInsightsService, RolesGuard],
})
export class AdminInsightsModule {}

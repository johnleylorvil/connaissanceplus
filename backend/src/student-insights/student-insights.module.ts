import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ArenaCompetition,
  ArenaParticipantAnswer,
  ArenaParticipantRegistration,
  ArenaParticipantScoreAdjustment,
} from '../arena/arena.entities';
import {
  Assignment,
  CorrespondenceMessage,
  CorrespondenceThread,
  Letter,
} from '../correspondence/correspondence.entities';
import {
  DuelAnswer,
  DuelProgress,
  QuizSession,
  Subject,
  User,
} from '../mvp/entities';
import { JwtStrategy } from '../mvp/auth/jwt.strategy';
import { RolesGuard } from '../mvp/auth/roles.guard';
import { StudentDailyRecommendation } from './student-daily-recommendation.entity';
import { StudentInsightsController } from './student-insights.controller';
import { StudentInsightsService } from './student-insights.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'konesans-dev-secret'),
      }),
    }),
    TypeOrmModule.forFeature([
      User,
      Subject,
      QuizSession,
      DuelProgress,
      DuelAnswer,
      ArenaCompetition,
      ArenaParticipantRegistration,
      ArenaParticipantAnswer,
      ArenaParticipantScoreAdjustment,
      Letter,
      Assignment,
      CorrespondenceThread,
      CorrespondenceMessage,
      StudentDailyRecommendation,
    ]),
  ],
  controllers: [StudentInsightsController],
  providers: [StudentInsightsService, JwtStrategy, RolesGuard],
})
export class StudentInsightsModule {}

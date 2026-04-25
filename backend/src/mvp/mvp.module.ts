import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  Answer,
  AcademicClass,
  AdminBroadcast,
  DuelAnswer,
  DuelMatch,
  DuelMatchQuestion,
  DuelProgress,
  DuelScoreEvent,
  Notification,
  Question,
  QuizSession,
  QuizSessionQuestion,
  Subject,
  User,
} from './entities';
import { MvpController } from './mvp.controller';
import { MvpService } from './mvp.service';
import { DuelOralService } from './duel-oral.service';
import { ChimeService } from './chime.service';
import { DuelGateway } from './duel.gateway';
import { JwtStrategy } from './auth/jwt.strategy';
import { GoogleStrategy } from './auth/google.strategy';
import { RolesGuard } from './auth/roles.guard';

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
      AcademicClass,
      Subject,
      Question,
      QuizSession,
      QuizSessionQuestion,
      Answer,
      Notification,
      DuelMatch,
      DuelMatchQuestion,
      DuelProgress,
      DuelAnswer,
      DuelScoreEvent,
      AdminBroadcast,
    ]),
  ],
  controllers: [MvpController],
  providers: [MvpService, DuelOralService, ChimeService, DuelGateway, JwtStrategy, GoogleStrategy, RolesGuard],
})
export class MvpModule {}

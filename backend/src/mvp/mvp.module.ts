import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  Answer,
  AcademicClass,
  AccountVerificationCode,
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
  School,
} from './entities';
import { MvpController } from './mvp.controller';
import { MvpService } from './mvp.service';
import { DuelOralService } from './duel-oral.service';
import { ChimeService } from './chime.service';
import { DuelGateway } from './duel.gateway';
import { GoogleAuthGuard } from './auth/google-auth.guard';
import { JwtStrategy } from './auth/jwt.strategy';
import { GoogleStrategy } from './auth/google.strategy';
import { RolesGuard } from './auth/roles.guard';
import { MailService } from './mail.service';

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
      School,
      AccountVerificationCode,
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
  providers: [MvpService, MailService, DuelOralService, ChimeService, DuelGateway, JwtStrategy, GoogleStrategy, GoogleAuthGuard, RolesGuard],
})
export class MvpModule {}

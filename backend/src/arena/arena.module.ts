import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import {
  ArenaParticipantMessage,
  ArenaCompetition,
  ArenaParticipantRegistration,
  ArenaParticipantScoreAdjustment,
  ArenaParticipantAnswer,
  ArenaRound,
} from './arena.entities';
import { Notification, Question, User } from '../mvp/entities';
import { ArenaController } from './arena.controller';
import { ArenaService } from './arena.service';
import { ArenaGateway } from './arena.gateway';
import { RtcService } from './rtc.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'konesans-dev-secret'),
      }),
    }),
    TypeOrmModule.forFeature([
      ArenaCompetition,
      ArenaParticipantRegistration,
      ArenaRound,
      ArenaParticipantAnswer,
      ArenaParticipantMessage,
      ArenaParticipantScoreAdjustment,
      Question,
      User,
      Notification,
    ]),
  ],
  controllers: [ArenaController],
  providers: [ArenaService, ArenaGateway, RtcService],
  exports: [ArenaService, RtcService],
})
export class ArenaModule {}

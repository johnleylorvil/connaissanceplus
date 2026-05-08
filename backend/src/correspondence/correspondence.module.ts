import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  Assignment,
  ContestSession,
  CorrespondenceMessage,
  CorrespondenceThread,
  CorrespondenceVote,
  Letter,
  ModerationCase,
} from './correspondence.entities';
import { Notification, User } from '../mvp/entities';
import { CorrespondenceService } from './correspondence.service';
import { AdminCorrespondenceController, CorrespondenceController } from './correspondence.controller';
import { JwtStrategy } from '../mvp/auth/jwt.strategy';
import { RolesGuard } from '../mvp/auth/roles.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'konesans-dev-secret',
      }),
    }),
    TypeOrmModule.forFeature([
      ContestSession,
      Letter,
      Assignment,
      CorrespondenceThread,
      CorrespondenceMessage,
      CorrespondenceVote,
      ModerationCase,
      // Re-use shared entities from mvp module.
      User,
      Notification,
    ]),
  ],
  controllers: [CorrespondenceController, AdminCorrespondenceController],
  providers: [CorrespondenceService, JwtStrategy, RolesGuard],
  exports: [CorrespondenceService],
})
export class CorrespondenceModule {}

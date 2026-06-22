import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../mvp/auth/roles.guard';
import {
  AdminSettingsController,
  PublicSettingsController,
} from './platform-settings.controller';
import { PlatformSettings } from './platform-settings.entity';
import { PlatformSettingsService } from './platform-settings.service';

@Global()
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([PlatformSettings])],
  controllers: [AdminSettingsController, PublicSettingsController],
  providers: [PlatformSettingsService, RolesGuard],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}

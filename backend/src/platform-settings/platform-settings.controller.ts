import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../mvp/auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../mvp/auth/roles.guard';
import { UserRole } from '../mvp/entities';
import { UpdatePlatformSettingsDto } from './platform-settings.dto';
import { PlatformSettingsService } from './platform-settings.service';

@Controller('api/settings')
export class PublicSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}
  @Get('public') getPublic() {
    return this.settings.publicSettings();
  }
}

@Controller('api/admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AdminSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}
  @Get() getSettings() {
    return this.settings.get();
  }
  @Patch() update(@Body() dto: UpdatePlatformSettingsDto) {
    return this.settings.update(dto);
  }
  @Get('integrations') integrations() {
    return this.settings.integrationStatus();
  }
}

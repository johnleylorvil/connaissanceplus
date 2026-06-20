import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../mvp/auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../mvp/auth/roles.guard';
import { UserRole } from '../mvp/entities';
import { AdminInsightsService } from './admin-insights.service';

@Controller('api/admin/insights')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminInsightsController {
  constructor(private readonly adminInsightsService: AdminInsightsService) {}

  @Get()
  getInsights() {
    return this.adminInsightsService.getInsights();
  }
}

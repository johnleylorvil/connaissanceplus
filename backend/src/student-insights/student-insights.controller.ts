import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../mvp/auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../mvp/auth/roles.guard';
import { UserRole } from '../mvp/entities';
import { StudentInsightsService } from './student-insights.service';

type AuthenticatedRequest = { user: { id: string } };

@Controller('student/insights')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class StudentInsightsController {
  constructor(private readonly insightsService: StudentInsightsService) {}

  @Get()
  getInsights(@Req() request: AuthenticatedRequest) {
    return this.insightsService.getInsights(request.user.id);
  }
}

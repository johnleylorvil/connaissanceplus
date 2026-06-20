import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../mvp/auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../mvp/auth/roles.guard';
import { UserRole } from '../mvp/entities';
import {
  CreateChapterDto,
  SendTutorMessageDto,
  UpdateChapterDto,
} from './learning.dto';
import { TutorLanguage } from './learning.entities';
import { LearningService } from './learning.service';

type AuthenticatedRequest = { user: { id: string } };

@Controller('api/learning')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Get('curriculum')
  getCurriculum(@Req() request: AuthenticatedRequest) {
    return this.learningService.getCurriculum(request.user.id);
  }

  @Get('chapters/:id')
  getChapter(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.learningService.getStudentChapter(request.user.id, id);
  }

  @Get('chapters/:id/conversation')
  getConversation(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('language', new ParseEnumPipe(TutorLanguage))
    language: TutorLanguage,
  ) {
    return this.learningService.getConversation(request.user.id, id, language);
  }

  @Post('chapters/:id/messages')
  sendMessage(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendTutorMessageDto,
  ) {
    return this.learningService.sendTutorMessage(request.user.id, id, dto);
  }
}

@Controller('api/admin/learning/chapters')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AdminLearningController {
  constructor(private readonly learningService: LearningService) {}

  @Get()
  list(
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.learningService.listAdminChapters(classId, subjectId);
  }

  @Post()
  create(@Body() dto: CreateChapterDto) {
    return this.learningService.createChapter(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChapterDto,
  ) {
    return this.learningService.updateChapter(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.learningService.deleteChapter(id);
  }
}

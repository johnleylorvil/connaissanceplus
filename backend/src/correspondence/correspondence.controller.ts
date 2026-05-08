import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CorrespondenceService } from './correspondence.service';
import {
  CastVoteDto,
  CreateContestSessionDto,
  CreateLetterDto,
  CreateReportDto,
  HandleReportDto,
  PaginationDto,
  SendMessageDto,
  TriggerAssignDto,
  UpdateContestSessionDto,
  UpdateLetterDto,
} from './correspondence.dto';
import { JwtAuthGuard } from '../mvp/auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../mvp/auth/roles.guard';
import { UserRole } from '../mvp/entities';

type AuthenticatedRequest = {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Public / student routes  →  /api/correspondence
// ─────────────────────────────────────────────────────────────────────────────

@Controller('api/correspondence')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CorrespondenceController {
  constructor(private readonly svc: CorrespondenceService) {}

  // ── Sessions ─────────────────────────────────────────────────────────────────

  /** GET /api/correspondence/sessions — list open/published sessions */
  @Get('sessions')
  listSessions() {
    this.svc.assertFeatureEnabled();
    return this.svc.listSessions(false);
  }

  /** GET /api/correspondence/sessions/:id */
  @Get('sessions/:id')
  getSession(@Param('id', ParseUUIDPipe) id: string) {
    this.svc.assertFeatureEnabled();
    return this.svc.getSession(id);
  }

  // ── Letters ───────────────────────────────────────────────────────────────────

  /** POST /api/correspondence/sessions/:id/letters — create a draft letter */
  @Post('sessions/:id/letters')
  createLetter(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateLetterDto,
  ) {
    this.svc.assertFeatureEnabled();
    return this.svc.createLetter(sessionId, req.user.id, dto);
  }

  /** PATCH /api/correspondence/letters/:id — update a draft letter */
  @Patch('letters/:id')
  updateLetter(
    @Param('id', ParseUUIDPipe) letterId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateLetterDto,
  ) {
    this.svc.assertFeatureEnabled();
    return this.svc.updateLetter(letterId, req.user.id, dto);
  }

  /** POST /api/correspondence/letters/:id/submit — lock and submit a letter */
  @Post('letters/:id/submit')
  submitLetter(
    @Param('id', ParseUUIDPipe) letterId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.svc.assertFeatureEnabled();
    return this.svc.submitLetter(letterId, req.user.id);
  }

  /** GET /api/correspondence/me/letters — my letters (across all sessions) */
  @Get('me/letters')
  myLetters(
    @Req() req: AuthenticatedRequest,
    @Query('sessionId') sessionId?: string,
  ) {
    this.svc.assertFeatureEnabled();
    return this.svc.getMyLetters(req.user.id, sessionId);
  }

  // ── Inbox / Assignments ───────────────────────────────────────────────────────

  /** GET /api/correspondence/me/inbox */
  @Get('me/inbox')
  inbox(@Req() req: AuthenticatedRequest) {
    this.svc.assertFeatureEnabled();
    return this.svc.getInbox(req.user.id);
  }

  /** POST /api/correspondence/assignments/:id/open */
  @Post('assignments/:id/open')
  openAssignment(
    @Param('id', ParseUUIDPipe) assignmentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.svc.assertFeatureEnabled();
    return this.svc.openAssignment(assignmentId, req.user.id);
  }

  // ── Threads & messages ────────────────────────────────────────────────────────

  /** GET /api/correspondence/threads/:id */
  @Get('threads/:id')
  getThread(
    @Param('id', ParseUUIDPipe) threadId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.svc.assertFeatureEnabled();
    return this.svc.getThread(threadId, req.user.id);
  }

  /** POST /api/correspondence/threads/:id/messages */
  @Post('threads/:id/messages')
  sendMessage(
    @Param('id', ParseUUIDPipe) threadId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: SendMessageDto,
  ) {
    this.svc.assertFeatureEnabled();
    return this.svc.sendMessage(threadId, req.user.id, dto);
  }

  // ── Votes ─────────────────────────────────────────────────────────────────────

  /** POST /api/correspondence/sessions/:id/votes */
  @Post('sessions/:id/votes')
  castVote(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: CastVoteDto,
  ) {
    this.svc.assertFeatureEnabled();
    return this.svc.castVote(sessionId, req.user.id, dto);
  }

  /** GET /api/correspondence/sessions/:id/results */
  @Get('sessions/:id/results')
  results(@Param('id', ParseUUIDPipe) sessionId: string) {
    this.svc.assertFeatureEnabled();
    return this.svc.computeResults(sessionId);
  }

  // ── Reports ───────────────────────────────────────────────────────────────────

  /** POST /api/correspondence/reports */
  @Post('reports')
  createReport(@Req() req: AuthenticatedRequest, @Body() dto: CreateReportDto) {
    this.svc.assertFeatureEnabled();
    return this.svc.createReport(req.user.id, dto);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin routes  →  /api/admin/correspondence
// ─────────────────────────────────────────────────────────────────────────────

@Controller('api/admin/correspondence')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AdminCorrespondenceController {
  constructor(private readonly svc: CorrespondenceService) {}

  // ── Sessions ─────────────────────────────────────────────────────────────────

  /** GET /api/admin/correspondence/sessions — all sessions including drafts */
  @Get('sessions')
  listAll() {
    this.svc.assertFeatureEnabled();
    return this.svc.listSessions(true);
  }

  /** POST /api/admin/correspondence/sessions */
  @Post('sessions')
  createSession(@Req() req: AuthenticatedRequest, @Body() dto: CreateContestSessionDto) {
    this.svc.assertFeatureEnabled();
    return this.svc.createSession(dto, req.user.id);
  }

  /** PATCH /api/admin/correspondence/sessions/:id */
  @Patch('sessions/:id')
  updateSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContestSessionDto,
  ) {
    this.svc.assertFeatureEnabled();
    return this.svc.updateSession(id, dto);
  }

  // ── Batch assign job trigger ──────────────────────────────────────────────────

  /** POST /api/admin/correspondence/jobs/assign */
  @Post('jobs/assign')
  triggerAssign(@Body() dto: TriggerAssignDto) {
    this.svc.assertFeatureEnabled();
    return this.svc.assignLetters(dto.sessionId);
  }

  /** POST /api/admin/correspondence/jobs/results */
  @Post('jobs/results')
  triggerResults(@Body() dto: TriggerAssignDto) {
    this.svc.assertFeatureEnabled();
    return this.svc.computeResults(dto.sessionId);
  }

  // ── Moderation dashboard ──────────────────────────────────────────────────────

  /** GET /api/admin/correspondence/reports?status=pending */
  @Get('reports')
  listReports(@Query('status') status?: string) {
    this.svc.assertFeatureEnabled();
    return this.svc.listReports(status);
  }

  /** PATCH /api/admin/correspondence/reports/:id */
  @Patch('reports/:id')
  handleReport(
    @Param('id', ParseUUIDPipe) caseId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: HandleReportDto,
  ) {
    this.svc.assertFeatureEnabled();
    return this.svc.handleReport(caseId, req.user.id, dto.action);
  }
}

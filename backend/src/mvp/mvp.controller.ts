import {
  BadRequestException,
  Body,
  Delete,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  BootstrapAdminDto,
  CreateClassDto,
  CreateModeratorDto,
  CreateOralDuelDto,
  CreateQuestionDto,
  CreateSubjectDto,
  DuelAnswerDto,
  JoinMatchmakingDto,
  LoginDto,
  ListAdminUsersDto,
  OtpResendDto,
  OtpVerificationDto,
  OralScoreDto,
  RegisterStudentDto,
  SendBroadcastDto,
  StartQuizDto,
  SuspendUserDto,
  SubmitQuizDto,
  UpdateProfileDto,
} from './dto/mvp.dto';
import { MvpService } from './mvp.service';
import { DuelOralService } from './duel-oral.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { GoogleAuthGuard } from './auth/google-auth.guard';
import { Roles, RolesGuard } from './auth/roles.guard';
import { UserRole } from './entities';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import type { Response } from 'express';

type AuthenticatedRequest = {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
  protocol?: string;
  get?: (name: string) => string | undefined;
};

type UploadedAvatarFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

@Controller('api')
export class MvpController {
  constructor(
    private readonly mvpService: MvpService,
    private readonly duelOralService: DuelOralService,
  ) {}

  @Post('auth/bootstrap-admin')
  bootstrapAdmin(@Body() dto: BootstrapAdminDto) {
    return this.mvpService.bootstrapAdmin(dto);
  }

  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.mvpService.login(dto);
  }

  @Get('auth/google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Initiates Google OAuth redirect — handled by Passport
  }

  @Get('auth/google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: { user: { accessToken: string } },
    @Res() res: Response,
  ) {
    const frontendUrl = this.mvpService.getFrontendUrl();
    res.redirect(`${frontendUrl}/oauth/callback?token=${req.user.accessToken}`);
  }

  @UseGuards(JwtAuthGuard)
  @Get('auth/me')
  me(@Req() request: AuthenticatedRequest) {
    return this.mvpService.findProfile(request.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('auth/profile')
  updateProfile(@Req() request: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.mvpService.updateProfile(request.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('auth/profile/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(new BadRequestException('Only image uploads are allowed'), false);
          return;
        }
        callback(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadAvatar(@Req() request: AuthenticatedRequest, @UploadedFile() file: UploadedAvatarFile | undefined) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    const extension = extname(file.originalname).toLowerCase() || '.jpg';
    const filename = `avatar-${request.user.id}-${Date.now()}-${randomUUID()}${extension}`;
    const dir = join(process.cwd(), 'uploads', 'avatars');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), file.buffer);

    const host = request.get?.('host') ?? 'localhost:3000';
    const protocol = request.protocol ?? 'http';
    const avatarUrl = `${protocol}://${host}/uploads/avatars/${filename}`;
    return this.mvpService.updateAvatar(request.user.id, avatarUrl);
  }

  @UseGuards(JwtAuthGuard)
  @Get('notifications')
  getNotifications(@Req() request: AuthenticatedRequest) {
    return this.mvpService.getNotifications(request.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('notifications/:id/read')
  markRead(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.mvpService.markNotificationRead(request.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('notifications/read-all')
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.mvpService.markAllNotificationsRead(request.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('notifications/:id')
  deleteNotification(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.mvpService.deleteNotification(request.user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Get('quizzes/history')
  getQuizHistory(@Req() request: AuthenticatedRequest) {
    return this.mvpService.getQuizHistory(request.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/stats')
  getAdminStats() {
    return this.mvpService.getAdminStats();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/students')
  getStudents() {
    return this.mvpService.getStudents();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/users')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  getUsers(@Query() query: ListAdminUsersDto) {
    return this.mvpService.getUsers(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/users/:id/suspend')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  suspendUser(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: SuspendUserDto) {
    return this.mvpService.suspendUser(request.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/users/:id/reactivate')
  reactivateUser(@Param('id') id: string) {
    return this.mvpService.reactivateUser(id);
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/broadcast')
  sendBroadcast(@Req() request: AuthenticatedRequest, @Body() dto: SendBroadcastDto) {
    return this.mvpService.sendBroadcast(request.user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/broadcasts')
  getBroadcasts() {
    return this.mvpService.getBroadcasts();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/moderators')
  listModerators() {
    return this.mvpService.listModerators();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/moderators')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  createModerator(@Body() dto: CreateModeratorDto) {
    return this.mvpService.requestModeratorCreationOtp(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/moderators/verify-otp')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  verifyModeratorCreationOtp(@Body() dto: OtpVerificationDto) {
    return this.mvpService.verifyModeratorCreationOtp(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/moderators/resend-otp')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  resendModeratorCreationOtp(@Body() dto: OtpResendDto) {
    return this.mvpService.resendModeratorCreationOtp(dto);
  }

  @Post('students/register')
  registerStudent(@Body() dto: RegisterStudentDto) {
    return this.mvpService.requestStudentRegistrationOtp(dto);
  }

  @Post('students/register/request-otp')
  requestStudentRegistrationOtp(@Body() dto: RegisterStudentDto) {
    return this.mvpService.requestStudentRegistrationOtp(dto);
  }

  @Post('students/register/verify-otp')
  verifyStudentRegistrationOtp(@Body() dto: OtpVerificationDto) {
    return this.mvpService.verifyStudentRegistrationOtp(dto);
  }

  @Post('students/register/resend-otp')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  resendStudentRegistrationOtp(@Body() dto: OtpResendDto) {
    return this.mvpService.resendStudentRegistrationOtp(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('classes')
  @Post('levels')
  createClass(@Body() dto: CreateClassDto) {
    return this.mvpService.createClass(dto);
  }

  @Get('classes')
  @Get('levels')
  findClasses() {
    return this.mvpService.findClasses();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('subjects')
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.mvpService.createSubject(dto);
  }

  @Get('subjects')
  findSubjects(@Query('classId') classId?: string, @Query('levelId') legacyClassId?: string) {
    return this.mvpService.findSubjects(classId ?? legacyClassId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('questions')
  createQuestion(@Body() dto: CreateQuestionDto) {
    return this.mvpService.createQuestion(dto);
  }

  @Get('questions')
  findQuestions(
    @Query('classId') classId?: string,
    @Query('levelId') legacyClassId?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.mvpService.findQuestions(classId ?? legacyClassId, subjectId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Post('quizzes/start')
  startQuiz(@Req() request: AuthenticatedRequest, @Body() dto: StartQuizDto) {
    return this.mvpService.startQuiz(request.user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Post('quizzes/:sessionId/submit')
  submitQuiz(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.mvpService.submitQuiz(request.user.id, sessionId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Post('duels/matchmaking/join')
  joinDuelMatchmaking(@Req() request: AuthenticatedRequest, @Body() dto: JoinMatchmakingDto) {
    return this.mvpService.joinDuelMatchmaking(request.user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Delete('duels/matchmaking/cancel')
  cancelDuelMatchmaking(@Req() request: AuthenticatedRequest) {
    return this.mvpService.cancelMatchmaking(request.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Post('duels/:duelId/abandon')
  abandonDuel(@Req() request: AuthenticatedRequest, @Param('duelId') duelId: string) {
    return this.mvpService.abandonDuel(request.user.id, duelId);
  }
  @UseGuards(JwtAuthGuard)
  @Get('duels/:duelId/state')
  async getDuelState(@Req() request: AuthenticatedRequest, @Param('duelId') duelId: string) {
    if (await this.duelOralService.isOralLiveDuel(duelId)) {
      return this.duelOralService.getPublicState(request.user.id, duelId);
    }

    return this.mvpService.getDuelState(request.user.id, duelId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Post('duels/:duelId/buzz')
  buzzDuel(@Req() request: AuthenticatedRequest, @Param('duelId') duelId: string) {
    return this.mvpService.buzzDuel(request.user.id, duelId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Post('duels/:duelId/answer')
  submitDuelAnswer(
    @Req() request: AuthenticatedRequest,
    @Param('duelId') duelId: string,
    @Body() dto: DuelAnswerDto,
  ) {
    return this.mvpService.submitDuelAnswer(request.user.id, duelId, dto);
  }

  @Get('leaderboard/weekly')
  getWeeklyLeaderboard(@Query('classId') classId?: string, @Query('levelId') legacyClassId?: string) {
    return this.mvpService.getWeeklyLeaderboard(classId ?? legacyClassId);
  }

  // ── Oral Live Duel endpoints ────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Post('duels/oral')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  createOralDuel(@Body() dto: CreateOralDuelDto) {
    return this.duelOralService.createOralDuel(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Post('duels/:duelId/oral/start')
  startOralLive(
    @Req() request: AuthenticatedRequest,
    @Param('duelId') duelId: string,
  ) {
    return this.duelOralService.startOralLive(request.user.id, duelId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('duels/:duelId/oral/join')
  joinOralLive(
    @Req() request: AuthenticatedRequest,
    @Param('duelId') duelId: string,
  ) {
    return this.duelOralService.joinOralLive(request.user.id, duelId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('duels/:duelId/oral/score')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  scoreOralLive(
    @Req() request: AuthenticatedRequest,
    @Param('duelId') duelId: string,
    @Body() dto: OralScoreDto,
  ) {
    return this.duelOralService.scoreOralLive(request.user.id, duelId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('duels/:duelId/oral/end')
  endOralLive(
    @Req() request: AuthenticatedRequest,
    @Param('duelId') duelId: string,
  ) {
    return this.duelOralService.endOralLive(request.user.id, duelId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('duels/:duelId/oral/state')
  getOralDuelState(
    @Req() request: AuthenticatedRequest,
    @Param('duelId') duelId: string,
  ) {
    return this.duelOralService.getPublicState(request.user.id, duelId);
  }
}

import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BroadcastTargetType, Difficulty, DuelMode, OptionChoice, UserRole } from '../entities';
import { HAITI_DEPARTMENTS } from '../constants/haiti-geography';

export class CreateModeratorDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  password?: string;

  @IsBoolean()
  @IsOptional()
  generatePassword?: boolean;
}

export class ListAdminUsersDto {
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsIn(['active', 'suspended'])
  @IsOptional()
  status?: 'active' | 'suspended';

  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @IsIn(['team'])
  @IsOptional()
  scope?: 'team';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize = 25;
}

export class SuspendUserDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
}
export class RegisterStudentDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsUUID()
  classId: string;

  @IsString()
  @IsOptional()
  school?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  @IsIn(HAITI_DEPARTMENTS)
  department?: string;

  @IsString()
  @IsOptional()
  sectionName?: string;

  @IsBoolean()
  canBeContacted: boolean;

  @IsBoolean()
  acceptedPrivacyPolicy: boolean;
}

export class LoginDto {
  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class BootstrapAdminDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  setupKey: string;
}

export class OtpVerificationDto {
  @IsUUID()
  verificationId: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;
}

export class OtpResendDto {
  @IsUUID()
  verificationId: string;
}

export class CreateClassDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateSubjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  classId: string;
}

export class CreateQuestionDto {
  @IsUUID()
  classId: string;

  @IsUUID()
  subjectId: string;

  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsNotEmpty()
  optionA: string;

  @IsString()
  @IsNotEmpty()
  optionB: string;

  @IsString()
  @IsNotEmpty()
  optionC: string;

  @IsString()
  @IsNotEmpty()
  optionD: string;

  @IsEnum(OptionChoice)
  correctOption: OptionChoice;

  @IsEnum(Difficulty)
  difficulty: Difficulty;

  @IsString()
  @IsOptional()
  explanation?: string;
}

export class StartQuizDto {
  @IsUUID()
  subjectId: string;
}

export class AnswerInputDto {
  @IsUUID()
  sessionQuestionId: string;

  @IsEnum(OptionChoice)
  selectedOption: OptionChoice;
}

export class SubmitQuizDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerInputDto)
  answers: AnswerInputDto[];
}

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  school?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  @IsIn(HAITI_DEPARTMENTS)
  department?: string;

  @IsString()
  @IsOptional()
  sectionName?: string;

  @IsBoolean()
  @IsOptional()
  canBeContacted?: boolean;

  @IsString()
  @IsIn(['fr', 'ht'])
  @IsOptional()
  preferredTutorLanguage?: 'fr' | 'ht';

  @IsBoolean()
  @IsOptional()
  notificationsEnabled?: boolean;

  @IsUUID()
  @IsOptional()
  classId?: string;

  @IsBoolean()
  @IsOptional()
  acceptedPrivacyPolicy?: boolean;

  @IsString()
  @MinLength(6)
  @IsOptional()
  newPassword?: string;

  @IsString()
  @IsOptional()
  currentPassword?: string;
}

export class JoinMatchmakingDto {
  @IsUUID()
  subjectId: string;
}

export class DuelAnswerDto {
  @IsUUID()
  duelQuestionId: string;

  @IsOptional()
  @IsEnum(OptionChoice)
  selectedOption?: OptionChoice;
}

export class SendBroadcastDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEnum(BroadcastTargetType)
  @IsOptional()
  targetType?: BroadcastTargetType;

  @IsString()
  @IsOptional()
  targetId?: string;

  @IsUUID()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  @IsIn(HAITI_DEPARTMENTS)
  department?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  sectionName?: string;
}

// ── Oral Live Duel DTOs ─────────────────────────────────────────────────────

export class CreateOralDuelDto {
  @IsEnum(DuelMode)
  @IsOptional()
  mode?: DuelMode;

  @IsUUID()
  playerOneId: string;

  @IsUUID()
  playerTwoId: string;

  @IsString()
  @IsNotEmpty()
  competitionId: string;

  @IsString()
  @IsNotEmpty()
  competitionName: string;
}

export enum OralScoreTarget {
  A = 'A',
  B = 'B',
  BOTH = 'BOTH',
  NONE = 'NONE',
}

export class OralScoreDto {
  @IsEnum(OralScoreTarget)
  awardedTo: OralScoreTarget;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(10)
  points?: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

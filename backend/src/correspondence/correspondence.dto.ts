import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContestSessionStatus, ModerationTargetType } from './correspondence.entities';

// ─────────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────────

export class ContestSessionRulesDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxLettersPerUser?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxLettersReceived?: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(500)
  minBodyLength?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(50000)
  maxBodyLength?: number;

  @IsOptional()
  @IsBoolean()
  allowVoting?: boolean;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  avoidRecentPairingDays?: number;
}

export class CreateContestSessionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  themePrompt: string;

  @IsISO8601()
  startAt: string;

  @IsISO8601()
  endAt: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  gracePeriodHours?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContestSessionRulesDto)
  rules?: ContestSessionRulesDto;
}

export class UpdateContestSessionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  themePrompt?: string;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  gracePeriodHours?: number;

  @IsOptional()
  @IsEnum(ContestSessionStatus)
  status?: ContestSessionStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContestSessionRulesDto)
  rules?: ContestSessionRulesDto;
}

// ─────────────────────────────────────────────────────────────────────────────
// Letters
// ─────────────────────────────────────────────────────────────────────────────

export class CreateLetterDto {
  @IsString()
  @IsNotEmpty()
  body: string;

  @IsOptional()
  metadata?: { mood?: string; tags?: string[] };
}

export class UpdateLetterDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  body?: string;

  @IsOptional()
  metadata?: { mood?: string; tags?: string[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────────

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  body: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Votes
// ─────────────────────────────────────────────────────────────────────────────

export class CastVoteDto {
  @IsUUID()
  letterId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  score?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────────────

export class CreateReportDto {
  @IsEnum(ModerationTargetType)
  targetType: ModerationTargetType;

  @IsUUID()
  targetId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  details?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────

export class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin moderation action
// ─────────────────────────────────────────────────────────────────────────────

export class HandleReportDto {
  @IsEnum(['handle', 'dismiss'])
  action: 'handle' | 'dismiss';
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin batch-assign trigger
// ─────────────────────────────────────────────────────────────────────────────

export class TriggerAssignDto {
  @IsUUID()
  sessionId: string;
}

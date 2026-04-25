import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ArenaParticipantRegistrationStatus } from './arena.entities';

// ─── Competition (Admin) ──────────────────────

export class CreateArenaCompetitionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(1)
  @Max(30)
  questionCount: number;

  @IsInt()
  @Min(10)
  @Max(120)
  secondsPerQuestion: number;

  @IsDateString()
  scheduledAt: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class ReviewParticipantRegistrationDto {
  @IsUUID()
  registrationId: string;

  @IsEnum(ArenaParticipantRegistrationStatus)
  status: ArenaParticipantRegistrationStatus;
}

export class SetWinnerDto {
  @IsUUID()
  participantUserId: string;
}


// ─── Registration ─────────────────────────────

export class RegisterParticipantDto {
  @IsUUID()
  competitionId: string;
}

export class ScoreRoundDto {
  @IsString()
  @IsNotEmpty()
  result: 'A' | 'B' | 'BOTH' | 'NONE';
}

export type MatchLiveRole = 'competitorA' | 'competitorB' | 'moderator' | 'spectator';

// ─── Chat ─────────────────────────────────────

export class SendChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message: string;
}
// ─── Moderator ───────────────────────────────────────────

export class AssignModeratorDto {
  @IsUUID()
  userId: string;
}

// ─── Admin Live Actions ─────────────────────────────────

export class AdjustScoreDto {
  @IsUUID()
  participantUserId: string;

  @IsInt()
  @Min(-5000)
  @Max(5000)
  pointsDelta: number;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  reason?: string;
}

export class DisqualifyParticipantDto {
  @IsString()
  @IsOptional()
  @MaxLength(300)
  reason?: string;
}

// ─── RTC / Broadcast / Viewer ─────────────────────────────────────────────

export class ViewerPingDto {
  @IsUUID()
  viewerId: string;
}
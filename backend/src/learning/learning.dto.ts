import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ChapterStatus, TutorLanguage } from './learning.entities';

export class CreateChapterDto {
  @IsUUID()
  subjectId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  summary: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  content: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;

  @IsEnum(ChapterStatus)
  @IsOptional()
  status?: ChapterStatus;
}

export class UpdateChapterDto {
  @IsUUID()
  @IsOptional()
  subjectId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  @IsOptional()
  summary?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  @IsOptional()
  content?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;

  @IsEnum(ChapterStatus)
  @IsOptional()
  status?: ChapterStatus;
}

export class SendTutorMessageDto {
  @IsEnum(TutorLanguage)
  language: TutorLanguage;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SponsorsService } from './sponsors.service';
import { JwtAuthGuard } from '../mvp/auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../mvp/auth/roles.guard';
import { UserRole } from '../mvp/entities';
import { CreateSponsorDto, UpdateSponsorDto } from './sponsors.dto';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

type UploadedSponsorFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

@Controller('api')
export class SponsorsController {
  private readonly s3Client?: S3Client;
  private readonly sponsorBucketName?: string;
  private readonly sponsorPublicBaseUrl?: string;

  constructor(
    private readonly sponsorsService: SponsorsService,
    private readonly configService: ConfigService,
  ) {
    this.sponsorBucketName = this.configService.get<string>('SPONSOR_UPLOADS_S3_BUCKET');
    this.sponsorPublicBaseUrl = this.configService
      .get<string>('SPONSOR_UPLOADS_PUBLIC_BASE_URL')
      ?.replace(/\/+$/, '');

    if (this.sponsorBucketName) {
      this.s3Client = new S3Client({
        region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
      });
    }
  }

  @Get('public/sponsors')
  getPublicSponsors() {
    return this.sponsorsService.getPublicSponsors();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/sponsors')
  getAdminSponsors() {
    return this.sponsorsService.getAdminSponsors();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/sponsors/logo-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(new BadRequestException('Only image uploads are allowed'), false);
          return;
        }
        callback(null, true);
      },
      storage: undefined,
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async uploadSponsorLogo(@UploadedFile() file: UploadedSponsorFile | undefined) {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }

    const extension = extname(file.originalname).toLowerCase();
    const filename = `sponsor-${Date.now()}-${randomUUID()}${extension}`;

    // ── Path 1: S3 ──────────────────────────────────────────────────────────
    if (this.s3Client && this.sponsorBucketName && this.sponsorPublicBaseUrl) {
      const key = `sponsors/${filename}`;
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.sponsorBucketName,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new InternalServerErrorException(`Échec du téléversement S3 : ${msg}`);
      }
      return { logoUrl: `${this.sponsorPublicBaseUrl}/${key}` };
    }

    // ── Path 2: local disk (fallback when S3 not configured) ─────────────────
    if (this.sponsorPublicBaseUrl) {
      const dir = join(process.cwd(), 'uploads', 'sponsors');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, filename), file.buffer);
      return { logoUrl: `${this.sponsorPublicBaseUrl}/sponsors/${filename}` };
    }

    throw new BadRequestException(
      'Upload non configuré. Définissez SPONSOR_UPLOADS_PUBLIC_BASE_URL dans le fichier .env.',
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/sponsors')
  createAdminSponsor(@Body() dto: CreateSponsorDto) {
    return this.sponsorsService.createAdminSponsor(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/sponsors/:id')
  updateAdminSponsor(@Param('id') id: string, @Body() dto: UpdateSponsorDto) {
    return this.sponsorsService.updateAdminSponsor(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/sponsors/:id')
  deleteAdminSponsor(@Param('id') id: string) {
    return this.sponsorsService.deleteAdminSponsor(id);
  }
}

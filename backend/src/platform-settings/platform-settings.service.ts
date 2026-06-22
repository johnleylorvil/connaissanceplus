import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdatePlatformSettingsDto } from './platform-settings.dto';
import { PlatformSettings } from './platform-settings.entity';

const DEFAULT_ID = 'default';

@Injectable()
export class PlatformSettingsService implements OnModuleInit {
  private current: PlatformSettings;

  constructor(
    @InjectRepository(PlatformSettings)
    private readonly repo: Repository<PlatformSettings>,
    private readonly config: ConfigService,
  ) {
    this.current = this.defaults();
  }

  async onModuleInit() {
    const stored = await this.repo.findOne({ where: { id: DEFAULT_ID } });
    this.current =
      stored ?? (await this.repo.save(this.repo.create(this.defaults())));
  }

  get() {
    return this.current;
  }

  async update(dto: UpdatePlatformSettingsDto) {
    const next = this.repo.merge(this.current, dto, { id: DEFAULT_ID });
    next.organizationName = next.organizationName.trim();
    next.country = next.country.trim();
    next.timezone = next.timezone.trim();
    next.legalName = next.legalName?.trim() || null;
    next.supportEmail = next.supportEmail?.trim() || null;
    next.websiteUrl = next.websiteUrl?.trim() || null;
    next.logoUrl = next.logoUrl?.trim() || null;
    this.current = await this.repo.save(next);
    return this.current;
  }

  assertPassword(password: string) {
    if (password.length < this.current.minimumPasswordLength) {
      throw new BadRequestException(
        `Le mot de passe doit contenir au moins ${this.current.minimumPasswordLength} caractères.`,
      );
    }
  }

  publicSettings() {
    const value = this.current;
    return {
      organizationName: value.organizationName,
      supportEmail: value.supportEmail,
      websiteUrl: value.websiteUrl,
      country: value.country,
      timezone: value.timezone,
      logoUrl: value.logoUrl,
      features: {
        registration: value.registrationEnabled,
        tutor: value.tutorEnabled,
        correspondence: value.correspondenceEnabled,
        notifications: value.notificationsEnabled,
      },
    };
  }

  integrationStatus() {
    const check = (keys: string[]) => {
      const missing = keys.filter(
        (key) => !this.config.get<string>(key)?.trim(),
      );
      return { configured: missing.length === 0, missing };
    };
    return {
      openai: check(['OPENAI_API_KEY', 'OPENAI_MODEL']),
      google: check([
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_CALLBACK_URL',
      ]),
      email: check(['SMTP_HOST', 'SMTP_FROM']),
      sponsorStorage: check(['SPONSOR_UPLOADS_S3_BUCKET', 'AWS_REGION']),
      livekit: check(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']),
      youtube: check(['ARENA_YOUTUBE_RTMP_URL']),
      generatedAt: new Date().toISOString(),
    };
  }

  private defaults(): PlatformSettings {
    const correspondenceEnv = this.config
      .get<string>('FEATURE_CORRESPONDENCE_CONTEST', 'false')
      .trim()
      .toLowerCase();
    return {
      id: DEFAULT_ID,
      organizationName: 'Konesans+',
      legalName: null,
      supportEmail: null,
      websiteUrl: null,
      country: 'Haïti',
      timezone: 'America/Port-au-Prince',
      logoUrl: null,
      minimumPasswordLength: 8,
      registrationEnabled: true,
      tutorEnabled: true,
      correspondenceEnabled: ['1', 'true', 'yes', 'on'].includes(
        correspondenceEnv,
      ),
      notificationsEnabled: true,
      updatedAt: new Date(),
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { MvpService } from '../mvp.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly mvpService: MvpService,
  ) {
    const clientId = configService.get<string>('GOOGLE_CLIENT_ID', '').trim();
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET', '').trim();
    const configuredCallbackUrl = configService.get<string>('GOOGLE_CALLBACK_URL', '').trim();
    const callbackUrl = configuredCallbackUrl || `http://localhost:${configService.get<string>('PORT', '3000')}/api/auth/google/callback`;
    const isConfigured = !!clientId && !!clientSecret;

    super({
      clientID: clientId || 'google-oauth-disabled',
      clientSecret: clientSecret || 'google-oauth-disabled',
      callbackURL: callbackUrl,
      scope: ['email', 'profile'],
    });

    if (!isConfigured) {
      this.logger.warn('Google OAuth disabled: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.');
    }
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ) {
    return this.mvpService.googleAuth(profile);
  }
}

import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { VerificationPurpose } from './entities';

type SendOtpEmailInput = {
  email: string;
  firstName: string;
  code: string;
  purpose: VerificationPurpose;
  expiresInMinutes: number;
  temporaryPassword?: string | null;
};

@Injectable()
export class MailService {
  constructor(private readonly configService: ConfigService) {}

  async sendOtpEmail(input: SendOtpEmailInput) {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const from = this.configService.get<string>('SMTP_FROM')?.trim();

    if (!host || !from) {
      throw new ServiceUnavailableException("L'envoi des emails OTP n'est pas configure.");
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(this.configService.get<string>('SMTP_PORT', '587')),
      secure: ['1', 'true', 'yes', 'on'].includes(
        String(this.configService.get<string>('SMTP_SECURE', 'false')).toLowerCase(),
      ),
      auth: this.configService.get<string>('SMTP_USER')
        ? {
            user: this.configService.get<string>('SMTP_USER'),
            pass: this.configService.get<string>('SMTP_PASS'),
          }
        : undefined,
    });

    const purposeLabel =
      input.purpose === VerificationPurpose.STUDENT_REGISTRATION
        ? 'confirmer votre inscription etudiant'
        : 'confirmer la creation de votre compte moderateur';
    const appName = this.configService.get<string>('MAIL_APP_NAME', 'Konesans+');
    const temporaryPasswordBlock = input.temporaryPassword
      ? `\nMot de passe temporaire: ${input.temporaryPassword}\n`
      : '';

    await transporter.sendMail({
      from,
      to: input.email,
      subject: `${appName} - Code OTP`,
      text: `Bonjour ${input.firstName},\n\nUtilisez ce code OTP pour ${purposeLabel}: ${input.code}\n\nCe code expire dans ${input.expiresInMinutes} minutes.${temporaryPasswordBlock}\nSi vous n'etes pas a l'origine de cette demande, ignorez cet email.`,
      html: `<p>Bonjour ${input.firstName},</p><p>Utilisez ce code OTP pour ${purposeLabel} :</p><p style="font-size:28px;font-weight:700;letter-spacing:0.2em">${input.code}</p><p>Ce code expire dans ${input.expiresInMinutes} minutes.</p>${input.temporaryPassword ? `<p>Mot de passe temporaire : <strong>${input.temporaryPassword}</strong></p>` : ''}<p>Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</p>`,
    });
  }
}
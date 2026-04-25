import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  DeleteMeetingCommand,
  Meeting,
  Attendee,
} from '@aws-sdk/client-chime-sdk-meetings';

export interface ChimeJoinInfo {
  meeting: Meeting;
  attendee: Attendee;
}

@Injectable()
export class ChimeService {
  private readonly logger = new Logger(ChimeService.name);
  private readonly client: ChimeSDKMeetingsClient;
  private readonly mediaRegion: string;

  constructor(private readonly configService: ConfigService) {
    const region = configService.get<string>('AWS_REGION', 'us-east-1');
    this.mediaRegion = configService.get<string>('CHIME_MEDIA_REGION', region);

    this.client = new ChimeSDKMeetingsClient({
      region,
      credentials: this.resolveCredentials(),
    });
  }

  // ── Meeting management ────────────────────────────────────────────────

  /**
   * Creates a meeting for the given duel, or retrieves already-created one
   * if Chime returns idempotency via ClientRequestToken.
   * ClientRequestToken is duel-scoped so retries are safe.
   */
  async createMeeting(duelId: string): Promise<Meeting> {
    const command = new CreateMeetingCommand({
      ClientRequestToken: `duel-${duelId}`,
      MediaRegion: this.mediaRegion,
      ExternalMeetingId: `konesans-duel-${duelId}`,
    });

    const response = await this.client.send(command);
    if (!response.Meeting) {
      throw new Error(`Chime did not return a Meeting for duel ${duelId}`);
    }

    this.logger.log(`Meeting created: ${response.Meeting.MeetingId} for duel ${duelId}`);
    return response.Meeting;
  }

  /**
   * Creates an attendee for the given meetingId + userId.
   * ExternalUserId binds the attendee to the Konesans user; never logged.
   */
  async createAttendee(meetingId: string, userId: string): Promise<Attendee> {
    const command = new CreateAttendeeCommand({
      MeetingId: meetingId,
      ExternalUserId: userId,
    });

    const response = await this.client.send(command);
    if (!response.Attendee) {
      throw new Error(`Chime did not return an Attendee for meetingId ${meetingId}`);
    }

    // Intentionally NOT logging JoinToken — it's a secret credential
    this.logger.log(
      `Attendee created: ${response.Attendee.AttendeeId} for meeting ${meetingId}`,
    );
    return response.Attendee;
  }

  /**
   * Deletes the meeting in Chime. Call at match end to free resources.
   * Failures are warned, not thrown, so match finalization cannot be blocked.
   */
  async deleteMeeting(meetingId: string): Promise<void> {
    try {
      await this.client.send(new DeleteMeetingCommand({ MeetingId: meetingId }));
      this.logger.log(`Meeting deleted: ${meetingId}`);
    } catch (err) {
      this.logger.warn(`Failed to delete Chime meeting ${meetingId}: ${(err as Error).message}`);
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private resolveCredentials():
    | { accessKeyId: string; secretAccessKey: string }
    | undefined {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    if (accessKeyId && secretAccessKey) {
      return { accessKeyId, secretAccessKey };
    }

    // Fall through to SDK default credential chain (IAM role / profile / env)
    return undefined;
  }
}

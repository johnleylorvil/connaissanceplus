import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Not, Repository } from 'typeorm';
import {
  Assignment,
  ContestSession,
  ContestSessionRules,
  ContestSessionStatus,
  CorrespondenceMessage,
  CorrespondenceThread,
  CorrespondenceVote,
  Letter,
  LetterStatus,
  ModerationCase,
  ModerationCaseStatus,
  ModerationTargetType,
} from './correspondence.entities';
import { Notification, User } from '../mvp/entities';
import {
  CastVoteDto,
  CreateContestSessionDto,
  CreateLetterDto,
  CreateReportDto,
  SendMessageDto,
  UpdateContestSessionDto,
  UpdateLetterDto,
} from './correspondence.dto';

// ─────────────────────────────────────────────────────────────────────────────

/** Fallback defaults when the session rules JSON is missing a field. */
export const DEFAULT_RULES: ContestSessionRules = {
  maxLettersPerUser: 1,
  maxLettersReceived: 1,
  minBodyLength: 500,
  maxBodyLength: 5000,
  allowVoting: false,
  avoidRecentPairingDays: 0,
};

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class CorrespondenceService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ContestSession) private readonly sessionRepo: Repository<ContestSession>,
    @InjectRepository(Letter) private readonly letterRepo: Repository<Letter>,
    @InjectRepository(Assignment) private readonly assignmentRepo: Repository<Assignment>,
    @InjectRepository(CorrespondenceThread) private readonly threadRepo: Repository<CorrespondenceThread>,
    @InjectRepository(CorrespondenceMessage) private readonly messageRepo: Repository<CorrespondenceMessage>,
    @InjectRepository(CorrespondenceVote) private readonly voteRepo: Repository<CorrespondenceVote>,
    @InjectRepository(ModerationCase) private readonly moderationRepo: Repository<ModerationCase>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Notification) private readonly notificationRepo: Repository<Notification>,
  ) {}

  // ── Feature flag ─────────────────────────────────────────────────────────────

  assertFeatureEnabled(): void {
    const raw = this.configService.get<string>('FEATURE_CORRESPONDENCE_CONTEST', 'false');
    const enabled = ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
    if (!enabled) {
      throw new ServiceUnavailableException(
        'La fonctionnalité Concours de correspondance est désactivée. ' +
          'Définissez FEATURE_CORRESPONDENCE_CONTEST=true pour y accéder.',
      );
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private effectiveRules(session: ContestSession): ContestSessionRules {
    return { ...DEFAULT_RULES, ...(session.rules ?? {}) };
  }

  private isSessionOpen(session: ContestSession): boolean {
    const now = new Date();
    return (
      session.status === ContestSessionStatus.OPEN &&
      now >= session.startAt &&
      now <= session.endAt
    );
  }

  private isReplyOpen(session: ContestSession): boolean {
    const rules = this.effectiveRules(session);
    const deadline = new Date(session.endAt.getTime() + rules.gracePeriodHours * 3_600_000);
    return new Date() <= deadline;
  }

  /**
   * Returns a deterministic, non-reversible alias for a user inside a thread.
   * The alias is consistent for the same user within the same thread but does
   * not leak the real userId.
   */
  anonymousAlias(userId: string, threadId: string): string {
    // XOR the first 4 bytes of userId with those of threadId for per-thread consistency.
    const uBytes = Buffer.from(userId.replace(/-/g, ''), 'hex');
    const tBytes = Buffer.from(threadId.replace(/-/g, ''), 'hex');
    const mixed = uBytes.readUInt32BE(0) ^ tBytes.readUInt32BE(0);
    return `Anonyme #${(mixed % 9000) + 1000}`;
  }

  private async notifyUser(userId: string, title: string, message: string): Promise<void> {
    try {
      const notification = this.notificationRepo.create({
        userId,
        title,
        message,
        type: 'correspondence',
      });
      await this.notificationRepo.save(notification);
    } catch {
      // Non-critical — do not propagate notification errors to the caller.
    }
  }

  // ── Sessions ──────────────────────────────────────────────────────────────────

  async listSessions(includeAll = false): Promise<ContestSession[]> {
    if (includeAll) {
      return this.sessionRepo.find({ order: { createdAt: 'DESC' } });
    }
    // Public: only open/published sessions
    return this.sessionRepo.find({
      where: [{ status: ContestSessionStatus.OPEN }, { status: ContestSessionStatus.PUBLISHED }],
      order: { createdAt: 'DESC' },
    });
  }

  async getSession(id: string): Promise<ContestSession> {
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session) throw new NotFoundException('Session introuvable');
    return session;
  }

  async createSession(dto: CreateContestSessionDto, creatorId: string): Promise<ContestSession> {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) {
      throw new BadRequestException('endAt doit être postérieur à startAt.');
    }
    const session = this.sessionRepo.create({
      title: dto.title,
      themePrompt: dto.themePrompt,
      startAt,
      endAt,
      gracePeriodHours: dto.gracePeriodHours ?? 48,
      rules: dto.rules ? { ...DEFAULT_RULES, ...dto.rules } : { ...DEFAULT_RULES },
      createdBy: creatorId,
      status: ContestSessionStatus.DRAFT,
    });
    return this.sessionRepo.save(session);
  }

  async updateSession(id: string, dto: UpdateContestSessionDto): Promise<ContestSession> {
    const session = await this.getSession(id);
    if (dto.title !== undefined) session.title = dto.title;
    if (dto.themePrompt !== undefined) session.themePrompt = dto.themePrompt;
    if (dto.startAt !== undefined) session.startAt = new Date(dto.startAt);
    if (dto.endAt !== undefined) session.endAt = new Date(dto.endAt);
    if (dto.gracePeriodHours !== undefined) session.gracePeriodHours = dto.gracePeriodHours;
    if (dto.status !== undefined) session.status = dto.status;
    if (dto.rules !== undefined) session.rules = { ...DEFAULT_RULES, ...dto.rules };
    return this.sessionRepo.save(session);
  }

  // ── Letters ───────────────────────────────────────────────────────────────────

  async createLetter(sessionId: string, userId: string, dto: CreateLetterDto): Promise<Letter> {
    const session = await this.getSession(sessionId);
    if (!this.isSessionOpen(session)) {
      throw new BadRequestException('La session est fermée aux nouvelles lettres.');
    }
    const rules = this.effectiveRules(session);
    const existingCount = await this.letterRepo.count({ where: { sessionId, authorUserId: userId } });
    if (existingCount >= rules.maxLettersPerUser) {
      throw new BadRequestException(
        `Vous avez atteint la limite de ${rules.maxLettersPerUser} lettre(s) par session.`,
      );
    }
    const letter = this.letterRepo.create({
      sessionId,
      authorUserId: userId,
      body: dto.body,
      metadata: dto.metadata ?? null,
      status: LetterStatus.DRAFT,
    });
    return this.letterRepo.save(letter);
  }

  async updateLetter(letterId: string, userId: string, dto: UpdateLetterDto): Promise<Letter> {
    const letter = await this.letterRepo.findOne({ where: { id: letterId } });
    if (!letter) throw new NotFoundException('Lettre introuvable');
    if (letter.authorUserId !== userId) throw new ForbiddenException();
    if (letter.status !== LetterStatus.DRAFT) {
      throw new BadRequestException('Une lettre soumise ne peut plus être modifiée.');
    }
    if (dto.body !== undefined) letter.body = dto.body;
    if (dto.metadata !== undefined) letter.metadata = dto.metadata;
    return this.letterRepo.save(letter);
  }

  async submitLetter(letterId: string, userId: string): Promise<Letter> {
    const letter = await this.letterRepo.findOne({ where: { id: letterId }, relations: ['session'] });
    if (!letter) throw new NotFoundException('Lettre introuvable');
    if (letter.authorUserId !== userId) throw new ForbiddenException();
    if (letter.status !== LetterStatus.DRAFT) {
      throw new BadRequestException('La lettre est déjà soumise.');
    }
    if (!this.isSessionOpen(letter.session)) {
      throw new BadRequestException('La session est fermée.');
    }
    const rules = this.effectiveRules(letter.session);
    if (letter.body.length < rules.minBodyLength) {
      throw new BadRequestException(
        `La lettre doit faire au moins ${rules.minBodyLength} caractères (actuellement ${letter.body.length}).`,
      );
    }
    if (letter.body.length > rules.maxBodyLength) {
      throw new BadRequestException(
        `La lettre ne doit pas dépasser ${rules.maxBodyLength} caractères.`,
      );
    }

    letter.status = LetterStatus.SUBMITTED;
    letter.submittedAt = new Date();
    await this.letterRepo.save(letter);

    // Attempt immediate symmetric matching.
    await this.tryMatchOnSubmit(letter, letter.session);

    return this.letterRepo.findOne({ where: { id: letterId } }) as Promise<Letter>;
  }

  async getMyLetters(userId: string, sessionId?: string): Promise<Letter[]> {
    return this.letterRepo.find({
      where: { authorUserId: userId, ...(sessionId ? { sessionId } : {}) },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Matching ──────────────────────────────────────────────────────────────────

  /**
   * Attempt an immediate symmetric match when a letter is submitted.
   * Picks a random unmatched candidate from the session pool, assigns both
   * letters to each other's author if possible.
   */
  private async tryMatchOnSubmit(letter: Letter, session: ContestSession): Promise<void> {
    const rules = this.effectiveRules(session);

    const candidates = await this.letterRepo.find({
      where: { sessionId: letter.sessionId, status: LetterStatus.SUBMITTED, authorUserId: Not(letter.authorUserId) },
    });
    if (candidates.length === 0) return;

    const existingAssignments = await this.assignmentRepo.find({
      where: { sessionId: letter.sessionId },
      relations: ['letter'],
    });

    const alreadyPaired = new Set<string>();
    const recipientCount = new Map<string, number>();
    for (const a of existingAssignments) {
      if (a.letter.authorUserId === letter.authorUserId) alreadyPaired.add(a.recipientUserId);
      if (a.recipientUserId === letter.authorUserId) alreadyPaired.add(a.letter.authorUserId);
      recipientCount.set(a.recipientUserId, (recipientCount.get(a.recipientUserId) ?? 0) + 1);
    }

    const eligible = candidates.filter((c) => {
      if (alreadyPaired.has(c.authorUserId)) return false;
      const received = recipientCount.get(c.authorUserId) ?? 0;
      return received < rules.maxLettersReceived;
    });
    if (eligible.length === 0) return;

    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    await this.doAssign(letter, pick.authorUserId, session);

    // Symmetric: also deliver the picked letter to the current author.
    const currentAuthorReceived = recipientCount.get(letter.authorUserId) ?? 0;
    if (currentAuthorReceived < rules.maxLettersReceived) {
      await this.doAssign(pick, letter.authorUserId, session);
    }
  }

  /**
   * Core assignment operation: marks letter as ASSIGNED, persists an Assignment
   * and its CorrespondenceThread, then notifies the recipient.
   */
  private async doAssign(letter: Letter, recipientUserId: string, session: ContestSession): Promise<void> {
    // Guard against double-assignment (race condition / retry safety).
    const existing = await this.assignmentRepo.findOne({ where: { letterId: letter.id } });
    if (existing) return;

    letter.status = LetterStatus.ASSIGNED;
    await this.letterRepo.save(letter);

    const assignment = this.assignmentRepo.create({
      sessionId: letter.sessionId,
      letterId: letter.id,
      recipientUserId,
      assignedAt: new Date(),
    });
    const saved = await this.assignmentRepo.save(assignment);

    await this.threadRepo.save(
      this.threadRepo.create({ sessionId: letter.sessionId, assignmentId: saved.id, isAnonymous: true }),
    );

    await this.notifyUser(
      recipientUserId,
      'Nouvelle lettre reçue',
      `Vous avez reçu une lettre dans le cadre du concours "${session.title}". Découvrez-la dans votre boîte de réception !`,
    );
  }

  /**
   * Batch assignment job — assigns all SUBMITTED letters in one pass.
   * Safe to call multiple times (idempotent per letter).
   */
  async assignLetters(sessionId: string): Promise<{ assigned: number; skipped: number }> {
    const session = await this.getSession(sessionId);
    const rules = this.effectiveRules(session);

    const submitted = await this.letterRepo.find({
      where: { sessionId, status: LetterStatus.SUBMITTED },
      order: { submittedAt: 'ASC' },
    });

    const existingAssignments = await this.assignmentRepo.find({
      where: { sessionId },
      relations: ['letter'],
    });

    const assignedLetterIds = new Set(existingAssignments.map((a) => a.letterId));
    const recipientCount = new Map<string, number>();
    const pairHistory = new Map<string, Set<string>>();
    for (const a of existingAssignments) {
      recipientCount.set(a.recipientUserId, (recipientCount.get(a.recipientUserId) ?? 0) + 1);
      if (!pairHistory.has(a.letter.authorUserId)) pairHistory.set(a.letter.authorUserId, new Set());
      pairHistory.get(a.letter.authorUserId)!.add(a.recipientUserId);
    }

    // Shuffle for fairness.
    const unassigned = submitted.filter((l) => !assignedLetterIds.has(l.id));
    for (let i = unassigned.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unassigned[i], unassigned[j]] = [unassigned[j], unassigned[i]];
    }

    let assigned = 0;
    let skipped = 0;

    for (const letter of unassigned) {
      const authorPairs = pairHistory.get(letter.authorUserId) ?? new Set<string>();
      const eligible = unassigned.filter((c) => {
        if (c.id === letter.id || c.authorUserId === letter.authorUserId) return false;
        if (authorPairs.has(c.authorUserId)) return false;
        if ((recipientCount.get(c.authorUserId) ?? 0) >= rules.maxLettersReceived) return false;
        return true;
      });

      if (eligible.length === 0) {
        skipped++;
        continue;
      }

      const pick = eligible[Math.floor(Math.random() * eligible.length)];
      await this.doAssign(letter, pick.authorUserId, session);

      // Update local tracking maps for subsequent iterations.
      recipientCount.set(pick.authorUserId, (recipientCount.get(pick.authorUserId) ?? 0) + 1);
      if (!pairHistory.has(letter.authorUserId)) pairHistory.set(letter.authorUserId, new Set());
      pairHistory.get(letter.authorUserId)!.add(pick.authorUserId);
      assignedLetterIds.add(letter.id);
      assigned++;
    }

    return { assigned, skipped };
  }

  // ── Inbox ─────────────────────────────────────────────────────────────────────

  async getInbox(userId: string) {
    const assignments = await this.assignmentRepo.find({
      where: { recipientUserId: userId },
      relations: ['letter', 'letter.session', 'thread'],
      order: { assignedAt: 'DESC' },
    });

    return assignments.map((a) => ({
      assignmentId: a.id,
      sessionId: a.letter.sessionId,
      sessionTitle: a.letter.session.title,
      themePrompt: a.letter.session.themePrompt,
      assignedAt: a.assignedAt,
      openedAt: a.openedAt,
      threadId: a.thread?.id ?? null,
      // Only expose a preview after the letter has been opened.
      letterPreview: a.openedAt ? a.letter.body.slice(0, 200) : null,
    }));
  }

  async openAssignment(assignmentId: string, userId: string) {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId },
      relations: ['letter', 'letter.session', 'thread'],
    });
    if (!assignment) throw new NotFoundException('Assignment introuvable');
    if (assignment.recipientUserId !== userId) throw new ForbiddenException();

    if (!assignment.openedAt) {
      assignment.openedAt = new Date();
      assignment.deliveredAt = assignment.deliveredAt ?? new Date();
      assignment.letter.status = LetterStatus.DELIVERED;
      await this.letterRepo.save(assignment.letter);
      await this.assignmentRepo.save(assignment);

      await this.notifyUser(
        assignment.letter.authorUserId,
        'Lettre lue',
        `Votre lettre dans le concours "${assignment.letter.session.title}" a été lue par son destinataire.`,
      );
    }

    return {
      assignmentId: assignment.id,
      thread: assignment.thread,
      letter: {
        id: assignment.letter.id,
        body: assignment.letter.body,
        metadata: assignment.letter.metadata,
        submittedAt: assignment.letter.submittedAt,
        authorAlias: assignment.thread
          ? this.anonymousAlias(assignment.letter.authorUserId, assignment.thread.id)
          : 'Anonyme',
      },
    };
  }

  // ── Threads & messages ────────────────────────────────────────────────────────

  async getThread(threadId: string, userId: string) {
    const thread = await this.threadRepo.findOne({
      where: { id: threadId },
      relations: ['assignment', 'assignment.letter', 'messages', 'messages.sender'],
    });
    if (!thread) throw new NotFoundException('Thread introuvable');

    const { letter } = thread.assignment;
    const isParticipant =
      letter.authorUserId === userId || thread.assignment.recipientUserId === userId;
    if (!isParticipant) throw new ForbiddenException();

    const messages = thread.messages
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        senderAlias: thread.isAnonymous
          ? this.anonymousAlias(m.senderUserId, thread.id)
          : `${(m.sender as User).firstName} ${(m.sender as User).lastName}`,
        isOwn: m.senderUserId === userId,
      }));

    return {
      threadId: thread.id,
      isAnonymous: thread.isAnonymous,
      createdAt: thread.createdAt,
      lastMessageAt: thread.lastMessageAt,
      messages,
    };
  }

  async sendMessage(threadId: string, userId: string, dto: SendMessageDto) {
    const thread = await this.threadRepo.findOne({
      where: { id: threadId },
      relations: ['assignment', 'assignment.letter', 'assignment.letter.session'],
    });
    if (!thread) throw new NotFoundException('Thread introuvable');

    const { assignment } = thread;
    const isParticipant =
      assignment.letter.authorUserId === userId || assignment.recipientUserId === userId;
    if (!isParticipant) throw new ForbiddenException();

    if (!this.isReplyOpen(assignment.letter.session)) {
      throw new BadRequestException('La période de réponse est terminée pour cette session.');
    }

    // Basic anti-spam: too many external links.
    const urlCount = (dto.body.match(/https?:\/\//gi) ?? []).length;
    if (urlCount > 3) {
      throw new BadRequestException('Le message contient trop de liens. Veuillez le réviser.');
    }

    const message = this.messageRepo.create({ threadId, senderUserId: userId, body: dto.body });
    const saved = await this.messageRepo.save(message);

    thread.lastMessageAt = saved.createdAt;
    await this.threadRepo.save(thread);

    const otherUserId =
      assignment.letter.authorUserId === userId
        ? assignment.recipientUserId
        : assignment.letter.authorUserId;
    await this.notifyUser(otherUserId, 'Nouvelle réponse', 'Vous avez reçu une nouvelle réponse dans votre correspondance.');

    return saved;
  }

  // ── Votes ─────────────────────────────────────────────────────────────────────

  async castVote(sessionId: string, userId: string, dto: CastVoteDto): Promise<CorrespondenceVote> {
    const session = await this.getSession(sessionId);
    const rules = this.effectiveRules(session);
    if (!rules.allowVoting) {
      throw new BadRequestException("Le vote n'est pas activé pour cette session.");
    }
    if (
      session.status !== ContestSessionStatus.SCORING &&
      session.status !== ContestSessionStatus.PUBLISHED
    ) {
      throw new BadRequestException("Le vote n'est pas encore ouvert pour cette session.");
    }

    const letter = await this.letterRepo.findOne({ where: { id: dto.letterId, sessionId } });
    if (!letter) throw new NotFoundException('Lettre introuvable');
    if (letter.authorUserId === userId) {
      throw new ForbiddenException('Vous ne pouvez pas voter pour votre propre lettre.');
    }

    const existing = await this.voteRepo.findOne({
      where: { sessionId, voterUserId: userId, letterId: dto.letterId },
    });
    if (existing) throw new BadRequestException('Vous avez déjà voté pour cette lettre.');

    const vote = this.voteRepo.create({ sessionId, voterUserId: userId, letterId: dto.letterId, score: dto.score ?? 1 });
    return this.voteRepo.save(vote);
  }

  async computeResults(sessionId: string): Promise<{ letterId: string; totalScore: number; rank: number }[]> {
    await this.getSession(sessionId); // validates existence
    const votes = await this.voteRepo.find({ where: { sessionId } });
    const totals = new Map<string, number>();
    for (const v of votes) {
      totals.set(v.letterId, (totals.get(v.letterId) ?? 0) + v.score);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([letterId, totalScore], idx) => ({ letterId, totalScore, rank: idx + 1 }));
  }

  // ── Moderation ────────────────────────────────────────────────────────────────

  async createReport(userId: string, dto: CreateReportDto): Promise<ModerationCase> {
    // Validate the target exists.
    switch (dto.targetType) {
      case ModerationTargetType.LETTER: {
        const letter = await this.letterRepo.findOne({ where: { id: dto.targetId } });
        if (!letter) throw new NotFoundException('Lettre introuvable');
        break;
      }
      case ModerationTargetType.MESSAGE: {
        const message = await this.messageRepo.findOne({ where: { id: dto.targetId } });
        if (!message) throw new NotFoundException('Message introuvable');
        break;
      }
      case ModerationTargetType.USER: {
        const user = await this.userRepo.findOne({ where: { id: dto.targetId } });
        if (!user) throw new NotFoundException('Utilisateur introuvable');
        break;
      }
    }

    const report = this.moderationRepo.create({
      reporterUserId: userId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: dto.reason,
      details: dto.details ?? null,
      status: ModerationCaseStatus.PENDING,
    });
    return this.moderationRepo.save(report);
  }

  async listReports(status?: string): Promise<ModerationCase[]> {
    return this.moderationRepo.find({
      where: status ? { status: status as ModerationCaseStatus } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async handleReport(caseId: string, adminId: string, action: 'handle' | 'dismiss'): Promise<ModerationCase> {
    const modCase = await this.moderationRepo.findOne({ where: { id: caseId } });
    if (!modCase) throw new NotFoundException('Signalement introuvable');
    modCase.status = action === 'handle' ? ModerationCaseStatus.HANDLED : ModerationCaseStatus.DISMISSED;
    modCase.handledBy = adminId;
    modCase.handledAt = new Date();
    return this.moderationRepo.save(modCase);
  }
}

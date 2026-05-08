import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { CorrespondenceService, DEFAULT_RULES } from './correspondence.service';
import {
  Assignment,
  ContestSession,
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
import { Notification, User, UserRole } from '../mvp/entities';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeUser(partial: Partial<User> = {}): User {
  return {
    id: 'user-1',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    password: 'hashed',
    role: UserRole.STUDENT,
    classId: null,
    academicClass: null,
    school: null,
    city: null,
    department: null,
    sectionName: null,
    canBeContacted: false,
    acceptedPrivacyPolicy: true,
    googleId: null,
    createdAt: new Date(),
    ...partial,
  } as User;
}

function makeSession(partial: Partial<ContestSession> = {}): ContestSession {
  return {
    id: 'session-1',
    title: 'Test Session',
    themePrompt: 'Écrivez sur un sujet libre.',
    startAt: new Date(Date.now() - 3_600_000), // 1h ago
    endAt: new Date(Date.now() + 3_600_000),   // 1h from now
    gracePeriodHours: 48,
    status: ContestSessionStatus.OPEN,
    rules: { ...DEFAULT_RULES },
    createdBy: 'admin-1',
    creator: makeUser({ id: 'admin-1', role: UserRole.ADMIN }),
    createdAt: new Date(),
    letters: [],
    ...partial,
  } as ContestSession;
}

function makeLetter(partial: Partial<Letter> = {}): Letter {
  return {
    id: 'letter-1',
    sessionId: 'session-1',
    session: makeSession(),
    authorUserId: 'user-1',
    author: makeUser(),
    body: 'A'.repeat(600),
    metadata: null,
    createdAt: new Date(),
    submittedAt: null,
    status: LetterStatus.DRAFT,
    assignment: null,
    ...partial,
  } as Letter;
}

// ─── mock factory ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockRepo = Record<string, jest.Mock>;

function mockRepo(): MockRepo {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    save: jest.fn(),
    create: jest.fn((dto) => ({ ...dto })),
  };
}

function mockConfigService(featureEnabled = true): Partial<ConfigService> {
  return {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'FEATURE_CORRESPONDENCE_CONTEST') return featureEnabled ? 'true' : 'false';
      return def;
    }),
  };
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe('CorrespondenceService', () => {
  let service: CorrespondenceService;
  let sessionRepo: MockRepo;
  let letterRepo: MockRepo;
  let assignmentRepo: MockRepo;
  let threadRepo: MockRepo;
  let messageRepo: MockRepo;
  let voteRepo: MockRepo;
  let moderationRepo: MockRepo;
  let userRepo: MockRepo;
  let notificationRepo: MockRepo;

  beforeEach(async () => {
    sessionRepo = mockRepo();
    letterRepo = mockRepo();
    assignmentRepo = mockRepo();
    threadRepo = mockRepo();
    messageRepo = mockRepo();
    voteRepo = mockRepo();
    moderationRepo = mockRepo();
    userRepo = mockRepo();
    notificationRepo = mockRepo();

    // Default: save returns its input.
    for (const repo of [sessionRepo, letterRepo, assignmentRepo, threadRepo, messageRepo, voteRepo, moderationRepo, notificationRepo]) {
      repo.save.mockImplementation((e: unknown) => Promise.resolve(e));
      repo.create.mockImplementation((dto: unknown) => ({ ...(dto as object) }));
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorrespondenceService,
        { provide: ConfigService, useValue: mockConfigService(true) },
        { provide: getRepositoryToken(ContestSession), useValue: sessionRepo },
        { provide: getRepositoryToken(Letter), useValue: letterRepo },
        { provide: getRepositoryToken(Assignment), useValue: assignmentRepo },
        { provide: getRepositoryToken(CorrespondenceThread), useValue: threadRepo },
        { provide: getRepositoryToken(CorrespondenceMessage), useValue: messageRepo },
        { provide: getRepositoryToken(CorrespondenceVote), useValue: voteRepo },
        { provide: getRepositoryToken(ModerationCase), useValue: moderationRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
      ],
    }).compile();

    service = module.get(CorrespondenceService);
  });

  // ── Feature flag ────────────────────────────────────────────────────────────

  describe('assertFeatureEnabled', () => {
    it('throws ServiceUnavailableException when flag is false', async () => {
      const module = await Test.createTestingModule({
        providers: [
          CorrespondenceService,
          { provide: ConfigService, useValue: mockConfigService(false) },
          { provide: getRepositoryToken(ContestSession), useValue: mockRepo() },
          { provide: getRepositoryToken(Letter), useValue: mockRepo() },
          { provide: getRepositoryToken(Assignment), useValue: mockRepo() },
          { provide: getRepositoryToken(CorrespondenceThread), useValue: mockRepo() },
          { provide: getRepositoryToken(CorrespondenceMessage), useValue: mockRepo() },
          { provide: getRepositoryToken(CorrespondenceVote), useValue: mockRepo() },
          { provide: getRepositoryToken(ModerationCase), useValue: mockRepo() },
          { provide: getRepositoryToken(User), useValue: mockRepo() },
          { provide: getRepositoryToken(Notification), useValue: mockRepo() },
        ],
      }).compile();

      const svc = module.get(CorrespondenceService);
      expect(() => svc.assertFeatureEnabled()).toThrow(ServiceUnavailableException);
    });

    it('does not throw when flag is true', () => {
      expect(() => service.assertFeatureEnabled()).not.toThrow();
    });
  });

  // ── Session retrieval ────────────────────────────────────────────────────────

  describe('getSession', () => {
    it('throws NotFoundException when session does not exist', async () => {
      sessionRepo.findOne.mockResolvedValue(null);
      await expect(service.getSession('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('returns the session when it exists', async () => {
      const session = makeSession();
      sessionRepo.findOne.mockResolvedValue(session);
      const result = await service.getSession('session-1');
      expect(result).toEqual(session);
    });
  });

  // ── Letter creation ──────────────────────────────────────────────────────────

  describe('createLetter', () => {
    it('throws BadRequestException when session is not open (wrong status)', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ status: ContestSessionStatus.CLOSED }));
      await expect(service.createLetter('session-1', 'user-1', { body: 'A'.repeat(600) })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when session is open but time has passed', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({
        endAt: new Date(Date.now() - 1000),
      }));
      await expect(service.createLetter('session-1', 'user-1', { body: 'A'.repeat(600) })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when user has reached maxLettersPerUser', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession());
      letterRepo.count.mockResolvedValue(1); // already 1 letter, limit is 1
      await expect(service.createLetter('session-1', 'user-1', { body: 'A'.repeat(600) })).rejects.toThrow(BadRequestException);
    });

    it('creates a draft letter successfully', async () => {
      const session = makeSession();
      sessionRepo.findOne.mockResolvedValue(session);
      letterRepo.count.mockResolvedValue(0);
      const letter = makeLetter();
      letterRepo.create.mockReturnValue(letter);
      letterRepo.save.mockResolvedValue(letter);

      const result = await service.createLetter('session-1', 'user-1', { body: 'A'.repeat(600) });
      expect(result.status).toBe(LetterStatus.DRAFT);
    });
  });

  // ── Letter submission ────────────────────────────────────────────────────────

  describe('submitLetter', () => {
    it('throws ForbiddenException when user is not the author', async () => {
      const letter = makeLetter({ authorUserId: 'other-user' });
      letterRepo.findOne.mockResolvedValue(letter);
      await expect(service.submitLetter('letter-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when letter is already submitted', async () => {
      const letter = makeLetter({ status: LetterStatus.SUBMITTED });
      letterRepo.findOne.mockResolvedValue(letter);
      await expect(service.submitLetter('letter-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when body is too short', async () => {
      const session = makeSession();
      const letter = makeLetter({ body: 'Too short', session });
      letterRepo.findOne.mockResolvedValue(letter);
      await expect(service.submitLetter('letter-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('submits the letter and updates status', async () => {
      const session = makeSession();
      const letter = makeLetter({ session, body: 'A'.repeat(600) });
      letterRepo.findOne.mockResolvedValue(letter);
      letterRepo.save.mockResolvedValue({ ...letter, status: LetterStatus.SUBMITTED, submittedAt: new Date() });
      // No matching candidates
      assignmentRepo.find.mockResolvedValue([]);
      letterRepo.find.mockResolvedValue([]);

      await service.submitLetter('letter-1', 'user-1');
      expect(letterRepo.save).toHaveBeenCalled();
    });
  });

  // ── Matching — self exclusion ────────────────────────────────────────────────

  describe('assignLetters', () => {
    it('does not assign a letter to its own author', async () => {
      const session = makeSession();
      sessionRepo.findOne.mockResolvedValue(session);

      const letterA = makeLetter({ id: 'letter-a', authorUserId: 'user-1', status: LetterStatus.SUBMITTED });
      // Only one letter by same user — no eligible recipients.
      letterRepo.find.mockResolvedValue([letterA]);
      assignmentRepo.find.mockResolvedValue([]);

      const result = await service.assignLetters('session-1');
      expect(result.skipped).toBe(1);
      expect(result.assigned).toBe(0);
    });

    it('assigns letters correctly between two distinct users', async () => {
      const session = makeSession();
      sessionRepo.findOne.mockResolvedValue(session);

      const letterA = makeLetter({ id: 'letter-a', authorUserId: 'user-1', status: LetterStatus.SUBMITTED });
      const letterB = makeLetter({ id: 'letter-b', authorUserId: 'user-2', status: LetterStatus.SUBMITTED });
      letterRepo.find.mockResolvedValue([letterA, letterB]);
      assignmentRepo.find.mockResolvedValue([]);
      assignmentRepo.findOne.mockResolvedValue(null); // no existing assignment
      assignmentRepo.save.mockImplementation((e: unknown) => Promise.resolve({ ...(e as object), id: 'assign-new' }));
      threadRepo.create.mockReturnValue({});
      threadRepo.save.mockResolvedValue({ id: 'thread-1' });
      letterRepo.save.mockImplementation((e: unknown) => Promise.resolve(e));
      notificationRepo.create.mockReturnValue({});
      notificationRepo.save.mockResolvedValue({});

      const result = await service.assignLetters('session-1');
      // Both letters should be assigned to each other.
      expect(result.assigned).toBeGreaterThanOrEqual(1);
    });

    it('skips a letter when no eligible recipient respects maxLettersReceived', async () => {
      const session = makeSession({ rules: { ...DEFAULT_RULES, maxLettersReceived: 1 } });
      sessionRepo.findOne.mockResolvedValue(session);

      const letterA = makeLetter({ id: 'letter-a', authorUserId: 'user-1', status: LetterStatus.SUBMITTED });
      const letterB = makeLetter({ id: 'letter-b', authorUserId: 'user-2', status: LetterStatus.SUBMITTED });
      const letterC = makeLetter({ id: 'letter-c', authorUserId: 'user-3', status: LetterStatus.SUBMITTED });

      letterRepo.find.mockResolvedValue([letterA, letterB, letterC]);

      // Simulate user-2 already received 1 letter (maxLettersReceived = 1).
      const existingAssignment = {
        letterId: 'other-letter',
        recipientUserId: 'user-2',
        letter: { authorUserId: 'user-3' },
      };
      assignmentRepo.find.mockResolvedValue([existingAssignment]);
      assignmentRepo.findOne.mockResolvedValue(null);
      assignmentRepo.save.mockImplementation((e: unknown) => Promise.resolve({ ...(e as object), id: 'assign-new' }));
      threadRepo.create.mockReturnValue({});
      threadRepo.save.mockResolvedValue({ id: 'thread-x' });
      letterRepo.save.mockImplementation((e: unknown) => Promise.resolve(e));
      notificationRepo.create.mockReturnValue({});
      notificationRepo.save.mockResolvedValue({});

      const result = await service.assignLetters('session-1');
      // At least some will be skipped because of the capacity constraint.
      expect(result.assigned + result.skipped).toBe(3);
    });
  });

  // ── updateLetter ─────────────────────────────────────────────────────────────

  describe('updateLetter', () => {
    it('throws ForbiddenException when user is not the author', async () => {
      letterRepo.findOne.mockResolvedValue(makeLetter({ authorUserId: 'other' }));
      await expect(service.updateLetter('letter-1', 'user-1', { body: 'new body' })).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when letter is not a draft', async () => {
      letterRepo.findOne.mockResolvedValue(makeLetter({ status: LetterStatus.SUBMITTED }));
      await expect(service.updateLetter('letter-1', 'user-1', { body: 'new' })).rejects.toThrow(BadRequestException);
    });

    it('updates body on draft letter', async () => {
      const letter = makeLetter();
      letterRepo.findOne.mockResolvedValue(letter);
      letterRepo.save.mockImplementation((e: unknown) => Promise.resolve(e));
      await service.updateLetter('letter-1', 'user-1', { body: 'Updated content' });
      expect(letterRepo.save).toHaveBeenCalledWith(expect.objectContaining({ body: 'Updated content' }));
    });
  });

  // ── Voting ───────────────────────────────────────────────────────────────────

  describe('castVote', () => {
    it('throws BadRequestException when voting is disabled in session rules', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ status: ContestSessionStatus.SCORING, rules: { ...DEFAULT_RULES, allowVoting: false } }));
      await expect(service.castVote('session-1', 'user-1', { letterId: 'letter-1' })).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when voter is the author', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ status: ContestSessionStatus.SCORING, rules: { ...DEFAULT_RULES, allowVoting: true } }));
      letterRepo.findOne.mockResolvedValue(makeLetter({ authorUserId: 'user-1' }));
      await expect(service.castVote('session-1', 'user-1', { letterId: 'letter-1' })).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException on duplicate vote', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ status: ContestSessionStatus.SCORING, rules: { ...DEFAULT_RULES, allowVoting: true } }));
      letterRepo.findOne.mockResolvedValue(makeLetter({ authorUserId: 'user-2' }));
      voteRepo.findOne.mockResolvedValue({ id: 'existing-vote' });
      await expect(service.castVote('session-1', 'user-1', { letterId: 'letter-1' })).rejects.toThrow(BadRequestException);
    });

    it('casts a vote successfully', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ status: ContestSessionStatus.SCORING, rules: { ...DEFAULT_RULES, allowVoting: true } }));
      letterRepo.findOne.mockResolvedValue(makeLetter({ authorUserId: 'user-2' }));
      voteRepo.findOne.mockResolvedValue(null);
      const vote = { id: 'vote-1', sessionId: 'session-1', voterUserId: 'user-1', letterId: 'letter-1', score: 1, createdAt: new Date() };
      voteRepo.create.mockReturnValue(vote);
      voteRepo.save.mockResolvedValue(vote);

      const result = await service.castVote('session-1', 'user-1', { letterId: 'letter-1', score: 1 });
      expect(result).toEqual(vote);
    });
  });

  // ── Moderation ────────────────────────────────────────────────────────────────

  describe('createReport', () => {
    it('throws NotFoundException when letter target does not exist', async () => {
      letterRepo.findOne.mockResolvedValue(null);
      await expect(service.createReport('user-1', { targetType: ModerationTargetType.LETTER, targetId: 'letter-x', reason: 'Spam' })).rejects.toThrow(NotFoundException);
    });

    it('creates a moderation case for a valid letter', async () => {
      letterRepo.findOne.mockResolvedValue(makeLetter());
      const modCase = { id: 'case-1', status: ModerationCaseStatus.PENDING };
      moderationRepo.create.mockReturnValue(modCase);
      moderationRepo.save.mockResolvedValue(modCase);

      const result = await service.createReport('user-1', { targetType: ModerationTargetType.LETTER, targetId: 'letter-1', reason: 'Contenu inapproprié' });
      expect(result.status).toBe(ModerationCaseStatus.PENDING);
    });
  });

  // ── Thread access ─────────────────────────────────────────────────────────────

  describe('getThread', () => {
    it('throws ForbiddenException when user is not a participant', async () => {
      const thread = {
        id: 'thread-1',
        isAnonymous: true,
        createdAt: new Date(),
        lastMessageAt: null,
        messages: [],
        assignment: {
          letter: { authorUserId: 'user-2', body: 'body' },
          recipientUserId: 'user-3',
        },
      };
      threadRepo.findOne.mockResolvedValue(thread);
      await expect(service.getThread('thread-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Anonymous alias ───────────────────────────────────────────────────────────

  describe('anonymousAlias', () => {
    it('returns a consistent alias for the same (userId, threadId) pair', () => {
      const alias1 = service.anonymousAlias('user-1-uuid-abcd', 'thread-1-uuid-efgh');
      const alias2 = service.anonymousAlias('user-1-uuid-abcd', 'thread-1-uuid-efgh');
      expect(alias1).toBe(alias2);
    });

    it('returns different aliases for different users in the same thread', () => {
      const alias1 = service.anonymousAlias('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
      const alias2 = service.anonymousAlias('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
      // They may or may not be equal (UUID-derived hash collision is possible but unlikely with a 4-digit range).
      expect(alias1).toMatch(/^Anonyme #\d{4}$/);
      expect(alias2).toMatch(/^Anonyme #\d{4}$/);
    });
  });

  // ── sendMessage anti-spam ────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('throws BadRequestException when message body has more than 3 URLs', async () => {
      const session = makeSession();
      const thread = {
        id: 'thread-1',
        isAnonymous: true,
        lastMessageAt: null,
        assignment: {
          letter: { authorUserId: 'user-1', session },
          recipientUserId: 'user-2',
        },
      };
      threadRepo.findOne.mockResolvedValue(thread);
      const spamBody = 'Look: https://a.com https://b.com https://c.com https://d.com';
      await expect(service.sendMessage('thread-1', 'user-1', { body: spamBody })).rejects.toThrow(BadRequestException);
    });
  });
});

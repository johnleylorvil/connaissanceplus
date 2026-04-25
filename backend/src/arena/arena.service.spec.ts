import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ArenaService } from './arena.service';
import {
  ArenaParticipantMessage,
  ArenaCompetition,
  ArenaCompetitionStatus,
  ArenaParticipantRegistration,
  ArenaParticipantScoreAdjustment,
  ArenaParticipantAnswer,
  ArenaRound,
} from './arena.entities';
import { Notification, Question, User, UserRole } from '../mvp/entities';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeUser(partial: Partial<User>): User {
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

function makeCompetition(partial: Partial<ArenaCompetition>): ArenaCompetition {
  return {
    id: 'comp-1',
    name: 'Test Match',
    status: ArenaCompetitionStatus.PENDING,
    questionCount: 10,
    secondsPerQuestion: 30,
    scheduledAt: new Date(),
    createdByAdminId: 'admin-1',
    winnerParticipantUserId: null,
    competitorAUserId: null,
    competitorBUserId: null,
    moderatorUserId: null,
    currentRound: 0,
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    description: null,
    createdAt: new Date(),
    registrations: [],
    rounds: [],
    ...partial,
  } as ArenaCompetition;
}

// ─── mock factory ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockRepo = {
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  findOneOrFail?: jest.Mock;
  count?: jest.Mock;
  create?: jest.Mock;
};

function mockRepo(): MockRepo {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn().mockImplementation((e: unknown) => Promise.resolve(e)),
    findOneOrFail: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  };
}

// ─── test suite ──────────────────────────────────────────────────────────────

describe('ArenaService — moderator permission tests', () => {
  let service: ArenaService;

  let competitionRepo: MockRepo;
  let registrationRepo: MockRepo;
  let notificationRepo: MockRepo;
  let userRepo: MockRepo;

  beforeEach(async () => {
    competitionRepo = mockRepo();
    registrationRepo = mockRepo();
    notificationRepo = mockRepo();
    userRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArenaService,
        { provide: getRepositoryToken(ArenaCompetition), useValue: competitionRepo },
        { provide: getRepositoryToken(ArenaParticipantRegistration), useValue: registrationRepo },
        { provide: getRepositoryToken(ArenaRound), useValue: mockRepo() },
        { provide: getRepositoryToken(ArenaParticipantAnswer), useValue: mockRepo() },
        { provide: getRepositoryToken(ArenaParticipantMessage), useValue: mockRepo() },
        { provide: getRepositoryToken(ArenaParticipantScoreAdjustment), useValue: mockRepo() },
        { provide: getRepositoryToken(Question), useValue: mockRepo() },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
      ],
    }).compile();

    service = module.get<ArenaService>(ArenaService);
  });

  // ── assignModerator ─────────────────────────────────────────────────────────

  describe('assignModerator', () => {
    it('assigns a MODERATOR user to a competition', async () => {
      const admin = makeUser({ id: 'admin-1', role: UserRole.ADMIN });
      const moderator = makeUser({ id: 'mod-1', role: UserRole.MODERATOR });
      const comp = makeCompetition({ id: 'comp-1', moderatorUserId: null });

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(moderator);

      const result = await service.assignModerator(admin.id, comp.id, moderator.id);

      expect(competitionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ moderatorUserId: moderator.id }),
      );
      expect(result.moderatorUserId).toBe(moderator.id);
    });

    it('throws NotFoundException when competition does not exist', async () => {
      competitionRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(makeUser({ role: UserRole.MODERATOR }));

      await expect(
        service.assignModerator('admin-1', 'nonexistent-comp', 'mod-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when target user has STUDENT role', async () => {
      const comp = makeCompetition({});
      const student = makeUser({ id: 'student-1', role: UserRole.STUDENT });

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(student);

      await expect(
        service.assignModerator('admin-1', comp.id, student.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when target user does not exist', async () => {
      const comp = makeCompetition({});

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assignModerator('admin-1', comp.id, 'ghost-user'),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows re-assigning to a different moderator', async () => {
      const comp = makeCompetition({ moderatorUserId: 'mod-old' });
      const newMod = makeUser({ id: 'mod-new', role: UserRole.MODERATOR });

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(newMod);

      const result = await service.assignModerator('admin-1', comp.id, newMod.id);

      expect(result.moderatorUserId).toBe('mod-new');
    });
  });

  // ── releaseModerator ────────────────────────────────────────────────────────

  describe('releaseModerator', () => {
    it('allows an ADMIN to release any competition', async () => {
      const admin = makeUser({ id: 'admin-1', role: UserRole.ADMIN });
      const comp = makeCompetition({ moderatorUserId: 'mod-1' });

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(admin);

      const result = await service.releaseModerator(admin.id, comp.id);

      expect(result.moderatorUserId).toBeNull();
    });

    it('allows a MODERATOR to release their own assigned competition', async () => {
      const mod = makeUser({ id: 'mod-1', role: UserRole.MODERATOR });
      const comp = makeCompetition({ moderatorUserId: 'mod-1' });

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(mod);

      const result = await service.releaseModerator(mod.id, comp.id);

      expect(result.moderatorUserId).toBeNull();
    });

    it('throws ForbiddenException when MODERATOR tries to release a competition assigned to another', async () => {
      const otherMod = makeUser({ id: 'mod-2', role: UserRole.MODERATOR });
      const comp = makeCompetition({ moderatorUserId: 'mod-1' }); // assigned to mod-1

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(otherMod);

      await expect(
        service.releaseModerator('mod-2', comp.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when competition does not exist', async () => {
      competitionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.releaseModerator('mod-1', 'ghost-comp'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getMyModeratorMatches ───────────────────────────────────────────────────

  describe('getMyModeratorMatches', () => {
    it('returns only competitions assigned to the requesting moderator', async () => {
      const comp1 = makeCompetition({ id: 'comp-1', moderatorUserId: 'mod-1' });
      const comp2 = makeCompetition({ id: 'comp-2', moderatorUserId: 'mod-1' });

      competitionRepo.find.mockResolvedValue([comp1, comp2]);

      const results = await service.getMyModeratorMatches('mod-1');

      expect(competitionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { moderatorUserId: 'mod-1' } }),
      );
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ id: 'comp-1' });
    });

    it('returns an empty array when no matches are assigned', async () => {
      competitionRepo.find.mockResolvedValue([]);

      const results = await service.getMyModeratorMatches('mod-no-match');

      expect(results).toEqual([]);
    });
  });

  describe('participant contracts', () => {
    it('notifies all students when a competition is created', async () => {
      const dto = {
        name: 'Arena Hebdo',
        questionCount: 12,
        secondsPerQuestion: 20,
        scheduledAt: '2026-04-25T14:00:00.000Z',
        description: 'Description',
      };
      const createdCompetition = makeCompetition({
        id: 'arena-1',
        name: dto.name,
        questionCount: dto.questionCount,
        secondsPerQuestion: dto.secondsPerQuestion,
        scheduledAt: new Date(dto.scheduledAt),
        description: dto.description,
      });
      const studentOne = makeUser({ id: 'student-1', role: UserRole.STUDENT });
      const studentTwo = makeUser({ id: 'student-2', role: UserRole.STUDENT });

      competitionRepo.create.mockReturnValue(createdCompetition);
      competitionRepo.save.mockResolvedValue(createdCompetition);
      userRepo.find.mockResolvedValue([studentOne, studentTwo]);
      notificationRepo.create.mockImplementation((value: unknown) => value);
      notificationRepo.save.mockImplementation((value: unknown) => Promise.resolve(value));

      const result = await service.createCompetition('admin-1', dto);

      expect(userRepo.find).toHaveBeenCalledWith({
        where: { role: UserRole.STUDENT },
        select: { id: true },
      });
      expect(notificationRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userId: 'student-1',
            title: 'Nouveau challenge Arena',
            type: 'arena_competition',
          }),
          expect.objectContaining({
            userId: 'student-2',
            title: 'Nouveau challenge Arena',
            type: 'arena_competition',
          }),
        ]),
      );
      expect(result).toBe(createdCompetition);
    });

    it('registers a participant using participantUserId storage', async () => {
      const comp = makeCompetition({
        id: 'comp-open',
        status: ArenaCompetitionStatus.APPROVED,
      });

      competitionRepo.findOne.mockResolvedValue(comp);
      registrationRepo.findOne.mockResolvedValue(null);
      registrationRepo.create?.mockImplementation((entity: unknown) => entity);

      await service.registerParticipant('student-1', comp.id);

      expect(registrationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          competitionId: comp.id,
          participantUserId: 'student-1',
        }),
      );
    });

    it('completes a competition with winnerParticipantUserId in the returned payload', async () => {
      const admin = makeUser({ id: 'admin-1', role: UserRole.ADMIN });
      const winner = makeUser({ id: 'student-1', firstName: 'Ada', lastName: 'Lovelace' });
      const comp = makeCompetition({
        id: 'comp-live',
        status: ArenaCompetitionStatus.LIVE,
        moderatorUserId: 'mod-1',
      });

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(admin);
      userRepo.find.mockResolvedValue([winner]);

      const result = await service.completeCompetition('admin-1', comp.id, {
        participantUserId: winner.id,
      });

      expect(competitionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ArenaCompetitionStatus.COMPLETED,
          winnerParticipantUserId: winner.id,
        }),
      );
      expect(result.winnerParticipantUserId).toBe(winner.id);
      expect(result.winnerParticipantName).toBe('Ada Lovelace');
    });
  });

  // ── ensureModeratorControl (via pauseCompetition) ──────────────────────────

  describe('moderator access control (via pauseCompetition)', () => {
    it('throws ForbiddenException when MODERATOR tries to pause a match not assigned to them', async () => {
      const wrongMod = makeUser({ id: 'mod-2', role: UserRole.MODERATOR });
      const comp = makeCompetition({
        id: 'comp-1',
        status: ArenaCompetitionStatus.LIVE,
        moderatorUserId: 'mod-1', // assigned to mod-1, not mod-2
      });

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(wrongMod);

      await expect(
        service.pauseCompetition('mod-2', comp.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when MODERATOR tries to act on a match with no moderator assigned', async () => {
      const mod = makeUser({ id: 'mod-1', role: UserRole.MODERATOR });
      const comp = makeCompetition({
        id: 'comp-1',
        status: ArenaCompetitionStatus.LIVE,
        moderatorUserId: null, // no moderator assigned
      });

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(mod);

      await expect(
        service.pauseCompetition('mod-1', comp.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows ADMIN to pause any match regardless of moderator assignment', async () => {
      const admin = makeUser({ id: 'admin-1', role: UserRole.ADMIN });
      const comp = makeCompetition({
        id: 'comp-1',
        status: ArenaCompetitionStatus.LIVE,
        moderatorUserId: 'mod-1', // assigned to mod-1, but admin overrides
      });

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(admin);

      await expect(
        service.pauseCompetition('admin-1', comp.id),
      ).resolves.not.toThrow();
    });

    it('allows the assigned MODERATOR to pause their own match', async () => {
      const mod = makeUser({ id: 'mod-1', role: UserRole.MODERATOR });
      const comp = makeCompetition({
        id: 'comp-1',
        status: ArenaCompetitionStatus.LIVE,
        moderatorUserId: 'mod-1',
      });

      competitionRepo.findOne.mockResolvedValue(comp);
      userRepo.findOne.mockResolvedValue(mod);

      await expect(
        service.pauseCompetition('mod-1', comp.id),
      ).resolves.not.toThrow();
    });
  });

  // ── getModeratorUsers ───────────────────────────────────────────────────────

  describe('getModeratorUsers', () => {
    it('returns users with MODERATOR role', async () => {
      const mods = [
        makeUser({ id: 'mod-1', role: UserRole.MODERATOR, email: 'a@a.com' }),
        makeUser({ id: 'mod-2', role: UserRole.MODERATOR, email: 'b@b.com' }),
      ];

      userRepo.find.mockResolvedValue(mods);

      const results = await service.getModeratorUsers();

      expect(userRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: UserRole.MODERATOR } }),
      );
      expect(results).toHaveLength(2);
    });
  });
});

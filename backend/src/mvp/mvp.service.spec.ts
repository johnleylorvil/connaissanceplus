import { BadRequestException } from '@nestjs/common';

import { MvpService } from './mvp.service';
import {
  DuelAnswer,
  DuelBuzzerPhase,
  DuelMatch,
  DuelMatchQuestion,
  DuelMode,
  DuelProgress,
  DuelStatus,
  Difficulty,
  OptionChoice,
  Question,
  User,
  UserRole,
} from './entities';

type RepoMock<T> = {
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  delete: jest.Mock;
  update: jest.Mock;
};

function createRepo<T>(): RepoMock<T> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn((value) => Promise.resolve(value)),
    create: jest.fn((value) => value),
    delete: jest.fn(),
    update: jest.fn(),
  };
}

function makeUser(id: string, partial: Partial<User> = {}): User {
  return {
    id,
    firstName: id === 'u1' ? 'Anne' : 'Bert',
    lastName: 'Eleve',
    email: `${id}@example.com`,
    password: 'hashed',
    role: UserRole.STUDENT,
    classId: 'class-1',
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

function makeQuestion(id: string, correctOption = OptionChoice.A): Question {
  return {
    id,
    classId: 'class-1',
    subjectId: 'subject-1',
    academicClass: null,
    subject: null,
    prompt: `Question ${id}`,
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctOption,
    difficulty: Difficulty.MEDIUM,
    explanation: null,
    createdAt: new Date(),
  } as Question;
}

describe('MvpService buzzer duel', () => {
  let service: MvpService;
  let match: DuelMatch;
  let progresses: DuelProgress[];
  let duelQuestions: DuelMatchQuestion[];
  let answers: DuelAnswer[];
  let duelMatchRepo: RepoMock<DuelMatch>;
  let duelProgressRepo: RepoMock<DuelProgress>;
  let duelMatchQuestionRepo: RepoMock<DuelMatchQuestion>;
  let duelAnswerRepo: RepoMock<DuelAnswer>;

  beforeEach(() => {
    const users = [makeUser('u1'), makeUser('u2')];

    match = {
      id: 'duel-1',
      joinCode: 'ABC123',
      competitionId: 'subject-duel:subject-1',
      competitionName: 'Concours de Math',
      subjectId: 'subject-1',
      classId: 'class-1',
      playerOneId: 'u1',
      playerTwoId: 'u2',
      playerOne: users[0],
      playerTwo: users[1],
      status: DuelStatus.IN_PROGRESS,
      questionCount: 10,
      mode: DuelMode.QCM,
      currentQuestionPosition: 1,
      buzzerPhase: DuelBuzzerPhase.WAITING_FOR_BUZZ,
      activeResponderUserId: null,
      firstResponderUserId: null,
      responseDeadlineAt: null,
      moderatorUserId: null,
      moderator: null,
      chimeMeetingId: null,
      chimeMediaRegion: null,
      liveStartedAt: null,
      liveEndedAt: null,
      winnerUserId: null,
      waitingExpiresAt: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      questions: [],
      progresses: [],
      scoreEvents: [],
    } as DuelMatch;

    progresses = users.map((user) => ({
      id: `progress-${user.id}`,
      duelMatchId: match.id,
      userId: user.id,
      duelMatch: match,
      user,
      answeredCount: 0,
      score: 0,
      startedAt: match.startedAt,
      submittedAt: null,
      totalTimeSeconds: null,
      lastActivityAt: null,
    })) as DuelProgress[];

    duelQuestions = Array.from({ length: 10 }, (_, index) => ({
      id: `dq-${index + 1}`,
      duelMatchId: match.id,
      questionId: `q-${index + 1}`,
      position: index + 1,
      duelMatch: match,
      question: makeQuestion(`q-${index + 1}`),
      answers: [],
    })) as DuelMatchQuestion[];

    answers = [];
    duelMatchRepo = createRepo<DuelMatch>();
    duelProgressRepo = createRepo<DuelProgress>();
    duelMatchQuestionRepo = createRepo<DuelMatchQuestion>();
    duelAnswerRepo = createRepo<DuelAnswer>();

    duelMatchRepo.findOne.mockImplementation(({ where }) => {
      if (where?.id === match.id) return Promise.resolve(match);
      return Promise.resolve(null);
    });
    duelMatchRepo.save.mockImplementation((value) => {
      Object.assign(match, value);
      return Promise.resolve(match);
    });

    duelProgressRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(progresses.find((progress) => (
        progress.duelMatchId === where.duelMatchId && progress.userId === where.userId
      )) ?? null),
    );
    duelProgressRepo.find.mockImplementation(() => Promise.resolve(progresses));
    duelProgressRepo.save.mockImplementation((value) => Promise.resolve(value));

    duelMatchQuestionRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(duelQuestions.find((question) => (
        question.duelMatchId === where.duelMatchId &&
        (where.position == null || question.position === where.position) &&
        (where.id == null || question.id === where.id)
      )) ?? null),
    );
    duelMatchQuestionRepo.find.mockImplementation(() => Promise.resolve(duelQuestions));

    duelAnswerRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(answers.find((answer) => (
        answer.duelMatchQuestionId === where.duelMatchQuestionId &&
        answer.userId === where.userId
      )) ?? null),
    );
    duelAnswerRepo.find.mockImplementation(({ where }) =>
      Promise.resolve(answers.filter((answer) => where.duelMatchQuestionId._value.includes(answer.duelMatchQuestionId))),
    );
    duelAnswerRepo.create.mockImplementation((value) => value);
    duelAnswerRepo.save.mockImplementation((value) => {
      const answer = {
        id: `answer-${answers.length + 1}`,
        answeredAt: new Date(),
        ...value,
      } as DuelAnswer;
      answers.push(answer);
      return Promise.resolve(answer);
    });

    const emptyRepo = createRepo<never>();
    service = new MvpService(
      { sign: jest.fn() } as never,
      { get: jest.fn((_: string, fallback: unknown) => fallback) } as never,
      { sendOtpEmail: jest.fn() } as never,
      emptyRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      duelMatchRepo as never,
      duelMatchQuestionRepo as never,
      duelProgressRepo as never,
      duelAnswerRepo as never,
      emptyRepo as never,
    );
  });

  it('awards a point and advances when the buzzer player answers correctly', async () => {
    await service.buzzDuel('u1', match.id);
    expect(match.activeResponderUserId).toBe('u1');

    await service.submitDuelAnswer('u1', match.id, {
      duelQuestionId: 'dq-1',
      selectedOption: OptionChoice.A,
    });

    expect(progresses[0].score).toBe(1);
    expect(match.currentQuestionPosition).toBe(2);
    expect(match.buzzerPhase).toBe(DuelBuzzerPhase.WAITING_FOR_BUZZ);
    expect(match.activeResponderUserId).toBeNull();
  });

  it('gives the other player eight seconds after a wrong first answer', async () => {
    await service.buzzDuel('u1', match.id);
    await service.submitDuelAnswer('u1', match.id, {
      duelQuestionId: 'dq-1',
      selectedOption: OptionChoice.B,
    });

    expect(progresses[0].score).toBe(0);
    expect(match.currentQuestionPosition).toBe(1);
    expect(match.buzzerPhase).toBe(DuelBuzzerPhase.ANSWERING);
    expect(match.activeResponderUserId).toBe('u2');
    expect(match.responseDeadlineAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it('applies server timeout and gives the second chance to the other player', async () => {
    await service.buzzDuel('u1', match.id);
    match.responseDeadlineAt = new Date(Date.now() - 1000);

    const state = await service.getDuelState('u2', match.id);

    expect(match.activeResponderUserId).toBe('u2');
    expect(state.canAnswer).toBe(true);
    expect(answers).toHaveLength(1);
    expect(answers[0].userId).toBe('u1');
    expect(answers[0].selectedOption).toBeNull();
    expect(answers[0].isCorrect).toBe(false);
  });

  it('rejects answers from a player who has not buzzed', async () => {
    await expect(
      service.submitDuelAnswer('u1', match.id, {
        duelQuestionId: 'dq-1',
        selectedOption: OptionChoice.A,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

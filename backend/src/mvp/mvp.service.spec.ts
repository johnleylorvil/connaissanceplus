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

function inValues(value: unknown): string[] {
  const operator = value as { _value?: string[]; value?: string[] } | undefined;
  return operator?._value ?? operator?.value ?? [];
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

type DuelStateForTest = Awaited<ReturnType<MvpService['getDuelState']>>;

describe('MvpService timed duel', () => {
  let service: MvpService;
  let match: DuelMatch;
  let progresses: DuelProgress[];
  let questionBank: Question[];
  let duelQuestions: DuelMatchQuestion[];
  let answers: DuelAnswer[];
  let duelMatchRepo: RepoMock<DuelMatch>;
  let duelProgressRepo: RepoMock<DuelProgress>;
  let duelMatchQuestionRepo: RepoMock<DuelMatchQuestion>;
  let duelAnswerRepo: RepoMock<DuelAnswer>;
  let questionRepo: RepoMock<Question>;

  beforeEach(() => {
    const startedAt = new Date(Date.now() - 10_000);
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
      durationMinutes: 3,
      mode: DuelMode.QCM,
      currentQuestionPosition: 1,
      buzzerPhase: DuelBuzzerPhase.WAITING_FOR_BUZZ,
      activeResponderUserId: null,
      firstResponderUserId: null,
      responseDeadlineAt: new Date(Date.now() + 60_000),
      moderatorUserId: null,
      moderator: null,
      chimeMeetingId: null,
      chimeMediaRegion: null,
      liveStartedAt: null,
      liveEndedAt: null,
      winnerUserId: null,
      waitingExpiresAt: null,
      startedAt,
      matchStartsAt: null,
      completedAt: null,
      createdAt: startedAt,
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
      startedAt,
      submittedAt: null,
      totalTimeSeconds: null,
      lastActivityAt: null,
      abandonedAt: null,
    })) as DuelProgress[];

    questionBank = Array.from({ length: 10 }, (_, index) =>
      makeQuestion(`q-${index + 1}`),
    );
    duelQuestions = questionBank.map((question, index) => ({
      id: `dq-${index + 1}`,
      duelMatchId: match.id,
      questionId: question.id,
      position: index + 1,
      duelMatch: match,
      question,
      answers: [],
    })) as DuelMatchQuestion[];

    answers = [];
    duelMatchRepo = createRepo<DuelMatch>();
    duelProgressRepo = createRepo<DuelProgress>();
    duelMatchQuestionRepo = createRepo<DuelMatchQuestion>();
    duelAnswerRepo = createRepo<DuelAnswer>();
    questionRepo = createRepo<Question>();

    duelMatchRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(where?.id === match.id ? match : null),
    );
    duelMatchRepo.save.mockImplementation((value) => {
      Object.assign(match, value);
      return Promise.resolve(match);
    });

    duelProgressRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        progresses.find(
          (progress) =>
            progress.duelMatchId === where.duelMatchId &&
            progress.userId === where.userId,
        ) ?? null,
      ),
    );
    duelProgressRepo.find.mockImplementation(() => Promise.resolve(progresses));
    duelProgressRepo.save.mockImplementation((value) => Promise.resolve(value));

    duelMatchQuestionRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        duelQuestions.find(
          (question) =>
            question.duelMatchId === where.duelMatchId &&
            (where.position == null || question.position === where.position) &&
            (where.id == null || question.id === where.id),
        ) ?? null,
      ),
    );
    duelMatchQuestionRepo.find.mockImplementation(() =>
      Promise.resolve(
        [...duelQuestions].sort(
          (first, second) => first.position - second.position,
        ),
      ),
    );
    duelMatchQuestionRepo.create.mockImplementation((value) => value);
    duelMatchQuestionRepo.save.mockImplementation((value) => {
      const input = value as Partial<DuelMatchQuestion>;
      const sourceQuestion =
        questionBank.find((question) => question.id === input.questionId) ??
        questionBank[0];
      const saved = {
        id: input.id ?? `dq-${input.position}`,
        duelMatchId: match.id,
        questionId: sourceQuestion.id,
        position: input.position,
        duelMatch: match,
        question: sourceQuestion,
        answers: [],
      } as DuelMatchQuestion;
      duelQuestions.push(saved);
      return Promise.resolve(saved);
    });

    duelAnswerRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        answers.find(
          (answer) =>
            answer.duelMatchQuestionId === where.duelMatchQuestionId &&
            answer.userId === where.userId,
        ) ?? null,
      ),
    );
    duelAnswerRepo.find.mockImplementation(({ where }) => {
      const duelQuestionIds = inValues(where.duelMatchQuestionId);
      return Promise.resolve(
        answers.filter(
          (answer) =>
            (duelQuestionIds.length === 0 ||
              duelQuestionIds.includes(answer.duelMatchQuestionId)) &&
            (where.userId == null || answer.userId === where.userId),
        ),
      );
    });
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

    questionRepo.find.mockResolvedValue(questionBank);

    const emptyRepo = createRepo<never>();
    const userRepo = createRepo<User>();
    userRepo.findOne.mockResolvedValue(null);
    const notificationRepo = createRepo<never>();

    service = new MvpService(
      { sign: jest.fn() } as never,
      { get: jest.fn((_: string, fallback: unknown) => fallback) } as never,
      { sendOtpEmail: jest.fn() } as never,
      userRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      questionRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      emptyRepo as never,
      notificationRepo as never,
      duelMatchRepo as never,
      duelMatchQuestionRepo as never,
      duelProgressRepo as never,
      duelAnswerRepo as never,
      emptyRepo as never,
    );
  });

  async function answerCurrent(
    userId: string,
    selectedOption = OptionChoice.A,
  ): Promise<DuelStateForTest> {
    const state = await service.getDuelState(userId, match.id);
    expect(state.currentQuestion).toBeTruthy();
    return service.submitDuelAnswer(userId, match.id, {
      duelQuestionId: state.currentQuestion!.duelQuestionId,
      selectedOption,
    });
  }

  it('keeps the duel open after ten answers and serves an eleventh question while time remains', async () => {
    let state: DuelStateForTest | null = null;

    for (let index = 0; index < 10; index += 1) {
      state = await answerCurrent('u1');
    }

    expect(match.status).toBe(DuelStatus.IN_PROGRESS);
    expect(progresses[0].answeredCount).toBe(10);
    expect(progresses[0].submittedAt).toBeNull();
    expect(match.questionCount).toBe(11);
    expect(duelQuestions).toHaveLength(11);
    expect(state?.currentQuestion?.position).toBe(11);
    expect(state?.canAnswer).toBe(true);

    const afterEleventh = await service.submitDuelAnswer('u1', match.id, {
      duelQuestionId: state!.currentQuestion!.duelQuestionId,
      selectedOption: OptionChoice.A,
    });

    expect(match.status).toBe(DuelStatus.IN_PROGRESS);
    expect(progresses[0].answeredCount).toBe(11);
    expect(progresses[0].submittedAt).toBeNull();
    expect(afterEleventh.currentQuestion?.position).toBe(12);
  });

  it('reuses the existing question bank when all ten source questions were already served', async () => {
    for (let index = 0; index < 10; index += 1) {
      await answerCurrent('u1');
    }

    const recycledQuestion = duelQuestions[10];

    expect(recycledQuestion.position).toBe(11);
    expect(questionBank.map((question) => question.id)).toContain(
      recycledQuestion.questionId,
    );
    expect(match.questionCount).toBe(11);
  });

  it('completes only when the timed deadline expires and resolves the winner by score', async () => {
    await answerCurrent('u1', OptionChoice.A);
    await answerCurrent('u2', OptionChoice.B);
    match.responseDeadlineAt = new Date(Date.now() - 1000);

    const state = await service.getDuelState('u1', match.id);

    expect(match.status).toBe(DuelStatus.COMPLETED);
    expect(match.winnerUserId).toBe('u1');
    expect(state.canAnswer).toBe(false);
    expect(progresses.every((progress) => !!progress.submittedAt)).toBe(true);
  });

  it('does not let stale submittedAt from the old ten-question rule block an active timed duel', async () => {
    for (let index = 0; index < 10; index += 1) {
      await answerCurrent('u1');
    }
    progresses[0].submittedAt = new Date();

    const state = await service.getDuelState('u1', match.id);

    expect(match.status).toBe(DuelStatus.IN_PROGRESS);
    expect(state.canAnswer).toBe(true);
    expect(state.currentQuestion?.position).toBe(11);
  });
});

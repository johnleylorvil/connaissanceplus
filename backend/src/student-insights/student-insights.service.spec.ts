import { StudentInsightsService } from './student-insights.service';
import { StudentDailyRecommendation } from './student-daily-recommendation.entity';
import { Subject } from '../mvp/entities';
import { Assignment } from '../correspondence/correspondence.entities';

type RepoMock = {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
};

const repo = (): RepoMock => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((value: unknown): unknown => value),
  save: jest.fn((values: StudentDailyRecommendation[]) =>
    Promise.resolve(
      values.map((value, index) => ({
        ...value,
        id: value.id ?? 'recommendation-' + index,
      })),
    ),
  ),
  remove: jest.fn().mockResolvedValue(undefined),
});

describe('StudentInsightsService', () => {
  let service: StudentInsightsService;
  let recommendationRepo: RepoMock;
  let repositories: RepoMock[];

  beforeEach(() => {
    repositories = Array.from({ length: 13 }, () => repo());
    recommendationRepo = repo();
    service = new StudentInsightsService(
      repositories[0] as never,
      repositories[1] as never,
      repositories[2] as never,
      repositories[3] as never,
      repositories[4] as never,
      repositories[5] as never,
      repositories[6] as never,
      repositories[7] as never,
      repositories[8] as never,
      repositories[9] as never,
      repositories[10] as never,
      repositories[11] as never,
      repositories[12] as never,
      recommendationRepo as never,
    );
  });

  it('aggregates the current and previous 30-day periods independently', async () => {
    repositories[0].findOne.mockResolvedValue({
      id: 'student',
      classId: null,
    });
    repositories[2].find.mockResolvedValue([
      {
        id: 'recent',
        subjectId: 'math',
        score: 2,
        questions: [{}, {}, {}],
        startedAt: new Date('2026-06-10T12:00:00.000Z'),
      },
      {
        id: 'previous',
        subjectId: 'math',
        score: 1,
        questions: [{}, {}],
        startedAt: new Date('2026-05-10T12:00:00.000Z'),
      },
    ]);

    const insights = await service.getInsights(
      'student',
      new Date('2026-06-19T16:00:00.000Z'),
    );

    expect(insights.period).toMatchObject({
      from: '2026-05-21',
      to: '2026-06-19',
      previousFrom: '2026-04-21',
      previousTo: '2026-05-20',
      activeDays: 1,
    });
    expect(insights.summary.quizzes).toMatchObject({
      periodSessions: 1,
      previousSessions: 1,
      totalSessions: 2,
      accuracy: 67,
      previousAccuracy: 50,
      trend: 17,
    });
  });
  it('requires three answers before classifying a subject', () => {
    const subjects = [
      { id: 'math', name: 'Mathématiques' },
      { id: 'history', name: 'Histoire' },
    ] as Subject[];
    const internals = service as unknown as {
      buildSubjectStats: (
        subjects: Subject[],
        quizzes: never[],
        answers: never[],
      ) => Array<{
        subjectId: string;
        answered: number;
        accuracy: number | null;
        level: string;
      }>;
    };

    const stats = internals.buildSubjectStats(
      subjects,
      [
        {
          subjectId: 'math',
          subject: subjects[0],
          score: 1,
          questions: [{}, {}],
        },
        {
          subjectId: 'history',
          subject: subjects[1],
          score: 3,
          questions: [{}, {}, {}],
        },
      ] as never[],
      [],
    );

    expect(stats.find((subject) => subject.subjectId === 'math')).toMatchObject(
      {
        answered: 2,
        accuracy: 50,
        level: 'insufficient_data',
      },
    );
    expect(
      stats.find((subject) => subject.subjectId === 'history'),
    ).toMatchObject({
      answered: 3,
      accuracy: 100,
      level: 'strong',
    });
  });

  it('returns at most one recommendation for each category and prioritizes unopened mail', () => {
    const internals = service as unknown as {
      buildCandidates: (context: Record<string, unknown>) => Array<{
        category: string;
        key: string;
      }>;
    };
    const assignment = {
      id: 'assignment-1',
      letter: { session: { title: 'Concours citoyen' } },
    } as Assignment;

    const candidates = internals.buildCandidates({
      subjects: [{ id: 'math', name: 'Mathématiques' }],
      subjectStats: [
        {
          subjectId: 'math',
          subjectName: 'Mathématiques',
          answered: 10,
          correct: 4,
          accuracy: 40,
          level: 'needs_work',
        },
      ],
      registrations: [],
      competitions: [],
      unopenedAssignments: [assignment],
      drafts: [],
      awaitingReplies: [],
    });

    expect(candidates).toHaveLength(3);
    expect(
      new Set(candidates.map((candidate) => candidate.category)).size,
    ).toBe(3);
    expect(candidates[0].key).toBe('participation:inbox:assignment-1');
  });

  it('keeps an existing valid recommendation stable for the day', async () => {
    const existing = {
      id: 'saved',
      userId: 'student',
      recommendationDate: '2026-06-19',
      slot: 0,
      candidateKey: 'learning:math',
      category: 'learning',
      title: 'Titre du matin',
      reason: 'Raison du matin',
      action: { type: 'start_quiz', subjectId: 'math' },
    } as StudentDailyRecommendation;
    recommendationRepo.find.mockResolvedValue([existing]);

    const internals = service as unknown as {
      syncDailyRecommendations: (
        userId: string,
        date: string,
        candidates: Array<Record<string, unknown>>,
      ) => Promise<StudentDailyRecommendation[]>;
    };
    const result = await internals.syncDailyRecommendations(
      'student',
      '2026-06-19',
      [
        {
          key: 'learning:math',
          category: 'learning',
          title: 'Titre recalculé',
          reason: 'Nouvelle raison',
          action: { type: 'start_quiz', subjectId: 'math' },
          priority: 70,
        },
      ],
    );

    expect(result[0].title).toBe('Titre du matin');
    expect(recommendationRepo.remove).not.toHaveBeenCalled();
  });

  it('uses Haiti local time for the generated day', () => {
    const internals = service as unknown as {
      localDateKey: (date: Date) => string;
    };
    expect(internals.localDateKey(new Date('2026-06-19T02:30:00.000Z'))).toBe(
      '2026-06-18',
    );
  });
});

import {
  buildAdminInsights,
  AdminInsightsSource,
} from './admin-insights.calculator';

const NOW = new Date('2026-06-20T12:00:00.000Z');

function source(
  overrides: Partial<AdminInsightsSource> = {},
): AdminInsightsSource {
  return {
    students: [],
    classes: [],
    subjects: [],
    questions: [],
    chapters: [],
    quizzes: [],
    duelAnswers: [],
    arenaAnswers: [],
    correspondenceMessages: [],
    tutorConversations: [],
    competitions: [],
    arenaRegistrations: [],
    moderationCases: [],
    ...overrides,
  };
}

describe('buildAdminInsights', () => {
  it('calculates periods, trends, unique active students and quiz accuracy', () => {
    const result = buildAdminInsights(
      source({
        students: [
          {
            id: 'student-1',
            classId: 'class-1',
            createdAt: new Date('2026-06-19T10:00:00Z'),
          },
          {
            id: 'student-2',
            classId: 'class-1',
            createdAt: new Date('2026-05-10T10:00:00Z'),
          },
          {
            id: 'student-3',
            classId: null,
            createdAt: new Date('2026-05-01T10:00:00Z'),
          },
        ],
        classes: [{ id: 'class-1', name: '9e AF' }],
        subjects: [
          { id: 'subject-1', name: 'Mathématiques', classId: 'class-1' },
        ],
        questions: [{ id: 'q-1', subjectId: 'subject-1' }],
        chapters: [
          {
            id: 'chapter-1',
            subjectId: 'subject-1',
            title: 'Fractions',
            status: 'published',
          },
        ],
        quizzes: [
          {
            userId: 'student-1',
            score: 2,
            startedAt: new Date('2026-06-18T10:00:00Z'),
            questions: [
              { id: 'sq-1' },
              { id: 'sq-2' },
              { id: 'sq-3' },
              { id: 'sq-4' },
            ],
          },
          {
            userId: 'student-2',
            score: 1,
            startedAt: new Date('2026-05-10T10:00:00Z'),
            questions: [{ id: 'old-1' }, { id: 'old-2' }],
          },
        ],
        duelAnswers: [
          { userId: 'student-1', answeredAt: new Date('2026-06-17T10:00:00Z') },
        ],
        arenaAnswers: [
          {
            participantUserId: 'student-2',
            submittedAt: new Date('2026-06-16T10:00:00Z'),
          },
        ],
        correspondenceMessages: [
          {
            senderUserId: 'admin-id',
            createdAt: new Date('2026-06-16T10:00:00Z'),
          },
        ],
      }),
      NOW,
    );

    expect(result.kpis.students).toMatchObject({ total: 3, new7: 1, new30: 1 });
    expect(result.kpis.activity).toMatchObject({
      active30: 2,
      activeRate: 66.7,
    });
    expect(result.kpis.quizzes).toMatchObject({
      completed30: 1,
      accuracy30: 50,
    });
    expect(result.kpis.quizzes.accuracyDelta).toBe(0);
    expect(result.timeline).toHaveLength(30);
    expect(
      result.timeline.find((day) => day.date === '2026-06-19')?.newStudents,
    ).toBe(1);
  });

  it('returns null accuracy when no quiz question exists', () => {
    const result = buildAdminInsights(source(), NOW);
    expect(result.kpis.quizzes.accuracy30).toBeNull();
    expect(result.kpis.quizzes.accuracyDelta).toBeNull();
  });

  it('generates and prioritizes grouped critical, warning and information alerts', () => {
    const result = buildAdminInsights(
      source({
        students: [
          {
            id: 'student-1',
            classId: 'class-empty',
            createdAt: new Date('2026-01-01'),
          },
        ],
        classes: [{ id: 'class-empty', name: 'Classe vide' }],
        subjects: [
          { id: 'subject-1', name: 'Sciences', classId: 'other-class' },
        ],
        chapters: [
          {
            id: 'draft-1',
            subjectId: 'subject-1',
            title: 'Brouillon',
            status: 'draft',
          },
        ],
        competitions: [
          {
            id: 'arena-1',
            name: 'Finale',
            status: 'approved',
            scheduledAt: new Date('2026-06-20T18:00:00Z'),
            moderatorUserId: null,
            competitorAUserId: 'student-1',
            competitorBUserId: null,
          },
        ],
        arenaRegistrations: [{ status: 'pending' }],
        moderationCases: [
          { status: 'pending', createdAt: new Date('2026-06-18T10:00:00Z') },
          { status: 'pending', createdAt: new Date('2026-06-20T10:00:00Z') },
        ],
      }),
      NOW,
    );

    expect(result.alerts[0].severity).toBe('critical');
    expect(result.alerts.map((alert) => alert.id)).toEqual(
      expect.arrayContaining([
        'arena.unprepared_competitions',
        'moderation.pending',
        'content.classes_without_subjects',
        'content.subjects_without_questions',
        'content.subjects_without_chapters',
        'content.draft_chapters',
        'arena.pending_registrations',
        'engagement.no_recent_quizzes',
      ]),
    );
  });

  it('removes alerts when all conditions are resolved', () => {
    const result = buildAdminInsights(
      source({
        students: [
          {
            id: 'student-1',
            classId: 'class-1',
            createdAt: new Date('2026-01-01'),
          },
        ],
        classes: [{ id: 'class-1', name: '9e AF' }],
        subjects: [
          { id: 'subject-1', name: 'Mathématiques', classId: 'class-1' },
        ],
        questions: [{ id: 'q-1', subjectId: 'subject-1' }],
        chapters: [
          {
            id: 'chapter-1',
            subjectId: 'subject-1',
            title: 'Fractions',
            status: 'published',
          },
        ],
        quizzes: [
          {
            userId: 'student-1',
            score: 1,
            startedAt: new Date('2026-06-19T10:00:00Z'),
            questions: [{ id: 'sq-1' }],
          },
        ],
      }),
      NOW,
    );
    expect(result.alerts).toEqual([]);
  });
});

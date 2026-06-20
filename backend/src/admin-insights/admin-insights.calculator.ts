import { AdminAlert, AdminInsightsResponse } from './admin-insights.types';

export type AdminInsightsSource = {
  students: Array<{ id: string; classId: string | null; createdAt: Date }>;
  classes: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string; classId: string }>;
  questions: Array<{ id: string; subjectId: string }>;
  chapters: Array<{
    id: string;
    subjectId: string;
    title: string;
    status: string;
  }>;
  quizzes: Array<{
    userId: string;
    score: number;
    startedAt: Date;
    questions: Array<{ id: string }>;
  }>;
  duelAnswers: Array<{ userId: string; answeredAt: Date }>;
  arenaAnswers: Array<{ participantUserId: string; submittedAt: Date }>;
  correspondenceMessages: Array<{ senderUserId: string; createdAt: Date }>;
  tutorConversations: Array<{ userId: string; updatedAt: Date }>;
  competitions: Array<{
    id: string;
    name: string;
    status: string;
    scheduledAt: Date;
    moderatorUserId: string | null;
    competitorAUserId: string | null;
    competitorBUserId: string | null;
  }>;
  arenaRegistrations: Array<{ status: string }>;
  moderationCases: Array<{ status: string; createdAt: Date }>;
};

const DAY = 86_400_000;

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function inRange(value: Date, from: Date, to: Date) {
  const time = value.getTime();
  return time >= from.getTime() && time < to.getTime();
}

function percent(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 1000) / 10;
}

function examples(values: string[]) {
  return values.slice(0, 3);
}

export function buildAdminInsights(
  source: AdminInsightsSource,
  now = new Date(),
): AdminInsightsResponse {
  const today = startOfUtcDay(now);
  const currentFrom = new Date(today.getTime() - 29 * DAY);
  const previousFrom = new Date(currentFrom.getTime() - 30 * DAY);
  const sevenDayFrom = new Date(today.getTime() - 6 * DAY);
  const rangeEnd = new Date(now.getTime() + 1);
  const studentIds = new Set(source.students.map((student) => student.id));

  const newStudents30 = source.students.filter((student) =>
    inRange(student.createdAt, currentFrom, rangeEnd),
  );
  const previousStudents30 = source.students.filter((student) =>
    inRange(student.createdAt, previousFrom, currentFrom),
  );
  const newStudents7 = source.students.filter((student) =>
    inRange(student.createdAt, sevenDayFrom, rangeEnd),
  );

  const activeIds = (from: Date, to: Date) => {
    const ids = new Set<string>();
    source.quizzes
      .filter((item) => inRange(item.startedAt, from, to))
      .forEach((item) => ids.add(item.userId));
    source.duelAnswers
      .filter((item) => inRange(item.answeredAt, from, to))
      .forEach((item) => ids.add(item.userId));
    source.arenaAnswers
      .filter((item) => inRange(item.submittedAt, from, to))
      .forEach((item) => ids.add(item.participantUserId));
    source.correspondenceMessages
      .filter((item) => inRange(item.createdAt, from, to))
      .forEach((item) => ids.add(item.senderUserId));
    source.tutorConversations
      .filter((item) => inRange(item.updatedAt, from, to))
      .forEach((item) => ids.add(item.userId));
    return [...ids].filter((id) => studentIds.has(id)).length;
  };

  const currentActive = activeIds(currentFrom, rangeEnd);
  const previousActive = activeIds(previousFrom, currentFrom);
  const currentQuizzes = source.quizzes.filter((item) =>
    inRange(item.startedAt, currentFrom, rangeEnd),
  );
  const previousQuizzes = source.quizzes.filter((item) =>
    inRange(item.startedAt, previousFrom, currentFrom),
  );
  const quizAccuracy = (items: AdminInsightsSource['quizzes']) => {
    const questions = items.reduce(
      (total, item) => total + item.questions.length,
      0,
    );
    if (questions === 0) return null;
    return (
      Math.round(
        (items.reduce((total, item) => total + item.score, 0) / questions) *
          1000,
      ) / 10
    );
  };
  const currentAccuracy = quizAccuracy(currentQuizzes);
  const previousAccuracy = quizAccuracy(previousQuizzes);

  const questionSubjectIds = new Set(
    source.questions.map((question) => question.subjectId),
  );
  const publishedChapters = source.chapters.filter(
    (chapter) => chapter.status === 'published',
  );
  const publishedChapterSubjectIds = new Set(
    publishedChapters.map((chapter) => chapter.subjectId),
  );
  const subjectsWithQuestions = source.subjects.filter((subject) =>
    questionSubjectIds.has(subject.id),
  );
  const subjectsWithChapters = source.subjects.filter((subject) =>
    publishedChapterSubjectIds.has(subject.id),
  );

  const coverageByClass = source.classes.map((academicClass) => {
    const classSubjects = source.subjects.filter(
      (subject) => subject.classId === academicClass.id,
    );
    const classSubjectIds = new Set(classSubjects.map((subject) => subject.id));
    const coveredByQuestions = classSubjects.filter((subject) =>
      questionSubjectIds.has(subject.id),
    ).length;
    const coveredByChapters = classSubjects.filter((subject) =>
      publishedChapterSubjectIds.has(subject.id),
    ).length;
    return {
      classId: academicClass.id,
      className: academicClass.name,
      students: source.students.filter(
        (student) => student.classId === academicClass.id,
      ).length,
      subjects: classSubjects.length,
      questions: source.questions.filter((question) =>
        classSubjectIds.has(question.subjectId),
      ).length,
      publishedChapters: publishedChapters.filter((chapter) =>
        classSubjectIds.has(chapter.subjectId),
      ).length,
      questionCoverage: percent(coveredByQuestions, classSubjects.length),
      chapterCoverage: percent(coveredByChapters, classSubjects.length),
    };
  });

  const timeline = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(currentFrom.getTime() + index * DAY);
    const end = new Date(date.getTime() + DAY);
    return {
      date: date.toISOString().slice(0, 10),
      newStudents: source.students.filter((student) =>
        inRange(student.createdAt, date, end),
      ).length,
      completedQuizzes: source.quizzes.filter((quiz) =>
        inRange(quiz.startedAt, date, end),
      ).length,
    };
  });

  const alerts: AdminAlert[] = [];
  const classesWithoutSubjects = coverageByClass
    .filter((item) => item.subjects === 0)
    .map((item) => item.className);
  if (classesWithoutSubjects.length)
    alerts.push({
      id: 'content.classes_without_subjects',
      severity: 'warning',
      title: 'Classes sans matière',
      message: `${classesWithoutSubjects.length} classe(s) ne possèdent encore aucune matière.`,
      count: classesWithoutSubjects.length,
      examples: examples(classesWithoutSubjects),
      action: { tab: 'subjects' },
    });
  const subjectsWithoutQuestions = source.subjects
    .filter((subject) => !questionSubjectIds.has(subject.id))
    .map((subject) => subject.name);
  if (subjectsWithoutQuestions.length)
    alerts.push({
      id: 'content.subjects_without_questions',
      severity: 'warning',
      title: 'Matières sans question',
      message: `${subjectsWithoutQuestions.length} matière(s) ne peuvent pas encore alimenter les quiz.`,
      count: subjectsWithoutQuestions.length,
      examples: examples(subjectsWithoutQuestions),
      action: { tab: 'questions' },
    });
  const subjectsWithoutChapters = source.subjects
    .filter((subject) => !publishedChapterSubjectIds.has(subject.id))
    .map((subject) => subject.name);
  if (subjectsWithoutChapters.length)
    alerts.push({
      id: 'content.subjects_without_chapters',
      severity: 'warning',
      title: 'Matières sans chapitre publié',
      message: `${subjectsWithoutChapters.length} matière(s) sont absentes de la bibliothèque des élèves.`,
      count: subjectsWithoutChapters.length,
      examples: examples(subjectsWithoutChapters),
      action: { tab: 'library' },
    });
  const drafts = source.chapters.filter(
    (chapter) => chapter.status === 'draft',
  );
  if (drafts.length)
    alerts.push({
      id: 'content.draft_chapters',
      severity: 'info',
      title: 'Chapitres en brouillon',
      message: `${drafts.length} chapitre(s) attendent une publication.`,
      count: drafts.length,
      examples: examples(drafts.map((chapter) => chapter.title)),
      action: { tab: 'library' },
    });

  const pendingRegistrations = source.arenaRegistrations.filter(
    (registration) => registration.status === 'pending',
  );
  if (pendingRegistrations.length)
    alerts.push({
      id: 'arena.pending_registrations',
      severity: 'warning',
      title: 'Inscriptions Arena en attente',
      message: `${pendingRegistrations.length} inscription(s) doivent être examinées.`,
      count: pendingRegistrations.length,
      examples: [],
      action: { tab: 'arena' },
    });
  const in24Hours = new Date(now.getTime() + DAY);
  const unpreparedCompetitions = source.competitions.filter(
    (competition) =>
      ['pending', 'approved'].includes(competition.status) &&
      competition.scheduledAt >= now &&
      competition.scheduledAt <= in24Hours &&
      (!competition.moderatorUserId ||
        !competition.competitorAUserId ||
        !competition.competitorBUserId),
  );
  if (unpreparedCompetitions.length)
    alerts.push({
      id: 'arena.unprepared_competitions',
      severity: 'critical',
      title: 'Compétitions imminentes incomplètes',
      message: `${unpreparedCompetitions.length} compétition(s) commencent sous 24 h sans affectation complète.`,
      count: unpreparedCompetitions.length,
      examples: examples(
        unpreparedCompetitions.map((competition) => competition.name),
      ),
      action: { tab: 'arena' },
    });

  const pendingModeration = source.moderationCases.filter(
    (item) => item.status === 'pending',
  );
  if (pendingModeration.length) {
    const isCritical =
      pendingModeration.length >= 5 ||
      pendingModeration.some(
        (item) => item.createdAt.getTime() <= now.getTime() - DAY,
      );
    alerts.push({
      id: 'moderation.pending',
      severity: isCritical ? 'critical' : 'warning',
      title: 'Signalements à traiter',
      message: `${pendingModeration.length} signalement(s) attendent une décision de modération.`,
      count: pendingModeration.length,
      examples: [],
      action: { tab: 'correspondence', subTab: 'moderation' },
    });
  }
  const quizzes7 = source.quizzes.filter((quiz) =>
    inRange(quiz.startedAt, sevenDayFrom, rangeEnd),
  );
  if (quizzes7.length === 0)
    alerts.push({
      id: 'engagement.no_recent_quizzes',
      severity: 'info',
      title: 'Aucun quiz récent',
      message: 'Aucun quiz n’a été terminé durant les sept derniers jours.',
      count: 0,
      examples: [],
      action: { tab: 'questions' },
    });

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      b.count - a.count,
  );
  const upcomingEnd = new Date(now.getTime() + 7 * DAY);

  return {
    generatedAt: now.toISOString(),
    periods: {
      currentFrom: currentFrom.toISOString(),
      previousFrom: previousFrom.toISOString(),
      days: 30,
    },
    kpis: {
      students: {
        total: source.students.length,
        new7: newStudents7.length,
        new30: newStudents30.length,
        trend: {
          current: newStudents30.length,
          previous: previousStudents30.length,
          delta: newStudents30.length - previousStudents30.length,
        },
      },
      activity: {
        active30: currentActive,
        activeRate: percent(currentActive, source.students.length),
        trend: {
          current: currentActive,
          previous: previousActive,
          delta: currentActive - previousActive,
        },
      },
      quizzes: {
        completed30: currentQuizzes.length,
        accuracy30: currentAccuracy,
        trend: {
          current: currentQuizzes.length,
          previous: previousQuizzes.length,
          delta: currentQuizzes.length - previousQuizzes.length,
        },
        accuracyDelta:
          currentAccuracy === null || previousAccuracy === null
            ? null
            : Math.round((currentAccuracy - previousAccuracy) * 10) / 10,
      },
      content: {
        classes: source.classes.length,
        subjects: source.subjects.length,
        questions: source.questions.length,
        publishedChapters: publishedChapters.length,
        questionCoverage: percent(
          subjectsWithQuestions.length,
          source.subjects.length,
        ),
        chapterCoverage: percent(
          subjectsWithChapters.length,
          source.subjects.length,
        ),
      },
      operations: {
        upcomingCompetitions7: source.competitions.filter(
          (item) =>
            ['pending', 'approved'].includes(item.status) &&
            item.scheduledAt >= now &&
            item.scheduledAt <= upcomingEnd,
        ).length,
        liveCompetitions: source.competitions.filter((item) =>
          ['live', 'paused'].includes(item.status),
        ).length,
        pendingArenaRegistrations: pendingRegistrations.length,
        pendingModeration: pendingModeration.length,
      },
    },
    timeline,
    coverageByClass,
    alerts,
  };
}

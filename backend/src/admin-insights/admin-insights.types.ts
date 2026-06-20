export type AdminInsightTab =
  | 'levels'
  | 'subjects'
  | 'questions'
  | 'library'
  | 'arena'
  | 'correspondence';

export type AdminAlertSeverity = 'critical' | 'warning' | 'info';

export type AdminAlert = {
  id: string;
  severity: AdminAlertSeverity;
  title: string;
  message: string;
  count: number;
  examples: string[];
  action: { tab: AdminInsightTab; subTab?: 'moderation' };
};

export type TrendMetric = {
  current: number;
  previous: number;
  delta: number;
};

export type AdminInsightsResponse = {
  generatedAt: string;
  periods: { currentFrom: string; previousFrom: string; days: 30 };
  kpis: {
    students: {
      total: number;
      new7: number;
      new30: number;
      trend: TrendMetric;
    };
    activity: { active30: number; activeRate: number; trend: TrendMetric };
    quizzes: {
      completed30: number;
      accuracy30: number | null;
      trend: TrendMetric;
      accuracyDelta: number | null;
    };
    content: {
      classes: number;
      subjects: number;
      questions: number;
      publishedChapters: number;
      questionCoverage: number;
      chapterCoverage: number;
    };
    operations: {
      upcomingCompetitions7: number;
      liveCompetitions: number;
      pendingArenaRegistrations: number;
      pendingModeration: number;
    };
  };
  timeline: Array<{
    date: string;
    newStudents: number;
    completedQuizzes: number;
  }>;
  coverageByClass: Array<{
    classId: string;
    className: string;
    students: number;
    subjects: number;
    questions: number;
    publishedChapters: number;
    questionCoverage: number;
    chapterCoverage: number;
  }>;
  alerts: AdminAlert[];
};

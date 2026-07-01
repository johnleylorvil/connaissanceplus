import { useMemo } from 'react'

// ── Local type definitions (mirror StudentDashboard types structurally) ──────

type SchoolClass = { id: string; name: string }
type HistoryEntry = {
  sessionId: string
  subjectName: string
  className: string
  score: number
  totalQuestions: number
  playedAt: string
}
type LeaderboardRow = {
  userId: string
  studentName: string
  winCount: number
  duelCount: number
  totalCorrectAnswers: number
}

type InsightSubject = {
  subjectId: string
  subjectName: string
  answered: number
  correct: number
  accuracy: number | null
  level: 'strong' | 'needs_work' | 'insufficient_data'
}

type StudentInsights = {
  period: { activeDays: number }
  summary: {
    quizzes: { totalSessions: number; periodSessions: number; accuracy: number | null }
    duels: { wins: number; losses: number; draws: number; accuracy: number | null }
    arena: { totalWins: number; totalCompetitions: number; periodPoints: number; upcomingRegistrations: number }
    correspondence: { unopenedAssignments: number; drafts: number }
    subjects: InsightSubject[]
  }
  recommendations: Array<{ id: string; category: 'learning' | 'competition' | 'participation'; title: string; reason: string }>
}

type AuthUser = {
  id: string
  firstName: string
  lastName: string
  classId: string | null
  school?: string | null
  city?: string | null
}

type Props = {
  user: AuthUser | null
  history: HistoryEntry[]
  leaderboard: LeaderboardRow[]
  classes: SchoolClass[]
  subjects: { id: string; name: string }[]
  insights: StudentInsights | null
  insightsLoading: boolean
  onGoToQuiz: () => void
  onGoToArena: () => void
  onGoToLeaderboard: () => void
  onGoToCorrespondence: () => void
  onGoToHistory: () => void
  onGoToRecommendations: () => void
  onGoToProfile: () => void
}

// ── Level system ─────────────────────────────────────────────────────────────

const LEVEL_THRESHOLDS = [100, 150, 200, 250, 300, 350, 400, 450, 500, 550]
const XP_AFTER_L10 = 600

function computeLevel(xp: number): { level: number; xpIntoLevel: number; xpNeeded: number } {
  let level = 1
  let accumulated = 0
  for (const increment of LEVEL_THRESHOLDS) {
    if (xp >= accumulated + increment) {
      accumulated += increment
      level++
    } else {
      return { level, xpIntoLevel: xp - accumulated, xpNeeded: increment }
    }
  }
  while (xp >= accumulated + XP_AFTER_L10) {
    accumulated += XP_AFTER_L10
    level++
  }
  return { level, xpIntoLevel: xp - accumulated, xpNeeded: XP_AFTER_L10 }
}

const TITLES = [
  'Apprenti', 'Étudiant', 'Compétiteur', 'Challenger', 'Expert',
  'Maître', 'Élite', 'Champion', 'Légende', 'Titan Académique',
]
function getTitle(level: number) {
  return TITLES[Math.min(level - 1, TITLES.length - 1)]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StudentDashboardHome({
  user,
  history,
  leaderboard,
  classes,
  subjects,
  insights,
  insightsLoading,
  onGoToQuiz,
  onGoToArena,
  onGoToLeaderboard,
  onGoToCorrespondence,
  onGoToHistory,
  onGoToRecommendations,
  onGoToProfile,
}: Props) {
  // ── Derived data ────────────────────────────────────────────────────────────

  const totalXP = useMemo(() => {
    const quizXP = (insights?.summary.quizzes.totalSessions ?? history.length) * 20
    const duelXP = (insights?.summary.duels.wins ?? 0) * 35
    const arenaXP = (insights?.summary.arena.totalWins ?? 0) * 80
    const arenaPoints = (insights?.summary.arena.periodPoints ?? 0) * 2
    return quizXP + duelXP + arenaXP + arenaPoints
  }, [history, insights])

  const { level, xpIntoLevel, xpNeeded } = useMemo(() => computeLevel(totalXP), [totalXP])
  const xpProgressPct = Math.min(100, Math.round((xpIntoLevel / xpNeeded) * 100))
  const title = getTitle(level)

  const streak = insights?.period.activeDays ?? Math.min(history.length, 7)
  const userRankIndex = leaderboard.findIndex((r) => r.userId === user?.id)
  const userRank = userRankIndex >= 0 ? userRankIndex + 1 : null

  const accuracy = insights?.summary.quizzes.accuracy ?? null
  const winCount = insights?.summary.duels.wins ?? 0

  const sortedSubjects = useMemo(
    () => [...(insights?.summary.subjects ?? [])].sort((a, b) => b.answered - a.answered),
    [insights],
  )
  const favoriteSubject = sortedSubjects[0] ?? null
  const strongSubjects = insights?.summary.subjects.filter((s) => s.level === 'strong').slice(0, 2) ?? []
  const weakSubjects = insights?.summary.subjects.filter((s) => s.level === 'needs_work').slice(0, 2) ?? []

  // ── Daily objectives ─────────────────────────────────────────────────────────

  const quizzesPlayed = insights?.summary.quizzes.totalSessions ?? history.length
  const objectives = useMemo(() => [
    {
      key: 'matches',
      label: 'Jouer 3 matchs',
      done: quizzesPlayed >= 3,
      progress: Math.min(quizzesPlayed, 3),
      target: 3,
    },
    {
      key: 'duel',
      label: 'Gagner un duel',
      done: winCount > 0,
      progress: Math.min(winCount, 1),
      target: 1,
    },
    {
      key: 'accuracy',
      label: 'Atteindre 80 % de précision',
      done: (accuracy ?? 0) >= 80,
      progress: Math.min(accuracy ?? 0, 80),
      target: 80,
    },
    {
      key: 'subject',
      label: 'Pratiquer une matière forte',
      done: (favoriteSubject?.level === 'strong' && (favoriteSubject?.answered ?? 0) > 0),
      progress: (favoriteSubject?.level === 'strong' && (favoriteSubject?.answered ?? 0) > 0) ? 1 : 0,
      target: 1,
    },
  ], [quizzesPlayed, winCount, accuracy, favoriteSubject])

  const objectivesDone = objectives.filter((o) => o.done).length

  // ── Activity timeline ────────────────────────────────────────────────────────

  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86_400_000).toDateString()

  const timelineItems = history.slice(0, 6).map((h) => {
    const d = new Date(h.playedAt)
    const dayLabel =
      d.toDateString() === today
        ? "Aujourd'hui"
        : d.toDateString() === yesterday
        ? 'Hier'
        : d.toLocaleDateString('fr-HT', { weekday: 'short', day: 'numeric', month: 'short' })
    const pct = h.totalQuestions > 0 ? Math.round((h.score / h.totalQuestions) * 100) : 0
    return { ...h, dayLabel, pct, won: pct >= 60 }
  })

  const timelineGroups = timelineItems.reduce<Record<string, typeof timelineItems>>(
    (acc, item) => {
      if (!acc[item.dayLabel]) acc[item.dayLabel] = []
      acc[item.dayLabel].push(item)
      return acc
    },
    {},
  )

  // ── Misc ─────────────────────────────────────────────────────────────────────

  const className = classes.find((c) => c.id === user?.classId)?.name ?? ''
  const avatarLetter = user?.firstName?.[0]?.toUpperCase() ?? 'É'
  const fullName = `${user?.firstName ?? 'Étudiant'} ${user?.lastName ?? ''}`.trim()

  const gameModes = [
    {
      id: 'quiz',
      icon: '⚡',
      title: 'Challenge',
      subtitle: 'Entraînement solo',
      action: onGoToQuiz,
      badge: subjects.length > 0 ? `${subjects.length} matières` : undefined,
    },
    {
      id: 'duel',
      icon: '⚔️',
      title: 'Duel Classé',
      subtitle: 'Face-à-face en direct',
      action: onGoToQuiz,
      badge: 'Principal',
      hot: true,
    },
    {
      id: 'arena',
      icon: '🏟️',
      title: 'Arena',
      subtitle: 'Compétition en live',
      action: onGoToArena,
      badge: insights?.summary.arena.upcomingRegistrations
        ? `${insights.summary.arena.upcomingRegistrations} à venir`
        : undefined,
    },
    {
      id: 'correspondence',
      icon: '✉️',
      title: 'Correspondance',
      subtitle: 'Concours de lettres',
      action: onGoToCorrespondence,
      badge: insights?.summary.correspondence.unopenedAssignments
        ? `${insights.summary.correspondence.unopenedAssignments} non lu(s)`
        : undefined,
    },
  ]

  const recommendations = insights?.recommendations.slice(0, 3) ?? []

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="arena-home">

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="arena-hero" aria-label="Votre profil de joueur">

        {/* Rank pill — top right */}
        {userRank !== null && (
          <div className="arena-hero-rank-badge" aria-label={`Classement national : position ${userRank}`}>
            <span className="arena-rank-number">#{userRank}</span>
            <span className="arena-rank-label">National</span>
          </div>
        )}

        <div className="arena-hero-content">
          {/* Identity row */}
          <div className="arena-hero-identity">
            <button
              className="arena-hero-avatar"
              onClick={onGoToProfile}
              title="Voir mon profil"
              aria-label="Accéder à mon profil"
            >
              {avatarLetter}
              <span className="arena-hero-level-badge" aria-label={`Niveau ${level}`}>Niv.{level}</span>
            </button>

            <div className="arena-hero-info">
              <p className="arena-hero-greeting">Bienvenue, Champion !</p>
              <h1 className="arena-hero-name">{fullName}</h1>
              <div className="arena-hero-meta">
                <span className="arena-hero-title-chip">{title}</span>
                {className && <span className="arena-hero-class">{className}</span>}
                {streak > 0 && (
                  <span className="arena-hero-streak" aria-label={`Série de ${streak} jours`}>
                    🔥 {streak} jour{streak > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* XP bar */}
          <div className="arena-hero-xp-section" aria-label="Progression de niveau">
            <div className="arena-hero-xp-labels">
              <span>Niveau {level} · {totalXP.toLocaleString('fr-HT')} XP</span>
              <span>{(xpNeeded - xpIntoLevel).toLocaleString('fr-HT')} XP → Niveau {level + 1}</span>
            </div>
            <div
              className="arena-xp-bar"
              role="progressbar"
              aria-valuenow={xpProgressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${xpProgressPct}% vers le niveau ${level + 1}`}
            >
              <div className="arena-xp-fill" style={{ width: `${xpProgressPct}%` }} />
            </div>
          </div>

          {/* Primary CTA */}
          <button className="arena-play-now-btn" onClick={onGoToQuiz} aria-label="Jouer maintenant">
            <span className="arena-play-icon" aria-hidden="true">⚡</span>
            JOUER MAINTENANT
          </button>
        </div>
      </section>

      {/* ── STAT CARDS ───────────────────────────────────────────────────────── */}
      <section className="arena-stats-grid" aria-label="Statistiques clés">
        {(
          [
            {
              icon: '🔥',
              value: `${streak}j`,
              label: 'Série',
              onClick: undefined as (() => void) | undefined,
            },
            {
              icon: '🏆',
              value: userRank ? `#${userRank}` : '—',
              label: 'Rang national',
              onClick: onGoToLeaderboard,
            },
            {
              icon: '⭐',
              value: `Niv. ${level}`,
              label: 'Niveau',
              onClick: undefined as (() => void) | undefined,
              small: true,
            },
            {
              icon: '🎯',
              value: accuracy !== null ? `${accuracy}%` : '—',
              label: 'Précision',
              onClick: undefined as (() => void) | undefined,
            },
            {
              icon: '⚡',
              value: winCount,
              label: 'Victoires',
              onClick: undefined as (() => void) | undefined,
            },
            {
              icon: '📚',
              value: favoriteSubject?.subjectName ?? '—',
              label: 'Matière forte',
              onClick: undefined as (() => void) | undefined,
              small: true,
            },
          ] as const
        ).map((stat) => (
          <button
            key={stat.label}
            type="button"
            className={`arena-stat-card${stat.onClick ? ' clickable' : ''}`}
            onClick={stat.onClick}
            disabled={!stat.onClick}
          >
            <span className="arena-stat-icon" aria-hidden="true">{stat.icon}</span>
            <span className={`arena-stat-value${'small' in stat && stat.small ? ' small' : ''}`}>
              {stat.value}
            </span>
            <span className="arena-stat-label">{stat.label}</span>
          </button>
        ))}
      </section>

      {/* ── BODY: TWO COLUMNS ────────────────────────────────────────────────── */}
      <div className="arena-two-col">

        {/* LEFT COLUMN */}
        <div className="arena-left-col">

          {/* Objectifs du jour */}
          <section className="arena-section arena-objectives-section" aria-labelledby="objectives-title">
            <div className="arena-section-header">
              <div>
                <p className="overline">Quotidien</p>
                <h2 className="arena-section-title" id="objectives-title">Objectifs du jour</h2>
              </div>
              <span className="arena-objectives-count" aria-label={`${objectivesDone} sur ${objectives.length} objectifs accomplis`}>
                {objectivesDone}/{objectives.length}
              </span>
            </div>

            <ul className="arena-objectives-list" role="list">
              {objectives.map((obj) => (
                <li key={obj.key} className={`arena-objective-item${obj.done ? ' done' : ''}`}>
                  <span className="arena-objective-check" aria-hidden="true">
                    {obj.done ? '✓' : '○'}
                  </span>
                  <div className="arena-objective-body">
                    <span className="arena-objective-label">{obj.label}</span>
                    {!obj.done && obj.target > 1 && (
                      <div
                        className="arena-objective-progress-bar"
                        role="progressbar"
                        aria-valuenow={obj.progress}
                        aria-valuemin={0}
                        aria-valuemax={obj.target}
                      >
                        <div style={{ width: `${Math.round((obj.progress / obj.target) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {objectivesDone === objectives.length && (
              <div className="arena-objectives-complete" role="status">
                🎉 Tous les objectifs du jour sont complétés !
              </div>
            )}
          </section>

          {/* Activity timeline */}
          {timelineItems.length > 0 && (
            <section className="arena-section" aria-labelledby="timeline-title">
              <div className="arena-section-header">
                <div>
                  <p className="overline">Activité</p>
                  <h2 className="arena-section-title" id="timeline-title">Activités récentes</h2>
                </div>
                <button className="arena-see-all-btn" onClick={onGoToHistory} aria-label="Voir tout l'historique">
                  Voir tout
                </button>
              </div>

              <div className="arena-timeline" role="log" aria-label="Fil d'activité">
                {Object.entries(timelineGroups).map(([day, items]) => (
                  <div key={day} className="arena-timeline-group">
                    <p className="arena-timeline-day">{day}</p>
                    {items.map((item) => (
                      <div key={item.sessionId} className={`arena-timeline-item ${item.won ? 'win' : 'loss'}`}>
                        <span className="arena-timeline-dot" aria-hidden="true" />
                        <div className="arena-timeline-content">
                          <span className="arena-timeline-result">
                            {item.won ? '🏆 Victoire' : '📉 Défaite'} — {item.subjectName}
                          </span>
                          <span className="arena-timeline-detail">
                            {item.score}/{item.totalQuestions} · {item.pct}%
                          </span>
                        </div>
                        <span className="arena-timeline-xp" aria-label={item.won ? `Gain de ${item.score * 5} XP` : 'Perte de position'}>
                          {item.won ? `+${item.score * 5} XP` : `−2 places`}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* AI Recommendations */}
          {recommendations.length > 0 && (
            <section className="arena-section" aria-labelledby="reco-title">
              <div className="arena-section-header">
                <div>
                  <p className="overline">Intelligence artificielle</p>
                  <h2 className="arena-section-title" id="reco-title">Recommandations</h2>
                </div>
                <button className="arena-see-all-btn" onClick={onGoToRecommendations} aria-label="Voir toutes les recommandations">
                  Voir tout
                </button>
              </div>
              <ul className="arena-reco-list" role="list">
                {recommendations.map((rec) => (
                  <li key={rec.id} className={`arena-reco-card ${rec.category}`}>
                    <span className="arena-reco-cat">
                      {rec.category === 'learning'
                        ? '📘 Apprentissage'
                        : rec.category === 'competition'
                        ? '🏆 Compétition'
                        : '🤝 Participation'}
                    </span>
                    <p className="arena-reco-title">{rec.title}</p>
                    <p className="arena-reco-reason">{rec.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="arena-right-col">

          {/* Game mode cards */}
          <section className="arena-section" aria-labelledby="modes-title">
            <div className="arena-section-header">
              <div>
                <p className="overline">Prêt à jouer ?</p>
                <h2 className="arena-section-title" id="modes-title">Choisir un mode</h2>
              </div>
            </div>
            <div className="arena-game-modes" role="list">
              {gameModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="listitem"
                  className={`arena-game-mode-card${mode.hot ? ' hot' : ''}`}
                  onClick={mode.action}
                  aria-label={`Jouer en mode ${mode.title}`}
                >
                  {'hot' in mode && mode.hot && (
                    <span className="arena-mode-hot" aria-hidden="true">Principal</span>
                  )}
                  <div className="arena-mode-top">
                    <span className="arena-mode-icon" aria-hidden="true">{mode.icon}</span>
                    {mode.badge && (
                      <span className="arena-mode-badge">{mode.badge}</span>
                    )}
                  </div>
                  <p className="arena-mode-title">{mode.title}</p>
                  <p className="arena-mode-subtitle">{mode.subtitle}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Leaderboard snapshot */}
          <section className="arena-section" aria-labelledby="lb-title">
            <div className="arena-section-header">
              <div>
                <p className="overline">Compétition</p>
                <h2 className="arena-section-title" id="lb-title">Classement</h2>
              </div>
              <button className="arena-see-all-btn" onClick={onGoToLeaderboard} aria-label="Voir le classement complet">
                Complet →
              </button>
            </div>

            {leaderboard.length === 0 ? (
              <p className="arena-empty-note">
                {insightsLoading ? 'Chargement…' : 'Aucun classement disponible cette semaine.'}
              </p>
            ) : (
              <>
                <ol className="arena-leaderboard-list" aria-label="Classement des meilleurs joueurs">
                  {leaderboard.slice(0, 5).map((row, index) => (
                    <li key={row.userId} className={`arena-rank-row${row.userId === user?.id ? ' current-user' : ''}`}>
                      <span className={`arena-rank-pos${index < 3 ? ' top' : ''}`} aria-label={`Position ${index + 1}`}>
                        {index + 1}
                      </span>
                      <span className="arena-rank-name">
                        {row.studentName}
                        {row.userId === user?.id && <span className="arena-you-chip">Vous</span>}
                      </span>
                      <span className="arena-rank-wins" aria-label={`${row.winCount} victoires`}>
                        {row.winCount} V
                      </span>
                    </li>
                  ))}

                  {userRank !== null && userRank > 5 && leaderboard[userRank - 1] && (
                    <>
                      <li className="arena-rank-separator" aria-hidden="true">···</li>
                      <li className="arena-rank-row current-user">
                        <span className="arena-rank-pos" aria-label={`Votre position : ${userRank}`}>{userRank}</span>
                        <span className="arena-rank-name">
                          {leaderboard[userRank - 1].studentName}
                          <span className="arena-you-chip">Vous</span>
                        </span>
                        <span className="arena-rank-wins">{leaderboard[userRank - 1].winCount} V</span>
                      </li>
                    </>
                  )}
                </ol>

                {userRank !== null && (
                  <div className="arena-my-rank-callout" role="status">
                    <span>Votre position actuelle</span>
                    <strong>#{userRank}</strong>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Subject performance */}
          {(strongSubjects.length > 0 || weakSubjects.length > 0) && (
            <section className="arena-section" aria-labelledby="subjects-title">
              <div className="arena-section-header">
                <div>
                  <p className="overline">Analyse</p>
                  <h2 className="arena-section-title" id="subjects-title">Mes matières</h2>
                </div>
              </div>

              {strongSubjects.length > 0 && (
                <div className="arena-subject-group">
                  <p className="arena-subject-group-label strong">Points forts ✓</p>
                  {strongSubjects.map((s) => (
                    <div key={s.subjectId} className="arena-subject-row">
                      <span className="arena-subject-name">{s.subjectName}</span>
                      <div
                        className="arena-subject-bar-track"
                        role="progressbar"
                        aria-valuenow={s.accuracy ?? 0}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${s.subjectName} : ${s.accuracy ?? 0}%`}
                      >
                        <div className="arena-subject-bar strong" style={{ width: `${s.accuracy ?? 0}%` }} />
                      </div>
                      <span className="arena-subject-accuracy">{s.accuracy ?? '—'}%</span>
                    </div>
                  ))}
                </div>
              )}

              {weakSubjects.length > 0 && (
                <div className="arena-subject-group">
                  <p className="arena-subject-group-label weak">À renforcer ↑</p>
                  {weakSubjects.map((s) => (
                    <div key={s.subjectId} className="arena-subject-row">
                      <span className="arena-subject-name">{s.subjectName}</span>
                      <div
                        className="arena-subject-bar-track"
                        role="progressbar"
                        aria-valuenow={s.accuracy ?? 0}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${s.subjectName} : ${s.accuracy ?? 0}%`}
                      >
                        <div className="arena-subject-bar weak" style={{ width: `${s.accuracy ?? 0}%` }} />
                      </div>
                      <span className="arena-subject-accuracy">{s.accuracy ?? '—'}%</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* ── EMPTY ONBOARDING ─────────────────────────────────────────────────── */}
      {history.length === 0 && !insightsLoading && (
        <section className="arena-onboarding" aria-labelledby="onboarding-title">
          <div className="arena-onboarding-inner">
            <p className="arena-onboarding-emoji" aria-hidden="true">🚀</p>
            <h2 className="arena-onboarding-title" id="onboarding-title">
              Prêt à écrire votre histoire ?
            </h2>
            <p className="arena-onboarding-text">
              Lancez votre première manche et rejoignez le classement national.
            </p>
            <button className="arena-play-now-btn" onClick={onGoToQuiz}>
              <span className="arena-play-icon" aria-hidden="true">⚡</span>
              COMMENCER
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

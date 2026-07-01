import { useMemo, useState } from 'react'
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Circle,
  Flame,
  Medal,
  Swords,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'

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

const LEVEL_THRESHOLDS = [100, 150, 200, 250, 300, 350, 400, 450, 500, 550]
const XP_AFTER_L10 = 600
const TITLE_BY_LEVEL = ['Apprenti', 'Stratège', 'Champion', 'Expert', 'Maître', 'Élite', 'Légende']

function computeLevel(xp: number) {
  let level = 1
  let accumulated = 0

  for (const increment of LEVEL_THRESHOLDS) {
    if (xp < accumulated + increment) {
      return { level, xpIntoLevel: xp - accumulated, xpNeeded: increment }
    }
    accumulated += increment
    level += 1
  }

  while (xp >= accumulated + XP_AFTER_L10) {
    accumulated += XP_AFTER_L10
    level += 1
  }

  return { level, xpIntoLevel: xp - accumulated, xpNeeded: XP_AFTER_L10 }
}

function formatNumber(value: number) {
  return value.toLocaleString('fr-HT')
}

function formatPct(value: number | null) {
  return value === null ? 'Non mesurée' : `${value}%`
}

function getInitials(user: AuthUser | null) {
  const first = user?.firstName?.trim()?.[0] ?? 'E'
  const last = user?.lastName?.trim()?.[0] ?? ''
  return `${first}${last}`.toUpperCase()
}

function DashboardHeader({
  fullName,
  subtitle,
  level,
  title,
  onPlay,
  onCompetitions,
  onProfile,
  avatarText,
}: {
  fullName: string
  subtitle: string
  level: number
  title: string
  onPlay: () => void
  onCompetitions: () => void
  onProfile: () => void
  avatarText: string
}) {
  return (
    <header className="student-command-header">
      <div className="student-command-title-block">
        <button className="student-avatar" type="button" onClick={onProfile} aria-label="Ouvrir mon profil">
          <span>{avatarText}</span>
        </button>
        <div>
          <p className="student-eyebrow">Dashboard étudiant</p>
          <h1>Dashboard étudiant</h1>
          <p>Bienvenue, {fullName}. {subtitle}</p>
          <div className="student-header-meta">
            <span>Niveau {level}</span>
            <span>{title}</span>
          </div>
        </div>
      </div>

      <div className="student-command-header-actions">
        <button className="student-btn student-btn-primary" type="button" onClick={onPlay}>
          <Swords size={16} />
          Jouer maintenant
        </button>
        <button className="student-btn student-btn-secondary" type="button" onClick={onCompetitions}>
          <Trophy size={16} />
          Voir les compétitions
        </button>
      </div>
    </header>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  progress,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  progress?: number
}) {
  return (
    <article className="student-card student-stat-card">
      <div className="student-card-row">
        <span className="student-icon-box">
          <Icon size={18} />
        </span>
        <p className="student-muted-label">{label}</p>
      </div>
      <strong>{value}</strong>
      <span>{detail}</span>
      {typeof progress === 'number' && (
        <div className="student-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </article>
  )
}

function StatsGrid({
  level,
  title,
  xpProgress,
  xpText,
  rank,
  accuracy,
  streak,
}: {
  level: number
  title: string
  xpProgress: number
  xpText: string
  rank: number | null
  accuracy: number | null
  streak: number
}) {
  return (
    <section className="student-stats-grid" aria-label="Résumé principal">
      <StatCard icon={Award} label="Niveau actuel" value={`Niveau ${level}`} detail={`${title} - ${xpText}`} progress={xpProgress} />
      <StatCard icon={Medal} label="Rang national" value={rank ? `#${rank}` : 'Non classé'} detail={rank ? '+8 places cette semaine' : 'Jouez pour entrer au classement'} />
      <StatCard icon={Target} label="Précision récente" value={formatPct(accuracy)} detail={accuracy !== null && accuracy >= 80 ? 'Objectif atteint' : 'Objectif recommandé: 80%'} progress={accuracy ?? 0} />
      <StatCard icon={Flame} label="Série actuelle" value={`${streak} jour${streak > 1 ? 's' : ''}`} detail="Meilleur record: 7 jours" />
    </section>
  )
}

function PlayModeCard({
  icon: Icon,
  title,
  description,
  status,
  actionLabel,
  onClick,
}: {
  icon: LucideIcon
  title: string
  description: string
  status?: string
  actionLabel: string
  onClick: () => void
}) {
  return (
    <article className="student-card student-mode-card">
      <div className="student-mode-top">
        <span className="student-icon-box">
          <Icon size={18} />
        </span>
        {status && <span className="student-badge">{status}</span>}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="student-link-button" type="button" onClick={onClick}>
        {actionLabel}
        <ChevronRight size={14} />
      </button>
    </article>
  )
}

function PlayModes({
  subjectsCount,
  upcomingCount,
  unreadLetters,
  onChallenge,
  onDuel,
  onArena,
  onCorrespondence,
}: {
  subjectsCount: number
  upcomingCount: number
  unreadLetters: number
  onChallenge: () => void
  onDuel: () => void
  onArena: () => void
  onCorrespondence: () => void
}) {
  return (
    <section className="student-section">
      <div className="student-section-heading">
        <div>
          <p className="student-eyebrow">Jouer</p>
          <h2>Que veux-tu faire maintenant ?</h2>
        </div>
      </div>
      <div className="student-play-grid">
        <PlayModeCard icon={Zap} title="Challenge" description="Entraînement rapide par matière." status={`${subjectsCount} matières`} actionLabel="Commencer" onClick={onChallenge} />
        <PlayModeCard icon={Swords} title="Duel classé" description="Affronter un élève en direct." status="Classé" actionLabel="Trouver un adversaire" onClick={onDuel} />
        <PlayModeCard icon={Trophy} title="Arena" description="Compétitions en direct et événements." status={upcomingCount ? `${upcomingCount} à venir` : 'Ouvert'} actionLabel="Entrer" onClick={onArena} />
        <PlayModeCard icon={BookOpen} title="Correspondance" description="Concours de lettres et échanges." status={unreadLetters ? `${unreadLetters} non lu` : 'Lettres'} actionLabel="Participer" onClick={onCorrespondence} />
      </div>
    </section>
  )
}

function DailyObjectives({
  objectives,
  completed,
}: {
  objectives: Array<{ id: string; label: string; current: number; target: number; unit?: string; done: boolean }>
  completed: number
}) {
  return (
    <section className="student-card student-section-card">
      <div className="student-section-heading compact">
        <div>
          <p className="student-eyebrow">Objectifs</p>
          <h2>Objectifs du jour</h2>
        </div>
        <span className="student-badge">{completed}/{objectives.length}</span>
      </div>
      <div className="student-objective-list">
        {objectives.map((objective) => {
          const progress = Math.min(100, Math.round((objective.current / objective.target) * 100))
          return (
            <div className="student-objective" key={objective.id}>
              {objective.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
              <div>
                <div className="student-objective-line">
                  <span>{objective.label}</span>
                  <span>{objective.current}/{objective.target}{objective.unit ?? ''}</span>
                </div>
                <div className="student-progress subtle" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="student-reward-row">
        <Trophy size={16} />
        <span>Récompense à la fin</span>
        <strong>+50 XP</strong>
      </div>
    </section>
  )
}

function RecentActivity({
  history,
  onSeeAll,
}: {
  history: HistoryEntry[]
  onSeeAll: () => void
}) {
  const activities = history.slice(0, 5).map((item) => {
    const pct = item.totalQuestions > 0 ? Math.round((item.score / item.totalQuestions) * 100) : 0
    const won = pct >= 60
    return {
      id: item.sessionId,
      title: `${won ? 'Victoire' : 'Défaite'} - ${item.subjectName}`,
      detail: `${item.score}/${item.totalQuestions} - ${pct}%`,
      value: won ? `+${item.score * 5} XP` : '-2 places',
      tone: won ? 'success' : 'danger',
    }
  })

  return (
    <section className="student-card student-panel-card">
      <PanelHeader title="Activité récente" actionLabel="Voir tout" onAction={onSeeAll} />
      {activities.length === 0 ? (
        <p className="student-empty">Aucune activité récente.</p>
      ) : (
        <div className="student-timeline">
          {activities.map((activity) => (
            <div className="student-timeline-item" key={activity.id}>
              <span className={`student-timeline-dot ${activity.tone}`} />
              <div>
                <strong>{activity.title}</strong>
                <span>{activity.detail}</span>
              </div>
              <em className={activity.tone}>{activity.value}</em>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function LeaderboardCard({
  rows,
  currentUserId,
  onOpen,
  loading,
}: {
  rows: LeaderboardRow[]
  currentUserId?: string
  onOpen: () => void
  loading: boolean
}) {
  const [tab, setTab] = useState('National')
  const tabs = ['National', 'École', 'Classe', 'Amis']

  return (
    <section className="student-card student-panel-card">
      <PanelHeader title="Classement" actionLabel="Complet" onAction={onOpen} />
      <div className="student-tabs" role="tablist" aria-label="Type de classement">
        {tabs.map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} type="button" onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="student-empty">{loading ? 'Chargement du classement...' : 'Aucun classement disponible.'}</p>
      ) : (
        <div className="student-table-wrap">
          <table className="student-table">
            <thead>
              <tr>
                <th>Pos.</th>
                <th>Nom</th>
                <th>Points</th>
                <th>Évol.</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((row, index) => (
                <tr key={row.userId} className={row.userId === currentUserId ? 'current' : ''}>
                  <td>#{index + 1}</td>
                  <td>{row.studentName}</td>
                  <td>{formatNumber(row.totalCorrectAnswers + row.winCount * 25)}</td>
                  <td className={index % 3 === 2 ? 'neutral' : 'success'}>{index % 3 === 2 ? '-' : `+${index + 1}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function RecommendationsCard({
  recommendations,
  weakSubject,
  mode,
  onSeeAll,
}: {
  recommendations: StudentInsights['recommendations']
  weakSubject: InsightSubject | null
  mode: string
  onSeeAll: () => void
}) {
  const items = [
    { label: 'Matière à renforcer', value: weakSubject?.subjectName ?? 'Mathématiques' },
    { label: 'Mode recommandé aujourd’hui', value: mode },
    { label: 'Objectif prioritaire', value: weakSubject ? 'Stabiliser la précision' : 'Maintenir le rythme' },
    { label: 'Prochain défi conseillé', value: recommendations[0]?.title ?? 'Challenge chronométré' },
  ]

  return (
    <section className="student-card student-panel-card">
      <PanelHeader title="Recommandations" actionLabel="Voir tout" onAction={onSeeAll} />
      <div className="student-recommendation-list">
        {items.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function UpcomingCompetitions({
  onArena,
  onCorrespondence,
}: {
  onArena: () => void
  onCorrespondence: () => void
}) {
  const competitions = [
    { name: 'Tournoi Mathématiques', subject: 'Mathématiques', date: 'Aujourd’hui 16h', status: 'En direct', action: onArena },
    { name: 'Arena Créole', subject: 'Créole', date: 'Demain 15h', status: 'Inscription', action: onArena },
    { name: 'Championnat national', subject: 'Général', date: 'Dimanche 14h', status: 'À venir', action: onArena },
    { name: 'Correspondance', subject: 'Rédaction', date: 'Cette semaine', status: 'Ouvert', action: onCorrespondence },
  ]

  return (
    <section className="student-card student-section-card">
      <div className="student-section-heading compact">
        <div>
          <p className="student-eyebrow">Compétitions</p>
          <h2>Compétitions à venir</h2>
        </div>
      </div>
      <div className="student-competition-list">
        {competitions.map((competition) => (
          <div className="student-competition-row" key={competition.name}>
            <div>
              <strong>{competition.name}</strong>
              <span>{competition.subject} - {competition.date}</span>
            </div>
            <span className="student-badge">{competition.status}</span>
            <button className="student-link-button" type="button" onClick={competition.action}>
              Voir
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function ProgressionCard({
  strongSubjects,
  weakSubjects,
}: {
  strongSubjects: InsightSubject[]
  weakSubjects: InsightSubject[]
}) {
  const rows = [...weakSubjects, ...strongSubjects].slice(0, 4)

  return (
    <section className="student-card student-section-card">
      <div className="student-section-heading compact">
        <div>
          <p className="student-eyebrow">Progression</p>
          <h2>Performances par matière</h2>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="student-empty">Les performances par matière apparaîtront après quelques activités.</p>
      ) : (
        <div className="student-subject-list">
          {rows.map((subject) => (
            <div className="student-subject-row" key={subject.subjectId}>
              <span>{subject.subjectName}</span>
              <div className="student-progress subtle" role="progressbar" aria-valuenow={subject.accuracy ?? 0} aria-valuemin={0} aria-valuemax={100}>
                <div className={subject.level === 'needs_work' ? 'danger' : ''} style={{ width: `${subject.accuracy ?? 0}%` }} />
              </div>
              <strong>{subject.accuracy ?? 0}%</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PanelHeader({ title, actionLabel, onAction }: { title: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="student-panel-header">
      <h2>{title}</h2>
      <button type="button" onClick={onAction}>{actionLabel}</button>
    </div>
  )
}

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
  const totalXP = useMemo(() => {
    const quizXP = (insights?.summary.quizzes.totalSessions ?? history.length) * 20
    const duelXP = (insights?.summary.duels.wins ?? 0) * 35
    const arenaXP = (insights?.summary.arena.totalWins ?? 0) * 80
    const arenaPoints = (insights?.summary.arena.periodPoints ?? 0) * 2
    return quizXP + duelXP + arenaXP + arenaPoints
  }, [history.length, insights])
  const { level, xpIntoLevel, xpNeeded } = useMemo(() => computeLevel(totalXP), [totalXP])
  const xpProgress = Math.round((xpIntoLevel / xpNeeded) * 100)
  const title = TITLE_BY_LEVEL[Math.min(level - 1, TITLE_BY_LEVEL.length - 1)]
  const rankIndex = leaderboard.findIndex((row) => row.userId === user?.id)
  const rank = rankIndex >= 0 ? rankIndex + 1 : null
  const accuracy = insights?.summary.quizzes.accuracy ?? insights?.summary.duels.accuracy ?? null
  const streak = insights?.period.activeDays ?? Math.min(history.length, 7)
  const fullName = `${user?.firstName ?? 'Élève'} ${user?.lastName ?? ''}`.trim()
  const className = classes.find((item) => item.id === user?.classId)?.name
  const weakSubjects = insights?.summary.subjects.filter((subject) => subject.level === 'needs_work') ?? []
  const strongSubjects = insights?.summary.subjects.filter((subject) => subject.level === 'strong') ?? []
  const weakestSubject = weakSubjects[0] ?? null
  const quizzesPlayed = insights?.summary.quizzes.totalSessions ?? history.length
  const duelWins = insights?.summary.duels.wins ?? 0
  const recommendedMode = weakestSubject ? 'Entraînement rapide' : 'Duel classé'
  const objectives = [
    { id: 'matches', label: 'Jouer 3 matchs', current: Math.min(quizzesPlayed, 3), target: 3, done: quizzesPlayed >= 3 },
    { id: 'duel', label: 'Gagner un duel', current: Math.min(duelWins, 1), target: 1, done: duelWins >= 1 },
    { id: 'accuracy', label: 'Atteindre 80 % de précision', current: Math.min(accuracy ?? 0, 80), target: 80, unit: '%', done: (accuracy ?? 0) >= 80 },
    { id: 'subject', label: 'Pratiquer une matière faible', current: weakestSubject && weakestSubject.answered > 0 ? 1 : 0, target: 1, done: Boolean(weakestSubject && weakestSubject.answered > 0) },
  ]
  const completed = objectives.filter((objective) => objective.done).length

  return (
    <div className="student-command">
      <DashboardHeader
        fullName={fullName}
        subtitle={className ? `Voici ton activité académique en ${className}.` : 'Voici ton activité académique.'}
        level={level}
        title={title}
        avatarText={getInitials(user)}
        onPlay={onGoToQuiz}
        onCompetitions={onGoToArena}
        onProfile={onGoToProfile}
      />

      <div className="student-command-layout">
        <main className="student-command-main">
          <StatsGrid
            level={level}
            title={title}
            xpProgress={xpProgress}
            xpText={`${formatNumber(xpIntoLevel)} / ${formatNumber(xpNeeded)} XP`}
            rank={rank}
            accuracy={accuracy}
            streak={streak}
          />
          <PlayModes
            subjectsCount={subjects.length}
            upcomingCount={insights?.summary.arena.upcomingRegistrations ?? 0}
            unreadLetters={insights?.summary.correspondence.unopenedAssignments ?? 0}
            onChallenge={onGoToQuiz}
            onDuel={onGoToQuiz}
            onArena={onGoToArena}
            onCorrespondence={onGoToCorrespondence}
          />
          <div className="student-two-column">
            <DailyObjectives objectives={objectives} completed={completed} />
            <UpcomingCompetitions onArena={onGoToArena} onCorrespondence={onGoToCorrespondence} />
          </div>
          <ProgressionCard strongSubjects={strongSubjects} weakSubjects={weakSubjects} />
        </main>

        <aside className="student-command-aside">
          <RecentActivity history={history} onSeeAll={onGoToHistory} />
          <LeaderboardCard rows={leaderboard} currentUserId={user?.id} onOpen={onGoToLeaderboard} loading={insightsLoading} />
          <RecommendationsCard
            recommendations={insights?.recommendations ?? []}
            weakSubject={weakestSubject}
            mode={recommendedMode}
            onSeeAll={onGoToRecommendations}
          />
        </aside>
      </div>
    </div>
  )
}



import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiCall } from '../api/client'
import ArenaWorkspace from '../arena/ArenaWorkspace'
import DashboardSidebar, { type DashboardSidebarSection } from '../components/DashboardSidebar'
import NotificationCenter from '../components/NotificationCenter'
import { HAITI_CITIES_BY_DEPARTMENT, HAITI_DEPARTMENTS } from '../constants/haitiDepartments'
import {
  castVote, createLetter, createReport, getInbox, getMyLetters,
  getThread, listSessions, openAssignment, sendMessage, submitLetter, updateLetter,
} from '../correspondence/correspondenceApi'
import type { ContestSession, InboxItem, Letter, OpenedAssignment, Thread, ThreadMessage } from '../correspondence/types'
import StudentLearning from '../learning/StudentLearning'
import AccountSecurity from '../account/AccountSecurity'
import AccountPreferences from '../account/AccountPreferences'
import StudentDashboardHome from './StudentDashboardHome'

type Tab = 'home' | 'summary' | 'recommendations' | 'statistics' | 'quiz' | 'history' | 'leaderboard' | 'notifications' | 'profile' | 'arena' | 'correspondence' | 'library' | 'ai' | 'security' | 'preferences'
type CorrView = 'sessions' | 'write' | 'myletters' | 'inbox' | 'thread'
type QuizMode = 'chrono' | 'training' | 'minute'
type SchoolClass = { id: string; name: string }
type Subject = { id: string; name: string; classId: string }
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
  lossCount: number
  duelCount: number
  totalCorrectAnswers: number
  winTimeSeconds: number
  lastWinAt: string | null
}
type Notification = {
  id: string
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
}
type QuizStartResponse = {
  sessionId: string
  questions: Array<{
    sessionQuestionId: string
    questionId: string
    prompt: string
    options: { A: string; B: string; C: string; D: string }
    difficulty: string
    correctOption: 'A' | 'B' | 'C' | 'D'
    explanation: string | null
  }>
}

type MatchmakingResponse = {
  duelId: string
  status: 'waiting' | 'in_progress' | 'completed'
  competitionId: string
}
type InsightAction =
  | { type: 'start_quiz'; subjectId: string }
  | { type: 'open_duels'; subjectId?: string }
  | { type: 'open_arena'; competitionId?: string }
  | { type: 'open_correspondence'; view: CorrView; targetId?: string }
  | { type: 'view_history' }

type StudentInsights = {
  generatedFor: string
  period: { from: string; to: string; days: number; previousFrom: string; previousTo: string; activeDays: number }
  summary: {
    activeDays: number
    quizzes: { periodSessions: number; previousSessions: number; totalSessions: number; accuracy: number | null; previousAccuracy: number | null; trend: number | null }
    duels: { periodParticipations: number; previousParticipations: number; totalParticipations: number; wins: number; losses: number; draws: number; accuracy: number | null; previousAccuracy: number | null; trend: number | null }
    arena: { periodCompetitions: number; previousCompetitions: number; totalCompetitions: number; periodWins: number; totalWins: number; periodCorrectAnswers: number; periodPoints: number; previousPoints: number; upcomingRegistrations: number }
    correspondence: { periodLettersSubmitted: number; previousLettersSubmitted: number; totalLettersSubmitted: number; periodMessagesSent: number; previousMessagesSent: number; totalMessagesSent: number; drafts: number; unopenedAssignments: number; awaitingReplies: number }
    subjects: Array<{ subjectId: string; subjectName: string; answered: number; correct: number; accuracy: number | null; level: 'strong' | 'needs_work' | 'insufficient_data' }>
    activityTimeline: Array<{ date: string; quizzes: number; duels: number; arena: number; correspondence: number; total: number }>
  }
  recommendations: Array<{ id: string; category: 'learning' | 'competition' | 'participation'; title: string; reason: string; action: InsightAction }>
}


const insightValue = (value: number | null, suffix = '') => value === null ? '—' : value + suffix
const trendText = (trend: number | null) => {
  if (trend === null) return 'Pas encore de comparaison'
  if (trend === 0) return 'Stable par rapport à la période précédente'
  return (trend > 0 ? '+' : '') + trend + ' points par rapport à la période précédente'
}
const insightActionLabel = (action: InsightAction) => {
  switch (action.type) {
    case 'start_quiz': return 'Lancer cet entraînement'
    case 'open_duels': return 'Ouvrir les duels'
    case 'open_arena': return 'Ouvrir Arena'
    case 'open_correspondence': return 'Ouvrir Correspondance'
    case 'view_history': return 'Voir mon historique'
  }
}
export default function StudentDashboard() {
  const { user, accessToken, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('home')

  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationError, setNotificationError] = useState('')
  const [insights, setInsights] = useState<StudentInsights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')

  const [quizSubjectId, setQuizSubjectId] = useState('')
  const [quizMode, setQuizMode] = useState<QuizMode>('chrono')
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizError, setQuizError] = useState('')
  const [duelSubjectId, setDuelSubjectId] = useState('')
  const [duelLoading, setDuelLoading] = useState(false)
  const [duelError, setDuelError] = useState('')

  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    classId: user?.classId ?? '',
    school: user?.school ?? '',
    city: user?.city ?? '',
    department: user?.department ?? '',
    sectionName: user?.sectionName ?? '',
    canBeContacted: user?.canBeContacted ?? false,
  })
  const [profileMsg, setProfileMsg] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const cityOptions = profileForm.department ? HAITI_CITIES_BY_DEPARTMENT[profileForm.department as keyof typeof HAITI_CITIES_BY_DEPARTMENT] ?? [] : []

  // ── Correspondence state ─────────────────────────────────────────────────────
  const [corrView, setCorrView] = useState<CorrView>('sessions')
  const [corrSessions, setCorrSessions] = useState<ContestSession[]>([])
  const [corrSelectedSession, setCorrSelectedSession] = useState<ContestSession | null>(null)
  const [corrLetter, setCorrLetter] = useState<Letter | null>(null)
  const [corrLetterBody, setCorrLetterBody] = useState('')
  const [corrLetterSaving, setCorrLetterSaving] = useState(false)
  const [corrMyLetters, setCorrMyLetters] = useState<Letter[]>([])
  const [corrInbox, setCorrInbox] = useState<InboxItem[]>([])
  const [corrOpenedAssignment, setCorrOpenedAssignment] = useState<OpenedAssignment | null>(null)
  const [corrThread, setCorrThread] = useState<Thread | null>(null)
  const [corrThreadMessages, setCorrThreadMessages] = useState<ThreadMessage[]>([])
  const [corrNewMessage, setCorrNewMessage] = useState('')
  const [corrSendingMessage, setCorrSendingMessage] = useState(false)
  const [corrLoading, setCorrLoading] = useState(false)
  const [corrError, setCorrError] = useState('')
  const corrSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const unreadCount = notifications.filter((n) => !n.isRead).length

  useEffect(() => {
    setProfileForm((current) => ({
      ...current,
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      classId: user?.classId ?? '',
      school: user?.school ?? '',
      city: user?.city ?? '',
      department: user?.department ?? '',
      sectionName: user?.sectionName ?? '',
      canBeContacted: user?.canBeContacted ?? false,
    }))
  }, [user])

  useEffect(() => {
    if (!user?.classId) {
      setSubjects([])
      setQuizSubjectId('')
      setDuelSubjectId('')
      return
    }

    apiCall<Subject[]>(`/subjects?classId=${user.classId}`)
      .then(setSubjects)
      .catch(() => {})
    setQuizSubjectId('')
    setDuelSubjectId('')
  }, [user?.classId])

  const loadHistory = useCallback(
    () => apiCall<HistoryEntry[]>('/quizzes/history', {}, accessToken).then(setHistory).catch(() => {}),
    [accessToken],
  )

  const loadLeaderboard = useCallback(
    () => apiCall<LeaderboardRow[]>('/leaderboard/weekly').then(setLeaderboard).catch(() => {}),
    [],
  )

  const loadNotifications = useCallback(
    () => apiCall<Notification[]>('/notifications', {}, accessToken).then(setNotifications).catch(() => {}),
    [accessToken],
  )
  const loadInsights = useCallback(async () => {
    if (!accessToken) return
    setInsightsLoading(true)
    setInsightsError('')
    try {
      setInsights(await apiCall<StudentInsights>('/student/insights', {}, accessToken))
    } catch (err) {
      setInsightsError((err as { message?: string }).message ?? 'Impossible de charger votre progression.')
    } finally {
      setInsightsLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    apiCall<SchoolClass[]>('/classes').then(setClasses).catch(() => {})
    loadNotifications()
  }, [loadNotifications])

  useEffect(() => {
    if (!accessToken) return

    const refreshNotifications = () => {
      loadNotifications()
    }

    const intervalId = window.setInterval(refreshNotifications, 10000)
    window.addEventListener('focus', refreshNotifications)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshNotifications)
    }
  }, [accessToken, loadNotifications])

  useEffect(() => {
    if (tab === 'home' || tab === 'history') loadHistory()
    if (tab === 'leaderboard') loadLeaderboard()
    if (tab === 'notifications') loadNotifications()
    if (tab === 'home' || tab === 'summary' || tab === 'recommendations' || tab === 'statistics') void loadInsights()
  }, [loadHistory, loadInsights, loadLeaderboard, loadNotifications, tab])

  const startQuiz = async () => {
    setQuizError('')
    if (!quizSubjectId) { setQuizError('Choisissez une matière.'); return }
    setQuizLoading(true)
    try {
      const data = await apiCall<QuizStartResponse>('/quizzes/start', {
        method: 'POST',
        body: JSON.stringify({ subjectId: quizSubjectId }),
      }, accessToken)
      navigate(`/quiz/${data.sessionId}`, { state: { questions: data.questions, mode: quizMode } })
    } catch (err) {
      setQuizError((err as { message: string }).message)
    } finally {
      setQuizLoading(false)
    }
  }

  const quizModes: Array<{ id: QuizMode; label: string; detail: string; cue: string }> = [
    { id: 'chrono', label: 'Defi chrono', detail: '10 s par question', cue: '10s' },
    { id: 'training', label: 'Mode entrainement', detail: '20 s avec correction', cue: '20s' },
    { id: 'minute', label: 'Course minute', detail: '1 min avec Passer', cue: '60s' },
  ]
  const markAllRead = async () => {
    await apiCall('/notifications/read-all', { method: 'PATCH' }, accessToken).catch(() => {})
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
  }

  const markOneRead = async (id: string) => {
    await apiCall(`/notifications/${id}/read`, { method: 'PATCH' }, accessToken).catch(() => {})
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n))
  }

  const deleteNotification = async (id: string) => {
    setNotificationError('')
    try {
      await apiCall(`/notifications/${id}`, { method: 'DELETE' }, accessToken)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch (err) {
      setNotificationError((err as { message?: string }).message ?? 'Suppression impossible pour le moment.')
    }
  }

  const searchOpponent = async () => {
    setDuelError('')
    if (!duelSubjectId) {
      setDuelError('Choisissez une matière.')
      return
    }

    setDuelLoading(true)
    try {
      const data = await apiCall<MatchmakingResponse>('/duels/matchmaking/join', {
        method: 'POST',
        body: JSON.stringify({ subjectId: duelSubjectId }),
      }, accessToken)
      navigate(`/duel/${data.duelId}`)
    } catch (err) {
      setDuelError((err as { message: string }).message)
    } finally {
      setDuelLoading(false)
    }
  }

  // ── Correspondence handlers ─────────────────────────────────────────────────
  const loadCorrSessions = useCallback(async () => {
    if (!accessToken) return
    setCorrLoading(true); setCorrError('')
    try { setCorrSessions(await listSessions(accessToken)) }
    catch (e: unknown) { setCorrError(e instanceof Error ? e.message : 'Erreur') }
    finally { setCorrLoading(false) }
  }, [accessToken])

  const loadCorrMyLetters = useCallback(async () => {
    if (!accessToken) return
    try { setCorrMyLetters(await getMyLetters(accessToken)) }
    catch { /* non-critical */ }
  }, [accessToken])

  const loadCorrInbox = useCallback(async () => {
    if (!accessToken) return
    setCorrLoading(true)
    try { setCorrInbox(await getInbox(accessToken)) }
    catch (e: unknown) { setCorrError(e instanceof Error ? e.message : 'Erreur') }
    finally { setCorrLoading(false) }
  }, [accessToken])

  useEffect(() => {
    if (tab !== 'correspondence') return
    if (corrView === 'sessions') void loadCorrSessions()
    if (corrView === 'myletters') void loadCorrMyLetters()
    if (corrView === 'inbox') void loadCorrInbox()
  }, [tab, corrView, loadCorrSessions, loadCorrMyLetters, loadCorrInbox])

  const openCorrSession = async (session: ContestSession) => {
    if (!accessToken) return
    setCorrSelectedSession(session)
    try {
      const letters = await getMyLetters(accessToken)
      const existing = letters.find((l) => l.sessionId === session.id)
      if (existing) {
        setCorrLetter(existing)
        setCorrLetterBody(existing.body)
      } else {
        const created = await createLetter(session.id, '', undefined, accessToken)
        setCorrLetter(created)
        setCorrLetterBody('')
      }
    } catch (e: unknown) { setCorrError(e instanceof Error ? e.message : 'Erreur') }
    setCorrView('write')
  }

  const autosaveCorrLetter = useCallback((body: string) => {
    if (!accessToken || !corrLetter || corrLetter.status !== 'draft') return
    if (corrSaveTimer.current) clearTimeout(corrSaveTimer.current)
    corrSaveTimer.current = setTimeout(async () => {
      setCorrLetterSaving(true)
      try { await updateLetter(corrLetter.id, body, undefined, accessToken) }
      catch { /* swallow */ }
      finally { setCorrLetterSaving(false) }
    }, 1500)
  }, [accessToken, corrLetter])

  const submitCorrLetter = async () => {
    if (!accessToken || !corrLetter) return
    setCorrLoading(true); setCorrError('')
    try {
      const updated = await submitLetter(corrLetter.id, accessToken)
      setCorrLetter(updated)
    } catch (e: unknown) { setCorrError(e instanceof Error ? e.message : 'Erreur') }
    finally { setCorrLoading(false) }
  }

  const openCorrAssignment = async (item: InboxItem) => {
    if (!accessToken) return
    setCorrLoading(true); setCorrError('')
    try {
      const opened = await openAssignment(item.assignmentId, accessToken)
      setCorrOpenedAssignment(opened)
      setCorrView('thread')
      if (!item.threadId) return
      const thread = await getThread(item.threadId, accessToken)
      setCorrThread(thread)
      setCorrThreadMessages(thread.messages ?? [])
    } catch (e: unknown) { setCorrError(e instanceof Error ? e.message : 'Erreur') }
    finally { setCorrLoading(false) }
  }

  const sendCorrMessage = async () => {
    if (!accessToken || !corrThread || !corrNewMessage.trim()) return
    setCorrSendingMessage(true)
    try {
      const msg = await sendMessage(corrThread.threadId, corrNewMessage, accessToken)
      setCorrThreadMessages((prev) => [...prev, msg as unknown as ThreadMessage])
      setCorrNewMessage('')
    } catch (e: unknown) { setCorrError(e instanceof Error ? e.message : 'Erreur') }
    finally { setCorrSendingMessage(false) }
  }

  const reportCorrItem = async (targetType: 'letter' | 'message', targetId: string, reason: string) => {
    if (!accessToken) return
    try { await createReport(targetType, targetId, reason, undefined, accessToken) }
    catch { /* swallow */ }
  }

  const castCorrVote = async (sessionId: string, letterId: string, score: number) => {
    if (!accessToken) return
    try { await castVote(sessionId, letterId, score, accessToken) }
    catch (e: unknown) { setCorrError(e instanceof Error ? e.message : 'Erreur') }
  }

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setProfileMsg('')
    setProfileError('')
    setProfileLoading(true)
    try {
      const body: Record<string, unknown> = {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        classId: profileForm.classId || undefined,
        school: profileForm.school || undefined,
        city: profileForm.city || undefined,
        department: profileForm.department || undefined,
        sectionName: profileForm.sectionName || undefined,
        canBeContacted: profileForm.canBeContacted,
      }
      const updated = await apiCall<typeof user>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }, accessToken)
      updateUser(updated!)
      setProfileMsg('Profil mis à jour avec succès !')
    } catch (err) {
      setProfileError((err as { message: string }).message)
    } finally {
      setProfileLoading(false)
    }
  }

  const openStudentTab = (nextTab: Tab) => {
    setTab(nextTab)
  }

  const openStudentCorrespondence = (nextView: CorrView) => {
    setTab('correspondence')
    setCorrView(nextView)
    setCorrError('')
  }
  const runInsightAction = (action: InsightAction) => {
    switch (action.type) {
      case 'start_quiz':
        if (subjects.some((subject) => subject.id === action.subjectId)) setQuizSubjectId(action.subjectId)
        setTab('quiz')
        break
      case 'open_duels':
        if (action.subjectId && subjects.some((subject) => subject.id === action.subjectId)) setDuelSubjectId(action.subjectId)
        setTab('quiz')
        break
      case 'open_arena':
        setTab('arena')
        break
      case 'open_correspondence':
        if (['sessions', 'write', 'myletters', 'inbox', 'thread'].includes(action.view)) openStudentCorrespondence(action.view)
        break
      case 'view_history':
        setTab('history')
        break
    }
  }

  const studentSidebarSections: DashboardSidebarSection[] = [
    {
      title: 'Tableau de bord',
      note: 'Point d\'entrée',
      items: [
        { id: 'home', label: 'Accueil', onClick: () => openStudentTab('home'), active: tab === 'home' },
        { id: 'home-summary', label: 'Résumé personnel', onClick: () => openStudentTab('summary'), active: tab === 'summary' },
        { id: 'home-reco', label: 'Recommandations du jour', onClick: () => openStudentTab('recommendations'), active: tab === 'recommendations' },
      ],
    },
    {
      title: 'Compétitions',
      note: 'Quiz et défis',
      items: [
        { id: 'quiz', label: 'Challenge', onClick: () => openStudentTab('quiz'), active: tab === 'quiz' },
        { id: 'arena', label: 'Arena', onClick: () => openStudentTab('arena'), active: tab === 'arena' },
        { id: 'leaderboard', label: 'Classement', onClick: () => openStudentTab('leaderboard'), active: tab === 'leaderboard' },
      ],
    },
    {
      title: 'Correspondance',
      note: 'Échanges',
      items: [
        { id: 'corr-sessions', label: 'Concours', onClick: () => openStudentCorrespondence('sessions'), active: tab === 'correspondence' && corrView === 'sessions' },
        { id: 'corr-myletters', label: 'Mes lettres', onClick: () => openStudentCorrespondence('myletters'), active: tab === 'correspondence' && corrView === 'myletters' },
        { id: 'corr-inbox', label: 'Boîte de réception', onClick: () => openStudentCorrespondence('inbox'), active: tab === 'correspondence' && corrView === 'inbox' },
      ],
    },
    {
      title: 'Activité',
      note: 'Suivi',
      items: [
        { id: 'history', label: 'Historique', onClick: () => openStudentTab('history'), active: tab === 'history' },
        { id: 'notifications', label: 'Notifications', onClick: () => openStudentTab('notifications'), active: tab === 'notifications', badge: unreadCount > 0 ? unreadCount : undefined },
        { id: 'stats', label: 'Statistiques', onClick: () => openStudentTab('statistics'), active: tab === 'statistics' },
      ],
    },
    {
      title: 'Apprentissage',
      note: 'Programme',
      items: [
        { id: 'library', label: 'Bibliotheque intelligente', onClick: () => openStudentTab('library'), active: tab === 'library' || tab === 'ai' },
      ],
    },
    {
      title: 'Compte',
      note: 'Profil',
      items: [
        { id: 'profile', label: 'Profil', onClick: () => openStudentTab('profile'), active: tab === 'profile' },
        { id: 'security', label: 'Sécurité', onClick: () => openStudentTab('security'), active: tab === 'security' },
        { id: 'preferences', label: 'Préférences', onClick: () => openStudentTab('preferences'), active: tab === 'preferences' },
      ],
    },
  ]

  const studentMobileNavItems: { key: Tab; label: string }[] = [
    { key: 'home', label: 'Accueil' },
    { key: 'summary', label: 'Résumé' },
    { key: 'recommendations', label: 'Conseils' },
    { key: 'quiz', label: 'Challenge' },
    { key: 'history', label: 'Historique' },
    { key: 'statistics', label: 'Stats' },
    { key: 'leaderboard', label: 'Rang' },
    { key: 'correspondence', label: 'Lettres' },
    { key: 'library', label: 'Manuel' },
    { key: 'profile', label: 'Profil' },
    { key: 'security', label: 'Sécurité' },
    { key: 'preferences', label: 'Préférences' },
  ]

  const avgScore =
    history.length > 0
      ? Math.round(history.reduce((s, h) => s + h.score, 0) / history.length)
      : 0
  const bestScore = history.length > 0 ? Math.max(...history.map((h) => h.score)) : 0
  const selectedDuelSubject = subjects.find((subject) => subject.id === duelSubjectId)
  const maxDailyActivity = Math.max(1, ...(insights?.summary.activityTimeline.map((day) => day.total) ?? [1]))
  const podiumRows = leaderboard.slice(0, 3).map((row, index) => ({
    ...row,
    rank: index + 1,
    isCurrentUser: row.userId === user?.id,
  }))
  const podiumDisplay =
    podiumRows.length === 3
      ? [podiumRows[1], podiumRows[0], podiumRows[2]]
      : podiumRows

  return (
    <div className="dashboard-shell flex">
      <DashboardSidebar
        portalLabel="Dashboard étudiant"
        identityLabel={`${user?.firstName ?? 'Étudiant'} ${user?.lastName ?? ''}`.trim()}
        identityCaption={classes.find((c) => c.id === user?.classId)?.name ?? 'Génie scolaire'}
        identityMeta="Navigation hiérarchique"
        avatarText={user?.firstName?.[0] ?? 'E'}
        sections={studentSidebarSections}
        onLogout={logout}
        logoutLabel="Déconnexion"
        footerNote="Suivez vos activités, vos résultats et votre progression."
      />

      {/* ── MAIN ── */}
      <main className="flex-1" style={{ marginLeft: 0, paddingBottom: 80 }} >
        {/* Mobile top bar */}
        <div className="md:hidden" style={{ background: '#fff', borderBottom: '1px solid var(--rule)', padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <span className="brand" style={{ fontSize: 16, color: 'var(--cobalt)' }}>Konesans</span>
            <span className="brand" style={{ fontSize: 16, color: 'var(--gold)' }}>+</span>
          </div>
          <div className="flex items-center" style={{ gap: 12 }}>
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            <button onClick={logout} style={{ fontSize: 16, color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Quitter</button>
          </div>
        </div>

        <div className="dashboard-main md:ml-[292px]" style={{ maxWidth: tab === 'quiz' || tab === 'arena' || tab === 'library' || tab === 'ai' ? 1100 : 820 }}>


          {/* -- HOME -- */}
          {tab === 'home' && (
            <StudentDashboardHome
              user={user}
              history={history}
              leaderboard={leaderboard}
              classes={classes}
              subjects={subjects}
              insights={insights}
              insightsLoading={insightsLoading}
              onGoToQuiz={() => setTab('quiz')}
              onGoToArena={() => setTab('arena')}
              onGoToLeaderboard={() => setTab('leaderboard')}
              onGoToCorrespondence={() => { setTab('correspondence'); setCorrView('sessions') }}
              onGoToHistory={() => setTab('history')}
              onGoToRecommendations={() => setTab('recommendations')}
              onGoToProfile={() => setTab('profile')}
            />
          )}


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

type Tab = 'home' | 'summary' | 'recommendations' | 'statistics' | 'quiz' | 'history' | 'leaderboard' | 'notifications' | 'profile' | 'arena' | 'correspondence' | 'library' | 'ai' | 'security' | 'preferences'
type CorrView = 'sessions' | 'write' | 'myletters' | 'inbox' | 'thread'
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
      navigate(`/quiz/${data.sessionId}`, { state: { questions: data.questions } })
    } catch (err) {
      setQuizError((err as { message: string }).message)
    } finally {
      setQuizLoading(false)
    }
  }

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
        { id: 'library', label: 'Bibliothèque de contenus', onClick: () => openStudentTab('library'), active: tab === 'library' },
        { id: 'ai', label: 'IA pédagogique', onClick: () => openStudentTab('ai'), active: tab === 'ai' },
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
    { key: 'statistics', label: 'Statistiques' },
    { key: 'leaderboard', label: 'Classement' },
    { key: 'correspondence', label: 'Correspondance' },
    { key: 'library', label: 'Bibliotheque' },
    { key: 'ai', label: 'Tuteur IA' },
    { key: 'profile', label: 'Profil' },
    { key: 'security', label: 'Securite' },
    { key: 'preferences', label: 'Preferences' },
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


          {/* ── HOME ── */}
          {tab === 'home' && (
            <div>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 4 }}>Bonjour, {user?.firstName}.</h1>
              <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 22, fontWeight: 500 }}>
                {(insights?.summary.quizzes.totalSessions ?? history.length) > 0
                  ? (insights?.summary.quizzes.totalSessions ?? history.length) + ' challenge(s) enregistré(s) · ' + (insights?.period.activeDays ?? 0) + ' jour(s) actif(s) récemment'
                  : 'Aucune session encore — lancez votre première manche.'}
              </p>

              <div className="responsive-three-col" style={{ border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden', marginBottom: 24 }}>
                {[
                  { label: 'Challenges joués', value: insights?.summary.quizzes.totalSessions ?? history.length, accent: 'var(--cobalt)' },
                  { label: 'Meilleur score', value: bestScore, accent: 'var(--cobalt)' },
                  { label: 'Précision récente', value: insights?.summary.quizzes.accuracy === null || insights?.summary.quizzes.accuracy === undefined ? '—' : insights.summary.quizzes.accuracy + '%', accent: 'var(--cobalt)' },
                ].map((stat) => (
                  <div key={stat.label} className="mobile-stat-card" style={{ background: '#fff', padding: '20px 18px' }}>
                    <div className="display" style={{ fontSize: 36, color: stat.accent, letterSpacing: '-0.03em', lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600 }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="card responsive-stack row" style={{ marginBottom: 28 }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--cobalt)' }}>Une manche d’entraînement ?</p>
                <button onClick={() => setTab('quiz')} className="btn btn-primary" style={{ flexShrink: 0 }}>Lancer une manche</button>
              </div>

              {history.length > 0 && (
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 14 }}>Dernières sessions</p>
                  <div style={{ border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden' }}>
                    {history.slice(0, 3).map((h, i, arr) => (
                      <div key={h.sessionId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--rule)' : 'none', background: '#fff' }}>
                        <div>
                          <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{h.subjectName}</p>
                          <p style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 2 }}>{h.className} · {new Date(h.playedAt).toLocaleDateString('fr-HT')}</p>
                        </div>
                        <span style={{ fontSize: 18, fontWeight: 700, color: h.score >= 7 ? 'var(--ok)' : h.score >= 5 ? 'var(--gold)' : 'var(--error)', fontVariantNumeric: 'tabular-nums' }}>{h.score} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* PERSONAL SUMMARY */}
          {tab === 'summary' && (
            <div className="insights-page">
              <div className="insights-heading">
                <div>
                  <p className="overline">30 derniers jours</p>
                  <h1 className="display">Résumé personnel</h1>
                  <p>Vos activités restent séparées pour montrer clairement où vous progressez.</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => void loadInsights()} disabled={insightsLoading}>Actualiser</button>
              </div>

              {insightsError && <div className="alert alert-error">{insightsError}</div>}
              {insightsLoading && !insights && <div className="card insights-empty">Analyse de votre progression...</div>}

              {insights && (
                <>
                  <div className="responsive-three-col insights-overview">
                    {[
                      { label: 'Jours actifs', value: insights.period.activeDays },
                      { label: 'Activités récentes', value: insights.summary.quizzes.periodSessions + insights.summary.duels.periodParticipations + insights.summary.arena.periodCompetitions + insights.summary.correspondence.periodLettersSubmitted },
                      { label: 'Matières pratiquées', value: insights.summary.subjects.filter((subject) => subject.answered > 0).length },
                    ].map((stat) => (
                      <div className="mobile-stat-card" key={stat.label}>
                        <strong className="display">{stat.value}</strong>
                        <span>{stat.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="insights-grid">
                    <section className="card insight-domain">
                      <p className="overline">Apprentissage</p>
                      <h2>Quiz individuels</h2>
                      <div className="insight-metrics">
                        <div><strong>{insights.summary.quizzes.periodSessions}</strong><span>sur 30 jours</span></div>
                        <div><strong>{insightValue(insights.summary.quizzes.accuracy, '%')}</strong><span>de précision</span></div>
                        <div><strong>{insights.summary.quizzes.totalSessions}</strong><span>au total</span></div>
                      </div>
                      <p className="insight-trend">{trendText(insights.summary.quizzes.trend)} · {insights.summary.quizzes.previousSessions} session(s) sur la période précédente</p>
                    </section>

                    <section className="card insight-domain">
                      <p className="overline">Face-à-face</p>
                      <h2>Duels</h2>
                      <div className="insight-metrics">
                        <div><strong>{insights.summary.duels.wins}</strong><span>victoires</span></div>
                        <div><strong>{insights.summary.duels.losses}</strong><span>défaites</span></div>
                        <div><strong>{insightValue(insights.summary.duels.accuracy, '%')}</strong><span>de précision</span></div>
                      </div>
                      <p className="insight-trend">{trendText(insights.summary.duels.trend)} · {insights.summary.duels.previousParticipations} duel(s) sur la période précédente</p>
                    </section>

                    <section className="card insight-domain">
                      <p className="overline">Compétitions</p>
                      <h2>Arena</h2>
                      <div className="insight-metrics">
                        <div><strong>{insights.summary.arena.periodCompetitions}</strong><span>sur 30 jours</span></div>
                        <div><strong>{insights.summary.arena.periodPoints}</strong><span>points récents</span></div>
                        <div><strong>{insights.summary.arena.totalWins}</strong><span>victoires totales</span></div>
                      </div>
                      <p className="insight-trend">Période précédente : {insights.summary.arena.previousCompetitions} compétition(s), {insights.summary.arena.previousPoints} points · {insights.summary.arena.upcomingRegistrations} inscription(s) à venir</p>
                    </section>

                    <section className="card insight-domain">
                      <p className="overline">Échanges</p>
                      <h2>Correspondance</h2>
                      <div className="insight-metrics">
                        <div><strong>{insights.summary.correspondence.periodLettersSubmitted}</strong><span>lettres récentes</span></div>
                        <div><strong>{insights.summary.correspondence.periodMessagesSent}</strong><span>messages récents</span></div>
                        <div><strong>{insights.summary.correspondence.unopenedAssignments + insights.summary.correspondence.awaitingReplies}</strong><span>à traiter</span></div>
                      </div>
                      <p className="insight-trend">Période précédente : {insights.summary.correspondence.previousLettersSubmitted} lettre(s), {insights.summary.correspondence.previousMessagesSent} message(s) · {insights.summary.correspondence.totalLettersSubmitted} lettre(s) au total</p>
                    </section>
                  </div>

                  <section className="card insight-subjects">
                    <div>
                      <p className="overline">Par matière</p>
                      <h2>Points forts et priorités</h2>
                    </div>
                    {insights.summary.subjects.length === 0 ? (
                      <p className="insight-trend">Complétez votre classe pour commencer votre suivi par matière.</p>
                    ) : insights.summary.subjects.map((subject) => (
                      <div className="insight-subject-row" key={subject.subjectId}>
                        <div>
                          <strong>{subject.subjectName}</strong>
                          <span>{subject.answered} réponse(s) analysée(s)</span>
                        </div>
                        <span className={'insight-level ' + subject.level}>
                          {subject.level === 'strong' ? 'Point fort' : subject.level === 'needs_work' ? 'À renforcer' : 'Données à compléter'}
                        </span>
                        <strong>{insightValue(subject.accuracy, '%')}</strong>
                      </div>
                    ))}
                  </section>
                </>
              )}
            </div>
          )}

          {/* DAILY RECOMMENDATIONS */}
          {tab === 'recommendations' && (
            <div className="insights-page">
              <div className="insights-heading">
                <div>
                  <p className="overline">Programme du {insights?.generatedFor ? new Date(insights.generatedFor + 'T12:00:00').toLocaleDateString('fr-HT') : 'jour'}</p>
                  <h1 className="display">Recommandations du jour</h1>
                  <p>Trois actions concrètes, choisies selon vos priorités et conservées pour la journée.</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => void loadInsights()} disabled={insightsLoading}>Actualiser</button>
              </div>

              {insightsError && <div className="alert alert-error">{insightsError}</div>}
              {insightsLoading && !insights && <div className="card insights-empty">Préparation de votre programme...</div>}
              {insights && insights.recommendations.length === 0 && (
                <div className="card insights-empty">Aucune action prioritaire aujourd'hui. Votre parcours est à jour.</div>
              )}
              {insights && (
                <div className="recommendation-grid">
                  {insights.recommendations.map((recommendation, index) => (
                    <article className={'card recommendation-card ' + recommendation.category} key={recommendation.id}>
                      <div className="recommendation-topline">
                        <span>0{index + 1}</span>
                        <span>{recommendation.category === 'learning' ? 'Apprentissage' : recommendation.category === 'competition' ? 'Compétition' : 'Participation'}</span>
                      </div>
                      <h2>{recommendation.title}</h2>
                      <p>{recommendation.reason}</p>
                      <button className="btn btn-primary btn-full" onClick={() => runInsightAction(recommendation.action)}>
                        {insightActionLabel(recommendation.action)}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DETAILED STATISTICS */}
          {tab === 'statistics' && (
            <div className="statistics-page">
              <div className="insights-heading">
                <div>
                  <p className="overline">Analyse détaillée</p>
                  <h1 className="display">Statistiques</h1>
                  <p>Visualisez votre rythme, vos performances par matière et votre bilan compétitif.</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => void loadInsights()} disabled={insightsLoading}>Actualiser</button>
              </div>

              {insightsError && <div className="alert alert-error">{insightsError}</div>}
              {insightsLoading && !insights && <div className="card insights-empty">Calcul de vos statistiques...</div>}

              {insights && (
                <>
                  <section className="statistics-kpi-grid">
                    {[
                      { label: 'Quiz terminés', value: insights.summary.quizzes.totalSessions },
                      { label: 'Duels terminés', value: insights.summary.duels.totalParticipations },
                      { label: 'Arena disputées', value: insights.summary.arena.totalCompetitions },
                      { label: 'Lettres soumises', value: insights.summary.correspondence.totalLettersSubmitted },
                    ].map((item) => (
                      <div className="card statistics-kpi" key={item.label}>
                        <strong className="display">{item.value}</strong>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </section>

                  <section className="card statistics-chart-card">
                    <div className="statistics-section-heading">
                      <div>
                        <p className="overline">Régularité</p>
                        <h2>Activité des 30 derniers jours</h2>
                      </div>
                      <strong>{insights.period.activeDays} jour(s) actif(s)</strong>
                    </div>
                    <div className="statistics-chart" role="img" aria-label="Activités quotidiennes sur les 30 derniers jours">
                      {insights.summary.activityTimeline.map((day, index) => (
                        <div className="statistics-day" key={day.date} title={day.date + ' : ' + day.total + ' activité(s)'}>
                          <div className="statistics-bar-track">
                            <div className="statistics-bar" style={{ height: Math.max(4, Math.round((day.total / maxDailyActivity) * 100)) + '%' }}>
                              {day.total > 0 && <span>{day.total}</span>}
                            </div>
                          </div>
                          <small>{index % 5 === 0 || index === 29 ? new Date(day.date + 'T12:00:00').toLocaleDateString('fr-HT', { day: '2-digit', month: '2-digit' }) : ''}</small>
                        </div>
                      ))}
                    </div>
                    <div className="statistics-legend">
                      <span>Quiz : {insights.summary.quizzes.periodSessions}</span>
                      <span>Duels : {insights.summary.duels.periodParticipations}</span>
                      <span>Arena : {insights.summary.arena.periodCompetitions}</span>
                      <span>Correspondance : {insights.summary.correspondence.periodLettersSubmitted + insights.summary.correspondence.periodMessagesSent}</span>
                    </div>
                  </section>

                  <div className="statistics-two-col">
                    <section className="card statistics-subject-card">
                      <div className="statistics-section-heading">
                        <div>
                          <p className="overline">Précision</p>
                          <h2>Résultats par matière</h2>
                        </div>
                      </div>
                      {insights.summary.subjects.length === 0 ? (
                        <p className="insight-trend">Aucune matière analysée pour le moment.</p>
                      ) : insights.summary.subjects.map((subject) => (
                        <div className="statistics-subject" key={subject.subjectId}>
                          <div>
                            <strong>{subject.subjectName}</strong>
                            <span>{subject.correct}/{subject.answered} bonnes réponses</span>
                          </div>
                          <strong>{insightValue(subject.accuracy, '%')}</strong>
                          <div className="statistics-progress">
                            <span style={{ width: (subject.accuracy ?? 0) + '%' }} />
                          </div>
                        </div>
                      ))}
                    </section>

                    <section className="card statistics-record-card">
                      <div className="statistics-section-heading">
                        <div>
                          <p className="overline">Compétition</p>
                          <h2>Bilan personnel</h2>
                        </div>
                      </div>
                      <div className="statistics-record-group">
                        <h3>Duels</h3>
                        <div><span>Victoires</span><strong>{insights.summary.duels.wins}</strong></div>
                        <div><span>Défaites</span><strong>{insights.summary.duels.losses}</strong></div>
                        <div><span>Égalités</span><strong>{insights.summary.duels.draws}</strong></div>
                        <div><span>Précision récente</span><strong>{insightValue(insights.summary.duels.accuracy, '%')}</strong></div>
                      </div>
                      <div className="statistics-record-group">
                        <h3>Arena</h3>
                        <div><span>Victoires</span><strong>{insights.summary.arena.totalWins}</strong></div>
                        <div><span>Compétitions</span><strong>{insights.summary.arena.totalCompetitions}</strong></div>
                        <div><span>Points sur 30 jours</span><strong>{insights.summary.arena.periodPoints}</strong></div>
                      </div>
                    </section>
                  </div>
                </>
              )}
            </div>
          )}


          {/* ── QUIZ ── */}
          {tab === 'quiz' && (
            <div className="challenge-hub">
              <div className="challenge-header">
                <div>
                  <p className="overline">Mode compétition</p>
                  <h1 className="display challenge-title">Challenge</h1>
                </div>
                <div className="challenge-record">
                  <span>{history.length}</span>
                  <small>manches jouées</small>
                </div>
              </div>

              <div className="challenge-layout">
                <section className="challenge-duel-card">
                  <div className="challenge-card-topline">
                    <span className="challenge-ranked-badge">Classé</span>
                    <span className="challenge-live-copy">Face-à-face en direct</span>
                  </div>

                  <div className="challenge-versus">
                    <div className="challenge-player">
                      <div className="challenge-avatar">{user?.firstName?.[0] ?? 'E'}</div>
                      <span>{user?.firstName ?? 'Vous'}</span>
                    </div>
                    <div className="challenge-vs-mark">VS</div>
                    <div className="challenge-player opponent">
                      <div className="challenge-avatar">?</div>
                      <span>Adversaire</span>
                    </div>
                  </div>

                  <div className="challenge-duel-copy">
                    <h2>Affrontement classé</h2>
                    <p>
                      Trouve un élève de ton niveau, prends la main au buzzer, puis gagne avec des réponses justes.
                    </p>
                  </div>

                  {duelError && <div className="alert alert-error">{duelError}</div>}

                  <div className="challenge-duel-form">
                    <label className="field-label">Matière du duel</label>
                    <select value={duelSubjectId} onChange={(e) => setDuelSubjectId(e.target.value)} className="field-input challenge-select">
                      <option value="">Choisir une matière</option>
                      {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    <div className="challenge-selected-subject">
                      <span>Matière choisie</span>
                      <strong>{selectedDuelSubject?.name ?? 'En attente de sélection'}</strong>
                    </div>

                    <button onClick={searchOpponent} disabled={duelLoading || !duelSubjectId} className="btn btn-primary btn-full challenge-duel-cta">
                      {duelLoading ? (
                        <>
                          <span className="challenge-cta-loader" />
                          Recherche d'un adversaire
                        </>
                      ) : (
                        'Lancer le duel classé'
                      )}
                    </button>
                  </div>

                  <div className="challenge-duel-stats">
                    <div>
                      <span>{bestScore}</span>
                      <small>meilleur score</small>
                    </div>
                    <div>
                      <span>{avgScore}</span>
                      <small>moyenne</small>
                    </div>
                    <div>
                      <span>{subjects.length}</span>
                      <small>matières</small>
                    </div>
                  </div>
                  <p className="challenge-human-note">
                    Le duel démarre automatiquement dès qu'un adversaire est trouvé. Tu peux quitter la recherche à tout moment.
                  </p>
                </section>

                <aside className="challenge-training-card">
                  <p className="overline">Entraînement</p>
                  <h2>Manche individuelle</h2>
                  <p>Prépare-toi avant d'entrer en classé. Même base de questions, moins de pression.</p>

                  <div className="challenge-training-meta">
                    <div>
                      <span>{bestScore}</span>
                      <small>record perso</small>
                    </div>
                    <div>
                      <span>{history.length}</span>
                      <small>manches</small>
                    </div>
                  </div>

                  {quizError && <div className="alert alert-error">{quizError}</div>}

                  <div className="challenge-training-form">
                    <label className="field-label">Matière</label>
                    <select value={quizSubjectId} onChange={(e) => setQuizSubjectId(e.target.value)} className="field-input">
                      <option value="">Choisir une matière</option>
                      {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button onClick={startQuiz} disabled={quizLoading || !quizSubjectId} className="btn btn-ghost btn-full">
                      {quizLoading ? 'Chargement...' : "Commencer l'entraînement"}
                    </button>
                  </div>
                </aside>
              </div>
            </div>
          )}

          {/* ── HISTORIQUE ── */}
          {tab === 'history' && (
            <div>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 20 }}>Historique</h1>

              {history.length === 0 ? (
                <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--ink-3)', marginBottom: 16 }}>Aucune manche enregistrée pour le moment.</p>
                  <button onClick={() => setTab('quiz')} className="btn btn-primary btn-sm">Lancer ma première manche</button>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden' }}>
                  {history.map((h, i, arr) => {
                    const pct = h.totalQuestions > 0 ? Math.round((h.score / h.totalQuestions) * 100) : 0
                    return (
                      <div key={h.sessionId} style={{ display: 'flex', flexDirection: 'column', padding: '14px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--rule)' : 'none', background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div>
                            <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{h.subjectName}</p>
                            <p style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 2 }}>{h.className} · {new Date(h.playedAt).toLocaleString('fr-HT')}</p>
                          </div>
                          <span style={{ fontSize: 18, fontWeight: 700, color: pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--gold)' : 'var(--error)', fontVariantNumeric: 'tabular-nums' }}>{h.score}/{h.totalQuestions}</span>
                        </div>
                        <div style={{ height: 2, background: 'var(--rule)', borderRadius: 1, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--gold)' : 'var(--error)', borderRadius: 1, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── CLASSEMENT ── */}
          {tab === 'leaderboard' && (
            <div>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 20 }}>Classement</h1>

              {leaderboard.length === 0 ? (
                <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--ink-3)' }}>Le classement est vide pour cette semaine.</p>
                </div>
              ) : (
                <div>
                  {podiumRows.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, alignItems: 'end', marginBottom: 18 }}>
                      {podiumDisplay.map((row) => {
                        const accent = row.rank === 1 ? 'var(--gold)' : row.rank === 2 ? 'var(--cobalt)' : '#8A6A43'
                        const surface = row.rank === 1 ? 'linear-gradient(180deg, rgba(176,121,26,0.16) 0%, rgba(242,232,207,0.92) 100%)' : row.rank === 2 ? 'linear-gradient(180deg, rgba(15,32,64,0.08) 0%, rgba(255,255,255,1) 100%)' : 'linear-gradient(180deg, rgba(138,106,67,0.09) 0%, rgba(255,255,255,1) 100%)'
                        const minHeight = row.rank === 1 ? 222 : row.rank === 2 ? 194 : 180

                        return (
                          <div
                            key={row.userId}
                            style={{
                              minHeight,
                              background: surface,
                              border: `1px solid ${row.rank === 1 ? 'rgba(176,121,26,0.34)' : 'var(--rule)'}`,
                              borderRadius: 12,
                              padding: '18px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              boxShadow: row.rank === 1 ? '0 18px 34px rgba(176,121,26,0.14)' : '0 10px 24px rgba(15,32,64,0.06)',
                              transform: row.rank === 1 ? 'translateY(-8px)' : 'none',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent }}>
                                {row.rank === 1 ? '1er place' : row.rank === 2 ? '2e place' : '3e place'}
                              </span>
                              <span style={{ width: 34, height: 34, borderRadius: '50%', background: row.rank === 1 ? accent : '#fff', border: `1px solid ${accent}`, color: row.rank === 1 ? '#fff' : accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                {row.rank}
                              </span>
                            </div>

                            <div>
                              <p style={{ fontSize: row.rank === 1 ? 22 : 19, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3, marginBottom: 6 }}>
                                {row.studentName}
                              </p>
                              {row.isCurrentUser && (
                                <p style={{ fontSize: 13, color: 'var(--cobalt)', fontWeight: 600, marginBottom: 10 }}>Vous êtes sur le podium</p>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12, marginTop: 18 }}>
                              <div>
                                <div className="display" style={{ fontSize: row.rank === 1 ? 40 : 34, color: accent, lineHeight: 1 }}>{row.winCount}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Victoires</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{row.totalCorrectAnswers}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Bonnes réponses</div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden' }}>
                    {leaderboard.map((row, i, arr) => (
                      <div key={row.userId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--rule)' : 'none', background: row.userId === user?.id ? 'rgba(27,53,99,0.04)' : '#fff' }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: i < 3 ? 'var(--gold)' : 'var(--ink-3)', width: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.studentName}
                            {row.userId === user?.id && <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--cobalt)' }}>Vous</span>}
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 1 }}>{row.duelCount} duel{row.duelCount > 1 ? 's' : ''} · {row.totalCorrectAnswers} bonnes réponses</p>
                        </div>
                        <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--cobalt)', fontVariantNumeric: 'tabular-nums' }}>{row.winCount} victoire{row.winCount > 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {tab === 'notifications' && (
            <NotificationCenter
              notifications={notifications}
              onMarkAllRead={markAllRead}
              onMarkOneRead={markOneRead}
              onDelete={deleteNotification}
              onNavigate={(targetTab) => setTab(targetTab as Tab)}
              error={notificationError}
            />
          )}

          {/* ── PROFIL ── */}
          {tab === 'profile' && (
            <div>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 20 }}>Mon profil</h1>

              <div className="card" style={{ maxWidth: 480 }}>
                {profileMsg && <div className="alert alert-ok" style={{ marginBottom: 14 }}>{profileMsg}</div>}
                {profileError && <div className="alert alert-error" style={{ marginBottom: 14 }}>{profileError}</div>}

                <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="auth-form-grid">
                    <div>
                      <label className="field-label">Prénom</label>
                      <input type="text" required value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} className="field-input" />
                    </div>
                    <div>
                      <label className="field-label">Nom</label>
                      <input type="text" required value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} className="field-input" />
                    </div>
                  </div>

                  <div>
                    <label className="field-label">Email</label>
                    <input type="email" disabled value={user?.email ?? ''} className="field-input" />
                  </div>

                  <div>
                    <label className="field-label">Classe scolaire</label>
                    <select
                      required
                      value={profileForm.classId}
                      onChange={(e) => setProfileForm({ ...profileForm, classId: e.target.value })}
                      className="field-input"
                    >
                      <option value="">Choisir une classe</option>
                      {classes.map((schoolClass) => (
                        <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="auth-form-grid">
                    <div>
                      <label className="field-label">École</label>
                      <input type="text" value={profileForm.school} onChange={(e) => setProfileForm({ ...profileForm, school: e.target.value })} className="field-input" placeholder="Votre école" />
                    </div>
                    <div>
                      <label className="field-label">Ville</label>
                      <select value={profileForm.city} onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })} className="field-input" disabled={!profileForm.department}>
                        <option value="">{profileForm.department ? 'Choisir une ville' : 'Choisir d\'abord un département'}</option>
                        {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="auth-form-grid">
                    <div>
                      <label className="field-label">Département</label>
                      <select value={profileForm.department} onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value, city: '' })} className="field-input">
                        <option value="">Choisir un département</option>
                        {HAITI_DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Section</label>
                      <input type="text" value={profileForm.sectionName} onChange={(e) => setProfileForm({ ...profileForm, sectionName: e.target.value })} className="field-input" placeholder="Votre section" />
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={profileForm.canBeContacted} onChange={(e) => setProfileForm({ ...profileForm, canBeContacted: e.target.checked })} style={{ accentColor: 'var(--cobalt)', width: 15, height: 15 }} />
                    <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Accepter d’être contacté par Konesans+</span>
                  </label>

                  <button type="submit" disabled={profileLoading} className="btn btn-primary btn-full" style={{ marginTop: 4 }}>
                    {profileLoading ? 'Sauvegarde…' : 'Sauvegarder les modifications'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {tab === 'security' && accessToken && <AccountSecurity token={accessToken} />}

          {tab === 'preferences' && accessToken && user && (
            <AccountPreferences token={accessToken} user={user} onUpdated={(updated) => { updateUser(updated); if (!updated.notificationsEnabled) setNotifications([]) }} />
          )}

          {tab === 'arena' && <ArenaWorkspace embedded />}

          {(tab === 'library' || tab === 'ai') && accessToken && (
            <StudentLearning token={accessToken} mode={tab} onModeChange={(mode) => setTab(mode)} preferredLanguage={user?.preferredTutorLanguage} />
          )}

          {/* ── CORRESPONDANCE ── */}
          {tab === 'correspondence' && (
            <div>
              {/* Header + sub-nav */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <div>
                  <h1 className="display" style={{ fontSize: 28, color: 'var(--cobalt)', marginBottom: 4 }}>Correspondance</h1>
                  <p style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500 }}>Écrivez une lettre, recevez-en une, échangez anonymement.</p>
                </div>
                {corrView !== 'sessions' && (
                  <button
                    onClick={() => { setCorrView('sessions'); setCorrError('') }}
                    className="btn btn-ghost btn-sm"
                  >
                    Retour aux sessions
                  </button>
                )}
              </div>

              {corrError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{corrError}</div>}

              {/* Sub-view tabs (sessions / my letters / inbox) */}
              {corrView !== 'write' && corrView !== 'thread' && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--rule)' }}>
                  {([
                    { key: 'sessions' as CorrView, label: 'Concours' },
                    { key: 'myletters' as CorrView, label: 'Mes lettres' },
                    { key: 'inbox' as CorrView, label: 'Boîte de réception' },
                  ]).map((v) => (
                    <button
                      key={v.key}
                      onClick={() => { setCorrView(v.key); setCorrError('') }}
                      style={{ padding: '8px 18px', border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: corrView === v.key ? 'var(--cobalt)' : 'var(--ink-3)', borderBottom: corrView === v.key ? '2px solid var(--cobalt)' : '2px solid transparent', marginBottom: -2 }}
                    >{v.label}</button>
                  ))}
                </div>
              )}

              {/* ── Sessions list ── */}
              {corrView === 'sessions' && (
                <div>
                  {corrLoading && <p style={{ color: 'var(--ink-3)' }}>Chargement…</p>}
                  {!corrLoading && corrSessions.length === 0 && (
                    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                      <p style={{ color: 'var(--ink-3)' }}>Aucun concours disponible pour le moment.</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {corrSessions.map((s) => (
                      <div key={s.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openCorrSession(s)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>{s.title}</p>
                            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 8 }}>{s.themePrompt}</p>
                            <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                              {new Date(s.startAt).toLocaleDateString('fr-FR')} — {new Date(s.endAt).toLocaleDateString('fr-FR')}
                            </p>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, flexShrink: 0, background: s.status === 'open' ? 'var(--ok-bg)' : s.status === 'scoring' ? 'var(--gold-pale)' : 'var(--stone)', color: s.status === 'open' ? 'var(--ok)' : s.status === 'scoring' ? 'var(--gold)' : 'var(--ink-3)' }}>
                            {s.status === 'open' ? 'Ouvert' : s.status === 'scoring' ? 'Vote en cours' : s.status === 'published' ? 'Publié' : 'Fermé'}
                          </span>
                        </div>
                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>Écrire une lettre</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Write / Edit letter ── */}
              {corrView === 'write' && corrSelectedSession && (
                <div>
                  <div className="card" style={{ marginBottom: 16 }}>
                    <p className="overline" style={{ marginBottom: 4 }}>Concours</p>
                    <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--cobalt)', marginBottom: 6 }}>{corrSelectedSession.title}</p>
                    <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.6 }}>{corrSelectedSession.themePrompt}</p>
                  </div>

                  {corrLetter?.status === 'submitted' ? (
                    <div className="card">
                      <div className="alert alert-ok" style={{ marginBottom: 0 }}>
                        Lettre soumise. Vous serez notifié quand un destinataire vous sera assigné.
                      </div>
                    </div>
                  ) : (
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <label className="field-label" style={{ margin: 0 }}>Votre lettre</label>
                        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                          {corrLetterSaving ? 'Sauvegarde…' : 'Sauvegarde auto'}
                          {' · '}{corrLetterBody.length} car.
                        </span>
                      </div>
                      <textarea
                        className="field-input"
                        rows={14}
                        style={{ resize: 'vertical' }}
                        value={corrLetterBody}
                        onChange={(e) => { setCorrLetterBody(e.target.value); autosaveCorrLetter(e.target.value) }}
                        disabled={corrLetter?.status !== 'draft'}
                        placeholder="Rédigez votre lettre ici…"
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                        <button
                          onClick={submitCorrLetter}
                          disabled={corrLoading || corrLetterBody.length < (corrSelectedSession.rules?.minBodyLength ?? 500)}
                          className="btn btn-primary"
                        >
                          {corrLoading ? 'Envoi…' : 'Soumettre la lettre'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── My letters ── */}
              {corrView === 'myletters' && (
                <div>
                  {corrMyLetters.length === 0 && !corrLoading && (
                    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                      <p style={{ color: 'var(--ink-3)' }}>Vous n'avez pas encore écrit de lettre.</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {corrMyLetters.map((l) => (
                      <div key={l.id} className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{l.sessionId}</p>
                            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>{new Date(l.createdAt).toLocaleDateString('fr-FR')}</p>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, flexShrink: 0, background: l.status === 'draft' ? 'var(--stone)' : l.status === 'submitted' ? 'var(--gold-pale)' : 'var(--ok-bg)', color: l.status === 'draft' ? 'var(--ink-3)' : l.status === 'submitted' ? 'var(--gold)' : 'var(--ok)' }}>
                            {l.status === 'draft' ? 'Brouillon' : l.status === 'submitted' ? 'Soumise' : l.status === 'assigned' ? 'Assignée' : l.status === 'delivered' ? 'Lue' : 'Archivée'}
                          </span>
                        </div>
                        <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                          {l.body || '(brouillon vide)'}
                        </p>
                        {l.status === 'draft' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginTop: 10 }}
                            onClick={() => { const s = corrSessions.find((x) => x.id === l.sessionId); if (s) openCorrSession(s) }}
                          >
                            Continuer la rédaction
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Inbox ── */}
              {corrView === 'inbox' && (
                <div>
                  {corrLoading && <p style={{ color: 'var(--ink-3)' }}>Chargement…</p>}
                  {!corrLoading && corrInbox.length === 0 && (
                    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                      <p style={{ color: 'var(--ink-3)' }}>Aucune lettre reçue pour le moment.</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {corrInbox.map((item) => (
                      <div key={item.assignmentId} className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Lettre anonyme</p>
                            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>
                              {item.openedAt ? `Ouverte le ${new Date(item.openedAt).toLocaleDateString('fr-FR')}` : 'Non ouverte'}
                            </p>
                          </div>
                          <button className="btn btn-primary btn-sm" onClick={() => openCorrAssignment(item)}>
                            {item.openedAt ? 'Lire et répondre' : 'Ouvrir'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Thread (conversation) ── */}
              {corrView === 'thread' && corrThread && (
                <div>
                  {corrOpenedAssignment && (
                    <div className="card" style={{ marginBottom: 16 }}>
                      <p className="overline" style={{ marginBottom: 8 }}>Lettre reçue</p>
                      <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{corrOpenedAssignment.letter.body}</p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--error)' }}
                          onClick={() => reportCorrItem('letter', corrOpenedAssignment.letter.id, 'Contenu inapproprié')}
                        >
                          Signaler
                        </button>
                        {corrOpenedAssignment.thread && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => castCorrVote(corrThread!.threadId, corrOpenedAssignment.letter.id, 1)}
                          >
                            Voter pour cette lettre
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="card">
                    <p className="overline" style={{ marginBottom: 14 }}>Échange</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto', marginBottom: 16, paddingRight: 4 }}>
                      {corrThreadMessages.length === 0 && (
                        <p style={{ color: 'var(--ink-3)', textAlign: 'center', padding: '16px 0' }}>Aucun message encore. Lancez la conversation.</p>
                      )}
                      {corrThreadMessages.map((msg) => {
                        const isOwn = msg.isOwn
                        return (
                          <div key={msg.id} style={{ display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}>
                            <div style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.6, background: isOwn ? 'var(--cobalt)' : 'var(--stone)', color: isOwn ? '#fff' : 'var(--ink)' }}>
                              {msg.body}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        className="field-input"
                        style={{ flex: 1 }}
                        placeholder="Votre message…"
                        value={corrNewMessage}
                        onChange={(e) => setCorrNewMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendCorrMessage() } }}
                      />
                      <button className="btn btn-primary" disabled={corrSendingMessage || !corrNewMessage.trim()} onClick={sendCorrMessage}>
                        Envoyer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden bottom-tab-nav">
        {studentMobileNavItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 6px', fontSize: 12, fontWeight: 500, color: tab === item.key ? 'var(--cobalt)' : 'var(--ink-3)', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', position: 'relative' }}
          >
            {item.key === 'notifications' && unreadCount > 0 && (
              <span className="badge" style={{ position: 'absolute', top: 4, right: '28%', minWidth: 14, height: 14, fontSize: 9 }}>{unreadCount}</span>
            )}
            <span style={{ display: 'block', width: 18, height: 2, borderRadius: 1, background: tab === item.key ? 'var(--cobalt)' : 'transparent', marginBottom: 5 }} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

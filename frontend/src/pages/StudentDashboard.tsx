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

type Tab = 'home' | 'quiz' | 'history' | 'leaderboard' | 'notifications' | 'profile' | 'arena' | 'correspondence'
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

export default function StudentDashboard() {
  const { user, accessToken, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('home')

  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null)
  const [notificationError, setNotificationError] = useState('')

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
    currentPassword: '',
    newPassword: '',
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
  }, [loadHistory, loadLeaderboard, loadNotifications, tab])

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

  const openNotification = async (notification: Notification) => {
    setNotificationError('')
    if (selectedNotificationId === notification.id) {
      setSelectedNotificationId(null)
      return
    }
    setSelectedNotificationId(notification.id)
    if (!notification.isRead) {
      try {
        await markOneRead(notification.id)
      } catch (err) {
        setNotificationError((err as { message?: string }).message ?? 'Impossible d’ouvrir cette notification.')
      }
    }
  }

  const deleteNotification = async (id: string) => {
    setNotificationError('')
    try {
      await apiCall(`/notifications/${id}`, { method: 'DELETE' }, accessToken)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      setSelectedNotificationId((current) => current === id ? null : current)
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
    if (profileForm.newPassword && !profileForm.currentPassword.trim()) {
      setProfileError('Saisissez votre mot de passe actuel pour le modifier.')
      return
    }
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
      if (profileForm.newPassword) {
        body.newPassword = profileForm.newPassword
        body.currentPassword = profileForm.currentPassword
      }
      const updated = await apiCall<typeof user>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }, accessToken)
      updateUser(updated!)
      setProfileMsg('Profil mis à jour avec succès !')
      setProfileForm((f) => ({ ...f, currentPassword: '', newPassword: '' }))
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

  const studentSidebarSections: DashboardSidebarSection[] = [
    {
      title: 'Tableau de bord',
      note: 'Point d\'entrée',
      items: [
        { id: 'home', label: 'Accueil', onClick: () => openStudentTab('home'), active: tab === 'home' },
        { id: 'home-summary', label: 'Résumé personnel', muted: true, disabled: true },
        { id: 'home-reco', label: 'Recommandations du jour', muted: true, disabled: true },
      ],
    },
    {
      title: 'Compétitions',
      note: 'Quiz et défis',
      items: [
        { id: 'quiz', label: 'Challenge', onClick: () => openStudentTab('quiz'), active: tab === 'quiz' },
        { id: 'arena', label: 'Arena', onClick: () => openStudentTab('arena'), active: tab === 'arena' },
        { id: 'leaderboard', label: 'Classement', onClick: () => openStudentTab('leaderboard'), active: tab === 'leaderboard' },
        { id: 'exams', label: 'Examens', muted: true, disabled: true },
        { id: 'certifications', label: 'Certifications', muted: true, disabled: true },
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
        { id: 'stats', label: 'Statistiques', muted: true, disabled: true },
      ],
    },
    {
      title: 'Apprentissage',
      note: 'À venir',
      items: [
        { id: 'library', label: 'Bibliothèque de contenus', muted: true, disabled: true },
        { id: 'pathways', label: 'Parcours', muted: true, disabled: true },
        { id: 'revisions', label: 'Révisions', muted: true, disabled: true },
      ],
    },
    {
      title: 'Compte',
      note: 'Profil',
      items: [
        { id: 'profile', label: 'Profil', onClick: () => openStudentTab('profile'), active: tab === 'profile' },
        { id: 'security', label: 'Sécurité', muted: true, disabled: true },
        { id: 'preferences', label: 'Préférences', muted: true, disabled: true },
        { id: 'billing', label: 'Abonnements / paiements', muted: true, disabled: true },
      ],
    },
  ]

  const studentMobileNavItems: { key: Tab; label: string }[] = [
    { key: 'home', label: 'Accueil' },
    { key: 'quiz', label: 'Challenge' },
    { key: 'history', label: 'Historique' },
    { key: 'leaderboard', label: 'Classement' },
    { key: 'correspondence', label: 'Correspondance' },
    { key: 'profile', label: 'Profil' },
  ]

  const avgScore =
    history.length > 0
      ? Math.round(history.reduce((s, h) => s + h.score, 0) / history.length)
      : 0
  const bestScore = history.length > 0 ? Math.max(...history.map((h) => h.score)) : 0
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
        footerNote="Une structure pensée pour évoluer vers examens, certifications et contenus."
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

        <div className="dashboard-main md:ml-[292px]" style={{ maxWidth: tab === 'quiz' || tab === 'arena' ? 980 : 820 }}>


          {/* ── HOME ── */}
          {tab === 'home' && (
            <div>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 4 }}>Bonjour, {user?.firstName}.</h1>
              <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 22, fontWeight: 500 }}>
                {history.length > 0
                  ? `${history.length} session${history.length > 1 ? 's' : ''} jouée${history.length > 1 ? 's' : ''} · Meilleur score : ${bestScore} pts`
                  : 'Aucune session encore — lancez votre première manche.'}
              </p>

              <div className="responsive-three-col" style={{ border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden', marginBottom: 24 }}>
                {[
                  { label: 'Challenges joués', value: history.length, accent: 'var(--cobalt)' },
                  { label: 'Meilleur score', value: bestScore, accent: 'var(--cobalt)' },
                  { label: 'Score moyen', value: avgScore, accent: 'var(--cobalt)' },
                ].map((stat) => (
                  <div key={stat.label} className="mobile-stat-card" style={{ background: '#fff', padding: '20px 18px' }}>
                    <div className="display" style={{ fontSize: 36, color: stat.accent, letterSpacing: '-0.03em', lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600 }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="card responsive-stack row" style={{ marginBottom: 28 }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--cobalt)' }}>Une manche d’entraînement ?</p>
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

          {/* ── QUIZ ── */}
          {tab === 'quiz' && (
            <div>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 22 }}>Challenge</h1>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="card" style={{ marginBottom: 0 }}>
                  <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--cobalt)', marginBottom: 16 }}>Manche individuelle</p>
                  {quizError && <div className="alert alert-error" style={{ marginBottom: 14 }}>{quizError}</div>}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label className="field-label">Matière</label>
                      <select value={quizSubjectId} onChange={(e) => setQuizSubjectId(e.target.value)} className="field-input">
                        <option value="">Choisir une matière</option>
                        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <button onClick={startQuiz} disabled={quizLoading || !quizSubjectId} className="btn btn-primary btn-full">
                      {quizLoading ? 'Chargement…' : 'Commencer la manche'}
                    </button>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 0 }}>
                  <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--cobalt)', marginBottom: 16 }}>Affrontement classé</p>
                  {duelError && <div className="alert alert-error" style={{ marginBottom: 14 }}>{duelError}</div>}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label className="field-label">Matière</label>
                      <select value={duelSubjectId} onChange={(e) => setDuelSubjectId(e.target.value)} className="field-input">
                        <option value="">Choisir une matière</option>
                        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <button onClick={searchOpponent} disabled={duelLoading || !duelSubjectId} className="btn btn-primary btn-full">
                      {duelLoading ? 'Recherche…' : 'Chercher un adversaire'}
                    </button>
                  </div>
                </div>
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

                  <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 16, marginTop: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 10 }}>Changer le mot de passe <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(optionnel)</span></p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input type="password" value={profileForm.currentPassword} onChange={(e) => setProfileForm({ ...profileForm, currentPassword: e.target.value })} className="field-input" placeholder="Mot de passe actuel" />
                      <input type="password" value={profileForm.newPassword} onChange={(e) => setProfileForm({ ...profileForm, newPassword: e.target.value })} className="field-input" placeholder="Nouveau mot de passe" minLength={6} />
                    </div>
                  </div>

                  <button type="submit" disabled={profileLoading} className="btn btn-primary btn-full" style={{ marginTop: 4 }}>
                    {profileLoading ? 'Sauvegarde…' : 'Sauvegarder les modifications'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {tab === 'arena' && <ArenaWorkspace embedded />}

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

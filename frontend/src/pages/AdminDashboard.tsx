import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiCall } from '../api/client'
import { arenaApi, adminApi, ARENA_API, type ArenaCompetition, type ArenaRegistration, type ModeratorUser, type VerifyModeratorOtpResponse, type ModeratorOtpRequestResponse } from '../arena/arenaApi'
import DashboardSidebar, { type DashboardSidebarSection } from '../components/DashboardSidebar'
import { HAITI_DEPARTMENTS } from '../constants/haitiDepartments'
import {
  adminCreateSession, adminHandleReport, adminListReports,
  adminListSessions, adminTriggerAssign, adminUpdateSession,
} from '../correspondence/correspondenceApi'
import type { ContestSession, ContestSessionStatus, ModerationCase } from '../correspondence/types'

function getOtpErrorMessage(error: unknown, fallback: string) {
  const message = (error as { message?: string })?.message?.trim()
  if (!message) return fallback
  if (message === 'Failed to fetch') {
    return "Impossible de contacter le serveur pour l'instant. Reessayez dans quelques instants."
  }
  return message
}

type Tab = 'overview' | 'levels' | 'subjects' | 'questions' | 'students' | 'messages' | 'sponsors' | 'arena' | 'correspondence'
type CorrSubTab = 'sessions' | 'moderation'
const CORR_STATUS_OPTIONS: ContestSessionStatus[] = ['draft', 'open', 'closed', 'scoring', 'published']
const CORR_STATUS_FR: Record<ContestSessionStatus, string> = {
  draft: 'Brouillon', open: 'Ouvert', closed: 'Fermé', scoring: 'Vote', published: 'Publié',
}
type SchoolClass = { id: string; name: string }
type Subject = { id: string; name: string; classId: string }
type Question = {
  id: string; classId: string; subjectId: string; prompt: string
  optionA: string; optionB: string; optionC: string; optionD: string
  correctOption: string; difficulty: string
}
type Student = {
  id: string; firstName: string; lastName: string; email: string
  school: string | null; city: string | null; department: string | null; sectionName: string | null; createdAt: string
}
type Stats = { studentCount: number; questionCount: number; subjectCount: number; sessionCount: number }
type Broadcast = {
  id: string; title: string; message: string
  targetType: 'all' | 'level' | 'class' | 'department' | 'city' | 'section' | 'filtered'; targetId: string | null
  classId: string | null; department: string | null; city: string | null; sectionName: string | null
  recipientCount: number; createdAt: string
}
type Sponsor = {
  id: string
  name: string
  logoUrl: string
  websiteUrl: string | null
  isActive: boolean
  displayOrder: number
  createdAt: string
}

export default function AdminDashboard() {
  const { accessToken, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')

  const [stats, setStats] = useState<Stats | null>(null)
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [students, setStudents] = useState<Student[]>([])

  const [newClass, setNewClass] = useState('')
  const [classMsg, setClassMsg] = useState('')

  const [subjectForm, setSubjectForm] = useState({ name: '', classId: '' })
  const [subjectMsg, setSubjectMsg] = useState('')

  const [qForm, setQForm] = useState({
    classId: '', subjectId: '', prompt: '',
    optionA: '', optionB: '', optionC: '', optionD: '',
    correctOption: 'A', difficulty: 'medium', explanation: '',
  })
  const [qFilterClass, setQFilterClass] = useState('')
  const [qFilterSubject, setQFilterSubject] = useState('')
  const [qMsg, setQMsg] = useState('')

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', classId: '', department: '', city: '', sectionName: '' })
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [sponsorMsg, setSponsorMsg] = useState('')
  const [sponsorUploadLoading, setSponsorUploadLoading] = useState(false)
  const [editingSponsorId, setEditingSponsorId] = useState<string | null>(null)
  const [sponsorForm, setSponsorForm] = useState({
    name: '',
    logoUrl: '',
    websiteUrl: '',
    isActive: true,
    displayOrder: 0,
  })

  // Arena state
  const [arenaCompetitions, setArenaCompetitions] = useState<ArenaCompetition[]>([])
  const [arenaRegistrations, setArenaRegistrations] = useState<ArenaRegistration[]>([])
  const [selectedCompetitionId, setSelectedCompetitionId] = useState('')
  const [arenaMsg, setArenaMsg] = useState('')
  const [arenaError, setArenaError] = useState('')
  const [arenaCompForm, setArenaCompForm] = useState({
    name: '', competitorAUserId: '', competitorBUserId: '', moderatorUserId: '', questionCount: 10, secondsPerQuestion: 30,
    description: '', scheduledAt: ''
  })
  const [winnerPicker, setWinnerPicker] = useState<{ compId: string; participants: ArenaRegistration[] } | null>(null)
  const [winnerPickerSelectedId, setWinnerPickerSelectedId] = useState('')
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [publicStreamDrafts, setPublicStreamDrafts] = useState<Record<string, { streamUrl: string; chatUrl: string }>>({})
  const [savingPublicStreamId, setSavingPublicStreamId] = useState<string | null>(null)
  const [updatingPublicStreamStatusId, setUpdatingPublicStreamStatusId] = useState<string | null>(null)
  // Arena internal tabs
  const [arenaTab, setArenaTab] = useState<'matches' | 'affectations'>('matches')
  const [moderatorUsers, setModeratorUsers] = useState<ModeratorUser[]>([])
  const [selectedModerator, setSelectedModerator] = useState<Record<string, string>>({})
  const [assigningId, setAssigningId] = useState<string | null>(null)

  // -- Create Moderator modal ----------------------------------------------
  type ModalState = 'closed' | 'form' | 'otp' | 'success'
  const [createModModal, setCreateModModal] = useState<ModalState>('closed')
  const [createModForm, setCreateModForm] = useState({ firstName: '', lastName: '', email: '', password: '', generatePassword: true })
  const [createModError, setCreateModError] = useState('')
  const [createModNotice, setCreateModNotice] = useState('')
  const [createModLoading, setCreateModLoading] = useState(false)
  const [createModResult, setCreateModResult] = useState<VerifyModeratorOtpResponse | null>(null)
  const [createModPending, setCreateModPending] = useState<ModeratorOtpRequestResponse | null>(null)
  const [createModOtpCode, setCreateModOtpCode] = useState('')
  const [createModResendCountdown, setCreateModResendCountdown] = useState(0)

  // ── Correspondence state ─────────────────────────────────────────────────────
  const [corrSubTab, setCorrSubTab] = useState<CorrSubTab>('sessions')
  const [corrSessions, setCorrSessions] = useState<ContestSession[]>([])
  const [loadingCorrSessions, setLoadingCorrSessions] = useState(false)
  const [corrSessionError, setCorrSessionError] = useState('')
  const [corrShowCreate, setCorrShowCreate] = useState(false)
  const [corrCreating, setCorrCreating] = useState(false)
  const [corrCreateForm, setCorrCreateForm] = useState({
    title: '', themePrompt: '', startAt: '', endAt: '',
    gracePeriodHours: '48', maxLettersPerUser: '1', maxLettersReceived: '1',
    minBodyLength: '500', maxBodyLength: '5000', allowVoting: false,
  })
  const [corrAssignResult, setCorrAssignResult] = useState<Record<string, { assigned: number; skipped: number }>>({})
  const [corrAssigning, setCorrAssigning] = useState<string | null>(null)
  const [corrReports, setCorrReports] = useState<ModerationCase[]>([])
  const [loadingCorrReports, setLoadingCorrReports] = useState(false)
  const [corrReportFilter, setCorrReportFilter] = useState('pending')
  const [corrReportError, setCorrReportError] = useState('')

  useEffect(() => {
    if (createModResendCountdown <= 0) return
    const timeout = window.setTimeout(() => setCreateModResendCountdown((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearTimeout(timeout)
  }, [createModResendCountdown])

  const openCreateModModal = () => {
    setCreateModForm({ firstName: '', lastName: '', email: '', password: '', generatePassword: true })
    setCreateModError('')
    setCreateModNotice('')
    setCreateModResult(null)
    setCreateModPending(null)
    setCreateModOtpCode('')
    setCreateModResendCountdown(0)
    setCreateModModal('form')
  }

  const applyArenaCompetitionUpdate = useCallback((competition: ArenaCompetition) => {
    setArenaCompetitions((prev) => prev.map((item) => item.id === competition.id ? competition : item))
  }, [])

  const isAssignedArenaMatch = (competition: ArenaCompetition) =>
    Boolean(competition.competitorAUserId && competition.competitorBUserId)

  const getArenaDuelLabel = (competition: ArenaCompetition) =>
    competition.competitorAName && competition.competitorBName
      ? `${competition.competitorAName} vs ${competition.competitorBName}`
      : null

  const submitCreateModerator = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    setCreateModError('')
    setCreateModNotice('')
    setCreateModLoading(true)
    try {
      const payload = {
        firstName: createModForm.firstName,
        lastName: createModForm.lastName,
        email: createModForm.email,
        ...(createModForm.generatePassword
          ? { generatePassword: true }
          : { password: createModForm.password }),
      }
      const result = await adminApi.createModerator(payload, accessToken)
      if (result.status === 'otp_sent') {
        setCreateModPending(result)
        setCreateModOtpCode('')
        setCreateModResendCountdown(result.resendAvailableInSeconds)
        setCreateModNotice(`Un code OTP a ete envoye a ${result.email}. Saisissez-le pour confirmer la creation.`)
        setCreateModModal('otp')
      } else {
        setCreateModResult(result)
        setCreateModNotice(result.message ?? '')
        setCreateModModal('success')
        const updated = await adminApi.listModerators(accessToken)
        setModeratorUsers(updated)
      }
    } catch (err) {
      setCreateModError(getOtpErrorMessage(err, 'Impossible de creer ce compte moderateur.'))
    } finally {
      setCreateModLoading(false)
    }
  }

  const resendCreateModeratorOtp = async () => {
    if (!accessToken || !createModPending || createModResendCountdown > 0) return
    setCreateModError('')
    setCreateModNotice('')
    setCreateModLoading(true)
    try {
      const result = await adminApi.resendModeratorOtp({ verificationId: createModPending.verificationId }, accessToken)
      setCreateModPending(result)
      setCreateModOtpCode('')
      setCreateModResendCountdown(result.resendAvailableInSeconds)
      setCreateModNotice(`Un nouveau code OTP a ete envoye a ${result.email}.`)
    } catch (err) {
      setCreateModError(getOtpErrorMessage(err, "Impossible de renvoyer le code OTP."))
    } finally {
      setCreateModLoading(false)
    }
  }

  const verifyCreateModeratorOtp = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !createModPending) return
    setCreateModError('')
    setCreateModNotice('')
    setCreateModLoading(true)
    try {
      const result = await adminApi.verifyModeratorOtp({
        verificationId: createModPending.verificationId,
        code: createModOtpCode,
      }, accessToken)
      setCreateModResult(result)
      setCreateModModal('success')
      const updated = await adminApi.listModerators(accessToken)
      setModeratorUsers(updated)
    } catch (err) {
      setCreateModError(getOtpErrorMessage(err, 'Erreur lors de la verification OTP.'))
    } finally {
      setCreateModLoading(false)
    }
  }

  const callApi = useCallback(<T,>(path: string, setter: (d: T) => void) =>
    apiCall<T>(path, {}, accessToken).then(setter).catch(() => {})
  , [accessToken])

  const loadAll = useCallback(() => {
    void callApi<SchoolClass[]>('/classes', setClasses)
    void callApi<Subject[]>('/subjects', setSubjects)
    void callApi<Stats>('/admin/stats', (s) => setStats(s))
  }, [callApi])

  const loadQuestions = useCallback(() => {
    const params = new URLSearchParams()
    if (qFilterClass) params.set('classId', qFilterClass)
    if (qFilterSubject) params.set('subjectId', qFilterSubject)
    void callApi<Question[]>(`/questions?${params.toString()}`, setQuestions)
  }, [callApi, qFilterClass, qFilterSubject])

  const loadSponsors = useCallback(() => {
    void callApi<Sponsor[]>('/admin/sponsors', setSponsors)
  }, [callApi])

  const loadArenaTabData = useCallback(() => {
    arenaApi.getCompetitions().then(setArenaCompetitions).catch(() => {})
    void callApi<Student[]>('/admin/students', setStudents)
    if (accessToken) {
      adminApi.listModerators(accessToken)
        .then((list) => setModeratorUsers(list))
        .catch(() => arenaApi.getModeratorUsers(accessToken).then(setModeratorUsers).catch(() => {}))
    }
  }, [accessToken, callApi])

  // ── Correspondence handlers ─────────────────────────────────────────────────
  const loadCorrSessions = useCallback(async () => {
    if (!accessToken) return
    setLoadingCorrSessions(true)
    setCorrSessionError('')
    try { setCorrSessions(await adminListSessions(accessToken)) }
    catch (e: unknown) { setCorrSessionError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoadingCorrSessions(false) }
  }, [accessToken])

  const handleCorrCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    setCorrCreating(true); setCorrSessionError('')
    try {
      await adminCreateSession({
        title: corrCreateForm.title, themePrompt: corrCreateForm.themePrompt,
        startAt: corrCreateForm.startAt, endAt: corrCreateForm.endAt,
        gracePeriodHours: Number(corrCreateForm.gracePeriodHours),
        rules: {
          maxLettersPerUser: Number(corrCreateForm.maxLettersPerUser),
          maxLettersReceived: Number(corrCreateForm.maxLettersReceived),
          minBodyLength: Number(corrCreateForm.minBodyLength),
          maxBodyLength: Number(corrCreateForm.maxBodyLength),
          allowVoting: corrCreateForm.allowVoting,
        },
      }, accessToken)
      setCorrShowCreate(false)
      await loadCorrSessions()
    } catch (e: unknown) { setCorrSessionError(e instanceof Error ? e.message : 'Erreur de création') }
    finally { setCorrCreating(false) }
  }

  const handleCorrStatusChange = async (s: ContestSession, newStatus: ContestSessionStatus) => {
    if (!accessToken) return
    try { await adminUpdateSession(s.id, { status: newStatus }, accessToken); await loadCorrSessions() }
    catch (e: unknown) { setCorrSessionError(e instanceof Error ? e.message : 'Erreur') }
  }

  const handleCorrTriggerAssign = async (sessionId: string) => {
    if (!accessToken) return
    setCorrAssigning(sessionId)
    try {
      const result = await adminTriggerAssign(sessionId, accessToken)
      setCorrAssignResult((prev) => ({ ...prev, [sessionId]: result }))
    } catch (e: unknown) { setCorrSessionError(e instanceof Error ? e.message : "Erreur lors de l'assignation") }
    finally { setCorrAssigning(null) }
  }

  const loadCorrReports = useCallback(async () => {
    if (!accessToken) return
    setLoadingCorrReports(true); setCorrReportError('')
    try { setCorrReports(await adminListReports(accessToken, corrReportFilter)) }
    catch (e: unknown) { setCorrReportError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoadingCorrReports(false) }
  }, [accessToken, corrReportFilter])

  useEffect(() => { if (tab === 'correspondence' && corrSubTab === 'moderation') void loadCorrReports() }, [tab, corrSubTab, loadCorrReports])

  const handleCorrReport = async (caseId: string, action: 'handle' | 'dismiss') => {
    if (!accessToken) return
    try { await adminHandleReport(caseId, action, accessToken); await loadCorrReports() }
    catch (e: unknown) { setCorrReportError(e instanceof Error ? e.message : 'Erreur') }
  }

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (tab === 'questions') loadQuestions()
    if (tab === 'students') void callApi<Student[]>('/admin/students', setStudents)
    if (tab === 'messages') {
      void callApi<Broadcast[]>('/admin/broadcasts', setBroadcasts)
      void callApi<Student[]>('/admin/students', setStudents)
    }
    if (tab === 'sponsors') loadSponsors()
    if (tab === 'arena') {
      loadArenaTabData()
    }
    if (tab === 'correspondence') {
      void loadCorrSessions()
    }
  }, [callApi, loadArenaTabData, loadQuestions, loadSponsors, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const createClass = async (e: FormEvent) => {
    e.preventDefault()
    setClassMsg('')
    try {
      const schoolClass = await apiCall<SchoolClass>('/classes', { method: 'POST', body: JSON.stringify({ name: newClass }) }, accessToken)
      setClasses((prev) => [...prev, schoolClass].sort((a, b) => a.name.localeCompare(b.name)))
      setNewClass('')
      setClassMsg(`✅ Classe "${schoolClass.name}" créée.`)
    } catch (err) { setClassMsg(`❌ ${(err as { message: string }).message}`) }
  }

  const createSubject = async (e: FormEvent) => {
    e.preventDefault()
    setSubjectMsg('')
    try {
      const sub = await apiCall<Subject>('/subjects', { method: 'POST', body: JSON.stringify(subjectForm) }, accessToken)
      setSubjects((prev) => [...prev, sub])
      setSubjectForm({ name: '', classId: '' })
      setSubjectMsg(`✅ Matière "${sub.name}" créée.`)
    } catch (err) { setSubjectMsg(`❌ ${(err as { message: string }).message}`) }
  }

  const createQuestion = async (e: FormEvent) => {
    e.preventDefault()
    setQMsg('')
    try {
      const q = await apiCall<Question>('/questions', {
        method: 'POST',
        body: JSON.stringify({ ...qForm, explanation: qForm.explanation || undefined }),
      }, accessToken)
      setQuestions((prev) => [q, ...prev])
      setQForm((f) => ({ ...f, prompt: '', optionA: '', optionB: '', optionC: '', optionD: '', explanation: '' }))
      setQMsg('✅ Question ajoutée.')
    } catch (err) { setQMsg(`❌ ${(err as { message: string }).message}`) }
  }

  const filteredSubjectsForQ = qForm.classId
    ? subjects.filter((s) => s.classId === qForm.classId)
    : subjects

  const sendBroadcast = async (e: FormEvent) => {
    e.preventDefault()
    setBroadcastMsg('')
    setBroadcastLoading(true)
    try {
      const payload: Record<string, string> = {
        title: broadcastForm.title,
        message: broadcastForm.message,
      }
      if (broadcastForm.classId) payload.classId = broadcastForm.classId
      if (broadcastForm.department) payload.department = broadcastForm.department
      if (broadcastForm.city) payload.city = broadcastForm.city
      if (broadcastForm.sectionName) payload.sectionName = broadcastForm.sectionName
      const bc = await apiCall<Broadcast>('/admin/broadcast', { method: 'POST', body: JSON.stringify(payload) }, accessToken)
      setBroadcasts((prev) => [bc, ...prev])
      setBroadcastForm((f) => ({ ...f, title: '', message: '', classId: '', department: '', city: '', sectionName: '' }))
      setBroadcastMsg(`✅ Message envoyé à ${bc.recipientCount} étudiant(s).`)
    } catch (err) {
      setBroadcastMsg(`❌ ${(err as { message: string }).message}`)
    } finally {
      setBroadcastLoading(false)
    }
  }

  const resetSponsorForm = () => {
    setEditingSponsorId(null)
    setSponsorForm({ name: '', logoUrl: '', websiteUrl: '', isActive: true, displayOrder: 0 })
  }

  const cityOptions = Array.from(new Set(
    students
      .filter((student) => !broadcastForm.department || student.department?.trim() === broadcastForm.department)
      .map((student) => student.city?.trim())
      .filter((value): value is string => !!value),
  )).sort((left, right) => left.localeCompare(right))

  const filteredSectionOptions = Array.from(new Set(
    students
      .filter((student) => !broadcastForm.department || student.department?.trim() === broadcastForm.department)
      .filter((student) => !broadcastForm.city || student.city?.trim() === broadcastForm.city)
      .map((student) => student.sectionName?.trim())
      .filter((value): value is string => !!value),
  )).sort((left, right) => left.localeCompare(right))

  const getBroadcastAudienceLabel = (bc: Broadcast) => {
    const filters: string[] = []
    if (bc.classId) {
      filters.push(`classe ${classes.find((schoolClass) => schoolClass.id === bc.classId)?.name ?? 'inconnue'}`)
    }
    if (bc.department) {
      filters.push(`departement ${bc.department}`)
    }
    if (bc.city) {
      filters.push(`ville ${bc.city}`)
    }
    if (bc.sectionName) {
      filters.push(`section ${bc.sectionName}`)
    }
    if (filters.length === 0) {
      if (bc.targetType === 'level' && bc.targetId) {
        return ` - classe ${classes.find((schoolClass) => schoolClass.id === bc.targetId)?.name ?? 'inconnue'}`
      }
      if (bc.targetType === 'class' && bc.targetId) {
        const matchingClass = classes.find((schoolClass) => schoolClass.id === bc.targetId)
        return matchingClass ? ` - classe ${matchingClass.name}` : ` - section ${bc.targetId.includes('::') ? bc.targetId.split('::', 2)[1] : bc.targetId}`
      }
      if (bc.targetType === 'department' && bc.targetId) {
        return ` - departement ${bc.targetId}`
      }
      if (bc.targetType === 'city' && bc.targetId) {
        return ` - ville ${bc.targetId}`
      }
      if (bc.targetType === 'section' && bc.targetId) {
        return ` - section ${bc.targetId.includes('::') ? bc.targetId.split('::', 2)[1] : bc.targetId}`
      }
      return ' - Tous les etudiants'
    }
    return ` - ${filters.join(' / ')}`
  }

  const saveSponsor = async (e: FormEvent) => {
    e.preventDefault()
    setSponsorMsg('')
    if (!sponsorForm.logoUrl.trim()) {
      setSponsorMsg('❌ Ajoutez un logo par image ou par URL avant de sauvegarder.')
      return
    }
    try {
      const payload = {
        name: sponsorForm.name,
        logoUrl: sponsorForm.logoUrl,
        websiteUrl: sponsorForm.websiteUrl || undefined,
        isActive: sponsorForm.isActive,
        displayOrder: Number(sponsorForm.displayOrder) || 0,
      }

      if (editingSponsorId) {
        await apiCall<Sponsor>(`/admin/sponsors/${editingSponsorId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }, accessToken)
        setSponsorMsg('✅ Sponsor mis à jour.')
      } else {
        await apiCall<Sponsor>('/admin/sponsors', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, accessToken)
        setSponsorMsg('✅ Sponsor ajouté.')
      }

      resetSponsorForm()
      loadSponsors()
    } catch (err) {
      setSponsorMsg(`❌ ${(err as { message: string }).message}`)
    }
  }

  const uploadSponsorLogo = async (file: File) => {
    if (!accessToken) return
    setSponsorMsg('')
    setSponsorUploadLoading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const data = await apiCall<{ logoUrl: string }>('/admin/sponsors/logo-upload', {
        method: 'POST',
        body,
      }, accessToken)
      setSponsorForm((current) => ({ ...current, logoUrl: data.logoUrl }))
      setSponsorMsg('✅ Logo importé avec succès.')
    } catch (err) {
      setSponsorMsg(`❌ ${(err as { message: string }).message}`)
    } finally {
      setSponsorUploadLoading(false)
    }
  }

  const startEditSponsor = (sponsor: Sponsor) => {
    setEditingSponsorId(sponsor.id)
    setSponsorForm({
      name: sponsor.name,
      logoUrl: sponsor.logoUrl,
      websiteUrl: sponsor.websiteUrl ?? '',
      isActive: sponsor.isActive,
      displayOrder: sponsor.displayOrder,
    })
  }

  const toggleSponsor = async (sponsor: Sponsor) => {
    setSponsorMsg('')
    try {
      await apiCall<Sponsor>(`/admin/sponsors/${sponsor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !sponsor.isActive }),
      }, accessToken)
      loadSponsors()
    } catch (err) {
      setSponsorMsg(`❌ ${(err as { message: string }).message}`)
    }
  }

  const deleteSponsor = async (sponsorId: string) => {
    if (!window.confirm('Supprimer ce sponsor ?')) return
    setSponsorMsg('')
    try {
      await apiCall<{ success: boolean }>(`/admin/sponsors/${sponsorId}`, { method: 'DELETE' }, accessToken)
      if (editingSponsorId === sponsorId) {
        resetSponsorForm()
      }
      loadSponsors()
      setSponsorMsg('✅ Sponsor supprimé.')
    } catch (err) {
      setSponsorMsg(`❌ ${(err as { message: string }).message}`)
    }
  }

  const openAdminTab = (nextTab: Tab) => {
    setTab(nextTab)
  }

  const openAdminCorrespondence = (nextSubTab: CorrSubTab) => {
    setTab('correspondence')
    setCorrSubTab(nextSubTab)
  }

  const adminSidebarSections: DashboardSidebarSection[] = [
    {
      title: 'Tableau de bord',
      note: 'Pilotage',
      items: [
        { id: 'overview', label: 'Vue d\'ensemble', onClick: () => openAdminTab('overview'), active: tab === 'overview' },
        { id: 'overview-alerts', label: 'Indicateurs clés', muted: true, disabled: true },
        { id: 'overview-warnings', label: 'Alertes', muted: true, disabled: true },
      ],
    },
    {
      title: 'Gestion académique',
      note: 'Contenus',
      items: [
        { id: 'levels', label: 'Classes', onClick: () => openAdminTab('levels'), active: tab === 'levels' },
        { id: 'subjects', label: 'Matières', onClick: () => openAdminTab('subjects'), active: tab === 'subjects' },
        { id: 'questions', label: 'Questions', onClick: () => openAdminTab('questions'), active: tab === 'questions' },
        { id: 'exams', label: 'Examens', muted: true, disabled: true },
        { id: 'certifications', label: 'Certifications', muted: true, disabled: true },
        { id: 'library', label: 'Bibliothèque de contenus', muted: true, disabled: true },
      ],
    },
    {
      title: 'Utilisateurs',
      note: 'Accès',
      items: [
        { id: 'students', label: 'Étudiants', onClick: () => openAdminTab('students'), active: tab === 'students' },
        { id: 'roles', label: 'Rôles et accès', muted: true, disabled: true },
      ],
    },
    {
      title: 'Communication',
      note: 'Messages',
      items: [
        { id: 'messages', label: 'Messages', onClick: () => openAdminTab('messages'), active: tab === 'messages' },
        {
          id: 'correspondence',
          label: 'Correspondance',
          onClick: () => openAdminTab('correspondence'),
          active: tab === 'correspondence',
          children: [
            { id: 'corr-sessions', label: 'Sessions', onClick: () => openAdminCorrespondence('sessions'), active: tab === 'correspondence' && corrSubTab === 'sessions' },
            { id: 'corr-moderation', label: 'Modération', onClick: () => openAdminCorrespondence('moderation'), active: tab === 'correspondence' && corrSubTab === 'moderation' },
          ],
        },
        { id: 'notifications', label: 'Notifications', muted: true, disabled: true },
      ],
    },
    {
      title: 'Compétitions',
      note: 'Arena',
      items: [
        { id: 'arena', label: 'Arena', onClick: () => openAdminTab('arena'), active: tab === 'arena' },
        { id: 'competition-sessions', label: 'Sessions live', muted: true, disabled: true },
        { id: 'competition-ranking', label: 'Classements', muted: true, disabled: true },
      ],
    },
    {
      title: 'Croissance',
      note: 'Business',
      items: [
        { id: 'sponsors', label: 'Sponsors', onClick: () => openAdminTab('sponsors'), active: tab === 'sponsors' },
        { id: 'payments', label: 'Paiements', muted: true, disabled: true },
        { id: 'subscriptions', label: 'Abonnements', muted: true, disabled: true },
      ],
    },
    {
      title: 'Analyse',
      note: 'Lecture',
      items: [
        { id: 'reports', label: 'Rapports', muted: true, disabled: true },
        { id: 'stats', label: 'Statistiques', muted: true, disabled: true },
        { id: 'ai', label: 'IA pédagogique', muted: true, disabled: true },
      ],
    },
    {
      title: 'Paramètres',
      note: 'Système',
      items: [
        { id: 'organization', label: 'Organisation', muted: true, disabled: true },
        { id: 'integrations', label: 'Intégrations', muted: true, disabled: true },
        { id: 'security', label: 'Sécurité', muted: true, disabled: true },
        { id: 'global-config', label: 'Configuration globale', muted: true, disabled: true },
      ],
    },
  ]

  return (
    <div className="dashboard-shell flex">
      <DashboardSidebar
        portalLabel="Dashboard administrateur"
        identityLabel="Administration"
        identityCaption="Pilotage du produit"
        identityMeta="Navigation hiérarchique"
        avatarText="A"
        sections={adminSidebarSections}
        onLogout={logout}
        logoutLabel="Déconnexion"
        footerNote="Architecture pensée pour accueillir examens, rapports, paiements et IA pédagogique."
      />

      {/* -- MAIN -- */}
      <main className="flex-1" style={{ paddingBottom: 80 }}>
        {/* Mobile top bar */}
        <div className="md:hidden" style={{ background: '#fff', borderBottom: '1px solid var(--rule)', padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <span className="brand" style={{ fontSize: 16, color: 'var(--cobalt)' }}>Konesans</span>
            <span className="brand" style={{ fontSize: 16, color: 'var(--gold)' }}>+</span>
            <span style={{ fontSize: 14, color: 'var(--ink-3)', marginLeft: 6 }}>Admin</span>
          </div>
          <button onClick={logout} style={{ fontSize: 16, color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Quitter</button>
        </div>

        <div className="dashboard-main md:ml-[292px]" style={{ maxWidth: 860 }}>

          {/* -- OVERVIEW -- */}
          {tab === 'overview' && (
            <div>
              <p className="overline" style={{ marginBottom: 8 }}>Administration</p>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 24 }}>Vue d'ensemble</h1>

              <div className="responsive-four-col" style={{ border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden', marginBottom: 24, background: 'var(--rule)' }}>
                {[
                  { label: 'Étudiants', value: stats?.studentCount ?? '—' },
                  { label: 'Questions', value: stats?.questionCount ?? '—' },
                  { label: 'Matières', value: stats?.subjectCount ?? '—' },
                  { label: 'Quiz complétés', value: stats?.sessionCount ?? '—' },
                ].map((s) => (
                  <div key={s.label} className="mobile-stat-card" style={{ background: '#fff', padding: '20px 16px' }}>
                    <div className="display" style={{ fontSize: 28, color: 'var(--cobalt)' }}>{s.value}</div>
                    <div style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="responsive-two-col" style={{ gap: 16 }}>
                <div className="card">
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 14 }}>Actions rapides</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { label: 'Créer une classe', tab: 'levels' as Tab },
                      { label: 'Ajouter une matière', tab: 'subjects' as Tab },
                      { label: 'Ajouter une question', tab: 'questions' as Tab },
                    ].map((a) => (
                      <button
                        key={a.label}
                        onClick={() => setTab(a.tab)}
                        className="btn btn-ghost"
                        style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                      >
                        + {a.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 14 }}>Classes actives ({classes.length})</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {classes.map((schoolClass) => (
                      <div key={schoolClass.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: 'var(--ink)' }}>
                        <span>{schoolClass.name}</span>
                        <span style={{ color: 'var(--ink-3)' }}>{subjects.filter((s) => s.classId === schoolClass.id).length} mat.</span>
                      </div>
                    ))}
                    {classes.length === 0 && <p style={{ fontSize: 16, color: 'var(--ink-3)' }}>Aucune classe créée.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* -- CLASSES -- */}
          {tab === 'levels' && (
            <div>
              <p className="overline" style={{ marginBottom: 8 }}>Contenu</p>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 20 }}>Classes</h1>

              <div className="responsive-two-col" style={{ gap: 16 }}>
                <div className="card">
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 14 }}>Créer une classe</p>
                  {classMsg && <div className={`alert ${classMsg.startsWith('✅') ? 'alert-ok' : 'alert-error'}`} style={{ marginBottom: 10 }}>{classMsg}</div>}
                  <form onSubmit={createClass} style={{ display: 'flex', gap: 8 }}>
                    <input type="text" required value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="ex: 6e AF, NS4" className="field-input" style={{ flex: 1 }} />
                    <button type="submit" className="btn btn-primary btn-sm">Créer</button>
                  </form>
                </div>

                <div className="card">
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 14 }}>Classes existantes ({classes.length})</p>
                  {classes.length === 0 ? (
                    <p style={{ fontSize: 16, color: 'var(--ink-3)' }}>Aucune classe créée.</p>
                  ) : (
                    <div style={{ border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden' }}>
                      {classes.map((schoolClass, i, arr) => (
                        <div key={schoolClass.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--rule)' : 'none', fontSize: 16 }}>
                          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{schoolClass.name}</span>
                          <span style={{ color: 'var(--ink-3)' }}>{subjects.filter((s) => s.classId === schoolClass.id).length} matière(s)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* -- MATIÈRES -- */}
          {tab === 'subjects' && (
            <div>
              <p className="overline" style={{ marginBottom: 8 }}>Contenu</p>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 20 }}>Matières</h1>

              <div className="responsive-two-col" style={{ gap: 16 }}>
                <div className="card">
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 14 }}>Ajouter une matière</p>
                  {subjectMsg && <div className={`alert ${subjectMsg.startsWith('✅') ? 'alert-ok' : 'alert-error'}`} style={{ marginBottom: 10 }}>{subjectMsg}</div>}
                  <form onSubmit={createSubject} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <select required value={subjectForm.classId} onChange={(e) => setSubjectForm({ ...subjectForm, classId: e.target.value })} className="field-input">
                      <option value="">Choisir une classe</option>
                      {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
                    </select>
                    <input type="text" required value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} placeholder="Nom de la matière" className="field-input" />
                    <button type="submit" className="btn btn-primary btn-sm">Ajouter</button>
                  </form>
                </div>

                <div className="card" style={{ overflowY: 'auto', maxHeight: 340 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 14 }}>Toutes les matières ({subjects.length})</p>
                  {classes.map((schoolClass) => {
                    const subs = subjects.filter((s) => s.classId === schoolClass.id)
                    if (subs.length === 0) return null
                    return (
                      <div key={schoolClass.id} style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>{schoolClass.name}</p>
                        {subs.map((s) => (
                          <div key={s.id} style={{ fontSize: 16, color: 'var(--ink)', padding: '6px 0', borderBottom: '1px solid var(--rule)' }}>{s.name}</div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* -- QUESTIONS -- */}
          {tab === 'questions' && (
            <div>
              <p className="overline" style={{ marginBottom: 8 }}>Contenu</p>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 20 }}>Banque de Questions</h1>

              <div className="card" style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 14 }}>Ajouter une question</p>
                {qMsg && <div className={`alert ${qMsg.startsWith('✅') ? 'alert-ok' : 'alert-error'}`} style={{ marginBottom: 12 }}>{qMsg}</div>}
                <form onSubmit={createQuestion} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="responsive-two-col" style={{ gap: 10 }}>
                    <select required value={qForm.classId} onChange={(e) => setQForm({ ...qForm, classId: e.target.value, subjectId: '' })} className="field-input">
                      <option value="">Classe</option>
                      {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>) }
                    </select>
                    <select required value={qForm.subjectId} onChange={(e) => setQForm({ ...qForm, subjectId: e.target.value })} disabled={!qForm.classId} className="field-input">
                      <option value="">Matière</option>
                      {filteredSubjectsForQ.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <textarea required value={qForm.prompt} onChange={(e) => setQForm({ ...qForm, prompt: e.target.value })} placeholder="Énoncé de la question" rows={2} className="field-input" style={{ resize: 'none' }} />

                  <div className="responsive-two-col" style={{ gap: 8 }}>
                    {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                      <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, background: qForm.correctOption === opt ? 'var(--ok)' : 'var(--stone)', color: qForm.correctOption === opt ? '#fff' : 'var(--ink-3)' }}>{opt}</span>
                        <input type="text" required value={qForm[`option${opt}` as keyof typeof qForm] as string} onChange={(e) => setQForm({ ...qForm, [`option${opt}`]: e.target.value })} placeholder={`Option ${opt}`} className="field-input" />
                      </div>
                    ))}
                  </div>

                  <div className="responsive-two-col" style={{ gap: 10 }}>
                    <div>
                      <label className="field-label">Bonne réponse</label>
                      <select value={qForm.correctOption} onChange={(e) => setQForm({ ...qForm, correctOption: e.target.value })} className="field-input">
                        {['A', 'B', 'C', 'D'].map((o) => <option key={o} value={o}>Option {o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Difficulté</label>
                      <select value={qForm.difficulty} onChange={(e) => setQForm({ ...qForm, difficulty: e.target.value })} className="field-input">
                        <option value="easy">Facile</option>
                        <option value="medium">Moyen</option>
                        <option value="hard">Difficile</option>
                      </select>
                    </div>
                  </div>

                  <input type="text" value={qForm.explanation} onChange={(e) => setQForm({ ...qForm, explanation: e.target.value })} placeholder="Explication (optionnel)" className="field-input" />

                  <button type="submit" className="btn btn-primary btn-full">Ajouter la question</button>
                </form>
              </div>

              {/* Filter + list */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)' }}>Questions ({questions.length})</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={qFilterClass} onChange={(e) => { setQFilterClass(e.target.value); setQFilterSubject('') }} className="field-input" style={{ width: 'auto' }}>
                      <option value="">Toutes les classes</option>
                      {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>) }
                    </select>
                    <select value={qFilterSubject} onChange={(e) => setQFilterSubject(e.target.value)} disabled={!qFilterClass} className="field-input" style={{ width: 'auto' }}>
                      <option value="">Tout</option>
                      {subjects.filter((s) => !qFilterClass || s.classId === qFilterClass).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--rule)', borderRadius: 6 }}>
                  {questions.map((q, i, arr) => (
                    <div key={q.id} style={{ padding: '12px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--rule)' : 'none' }}>
                      <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 9 }}>{q.prompt}</p>
                      <div className="responsive-two-col" style={{ gap: 4, marginBottom: 9 }}>
                        {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                          <span key={opt} style={{ fontSize: 14, padding: '4px 10px', borderRadius: 4, background: q.correctOption === opt ? 'var(--ok-bg)' : 'var(--stone)', color: q.correctOption === opt ? 'var(--ok)' : 'var(--ink-3)', fontWeight: q.correctOption === opt ? 600 : 400 }}>
                            {opt}: {q[`option${opt}` as keyof typeof q] as string}
                          </span>
                        ))}
                      </div>
                      <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 4, background: q.difficulty === 'hard' ? 'var(--error-bg)' : q.difficulty === 'medium' ? 'var(--gold-pale)' : 'var(--ok-bg)', color: q.difficulty === 'hard' ? 'var(--error)' : q.difficulty === 'medium' ? 'var(--gold)' : 'var(--ok)', fontWeight: 600 }}>
                        {q.difficulty}
                      </span>
                    </div>
                  ))}
                  {questions.length === 0 && <p style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '24px', fontSize: 16 }}>Aucune question trouvée.</p>}
                </div>
              </div>
            </div>
          )}

          {/* -- ÉTUDIANTS -- */}
          {tab === 'students' && (
            <div>
              <p className="overline" style={{ marginBottom: 8 }}>Gestion</p>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 20 }}>Étudiants</h1>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)' }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)' }}>
                    {students.length} étudiant{students.length !== 1 ? 's' : ''} enregistré{students.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nom</th>
                        <th>Email</th>
                        <th>École</th>
                        <th>Département</th>
                        <th>Section</th>
                        <th>Ville</th>
                        <th>Inscrit le</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 500 }}>{s.firstName} {s.lastName}</td>
                          <td>{s.email}</td>
                          <td>{s.school ?? '—'}</td>
                          <td>{s.department ?? '—'}</td>
                          <td>{s.sectionName ?? '—'}</td>
                          <td>{s.city ?? '—'}</td>
                          <td>{new Date(s.createdAt).toLocaleDateString('fr-HT')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {students.length === 0 && (
                    <p style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '32px', fontSize: 16 }}>Aucun étudiant enregistré.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* -- MESSAGES -- */}
          {tab === 'messages' && (
            <div>
              <p className="overline" style={{ marginBottom: 8 }}>Administration</p>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 24 }}>Messages broadcast</h1>

              {/* Compose form */}
              <div className="card" style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cobalt)', marginBottom: 16 }}>Envoyer un message</h2>
                {broadcastMsg && (
                  <div className={broadcastMsg.startsWith('✅') ? 'alert alert-ok' : 'alert alert-error'} style={{ marginBottom: 16 }}>
                    {broadcastMsg}
                  </div>
                )}
                <form onSubmit={sendBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div>
                      <label className="field-label">Classe</label>
                      <select
                        value={broadcastForm.classId}
                        onChange={(e) => setBroadcastForm({ ...broadcastForm, classId: e.target.value })}
                        className="field-input"
                      >
                        <option value="">Toutes les classes</option>
                        {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Département</label>
                      <select
                        value={broadcastForm.department}
                        onChange={(e) => setBroadcastForm({ ...broadcastForm, department: e.target.value, city: '', sectionName: '' })}
                        className="field-input"
                      >
                        <option value="">Tous les départements</option>
                        {HAITI_DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Ville</label>
                      <select
                        value={broadcastForm.city}
                        onChange={(e) => setBroadcastForm({ ...broadcastForm, city: e.target.value, sectionName: '' })}
                        className="field-input"
                      >
                        <option value="">Toutes les villes</option>
                        {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Section</label>
                      <select
                        value={broadcastForm.sectionName}
                        onChange={(e) => setBroadcastForm({ ...broadcastForm, sectionName: e.target.value })}
                        className="field-input"
                      >
                        <option value="">Toutes les sections</option>
                        {filteredSectionOptions.map((sectionName) => <option key={sectionName} value={sectionName}>{sectionName}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Titre</label>
                    <input
                      type="text"
                      required
                      value={broadcastForm.title}
                      onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                      className="field-input"
                      placeholder="Ex: Nouvelle compétition disponible"
                    />
                  </div>
                  <div>
                    <label className="field-label">Message</label>
                    <textarea
                      required
                      rows={4}
                      value={broadcastForm.message}
                      onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                      className="field-input"
                      placeholder="Rédigez votre message ici…"
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                  <button type="submit" disabled={broadcastLoading} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                    {broadcastLoading ? 'Envoi en cours…' : 'Envoyer le message'}
                  </button>
                </form>
              </div>

              {/* Sent broadcasts list */}
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cobalt)', marginBottom: 14 }}>Historique des envois</h2>
              {broadcasts.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
                  <p style={{ color: 'var(--ink-3)' }}>Aucun message envoyé pour l'instant.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {broadcasts.map((bc) => (
                    <div key={bc.id} className="card" style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{bc.title}</p>
                          <p style={{ fontSize: 15, color: 'var(--ink-3)', marginTop: 4 }}>{bc.message}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>{new Date(bc.createdAt).toLocaleString('fr-HT')}</p>
                          <p style={{ fontSize: 13, color: 'var(--cobalt)', fontWeight: 600, marginTop: 2 }}>
                            {bc.recipientCount} destinataire{bc.recipientCount !== 1 ? 's' : ''}
                            {getBroadcastAudienceLabel(bc)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -- SPONSORS -- */}
          {tab === 'sponsors' && (
            <div>
              <p className="overline" style={{ marginBottom: 8 }}>Administration</p>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 20 }}>Sponsors</h1>

              <div className="responsive-two-col" style={{ gap: 16, marginBottom: 20 }}>
                <div className="card">
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 14 }}>
                    {editingSponsorId ? 'Modifier le sponsor' : 'Ajouter un sponsor'}
                  </p>

                  {sponsorMsg && <div className={`alert ${sponsorMsg.startsWith('✅') ? 'alert-ok' : 'alert-error'}`} style={{ marginBottom: 12 }}>{sponsorMsg}</div>}

                  <form onSubmit={saveSponsor} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label className="field-label">Nom</label>
                      <input
                        required
                        type="text"
                        value={sponsorForm.name}
                        onChange={(e) => setSponsorForm((f) => ({ ...f, name: e.target.value }))}
                        className="field-input"
                      />
                    </div>

                    <div>
                      <label className="field-label">Image du logo</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            void uploadSponsorLogo(file)
                          }
                          e.currentTarget.value = ''
                        }}
                        className="field-input"
                      />
                      <p style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                        Importez une image depuis votre appareil. Vous pouvez aussi garder un logo externe via URL.
                      </p>
                    </div>

                    <div>
                      <label className="field-label">Logo URL</label>
                      <input
                        type="url"
                        value={sponsorForm.logoUrl}
                        onChange={(e) => setSponsorForm((f) => ({ ...f, logoUrl: e.target.value }))}
                        className="field-input"
                        placeholder="https://..."
                      />
                      {sponsorUploadLoading && (
                        <p style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-3)' }}>Import du logo en cours…</p>
                      )}
                      {sponsorForm.logoUrl && (
                        <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--rule)', borderRadius: 8, background: '#fff' }}>
                          <img src={sponsorForm.logoUrl} alt="Aperçu du logo sponsor" style={{ maxWidth: 180, maxHeight: 72, objectFit: 'contain' }} />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="field-label">Website URL (optionnel)</label>
                      <input
                        type="url"
                        value={sponsorForm.websiteUrl}
                        onChange={(e) => setSponsorForm((f) => ({ ...f, websiteUrl: e.target.value }))}
                        className="field-input"
                        placeholder="https://..."
                      />
                    </div>

                    <div>
                      <label className="field-label">Ordre d'affichage</label>
                      <input
                        type="number"
                        min={0}
                        value={sponsorForm.displayOrder}
                        onChange={(e) => setSponsorForm((f) => ({ ...f, displayOrder: Number(e.target.value) || 0 }))}
                        className="field-input"
                      />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink-2)' }}>
                      <input
                        type="checkbox"
                        checked={sponsorForm.isActive}
                        onChange={(e) => setSponsorForm((f) => ({ ...f, isActive: e.target.checked }))}
                      />
                      Sponsor actif
                    </label>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn btn-primary btn-sm">
                        {editingSponsorId ? 'Mettre à jour' : 'Ajouter'}
                      </button>
                      {editingSponsorId && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={resetSponsorForm}>
                          Annuler
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ fontSize: 14, color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.7 }}>
                    Les sponsors actifs sont affichés sur le landing page public selon l'ordre croissant.
                  </p>
                </div>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)' }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)' }}>Liste des sponsors ({sponsors.length})</p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Logo</th>
                        <th>Nom</th>
                        <th>Statut</th>
                        <th>Ordre</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sponsors.map((sponsor) => (
                        <tr key={sponsor.id}>
                          <td>
                            <img src={sponsor.logoUrl} alt={sponsor.name} style={{ width: 58, height: 28, objectFit: 'contain', borderRadius: 4 }} />
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 500 }}>{sponsor.name}</span>
                              {sponsor.websiteUrl && (
                                <a href={sponsor.websiteUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--cobalt)', textDecoration: 'none' }}>
                                  {sponsor.websiteUrl}
                                </a>
                              )}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: 12, fontWeight: 600, color: sponsor.isActive ? 'var(--ok)' : 'var(--ink-3)' }}>
                              {sponsor.isActive ? 'Actif' : 'Inactif'}
                            </span>
                          </td>
                          <td>{sponsor.displayOrder}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => startEditSponsor(sponsor)}>Éditer</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => toggleSponsor(sponsor)}>
                                {sponsor.isActive ? 'Désactiver' : 'Activer'}
                              </button>
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => deleteSponsor(sponsor.id)}>
                                Supprimer
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {sponsors.length === 0 && (
                    <p style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '32px', fontSize: 16 }}>Aucun sponsor pour le moment.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* -- ARENA -- */}
          {tab === 'arena' && (
            <div>
              <p className="overline" style={{ marginBottom: 8 }}>Administration</p>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 16 }}>Arena</h1>

              {/* Internal tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--rule)', paddingBottom: 0 }}>
                {([
                  { key: 'matches' as const, label: 'Matchs' },
                  { key: 'affectations' as const, label: 'Affectations' },
                ]).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setArenaTab(t.key)}
                    style={{
                      padding: '8px 20px',
                      border: 'none',
                      background: 'none',
                      fontFamily: 'inherit',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: arenaTab === t.key ? 'var(--cobalt)' : 'var(--ink-3)',
                      borderBottom: arenaTab === t.key ? '2px solid var(--cobalt)' : '2px solid transparent',
                      marginBottom: -2,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {arenaError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{arenaError}</div>}
              {arenaMsg && <div className="alert alert-ok" style={{ marginBottom: 16 }}>{arenaMsg}</div>}

              {/* -- TAB: MATCHS -- */}
              {arenaTab === 'matches' && (
                <div>
                  {/* Create Competition */}
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Nouveau match</h2>
                  <div className="card" style={{ marginBottom: 24 }}>
                    <div className="responsive-two-col" style={{ gap: 12, marginBottom: 12 }}>
                      <div>
                        <label className="field-label">Nom du match</label>
                        <input className="field-input" value={arenaCompForm.name} onChange={(e) => setArenaCompForm(f => ({ ...f, name: e.target.value }))} placeholder="Duel Mathématiques S1" style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label className="field-label">Compétiteur A</label>
                        <select className="field-input" value={arenaCompForm.competitorAUserId} onChange={(e) => setArenaCompForm(f => ({ ...f, competitorAUserId: e.target.value }))} style={{ width: '100%' }}>
                          <option value="">— Choisir le compétiteur A —</option>
                          {students.map((student) => (
                            <option key={student.id} value={student.id}>
                              {student.firstName} {student.lastName} ({student.email})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label">Compétiteur B</label>
                        <select className="field-input" value={arenaCompForm.competitorBUserId} onChange={(e) => setArenaCompForm(f => ({ ...f, competitorBUserId: e.target.value }))} style={{ width: '100%' }}>
                          <option value="">— Choisir le compétiteur B —</option>
                          {students.map((student) => (
                            <option key={student.id} value={student.id}>
                              {student.firstName} {student.lastName} ({student.email})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label">Modérateur assigné</label>
                        <select className="field-input" value={arenaCompForm.moderatorUserId} onChange={(e) => setArenaCompForm(f => ({ ...f, moderatorUserId: e.target.value }))} style={{ width: '100%' }}>
                          <option value="">— Assigner plus tard —</option>
                          {moderatorUsers.map((moderator) => (
                            <option key={moderator.id} value={moderator.id}>
                              {moderator.firstName} {moderator.lastName} ({moderator.email}) {moderator.role === 'admin' ? '• Admin' : '• Modérateur'}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label">Questions prévues</label>
                        <input className="field-input" type="number" min={1} max={30} value={arenaCompForm.questionCount} onChange={(e) => setArenaCompForm(f => ({ ...f, questionCount: +e.target.value }))} style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label className="field-label">Temps de réponse (secondes)</label>
                        <input className="field-input" type="number" min={10} max={120} value={arenaCompForm.secondsPerQuestion} onChange={(e) => setArenaCompForm(f => ({ ...f, secondsPerQuestion: +e.target.value }))} style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label className="field-label">Date du direct</label>
                        <input className="field-input" type="datetime-local" value={arenaCompForm.scheduledAt} onChange={(e) => setArenaCompForm(f => ({ ...f, scheduledAt: e.target.value }))} style={{ width: '100%' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label className="field-label">Brief du match</label>
                      <textarea className="field-input" rows={3} value={arenaCompForm.description} onChange={(e) => setArenaCompForm(f => ({ ...f, description: e.target.value }))} placeholder="Contexte éditorial, thème et consignes pour le modérateur" style={{ width: '100%', resize: 'vertical' }} />
                    </div>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                      Le match est créé avec deux compétiteurs désignés à l’avance. Une bonne réponse vaut 1 point et le modérateur garde la main sur chaque question.
                    </p>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={async () => {
                        setArenaError(''); setArenaMsg('')
                        try {
                          if (!accessToken) throw new Error('Session administrateur invalide.')
                          if (!arenaCompForm.name.trim()) throw new Error('Le nom du match est requis.')
                          if (!arenaCompForm.competitorAUserId || !arenaCompForm.competitorBUserId) throw new Error('Choisissez les deux compétiteurs du match.')
                          if (arenaCompForm.competitorAUserId === arenaCompForm.competitorBUserId) throw new Error('Choisissez deux compétiteurs différents.')
                          if (!arenaCompForm.scheduledAt) throw new Error('La date du direct est requise.')
                          const c = await arenaApi.createCompetition({
                            name: arenaCompForm.name.trim(),
                            competitorAUserId: arenaCompForm.competitorAUserId,
                            competitorBUserId: arenaCompForm.competitorBUserId,
                            moderatorUserId: arenaCompForm.moderatorUserId || undefined,
                            questionCount: arenaCompForm.questionCount,
                            secondsPerQuestion: arenaCompForm.secondsPerQuestion,
                            scheduledAt: arenaCompForm.scheduledAt,
                            description: arenaCompForm.description.trim() || undefined,
                          }, accessToken)
                          setArenaCompetitions(prev => [c, ...prev])
                          setArenaMsg(`Match "${c.name}" créé.`)
                          setArenaCompForm({ name: '', competitorAUserId: '', competitorBUserId: '', moderatorUserId: '', questionCount: 10, secondsPerQuestion: 30, description: '', scheduledAt: '' })
                        } catch (err) { setArenaError((err as Error).message) }
                      }}
                    >
                      Créer le match
                    </button>
                  </div>

                  {/* Competitions list */}
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Compétitions</h2>
                  {arenaCompetitions.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '24px', marginBottom: 24 }}>
                      <p style={{ color: 'var(--ink-3)' }}>Aucune compétition pour l'instant.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
                      {arenaCompetitions.map((comp, i, arr) => (
                        <div key={comp.id} style={{ padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--rule)' : 'none', background: '#fff' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{comp.name}</p>
                              <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>{comp.status} · {comp.questionCount} question{comp.questionCount > 1 ? 's' : ''} · {comp.secondsPerQuestion}s / réponse</p>
                              {getArenaDuelLabel(comp) && (
                                <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{getArenaDuelLabel(comp)}</p>
                              )}
                              {comp.moderatorUserId && (
                                <p style={{ fontSize: 11, color: 'var(--cobalt)', marginTop: 2 }}>
                                  🎙️ {comp.moderatorName ?? comp.moderatorEmail ?? 'Modérateur assigné'}
                                </p>
                              )}
                              <p style={{ fontSize: 11, color: comp.publicStreamProvider === 'youtube' ? 'var(--ok)' : 'var(--ink-3)', marginTop: 2 }}>
                                {comp.publicStreamProvider === 'youtube'
                                  ? `Public YouTube · ${comp.publicStreamStatus === 'live' ? 'en direct' : comp.publicStreamStatus === 'stopped' ? 'terminé' : 'prêt à diffuser'}`
                                  : 'Public YouTube non configuré'}
                              </p>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {comp.status === 'pending' && !isAssignedArenaMatch(comp) && (
                                <button className="btn btn-primary btn-sm" onClick={async () => {
                                  setArenaError(''); setArenaMsg('')
                                  try {
                                    const res = await fetch(`${ARENA_API}/competitions/${comp.id}/open`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${accessToken}` } })
                                    if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Erreur') }
                                    setArenaCompetitions(prev => prev.map(c => c.id === comp.id ? { ...c, status: 'approved' } : c))
                                    setArenaMsg('Inscriptions ouvertes.')
                                  } catch (err) { setArenaError((err as Error).message) }
                                }}>Ouvrir inscriptions</button>
                              )}
                              {comp.status === 'approved' && (
                                <button className="btn btn-primary btn-sm" onClick={async () => {
                                  setArenaError(''); setArenaMsg('')
                                  try {
                                    const res = await fetch(`${ARENA_API}/competitions/${comp.id}/launch`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                                      body: JSON.stringify({}),
                                    })
                                    if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Erreur') }
                                    setArenaCompetitions(prev => prev.map(c => c.id === comp.id ? { ...c, status: 'live' } : c))
                                    setArenaMsg('Match lancé en direct.')
                                  } catch (err) { setArenaError((err as Error).message) }
                                }}>
                                  Mettre en direct
                                </button>
                              )}
                              {(comp.status === 'pending' || comp.status === 'approved') && (
                                <a
                                  href={`/arena/live/${comp.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-ghost btn-sm"
                                  style={{ textDecoration: 'none' }}
                                >
                                  🎙️ Préparer la scène
                                </a>
                              )}
                              {comp.status === 'live' && (
                                <>
                                  <a
                                    href={`/arena/live/${comp.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-primary btn-sm"
                                    style={{ textDecoration: 'none' }}
                                  >
                                    🎙️ Scène privée
                                  </a>
                                  <button className="btn btn-primary btn-sm" onClick={async () => {
                                    setArenaError(''); setArenaMsg('')
                                    try {
                                      const res = await fetch(`${ARENA_API}/competitions/${comp.id}/next-round`, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } })
                                      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Erreur') }
                                      setArenaMsg('Question suivante ouverte.')
                                    } catch (err) { setArenaError((err as Error).message) }
                                  }}>Question suivante</button>
                                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={async () => {
                                    setArenaError(''); setArenaMsg('')
                                    const regs = await arenaApi.getRegistrations(comp.id, accessToken!).catch(() => [])
                                    const candidates = regs.filter(r => r.status === 'approved')
                                    if (candidates.length === 0) {
                                      setArenaError('Aucun compétiteur approuvé pour cette compétition.')
                                      return
                                    }
                                    setWinnerPicker({ compId: comp.id, participants: candidates })
                                  }}>Terminer</button>
                                </>
                              )}
                              <button className="btn btn-ghost btn-sm" onClick={async () => {
                                setSelectedCompetitionId(comp.id)
                                const regs = await arenaApi.getRegistrations(comp.id, accessToken!).catch(() => [])
                                setArenaRegistrations(regs)
                              }}>{isAssignedArenaMatch(comp) ? 'Fiche du match' : 'Inscriptions'}</button>
                            </div>
                          </div>

                          <div style={{ marginTop: 12, border: '1px solid var(--rule)', borderRadius: 8, padding: 12, background: '#fafcff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                              <div>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Diffusion publique YouTube</p>
                                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--ink-3)' }}>
                                  Les joueurs et le modérateur gardent la scène privée sur Konesans+. Les spectateurs regardent la vidéo publique sur YouTube Live.
                                </p>
                              </div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <a
                                  href={`/arena/watch/${comp.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-ghost btn-sm"
                                  style={{ textDecoration: 'none' }}
                                >
                                  Page spectateurs
                                </a>
                                {comp.publicStreamUrl && (
                                  <a
                                    href={comp.publicStreamUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-ghost btn-sm"
                                    style={{ textDecoration: 'none' }}
                                  >
                                    Ouvrir YouTube
                                  </a>
                                )}
                              </div>
                            </div>

                            <div className="responsive-two-col" style={{ gap: 12 }}>
                              <div>
                                <label className="field-label">Lien du live YouTube</label>
                                <input
                                  className="field-input"
                                  value={publicStreamDrafts[comp.id]?.streamUrl ?? comp.publicStreamUrl ?? ''}
                                  onChange={(e) => setPublicStreamDrafts((prev) => ({
                                    ...prev,
                                    [comp.id]: {
                                      streamUrl: e.target.value,
                                      chatUrl: prev[comp.id]?.chatUrl ?? comp.publicStreamChatUrl ?? '',
                                    },
                                  }))}
                                  placeholder="https://www.youtube.com/watch?v=..."
                                  style={{ width: '100%' }}
                                />
                              </div>
                              <div>
                                <label className="field-label">Lien du chat YouTube (optionnel)</label>
                                <input
                                  className="field-input"
                                  value={publicStreamDrafts[comp.id]?.chatUrl ?? comp.publicStreamChatUrl ?? ''}
                                  onChange={(e) => setPublicStreamDrafts((prev) => ({
                                    ...prev,
                                    [comp.id]: {
                                      streamUrl: prev[comp.id]?.streamUrl ?? comp.publicStreamUrl ?? '',
                                      chatUrl: e.target.value,
                                    },
                                  }))}
                                  placeholder="https://www.youtube.com/live_chat?v=..."
                                  style={{ width: '100%' }}
                                />
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={savingPublicStreamId === comp.id}
                                onClick={async () => {
                                  setArenaError('')
                                  setArenaMsg('')
                                  setSavingPublicStreamId(comp.id)
                                  try {
                                    if (!accessToken) throw new Error('Session administrateur invalide.')
                                    const updated = await arenaApi.updatePublicStream(comp.id, {
                                      provider: 'youtube',
                                      streamUrl: (publicStreamDrafts[comp.id]?.streamUrl ?? comp.publicStreamUrl ?? '').trim(),
                                      chatUrl: (publicStreamDrafts[comp.id]?.chatUrl ?? comp.publicStreamChatUrl ?? '').trim() || undefined,
                                    }, accessToken)
                                    applyArenaCompetitionUpdate(updated)
                                    setPublicStreamDrafts((prev) => ({
                                      ...prev,
                                      [comp.id]: {
                                        streamUrl: updated.publicStreamUrl ?? '',
                                        chatUrl: updated.publicStreamChatUrl ?? '',
                                      },
                                    }))
                                    setArenaMsg('Lien YouTube public enregistré.')
                                  } catch (err) {
                                    setArenaError((err as Error).message)
                                  } finally {
                                    setSavingPublicStreamId(null)
                                  }
                                }}
                              >
                                {savingPublicStreamId === comp.id ? 'Enregistrement…' : 'Enregistrer YouTube'}
                              </button>

                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--error)' }}
                                disabled={savingPublicStreamId === comp.id}
                                onClick={async () => {
                                  setArenaError('')
                                  setArenaMsg('')
                                  setSavingPublicStreamId(comp.id)
                                  try {
                                    if (!accessToken) throw new Error('Session administrateur invalide.')
                                    const updated = await arenaApi.updatePublicStream(comp.id, { provider: 'none' }, accessToken)
                                    applyArenaCompetitionUpdate(updated)
                                    setPublicStreamDrafts((prev) => ({
                                      ...prev,
                                      [comp.id]: { streamUrl: '', chatUrl: '' },
                                    }))
                                    setArenaMsg('Diffusion publique supprimée pour cette compétition.')
                                  } catch (err) {
                                    setArenaError((err as Error).message)
                                  } finally {
                                    setSavingPublicStreamId(null)
                                  }
                                }}
                              >
                                Retirer YouTube
                              </button>

                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={updatingPublicStreamStatusId === comp.id || comp.publicStreamProvider !== 'youtube'}
                                onClick={async () => {
                                  setArenaError('')
                                  setArenaMsg('')
                                  setUpdatingPublicStreamStatusId(comp.id)
                                  try {
                                    if (!accessToken) throw new Error('Session administrateur invalide.')
                                    const updated = await arenaApi.setPublicStreamStatus(comp.id, 'live', accessToken)
                                    applyArenaCompetitionUpdate(updated)
                                    setArenaMsg('Les spectateurs peuvent maintenant suivre le direct YouTube.')
                                  } catch (err) {
                                    setArenaError((err as Error).message)
                                  } finally {
                                    setUpdatingPublicStreamStatusId(null)
                                  }
                                }}
                              >
                                Passer en direct
                              </button>

                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={updatingPublicStreamStatusId === comp.id || comp.publicStreamProvider !== 'youtube'}
                                onClick={async () => {
                                  setArenaError('')
                                  setArenaMsg('')
                                  setUpdatingPublicStreamStatusId(comp.id)
                                  try {
                                    if (!accessToken) throw new Error('Session administrateur invalide.')
                                    const updated = await arenaApi.setPublicStreamStatus(comp.id, 'stopped', accessToken)
                                    applyArenaCompetitionUpdate(updated)
                                    setArenaMsg('Diffusion publique marquée comme terminée.')
                                  } catch (err) {
                                    setArenaError((err as Error).message)
                                  } finally {
                                    setUpdatingPublicStreamStatusId(null)
                                  }
                                }}
                              >
                                Clore côté public
                              </button>
                            </div>
                          </div>

                          {/* Registrations inline panel */}
                          {selectedCompetitionId === comp.id && arenaRegistrations.length > 0 && (
                            <div style={{ marginTop: 10, border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden' }}>
                              {!isAssignedArenaMatch(comp) && arenaRegistrations.some(r => r.status === 'pending') && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 12px', background: '#f5f5f5', borderBottom: '1px solid var(--rule)' }}>
                                  <button className="btn btn-primary btn-sm" onClick={async () => {
                                    setArenaError('')
                                    const pending = arenaRegistrations.filter(r => r.status === 'pending')
                                    try {
                                      await Promise.all(pending.map(r =>
                                        fetch(`${ARENA_API}/competitions/registrations/review`, {
                                          method: 'PATCH',
                                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                                          body: JSON.stringify({ registrationId: r.id, status: 'approved' })
                                        })
                                      ))
                                      setArenaRegistrations(prev => prev.map(r => r.status === 'pending' ? { ...r, status: 'approved' } : r))
                                      setArenaMsg('Toutes les inscriptions approuvées.')
                                    } catch (err) { setArenaError((err as Error).message) }
                                  }}>✓ Approuver tout</button>
                                </div>
                              )}
                              {arenaRegistrations.map((reg, ri, ra) => (
                                <div key={reg.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fafafa', borderBottom: ri < ra.length - 1 ? '1px solid var(--rule)' : 'none' }}>
                                  <p style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>
                                    <strong>{reg.participantName ?? reg.participantUserId.slice(0, 10) + '…'}</strong>
                                    {' · '}
                                    <span style={{ color: reg.status === 'approved' ? 'var(--ok)' : reg.status === 'rejected' ? 'var(--error)' : 'var(--gold)', fontWeight: 600 }}>
                                      {reg.status === 'approved' ? '? Approuvé' : reg.status === 'rejected' ? '? Rejeté' : '? En attente'}
                                    </span>
                                  </p>
                                  {!isAssignedArenaMatch(comp) && reg.status === 'pending' && (
                                    <>
                                      <button className="btn btn-primary btn-sm" onClick={async () => {
                                        setArenaError('')
                                        try {
                                          const res = await fetch(`${ARENA_API}/competitions/registrations/review`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` }, body: JSON.stringify({ registrationId: reg.id, status: 'approved' }) })
                                          if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Erreur') }
                                          setArenaRegistrations(prev => prev.map(r => r.id === reg.id ? { ...r, status: 'approved' } : r))
                                        } catch (err) { setArenaError((err as Error).message) }
                                      }}>Approuver</button>
                                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={async () => {
                                        setArenaError('')
                                        try {
                                          const res = await fetch(`${ARENA_API}/competitions/registrations/review`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` }, body: JSON.stringify({ registrationId: reg.id, status: 'rejected' }) })
                                          if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Erreur') }
                                          setArenaRegistrations(prev => prev.map(r => r.id === reg.id ? { ...r, status: 'rejected' } : r))
                                        } catch (err) { setArenaError((err as Error).message) }
                                      }}>Rejeter</button>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* -- TAB: AFFECTATIONS -- */}
              {arenaTab === 'affectations' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Affectation des modérateurs</h2>
                      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>
                        Assignez un modérateur (rôle MODERATOR) à chaque compétition active ou à venir.
                      </p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={openCreateModModal} style={{ flexShrink: 0 }}>
                      + Créer un modérateur
                    </button>
                  </div>

                  {moderatorUsers.length === 0 && (
                    <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, marginBottom: 20, fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <span>⚠️ Aucun modérateur trouvé. Créez un compte modérateur pour pouvoir assigner des compétitions.</span>
                      <button className="btn btn-sm" style={{ background: '#fcd34d', color: '#92400e', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, borderRadius: 4, padding: '4px 12px' }} onClick={openCreateModModal}>
                        Créer un modérateur
                      </button>
                    </div>
                  )}

                  {arenaCompetitions.filter(c => c.status !== 'completed' && c.status !== 'cancelled').length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
                      <p style={{ color: 'var(--ink-3)' }}>Aucune compétition active.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {arenaCompetitions
                        .filter(c => c.status !== 'completed' && c.status !== 'cancelled')
                        .map((comp) => {
                          const isBusy = assigningId === comp.id
                          return (
                            <div
                              key={comp.id}
                              style={{
                                background: '#fff',
                                border: comp.moderatorUserId ? '1px solid #bfdbfe' : '1px solid var(--rule)',
                                borderRadius: 10,
                                padding: '16px 20px',
                              }}
                            >
                              {/* Header */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                <div>
                                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-1)' }}>{comp.name}</span>
                                  <span style={{
                                    display: 'inline-block', marginLeft: 8, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                                    background: comp.status === 'live' ? '#dc262620' : '#6b728020',
                                    color: comp.status === 'live' ? '#dc2626' : '#6b7280',
                                    textTransform: 'uppercase',
                                  }}>
                                    {comp.status}
                                  </span>
                                </div>
                                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                                  {new Date(comp.scheduledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                              </div>

                              {/* Current moderator */}
                              <div style={{ fontSize: 13, marginBottom: 12 }}>
                                {comp.moderatorUserId ? (
                                  <span style={{ color: 'var(--cobalt)', fontWeight: 600 }}>
                                    ✅ Modérateur : {comp.moderatorName ?? comp.moderatorEmail ?? comp.moderatorUserId}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>Aucun modérateur assigné</span>
                                )}
                              </div>

                              {/* Assign controls */}
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <select
                                  className="field-input"
                                  style={{ maxWidth: 260, flex: 1 }}
                                  value={selectedModerator[comp.id] ?? ''}
                                  onChange={(e) => setSelectedModerator(prev => ({ ...prev, [comp.id]: e.target.value }))}
                                >
                                  <option value="">— Choisir un modérateur —</option>
                                  {moderatorUsers.map(m => (
                                    <option key={m.id} value={m.id}>
                                      {m.firstName} {m.lastName} ({m.email}) {m.role === 'admin' ? '• Admin' : '• Modérateur'}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="btn btn-primary btn-sm"
                                  disabled={isBusy || !selectedModerator[comp.id]}
                                  onClick={async () => {
                                    if (!accessToken || !selectedModerator[comp.id]) return
                                    setArenaError(''); setArenaMsg(''); setAssigningId(comp.id)
                                    try {
                                      await arenaApi.assignModerator(comp.id, selectedModerator[comp.id], accessToken)
                                      const mod = moderatorUsers.find(m => m.id === selectedModerator[comp.id])
                                      setArenaCompetitions(prev => prev.map(c => c.id === comp.id
                                        ? { ...c, moderatorUserId: selectedModerator[comp.id], moderatorName: mod ? `${mod.firstName} ${mod.lastName}` : null }
                                        : c
                                      ))
                                      setArenaMsg(`Modérateur assigné à "${comp.name}".`)
                                    } catch (err) { setArenaError((err as Error).message) }
                                    finally { setAssigningId(null) }
                                  }}
                                >
                                  {isBusy ? 'En cours…' : 'Assigner'}
                                </button>
                                {comp.moderatorUserId && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: 'var(--error)' }}
                                    disabled={isBusy}
                                    onClick={async () => {
                                      if (!accessToken) return
                                      setArenaError(''); setArenaMsg(''); setAssigningId(comp.id)
                                      try {
                                        await arenaApi.releaseModerator(comp.id, accessToken)
                                        setArenaCompetitions(prev => prev.map(c => c.id === comp.id
                                          ? { ...c, moderatorUserId: null, moderatorName: null }
                                          : c
                                        ))
                                        setArenaMsg(`Modérateur retiré de "${comp.name}".`)
                                      } catch (err) { setArenaError((err as Error).message) }
                                      finally { setAssigningId(null) }
                                    }}
                                  >
                                    Retirer
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

      {/* -- CREATE MODERATOR MODAL -- */}
      {createModModal !== 'closed' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440, padding: 24 }}>
            {createModModal === 'form' ? (
              <>
                <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginBottom: 20 }}>Créer un compte modérateur</p>
                {createModError && (
                  <div className="alert alert-error" style={{ marginBottom: 16 }}>{createModError}</div>
                )}
                {createModNotice && (
                  <div className="alert" style={{ marginBottom: 16, background: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8' }}>{createModNotice}</div>
                )}
                <form onSubmit={submitCreateModerator} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="field-label">Prénom</label>
                      <input required className="field-input" value={createModForm.firstName}
                        onChange={(e) => setCreateModForm(f => ({ ...f, firstName: e.target.value }))} />
                    </div>
                    <div>
                      <label className="field-label">Nom</label>
                      <input required className="field-input" value={createModForm.lastName}
                        onChange={(e) => setCreateModForm(f => ({ ...f, lastName: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Adresse email</label>
                    <input required type="email" className="field-input" value={createModForm.email}
                      onChange={(e) => setCreateModForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: -6 }}>
                    Si cet email appartient deja a un admin ou a un moderateur, aucun doublon ne sera cree et le compte existant sera reutilise.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink-2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={createModForm.generatePassword}
                      onChange={(e) => setCreateModForm(f => ({ ...f, generatePassword: e.target.checked }))} />
                    Générer le mot de passe automatiquement
                  </label>
                  {!createModForm.generatePassword && (
                    <div>
                      <label className="field-label">Mot de passe temporaire</label>
                      <input required type="password" className="field-input" minLength={8}
                        value={createModForm.password}
                        onChange={(e) => setCreateModForm(f => ({ ...f, password: e.target.value }))}
                        placeholder="8 caractères minimum" />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateModModal('closed')} disabled={createModLoading}>
                      Annuler
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={createModLoading}>
                      {createModLoading ? 'Création…' : 'Créer'}
                    </button>
                  </div>
                </form>
              </>
            ) : createModModal === 'otp' ? (
              <>
                <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Confirmer par OTP</p>
                {createModError && (
                  <div className="alert alert-error" style={{ marginBottom: 16 }}>{createModError}</div>
                )}
                {createModNotice && (
                  <div className="alert" style={{ marginBottom: 16, background: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8' }}>{createModNotice}</div>
                )}
                <p style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 4 }}>
                  Entrez le code recu par email{createModPending ? ` a ${createModPending.email}` : ''}. Le code expire au bout de 10 minutes.
                </p>
                <form onSubmit={verifyCreateModeratorOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label className="field-label">Code OTP</label>
                    <input
                      required
                      className="field-input"
                      inputMode="numeric"
                      minLength={6}
                      maxLength={6}
                      value={createModOtpCode}
                      onChange={(e) => setCreateModOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6 chiffres"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={resendCreateModeratorOtp} disabled={createModLoading || createModResendCountdown > 0}>
                      {createModResendCountdown > 0 ? `Renvoyer dans ${createModResendCountdown}s` : 'Renvoyer le code'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateModModal('form')} disabled={createModLoading}>
                      Retour
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={createModLoading || createModOtpCode.length !== 6}>
                      {createModLoading ? 'Verification…' : 'Verifier'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                  <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>
                    {createModResult?.status === 'already_eligible' ? 'Compte deja utilisable' : 'Compte modérateur créé'}
                  </p>
                </div>
                {createModResult?.message && (
                  <div className="alert" style={{ marginBottom: 16, background: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8' }}>{createModResult.message}</div>
                )}
                <div style={{ background: 'var(--stone)', borderRadius: 6, padding: '14px 16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: 'var(--ink-3)' }}>Nom</span>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{createModResult?.firstName} {createModResult?.lastName}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: 'var(--ink-3)' }}>Email</span>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{createModResult?.email}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: 'var(--ink-3)' }}>Accès</span>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{createModResult?.role === 'admin' ? 'Admin + Modération' : 'Modérateur'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setCreateModModal('closed')}>Terminer</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {winnerPicker && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 400, padding: 24 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
              🏆 Désigner le vainqueur
            </p>
            <label className="field-label">Vainqueur</label>
            <select
              className="field-input"
              value={winnerPickerSelectedId}
              onChange={e => setWinnerPickerSelectedId(e.target.value)}
              style={{ marginBottom: 20 }}
            >
              <option value="">— Choisir un compétiteur —</option>
              {winnerPicker.participants.map((p) => (
                <option key={p.participantUserId} value={p.participantUserId}>{p.participantName ?? p.participantUserId.slice(0, 10)}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setWinnerPicker(null); setWinnerPickerSelectedId('') }}>
                Annuler
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={!winnerPickerSelectedId}
                onClick={async () => {
                  setArenaError(''); setArenaMsg('')
                  try {
                    const res = await fetch(`${ARENA_API}/competitions/${winnerPicker.compId}/complete`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                      body: JSON.stringify({ participantUserId: winnerPickerSelectedId })
                    })
                    if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Erreur') }
                    setArenaCompetitions(prev => prev.map(c => c.id === winnerPicker.compId ? { ...c, status: 'completed' } : c))
                    setArenaMsg(`Compétition terminée. Vainqueur : ${winnerPicker.participants.find(p => p.participantUserId === winnerPickerSelectedId)?.participantName ?? '?'}`)
                    setWinnerPicker(null)
                    setWinnerPickerSelectedId('')
                  } catch (err) { setArenaError((err as Error).message) }
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

          {/* -- CORRESPONDANCE -- */}
          {tab === 'correspondence' && (
            <div>
              <p className="overline" style={{ marginBottom: 8 }}>Correspondance</p>
              <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 20 }}>Concours de Correspondance</h1>

              {/* Internal sub-tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--rule)' }}>
                {([{ key: 'sessions' as const, label: 'Sessions' }, { key: 'moderation' as const, label: 'Modération' }]).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setCorrSubTab(t.key)}
                    style={{ padding: '8px 20px', border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: corrSubTab === t.key ? 'var(--cobalt)' : 'var(--ink-3)', borderBottom: corrSubTab === t.key ? '2px solid var(--cobalt)' : '2px solid transparent', marginBottom: -2 }}
                  >{t.label}</button>
                ))}
              </div>

              {/* Sessions */}
              {corrSubTab === 'sessions' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', margin: 0 }}>Sessions ({corrSessions.length})</p>
                    <button onClick={() => setCorrShowCreate(!corrShowCreate)} className="btn btn-primary btn-sm">+ Nouvelle session</button>
                  </div>

                  {corrSessionError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{corrSessionError}</div>}

                  {corrShowCreate && (
                    <div className="card" style={{ marginBottom: 24 }}>
                      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 16 }}>Créer une session</p>
                      <form onSubmit={handleCorrCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <label className="field-label">Titre</label>
                          <input className="field-input" value={corrCreateForm.title} onChange={(e) => setCorrCreateForm(f => ({ ...f, title: e.target.value }))} required />
                        </div>
                        <div>
                          <label className="field-label">Thème / Consigne</label>
                          <textarea className="field-input" rows={3} style={{ resize: 'none' }} value={corrCreateForm.themePrompt} onChange={(e) => setCorrCreateForm(f => ({ ...f, themePrompt: e.target.value }))} required />
                        </div>
                        <div className="responsive-two-col" style={{ gap: 12 }}>
                          <div>
                            <label className="field-label">Date de début</label>
                            <input type="datetime-local" className="field-input" value={corrCreateForm.startAt} onChange={(e) => setCorrCreateForm(f => ({ ...f, startAt: e.target.value }))} required />
                          </div>
                          <div>
                            <label className="field-label">Date de fin</label>
                            <input type="datetime-local" className="field-input" value={corrCreateForm.endAt} onChange={(e) => setCorrCreateForm(f => ({ ...f, endAt: e.target.value }))} required />
                          </div>
                          <div>
                            <label className="field-label">Délai de réponse (h après fin)</label>
                            <input type="number" className="field-input" value={corrCreateForm.gracePeriodHours} onChange={(e) => setCorrCreateForm(f => ({ ...f, gracePeriodHours: e.target.value }))} min={0} max={168} />
                          </div>
                          <div>
                            <label className="field-label">Max lettres / étudiant</label>
                            <input type="number" className="field-input" value={corrCreateForm.maxLettersPerUser} onChange={(e) => setCorrCreateForm(f => ({ ...f, maxLettersPerUser: e.target.value }))} min={1} />
                          </div>
                          <div>
                            <label className="field-label">Longueur min (car.)</label>
                            <input type="number" className="field-input" value={corrCreateForm.minBodyLength} onChange={(e) => setCorrCreateForm(f => ({ ...f, minBodyLength: e.target.value }))} min={50} />
                          </div>
                          <div>
                            <label className="field-label">Longueur max (car.)</label>
                            <input type="number" className="field-input" value={corrCreateForm.maxBodyLength} onChange={(e) => setCorrCreateForm(f => ({ ...f, maxBodyLength: e.target.value }))} max={50000} />
                          </div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink-2)' }}>
                          <input type="checkbox" checked={corrCreateForm.allowVoting} onChange={(e) => setCorrCreateForm(f => ({ ...f, allowVoting: e.target.checked }))} />
                          Activer le vote à la fermeture
                        </label>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button type="submit" disabled={corrCreating} className="btn btn-primary btn-sm">{corrCreating ? 'Création…' : 'Créer'}</button>
                          <button type="button" onClick={() => setCorrShowCreate(false)} className="btn btn-ghost btn-sm">Annuler</button>
                        </div>
                      </form>
                    </div>
                  )}

                  {loadingCorrSessions && <p style={{ color: 'var(--ink-3)' }}>Chargement…</p>}

                  {!loadingCorrSessions && corrSessions.length === 0 && !corrShowCreate && (
                    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                      <p style={{ color: 'var(--ink-3)' }}>Aucune session. Créez la première.</p>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {corrSessions.map((s) => (
                      <div key={s.id} className="card" style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{s.title}</p>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>
                              {new Date(s.startAt).toLocaleDateString('fr-FR')} — {new Date(s.endAt).toLocaleDateString('fr-FR')}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                            <select
                              value={s.status}
                              onChange={(e) => handleCorrStatusChange(s, e.target.value as ContestSessionStatus)}
                              className="field-input"
                              style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}
                            >
                              {CORR_STATUS_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{CORR_STATUS_FR[opt]}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleCorrTriggerAssign(s.id)}
                              disabled={corrAssigning === s.id}
                              className="btn btn-ghost btn-sm"
                            >
                              {corrAssigning === s.id ? '…' : 'Assigner'}
                            </button>
                          </div>
                        </div>
                        {corrAssignResult[s.id] && (
                          <div className="alert alert-ok" style={{ marginTop: 10 }}>
                            {corrAssignResult[s.id].assigned} lettres assignées, {corrAssignResult[s.id].skipped} ignorées
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Modération */}
              {corrSubTab === 'moderation' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', margin: 0 }}>Signalements ({corrReports.length})</p>
                    <select value={corrReportFilter} onChange={(e) => setCorrReportFilter(e.target.value)} className="field-input" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}>
                      <option value="">Tous</option>
                      <option value="pending">En attente</option>
                      <option value="handled">Traités</option>
                      <option value="dismissed">Rejetés</option>
                    </select>
                  </div>

                  {corrReportError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{corrReportError}</div>}
                  {loadingCorrReports && <p style={{ color: 'var(--ink-3)' }}>Chargement…</p>}

                  {!loadingCorrReports && corrReports.length === 0 && (
                    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                      <p style={{ color: 'var(--ink-3)' }}>Aucun signalement.</p>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {corrReports.map((r) => (
                      <div key={r.id} className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{r.targetType} — {r.reason}</p>
                            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
                              <code style={{ fontSize: 11 }}>{r.targetId}</code> · {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                            </p>
                            {r.details && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>{r.details}</p>}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 20, padding: '3px 10px', flexShrink: 0, background: r.status === 'pending' ? 'var(--gold-pale)' : r.status === 'handled' ? 'var(--ok-bg)' : 'var(--stone)', color: r.status === 'pending' ? 'var(--gold)' : r.status === 'handled' ? 'var(--ok)' : 'var(--ink-3)' }}>
                            {r.status === 'pending' ? 'En attente' : r.status === 'handled' ? 'Traité' : 'Rejeté'}
                          </span>
                        </div>
                        {r.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button onClick={() => handleCorrReport(r.id, 'handle')} className="btn btn-primary btn-sm">Traiter</button>
                            <button onClick={() => handleCorrReport(r.id, 'dismiss')} className="btn btn-ghost btn-sm">Rejeter</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden bottom-tab-nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 4px', fontSize: 10, fontWeight: 500, color: tab === item.key ? 'var(--cobalt)' : 'var(--ink-3)', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span style={{ display: 'block', width: 16, height: 2, borderRadius: 1, background: tab === item.key ? 'var(--cobalt)' : 'transparent', marginBottom: 5 }} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}


import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiCall } from '../api/client'
import { arenaApi, adminApi, ARENA_API, type ArenaCompetition, type ArenaRegistration, type ModeratorUser, type ModeratorListItem, type CreateModeratorResponse } from '../arena/arenaApi'
import { HAITI_DEPARTMENTS } from '../constants/haitiDepartments'

type Tab = 'overview' | 'levels' | 'subjects' | 'questions' | 'students' | 'messages' | 'sponsors' | 'arena'
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
    name: '', questionCount: 10, secondsPerQuestion: 30,
    description: '', scheduledAt: ''
  })
  const [winnerPicker, setWinnerPicker] = useState<{ compId: string; participants: ArenaRegistration[] } | null>(null)
  const [winnerPickerSelectedId, setWinnerPickerSelectedId] = useState('')
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  // Arena internal tabs
  const [arenaTab, setArenaTab] = useState<'matches' | 'affectations'>('matches')
  const [moderatorUsers, setModeratorUsers] = useState<ModeratorUser[]>([])
  const [selectedModerator, setSelectedModerator] = useState<Record<string, string>>({})
  const [assigningId, setAssigningId] = useState<string | null>(null)

  // -- Create Moderator modal ----------------------------------------------
  type ModalState = 'closed' | 'form' | 'success'
  const [createModModal, setCreateModModal] = useState<ModalState>('closed')
  const [createModForm, setCreateModForm] = useState({ firstName: '', lastName: '', email: '', password: '', generatePassword: true })
  const [createModError, setCreateModError] = useState('')
  const [createModLoading, setCreateModLoading] = useState(false)
  const [createModResult, setCreateModResult] = useState<CreateModeratorResponse | null>(null)

  const openCreateModModal = () => {
    setCreateModForm({ firstName: '', lastName: '', email: '', password: '', generatePassword: true })
    setCreateModError('')
    setCreateModResult(null)
    setCreateModModal('form')
  }

  const submitCreateModerator = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    setCreateModError('')
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
      setCreateModResult(result)
      setCreateModModal('success')
      // Refresh moderator list immediately
      const updated = await adminApi.listModerators(accessToken)
      setModeratorUsers(updated as ModeratorListItem[])
    } catch (err) {
      setCreateModError((err as Error).message)
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
    if (accessToken) {
      adminApi.listModerators(accessToken)
        .then((list) => setModeratorUsers(list as ModeratorListItem[]))
        .catch(() => arenaApi.getModeratorUsers(accessToken).then(setModeratorUsers).catch(() => {}))
    }
  }, [accessToken])

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
  }, [callApi, loadArenaTabData, loadQuestions, loadSponsors, tab])

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

  const navItems: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Vue d\'ensemble' },
    { key: 'levels', label: 'Classes' },
    { key: 'subjects', label: 'Matières' },
    { key: 'questions', label: 'Questions' },
    { key: 'students', label: 'Étudiants' },
    { key: 'messages', label: 'Messages' },
    { key: 'sponsors', label: 'Sponsors' },
    { key: 'arena', label: 'Arena ⚔️' },
  ]

  return (
    <div className="dashboard-shell flex">

      {/* -- SIDEBAR -- */}
      <aside className="hidden md:flex flex-col" style={{ width: 216, background: '#fff', borderRight: '1px solid var(--rule)', minHeight: '100vh', position: 'fixed', top: 0, left: 0, zIndex: 40 }}>
        <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <span className="brand" style={{ fontSize: 17, color: 'var(--cobalt)' }}>Konesans</span>
            <span className="brand" style={{ fontSize: 17, color: 'var(--gold)' }}>+</span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 3 }}>Administration</p>
        </div>

        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`nav-item${tab === item.key ? ' active' : ''}`}
              style={{ marginBottom: 2 }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: '10px 8px', borderTop: '1px solid var(--rule)' }}>
          <button onClick={logout} className="nav-item" style={{ color: 'var(--error)', fontWeight: 500 }}>
            Déconnexion
          </button>
        </div>
      </aside>

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

        <div className="dashboard-main md:ml-[216px]" style={{ maxWidth: 860 }}>

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
                    <input type="text" required value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="ex: 7e AF, Philo" className="field-input" style={{ flex: 1 }} />
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
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Nouvelle compétition</h2>
                  <div className="card" style={{ marginBottom: 24 }}>
                    <div className="responsive-two-col" style={{ gap: 12, marginBottom: 12 }}>
                      <div>
                        <label className="field-label">Nom</label>
                        <input className="field-input" value={arenaCompForm.name} onChange={(e) => setArenaCompForm(f => ({ ...f, name: e.target.value }))} placeholder="Challenge Mathématiques S1" style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label className="field-label">Nb questions</label>
                        <input className="field-input" type="number" min={1} max={30} value={arenaCompForm.questionCount} onChange={(e) => setArenaCompForm(f => ({ ...f, questionCount: +e.target.value }))} style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label className="field-label">Secondes/question</label>
                        <input className="field-input" type="number" min={10} max={120} value={arenaCompForm.secondsPerQuestion} onChange={(e) => setArenaCompForm(f => ({ ...f, secondsPerQuestion: +e.target.value }))} style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label className="field-label">Date planifiée</label>
                        <input className="field-input" type="datetime-local" value={arenaCompForm.scheduledAt} onChange={(e) => setArenaCompForm(f => ({ ...f, scheduledAt: e.target.value }))} style={{ width: '100%' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label className="field-label">Description</label>
                      <textarea className="field-input" rows={3} value={arenaCompForm.description} onChange={(e) => setArenaCompForm(f => ({ ...f, description: e.target.value }))} placeholder="Contexte, règles, thème et éventuelles récompenses décrites en texte" style={{ width: '100%', resize: 'vertical' }} />
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={async () => {
                        setArenaError(''); setArenaMsg('')
                        try {
                          if (!accessToken) throw new Error('Session administrateur invalide.')
                          if (!arenaCompForm.name.trim()) throw new Error('Le nom de la compétition est requis.')
                          if (!arenaCompForm.scheduledAt) throw new Error('La date planifiée est requise.')
                          const c = await arenaApi.createCompetition({
                            name: arenaCompForm.name.trim(),
                            questionCount: arenaCompForm.questionCount,
                            secondsPerQuestion: arenaCompForm.secondsPerQuestion,
                            scheduledAt: arenaCompForm.scheduledAt,
                            description: arenaCompForm.description.trim() || undefined,
                          }, accessToken)
                          setArenaCompetitions(prev => [c, ...prev])
                          setArenaMsg(`Compétition "${c.name}" créée.`)
                          setArenaCompForm({ name: '', questionCount: 10, secondsPerQuestion: 30, description: '', scheduledAt: '' })
                        } catch (err) { setArenaError((err as Error).message) }
                      }}
                    >
                      Créer la compétition
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
                              <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>{comp.status} · {comp.questionCount}q · {comp.secondsPerQuestion}s</p>
                              {comp.moderatorUserId && (
                                <p style={{ fontSize: 11, color: 'var(--cobalt)', marginTop: 2 }}>
                                  🎙️ {comp.moderatorName ?? comp.moderatorEmail ?? 'Modérateur assigné'}
                                </p>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {comp.status === 'pending' && (
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
                                    setArenaMsg('Compétition lancée en direct.')
                                  } catch (err) { setArenaError((err as Error).message) }
                                }}>
                                  ? Lancer
                                </button>
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
                                    🔴 Voir en direct
                                  </a>
                                  <button className="btn btn-primary btn-sm" onClick={async () => {
                                    setArenaError(''); setArenaMsg('')
                                    try {
                                      const res = await fetch(`${ARENA_API}/competitions/${comp.id}/next-round`, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } })
                                      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Erreur') }
                                      setArenaMsg('Round suivant démarré.')
                                    } catch (err) { setArenaError((err as Error).message) }
                                  }}>Round suivant</button>
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
                              }}>Inscriptions</button>
                            </div>
                          </div>

                          {/* Registrations inline panel */}
                          {selectedCompetitionId === comp.id && arenaRegistrations.length > 0 && (
                            <div style={{ marginTop: 10, border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden' }}>
                              {arenaRegistrations.some(r => r.status === 'pending') && (
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
                                  {reg.status === 'pending' && (
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
                                      {m.firstName} {m.lastName} ({m.email})
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
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                  <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Compte modérateur créé</p>
                </div>
                <div style={{ background: 'var(--stone)', borderRadius: 6, padding: '14px 16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: 'var(--ink-3)' }}>Nom</span>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{createModResult?.firstName} {createModResult?.lastName}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: 'var(--ink-3)' }}>Email</span>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{createModResult?.email}</span>
                  </div>
                  {createModResult?.temporaryPassword && (
                    <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 4 }}>
                      <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>Mot de passe temporaire (à copier maintenant) :</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <code style={{ flex: 1, background: '#fff', border: '1px solid var(--rule)', borderRadius: 4, padding: '6px 10px', fontSize: 13, fontFamily: 'monospace', userSelect: 'all' }}>
                          {createModResult.temporaryPassword}
                        </code>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigator.clipboard.writeText(createModResult?.temporaryPassword ?? '')}
                        >
                          Copier
                        </button>
                      </div>
                    </div>
                  )}
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


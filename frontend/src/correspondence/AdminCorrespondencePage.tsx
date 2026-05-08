import { FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  adminCreateSession,
  adminHandleReport,
  adminListReports,
  adminListSessions,
  adminTriggerAssign,
  adminUpdateSession,
} from './correspondenceApi'
import type { ContestSession, ContestSessionStatus, ModerationCase } from './types'

type Tab = 'sessions' | 'moderation'

const STATUS_OPTIONS: ContestSessionStatus[] = ['draft', 'open', 'closed', 'scoring', 'published']
const STATUS_FR: Record<ContestSessionStatus, string> = {
  draft: 'Brouillon', open: 'Ouvert', closed: 'Fermé', scoring: 'Vote', published: 'Publié',
}

export default function AdminCorrespondencePage() {
  const { accessToken } = useAuth()
  const [tab, setTab] = useState<Tab>('sessions')

  // ── Sessions ────────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ContestSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [sessionError, setSessionError] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '', themePrompt: '', startAt: '', endAt: '',
    gracePeriodHours: '48',
    maxLettersPerUser: '1', maxLettersReceived: '1',
    minBodyLength: '500', maxBodyLength: '5000',
    allowVoting: false,
  })
  const [assignResult, setAssignResult] = useState<Record<string, { assigned: number; skipped: number }>>({})
  const [assigning, setAssigning] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    if (!accessToken) return
    setLoadingSessions(true)
    try {
      const data = await adminListSessions(accessToken)
      setSessions(data)
    } catch (e: unknown) {
      setSessionError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoadingSessions(false)
    }
  }, [accessToken])

  useEffect(() => { if (tab === 'sessions') loadSessions() }, [tab, loadSessions])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    setCreating(true)
    setSessionError('')
    try {
      await adminCreateSession({
        title: createForm.title,
        themePrompt: createForm.themePrompt,
        startAt: createForm.startAt,
        endAt: createForm.endAt,
        gracePeriodHours: Number(createForm.gracePeriodHours),
        rules: {
          maxLettersPerUser: Number(createForm.maxLettersPerUser),
          maxLettersReceived: Number(createForm.maxLettersReceived),
          minBodyLength: Number(createForm.minBodyLength),
          maxBodyLength: Number(createForm.maxBodyLength),
          allowVoting: createForm.allowVoting,
        },
      }, accessToken)
      setShowCreate(false)
      await loadSessions()
    } catch (e: unknown) {
      setSessionError(e instanceof Error ? e.message : 'Erreur de création')
    } finally {
      setCreating(false)
    }
  }

  const handleStatusChange = async (s: ContestSession, newStatus: ContestSessionStatus) => {
    if (!accessToken) return
    try {
      await adminUpdateSession(s.id, { status: newStatus }, accessToken)
      await loadSessions()
    } catch (e: unknown) {
      setSessionError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const handleTriggerAssign = async (sessionId: string) => {
    if (!accessToken) return
    setAssigning(sessionId)
    try {
      const result = await adminTriggerAssign(sessionId, accessToken)
      setAssignResult((prev) => ({ ...prev, [sessionId]: result }))
    } catch (e: unknown) {
      setSessionError(e instanceof Error ? e.message : 'Erreur lors de l'assignation')
    } finally {
      setAssigning(null)
    }
  }

  // ── Moderation ───────────────────────────────────────────────────────────────
  const [reports, setReports] = useState<ModerationCase[]>([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [reportFilter, setReportFilter] = useState('pending')
  const [reportError, setReportError] = useState('')

  const loadReports = useCallback(async () => {
    if (!accessToken) return
    setLoadingReports(true)
    try {
      const data = await adminListReports(accessToken, reportFilter)
      setReports(data)
    } catch (e: unknown) {
      setReportError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoadingReports(false)
    }
  }, [accessToken, reportFilter])

  useEffect(() => { if (tab === 'moderation') loadReports() }, [tab, loadReports])

  const handleReport = async (caseId: string, action: 'handle' | 'dismiss') => {
    if (!accessToken) return
    try {
      await adminHandleReport(caseId, action, accessToken)
      await loadReports()
    } catch (e: unknown) {
      setReportError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px',
    border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, outline: 'none',
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--cobalt)', marginBottom: 20 }}>
        Admin — Concours de Correspondance
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', width: 'fit-content' }}>
        {(['sessions', 'moderation'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 24px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: tab === t ? 'var(--cobalt)' : 'var(--surface)',
              color: tab === t ? '#fff' : 'var(--ink-3)',
            }}
          >
            {t === 'sessions' ? '📋 Sessions' : '🚩 Modération'}
          </button>
        ))}
      </div>

      {/* ── Sessions tab ── */}
      {tab === 'sessions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Sessions</h2>
            <button
              onClick={() => setShowCreate(!showCreate)}
              style={{ padding: '9px 18px', background: 'var(--cobalt)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              + Nouvelle session
            </button>
          </div>

          {sessionError && <p style={{ color: '#dc2626', marginBottom: 12 }}>{sessionError}</p>}

          {/* Create form */}
          {showCreate && (
            <form onSubmit={handleCreate} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, marginTop: 0 }}>Créer une session</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Titre</label>
                  <input style={inputStyle} value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} required />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Thème / Prompt</label>
                  <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} value={createForm.themePrompt} onChange={(e) => setCreateForm((f) => ({ ...f, themePrompt: e.target.value }))} required />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Date de début</label>
                  <input type="datetime-local" style={inputStyle} value={createForm.startAt} onChange={(e) => setCreateForm((f) => ({ ...f, startAt: e.target.value }))} required />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Date de fin</label>
                  <input type="datetime-local" style={inputStyle} value={createForm.endAt} onChange={(e) => setCreateForm((f) => ({ ...f, endAt: e.target.value }))} required />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Période de réponse (h après fin)</label>
                  <input type="number" style={inputStyle} value={createForm.gracePeriodHours} onChange={(e) => setCreateForm((f) => ({ ...f, gracePeriodHours: e.target.value }))} min={0} max={168} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Max lettres / utilisateur</label>
                  <input type="number" style={inputStyle} value={createForm.maxLettersPerUser} onChange={(e) => setCreateForm((f) => ({ ...f, maxLettersPerUser: e.target.value }))} min={1} max={10} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Longueur min (caractères)</label>
                  <input type="number" style={inputStyle} value={createForm.minBodyLength} onChange={(e) => setCreateForm((f) => ({ ...f, minBodyLength: e.target.value }))} min={50} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Longueur max (caractères)</label>
                  <input type="number" style={inputStyle} value={createForm.maxBodyLength} onChange={(e) => setCreateForm((f) => ({ ...f, maxBodyLength: e.target.value }))} max={50000} />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="allowVoting" checked={createForm.allowVoting} onChange={(e) => setCreateForm((f) => ({ ...f, allowVoting: e.target.checked }))} />
                  <label htmlFor="allowVoting" style={{ fontSize: 13, fontWeight: 500 }}>Activer le vote à la fermeture</label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="submit" disabled={creating} style={{ padding: '9px 20px', background: 'var(--cobalt)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {creating ? 'Création…' : 'Créer'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '9px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
                  Annuler
                </button>
              </div>
            </form>
          )}

          {loadingSessions && <p style={{ color: 'var(--ink-3)' }}>Chargement…</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sessions.map((s) => (
              <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{s.title}</p>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>
                      {new Date(s.startAt).toLocaleDateString('fr-FR')} → {new Date(s.endAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={s.status}
                      onChange={(e) => handleStatusChange(s, e.target.value as ContestSessionStatus)}
                      style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{STATUS_FR[opt]}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleTriggerAssign(s.id)}
                      disabled={assigning === s.id}
                      style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                    >
                      {assigning === s.id ? '…' : '⚙️ Assigner'}
                    </button>
                  </div>
                </div>
                {assignResult[s.id] && (
                  <p style={{ fontSize: 13, color: '#16a34a', margin: 0 }}>
                    ✅ {assignResult[s.id].assigned} assignées, {assignResult[s.id].skipped} ignorées
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Moderation tab ── */}
      {tab === 'moderation' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Signalements</h2>
            <select
              value={reportFilter}
              onChange={(e) => setReportFilter(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              <option value="">Tous</option>
              <option value="pending">En attente</option>
              <option value="handled">Traités</option>
              <option value="dismissed">Rejetés</option>
            </select>
          </div>

          {reportError && <p style={{ color: '#dc2626' }}>{reportError}</p>}
          {loadingReports && <p style={{ color: 'var(--ink-3)' }}>Chargement…</p>}

          {!loadingReports && reports.length === 0 && (
            <p style={{ color: 'var(--ink-3)', textAlign: 'center', padding: 32 }}>Aucun signalement.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reports.map((r) => (
              <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                      🚩 {r.targetType} — {r.reason}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>
                      Cible : <code style={{ fontSize: 11 }}>{r.targetId}</code> · {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                    {r.details && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>{r.details}</p>}
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, borderRadius: 20, padding: '3px 10px',
                    background: r.status === 'pending' ? '#fef3c7' : r.status === 'handled' ? '#dcfce7' : '#f3f4f6',
                    color: r.status === 'pending' ? '#d97706' : r.status === 'handled' ? '#16a34a' : '#6b7280',
                  }}>
                    {r.status}
                  </span>
                </div>
                {r.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => handleReport(r.id, 'handle')} style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                      ✅ Traiter
                    </button>
                    <button onClick={() => handleReport(r.id, 'dismiss')} style={{ padding: '6px 14px', background: 'none', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                      Rejeter
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

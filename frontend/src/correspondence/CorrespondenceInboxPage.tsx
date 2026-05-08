import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createReport, getInbox, openAssignment } from './correspondenceApi'
import type { InboxItem, OpenedAssignment } from './types'

export default function CorrespondenceInboxPage() {
  const { accessToken } = useAuth()
  const navigate = useNavigate()
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openedMap, setOpenedMap] = useState<Record<string, OpenedAssignment>>({})
  const [opening, setOpening] = useState<string | null>(null)
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const data = await getInbox(accessToken)
      setInbox(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => { load() }, [load])

  const handleOpen = async (item: InboxItem) => {
    if (!accessToken) return
    if (openedMap[item.assignmentId]) {
      // Already opened — navigate to thread.
      if (item.threadId) navigate(`/correspondence/threads/${item.threadId}`)
      return
    }
    setOpening(item.assignmentId)
    try {
      const result = await openAssignment(item.assignmentId, accessToken)
      setOpenedMap((prev) => ({ ...prev, [item.assignmentId]: result }))
      setInbox((prev) => prev.map((i) => i.assignmentId === item.assignmentId ? { ...i, openedAt: new Date().toISOString() } : i))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setOpening(null)
    }
  }

  const handleReport = async (targetId: string) => {
    if (!accessToken || !reportReason.trim()) return
    try {
      await createReport('letter', targetId, reportReason, undefined, accessToken)
      setReportingId(null)
      setReportReason('')
      alert('Signalement envoyé. Merci.')
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <button
        onClick={() => navigate('/correspondence')}
        style={{ background: 'none', border: 'none', color: 'var(--cobalt)', fontSize: 14, cursor: 'pointer', marginBottom: 16, padding: 0 }}
      >
        ← Retour aux sessions
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--cobalt)', marginBottom: 20 }}>
        📬 Ma boîte de réception
      </h1>

      {loading && <p style={{ color: 'var(--ink-3)' }}>Chargement…</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && inbox.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <p style={{ color: 'var(--ink-3)' }}>Vous n'avez pas encore reçu de lettre.</p>
          <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 8 }}>
            Soumettez une lettre dans une session ouverte pour participer.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {inbox.map((item) => {
          const opened = openedMap[item.assignmentId]
          const isNew = !item.openedAt

          return (
            <div key={item.assignmentId} style={{
              background: isNew ? '#eff6ff' : 'var(--surface)',
              border: `1px solid ${isNew ? '#bfdbfe' : 'var(--border)'}`,
              borderRadius: 12, padding: '20px 24px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                    {isNew ? '📩 Nouvelle lettre' : '📖 Lettre reçue'}
                  </h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>
                    Session : <strong>{item.sessionTitle}</strong> · Thème : {item.themePrompt}
                  </p>
                </div>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {new Date(item.assignedAt).toLocaleDateString('fr-FR')}
                </span>
              </div>

              {/* Opened preview */}
              {opened && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 6 }}>
                    De : <strong>{opened.letter.authorAlias}</strong>
                  </p>
                  <div style={{
                    background: 'var(--paper)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '14px 16px', fontFamily: 'Georgia, serif',
                    fontSize: 15, lineHeight: 1.7, color: 'var(--ink)',
                    maxHeight: 240, overflowY: 'auto',
                  }}>
                    {opened.letter.body}
                  </div>
                </div>
              )}

              {/* Preview before opening */}
              {!opened && item.letterPreview && (
                <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: 'var(--ink-3)', fontStyle: 'italic', marginBottom: 12 }}>
                  "{item.letterPreview}…"
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleOpen(item)}
                  disabled={opening === item.assignmentId}
                  style={{
                    padding: '8px 16px', background: 'var(--cobalt)', color: '#fff',
                    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {opening === item.assignmentId ? 'Ouverture…' : item.openedAt ? '💬 Répondre' : '📂 Ouvrir la lettre'}
                </button>

                {opened && item.threadId && (
                  <button
                    onClick={() => navigate(`/correspondence/threads/${item.threadId}`)}
                    style={{
                      padding: '8px 16px', background: 'var(--surface)', color: 'var(--cobalt)',
                      border: '1.5px solid var(--cobalt)', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Voir la correspondance
                  </button>
                )}

                {opened && (
                  <button
                    onClick={() => setReportingId(opened.letter.id)}
                    style={{
                      padding: '8px 12px', background: 'none', color: '#dc2626',
                      border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    🚩 Signaler
                  </button>
                )}
              </div>

              {/* Report form */}
              {reportingId === opened?.letter.id && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <input
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder="Raison du signalement…"
                    style={{
                      flex: 1, padding: '8px 12px', border: '1px solid var(--border)',
                      borderRadius: 8, fontSize: 14, outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => handleReport(opened.letter.id)}
                    style={{ padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
                  >
                    Envoyer
                  </button>
                  <button
                    onClick={() => { setReportingId(null); setReportReason('') }}
                    style={{ padding: '8px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

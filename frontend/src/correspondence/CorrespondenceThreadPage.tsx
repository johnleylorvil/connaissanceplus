import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createReport, getThread, sendMessage } from './correspondenceApi'
import type { Thread } from './types'

export default function CorrespondenceThreadPage() {
  const { id } = useParams<{ id: string }>()
  const { accessToken } = useAuth()
  const navigate = useNavigate()

  const [thread, setThread] = useState<Thread | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!accessToken || !id) return
    try {
      const data = await getThread(id, accessToken)
      setThread(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [accessToken, id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.messages?.length])

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !id || !newMessage.trim()) return
    setSending(true)
    setSendError('')
    try {
      await sendMessage(id, newMessage.trim(), accessToken)
      setNewMessage('')
      await load()
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSending(false)
    }
  }

  const handleReport = async (targetId: string) => {
    if (!accessToken || !reportReason.trim()) return
    try {
      await createReport('message', targetId, reportReason, undefined, accessToken)
      setReportingId(null)
      setReportReason('')
      alert('Signalement envoyé.')
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--ink-3)' }}>Chargement…</div>
  if (error) return <div style={{ padding: 32, color: '#dc2626' }}>{error}</div>
  if (!thread) return null

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => navigate('/correspondence/inbox')}
          style={{ background: 'none', border: 'none', color: 'var(--cobalt)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 8 }}
        >
          ← Retour à la boîte de réception
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cobalt)', margin: 0 }}>
            Correspondance
          </h1>
          {thread.isAnonymous && (
            <span style={{ fontSize: 12, color: 'var(--ink-3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 12px' }}>
              🔒 Anonyme
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
        padding: '4px 0', marginBottom: 12,
      }}>
        {thread.messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 32 }}>
            <p>Aucun message. Commencez la correspondance !</p>
          </div>
        )}

        {thread.messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.isOwn ? 'flex-end' : 'flex-start',
              maxWidth: '78%',
            }}
          >
            {!msg.isOwn && (
              <p style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 3, fontWeight: 600 }}>
                {msg.senderAlias}
              </p>
            )}
            <div style={{
              background: msg.isOwn ? 'var(--cobalt)' : 'var(--surface)',
              color: msg.isOwn ? '#fff' : 'var(--ink)',
              border: msg.isOwn ? 'none' : '1px solid var(--border)',
              borderRadius: msg.isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              padding: '12px 16px',
              fontFamily: 'Georgia, serif',
              fontSize: 15,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.body}
            </div>
            <div style={{ display: 'flex', justifyContent: msg.isOwn ? 'flex-end' : 'flex-start', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                {new Date(msg.createdAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
              </span>
              {!msg.isOwn && (
                <button
                  onClick={() => setReportingId(msg.id)}
                  style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer', padding: 0 }}
                >
                  🚩
                </button>
              )}
            </div>

            {/* Report form for this message */}
            {reportingId === msg.id && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                <input
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Raison…"
                  style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, outline: 'none' }}
                />
                <button onClick={() => handleReport(msg.id)} style={{ padding: '6px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                  Signaler
                </button>
                <button onClick={() => { setReportingId(null); setReportReason('') }} style={{ padding: '6px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Écrivez votre réponse…"
          rows={3}
          style={{
            flex: 1, padding: '12px 14px', border: '1.5px solid var(--border)',
            borderRadius: 12, fontSize: 15, fontFamily: 'Georgia, serif',
            lineHeight: 1.5, resize: 'none', outline: 'none',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend(e as unknown as FormEvent)
            }
          }}
        />
        <button
          type="submit"
          disabled={sending || !newMessage.trim()}
          style={{
            padding: '12px 20px', background: newMessage.trim() ? 'var(--cobalt)' : '#d1d5db',
            color: '#fff', border: 'none', borderRadius: 12, fontSize: 15,
            fontWeight: 700, cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
            alignSelf: 'stretch',
          }}
        >
          {sending ? '…' : '→'}
        </button>
      </form>
      {sendError && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{sendError}</p>}
    </div>
  )
}

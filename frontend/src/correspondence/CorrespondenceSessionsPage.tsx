import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listSessions } from './correspondenceApi'
import type { ContestSession } from './types'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  open: 'Ouvert',
  closed: 'Fermé',
  scoring: 'Vote en cours',
  published: 'Résultats publiés',
}

const STATUS_COLORS: Record<string, string> = {
  open: '#16a34a',
  scoring: '#d97706',
  published: '#2563eb',
  closed: '#6b7280',
  draft: '#9ca3af',
}

export default function CorrespondenceSessionsPage() {
  const { accessToken } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<ContestSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!accessToken) return
    setLoading(true)
    listSessions(accessToken)
      .then(setSessions)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [accessToken])

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--cobalt)', marginBottom: 8 }}>
        Concours de Correspondance
      </h1>
      <p style={{ color: 'var(--ink-3)', marginBottom: 24 }}>
        Écrivez une lettre à un inconnu, recevez une lettre et engagez une correspondance.
      </p>

      {loading && <p style={{ color: 'var(--ink-3)' }}>Chargement…</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && sessions.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 48, background: 'var(--surface)',
          borderRadius: 12, border: '1px solid var(--border)',
        }}>
          <p style={{ color: 'var(--ink-3)' }}>Aucune session disponible pour le moment.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => navigate(`/correspondence/sessions/${s.id}`)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '20px 24px', cursor: 'pointer',
              transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>{s.title}</h2>
                <p style={{ color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.5 }}>{s.themePrompt}</p>
              </div>
              <span style={{
                background: STATUS_COLORS[s.status] + '1a',
                color: STATUS_COLORS[s.status],
                border: `1px solid ${STATUS_COLORS[s.status]}`,
                borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                {STATUS_LABELS[s.status] ?? s.status}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 13, color: 'var(--ink-3)' }}>
              <span>📅 {new Date(s.startAt).toLocaleDateString('fr-FR')} → {new Date(s.endAt).toLocaleDateString('fr-FR')}</span>
              {s.rules && <span>✉️ Max {s.rules.maxLettersPerUser} lettre(s)</span>}
              {s.rules?.allowVoting && <span>🗳️ Vote activé</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
        <button
          onClick={() => navigate('/correspondence/inbox')}
          style={{
            flex: 1, padding: '12px 16px', background: 'var(--cobalt)',
            color: '#fff', border: 'none', borderRadius: 10, fontSize: 15,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          📬 Ma boîte de réception
        </button>
        <button
          onClick={() => navigate('/correspondence/my-letters')}
          style={{
            flex: 1, padding: '12px 16px', background: 'var(--surface)',
            color: 'var(--cobalt)', border: '1.5px solid var(--cobalt)',
            borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ✍️ Mes lettres
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyLetters } from './correspondenceApi'
import type { Letter } from './types'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  submitted: "Soumise \u2014 en attente d'assignation",
  assigned: 'Assignée — destinataire notifié',
  delivered: 'Lue par le destinataire',
  archived: 'Archivée',
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  submitted: '#d97706',
  assigned: '#2563eb',
  delivered: '#16a34a',
  archived: '#6b7280',
}

export default function CorrespondenceMyLettersPage() {
  const { accessToken } = useAuth()
  const navigate = useNavigate()
  const [letters, setLetters] = useState<Letter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    getMyLetters(accessToken)
      .then(setLetters)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [accessToken])

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <button
        onClick={() => navigate('/correspondence')}
        style={{ background: 'none', border: 'none', color: 'var(--cobalt)', fontSize: 14, cursor: 'pointer', marginBottom: 16, padding: 0 }}
      >
        ← Retour aux sessions
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--cobalt)', marginBottom: 20 }}>
        ✍️ Mes lettres
      </h1>

      {loading && <p style={{ color: 'var(--ink-3)' }}>Chargement…</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && letters.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <p style={{ color: 'var(--ink-3)' }}>Vous n'avez pas encore écrit de lettre.</p>
          <button
            onClick={() => navigate('/correspondence')}
            style={{ marginTop: 14, padding: '10px 20px', background: 'var(--cobalt)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Voir les sessions
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {letters.map((letter) => (
          <div
            key={letter.id}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 22px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>
                  Créée le {new Date(letter.createdAt).toLocaleDateString('fr-FR')}
                  {letter.submittedAt && ` · Soumise le ${new Date(letter.submittedAt).toLocaleDateString('fr-FR')}`}
                </p>
                {letter.metadata?.mood && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Humeur : {letter.metadata.mood}</p>
                )}
              </div>
              <span style={{
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                color: STATUS_COLORS[letter.status],
                background: STATUS_COLORS[letter.status] + '18',
                border: `1px solid ${STATUS_COLORS[letter.status]}`,
                borderRadius: 20, padding: '3px 12px',
              }}>
                {STATUS_LABELS[letter.status] ?? letter.status}
              </span>
            </div>

            <p
              style={{ fontSize: 15, fontFamily: 'Georgia, serif', color: 'var(--ink)', lineHeight: 1.6, margin: 0,
                display: '-webkit-box', WebkitLineClamp: expanded === letter.id ? 'unset' : 3,
                WebkitBoxOrient: 'vertical', overflow: expanded === letter.id ? 'visible' : 'hidden',
              }}
            >
              {letter.body}
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              {letter.body.length > 200 && (
                <button
                  onClick={() => setExpanded(expanded === letter.id ? null : letter.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--cobalt)', fontSize: 13, cursor: 'pointer', padding: 0 }}
                >
                  {expanded === letter.id ? 'Réduire' : 'Lire plus'}
                </button>
              )}
              {letter.status === 'draft' && (
                <button
                  onClick={() => navigate(`/correspondence/sessions/${letter.sessionId}`)}
                  style={{ padding: '6px 14px', background: 'var(--cobalt)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Continuer
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

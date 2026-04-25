import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { arenaApi, type ArenaCompetition } from '../arenaApi'

const STATUS_LABELS: Record<string, string> = {
  pending: 'À venir',
  approved: 'Inscriptions ouvertes',
  live: 'En direct',
  paused: 'En pause',
  completed: 'Terminé',
  cancelled: 'Annulé',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--ink-3)',
  approved: 'var(--ok)',
  live: 'var(--error)',
  paused: '#d97706',
  completed: 'var(--cobalt)',
  cancelled: 'var(--ink-3)',
}

export default function ArenaCompetitionsList() {
  const { accessToken, user } = useAuth()
  const navigate = useNavigate()

  const [competitions, setCompetitions] = useState<ArenaCompetition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    arenaApi.getCompetitions()
      .then((comps) => {
        setCompetitions(comps)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [accessToken])

  const isAdmin = user?.role === 'admin'

  const register = async (competitionId: string) => {
    if (!accessToken) return
    setError('')
    setRegisteringId(competitionId)
    try {
      await arenaApi.registerParticipant(competitionId, accessToken)
      setMsg('Inscription individuelle envoyée — en attente de validation par l\'admin.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRegisteringId(null)
    }
  }

  const groups = {
    live: competitions.filter((c) => c.status === 'live' || c.status === 'paused'),
    open: competitions.filter((c) => c.status === 'approved'),
    upcoming: competitions.filter((c) => c.status === 'pending'),
    past: competitions.filter((c) => c.status === 'completed' || c.status === 'cancelled'),
  }

  if (loading) return <p style={{ color: 'var(--ink-3)', fontSize: 15 }}>Chargement…</p>

  return (
    <div>
      <p className="overline" style={{ marginBottom: 8 }}>Arena</p>
      <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 24 }}>
        Compétitions
      </h1>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {msg && <div className="alert alert-ok" style={{ marginBottom: 16 }}>{msg}</div>}

      {/* Groups */}
      {Object.entries(groups).map(([group, items]) => {
        if (items.length === 0) return null
        const labels: Record<string, string> = {
          live: '🔴 En direct',
          open: 'Inscriptions ouvertes',
          upcoming: 'À venir',
          past: 'Terminées',
        }
        return (
          <div key={group} style={{ marginBottom: 28 }}>
            <p
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.07em',
                color: group === 'live' ? 'var(--error)' : 'var(--ink-3)',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              {labels[group]}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden' }}>
              {items.map((comp, i, arr) => (
                <div
                  key={comp.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '13px 16px',
                    background: '#fff',
                    gap: 12,
                    borderBottom: i < arr.length - 1 ? '1px solid var(--rule)' : 'none',
                  }}
                >
                  {/* Left */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{comp.name}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-3)' }}>
                      <span style={{ color: STATUS_COLOR[comp.status] ?? 'var(--ink-3)', fontWeight: 600 }}>
                        {STATUS_LABELS[comp.status] ?? comp.status}
                      </span>
                      <span>{comp.questionCount} rounds</span>
                      {comp.startedAt && (
                        <span>{new Date(comp.startedAt).toLocaleDateString('fr-HT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>
                  </div>

                  {/* Single contextual action */}
                  <div style={{ flexShrink: 0 }}>
                    {(comp.status === 'live' || comp.status === 'paused') && (
                      <button
                        onClick={() => navigate(`/arena/live/${comp.id}`)}
                        className="btn btn-primary btn-sm"
                      >
                        {isAdmin || user?.role === 'moderator' ? 'Gérer en direct' : 'Rejoindre'}
                      </button>
                    )}
                    {comp.status === 'approved' && isAdmin && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ok)' }}>Inscriptions ouvertes</span>
                    )}
                    {comp.status === 'approved' && !isAdmin && (
                      <button
                        onClick={() => register(comp.id)}
                        disabled={registeringId === comp.id}
                        className="btn btn-gold btn-sm"
                      >
                        {registeringId === comp.id ? 'Envoi…' : 'S\'inscrire'}
                      </button>
                    )}
                    {comp.status === 'pending' && isAdmin && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>Brouillon</span>
                    )}
                    {comp.status === 'completed' && (
                      <button
                        onClick={() => navigate(`/arena/spectator/${comp.id}`)}
                        className="btn btn-ghost btn-sm"
                      >
                        Voir résultats
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {competitions.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ fontSize: 15, color: 'var(--ink-3)' }}>Aucune compétition disponible.</p>
        </div>
      )}
    </div>
  )
}

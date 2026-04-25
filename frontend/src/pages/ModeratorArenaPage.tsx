import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { arenaApi, type ArenaCompetition } from '../arena/arenaApi'

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Inscriptions ouvertes',
  live: 'En direct',
  paused: 'En pause',
  completed: 'Terminé',
  cancelled: 'Annulé',
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#6b7280',
  approved: '#16a34a',
  live: '#dc2626',
  paused: '#d97706',
  completed: '#1d4ed8',
  cancelled: '#6b7280',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.05em',
        background: (STATUS_COLOR[status] ?? '#6b7280') + '20',
        color: STATUS_COLOR[status] ?? '#6b7280',
        textTransform: 'uppercase',
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export default function ModeratorArenaPage() {
  const { user, accessToken, logout } = useAuth()
  const navigate = useNavigate()

  const [matches, setMatches] = useState<ArenaCompetition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [takingId, setTakingId] = useState<string | null>(null)

  const loadMyMatches = useCallback(() => {
    if (!accessToken) return
    setLoading(true)
    arenaApi.getMyModeratorMatches(accessToken)
      .then(setMatches)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [accessToken])

  useEffect(() => { loadMyMatches() }, [loadMyMatches])

  const handleRelease = async (competitionId: string) => {
    if (!accessToken) return
    setMsg('')
    setError('')
    setTakingId(competitionId)
    try {
      await arenaApi.releaseModerator(competitionId, accessToken)
      setMsg('Vous avez libéré ce match.')
      loadMyMatches()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setTakingId(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex' }}>
      {/* Sidebar */}
      <aside
        className="hidden md:flex flex-col"
        style={{ width: 216, background: '#fff', borderRight: '1px solid var(--rule)', minHeight: '100vh', position: 'fixed', top: 0, left: 0, zIndex: 40 }}
      >
        <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <span className="brand" style={{ fontSize: 17, color: 'var(--cobalt)' }}>Konesans</span>
            <span className="brand" style={{ fontSize: 17, color: 'var(--gold)' }}>+</span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 3 }}>Modérateur</p>
        </div>

        <nav style={{ flex: 1, padding: '10px 8px' }}>
          <button
            className="nav-item active"
            style={{ marginBottom: 2 }}
          >
            ⚔️ Arena
          </button>
        </nav>

        <div style={{ padding: '10px 8px', borderTop: '1px solid var(--rule)' }}>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', padding: '4px 8px', marginBottom: 4 }}>
            {user?.firstName} {user?.lastName}
          </p>
          <button onClick={logout} className="nav-item" style={{ color: 'var(--error)', fontWeight: 500 }}>
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div
        className="md:hidden"
        style={{ background: '#fff', borderBottom: '1px solid var(--rule)', padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40 }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <span className="brand" style={{ fontSize: 16, color: 'var(--cobalt)' }}>Konesans</span>
          <span className="brand" style={{ fontSize: 16, color: 'var(--gold)' }}>+</span>
          <span style={{ fontSize: 14, color: 'var(--ink-3)', marginLeft: 6 }}>Modérateur</span>
        </div>
        <button onClick={logout} style={{ fontSize: 16, color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Quitter</button>
      </div>

      {/* Main content */}
      <main className="flex-1 md:ml-[216px]" style={{ padding: '28px 24px', paddingTop: 'calc(28px + 52px)', maxWidth: 860, marginRight: 'auto' }}>
        <div style={{ paddingTop: 0 }} className="md:pt-0">
          <p className="overline" style={{ marginBottom: 8 }}>Portail Modérateur</p>
          <h1 className="display" style={{ fontSize: 28, color: 'var(--cobalt)', marginBottom: 4 }}>Mes matchs Arena</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 24 }}>
            Gérez les matchs qui vous sont assignés. Seuls les matchs dont vous êtes le modérateur apparaissent ici.
          </p>

          {msg && (
            <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, marginBottom: 16, color: '#16a34a', fontSize: 13 }}>
              {msg}
            </div>
          )}
          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}

          {loading ? (
            <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</p>
          ) : matches.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <p style={{ fontSize: 24, marginBottom: 8 }}>⚔️</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Aucun match assigné</p>
              <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                Un administrateur doit vous assigner à un match pour que vous puissiez le modérer.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {matches.map((comp) => {
                const isBusy = takingId === comp.id
                const canModerate = (comp.status as string) === 'live' || (comp.status as string) === 'paused'

                return (
                  <div
                    key={comp.id}
                    style={{
                      background: '#fff',
                      border: canModerate ? '2px solid #dc2626' : '1px solid var(--rule)',
                      borderRadius: 10,
                      padding: '16px 20px',
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-1)' }}>{comp.name}</span>
                        <StatusBadge status={comp.status} />
                        {canModerate && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: 4, animation: 'pulse 2s infinite' }}>
                            EN DIRECT
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                        {new Date(comp.scheduledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Info */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 }}>
                      <span>{comp.questionCount} questions</span>
                      <span>{comp.secondsPerQuestion}s / question</span>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {canModerate && (
                        <button
                          onClick={() => navigate(`/arena/live/${comp.id}`)}
                          style={{
                            padding: '8px 18px',
                            borderRadius: 6,
                            border: 'none',
                            background: '#dc2626',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          🔴 Modérer ce match
                        </button>
                      )}
                      {comp.status === 'approved' && (
                        <span style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>
                          En attente de lancement par l'admin
                        </span>
                      )}
                      <button
                        disabled={isBusy}
                        onClick={() => handleRelease(comp.id)}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 6,
                          border: '1px solid var(--rule)',
                          background: '#fff',
                          color: 'var(--error)',
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          opacity: isBusy ? 0.6 : 1,
                        }}
                      >
                        {isBusy ? '…' : 'Se désassigner'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

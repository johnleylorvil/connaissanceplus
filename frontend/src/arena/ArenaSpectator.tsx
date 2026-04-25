import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom'
import { arenaApi, type ArenaCompetition } from './arenaApi'

export default function ArenaSpectator() {
  const { id: competitionId } = useParams<{ id?: string }>()
  const navigate = useNavigate()

  if (competitionId) {
    return <Navigate to={`/arena/watch/${competitionId}`} replace />
  }

  return <SpectatorList navigate={navigate} />
}

function SpectatorList({ navigate }: { navigate: (path: string) => void }) {
  const [liveComps, setLiveComps] = useState<ArenaCompetition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    arenaApi
      .getLiveCompetitions()
      .then(setLiveComps)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', padding: '32px 20px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <Link
          to="/"
          style={{ fontSize: 13, color: 'var(--ink-3)', textDecoration: 'none', display: 'inline-block', marginBottom: 20 }}
        >
          {'<-'} Accueil
        </Link>
        <p className="overline" style={{ marginBottom: 8 }}>Arena</p>
        <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 6 }}>
          Mode Spectateur
        </h1>
        <p style={{ fontSize: 15, color: 'var(--ink-3)', marginBottom: 28 }}>
          Regardez les compétitions 1v1 en direct.
        </p>

        {loading ? (
          <p style={{ color: 'var(--ink-3)' }}>Chargement...</p>
        ) : liveComps.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ fontSize: 20, marginBottom: 12 }}>🎮</p>
            <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Aucune compétition en direct</p>
            <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>
              Revenez bientôt pour suivre les prochaines compétitions Arena.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {liveComps.map((comp) => (
              <div key={comp.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--error)',
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{comp.name}</p>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                    Round {comp.currentRound}/{comp.questionCount}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/arena/watch/${comp.id}`)}
                  className="btn btn-primary btn-sm"
                >
                  Regarder
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
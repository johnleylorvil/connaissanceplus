import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { arenaApi, type ArenaCompetition } from '../arenaApi'
import type { ArenaTab } from '../ArenaWorkspace'

type Props = { onNavigate: (tab: ArenaTab) => void }

const statusLabel: Record<string, string> = {
  pending: 'À venir',
  approved: 'Match confirmé',
  live: 'En cours',
  paused: 'En pause',
  completed: 'Terminé',
  cancelled: 'Annulé',
}

const statusColor: Record<string, string> = {
  pending: 'var(--ink-3)',
  approved: 'var(--cobalt)',
  live: 'var(--ok)',
  paused: '#d97706',
  completed: 'var(--ink-3)',
  cancelled: 'var(--error)',
}

export default function ArenaOverview({ onNavigate }: Props) {
  const navigate = useNavigate()
  const [competitions, setCompetitions] = useState<ArenaCompetition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    arenaApi.getCompetitions()
      .then((comps) => {
        setCompetitions(comps)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const liveComp = competitions.find((c) => c.status === 'live')
  const upcoming = competitions.filter((c) => c.status === 'pending' || c.status === 'approved')
  const completed = competitions.filter((c) => c.status === 'completed')

  if (loading) {
      return <p style={{ fontSize: 15, color: 'var(--ink-3)' }}>Chargement…</p>
  }

  return (
    <div>
      <p className="overline" style={{ marginBottom: 8 }}>Arena</p>
      <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 4 }}>
        Vue générale
      </h1>
      <p style={{ fontSize: 15, color: 'var(--ink-3)', marginBottom: 28 }}>
      {/* Live banner */}}
      {liveComp && (
        <div
          style={{
            background: 'var(--cobalt)',
            borderRadius: 8,
            padding: '20px 24px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 6 }}>
              En direct maintenant
            </p>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{liveComp.name}</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              {(liveComp.competitorAName && liveComp.competitorBName)
                ? `${liveComp.competitorAName} vs ${liveComp.competitorBName} · ${liveComp.questionCount} questions`
                : `${liveComp.questionCount} questions`}
            </p>
          </div>
          <button
            onClick={() => navigate(`/arena/live/${liveComp.id}`)}
            className="btn btn-gold btn-sm"
            style={{ flexShrink: 0 }}
          >
            Voir le direct →
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="responsive-three-col" style={{ border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden', marginBottom: 28 }}>
        {[
          { label: 'Compétitions à venir', value: upcoming.length },
          { label: 'Compétitions terminées', value: completed.length },
          { label: 'Live maintenant', value: liveComp ? 1 : 0 },
        ].map((s) => (
          <div key={s.label} className="mobile-stat-card" style={{ background: '#fff', padding: '18px 16px' }}>
            <div className="display" style={{ fontSize: 30, color: 'var(--cobalt)' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Upcoming competitions */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              Prochaines compétitions
            </p>
            <button onClick={() => onNavigate('competitions')} style={{ fontSize: 13, color: 'var(--cobalt)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Voir tout →
            </button>
          </div>
          <div style={{ border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden' }}>
            {upcoming.slice(0, 4).map((c, i, arr) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 16px',
                  background: '#fff',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--rule)' : 'none',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{c.name}</p>
                  <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                    {new Date(c.scheduledAt).toLocaleDateString('fr-HT')} à{' '}
                    {new Date(c.scheduledAt).toLocaleTimeString('fr-HT', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {c.competitorAName && c.competitorBName && (
                    <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>{c.competitorAName} vs {c.competitorBName}</p>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: statusColor[c.status],
                    flexShrink: 0,
                  }}
                >
                  {statusLabel[c.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="responsive-two-col" style={{ gap: 12 }}>
        <div className="card">
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 12 }}>Génie scolaire 1v1</p>
          <button onClick={() => onNavigate('competitions')} className="btn btn-ghost btn-sm">Voir les compétitions →</button>
        </div>
        <div className="card">
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 12 }}>Vue spectateur</p>
          <button
            onClick={() => navigate('/arena/spectator')}
            className="btn btn-ghost btn-sm"
          >
            Mode spectateur →
          </button>
        </div>
      </div>
    </div>
  )
}

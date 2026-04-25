import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { arenaApi, type ArenaCompetition } from '../arenaApi'

function CompetitionRow({ comp }: { comp: ArenaCompetition }) {
  const date = comp.completedAt ?? comp.startedAt
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{comp.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
          {date && (
            <span>
              {new Date(date).toLocaleDateString('fr-HT', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          )}
          {comp.winnerParticipantUserId && (
            <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
              🏆 Vainqueur: {comp.winnerParticipantName ?? comp.winnerParticipantUserId.slice(0, 8)}
            </span>
          )}
          {comp.status === 'cancelled' && (
            <span style={{ color: 'var(--ink-3)' }}>annulée</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ArenaHistory() {
  const { accessToken } = useAuth()
  const [tab, setTab] = useState<'general' | 'mine'>('general')
  const [general, setGeneral] = useState<ArenaCompetition[]>([])
  const [mine, setMine] = useState<ArenaCompetition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = accessToken ?? ''
    const promises: Promise<void>[] = [
      arenaApi
        .getHistory()
        .then(setGeneral)
        .catch(() => {}),
    ]
    if (token) {
      promises.push(
        arenaApi
          .getMyHistory(token)
          .then(setMine)
          .catch(() => {})
      )
    }
    Promise.all(promises).finally(() => setLoading(false))
  }, [accessToken])

  if (loading) return <p style={{ color: 'var(--ink-3)', fontSize: 15 }}>Chargement…</p>

  const current = tab === 'general' ? general : mine

  return (
    <div>
      <p className="overline" style={{ marginBottom: 8 }}>Arena</p>
      <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 24 }}>
        Historique
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid var(--rule)' }}>
        {(['general', 'mine'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 22px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              color: tab === t ? 'var(--cobalt)' : 'var(--ink-3)',
              borderBottom: tab === t ? '2px solid var(--cobalt)' : '2px solid transparent',
              marginBottom: -2,
              transition: 'all .15s',
            }}
          >
            {t === 'general' ? 'Toutes les compétitions' : 'Mes compétitions'}
          </button>
        ))}
      </div>

      {current.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <p style={{ fontSize: 15, color: 'var(--ink-3)' }}>
            {tab === 'mine'
              ? 'Vous n\'avez pas encore participé à une compétition.'
              : 'Aucune compétition terminée pour le moment.'}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {current.map((comp) => (
            <CompetitionRow key={comp.id} comp={comp} />
          ))}
        </div>
      )}
    </div>
  )
}

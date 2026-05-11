import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { arenaApi, type ArenaCompetition } from '../arenaApi'

const T = {
  bgCard: '#0c1120',
  bgHover: '#111828',
  border: 'rgba(255,255,255,0.09)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#f8fafc',
  textMuted: 'rgba(255,255,255,0.55)',
  textSoft: 'rgba(255,255,255,0.35)',
  gold: '#e6c27a',
  green: '#4fc66a',
  blue: '#6ca8f5',
  red: '#ff4d4d',
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?'
}

function SlotAvatar({ name, slot }: { name: string; slot: 'A' | 'B' }) {
  const color = slot === 'A' ? T.green : T.blue
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: `radial-gradient(circle at 38% 32%, ${color}1e, #03070e 72%)`,
          border: `1.5px solid ${color}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 900,
          color,
          flexShrink: 0,
        }}
      >
        {getInitials(name)}
      </div>
      <span
        style={{
          fontSize: 10,
          color: T.textMuted,
          maxWidth: 64,
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 600,
        }}
      >
        {name}
      </span>
    </div>
  )
}

function CompetitionRow({ comp }: { comp: ArenaCompetition }) {
  const date = comp.completedAt ?? comp.startedAt
  const hasPlayers = Boolean(comp.competitorAName && comp.competitorBName)

  return (
    <div
      style={{
        padding: '14px 16px',
        borderBottom: `1px solid ${T.border}`,
        position: 'relative',
      }}
    >
      {/* Top accent for winner */}
      {comp.winnerParticipantUserId && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 3,
            bottom: 0,
            background: `linear-gradient(180deg, ${T.gold}88, transparent)`,
            borderRadius: '0 0 0 0',
          }}
        />
      )}
      <div style={{ paddingLeft: comp.winnerParticipantUserId ? 10 : 0 }}>
        {hasPlayers ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 8 }}>
            <SlotAvatar name={comp.competitorAName!} slot="A" />
            <span
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 11,
                fontWeight: 900,
                color: T.textSoft,
                letterSpacing: '0.1em',
              }}
            >
              VS
            </span>
            <SlotAvatar name={comp.competitorBName!} slot="B" />
          </div>
        ) : (
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: T.text }}>{comp.name}</p>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {hasPlayers && (
            <p style={{ margin: 0, fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{comp.name}</p>
          )}
          {comp.winnerParticipantName && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 800,
                color: T.gold,
              }}
            >
              🏆 {comp.winnerParticipantName}
            </span>
          )}
          {comp.status === 'cancelled' && (
            <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft }}>Annulée</span>
          )}
          {date && (
            <span style={{ fontSize: 11, color: T.textSoft }}>
              {new Date(date).toLocaleDateString('fr-HT', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
          <span style={{ fontSize: 11, color: T.textSoft }}>
            {comp.questionCount}Q · {comp.secondsPerQuestion}s
          </span>
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
          .catch(() => {}),
      )
    }
    Promise.all(promises).finally(() => setLoading(false))
  }, [accessToken])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <style>{`@keyframes hisSpin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid rgba(255,255,255,.07)`, borderTopColor: T.gold, animation: 'hisSpin .85s linear infinite' }} />
      </div>
    )
  }

  const current = tab === 'general' ? general : mine

  return (
    <div style={{ color: T.text, minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.textSoft }}>Konesans+ Arena</p>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: T.text }}>Historique</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: `1px solid ${T.border}` }}>
        {(['general', 'mine'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '9px 22px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              color: tab === t ? T.text : T.textSoft,
              borderBottom: tab === t ? `2px solid ${T.gold}` : '2px solid transparent',
              marginBottom: -1,
              transition: 'all .15s',
              fontFamily: 'inherit',
            }}
          >
            {t === 'general' ? 'Toutes les compétitions' : 'Mes compétitions'}
          </button>
        ))}
      </div>

      {current.length === 0 ? (
        <div style={{ borderRadius: 14, border: `1px solid ${T.border}`, background: T.bgCard, padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 15, color: T.textMuted }}>
            {tab === 'mine'
              ? "Vous n'avez pas encore participé à une compétition."
              : 'Aucune compétition terminée pour le moment.'}
          </p>
        </div>
      ) : (
        <div style={{ borderRadius: 14, border: `1px solid ${T.border}`, background: T.bgCard, overflow: 'hidden' }}>
          {current.map((comp) => (
            <CompetitionRow key={comp.id} comp={comp} />
          ))}
          {/* Remove border from last row */}
          <style>{`.arena-hist-last>div:last-child{border-bottom:none!important}`}</style>
        </div>
      )}
    </div>
  )
}

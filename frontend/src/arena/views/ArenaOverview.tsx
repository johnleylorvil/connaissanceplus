import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { arenaApi, type ArenaCompetition } from '../arenaApi'
import type { ArenaTab } from '../ArenaWorkspace'

type Props = { onNavigate: (tab: ArenaTab) => void }

const T = {
  bgCard: '#0c1120',
  bgHover: '#111828',
  border: 'rgba(255,255,255,0.09)',
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

function Countdown({ targetDate }: { targetDate: string }) {
  const [secs, setSecs] = useState(() =>
    Math.max(0, Math.floor((new Date(targetDate).getTime() - Date.now()) / 1000)),
  )
  useEffect(() => {
    const iv = setInterval(
      () => setSecs(Math.max(0, Math.floor((new Date(targetDate).getTime() - Date.now()) / 1000))),
      1000,
    )
    return () => clearInterval(iv)
  }, [targetDate])
  if (secs <= 0) return <span style={{ color: T.green, fontWeight: 800 }}>Maintenant</span>
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (d > 0) return <span>{d}j {h}h</span>
  if (h > 0)
    return (
      <span>
        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </span>
    )
  return (
    <span style={{ color: m < 5 ? T.gold : T.textSoft, fontVariantNumeric: 'tabular-nums' }}>
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  )
}

function SlotAvatar({ name, slot }: { name: string; slot: 'A' | 'B' }) {
  const color = slot === 'A' ? T.green : T.blue
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: '50%',
          background: `radial-gradient(circle at 38% 32%, ${color}22, #03070e 75%)`,
          border: `1.5px solid ${color}55`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          fontWeight: 900,
          color,
          boxShadow: `0 0 18px ${color}1a`,
          flexShrink: 0,
        }}
      >
        {getInitials(name)}
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: T.textMuted,
          maxWidth: 80,
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
    </div>
  )
}

function VsFaceoff({ compA, compB }: { compA: string; compB: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '12px 0 8px' }}>
      <SlotAvatar name={compA} slot="A" />
      <span
        style={{
          flex: 1,
          textAlign: 'center',
          fontSize: 13,
          fontWeight: 900,
          color: T.textSoft,
          letterSpacing: '0.1em',
        }}
      >
        VS
      </span>
      <SlotAvatar name={compB} slot="B" />
    </div>
  )
}

export default function ArenaOverview({ onNavigate }: Props) {
  const navigate = useNavigate()
  const [competitions, setCompetitions] = useState<ArenaCompetition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      arenaApi
        .getCompetitions()
        .then((comps) => {
          if (!cancelled) {
            setCompetitions(comps)
            setLoading(false)
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false)
        })
    }
    load()
    const iv = setInterval(load, 15000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [])

  const liveComp = competitions.find((c) => c.status === 'live' || c.status === 'paused')
  const upcoming = competitions.filter((c) => c.status === 'pending' || c.status === 'approved').slice(0, 5)
  const completed = competitions.filter((c) => c.status === 'completed')

  return (
    <div style={{ color: T.text, minHeight: '100%' }}>
      <style>{`
        @keyframes ovLivePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.72)} }
        @keyframes ovBorderGlow {
          0%,100%{box-shadow:0 0 0 1px rgba(255,77,77,.22),0 16px 48px rgba(0,0,0,.5)}
          50%{box-shadow:0 0 0 2px rgba(255,77,77,.50),0 12px 60px rgba(255,77,77,.22),0 20px 64px rgba(0,0,0,.55)}
        }
        @keyframes ovSpin { to { transform: rotate(360deg); } }
        .ov-hover:hover { background: ${T.bgHover} !important; border-color: rgba(255,255,255,.16) !important; }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.textSoft }}>Konesans+ Arena</p>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: T.text, lineHeight: 1.1 }}>Vue générale</h1>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid rgba(255,255,255,0.07)`, borderTopColor: T.gold, animation: 'ovSpin .85s linear infinite' }} />
        </div>
      )}

      {/* LIVE hero banner */}
      {!loading && liveComp && (
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 18,
            border: `1px solid rgba(255,77,77,.45)`,
            background: `radial-gradient(ellipse at 50% -10%, rgba(255,55,55,.14) 0%, ${T.bgCard} 65%)`,
            padding: '22px 20px 18px',
            marginBottom: 24,
            animation: 'ovBorderGlow 2.4s ease-in-out infinite',
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, transparent 0%, #ff4d4d 40%, #ff4d4d 60%, transparent 100%)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: 'rgba(255,77,77,.18)', border: '1px solid rgba(255,77,77,.42)', fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', color: '#ff7070' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.red, boxShadow: `0 0 6px ${T.red}`, display: 'inline-block', animation: 'ovLivePulse 1.4s ease-in-out infinite' }} />
              {liveComp.status === 'paused' ? 'PAUSE' : 'EN DIRECT'}
            </span>
            <span style={{ fontSize: 13, color: T.textMuted, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{liveComp.name}</span>
          </div>
          {liveComp.competitorAName && liveComp.competitorBName ? (
            <VsFaceoff compA={liveComp.competitorAName} compB={liveComp.competitorBName} />
          ) : (
            <p style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700, color: T.text }}>{liveComp.name}</p>
          )}
          <p style={{ margin: '6px 0 16px', fontSize: 12, color: T.textSoft, textAlign: 'center' }}>
            {liveComp.questionCount} questions · {liveComp.secondsPerQuestion}s/réponse
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => navigate(`/arena/live/${liveComp.id}`)}
              style={{ padding: '11px 30px', borderRadius: 999, background: 'linear-gradient(135deg, #ff5252, #c0292e)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,77,77,.35)', letterSpacing: '0.02em' }}
            >
              Rejoindre le direct →
            </button>
          </div>
        </div>
      )}

      {/* No live placeholder */}
      {!loading && !liveComp && (
        <div style={{ borderRadius: 14, border: `1px solid ${T.border}`, background: T.bgCard, padding: '18px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 22 }}>🏟️</span>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.text }}>Aucun match en direct</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: T.textMuted }}>
              {upcoming.length > 0
                ? `${upcoming.length} match${upcoming.length > 1 ? 's' : ''} à venir`
                : 'Aucune compétition planifiée.'}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 24 }}>
          {[
            { label: 'À venir', value: upcoming.length, color: T.blue },
            { label: 'Terminés', value: completed.length, color: T.textMuted },
            { label: 'En direct', value: liveComp ? 1 : 0, color: liveComp ? T.red : T.textSoft },
          ].map((s) => (
            <div key={s.label} style={{ borderRadius: 12, border: `1px solid ${T.border}`, background: T.bgCard, padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: T.textSoft, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming list */}
      {!loading && upcoming.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.textSoft }}>Prochains matchs</p>
            <button onClick={() => onNavigate('competitions')} style={{ fontSize: 12, color: T.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>Voir tout →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcoming.map((c) => (
              <div
                key={c.id}
                className="ov-hover"
                onClick={() => navigate(`/arena/live/${c.id}`)}
                style={{ borderRadius: 12, border: `1px solid ${T.border}`, background: T.bgCard, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'all .15s ease' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.competitorAName && c.competitorBName ? `${c.competitorAName} vs ${c.competitorBName}` : c.name}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: T.textSoft }}>{c.questionCount} questions · {c.secondsPerQuestion}s/rép.</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: c.status === 'approved' ? T.gold : T.textSoft, marginBottom: 2 }}>
                    {c.status === 'approved' ? 'Confirmé' : 'À venir'}
                  </div>
                  <div style={{ fontSize: 11 }}><Countdown targetDate={c.scheduledAt} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className="ov-hover" onClick={() => onNavigate('competitions')} style={{ borderRadius: 12, border: `1px solid ${T.border}`, background: T.bgCard, padding: '14px', textAlign: 'left', cursor: 'pointer', transition: 'all .15s ease' }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: T.text }}>Compétitions</p>
            <p style={{ margin: 0, fontSize: 11, color: T.textMuted }}>Inscriptions & matchs →</p>
          </button>
          <button className="ov-hover" onClick={() => navigate('/arena/spectator')} style={{ borderRadius: 12, border: `1px solid ${T.border}`, background: T.bgCard, padding: '14px', textAlign: 'left', cursor: 'pointer', transition: 'all .15s ease' }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: T.text }}>Spectateur</p>
            <p style={{ margin: 0, fontSize: 11, color: T.textMuted }}>Observer un match →</p>
          </button>
        </div>
      )}
    </div>
  )
}

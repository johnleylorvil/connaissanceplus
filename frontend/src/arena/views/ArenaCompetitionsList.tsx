import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { arenaApi, type ArenaCompetition } from '../arenaApi'

const T = {
  bgCard: '#ffffff',
  bgHover: '#f8fafc',
  border: '#e5e7eb',
  text: '#0f172a',
  textMuted: '#64748b',
  textSoft: '#94a3b8',
  gold: '#b7791f',
  green: '#166534',
  blue: '#0f172a',
  red: '#b91c1c',
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
  if (secs <= 0) return <span style={{ color: T.green, fontWeight: 700 }}>Maintenant</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: `radial-gradient(circle at 38% 32%, ${color}1e, #03070e 72%)`,
          border: `1.5px solid ${color}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 900,
          color,
          flexShrink: 0,
        }}
      >
        {getInitials(name)}
      </div>
      <span
        style={{
          fontSize: 11,
          color: T.textMuted,
          maxWidth: 72,
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

function VsFaceoff({ compA, compB }: { compA: string; compB: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '10px 0 6px' }}>
      <SlotAvatar name={compA} slot="A" />
      <span
        style={{
          flex: 1,
          textAlign: 'center',
          fontSize: 12,
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

type CompCardProps = {
  comp: ArenaCompetition
  onRegister: (id: string) => void
  registeringId: string | null
  userId: string | undefined
  isAdmin: boolean
  isModerator: boolean
  isStudent: boolean
  isSchool: boolean
}

function CompCard({ comp, onRegister, registeringId, userId, isAdmin, isModerator, isStudent, isSchool }: CompCardProps) {
  const navigate = useNavigate()
  const isLive = comp.status === 'live' || comp.status === 'paused'
  const isAssignedMatch = Boolean(comp.competitorAUserId && comp.competitorBUserId)
  const isInstitutionalMatch = Boolean(comp.schoolAId || comp.schoolBId)
  const isAssignedCompetitor = Boolean(userId && [comp.competitorAUserId, comp.competitorBUserId].includes(userId))
  const canOpenAssignedStage = isAssignedMatch && (isAssignedCompetitor || isAdmin || isModerator)

  const cardBorderColor = isLive
    ? 'rgba(255,77,77,.40)'
    : comp.status === 'approved' && isAssignedMatch
      ? 'rgba(230,194,122,.28)'
      : T.border

  const cardBg = comp.status === 'approved' && isAssignedMatch ? '#fffbeb' : T.bgCard

  let actionEl: React.ReactNode = null
  if (isLive) {
    actionEl = (
      <button
        onClick={() => navigate(`/arena/live/${comp.id}`)}
        style={{ padding: '7px 14px', borderRadius: 999, border: 'none', background: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        {isAdmin || isModerator ? 'Gérer →' : 'Rejoindre →'}
      </button>
    )
  } else if (comp.status !== 'live' && comp.status !== 'paused' && canOpenAssignedStage) {
    actionEl = (
      <button
        onClick={() => navigate(`/arena/live/${comp.id}`)}
        style={{ padding: '7px 14px', borderRadius: 999, border: `1px solid rgba(230,194,122,.35)`, background: 'rgba(230,194,122,.10)', color: T.gold, fontSize: 12, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        {isSchool ? 'Préparer le live →' : 'Préparer →'}
      </button>
    )
  } else if (comp.status === 'completed') {
    actionEl = (
      <button
        onClick={() => navigate(`/arena/spectator/${comp.id}`)}
        style={{ padding: '7px 14px', borderRadius: 999, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,.05)', color: T.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        Résultats →
      </button>
    )
  } else if (comp.status === 'approved' && isStudent && !isAssignedMatch) {
    actionEl = (
      <button
        onClick={() => onRegister(comp.id)}
        disabled={registeringId === comp.id}
        style={{ padding: '7px 14px', borderRadius: 999, border: `1px solid rgba(108,168,245,.35)`, background: 'rgba(108,168,245,.12)', color: T.blue, fontSize: 12, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', opacity: registeringId === comp.id ? 0.6 : 1 }}
      >
        {registeringId === comp.id ? 'Envoi…' : "S'inscrire"}
      </button>
    )
  } else if (comp.status === 'approved' && isAdmin && isAssignedMatch) {
    actionEl = <span style={{ fontSize: 11, fontWeight: 700, color: T.green }}>Prêt</span>
  } else if (comp.status === 'approved' && isAdmin && !isAssignedMatch) {
    actionEl = <span style={{ fontSize: 11, fontWeight: 700, color: T.blue }}>Inscriptions ouvertes</span>
  } else if (comp.status === 'approved' && !isAdmin && isAssignedMatch && !canOpenAssignedStage) {
    actionEl = <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft }}>{isInstitutionalMatch ? 'Match institutionnel' : 'Duel annoncé'}</span>
  } else if (comp.status === 'pending' && isAdmin) {
    actionEl = <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft }}>Brouillon</span>
  } else if (comp.status === 'pending' && !isAdmin && isAssignedMatch && !canOpenAssignedStage) {
    actionEl = <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft }}>Annonce du match</span>
  }

  return (
    <div
      className={isAssignedCompetitor ? 'arena-hub-personal' : undefined}
      style={{
        borderRadius: 14,
        border: `1px solid ${cardBorderColor}`,
        background: cardBg,
        padding: '14px 16px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color .2s ease',
        ...(isLive ? { animation: 'compLiveBorder 2.4s ease-in-out infinite' } : {}),
      }}
    >
      {isLive && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#b91c1c' }} />
      )}
      {comp.status === 'approved' && isAssignedMatch && !isLive && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: T.gold }} />
      )}

      {/* Header: name + meta + action */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {comp.name}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {isAssignedCompetitor && <span className="arena-hub-personal-label">{isSchool ? 'MATCH DE VOTRE ECOLE' : 'VOTRE MATCH'}</span>}
            {isLive && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: '.12em', color: '#ff7070' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.red, boxShadow: `0 0 5px ${T.red}`, display: 'inline-block', animation: 'clLivePulse 1.4s ease-in-out infinite' }} />
                {comp.status === 'paused' ? 'PAUSE' : 'EN DIRECT'}
              </span>
            )}
            <span style={{ fontSize: 11, color: T.textSoft }}>{comp.questionCount}Q · {comp.secondsPerQuestion}s</span>
            {(comp.status === 'pending' || comp.status === 'approved') && (
              <span style={{ fontSize: 11, color: T.textSoft }}>
                <Countdown targetDate={comp.scheduledAt} />
              </span>
            )}
            {comp.status === 'completed' && (comp.winnerSchoolName || comp.winnerParticipantName) && (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.gold }}>?? {comp.winnerSchoolName ?? comp.winnerParticipantName}</span>
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0, marginTop: 2 }}>{actionEl}</div>
      </div>

      {/* VS faceoff */}
      {(comp.schoolAName || comp.competitorAName) && (comp.schoolBName || comp.competitorBName) && (
        <VsFaceoff compA={comp.schoolAName ?? comp.competitorAName ?? 'Etablissement A'} compB={comp.schoolBName ?? comp.competitorBName ?? 'Etablissement B'} />
      )}

      {/* Date */}
      {(comp.status === 'pending' || comp.status === 'approved') && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: T.textSoft }}>
          {new Date(comp.scheduledAt).toLocaleDateString('fr-HT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  )
}

// ─── legacy status color map (kept for reference, no longer used in JSX) ─────
export default function ArenaCompetitionsList({ embedded = false }: { embedded?: boolean }) {
  const { accessToken, user } = useAuth()
  const [competitions, setCompetitions] = useState<ArenaCompetition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [showAllResults, setShowAllResults] = useState(false)

  const isAdmin = user?.role === 'admin'
  const isModerator = user?.role === 'moderator'
  const isStudent = user?.role === 'student'
  const isSchool = user?.role === 'school'

  useEffect(() => {
    let cancelled = false
    const load = () => {
      if (isSchool && !accessToken) {
        setCompetitions([])
        setLoading(false)
        return
      }

      const request = isSchool && accessToken
        ? arenaApi.getMySchoolCompetitions(accessToken)
        : arenaApi.getCompetitions()

      request
        .then((comps) => {
          if (!cancelled) {
            const visibleComps = isStudent ? comps.filter((comp) => !(comp.schoolAId || comp.schoolBId)) : comps
            setCompetitions(visibleComps)
            setLoading(false)
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError((err as Error).message)
            setLoading(false)
          }
        })
    }
    load()
    const iv = setInterval(load, 20000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [accessToken, isSchool, isStudent])

  const register = async (competitionId: string) => {
    if (!accessToken) return
    setError('')
    setRegisteringId(competitionId)
    try {
      await arenaApi.registerParticipant(competitionId, accessToken)
      setMsg("Inscription envoyée — en attente de validation par l'admin.")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRegisteringId(null)
    }
  }

  const groups = {
    live: competitions.filter((c) => c.status === 'live' || c.status === 'paused'),
    ready: competitions.filter((c) => c.status === 'approved' && Boolean(c.competitorAUserId && c.competitorBUserId)),
    open: competitions.filter((c) => c.status === 'approved' && !(c.competitorAUserId && c.competitorBUserId)),
    upcoming: competitions.filter((c) => c.status === 'pending'),
    past: competitions.filter((c) => c.status === 'completed' || c.status === 'cancelled'),
  }
  const activeGroups = [
    { key: 'ready', label: 'Matchs confirm\u00e9s', items: groups.ready },
    { key: 'open', label: 'Inscriptions ouvertes', items: groups.open },
    { key: 'upcoming', label: '\u00c0 venir', items: groups.upcoming },
  ]
  const visibleResults = showAllResults ? groups.past : groups.past.slice(0, 4)
  const displayGroups = [
    { key: 'live', label: 'En direct', items: groups.live },
    ...activeGroups,
    { key: 'past', label: 'R\u00e9sultats r\u00e9cents', items: visibleResults },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <style>{`@keyframes clSpin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid rgba(255,255,255,.07)`, borderTopColor: T.gold, animation: 'clSpin .85s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ color: T.text, minHeight: '100%' }}>
      <style>{`
        @keyframes clLivePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.72)} }
        @keyframes compLiveBorder {
          0%,100%{box-shadow:0 0 0 0 rgba(255,77,77,0),0 8px 32px rgba(0,0,0,.4)}
          50%{box-shadow:0 0 0 2px rgba(255,77,77,.22),0 8px 48px rgba(255,77,77,.10),0 8px 32px rgba(0,0,0,.5)}
        }
      `}</style>

      <div className="arena-hub-title">
        <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.textSoft }}>Konesans+ Arena</p>
        <h1>{isSchool ? 'Mes matchs Arena' : 'Votre espace de compétition'}</h1>
        {!embedded && (
          <span>
            {isSchool
              ? 'Matchs de votre établissement, accès live et résultats au même endroit.'
              : 'Directs institutionnels, prochains matchs et derniers résultats au même endroit.'}
          </span>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,77,77,.12)', border: '1px solid rgba(255,77,77,.28)', color: '#ffd0d5', fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
          {error}
        </div>
      )}
      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(79,198,106,.10)', border: '1px solid rgba(79,198,106,.28)', color: '#dff7e5', fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
          {msg}
        </div>
      )}

      {displayGroups.map(({ key: group, label, items }) => {
        if (items.length === 0) return null
        return (
          <div key={group} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              {group === 'live' && (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: T.red,
                    boxShadow: `0 0 5px ${T.red}`,
                    animation: 'clLivePulse 1.4s ease-in-out infinite',
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
              )}
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: group === 'live' ? '#ff7070' : T.textSoft }}>
                {label}
              </p>
            </div>
            <div className={`arena-hub-grid${group === 'live' ? ' arena-hub-grid-live' : ''}`}>
              {items.map((comp) => (
                <CompCard
                  key={comp.id}
                  comp={comp}
                  onRegister={register}
                  registeringId={registeringId}
                  userId={user?.id}
                  isAdmin={isAdmin}
                  isModerator={isModerator}
                  isStudent={isStudent}
                  isSchool={isSchool}
                />
              ))}
            </div>
          </div>
        )
      })}

      {groups.past.length > 4 && (
        <button type="button" className="arena-hub-more" onClick={() => setShowAllResults((value) => !value)}>
          {showAllResults ? 'R\u00e9duire les r\u00e9sultats' : `Voir tous les r\u00e9sultats (${groups.past.length})`}
        </button>
      )}

      {competitions.length === 0 && (
        <div style={{ borderRadius: 14, border: `1px solid ${T.border}`, background: T.bgCard, padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 15, color: T.textMuted }}>
            {isSchool ? 'Aucun match Arena n’est encore associé à votre établissement.' : 'Aucune compétition disponible.'}
          </p>
        </div>
      )}
    </div>
  )
}

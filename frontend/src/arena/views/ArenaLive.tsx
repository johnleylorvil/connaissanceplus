import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useArenaSocket } from '../useArenaSocket'
import { useLiveKitStage, type StageParticipant } from '../hooks/useLiveKitStage'
import { arenaApi, ARENA_API, type ArenaLeaderboardRow, type ArenaPublicStream } from '../arenaApi'

type UserMode = 'competitor' | 'moderator' | 'spectator'
type MatchParticipant = {
  participantUserId: string
  displayName: string
  score: number
  slot: 'A' | 'B'
}

// -- Design tokens -------------------------------------------------------
const T = {
  bg:          '#07101e',
  cardBg:      '#0d1b2e',
  sidebarBg:   '#091525',
  border:      'rgba(255,255,255,0.07)',
  borderBright:'rgba(255,255,255,0.14)',
  text:        '#f1f5f9',
  textMuted:   'rgba(255,255,255,0.45)',
  accentA:     '#3b82f6',
  accentB:     '#ef4444',
  accentMod:   '#f59e0b',
  accentLive:  '#22c55e',
  gold:        '#f59e0b',
}

// -- Shared style tokens ------------------------------------------------
const S = {
  label: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase' as const, color: T.textMuted, margin: 0,
  } as React.CSSProperties,
  timerNormal: {
    background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.28)',
    borderRadius: 8, padding: '3px 18px',
    fontWeight: 800, fontSize: 22, minWidth: 72, textAlign: 'center' as const,
    fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em', color: '#93c5fd',
  } as React.CSSProperties,
  timerCritical: {
    background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.5)',
    borderRadius: 8, padding: '3px 18px',
    fontWeight: 800, fontSize: 22, minWidth: 72, textAlign: 'center' as const,
    fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em', color: '#fca5a5',
    animation: 'timerPulse 0.65s ease-in-out infinite',
  } as React.CSSProperties,
}

// Competition phase state machine (frontend display only)
type CompetitionPhase =
  | 'loading'
  | 'waiting'
  | 'live-waiting'
  | 'live-question'
  | 'live-between'
  | 'paused'
  | 'finished'

function getPhase(opts: {
  teamLoaded: boolean
  competitionStatus: string | null | undefined
  isPaused: boolean
  currentRound: { endedAt: string | null } | null | undefined
  roundEnded: unknown
  competitionResult: unknown
}): CompetitionPhase {
  if (!opts.teamLoaded) return 'loading'
  if (opts.competitionStatus === 'completed' || opts.competitionResult) return 'finished'
  if (opts.competitionResult) return 'finished'
  if (opts.isPaused) return 'paused'
  if (opts.competitionStatus !== 'live') return 'waiting'
  if (opts.currentRound?.endedAt) return 'live-between'
  if (opts.roundEnded) return 'live-between'
  if (opts.currentRound) return 'live-question'
  return 'live-waiting'
}

function PublicStreamPanel({ competitionId, accessToken }: { competitionId: string | undefined; accessToken: string | null }) {
  const [stream, setStream] = useState<ArenaPublicStream | null>(null)
  const [statusRequest, setStatusRequest] = useState<'live' | 'stopped' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!competitionId) return
    let cancelled = false

    const load = () => {
      arenaApi.getBroadcast(competitionId)
        .then((data) => {
          if (cancelled) return
          setStream(data)
          setErrorMessage(null)
        })
        .catch(() => {})
    }

    load()
    const interval = window.setInterval(load, 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [competitionId])

  const updateStatus = async (status: 'live' | 'stopped') => {
    if (!competitionId || !accessToken) return
    if (stream?.provider !== 'youtube') return
    setStatusRequest(status)
    setErrorMessage(null)
    try {
      const updatedCompetition = await arenaApi.setPublicStreamStatus(competitionId, status, accessToken)
      setStream(updatedCompetition.publicStream ?? null)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Mise a jour de la diffusion publique impossible.')
    } finally {
      setStatusRequest(null)
    }
  }

  const isYoutube = stream?.provider === 'youtube' && !!stream?.streamUrl

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
        <p style={{ margin: 0, fontSize: 11, color: T.textMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Diffusion publique</p>
        {isYoutube ? (
          <>
            <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 700, color: T.text }}>
              YouTube Live {stream?.status === 'live' ? 'actif' : stream?.status === 'stopped' ? 'termine' : 'pret'}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.45, color: T.textMuted }}>
              Les spectateurs regardent la page publique Arena, qui embarque la video YouTube. La scene privee RTC reste ici pour les joueurs et le moderateur.
            </p>
          </>
        ) : (
          <p style={{ margin: '6px 0 0', fontSize: 11, lineHeight: 1.45, color: T.textMuted }}>
            Configurez d'abord le lien YouTube dans l'espace admin pour ouvrir la diffusion publique aux spectateurs.
          </p>
        )}
      </div>

      {isYoutube && (
        <>
          <button
            style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: '1px solid rgba(74,222,128,0.35)', background: 'rgba(34,197,94,0.1)', color: '#4ade80', fontWeight: 700, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em', opacity: statusRequest === 'live' ? 0.6 : 1 }}
            disabled={statusRequest !== null}
            onClick={() => updateStatus('live')}
          >
            {statusRequest === 'live' ? 'MISE EN DIRECT…' : '▶ OUVRIR AU PUBLIC'}
          </button>
          <button
            style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontWeight: 700, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em', opacity: statusRequest === 'stopped' ? 0.6 : 1 }}
            disabled={statusRequest !== null}
            onClick={() => updateStatus('stopped')}
          >
            {statusRequest === 'stopped' ? 'FERMETURE…' : '⏹ FERMER COTE PUBLIC'}
          </button>
          <a
            href={`/arena/watch/${competitionId}`}
            target="_blank"
            rel="noreferrer"
            style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: `1px solid ${T.borderBright}`, background: 'transparent', color: T.text, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textAlign: 'center', textDecoration: 'none' }}
          >
            PAGE SPECTATEURS
          </a>
        </>
      )}
      {errorMessage && (
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: '#fca5a5' }}>{errorMessage}</p>
      )}
    </div>
  )
}

export default function ArenaLive() {
  const { id: competitionId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, accessToken } = useAuth()

  const isModerator = user?.role === 'admin' || user?.role === 'moderator'
  const [isRegisteredCompetitor, setIsRegisteredCompetitor] = useState(false)
  const [teamLoaded, setTeamLoaded] = useState(false)
  const [polledState, setPolledState] = useState<{
    competitionId: string
    competitionName: string
    status: string
    type: string
    secondsPerQuestion: number
    currentRoundNumber: number
    totalRounds: number
    currentRound: { id: string; position: number; questionId: string; startedAt: string | null; endedAt: string | null; endTime: string | null } | null
    leaderboard: ArenaLeaderboardRow[]
    participants?: Array<{ userId: string; displayName: string; slot: 'A' | 'B' }>
    matchParticipants?: Array<{ userId: string; displayName: string; role: 'competitorA' | 'competitorB' | 'moderator' }>
  } | null>(null)
  const [polledLeaderboard, setPolledLeaderboard] = useState<ArenaLeaderboardRow[]>([])
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [eventLog, setEventLog] = useState<string[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // LiveKit RTC stage token (fetched once when user is a stage participant)
  const [rtcToken, setRtcToken] = useState<string | null>(null)
  const [rtcUrl, setRtcUrl] = useState<string | null>(null)

  // Resolve participation for solo 1v1 mode (moderator skips)
  useEffect(() => {
    if (isModerator) { setTeamLoaded(true); return }
    if (!competitionId || !user?.id) { setTeamLoaded(true); return }
    arenaApi.getLiveState(competitionId)
      .then((s) => {
        const live = s as { participants?: Array<{ userId: string }> }
        setIsRegisteredCompetitor(!!live.participants?.some((p) => p.userId === user.id))
      })
      .catch(() => setIsRegisteredCompetitor(false))
      .finally(() => setTeamLoaded(true))
  }, [competitionId, isModerator, user?.id])

  const canControlLocalMedia = isModerator || isRegisteredCompetitor

  const socketParams = useMemo(
    () => (
      competitionId && user?.id && teamLoaded && accessToken
        ? isModerator
          ? { competitionId, userId: user.id, participantId: '__admin__', role: 'admin', token: accessToken }
          : isRegisteredCompetitor
            ? { competitionId, userId: user.id, participantId: user.id, role: 'competitor', token: accessToken }
            : { competitionId, userId: user.id, participantId: '__spectator__', role: 'spectator', token: accessToken }
        : null
    ),
    [accessToken, competitionId, isModerator, isRegisteredCompetitor, teamLoaded, user?.id],
  )

  const { socketState } = useArenaSocket(socketParams)
  const {
    connected, state, leaderboard, roundEnded, competitionResult, error,
    isPaused, onlineParticipantIds, onlineUsers, viewerCount,
  } = socketState

  // Spectator fallback polling (no room access without team)
  useEffect(() => {
    if (!competitionId || socketParams) return

    let cancelled = false
    const load = () => {
      Promise.all([
        arenaApi.getLiveState(competitionId),
        arenaApi.getLiveLeaderboard(competitionId),
      ])
        .then(([liveState, liveBoard]) => {
          if (cancelled) return
          setPolledState(liveState as typeof polledState)
          setPolledLeaderboard(liveBoard)
        })
        .catch(() => {})
    }

    load()
    const interval = setInterval(load, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [competitionId, socketParams])

  const liveState = state ?? polledState
  const liveLeaderboard = leaderboard.length > 0 ? leaderboard : polledLeaderboard
  const currentRound = liveState?.currentRound ?? null
  const currentRoundStartedAt = currentRound?.startedAt ?? null
  const currentRoundEndTime = currentRound?.endTime ?? null
  const secondsPerQuestion = liveState?.secondsPerQuestion ?? 30
  const roundIsClosed = Boolean(roundEnded || currentRound?.endedAt)

  const participants = useMemo<MatchParticipant[]>(() => {
    const seededFromState = (liveState?.participants ?? []).map((p) => {
      const row = liveLeaderboard.find((l) => l.participantUserId === p.userId)
      return {
        participantUserId: p.userId,
        displayName: p.displayName,
        score: row?.score ?? 0,
        slot: p.slot,
      }
    })

    const seeded = seededFromState.length > 0
      ? seededFromState
      : liveLeaderboard.slice(0, 2).map((row, index) => ({
          participantUserId: row.participantUserId,
          displayName: row.displayName,
          score: row.score,
          slot: (index === 0 ? 'A' : 'B') as 'A' | 'B',
        }))

    while (seeded.length < 2) {
      seeded.push({
        participantUserId: `placeholder-${seeded.length}`,
        displayName: seeded.length === 0 ? 'Compétiteur A (attente)' : 'Compétiteur B (attente)',
        score: 0,
        slot: seeded.length === 0 ? 'A' : 'B',
      })
    }

    return seeded
  }, [liveLeaderboard, liveState?.participants])

  const userMode: UserMode = useMemo(() => {
    if (isModerator) return 'moderator'
    if (isRegisteredCompetitor && user?.id && participants.some((p) => p.participantUserId === user.id)) return 'competitor'
    return 'spectator'
  }, [isModerator, isRegisteredCompetitor, participants, user?.id])
  const competitorOnlineCount = useMemo(
    () => onlineUsers.filter((entry) => {
      return participants.some((p) => p.participantUserId === entry.participantId)
    }).length,
    [participants, onlineUsers],
  )

  useEffect(() => {
    const next = currentRound
      ? `Round ${currentRound.position}/${liveState?.totalRounds ?? 0} lancé`
      : null
    if (!next) return
    setEventLog((prev) => {
      if (prev[0] === next) return prev
      return [next, ...prev].slice(0, 5)
    })
  }, [currentRound, liveState?.totalRounds])

  useEffect(() => {
    if (!roundEnded) return
    setEventLog((prev) => [`Round terminé - score mis à jour`, ...prev].slice(0, 5))
  }, [roundEnded])

  // Timer countdown
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!currentRound || roundIsClosed) return
    const computeRemaining = () => {
      if (currentRoundEndTime) {
        return Math.max(0, Math.round((new Date(currentRoundEndTime).getTime() - Date.now()) / 1000))
      }
      const started = currentRoundStartedAt ? new Date(currentRoundStartedAt).getTime() : Date.now()
      const durationMs = secondsPerQuestion * 1000
      return Math.max(0, Math.round((started + durationMs - Date.now()) / 1000))
    }
    setTimeLeft(computeRemaining())
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t === null || t <= 0) { clearInterval(timerRef.current!); return 0 }
        return t - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [currentRound, currentRoundEndTime, currentRoundStartedAt, roundIsClosed, secondsPerQuestion])

  // -- LiveKit RTC token fetch (stage participants only) ------------------
  useEffect(() => {
    if (!competitionId || !accessToken || userMode === 'spectator' || !canControlLocalMedia) return
    arenaApi.getRtcToken(competitionId, accessToken)
      .then((data) => { setRtcUrl(data.url); setRtcToken(data.token) })
      .catch(() => { /* token fetch failed à stage will be audio-only */ })
  }, [competitionId, accessToken, userMode, canControlLocalMedia])

  // -- LiveKit Stage (camera/mic for mod + competitors) --------------------
  const {
    roomConnected: stageConnected,
    participants: stageParticipants,
    localCameraEnabled,
    localMicEnabled,
    isCameraLoading,
    permissionError: stagePermissionError,
    toggleCamera,
    toggleMic,
  } = useLiveKitStage({
    url: rtcUrl,
    token: rtcToken,
    canPublish: canControlLocalMedia,
  })

  // Admin action helper
  const adminFetch = async (url: string, method = 'PATCH', body?: unknown) => {
    try {
      const init: RequestInit = {
        method,
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }
      if (body) init.body = JSON.stringify(body)
      const res = await fetch(url, init)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.message || 'Erreur')
      }
    } catch (e) { alert((e as Error).message) }
  }

  // State machine
  const isLive = liveState?.status === 'live'
  const phase = getPhase({
    teamLoaded, competitionStatus: liveState?.status, isPaused,
    currentRound: liveState?.currentRound, roundEnded, competitionResult,
  })
  const questionNumber = liveState?.currentRoundNumber ?? 0
  const totalQuestions = liveState?.totalRounds ?? 0
  const leadingScore = participants.length > 0 ? Math.max(...participants.map((participant) => participant.score)) : null
  const leadingParticipants = leadingScore === null
    ? []
    : participants.filter((participant) => participant.score === leadingScore)
  const uniqueWinner = leadingParticipants.length === 1 ? leadingParticipants[0] : null

  // -- Loading -----------------------------------------------------------
  if (phase === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.accentA, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: T.textMuted, fontSize: 12, margin: 0, letterSpacing: '0.12em', fontWeight: 700 }}>CONNEXION EN COURS…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // -- Finished ----------------------------------------------------------
  if (phase === 'finished') {
    const podium = competitionResult?.podium ?? liveLeaderboard.slice(0, 3)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg, padding: 24, textAlign: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: T.textMuted, textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Compétition</span>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: T.gold, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Match terminé</h1>
        {podium[0] && (
          <p style={{ fontSize: 16, color: T.text, fontWeight: 600, marginBottom: 36 }}>
            Vainqueur · <span style={{ color: T.gold }}>{podium[0].displayName}</span>
          </p>
        )}
        <div style={{ width: '100%', maxWidth: 440, marginBottom: 36 }}>
          {podium.slice(0, 3).map((row: ArenaLeaderboardRow, i: number) => (
            <div key={row.participantUserId} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', marginBottom: 8,
              background: i === 0 ? 'rgba(245,158,11,0.1)' : T.cardBg,
              borderRadius: 10,
              border: `1px solid ${i === 0 ? 'rgba(245,158,11,0.35)' : T.border}`,
              boxShadow: i === 0 ? '0 0 24px rgba(245,158,11,0.12)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 22 }}>{['🥇', '🥈', '🥉'][i] ?? String(i + 1)}</span>
                <span style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{row.displayName}</span>
              </div>
              <span style={{ fontWeight: 900, color: i === 0 ? T.gold : T.accentA, fontSize: 20 }}>{row.score}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate('/arena')}
          style={{ padding: '12px 36px', background: T.accentA, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: 'pointer', letterSpacing: '0.08em', boxShadow: `0 0 20px ${T.accentA}40` }}
        >
          RETOUR À L'ARENA
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }


  // -- Phase status text -------------------------------------------------
  function getRoundStatusText() {
    if (phase === 'waiting') return 'En attente du modérateur pour lancer le match.'
    if (phase === 'live-waiting') return 'En direct · En attente de la prochaine question.'
    if (phase === 'paused') return 'Le modérateur a mis le match en pause.'
    if (phase === 'live-question') return 'Question en cours · Répondez oralement.'
    if (phase === 'live-between') return 'Round terminé · Calcul des scores en cours.'
    return 'Match en cours.'
  }
  // -- LiveKit video tile -----------------------------------------------
  function LiveKitVideoTile({
    title, subtitle, score, stagePart, isLocal, isOnline, accent,
  }: {
    title: string; subtitle: string; score?: number
    stagePart: StageParticipant | null; isLocal: boolean; isOnline: boolean; accent: string
  }) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const audioRef = useRef<HTMLAudioElement>(null)
    const cameraTrack = stagePart?.cameraPublication?.track ?? null
    const micTrack = stagePart?.micPublication?.track ?? null
    const camEnabled = stagePart?.isCameraEnabled ?? false
    const micEnabled = stagePart?.isMicEnabled ?? false
    const initial = subtitle.trim().charAt(0).toUpperCase() || '?'

    useEffect(() => {
      const el = videoRef.current
      if (!el || !cameraTrack) return
      cameraTrack.attach(el)
      return () => { cameraTrack.detach(el) }
    }, [cameraTrack])

    useEffect(() => {
      const el = audioRef.current
      if (!el || !micTrack || isLocal) return
      micTrack.attach(el)
      return () => { micTrack.detach(el) }
    }, [micTrack, isLocal])

    return (
      <div style={{
        background: T.cardBg,
        border: `1px solid ${isOnline ? accent : T.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: isOnline
          ? `0 0 0 1px ${accent}35, 0 8px 32px ${accent}14`
          : '0 4px 20px rgba(0,0,0,0.35)',
        transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
      }}>
        {/* Video area */}
        <div style={{ aspectRatio: '16/9', background: '#040b17', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          {camEnabled
            ? <video ref={videoRef} autoPlay muted={isLocal} playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <div style={{
                  width: 70, height: 70, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${accent}35, ${accent}14)`,
                  border: `2px solid ${accent}45`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 800, color: accent,
                  boxShadow: isOnline ? `0 0 24px ${accent}25` : 'none',
                }}>
                  {initial}
                </div>
                <p style={{ fontSize: 10, color: T.textMuted, margin: 0, letterSpacing: '0.1em', fontWeight: 700 }}>
                  {isOnline ? 'CAMÉRA DÉSACTIVÉE' : 'HORS LIGNE'}
                </p>
              </div>
            )
          }
          {!isLocal && <audio ref={audioRef} autoPlay />}

          {/* Slot badge — top left */}
          <div style={{ position: 'absolute', top: 10, left: 10 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
              padding: '3px 9px', borderRadius: 5,
              background: `${accent}28`, color: accent,
              border: `1px solid ${accent}40`,
              backdropFilter: 'blur(4px)',
            }}>
              {title}
            </span>
          </div>

          {/* Mic badge — top right */}
          <div style={{ position: 'absolute', top: 10, right: 10 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
              padding: '3px 9px', borderRadius: 5,
              background: micEnabled ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.18)',
              color: micEnabled ? '#4ade80' : '#f87171',
              border: `1px solid ${micEnabled ? 'rgba(74,222,128,0.32)' : 'rgba(248,113,113,0.28)'}`,
              backdropFilter: 'blur(4px)',
            }}>
              {micEnabled ? '🎤 ON' : '🔇 OFF'}
            </span>
          </div>

          {/* Live dot — bottom right */}
          {isOnline && (
            <div style={{ position: 'absolute', bottom: 8, right: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#4ade80', fontWeight: 700, letterSpacing: '0.06em' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'liveDot 1.5s ease-in-out infinite' }} />
                EN DIRECT
              </span>
            </div>
          )}
        </div>

        {/* Info footer */}
        <div style={{
          padding: '11px 14px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(0,0,0,0.18)',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>{subtitle}</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: isOnline ? '#4ade80' : T.textMuted, fontWeight: 700, letterSpacing: '0.06em' }}>
              {isOnline ? '● EN LIGNE' : '○ HORS LIGNE'}
            </p>
          </div>
          {typeof score === 'number' && (
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: accent, letterSpacing: '-0.03em', lineHeight: 1, display: 'block' }}>{score}</span>
              <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>PTS</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // -- Match scene -------------------------------------------------------
  function MatchScene() {
    const competitorA = participants[0]
    const competitorB = participants[1]
    const moderatorName = isModerator ? `${user?.firstName ?? 'Mod'} ${user?.lastName ?? ''}`.trim() : 'Modérateur'

    const competitorAUserId = onlineUsers.find((e) => e.participantId === competitorA.participantUserId)?.userId
    const competitorBUserId = onlineUsers.find((e) => e.participantId === competitorB.participantUserId)?.userId
    const moderatorUserId   = onlineUsers.find((e) => e.role === 'admin')?.userId

    const isAOnline = onlineParticipantIds.includes(competitorA.participantUserId)
    const isBOnline = onlineParticipantIds.includes(competitorB.participantUserId)
    const isModeratorOnline = stageConnected || isModerator
    const localIdentity = user?.id ?? '__admin__'

    const localStagePartA: StageParticipant | null = competitorAUserId === localIdentity
      ? (stageParticipants.find((p) => p.isLocal) ?? null)
      : (stageParticipants.find((p) => p.identity === competitorAUserId) ?? null)
    const localStagePartB: StageParticipant | null = competitorBUserId === localIdentity
      ? (stageParticipants.find((p) => p.isLocal) ?? null)
      : (stageParticipants.find((p) => p.identity === competitorBUserId) ?? null)
    const localStagePartMod: StageParticipant | null = isModerator
      ? (stageParticipants.find((p) => p.isLocal) ?? null)
      : (stageParticipants.find((p) => p.identity === moderatorUserId) ?? null)

    const fmtTimer = (t: number | null) =>
      t !== null
        ? `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.max(0, t % 60)).padStart(2, '0')}`
        : '--:--'

    return (
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Competitor tiles + VS divider */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'stretch' }}>
          <LiveKitVideoTile
            title="COMPÉTITEUR A" subtitle={competitorA.displayName} score={competitorA.score}
            stagePart={localStagePartA} isLocal={competitorAUserId === localIdentity}
            isOnline={isAOnline} accent={T.accentA}
          />
          {/* VS separator */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 38, gap: 8 }}>
            <div style={{ width: 1, flex: 1, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.09) 50%, transparent)' }} />
            <span style={{
              fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.25)',
              letterSpacing: '0.1em', padding: '6px 5px', lineHeight: 1,
              background: 'rgba(255,255,255,0.04)', borderRadius: 6,
              border: `1px solid ${T.border}`,
            }}>VS</span>
            <div style={{ width: 1, flex: 1, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.09) 50%, transparent)' }} />
          </div>
          <LiveKitVideoTile
            title="COMPÉTITEUR B" subtitle={competitorB.displayName} score={competitorB.score}
            stagePart={localStagePartB} isLocal={competitorBUserId === localIdentity}
            isOnline={isBOnline} accent={T.accentB}
          />
        </div>

        {/* Moderator tile (compact) */}
        <div style={{ maxWidth: 380, margin: '0 auto', width: '100%' }}>
          <LiveKitVideoTile
            title="MODÉRATEUR" subtitle={moderatorName}
            stagePart={localStagePartMod} isLocal={isModerator}
            isOnline={isModeratorOnline} accent={T.accentMod}
          />
        </div>

        {/* Status + timer card */}
        <div style={{
          background: T.cardBg, border: `1px solid ${T.border}`,
          borderRadius: 10, padding: '12px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <p style={{ ...S.label, marginBottom: 5 }}>Question orale</p>
            <p style={{ margin: 0, fontSize: 13, color: T.text, lineHeight: 1.5 }}>{getRoundStatusText()}</p>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <span style={{
              fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1,
              display: 'block', fontVariantNumeric: 'tabular-nums',
              color: timeLeft !== null && timeLeft <= 5 ? '#fca5a5' : T.accentA,
              transition: 'color 0.3s ease',
            }}>
              {fmtTimer(timeLeft)}
            </span>
            <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, letterSpacing: '0.1em' }}>TIMER</span>
          </div>
        </div>

        {/* Round ended banner */}
        {phase === 'live-between' && roundIsClosed && (
          <div style={{ padding: '10px 16px', border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.07)', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#4ade80', letterSpacing: '0.04em' }}>
              ✓ Round terminé — scores mis à jour
            </p>
          </div>
        )}

        {stagePermissionError && (
          <p style={{ textAlign: 'center', fontSize: 12, color: '#f87171', margin: 0 }}>{stagePermissionError}</p>
        )}

        {/* Start button (waiting phase, moderator only) */}
        {phase === 'waiting' && isModerator && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              style={{ padding: '13px 44px', background: T.accentA, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer', letterSpacing: '0.08em', boxShadow: `0 0 28px ${T.accentA}38` }}
              onClick={() => adminFetch(`${ARENA_API}/competitions/${competitionId}/next-round`, 'POST')}
            >
              DÉMARRER LE MATCH
            </button>
          </div>
        )}

        {/* Camera / mic controls */}
        {canControlLocalMedia && (
          <div className="sticky bottom-0 left-0 right-0 p-4 mt-auto bg-[#0c1929] border-t border-gray-800 z-[60] flex gap-4 justify-center shadow-[0_-10px_20px_rgba(0,0,0,0.5)] lg:rounded-t-xl">
            <button onClick={toggleCamera} disabled={isCameraLoading}
              className={`font-bold rounded shadow-md px-6 py-2 ${localCameraEnabled ? 'bg-gray-800 text-white border border-gray-600 hover:bg-gray-700' : 'bg-green-600 text-white hover:bg-green-500'}`}
              style={{ minWidth: 120, opacity: isCameraLoading ? 0.6 : 1 }}
            >
              {isCameraLoading ? 'Chargement…' : localCameraEnabled ? 'Cam OFF' : 'Cam ON'}
            </button>
            <button onClick={toggleMic}
              className={`font-bold rounded shadow-md px-6 py-2 ${localMicEnabled ? 'bg-gray-800 text-white border border-gray-600 hover:bg-gray-700' : 'bg-green-600 text-white hover:bg-green-500'}`}
              style={{ minWidth: 120 }}
            >
              {localMicEnabled ? 'Mic ON' : 'Mic OFF'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // -- KPI strip (compact metrics bar replacing LiveInfoPanel) -----------
  function KpiStrip() {
    const phaseLabel: Record<string, string> = {
      waiting: 'Préparation', 'live-waiting': 'En direct',
      'live-question': 'Question', 'live-between': 'Inter-round',
      paused: 'Pause', finished: 'Terminé', loading: 'Chargement',
    }
    const fmtTimer = (t: number | null) =>
      t !== null
        ? `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.max(0, t % 60)).padStart(2, '0')}`
        : '–:–'
    const chips = [
      { label: 'Spectateurs', value: String(viewerCount) },
      { label: 'Compétiteurs', value: String(competitorOnlineCount) },
      { label: 'Round', value: `${questionNumber}/${totalQuestions || '–'}` },
      { label: 'Timer', value: fmtTimer(timeLeft) },
      { label: 'Statut', value: phaseLabel[phase] ?? phase },
    ]
    return (
      <div style={{
        flexShrink: 0, borderTop: `1px solid ${T.border}`,
        background: T.sidebarBg, padding: '10px 20px',
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch',
      }}>
        {chips.map((c) => (
          <div key={c.label} style={{
            flex: '1 1 0', minWidth: 72,
            background: T.cardBg, border: `1px solid ${T.border}`,
            borderRadius: 8, padding: '7px 12px',
          }}>
            <p style={{ ...S.label, fontSize: 9, marginBottom: 4 }}>{c.label}</p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{c.value}</p>
          </div>
        ))}
        {eventLog.length > 0 && (
          <div style={{ flex: '2 1 160px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {eventLog.slice(0, 2).map((evt) => (
              <span key={evt} style={{ fontSize: 10, color: T.textMuted, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 999, padding: '3px 10px' }}>
                {evt}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  // -- Scoreboard + moderator controls panel ----------------------------
  function ScoreboardPanel() {
    const competitorA = participants[0]
    const competitorB = participants[1]
    const leader = uniqueWinner?.participantUserId ?? null

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <p style={S.label}>Classement live</p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: T.textMuted }}>Score en temps réel</p>
        </div>

        {/* Top-2 competitor rows */}
        <div style={{ flexShrink: 0 }}>
          {[competitorA, competitorB].map((p, index) => {
            const isLeader = p.participantUserId === leader
            const isLocal = user?.id === p.participantUserId
            const accent = index === 0 ? T.accentA : T.accentB
            return (
              <div key={p.participantUserId} style={{
                display: 'flex', alignItems: 'center',
                padding: '12px 16px',
                borderBottom: `1px solid ${T.border}`,
                background: isLeader ? `${accent}08` : 'transparent',
                transition: 'background 0.4s ease',
              }}>
                {/* Rank circle */}
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginRight: 12,
                  background: isLeader ? `${accent}22` : T.cardBg,
                  border: `1px solid ${isLeader ? accent + '45' : T.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: isLeader ? accent : T.textMuted }}>{index + 1}</span>
                </div>
                {/* Name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 10, color: T.textMuted, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase' as const }}>
                    Compétiteur {p.slot}
                    {isLocal && <span style={{ marginLeft: 6, color: T.accentA }}>● VOUS</span>}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.displayName}</p>
                </div>
                {/* Score */}
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                  <span style={{ fontSize: 24, fontWeight: 900, color: accent, letterSpacing: '-0.02em', lineHeight: 1, display: 'block' }}>{p.score}</span>
                  <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, letterSpacing: '0.1em' }}>PTS</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Extended leaderboard rows */}
        {liveLeaderboard.length > 2 && (
          <div style={{ borderTop: `1px solid ${T.border}`, overflowY: 'auto', maxHeight: 150 }}>
            {liveLeaderboard.slice(2).map((row, i) => (
              <div key={row.participantUserId} style={{ display: 'flex', alignItems: 'center', padding: '7px 16px', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, width: 18, textAlign: 'center' }}>{i + 3}</span>
                <span style={{ flex: 1, fontSize: 12, color: T.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.displayName}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.accentA }}>{row.score}</span>
              </div>
            ))}
          </div>
        )}

        {/* Moderator controls (auto-pushed to bottom) */}
        {isModerator && (
          <div style={{ marginTop: 'auto', borderTop: `1px solid ${T.border}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9, background: T.sidebarBg, overflowY: 'auto' }}>
            <p style={{ ...S.label, marginBottom: 2 }}>Contrôles modérateur</p>

            <PublicStreamPanel competitionId={competitionId} accessToken={accessToken} />

            {(!isLive || phase === 'live-waiting') && (
              <button
                style={{ width: '100%', padding: '12px 0', borderRadius: 8, background: T.accentA, color: '#fff', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', letterSpacing: '0.07em', boxShadow: `0 0 18px ${T.accentA}30` }}
                onClick={() => adminFetch(`${ARENA_API}/competitions/${competitionId}/next-round`, 'POST')}
              >
                {!isLive ? 'DÉMARRER LE MATCH' : `DÉMARRER ROUND ${questionNumber + 1}`}
              </button>
            )}

            {isLive && phase === 'live-question' && liveState?.currentRound && (
              <button
                style={{ width: '100%', padding: '12px 0', borderRadius: 8, background: T.accentB, color: '#fff', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', letterSpacing: '0.07em' }}
                onClick={() => adminFetch(`${ARENA_API}/rounds/${liveState.currentRound!.id}/end`)}
              >
                FIN DU ROUND
              </button>
            )}

            {isLive && phase === 'live-between' && questionNumber < totalQuestions && (
              <button
                style={{ width: '100%', padding: '12px 0', borderRadius: 8, background: T.gold, color: '#1a1000', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', letterSpacing: '0.07em' }}
                onClick={() => adminFetch(`${ARENA_API}/competitions/${competitionId}/next-round`, 'POST')}
              >
                ROUND {questionNumber + 1} →
              </button>
            )}

            {isLive && phase === 'live-between' && liveState?.currentRound && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 2 }}>
                <button
                  style={{ padding: '10px 0', borderRadius: 8, background: `${T.accentA}1a`, color: T.accentA, border: `1px solid ${T.accentA}40`, fontWeight: 700, fontSize: 11, cursor: 'pointer', letterSpacing: '0.05em' }}
                  onClick={() => adminFetch(`${ARENA_API}/rounds/${liveState.currentRound!.id}/score`, 'PATCH', { result: 'A' })}
                >
                  A CORRECT
                </button>
                <button
                  style={{ padding: '10px 0', borderRadius: 8, background: `${T.accentB}1a`, color: T.accentB, border: `1px solid ${T.accentB}40`, fontWeight: 700, fontSize: 11, cursor: 'pointer', letterSpacing: '0.05em' }}
                  onClick={() => adminFetch(`${ARENA_API}/rounds/${liveState.currentRound!.id}/score`, 'PATCH', { result: 'B' })}
                >
                  B CORRECT
                </button>
                <button
                  style={{ padding: '10px 0', borderRadius: 8, background: 'rgba(167,139,250,0.12)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.3)', fontWeight: 700, fontSize: 11, cursor: 'pointer', letterSpacing: '0.05em' }}
                  onClick={() => adminFetch(`${ARENA_API}/rounds/${liveState.currentRound!.id}/score`, 'PATCH', { result: 'BOTH' })}
                >
                  LES DEUX
                </button>
                <button
                  style={{ padding: '10px 0', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: T.textMuted, border: `1px solid ${T.border}`, fontWeight: 700, fontSize: 11, cursor: 'pointer', letterSpacing: '0.05em' }}
                  onClick={() => adminFetch(`${ARENA_API}/rounds/${liveState.currentRound!.id}/score`, 'PATCH', { result: 'NONE' })}
                >
                  AUCUN
                </button>
              </div>
            )}

            <button
              style={{ width: '100%', padding: '9px 0', marginTop: 4, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 700, fontSize: 11, cursor: 'pointer', letterSpacing: '0.07em' }}
              disabled={!uniqueWinner}
              onClick={async () => {
                if (!uniqueWinner) {
                  alert('Impossible de terminer le match: il y a une égalité en tête. Départagez les scores avant de clôturer.')
                  return
                }
                await adminFetch(`${ARENA_API}/competitions/${competitionId}/complete`, 'PATCH', { participantUserId: uniqueWinner.participantUserId })
              }}
            >
              TERMINER LE MATCH
            </button>
            {!uniqueWinner && (
              <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: '#fca5a5' }}>
                Égalité en tête: ajustez les scores avant de terminer le match.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  // -- Premium header bar -----------------------------------------------
  const topBar = (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 62, flexShrink: 0, gap: 12, color: '#fff',
      background: 'linear-gradient(135deg, #07101e 0%, #0d1f3c 100%)',
      borderBottom: `1px solid ${T.border}`,
      boxShadow: '0 2px 24px rgba(0,0,0,0.5)',
      zIndex: 50, position: 'relative',
    }}>
      {/* Left: back + branding + match name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <button
          onClick={() => navigate('/arena')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 20, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
          title="Retour à l'Arena"
        >←</button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, flexShrink: 0 }}>
          <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: '0.02em', color: '#fff' }}>KONESANS</span>
          <span style={{ fontWeight: 900, fontSize: 14, color: T.gold }}>+</span>
          <span style={{ fontSize: 12, color: T.textMuted, marginLeft: 5, fontWeight: 600, letterSpacing: '0.06em' }}>ARENA</span>
        </div>
        <div style={{ width: 1, height: 18, background: T.border, flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
          {liveState?.competitionName ?? 'Match Arena Live'}
        </p>
      </div>

      {/* Center: status pills + timer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {isLive && totalQuestions > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)', border: `1px solid ${T.border}` }}>
            ROUND {questionNumber}/{totalQuestions}
          </span>
        )}
        {!connected && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: T.textMuted, border: `1px solid ${T.border}` }}>
            CONNEXION…
          </span>
        )}
        {isPaused && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 12px', borderRadius: 6, background: 'rgba(245,158,11,0.16)', color: T.gold, border: '1px solid rgba(245,158,11,0.35)' }}>
            ⏸ PAUSE
          </span>
        )}
        {connected && !isPaused && isLive && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 12px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.28)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'liveDot 1.5s ease-in-out infinite' }} />
            LIVE
          </span>
        )}
        {timeLeft !== null && !roundIsClosed && liveState?.currentRound && (
          <div style={timeLeft <= 5 ? S.timerCritical : S.timerNormal}>
            {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(Math.max(0, timeLeft % 60)).padStart(2, '0')}
          </div>
        )}
      </div>

      {/* Right: viewer count + admin quick controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)', border: `1px solid ${T.border}` }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
          {viewerCount}
        </span>
        {isModerator && isLive && (
          <>
            <button
              onClick={() => adminFetch(`${ARENA_API}/competitions/${competitionId}/${isPaused ? 'resume' : 'pause'}`)}
              style={{ background: isPaused ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.07)', border: `1px solid ${isPaused ? 'rgba(245,158,11,0.4)' : T.border}`, color: isPaused ? T.gold : 'rgba(255,255,255,0.75)', borderRadius: 6, padding: '5px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.07em' }}
            >
              {isPaused ? 'REPRENDRE' : 'PAUSE'}
            </button>
            {phase === 'live-question' && liveState?.currentRound && (
              <button
                onClick={() => adminFetch(`${ARENA_API}/rounds/${liveState.currentRound!.id}/end`)}
                style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: 6, padding: '5px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.07em' }}
              >
                CLÔTURER
              </button>
            )}
            {phase === 'live-between' && questionNumber < totalQuestions && (
              <button
                onClick={() => adminFetch(`${ARENA_API}/competitions/${competitionId}/next-round`, 'POST')}
                style={{ background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.4)', color: T.gold, borderRadius: 6, padding: '5px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.07em' }}
              >
                ROUND {questionNumber + 1}
              </button>
            )}
            {phase === 'live-between' && questionNumber === totalQuestions && (
              <button
                onClick={async () => {
                  if (!uniqueWinner) {
                    alert('Impossible de terminer le match: il y a une égalité en tête. Départagez les scores avant de clôturer.')
                    return
                  }
                  if (!confirm(`Déclarer "${uniqueWinner.displayName}" vainqueur et terminer ?`)) return
                  await adminFetch(`${ARENA_API}/competitions/${competitionId}/complete`, 'PATCH', { participantUserId: uniqueWinner.participantUserId })
                }}
                style={{ background: 'rgba(245,158,11,0.25)', border: '1px solid rgba(245,158,11,0.5)', color: T.gold, borderRadius: 6, padding: '5px 14px', fontSize: 11, fontWeight: 700, cursor: uniqueWinner ? 'pointer' : 'not-allowed', opacity: uniqueWinner ? 1 : 0.55 }}
                disabled={!uniqueWinner}
              >
                TERMINER
              </button>
            )}
          </>
        )}
      </div>
    </header>
  )

  // -- Alert strip -------------------------------------------------------
  const alertStrip = (
    <>
      {error && (
        <div style={{ padding: '8px 20px', background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.28)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: '#f87171', fontWeight: 600 }}>{error}</span>
        </div>
      )}
      {isPaused && (
        <div style={{ padding: '8px 20px', background: 'rgba(245,158,11,0.09)', borderBottom: '1px solid rgba(245,158,11,0.28)', flexShrink: 0, textAlign: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.gold, letterSpacing: '0.06em' }}>
            ⏸ SESSION EN PAUSE — reprise imminente
          </span>
        </div>
      )}
    </>
  )

  // -- Main layout -------------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: T.bg, overflow: 'hidden' }}>
      {topBar}
      {alertStrip}

      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[1fr_300px] overflow-y-auto lg:overflow-hidden">
        {/* Left: stage + KPI strip */}
        <div className="flex flex-col lg:overflow-y-auto">
          <div style={{ flex: 1 }}>
            <MatchScene />
          </div>
          <KpiStrip />
        </div>

        {/* Right: scoreboard */}
        <div style={{ borderLeft: `1px solid ${T.border}`, background: T.sidebarBg }} className="flex flex-col lg:overflow-y-auto">
          <ScoreboardPanel />
        </div>
      </div>

      {/* Global keyframe animations */}
      <style>{`
        @keyframes spin       { to { transform: rotate(360deg); } }
        @keyframes liveDot    { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.35; transform:scale(0.65); } }
        @keyframes timerPulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
        @keyframes scoreFlash { 0% { transform:scale(1); } 50% { transform:scale(1.15); } 100% { transform:scale(1); } }
      `}</style>
    </div>
  )
}

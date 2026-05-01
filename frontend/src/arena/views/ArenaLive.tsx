import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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

type LiveQuestion = {
  id: string
  position: number
  questionId: string | null
  startedAt: string | null
  endedAt: string | null
  endTime: string | null
}

type LiveStateSnapshot = {
  competitionId: string
  competitionName: string
  status: string
  type?: string
  secondsPerQuestion: number
  currentRoundNumber: number
  currentQuestionNumber?: number
  totalRounds: number
  totalQuestions?: number
  currentRound: LiveQuestion | null
  currentQuestion?: LiveQuestion | null
  leaderboard: ArenaLeaderboardRow[]
  participants?: Array<{ userId: string; displayName: string; slot: 'A' | 'B' }>
  matchParticipants?: Array<{ userId: string; displayName: string; role: 'competitorA' | 'competitorB' | 'moderator' }>
}

type PhaseTone = 'neutral' | 'live' | 'alert' | 'success'

// -- Design tokens -------------------------------------------------------
const T = {
  bg: '#06101c',
  bgRaised: '#0b1626',
  cardBg: '#0d1b2e',
  cardBgSoft: '#102038',
  border: 'rgba(148,163,184,0.16)',
  borderBright: 'rgba(148,163,184,0.28)',
  text: '#f8fafc',
  textMuted: 'rgba(203,213,225,0.72)',
  textSubtle: 'rgba(148,163,184,0.92)',
  accentA: '#5da0ff',
  accentB: '#ff6b7a',
  accentMod: '#f8b84e',
  accentLive: '#2ed3b7',
  success: '#34d399',
  danger: '#fb7185',
  gold: '#f8b84e',
}

const S = {
  label: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: T.textSubtle,
    margin: 0,
  } as CSSProperties,
  card: {
    background: `linear-gradient(180deg, ${T.cardBgSoft} 0%, ${T.cardBg} 100%)`,
    border: `1px solid ${T.border}`,
    borderRadius: 22,
    boxShadow: '0 24px 70px rgba(2, 8, 23, 0.38)',
  } as CSSProperties,
  timerNormal: {
    background: 'rgba(93,160,255,0.14)',
    border: '1px solid rgba(93,160,255,0.28)',
    borderRadius: 999,
    padding: '8px 18px',
    fontWeight: 900,
    fontSize: 24,
    minWidth: 92,
    textAlign: 'center' as const,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.04em',
    color: '#cfe1ff',
  } as CSSProperties,
  timerCritical: {
    background: 'rgba(251,113,133,0.18)',
    border: '1px solid rgba(251,113,133,0.44)',
    borderRadius: 999,
    padding: '8px 18px',
    fontWeight: 900,
    fontSize: 24,
    minWidth: 92,
    textAlign: 'center' as const,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.04em',
    color: '#fecdd3',
    animation: 'timerPulse 0.65s ease-in-out infinite',
  } as CSSProperties,
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
  currentQuestion: { endedAt: string | null } | null | undefined
  roundEnded: unknown
  competitionResult: unknown
}): CompetitionPhase {
  if (!opts.teamLoaded) return 'loading'
  if (opts.competitionStatus === 'completed' || opts.competitionResult) return 'finished'
  if (opts.competitionResult) return 'finished'
  if (opts.isPaused) return 'paused'
  if (opts.competitionStatus !== 'live') return 'waiting'
  if (opts.currentQuestion?.endedAt) return 'live-between'
  if (opts.roundEnded) return 'live-between'
  if (opts.currentQuestion) return 'live-question'
  return 'live-waiting'
}

function formatTimer(seconds: number | null) {
  if (seconds === null) return '--:--'
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.max(0, seconds % 60)).padStart(2, '0')}`
}

function phaseMeta(phase: CompetitionPhase): { label: string; description: string; tone: PhaseTone } {
  switch (phase) {
    case 'waiting':
      return { label: 'Prêt à lancer', description: 'Le direct attend l ouverture de la première question.', tone: 'neutral' }
    case 'live-waiting':
      return { label: 'En attente', description: 'Le plateau est en direct. Le modérateur peut ouvrir la prochaine question.', tone: 'live' }
    case 'live-question':
      return { label: 'Question active', description: 'Les compétiteurs répondent pendant que le chrono tourne.', tone: 'live' }
    case 'live-between':
      return { label: 'Décision modérateur', description: 'La question est clôturée. Attribuez le point puis ouvrez la suivante.', tone: 'success' }
    case 'paused':
      return { label: 'En pause', description: 'Le match est suspendu. Reprenez quand le plateau est prêt.', tone: 'alert' }
    case 'finished':
      return { label: 'Terminé', description: 'Le direct est terminé.', tone: 'success' }
    default:
      return { label: 'Connexion', description: 'Préparation de la régie Arena.', tone: 'neutral' }
  }
}

function toneColor(tone: PhaseTone) {
  switch (tone) {
    case 'live':
      return T.accentLive
    case 'alert':
      return T.gold
    case 'success':
      return T.success
    default:
      return T.accentA
  }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 18, padding: '14px 16px', background: 'rgba(255,255,255,0.03)' }}>
        <p style={S.label}>Diffusion publique</p>
        {isYoutube ? (
          <>
            <p style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 800, color: T.text }}>
              YouTube Live {stream?.status === 'live' ? 'actif' : stream?.status === 'stopped' ? 'terminé' : 'prêt'}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.55, color: T.textMuted }}>
              Les spectateurs regardent la page publique Arena pendant que la scène privée reste réservée au modérateur et aux deux compétiteurs.
            </p>
          </>
        ) : (
          <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.55, color: T.textMuted }}>
            Configurez d abord le lien YouTube dans l espace admin pour ouvrir la diffusion publique aux spectateurs.
          </p>
        )}
      </div>

      {isYoutube && (
        <>
          <button
            style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(52,211,153,0.35)', background: 'rgba(52,211,153,0.12)', color: '#6ee7b7', fontWeight: 800, fontSize: 12, cursor: 'pointer', letterSpacing: '0.08em', opacity: statusRequest === 'live' ? 0.6 : 1 }}
            disabled={statusRequest !== null}
            onClick={() => updateStatus('live')}
          >
            {statusRequest === 'live' ? 'OUVERTURE…' : 'OUVRIR AU PUBLIC'}
          </button>
          <button
            style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(251,113,133,0.12)', color: '#fda4af', fontWeight: 800, fontSize: 12, cursor: 'pointer', letterSpacing: '0.08em', opacity: statusRequest === 'stopped' ? 0.6 : 1 }}
            disabled={statusRequest !== null}
            onClick={() => updateStatus('stopped')}
          >
            {statusRequest === 'stopped' ? 'FERMETURE…' : 'FERMER CÔTÉ PUBLIC'}
          </button>
          <a
            href={`/arena/watch/${competitionId}`}
            target="_blank"
            rel="noreferrer"
            style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: `1px solid ${T.borderBright}`, background: 'transparent', color: T.text, fontWeight: 800, fontSize: 12, letterSpacing: '0.08em', textAlign: 'center', textDecoration: 'none' }}
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
  const [polledState, setPolledState] = useState<LiveStateSnapshot | null>(null)
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

  const { socketState, submitAnswer } = useArenaSocket(socketParams)
  const {
    connected, state, leaderboard, roundEnded, competitionResult, error,
    isPaused, onlineParticipantIds, onlineUsers, viewerCount, submissionStatuses,
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
  const currentQuestion = liveState?.currentQuestion ?? liveState?.currentRound ?? null
  const currentQuestionStartedAt = currentQuestion?.startedAt ?? null
  const currentQuestionEndTime = currentQuestion?.endTime ?? null
  const secondsPerQuestion = liveState?.secondsPerQuestion ?? 30
  const questionIsClosed = Boolean(roundEnded || currentQuestion?.endedAt)

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

  const submissionOrder = useMemo(() => {
    return participants
      .map((participant) => ({
        participant,
        submission: submissionStatuses[participant.participantUserId] ?? null,
      }))
      .filter((entry) => entry.submission?.submitted)
      .sort((left, right) => {
        const leftAt = left.submission?.at ? new Date(left.submission.at).getTime() : Number.MAX_SAFE_INTEGER
        const rightAt = right.submission?.at ? new Date(right.submission.at).getTime() : Number.MAX_SAFE_INTEGER
        return leftAt - rightAt
      })
  }, [participants, submissionStatuses])

  useEffect(() => {
    const next = currentQuestion
      ? `Question ${currentQuestion.position}/${liveState?.totalQuestions ?? liveState?.totalRounds ?? 0} ouverte`
      : null
    if (!next) return
    setEventLog((prev) => {
      if (prev[0] === next) return prev
      return [next, ...prev].slice(0, 5)
    })
  }, [currentQuestion, liveState?.totalQuestions, liveState?.totalRounds])

  useEffect(() => {
    if (!roundEnded) return
    setEventLog((prev) => ['Question clôturée - attribution des points disponible', ...prev].slice(0, 5))
  }, [roundEnded])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!currentQuestion || questionIsClosed) return
    const computeRemaining = () => {
      if (currentQuestionEndTime) {
        return Math.max(0, Math.round((new Date(currentQuestionEndTime).getTime() - Date.now()) / 1000))
      }
      const started = currentQuestionStartedAt ? new Date(currentQuestionStartedAt).getTime() : Date.now()
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
  }, [currentQuestion, currentQuestionEndTime, currentQuestionStartedAt, questionIsClosed, secondsPerQuestion])

  useEffect(() => {
    if (!competitionId || !accessToken || userMode === 'spectator' || !canControlLocalMedia) return
    arenaApi.getRtcToken(competitionId, accessToken)
      .then((data) => { setRtcUrl(data.url); setRtcToken(data.token) })
      .catch(() => { /* token fetch failed à stage will be audio-only */ })
  }, [competitionId, accessToken, userMode, canControlLocalMedia])

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

  const isLive = liveState?.status === 'live'
  const phase = getPhase({
    teamLoaded, competitionStatus: liveState?.status, isPaused,
    currentQuestion, roundEnded, competitionResult,
  })
  const questionNumber = liveState?.currentQuestionNumber ?? liveState?.currentRoundNumber ?? 0
  const totalQuestions = liveState?.totalQuestions ?? liveState?.totalRounds ?? 0
  const leadingScore = participants.length > 0 ? Math.max(...participants.map((participant) => participant.score)) : null
  const leadingParticipants = leadingScore === null
    ? []
    : participants.filter((participant) => participant.score === leadingScore)
  const uniqueWinner = leadingParticipants.length === 1 ? leadingParticipants[0] : null
  const progressRatio = totalQuestions > 0 ? Math.min(questionNumber / totalQuestions, 1) : 0
  const currentPhaseMeta = phaseMeta(phase)
  const currentTone = toneColor(currentPhaseMeta.tone)
  const isOralQuestion = currentQuestion?.questionId == null
  const mySubmission = user?.id ? submissionStatuses[user.id] ?? null : null
  const canSignalAnswer =
    userMode === 'competitor' &&
    Boolean(currentQuestion) &&
    isOralQuestion &&
    phase === 'live-question' &&
    !questionIsClosed &&
    !mySubmission?.submitted
  const signalButtonLabel = mySubmission?.submitted ? 'Prise de parole signalée' : 'Je prends la parole'

  if (phase === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: `radial-gradient(circle at top, rgba(93,160,255,0.12), transparent 38%), ${T.bg}` }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, border: `3px solid ${T.border}`, borderTopColor: T.accentA, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: T.textMuted, fontSize: 12, margin: 0, letterSpacing: '0.12em', fontWeight: 800 }}>CONNEXION À LA RÉGIE…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (phase === 'finished') {
    const podium = competitionResult?.podium ?? liveLeaderboard.slice(0, 3)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: `radial-gradient(circle at top, rgba(248,184,78,0.16), transparent 40%), ${T.bg}`, padding: 24, textAlign: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: T.textSubtle, textTransform: 'uppercase', marginBottom: 10, display: 'block' }}>Arena Live</span>
        <h1 style={{ fontSize: 40, fontWeight: 900, color: T.gold, margin: '0 0 8px', letterSpacing: '-0.03em' }}>Match terminé</h1>
        {podium[0] && (
          <p style={{ fontSize: 16, color: T.text, fontWeight: 700, marginBottom: 36 }}>
            Vainqueur · <span style={{ color: T.gold }}>{podium[0].displayName}</span>
          </p>
        )}
        <div style={{ width: '100%', maxWidth: 500, marginBottom: 36 }}>
          {podium.slice(0, 3).map((row: ArenaLeaderboardRow, i: number) => (
            <div key={row.participantUserId} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 22px', marginBottom: 10,
              background: i === 0 ? 'rgba(248,184,78,0.12)' : T.cardBg,
              borderRadius: 18,
              border: `1px solid ${i === 0 ? 'rgba(248,184,78,0.35)' : T.border}`,
              boxShadow: i === 0 ? '0 0 28px rgba(248,184,78,0.14)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 22, color: i === 0 ? T.gold : T.textMuted }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{row.displayName}</span>
              </div>
              <span style={{ fontWeight: 900, color: i === 0 ? T.gold : T.accentA, fontSize: 20 }}>{row.score}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate('/arena')}
          style={{ padding: '14px 38px', background: T.accentA, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 900, fontSize: 14, cursor: 'pointer', letterSpacing: '0.08em', boxShadow: `0 0 24px ${T.accentA}45` }}
        >
          RETOUR À L'ARENA
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  function getQuestionStatusText() {
    if (phase === 'waiting') return 'En attente du modérateur pour lancer le match.'
    if (phase === 'live-waiting') return 'En direct · En attente de la prochaine question.'
    if (phase === 'paused') return 'Le modérateur a mis le match en pause.'
    if (phase === 'live-question') return 'Question en cours · Répondez oralement.'
    if (phase === 'live-between') return 'Question terminée · Le modérateur attribue le point.'
    return 'Match en cours.'
  }

  function LiveKitVideoTile({
    title, subtitle, score, stagePart, isLocal, isOnline, accent, activityLabel,
  }: {
    title: string; subtitle: string; score?: number
    stagePart: StageParticipant | null; isLocal: boolean; isOnline: boolean; accent: string
    activityLabel?: string | null
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
        borderRadius: 22,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: isOnline
          ? `0 0 0 1px ${accent}35, 0 16px 46px ${accent}14`
          : '0 4px 20px rgba(0,0,0,0.35)',
        transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
      }}>
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

          <div style={{ position: 'absolute', top: 10, right: 10 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
              padding: '3px 9px', borderRadius: 5,
              background: micEnabled ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.18)',
              color: micEnabled ? '#4ade80' : '#f87171',
              border: `1px solid ${micEnabled ? 'rgba(74,222,128,0.32)' : 'rgba(248,113,113,0.28)'}`,
              backdropFilter: 'blur(4px)',
            }}>
              {micEnabled ? 'MIC ACTIF' : 'MIC COUPÉ'}
            </span>
          </div>

          {activityLabel && (
            <div style={{ position: 'absolute', left: 10, bottom: 10 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10,
                color: '#d1fae5',
                fontWeight: 800,
                letterSpacing: '0.06em',
                padding: '4px 10px',
                borderRadius: 999,
                background: 'rgba(52,211,153,0.18)',
                border: '1px solid rgba(52,211,153,0.28)',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                {activityLabel}
              </span>
            </div>
          )}

          {isOnline && (
            <div style={{ position: 'absolute', bottom: 8, right: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#4ade80', fontWeight: 700, letterSpacing: '0.06em' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'liveDot 1.5s ease-in-out infinite' }} />
                EN DIRECT
              </span>
            </div>
          )}
        </div>

        <div style={{
          padding: '14px 16px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(0,0,0,0.18)',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>{subtitle}</p>
            <p style={{ margin: '4px 0 0', fontSize: 10, color: isOnline ? '#4ade80' : T.textMuted, fontWeight: 700, letterSpacing: '0.08em' }}>
              {isOnline ? 'EN LIGNE' : 'HORS LIGNE'}
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

  function MatchScene() {
    const competitorA = participants[0]
    const competitorB = participants[1]
    const moderatorName = isModerator ? `${user?.firstName ?? 'Mod'} ${user?.lastName ?? ''}`.trim() : 'Modérateur'

    const competitorAUserId = onlineUsers.find((e) => e.participantId === competitorA.participantUserId)?.userId
    const competitorBUserId = onlineUsers.find((e) => e.participantId === competitorB.participantUserId)?.userId
    const moderatorUserId = onlineUsers.find((e) => e.role === 'admin' || e.role === 'moderator')?.userId

    const isAOnline = onlineParticipantIds.includes(competitorA.participantUserId)
    const isBOnline = onlineParticipantIds.includes(competitorB.participantUserId)
    const isModeratorOnline = stageConnected || onlineUsers.some((entry) => entry.role === 'admin' || entry.role === 'moderator') || isModerator
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

    const submissionLabelA = submissionStatuses[competitorA.participantUserId]?.submitted ? 'Prêt à répondre' : null
    const submissionLabelB = submissionStatuses[competitorB.participantUserId]?.submitted ? 'Prêt à répondre' : null
    const moderatorLabel = phase === 'live-question' ? 'Pilote la question' : phase === 'paused' ? 'Session en pause' : null

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <section style={{ ...S.card, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <p style={S.label}>Plateau live</p>
              <h2 style={{ margin: '8px 0 0', fontSize: 28, lineHeight: 1, color: T.text, letterSpacing: '-0.03em' }}>Face-à-face oral</h2>
              <p style={{ margin: '10px 0 0', fontSize: 14, color: T.textMuted, maxWidth: 620, lineHeight: 1.55 }}>
                Une scène pensée pour le modérateur: état des compétiteurs, ordre de prise de parole et contrôle de chaque question en temps réel.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ padding: '10px 14px', borderRadius: 16, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.03)' }}>
                <p style={{ ...S.label, marginBottom: 6 }}>Question active</p>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 900, color: T.text, lineHeight: 1 }}>{questionNumber || 0}<span style={{ color: T.textSubtle }}>/{totalQuestions || 0}</span></p>
              </div>
              <div style={timeLeft !== null && timeLeft <= 5 ? S.timerCritical : S.timerNormal}>{formatTimer(timeLeft)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)]" style={{ gap: 16, alignItems: 'stretch' }}>
          <LiveKitVideoTile
            title="COMPÉTITEUR A" subtitle={competitorA.displayName} score={competitorA.score}
            stagePart={localStagePartA} isLocal={competitorAUserId === localIdentity}
            isOnline={isAOnline} accent={T.accentA}
            activityLabel={submissionLabelA}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{ width: 1, flex: 1, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.09) 50%, transparent)' }} />
            <span style={{
              fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.12em', padding: '8px 8px', lineHeight: 1,
              background: 'rgba(255,255,255,0.04)', borderRadius: 999,
              border: `1px solid ${T.border}`,
            }}>VS</span>
            <div style={{ width: 1, flex: 1, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.09) 50%, transparent)' }} />
          </div>
          <LiveKitVideoTile
            title="COMPÉTITEUR B" subtitle={competitorB.displayName} score={competitorB.score}
            stagePart={localStagePartB} isLocal={competitorBUserId === localIdentity}
            isOnline={isBOnline} accent={T.accentB}
            activityLabel={submissionLabelB}
          />
        </div>

          <div style={{ maxWidth: 460, margin: '18px auto 0', width: '100%' }}>
          <LiveKitVideoTile
            title="MODÉRATEUR" subtitle={moderatorName}
            stagePart={localStagePartMod} isLocal={isModerator}
            isOnline={isModeratorOnline} accent={T.accentMod}
            activityLabel={moderatorLabel}
          />
        </div>

          <div style={{
            marginTop: 18,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`,
            borderRadius: 18, padding: '16px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          }}>
          <div>
            <p style={{ ...S.label, marginBottom: 8 }}>Statut de la question</p>
            <p style={{ margin: 0, fontSize: 15, color: T.text, lineHeight: 1.5, fontWeight: 700 }}>{getQuestionStatusText()}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: currentTone, padding: '8px 12px', borderRadius: 999, background: `${currentTone}20`, border: `1px solid ${currentTone}40`, letterSpacing: '0.08em' }}>{currentPhaseMeta.label}</span>
            <span style={{ fontSize: 12, color: T.textMuted }}>Chrono {formatTimer(timeLeft)}</span>
          </div>
        </div>

          {phase === 'live-between' && questionIsClosed && (
            <div style={{ marginTop: 16, padding: '12px 16px', border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.07)', borderRadius: 18 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#6ee7b7', letterSpacing: '0.04em' }}>
                Question clôturée. Le modérateur peut maintenant attribuer le point.
              </p>
            </div>
          )}

          {stagePermissionError && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#fda4af', margin: '16px 0 0' }}>{stagePermissionError}</p>
          )}
        </section>

        <section style={{ ...S.card, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <p style={S.label}>Commandes locales</p>
              <p style={{ margin: '8px 0 0', fontSize: 14, color: T.textMuted, lineHeight: 1.55 }}>
                Caméra, micro et signal de prise de parole sont accessibles depuis cette barre de contrôle.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {canControlLocalMedia && (
                <>
                  <button
                    onClick={toggleCamera}
                    disabled={isCameraLoading}
                    style={{
                      minWidth: 150,
                      padding: '13px 18px',
                      borderRadius: 999,
                      border: `1px solid ${localCameraEnabled ? T.borderBright : 'rgba(52,211,153,0.35)'}`,
                      background: localCameraEnabled ? 'rgba(255,255,255,0.04)' : 'rgba(52,211,153,0.14)',
                      color: localCameraEnabled ? T.text : '#d1fae5',
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: 'pointer',
                      opacity: isCameraLoading ? 0.6 : 1,
                    }}
                  >
                    {isCameraLoading ? 'Chargement…' : localCameraEnabled ? 'Couper la caméra' : 'Activer la caméra'}
                  </button>
                  <button
                    onClick={toggleMic}
                    style={{
                      minWidth: 150,
                      padding: '13px 18px',
                      borderRadius: 999,
                      border: `1px solid ${localMicEnabled ? T.borderBright : 'rgba(52,211,153,0.35)'}`,
                      background: localMicEnabled ? 'rgba(255,255,255,0.04)' : 'rgba(52,211,153,0.14)',
                      color: localMicEnabled ? T.text : '#d1fae5',
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    {localMicEnabled ? 'Couper le micro' : 'Activer le micro'}
                  </button>
                </>
              )}

              {userMode === 'competitor' && (
                <button
                  onClick={() => {
                    if (!currentQuestion || !user?.id) return
                    submitAnswer(currentQuestion.id, user.id)
                  }}
                  disabled={!canSignalAnswer}
                  style={{
                    minWidth: 190,
                    padding: '13px 18px',
                    borderRadius: 999,
                    border: `1px solid ${canSignalAnswer ? 'rgba(248,184,78,0.4)' : T.border}`,
                    background: mySubmission?.submitted ? 'rgba(52,211,153,0.14)' : canSignalAnswer ? 'rgba(248,184,78,0.16)' : 'rgba(255,255,255,0.04)',
                    color: mySubmission?.submitted ? '#d1fae5' : canSignalAnswer ? '#fde68a' : T.textSubtle,
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: canSignalAnswer ? 'pointer' : 'not-allowed',
                    opacity: canSignalAnswer || mySubmission?.submitted ? 1 : 0.65,
                  }}
                >
                  {signalButtonLabel}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    )
  }

  function InsightStrip() {
    const chips = [
      { label: 'Spectateurs', value: String(viewerCount) },
      { label: 'Compétiteurs en ligne', value: String(competitorOnlineCount) },
      { label: 'Progression', value: `${questionNumber}/${totalQuestions || '–'}` },
      { label: 'Chrono', value: formatTimer(timeLeft) },
      { label: 'Statut', value: currentPhaseMeta.label },
    ]

    return (
      <section style={{ ...S.card, padding: 18 }}>
        <div className="grid grid-cols-2 xl:grid-cols-5" style={{ gap: 12 }}>
          {chips.map((chip) => (
            <div key={chip.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
              <p style={{ ...S.label, marginBottom: 8 }}>{chip.label}</p>
              <p style={{ margin: 0, fontSize: 22, lineHeight: 1, fontWeight: 900, color: T.text, letterSpacing: '-0.03em' }}>{chip.value}</p>
            </div>
          ))}
        </div>

        {eventLog.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {eventLog.map((evt) => (
              <span key={evt} style={{ padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, color: T.textMuted, fontSize: 11, fontWeight: 700 }}>
                {evt}
              </span>
            ))}
          </div>
        )}
      </section>
    )
  }

  function CommandCenter() {
    const nextQuestionNumber = Math.min(questionNumber + 1, totalQuestions)
    const canOpenFirstQuestion = phase === 'waiting'
    const canOpenNextQuestion = isLive && (phase === 'live-waiting' || phase === 'live-between') && questionNumber < totalQuestions
    const canCloseQuestion = isLive && phase === 'live-question' && !!currentQuestion
    const canScoreQuestion = isLive && phase === 'live-between' && !!currentQuestion

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <section style={{ ...S.card, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <p style={S.label}>Régie du direct</p>
              <h2 style={{ margin: '8px 0 0', fontSize: 24, lineHeight: 1.05, color: T.text, letterSpacing: '-0.03em' }}>{currentPhaseMeta.label}</h2>
              <p style={{ margin: '10px 0 0', fontSize: 13, color: T.textMuted, lineHeight: 1.6 }}>{currentPhaseMeta.description}</p>
            </div>
            <div style={{ minWidth: 118 }}>
              <p style={{ ...S.label, marginBottom: 8 }}>Question</p>
              <p style={{ margin: 0, fontSize: 30, fontWeight: 900, color: currentTone, lineHeight: 1 }}>{questionNumber || 0}<span style={{ color: T.textSubtle }}>/ {totalQuestions || 0}</span></p>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', border: `1px solid ${T.border}` }}>
              <div style={{ width: `${Math.max(progressRatio * 100, phase === 'waiting' ? 4 : 0)}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${T.accentLive}, ${T.accentA})`, transition: 'width 0.35s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: T.textMuted }}>Chrono actif: {formatTimer(timeLeft)}</span>
              <span style={{ fontSize: 12, color: T.textMuted }}>{getQuestionStatusText()}</span>
            </div>
          </div>
        </section>

        <section style={{ ...S.card, padding: 22 }}>
          <p style={S.label}>Prises de parole</p>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {participants.map((participant) => {
              const submission = submissionStatuses[participant.participantUserId] ?? null
              const isSubmitted = Boolean(submission?.submitted)
              const accent = participant.slot === 'A' ? T.accentA : T.accentB
              return (
                <div key={participant.participantUserId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: `1px solid ${isSubmitted ? accent + '55' : T.border}` }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.textSubtle, letterSpacing: '0.08em' }}>COMPÉTITEUR {participant.slot}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 800, color: T.text }}>{participant.displayName}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: isSubmitted ? accent : T.textMuted }}>
                      {isSubmitted ? 'Signal reçu' : 'En attente'}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: T.textSubtle }}>
                      {isSubmitted && submission?.at ? new Date(submission.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Aucune prise de parole'}
                    </p>
                  </div>
                </div>
              )
            })}

            {submissionOrder.length > 0 && (
              <div style={{ marginTop: 4, padding: '12px 14px', borderRadius: 16, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)' }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#9ae6b4', letterSpacing: '0.08em' }}>ORDRE D ARRIVÉE</p>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: T.text, lineHeight: 1.55 }}>
                  {submissionOrder.map((entry, index) => `${index + 1}. ${entry.participant.displayName}`).join('  ·  ')}
                </p>
              </div>
            )}
          </div>
        </section>

        {isModerator && (
          <section style={{ ...S.card, padding: 22 }}>
            <p style={S.label}>Commandes modérateur</p>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(canOpenFirstQuestion || canOpenNextQuestion) && (
                <button
                  style={{ width: '100%', padding: '14px 18px', borderRadius: 16, background: `linear-gradient(135deg, ${T.accentA}, #7bd3ff)`, color: '#03111f', border: 'none', fontWeight: 900, fontSize: 13, cursor: 'pointer', letterSpacing: '0.08em' }}
                  onClick={() => adminFetch(`${ARENA_API}/competitions/${competitionId}/next-round`, 'POST')}
                >
                  {canOpenFirstQuestion ? 'LANCER LE MATCH' : `OUVRIR LA QUESTION ${nextQuestionNumber}`}
                </button>
              )}

              {canCloseQuestion && currentQuestion && (
                <button
                  style={{ width: '100%', padding: '14px 18px', borderRadius: 16, background: 'rgba(251,113,133,0.16)', color: '#fecdd3', border: '1px solid rgba(251,113,133,0.34)', fontWeight: 900, fontSize: 13, cursor: 'pointer', letterSpacing: '0.08em' }}
                  onClick={() => adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/end`)}
                >
                  CLÔTURER LA QUESTION
                </button>
              )}

              {canScoreQuestion && currentQuestion && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    style={{ padding: '12px 10px', borderRadius: 14, background: `${T.accentA}1c`, color: T.accentA, border: `1px solid ${T.accentA}55`, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
                    onClick={() => adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/score`, 'PATCH', { result: 'A' })}
                  >
                    POINT A
                  </button>
                  <button
                    style={{ padding: '12px 10px', borderRadius: 14, background: `${T.accentB}1c`, color: T.accentB, border: `1px solid ${T.accentB}55`, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
                    onClick={() => adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/score`, 'PATCH', { result: 'B' })}
                  >
                    POINT B
                  </button>
                  <button
                    style={{ padding: '12px 10px', borderRadius: 14, background: 'rgba(248,184,78,0.15)', color: '#fde68a', border: '1px solid rgba(248,184,78,0.36)', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
                    onClick={() => adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/score`, 'PATCH', { result: 'BOTH' })}
                  >
                    POINT AUX DEUX
                  </button>
                  <button
                    style={{ padding: '12px 10px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', color: T.textMuted, border: `1px solid ${T.border}`, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
                    onClick={() => adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/score`, 'PATCH', { result: 'NONE' })}
                  >
                    AUCUN POINT
                  </button>
                </div>
              )}

              <button
                style={{ width: '100%', padding: '13px 18px', borderRadius: 16, background: 'rgba(251,113,133,0.08)', color: '#fda4af', border: '1px solid rgba(251,113,133,0.25)', fontWeight: 900, fontSize: 12, cursor: uniqueWinner ? 'pointer' : 'not-allowed', opacity: uniqueWinner ? 1 : 0.6, letterSpacing: '0.08em' }}
                disabled={!uniqueWinner}
                onClick={async () => {
                  if (!uniqueWinner) {
                    alert('Impossible de terminer le match: il y a une égalité en tête. Départagez les scores avant de clôturer.')
                    return
                  }
                  if (!window.confirm(`Déclarer ${uniqueWinner.displayName} vainqueur et terminer le match ?`)) return
                  await adminFetch(`${ARENA_API}/competitions/${competitionId}/complete`, 'PATCH', { participantUserId: uniqueWinner.participantUserId })
                }}
              >
                TERMINER LE MATCH
              </button>

              {!uniqueWinner && (
                <p style={{ margin: 0, fontSize: 11, color: '#fda4af', lineHeight: 1.55 }}>
                  Une égalité subsiste en tête. Attribuez ou ajustez les points avant la clôture finale.
                </p>
              )}
            </div>

            <div style={{ marginTop: 18 }}>
              <PublicStreamPanel competitionId={competitionId} accessToken={accessToken} />
            </div>
          </section>
        )}

        <ScoreboardPanel />
      </div>
    )
  }

  function ScoreboardPanel() {
    const leader = uniqueWinner?.participantUserId ?? null

    return (
      <section style={{ ...S.card, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <p style={S.label}>Tableau de match</p>
            <h2 style={{ margin: '8px 0 0', fontSize: 24, color: T.text, lineHeight: 1.05, letterSpacing: '-0.03em' }}>Scores en direct</h2>
          </div>
          <span style={{ padding: '7px 11px', borderRadius: 999, border: `1px solid ${T.border}`, color: T.textMuted, fontSize: 11, fontWeight: 800 }}>{viewerCount} vue(s)</span>
        </div>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {participants.map((participant, index) => {
            const accent = participant.slot === 'A' ? T.accentA : T.accentB
            const isLeader = participant.participantUserId === leader
            return (
              <div key={participant.participantUserId} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '16px 18px',
                borderRadius: 18,
                border: `1px solid ${isLeader ? accent + '50' : T.border}`,
                background: isLeader ? `${accent}10` : 'rgba(255,255,255,0.03)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accent}20`, border: `1px solid ${accent}45`, color: accent, fontWeight: 900 }}>{index + 1}</div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 11, color: T.textSubtle, fontWeight: 800, letterSpacing: '0.08em' }}>COMPÉTITEUR {participant.slot}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{participant.displayName}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 30, lineHeight: 1, fontWeight: 900, color: accent }}>{participant.score}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 10, color: T.textSubtle, fontWeight: 800, letterSpacing: '0.08em' }}>POINTS</p>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
          <p style={{ ...S.label, marginBottom: 8 }}>Lecture du match</p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: T.textMuted }}>
            {uniqueWinner
              ? `${uniqueWinner.displayName} mène actuellement la rencontre.`
              : 'Les deux compétiteurs sont au coude-à-coude. Le prochain point peut faire la différence.'}
          </p>
        </div>
      </section>
    )
  }

  const topBar = (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '18px 22px',
      gap: 14,
      color: '#fff',
      background: 'linear-gradient(180deg, rgba(8,15,27,0.92) 0%, rgba(8,15,27,0.82) 100%)',
      borderBottom: `1px solid ${T.border}`,
      backdropFilter: 'blur(18px)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <button
          onClick={() => navigate('/arena')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.62)', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}
          title="Retour à l'Arena"
        >←</button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, flexShrink: 0 }}>
          <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: '0.04em', color: '#fff' }}>KONESANS</span>
          <span style={{ fontWeight: 900, fontSize: 15, color: T.gold }}>+</span>
          <span style={{ fontSize: 11, color: T.textSubtle, marginLeft: 6, fontWeight: 700, letterSpacing: '0.16em' }}>ARENA LIVE</span>
        </div>
        <div style={{ width: 1, height: 18, background: T.border, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, color: T.textSubtle, fontWeight: 800, letterSpacing: '0.1em' }}>MATCH</p>
          <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{liveState?.competitionName ?? 'Match Arena Live'}</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={{ padding: '8px 12px', borderRadius: 999, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.04)', color: T.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
          QUESTION {questionNumber || 0}/{totalQuestions || 0}
        </span>
        {!connected && (
          <span style={{ padding: '8px 12px', borderRadius: 999, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.04)', color: T.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
            CONNEXION…
          </span>
        )}
        {isPaused && (
          <span style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(248,184,78,0.32)', background: 'rgba(248,184,78,0.14)', color: '#fde68a', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
            EN PAUSE
          </span>
        )}
        {connected && !isPaused && isLive && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(46,211,183,0.28)', background: 'rgba(46,211,183,0.12)', color: '#99f6e4', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.accentLive, display: 'inline-block', animation: 'liveDot 1.5s ease-in-out infinite' }} />
            EN DIRECT
          </span>
        )}
        <span style={{ padding: '8px 12px', borderRadius: 999, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.04)', color: T.text, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
          {viewerCount} spectateur(s)
        </span>
        {isModerator && isLive && (
          <button
            onClick={() => adminFetch(`${ARENA_API}/competitions/${competitionId}/${isPaused ? 'resume' : 'pause'}`)}
            style={{ padding: '10px 14px', borderRadius: 999, background: isPaused ? 'rgba(248,184,78,0.16)' : 'rgba(255,255,255,0.06)', border: `1px solid ${isPaused ? 'rgba(248,184,78,0.32)' : T.border}`, color: isPaused ? '#fde68a' : T.text, fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.08em' }}
          >
            {isPaused ? 'REPRENDRE' : 'PAUSE'}
          </button>
        )}
      </div>
    </header>
  )

  const alertStrip = (
    <>
      {error && (
        <div style={{ padding: '10px 22px', background: 'rgba(251,113,133,0.1)', borderBottom: '1px solid rgba(251,113,133,0.24)' }}>
          <span style={{ fontSize: 13, color: '#fecdd3', fontWeight: 700 }}>{error}</span>
        </div>
      )}
      {isPaused && (
        <div style={{ padding: '10px 22px', background: 'rgba(248,184,78,0.09)', borderBottom: '1px solid rgba(248,184,78,0.22)', textAlign: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#fde68a', letterSpacing: '0.08em' }}>
            SESSION EN PAUSE — reprenez quand le plateau est prêt
          </span>
        </div>
      )}
    </>
  )

  return (
    <div style={{ minHeight: '100vh', background: `radial-gradient(circle at top left, rgba(93,160,255,0.14), transparent 28%), radial-gradient(circle at top right, rgba(46,211,183,0.12), transparent 24%), ${T.bg}`, color: T.text }}>
      {topBar}
      {alertStrip}

      <main style={{ maxWidth: 1480, margin: '0 auto', padding: '22px 18px 32px' }}>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_380px]" style={{ gap: 18, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <section style={{ ...S.card, padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <p style={S.label}>Direction du live</p>
                  <h1 style={{ margin: '8px 0 0', fontSize: 34, lineHeight: 1.02, letterSpacing: '-0.04em', color: T.text }}>Une régie pensée question par question</h1>
                  <p style={{ margin: '12px 0 0', maxWidth: 760, fontSize: 14, lineHeight: 1.7, color: T.textMuted }}>
                    La logique interne peut rester structurée, mais l expérience visible est désormais centrée sur la question orale: ouverture, prise de parole, clôture et attribution immédiate du point.
                  </p>
                </div>
                <div style={{ minWidth: 210, padding: '16px 18px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}` }}>
                  <p style={{ ...S.label, marginBottom: 8 }}>Fil conducteur</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: currentTone }}>{currentPhaseMeta.label}</p>
                  <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.55, color: T.textMuted }}>{currentPhaseMeta.description}</p>
                </div>
              </div>
            </section>

            <MatchScene />
            <InsightStrip />
          </div>

          <CommandCenter />
        </div>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes liveDot { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.35; transform:scale(0.68); } }
        @keyframes timerPulse { 0%,100% { opacity:1; } 50% { opacity:0.48; } }
      `}</style>
    </div>
  )
}

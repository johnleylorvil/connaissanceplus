import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { arenaApi, ARENA_API, type ArenaLeaderboardRow, type ArenaPublicStream } from '../arenaApi'
import { useLiveKitStage, type StageParticipant } from '../hooks/useLiveKitStage'
import { useArenaSocket } from '../useArenaSocket'

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

type QuestionTarget = {
  participantUserId: string
  displayName: string | null
  slot: 'A' | 'B'
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
  currentQuestionTarget?: QuestionTarget | null
}

type CompetitionPhase =
  | 'loading'
  | 'waiting'
  | 'live-waiting'
  | 'live-question'
  | 'live-between'
  | 'paused'
  | 'finished'

type SubmissionSnapshot = {
  submitted: boolean
  at?: string | null
}

// ─── Color tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: '#070a12',
  bgStage: '#080c17',
  panel: '#0c1120',
  border: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.18)',
  text: '#f8fafc',
  textMuted: 'rgba(255,255,255,0.55)',
  textSoft: 'rgba(255,255,255,0.38)',
  gold: '#e6c27a',
  green: '#4fc66a',
  red: '#ff4d4d',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
  if (opts.isPaused) return 'paused'
  if (opts.competitionStatus !== 'live') return 'waiting'
  if (opts.currentQuestion?.endedAt || opts.roundEnded) return 'live-between'
  if (opts.currentQuestion) return 'live-question'
  return 'live-waiting'
}

function formatTimer(seconds: number | null) {
  if (seconds === null) return '--:--'
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.max(0, seconds % 60)).padStart(2, '0')}`
}

function getInitials(value: string) {
  return (
    value
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?'
  )
}

function getQuestionPanelText(opts: {
  phase: CompetitionPhase
  isOralQuestion: boolean
  questionPrompt: string | null
  currentQuestionTarget: QuestionTarget | null
}) {
  if (opts.phase === 'waiting') return 'Le modérateur peut lancer la première question.'
  if (opts.phase === 'live-waiting') return 'La prochaine question va commencer.'
  if (opts.phase === 'paused') return 'Le match est en pause.'
  if (opts.phase === 'live-between') return 'Question clôturée. Le modérateur rend sa décision.'
  if (opts.phase === 'live-question' && opts.questionPrompt) return opts.questionPrompt
  if (opts.phase === 'live-question' && opts.isOralQuestion) {
    return opts.currentQuestionTarget
      ? `Question orale pour ${opts.currentQuestionTarget.displayName ?? `Compétiteur ${opts.currentQuestionTarget.slot}`}.`
      : 'Question orale posée en direct.'
  }
  return 'Préparation du plateau live.'
}

function getScoreFill(score: number, totalQuestions: number, bestScore: number) {
  const denominator = Math.max(totalQuestions, bestScore, 1)
  return `${Math.min((score / denominator) * 100, 100)}%`
}

function getStageParticipantForUser(
  stageParticipants: StageParticipant[],
  subjectUserId: string | null | undefined,
  currentUserId: string | undefined,
) {
  if (!subjectUserId) return null
  if (currentUserId && subjectUserId === currentUserId) {
    return stageParticipants.find((p) => p.isLocal) ?? null
  }
  return stageParticipants.find((p) => p.identity === subjectUserId) ?? null
}

// ─── VideoRenderer ────────────────────────────────────────────────────────────
function VideoRenderer({
  stageParticipant,
  isLocal,
  avatarText,
  avatarColor,
}: {
  stageParticipant: StageParticipant | null
  isLocal: boolean
  avatarText: string
  avatarColor: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraTrack = stageParticipant?.cameraPublication?.track ?? null
  const cameraEnabled = stageParticipant?.isCameraEnabled ?? false

  useEffect(() => {
    const el = videoRef.current
    if (!el || !cameraTrack) return
    cameraTrack.attach(el)
    return () => {
      cameraTrack.detach(el)
    }
  }, [cameraTrack])

  if (cameraEnabled) {
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(circle at 50% 38%, ${avatarColor}1a, #04070e 80%)`,
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 26,
          fontWeight: 900,
          color: avatarColor,
          border: `1.5px solid ${avatarColor}55`,
          background: `${avatarColor}14`,
          boxShadow: `0 0 50px ${avatarColor}1e`,
          letterSpacing: '0.04em',
        }}
      >
        {avatarText}
      </div>
    </div>
  )
}

// ─── AudioRenderer ────────────────────────────────────────────────────────────
function AudioRenderer({
  stageParticipant,
  isLocal,
}: {
  stageParticipant: StageParticipant | null
  isLocal: boolean
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const micTrack = stageParticipant?.micPublication?.track ?? null

  useEffect(() => {
    const el = audioRef.current
    if (!el || !micTrack || isLocal) return
    micTrack.attach(el)
    return () => {
      micTrack.detach(el)
    }
  }, [isLocal, micTrack])

  if (isLocal) return null
  return <audio ref={audioRef} autoPlay />
}

// ─── AudioWave ────────────────────────────────────────────────────────────────
function AudioWave() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[8, 14, 10, 16, 12].map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: h,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.82)',
            animation: `voiceBars 0.85s ease-in-out infinite ${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  )
}

// ─── CompetitorPanel ──────────────────────────────────────────────────────────
type CompetitorPanelProps = {
  participant: MatchParticipant
  stageParticipant: StageParticipant | null
  isLocal: boolean
  isTargeted: boolean
  canReply: boolean
  onReply: () => void
  hasSubmitted: boolean
  scoreFill: string
  buttonLabel: string
}

function CompetitorPanel({
  participant,
  stageParticipant,
  isLocal,
  isTargeted,
  canReply,
  onReply,
  hasSubmitted,
  scoreFill,
  buttonLabel,
}: CompetitorPanelProps) {
  const isSpeaking = (stageParticipant?.participant as { isSpeaking?: boolean } | undefined)?.isSpeaking ?? false
  const initials = getInitials(participant.displayName)

  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 20,
        overflow: 'hidden',
        border: `1px solid ${isTargeted ? 'rgba(79,198,106,0.55)' : 'rgba(255,255,255,0.12)'}`,
        boxShadow: isTargeted
          ? '0 0 0 1px rgba(79,198,106,0.18), 0 8px 48px rgba(79,198,106,0.22), 0 8px 40px rgba(0,0,0,0.55)'
          : '0 8px 40px rgba(0,0,0,0.55)',
        transition: 'box-shadow 0.35s ease',
      }}
    >
      {/* Video area */}
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#030610', overflow: 'hidden', flexShrink: 0 }}>
        <VideoRenderer
          stageParticipant={stageParticipant}
          isLocal={isLocal}
          avatarText={initials}
          avatarColor={T.green}
        />
        <AudioRenderer stageParticipant={stageParticipant} isLocal={isLocal} />

        {/* Bottom gradient for text legibility */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '55%',
            background: 'linear-gradient(0deg, rgba(3,6,16,0.92) 0%, transparent 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Name overlay — bottom left */}
        <div style={{ position: 'absolute', bottom: 14, left: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.58)', fontWeight: 600, lineHeight: 1.2 }}>
            Compétiteur {participant.slot}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 17, color: '#fff', fontWeight: 800, lineHeight: 1.1 }}>
            {participant.displayName}
          </p>
        </div>

        {/* Right indicator — green glow dot if targeted, audio wave if speaking */}
        <div style={{ position: 'absolute', bottom: 18, right: 14 }}>
          {isTargeted ? (
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: T.green,
                boxShadow: `0 0 16px ${T.green}, 0 0 36px rgba(79,198,106,0.55)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
            </div>
          ) : isSpeaking ? (
            <AudioWave />
          ) : null}
        </div>
      </div>

      {/* Score / progress bar / reply button */}
      <div
        style={{
          background: T.panel,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <span
          style={{
            fontSize: 46,
            fontWeight: 900,
            color: T.green,
            lineHeight: 1,
            flexShrink: 0,
            minWidth: 54,
            textAlign: 'center',
          }}
        >
          {participant.score}
        </span>

        <div
          style={{
            flex: 1,
            height: 10,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: scoreFill,
              height: '100%',
              borderRadius: 999,
              background: `linear-gradient(90deg, ${T.green}, rgba(200,255,215,0.88))`,
              transition: 'width 0.6s ease',
            }}
          />
        </div>

        <button
          type="button"
          onClick={onReply}
          disabled={!canReply}
          style={{
            padding: '11px 22px',
            borderRadius: 999,
            border: `1px solid ${canReply ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.1)'}`,
            background: canReply
              ? 'linear-gradient(180deg, rgba(250,252,255,0.97), rgba(218,228,242,0.93))'
              : 'rgba(255,255,255,0.07)',
            color: canReply ? '#111827' : T.textMuted,
            fontSize: 14,
            fontWeight: 800,
            cursor: canReply ? 'pointer' : 'default',
            whiteSpace: 'nowrap',
            boxShadow: canReply ? '0 6px 22px rgba(255,255,255,0.18)' : 'none',
            flexShrink: 0,
          }}
        >
          {hasSubmitted ? '✓ Signalé' : buttonLabel}
        </button>
      </div>
    </article>
  )
}

// ─── ModeratorPanel ───────────────────────────────────────────────────────────
function ModeratorPanel({
  displayName,
  stageParticipant,
  isLocal,
}: {
  displayName: string
  stageParticipant: StageParticipant | null
  isLocal: boolean
}) {
  const initials = getInitials(displayName)

  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 20,
        overflow: 'hidden',
        border: `2px solid ${T.gold}`,
        boxShadow: `0 0 0 1px rgba(230,194,122,0.10), 0 12px 60px rgba(230,194,122,0.22), 0 8px 40px rgba(0,0,0,0.55)`,
      }}
    >
      {/* Video area — slightly taller aspect ratio so moderator stands out */}
      <div style={{ position: 'relative', aspectRatio: '4 / 3.3', background: '#040710', overflow: 'hidden', flexShrink: 0 }}>
        <VideoRenderer
          stageParticipant={stageParticipant}
          isLocal={isLocal}
          avatarText={initials}
          avatarColor={T.gold}
        />
        <AudioRenderer stageParticipant={stageParticipant} isLocal={isLocal} />

        {/* Bottom gradient */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '42%',
            background: 'linear-gradient(0deg, rgba(4,7,16,0.88) 0%, transparent 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* MODÉRATEUR badge — bottom center of video */}
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              padding: '7px 18px',
              borderRadius: 999,
              background: '#c9a052',
              color: '#1a0d00',
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: '0.07em',
            }}
          >
            MODÉRATEUR
          </span>
        </div>
      </div>

      {/* Name below */}
      <div
        style={{
          background: T.panel,
          padding: '15px 12px',
          textAlign: 'center',
          borderTop: `1px solid rgba(230,194,122,0.14)`,
        }}
      >
        <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: T.text }}>{displayName}</p>
      </div>
    </article>
  )
}

// ─── PublicStreamPanel ────────────────────────────────────────────────────────
function PublicStreamPanel({
  competitionId,
  accessToken,
}: {
  competitionId: string | undefined
  accessToken: string | null
}) {
  const [stream, setStream] = useState<ArenaPublicStream | null>(null)
  const [statusRequest, setStatusRequest] = useState<'live' | 'stopped' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!competitionId) return
    let cancelled = false
    const load = () => {
      arenaApi
        .getBroadcast(competitionId)
        .then((data) => {
          if (!cancelled) {
            setStream(data)
            setErrorMessage(null)
          }
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
      const updated = await arenaApi.setPublicStreamStatus(competitionId, status, accessToken)
      setStream(updated.publicStream ?? null)
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : 'Impossible de mettre à jour la diffusion publique.')
    } finally {
      setStatusRequest(null)
    }
  }

  const isYoutube = stream?.provider === 'youtube' && Boolean(stream.streamUrl)
  const btnStyle = {
    padding: '9px 14px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  } as const

  return (
    <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: T.textMuted, letterSpacing: '0.1em' }}>DIFFUSION:</span>
      {isYoutube ? (
        <>
          <button
            type="button"
            onClick={() => updateStatus('live')}
            disabled={statusRequest !== null}
            style={{ ...btnStyle, background: 'rgba(79,198,106,0.15)', color: '#dff7e5', border: '1px solid rgba(79,198,106,0.32)' }}
          >
            {statusRequest === 'live' ? 'OUVERTURE...' : 'OUVRIR AU PUBLIC'}
          </button>
          <button
            type="button"
            onClick={() => updateStatus('stopped')}
            disabled={statusRequest !== null}
            style={{ ...btnStyle, background: 'rgba(255,77,77,0.12)', color: '#ffd0d5', border: '1px solid rgba(255,77,77,0.28)' }}
          >
            {statusRequest === 'stopped' ? 'FERMETURE...' : 'FERMER'}
          </button>
          <a
            href={`/arena/watch/${competitionId}`}
            target="_blank"
            rel="noreferrer"
            style={{ ...btnStyle, background: 'rgba(255,255,255,0.07)', color: T.text, border: `1px solid ${T.border}`, textDecoration: 'none' }}
          >
            PAGE SPECTATEURS
          </a>
        </>
      ) : (
        <span style={{ fontSize: 12, color: T.textSoft }}>Aucun lien public configuré</span>
      )}
      {errorMessage && <span style={{ fontSize: 12, color: '#ffd0d5' }}>{errorMessage}</span>}
    </div>
  )
}

// ─── LogoMark ─────────────────────────────────────────────────────────────────
function LogoMark() {
  return (
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: '50%',
        border: '1.5px solid rgba(230,194,122,0.38)',
        background: 'radial-gradient(circle at 35% 30%, rgba(230,194,122,0.18), rgba(10,14,24,0.95))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 18,
          fontWeight: 900,
          color: T.gold,
          letterSpacing: '-0.02em',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        K+
      </span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ArenaLive() {
  const { id: competitionId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, accessToken } = useAuth()

  const isModerator = user?.role === 'admin' || user?.role === 'moderator'
  const [isRegisteredCompetitor, setIsRegisteredCompetitor] = useState(false)
  const [teamLoaded, setTeamLoaded] = useState(false)
  const [polledState, setPolledState] = useState<LiveStateSnapshot | null>(null)
  const [polledLeaderboard, setPolledLeaderboard] = useState<ArenaLeaderboardRow[]>([])
  const [questionPrompt, setQuestionPrompt] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof window.setInterval> | null>(null)

  const [rtcToken, setRtcToken] = useState<string | null>(null)
  const [rtcUrl, setRtcUrl] = useState<string | null>(null)

  useEffect(() => {
    if (isModerator) {
      setTeamLoaded(true)
      return
    }
    if (!competitionId || !user?.id) {
      setTeamLoaded(true)
      return
    }
    arenaApi
      .getLiveState(competitionId)
      .then((liveState) => {
        const live = liveState as { participants?: Array<{ userId: string }> }
        setIsRegisteredCompetitor(Boolean(live.participants?.some((p) => p.userId === user.id)))
      })
      .catch(() => setIsRegisteredCompetitor(false))
      .finally(() => setTeamLoaded(true))
  }, [competitionId, isModerator, user?.id])

  const canControlLocalMedia = isModerator || isRegisteredCompetitor

  const socketParams = useMemo(
    () =>
      competitionId && user?.id && teamLoaded && accessToken
        ? isModerator
          ? { competitionId, userId: user.id, participantId: '__admin__', role: 'admin', token: accessToken }
          : isRegisteredCompetitor
            ? { competitionId, userId: user.id, participantId: user.id, role: 'competitor', token: accessToken }
            : { competitionId, userId: user.id, participantId: '__spectator__', role: 'spectator', token: accessToken }
        : null,
    [accessToken, competitionId, isModerator, isRegisteredCompetitor, teamLoaded, user?.id],
  )

  const { socketState, submitAnswer } = useArenaSocket(socketParams)
  const { state, leaderboard, roundEnded, competitionResult, error, isPaused, onlineParticipantIds, onlineUsers, submissionStatuses } =
    socketState

  useEffect(() => {
    if (!competitionId || socketParams) return
    let cancelled = false
    const load = () => {
      Promise.all([arenaApi.getLiveState(competitionId), arenaApi.getLiveLeaderboard(competitionId)])
        .then(([liveState, liveBoard]) => {
          if (cancelled) return
          setPolledState(liveState as LiveStateSnapshot)
          setPolledLeaderboard(liveBoard)
        })
        .catch(() => {})
    }
    load()
    const interval = window.setInterval(load, 3000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [competitionId, socketParams])

  const liveState = state ?? polledState
  const liveLeaderboard = leaderboard.length > 0 ? leaderboard : polledLeaderboard
  const currentQuestion = liveState?.currentQuestion ?? liveState?.currentRound ?? null
  const secondsPerQuestion = liveState?.secondsPerQuestion ?? 30
  const questionIsClosed = Boolean(roundEnded || currentQuestion?.endedAt)
  const currentQuestionStartedAt = currentQuestion?.startedAt ?? null
  const currentQuestionEndTime = currentQuestion?.endTime ?? null

  const participants = useMemo<MatchParticipant[]>(() => {
    const fromState = (liveState?.participants ?? []).map((p) => {
      const row = liveLeaderboard.find((e) => e.participantUserId === p.userId)
      return { participantUserId: p.userId, displayName: p.displayName, score: row?.score ?? 0, slot: p.slot }
    })

    const seeded =
      fromState.length > 0
        ? fromState
        : liveLeaderboard.slice(0, 2).map((row, i) => ({
            participantUserId: row.participantUserId,
            displayName: row.displayName,
            score: row.score,
            slot: (i === 0 ? 'A' : 'B') as 'A' | 'B',
          }))

    while (seeded.length < 2) {
      seeded.push({
        participantUserId: `placeholder-${seeded.length}`,
        displayName: seeded.length === 0 ? 'Compétiteur A' : 'Compétiteur B',
        score: 0,
        slot: seeded.length === 0 ? 'A' : 'B',
      })
    }
    return seeded
  }, [liveLeaderboard, liveState?.participants])

  const currentQuestionTarget = useMemo<QuestionTarget | null>(() => {
    if (liveState?.currentQuestionTarget) return liveState.currentQuestionTarget
    if (!currentQuestion) return null
    const slot = currentQuestion.position % 2 === 1 ? ('A' as const) : ('B' as const)
    const p = participants.find((e) => e.slot === slot)
    return p ? { participantUserId: p.participantUserId, displayName: p.displayName, slot } : null
  }, [currentQuestion, liveState?.currentQuestionTarget, participants])

  const userMode: UserMode = useMemo(() => {
    if (isModerator) return 'moderator'
    if (isRegisteredCompetitor && user?.id && participants.some((p) => p.participantUserId === user.id)) return 'competitor'
    return 'spectator'
  }, [isModerator, isRegisteredCompetitor, participants, user?.id])

  // Timer
  useEffect(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (!currentQuestion || questionIsClosed) {
      setTimeLeft(null)
      return
    }
    const computeRemaining = () => {
      if (currentQuestionEndTime) {
        return Math.max(0, Math.round((new Date(currentQuestionEndTime).getTime() - Date.now()) / 1000))
      }
      const startedAt = currentQuestionStartedAt ? new Date(currentQuestionStartedAt).getTime() : Date.now()
      return Math.max(0, Math.round((startedAt + secondsPerQuestion * 1000 - Date.now()) / 1000))
    }
    setTimeLeft(computeRemaining())
    timerRef.current = window.setInterval(() => {
      setTimeLeft((v) => (v === null || v <= 0 ? 0 : v - 1))
    }, 1000)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [currentQuestion, currentQuestionEndTime, currentQuestionStartedAt, questionIsClosed, secondsPerQuestion])

  // Question prompt
  useEffect(() => {
    if (!currentQuestion?.questionId || !accessToken) {
      setQuestionPrompt(null)
      return
    }
    let cancelled = false
    arenaApi
      .getArenaQuestion(currentQuestion.questionId, accessToken)
      .then((q) => {
        if (!cancelled) setQuestionPrompt(q.prompt)
      })
      .catch(() => {
        if (!cancelled) setQuestionPrompt(null)
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, currentQuestion?.questionId])

  // RTC token
  useEffect(() => {
    if (!competitionId || !accessToken || userMode === 'spectator' || !canControlLocalMedia) return
    arenaApi
      .getRtcToken(competitionId, accessToken)
      .then((data) => {
        setRtcUrl(data.url)
        setRtcToken(data.token)
      })
      .catch(() => {})
  }, [accessToken, canControlLocalMedia, competitionId, userMode])

  const {
    participants: stageParticipants,
    localCameraEnabled,
    localMicEnabled,
    isCameraLoading,
    permissionError: stagePermissionError,
    toggleCamera,
    toggleMic,
  } = useLiveKitStage({ url: rtcUrl, token: rtcToken, canPublish: canControlLocalMedia })

  const phase = getPhase({
    teamLoaded,
    competitionStatus: liveState?.status,
    isPaused,
    currentQuestion,
    roundEnded,
    competitionResult,
  })

  const isLive = liveState?.status === 'live'
  const questionNumber = liveState?.currentQuestionNumber ?? liveState?.currentRoundNumber ?? 0
  const totalQuestions = liveState?.totalQuestions ?? liveState?.totalRounds ?? 0
  const bestScore = participants.length > 0 ? Math.max(...participants.map((p) => p.score)) : 0
  const leaders = participants.filter((p) => p.score === bestScore)
  const uniqueWinner = leaders.length === 1 ? leaders[0] : null
  const isOralQuestion = currentQuestion?.questionId == null
  const mySubmission = user?.id ? (submissionStatuses[user.id] as SubmissionSnapshot | undefined) ?? null : null
  const isCurrentUserTargeted = Boolean(user?.id && currentQuestionTarget?.participantUserId === user.id)
  const canSignalAnswer =
    userMode === 'competitor' &&
    Boolean(currentQuestion) &&
    phase === 'live-question' &&
    !questionIsClosed &&
    isCurrentUserTargeted &&
    !mySubmission?.submitted

  const moderatorProfile = useMemo(() => {
    const m = liveState?.matchParticipants?.find((e) => e.role === 'moderator')
    if (m) return { userId: m.userId, displayName: m.displayName }
    if (isModerator && user) return { userId: user.id, displayName: `${user.firstName} ${user.lastName}`.trim() }
    return { userId: null, displayName: 'Modérateur' }
  }, [isModerator, liveState?.matchParticipants, user])

  const competitorA = participants.find((p) => p.slot === 'A') ?? participants[0]
  const competitorB = participants.find((p) => p.slot === 'B') ?? participants[1]

  const competitorAStage = getStageParticipantForUser(stageParticipants, competitorA?.participantUserId, user?.id)
  const competitorBStage = getStageParticipantForUser(stageParticipants, competitorB?.participantUserId, user?.id)
  const moderatorStage = getStageParticipantForUser(stageParticipants, moderatorProfile.userId, user?.id)

  const moderatorOnline =
    Boolean(
      moderatorProfile.userId
        ? onlineUsers.some((e: { userId: string; role: string }) => e.userId === moderatorProfile.userId)
        : false,
    ) ||
    Boolean(moderatorStage) ||
    (isModerator && Boolean(stageParticipants.find((p) => p.isLocal)))

  void moderatorOnline
  void onlineParticipantIds

  const questionPanelText = getQuestionPanelText({ phase, isOralQuestion, questionPrompt, currentQuestionTarget })

  const adminFetch = async (url: string, method = 'PATCH', body?: unknown) => {
    try {
      const init: RequestInit = {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }
      if (body) init.body = JSON.stringify(body)
      const res = await fetch(url, init)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.message || 'Erreur')
      }
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const nextQuestionNumber = Math.min(questionNumber + 1, totalQuestions)
  const canOpenFirstQuestion = phase === 'waiting'
  const canOpenNextQuestion = isLive && (phase === 'live-waiting' || phase === 'live-between') && questionNumber < totalQuestions
  const canCloseQuestion = isLive && phase === 'live-question' && Boolean(currentQuestion)
  const canScoreQuestion = isLive && phase === 'live-between' && Boolean(currentQuestion)
  const isDirectLive = phase === 'live-question' || phase === 'live-waiting' || phase === 'live-between'

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div
        style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg }}
      >
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: `3px solid ${T.border}`,
              borderTopColor: T.gold,
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p style={{ margin: 0, color: T.textMuted, fontWeight: 800, fontSize: 13, letterSpacing: '0.16em' }}>
            CONNEXION À LA SCÈNE...
          </p>
        </div>
      </div>
    )
  }

  // ── Finished ────────────────────────────────────────────────────────────────
  if (phase === 'finished') {
    const podium = (competitionResult as { podium?: ArenaLeaderboardRow[] } | null)?.podium ?? liveLeaderboard.slice(0, 3)
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `radial-gradient(circle at top, rgba(230,194,122,0.16), ${T.bg} 42%)`,
          padding: 24,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            borderRadius: 28,
            border: `1px solid ${T.borderStrong}`,
            background: T.panel,
            padding: 32,
            boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          }}
        >
          <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.textSoft, letterSpacing: '0.16em' }}>
            MATCH TERMINÉ
          </p>
          <h1 style={{ margin: '10px 0 0', fontSize: 40, lineHeight: 0.98, color: T.gold }}>Fin de rencontre</h1>
          {podium[0] && (
            <p style={{ margin: '10px 0 0', color: T.text, fontSize: 16 }}>Vainqueur : {podium[0].displayName}</p>
          )}
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {podium.slice(0, 3).map((entry, i) => (
              <div
                key={entry.participantUserId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 18px',
                  borderRadius: 18,
                  border: `1px solid ${i === 0 ? 'rgba(230,194,122,0.38)' : T.border}`,
                  background: i === 0 ? 'rgba(230,194,122,0.08)' : 'rgba(255,255,255,0.03)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: i === 0 ? 'rgba(230,194,122,0.18)' : 'rgba(255,255,255,0.06)',
                      color: i === 0 ? T.gold : T.text,
                      fontWeight: 900,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ color: T.text, fontSize: 16, fontWeight: 800 }}>{entry.displayName}</span>
                </div>
                <span style={{ color: i === 0 ? T.gold : T.text, fontSize: 24, fontWeight: 900 }}>{entry.score}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate('/arena')}
            style={{
              marginTop: 24,
              padding: '14px 22px',
              borderRadius: 999,
              border: 'none',
              background: 'linear-gradient(135deg, #f0d59a, #d7ab4f)',
              color: '#1b1509',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            RETOUR À L'ARENA
          </button>
        </div>
      </div>
    )
  }

  // ── Main stage ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: T.bg,
        color: T.text,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.38; transform: scale(0.78); }
        }
        @keyframes voiceBars {
          0%, 100% { transform: scaleY(0.48); opacity: 0.58; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          height: 78,
          background: '#0a0e18',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          gap: 16,
          zIndex: 10,
        }}
      >
        {/* Left: Logo + name */}
        <button
          type="button"
          onClick={() => navigate('/arena')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
            padding: 0,
            flexShrink: 0,
          }}
        >
          <LogoMark />
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: T.text, lineHeight: 1.2 }}>Konesans+</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.textMuted, lineHeight: 1.2 }}>Competition</p>
          </div>
        </button>

        {/* Center: Question pill */}
        <div
          style={{
            padding: '13px 32px',
            borderRadius: 999,
            background: '#141c2e',
            border: '1px solid rgba(255,255,255,0.13)',
            fontSize: 16,
            fontWeight: 700,
            color: T.text,
            whiteSpace: 'nowrap',
          }}
        >
          {questionNumber > 0
            ? `Question ${questionNumber}${totalQuestions > 0 ? ` / ${totalQuestions}` : ''}`
            : 'En attente du match'}
        </div>

        {/* Right: EN DIRECT + timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: isDirectLive ? T.red : isPaused ? T.gold : '#555',
                boxShadow: isDirectLive ? `0 0 8px ${T.red}` : 'none',
                animation: isDirectLive ? 'pulseDot 1.4s ease-in-out infinite' : 'none',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 17,
                fontWeight: 900,
                color: isDirectLive ? T.red : isPaused ? T.gold : T.textMuted,
                letterSpacing: '0.05em',
              }}
            >
              {isPaused ? 'EN PAUSE' : isDirectLive ? 'EN DIRECT' : 'PRÊT'}
            </span>
          </div>

          <div
            style={{
              padding: '10px 22px',
              borderRadius: 14,
              background: '#181f30',
              border: '1px solid rgba(255,255,255,0.14)',
              fontSize: 30,
              fontWeight: 900,
              fontVariantNumeric: 'tabular-nums',
              color: T.text,
              minWidth: 128,
              textAlign: 'center',
              letterSpacing: '0.02em',
            }}
          >
            {formatTimer(timeLeft)}
          </div>
        </div>
      </header>

      {/* ── Stage ──────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'radial-gradient(ellipse at 50% 26%, #142030 0%, #080e1a 48%, #040812 100%)',
          position: 'relative',
        }}
      >
        {/* Alerts */}
        {(error || isPaused) && (
          <div style={{ padding: '10px 20px 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'rgba(255,77,77,0.12)',
                  border: '1px solid rgba(255,77,77,0.25)',
                  color: '#ffd0d5',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
            {isPaused && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'rgba(230,194,122,0.12)',
                  border: '1px solid rgba(230,194,122,0.25)',
                  color: '#f7deb0',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Match en pause — la scène reste figée jusqu'à la reprise.
              </div>
            )}
          </div>
        )}

        {/* Question card */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '28px 32px 18px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 870,
              minHeight: 200,
              borderRadius: 24,
              background: 'linear-gradient(170deg, #ffffff 0%, #f2f6ff 100%)',
              boxShadow: '0 0 100px rgba(230,194,122,0.26), 0 24px 80px rgba(0,0,0,0.55)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '36px 48px',
              position: 'relative',
              textAlign: 'center',
            }}
          >
            {currentQuestionTarget && phase === 'live-question' && (
              <div
                style={{
                  position: 'absolute',
                  top: 18,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    padding: '6px 14px',
                    borderRadius: 999,
                    background: 'rgba(0,0,0,0.07)',
                    color: '#2f3a4d',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                  }}
                >
                  POUR {currentQuestionTarget.displayName?.toUpperCase() ?? `COMPÉTITEUR ${currentQuestionTarget.slot}`}
                </span>
              </div>
            )}
            <h1
              style={{
                margin: 0,
                fontSize: 'clamp(1.5rem, 3vw, 2.8rem)',
                fontWeight: 700,
                color: '#111827',
                lineHeight: 1.2,
                maxWidth: 720,
              }}
            >
              {questionPanelText}
            </h1>
          </div>
        </div>

        {/* 3-panel video grid */}
        <div
          style={{
            padding: '0 16px 18px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <CompetitorPanel
            participant={competitorA}
            stageParticipant={competitorAStage}
            isLocal={user?.id === competitorA.participantUserId}
            isTargeted={
              currentQuestionTarget?.participantUserId === competitorA.participantUserId &&
              phase === 'live-question'
            }
            canReply={Boolean(user?.id === competitorA.participantUserId && canSignalAnswer)}
            onReply={() => {
              if (!currentQuestion || !user?.id) return
              submitAnswer(currentQuestion.id, user.id)
            }}
            hasSubmitted={Boolean(
              (submissionStatuses[competitorA.participantUserId] as SubmissionSnapshot | undefined)?.submitted,
            )}
            scoreFill={getScoreFill(competitorA.score, totalQuestions, bestScore)}
            buttonLabel="Répondre"
          />

          <ModeratorPanel
            displayName={moderatorProfile.displayName}
            stageParticipant={moderatorStage}
            isLocal={user?.id === moderatorProfile.userId}
          />

          <CompetitorPanel
            participant={competitorB}
            stageParticipant={competitorBStage}
            isLocal={user?.id === competitorB.participantUserId}
            isTargeted={
              currentQuestionTarget?.participantUserId === competitorB.participantUserId &&
              phase === 'live-question'
            }
            canReply={Boolean(user?.id === competitorB.participantUserId && canSignalAnswer)}
            onReply={() => {
              if (!currentQuestion || !user?.id) return
              submitAnswer(currentQuestion.id, user.id)
            }}
            hasSubmitted={Boolean(
              (submissionStatuses[competitorB.participantUserId] as SubmissionSnapshot | undefined)?.submitted,
            )}
            scoreFill={getScoreFill(competitorB.score, totalQuestions, bestScore)}
            buttonLabel="Répondre"
          />
        </div>
      </div>

      {/* ── Camera / mic controls ───────────────────────────────────────── */}
      {canControlLocalMedia && (
        <div
          style={{
            flexShrink: 0,
            background: '#090d18',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '12px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={toggleCamera}
            disabled={isCameraLoading}
            style={{
              padding: '9px 16px',
              borderRadius: 999,
              border: `1px solid ${localCameraEnabled ? T.borderStrong : 'rgba(79,198,106,0.35)'}`,
              background: localCameraEnabled ? 'rgba(255,255,255,0.08)' : 'rgba(79,198,106,0.12)',
              color: localCameraEnabled ? T.text : '#dff7e5',
              fontSize: 13,
              fontWeight: 800,
              cursor: isCameraLoading ? 'default' : 'pointer',
            }}
          >
            {isCameraLoading ? '...' : localCameraEnabled ? '📷 Couper caméra' : '📷 Caméra'}
          </button>
          <button
            type="button"
            onClick={toggleMic}
            style={{
              padding: '9px 16px',
              borderRadius: 999,
              border: `1px solid ${localMicEnabled ? T.borderStrong : 'rgba(79,198,106,0.35)'}`,
              background: localMicEnabled ? 'rgba(255,255,255,0.08)' : 'rgba(79,198,106,0.12)',
              color: localMicEnabled ? T.text : '#dff7e5',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {localMicEnabled ? '🎙️ Couper micro' : '🎙️ Micro'}
          </button>
          {stagePermissionError && (
            <span style={{ fontSize: 12, color: '#ffd0d5', fontWeight: 700 }}>{stagePermissionError}</span>
          )}
        </div>
      )}

      {/* ── Moderator command center ────────────────────────────────────── */}
      {isModerator && (
        <div
          style={{
            flexShrink: 0,
            background: '#08111e',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            padding: '18px 24px',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: T.textMuted,
                letterSpacing: '0.12em',
                marginRight: 4,
              }}
            >
              RÉGIE — Q{questionNumber}/{totalQuestions}
              {currentQuestionTarget
                ? ` · ${currentQuestionTarget.displayName ?? `C${currentQuestionTarget.slot}`}`
                : ''}
            </span>

            {(canOpenFirstQuestion || canOpenNextQuestion) && (
              <button
                type="button"
                onClick={() => adminFetch(`${ARENA_API}/competitions/${competitionId}/next-round`, 'POST')}
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'linear-gradient(135deg, #c7defe, #7bb9ff)',
                  color: '#0b1626',
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {canOpenFirstQuestion ? 'LANCER LE MATCH' : `OUVRIR Q${nextQuestionNumber}`}
              </button>
            )}

            {canCloseQuestion && currentQuestion && (
              <button
                type="button"
                onClick={() => adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/end`)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,77,77,0.3)',
                  background: 'rgba(255,77,77,0.12)',
                  color: '#ffd0d5',
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                CLÔTURER
              </button>
            )}

            {canScoreQuestion && currentQuestion && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/score`, 'PATCH', { verdict: 'correct' })
                  }
                  style={{
                    padding: '10px 16px',
                    borderRadius: 999,
                    border: '1px solid rgba(79,198,106,0.35)',
                    background: 'rgba(79,198,106,0.14)',
                    color: '#dff7e5',
                    fontWeight: 900,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  ✓ BONNE RÉPONSE
                </button>
                <button
                  type="button"
                  onClick={() =>
                    adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/score`, 'PATCH', { verdict: 'incorrect' })
                  }
                  style={{
                    padding: '10px 16px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,77,77,0.28)',
                    background: 'rgba(255,77,77,0.12)',
                    color: '#ffd0d5',
                    fontWeight: 900,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  ✗ MAUVAISE RÉPONSE
                </button>
                <button
                  type="button"
                  onClick={() =>
                    adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/score`, 'PATCH', { verdict: 'cancelled' })
                  }
                  style={{
                    padding: '10px 16px',
                    borderRadius: 999,
                    border: `1px solid ${T.border}`,
                    background: 'rgba(255,255,255,0.07)',
                    color: T.text,
                    fontWeight: 900,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  ANNULÉE
                </button>
              </>
            )}

            {isLive && (
              <button
                type="button"
                onClick={() =>
                  adminFetch(`${ARENA_API}/competitions/${competitionId}/${isPaused ? 'resume' : 'pause'}`)
                }
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: `1px solid ${T.border}`,
                  background: 'rgba(255,255,255,0.07)',
                  color: T.text,
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {isPaused ? 'REPRENDRE' : 'PAUSE'}
              </button>
            )}

            <button
              type="button"
              disabled={!uniqueWinner}
              onClick={async () => {
                if (!uniqueWinner) {
                  alert('Égalité en tête : départagez avant de terminer.')
                  return
                }
                if (!window.confirm(`Déclarer ${uniqueWinner.displayName} vainqueur ?`)) return
                await adminFetch(`${ARENA_API}/competitions/${competitionId}/complete`, 'PATCH', {
                  participantUserId: uniqueWinner.participantUserId,
                })
              }}
              style={{
                padding: '10px 16px',
                borderRadius: 999,
                border: '1px solid rgba(230,194,122,0.32)',
                background: 'rgba(230,194,122,0.14)',
                color: '#f7deb0',
                fontWeight: 900,
                cursor: uniqueWinner ? 'pointer' : 'default',
                opacity: uniqueWinner ? 1 : 0.5,
                fontSize: 13,
              }}
            >
              TERMINER LE MATCH
            </button>
          </div>

          <PublicStreamPanel competitionId={competitionId} accessToken={accessToken} />
        </div>
      )}
    </div>
  )
}

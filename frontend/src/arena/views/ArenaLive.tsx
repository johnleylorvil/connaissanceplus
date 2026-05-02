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
  goldLight: '#f5d9a0',
  green: '#4fc66a',
  blue: '#6ca8f5',
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
  const slotColor = participant.slot === 'A' ? T.green : T.blue
  const targetBorderColor = slotColor === T.green ? 'rgba(79,198,106,0.70)' : 'rgba(108,168,245,0.70)'
  const spotlightClass = participant.slot === 'A' ? 'arena-spotlight-green' : 'arena-spotlight-blue'

  // Score gain flash
  const prevScoreRef = useRef(participant.score)
  const [scoreFlashActive, setScoreFlashActive] = useState(false)
  useEffect(() => {
    if (participant.score > prevScoreRef.current) {
      setScoreFlashActive(true)
      const t = setTimeout(() => setScoreFlashActive(false), 580)
      return () => clearTimeout(t)
    }
    prevScoreRef.current = participant.score
  }, [participant.score])

  return (
    <article
      className={`arena-competitor-article${isTargeted ? ` ${spotlightClass}` : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 20,
        overflow: 'hidden',
        border: `1px solid ${isTargeted ? targetBorderColor : 'rgba(255,255,255,0.11)'}`,
        ...(isTargeted ? {} : { boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }),
        transition: 'border-color 0.4s ease',
      }}
    >
      {/* Video area */}
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#030610', overflow: 'hidden', flexShrink: 0 }}>
        <VideoRenderer
          stageParticipant={stageParticipant}
          isLocal={isLocal}
          avatarText={initials}
          avatarColor={slotColor}
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

        {/* VOUS badge — top-right, only for the local participant */}
        {isLocal && <div className="arena-you-badge">VOUS</div>}

        {/* Right indicator — glow dot if targeted, audio wave if speaking */}
        <div style={{ position: 'absolute', bottom: 18, right: 14 }}>
          {isTargeted ? (
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: slotColor,
                boxShadow: `0 0 16px ${slotColor}, 0 0 36px ${slotColor}88`,
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

      {/* Score + bar + reply */}
      <div
        style={{
          background: `linear-gradient(180deg, #0e1626 0%, ${T.panel} 100%)`,
          padding: '12px 14px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          borderTop: `1px solid ${slotColor}22`,
        }}
      >
        {/* Score row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className={scoreFlashActive ? 'score-flash' : undefined}
            style={{
              fontSize: 44,
              fontWeight: 900,
              color: slotColor,
              lineHeight: 1,
              flexShrink: 0,
              minWidth: 50,
              textAlign: 'center',
              textShadow: `0 0 24px ${slotColor}${scoreFlashActive ? 'cc' : '66'}`,
              fontVariantNumeric: 'tabular-nums',
              display: 'inline-block',
            }}
          >
            {participant.score}
          </span>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Progress track */}
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.09)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: scoreFill,
                  height: '100%',
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${slotColor}cc, ${slotColor})`,
                  boxShadow: `0 0 8px ${slotColor}66`,
                  transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>

            {/* Reply button — full-width in its column */}
            <button
              type="button"
              onClick={onReply}
              disabled={!canReply}
              className={canReply ? (participant.slot === 'A' ? 'arena-reply-urgent-green' : 'arena-reply-urgent-blue') : undefined}
              style={{
                padding: '9px 0',
                borderRadius: 10,
                border: `1px solid ${canReply ? `${slotColor}44` : 'rgba(255,255,255,0.08)'}`,
                background: canReply ? 'transparent' : 'rgba(255,255,255,0.04)',
                color: canReply ? slotColor : T.textSoft,
                fontSize: 13,
                fontWeight: 800,
                cursor: canReply ? 'pointer' : 'default',
                letterSpacing: '0.06em',
                width: '100%',
                transition: 'all 0.2s ease',
              }}
            >
              {hasSubmitted ? '✓ SIGNALÉ' : buttonLabel.toUpperCase()}
            </button>
          </div>
        </div>
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
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 16px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #d4a84b, #c9a052)',
              color: '#1a0c00',
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.09em',
              boxShadow: '0 2px 14px rgba(201,160,82,0.45)',
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
  const spectatorCount = (onlineUsers as Array<{ userId: string; role: string }>).filter((u) => u.role === 'spectator').length

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
      className="arena-root"
      style={{
        background: T.bg,
        color: T.text,
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
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
        @keyframes questionIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes scoreFlash {
          0%   { transform: scale(1); }
          35%  { transform: scale(1.18); }
          100% { transform: scale(1); }
        }
        @keyframes timerWarn {
          0%, 100% { color: #ff4d4d; }
          50%       { color: #ff9090; }
        }
        @keyframes beatSecond {
          0%   { transform: scale(1); }
          28%  { transform: scale(1.12); }
          65%  { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        @keyframes scoreGain {
          0%   { transform: scale(1); }
          26%  { transform: scale(1.38); }
          60%  { transform: scale(0.93); }
          100% { transform: scale(1); }
        }
        @keyframes spotlightGreen {
          0%, 100% { box-shadow: 0 0 0 1px rgba(79,198,106,0.22), 0 8px 48px rgba(79,198,106,0.18), 0 8px 36px rgba(0,0,0,0.50); }
          50%       { box-shadow: 0 0 0 4px rgba(79,198,106,0.40), 0 12px 64px rgba(79,198,106,0.40), 0 8px 40px rgba(0,0,0,0.55); }
        }
        @keyframes spotlightBlue {
          0%, 100% { box-shadow: 0 0 0 1px rgba(108,168,245,0.22), 0 8px 48px rgba(108,168,245,0.18), 0 8px 36px rgba(0,0,0,0.50); }
          50%       { box-shadow: 0 0 0 4px rgba(108,168,245,0.40), 0 12px 64px rgba(108,168,245,0.40), 0 8px 40px rgba(0,0,0,0.55); }
        }
        @keyframes replyPulseGreen {
          0%, 100% { box-shadow: 0 0 0 0px rgba(79,198,106,0.10); }
          50%       { box-shadow: 0 0 0 6px rgba(79,198,106,0.26); }
        }
        @keyframes replyPulseBlue {
          0%, 100% { box-shadow: 0 0 0 0px rgba(108,168,245,0.10); }
          50%       { box-shadow: 0 0 0 6px rgba(108,168,245,0.26); }
        }
        @keyframes youBadgeBlink {
          0%, 75%, 100% { opacity: 1; }
          88%            { opacity: 0.55; }
        }
        @keyframes awaitingPulse {
          0%, 100% { box-shadow: 0 0 40px rgba(230,194,122,0.08), 0 16px 48px rgba(0,0,0,0.50); }
          50%       { box-shadow: 0 0 90px rgba(230,194,122,0.32), 0 20px 64px rgba(0,0,0,0.55); }
        }

        /* ─── Arena layout ─── */
        .arena-root { display: flex; flex-direction: column; min-height: 100vh; }

        .arena-header {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          height: 72px;
          background: #08101e;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          gap: 16px;
          z-index: 10;
          position: sticky;
          top: 0;
        }
        .arena-brand-text { display: flex; flex-direction: column; }
        .arena-brand-sub  { }

        .arena-header-center {
          padding: 10px 28px;
          border-radius: 999px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.11);
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
          white-space: nowrap;
          letter-spacing: 0.01em;
        }
        .arena-status-row   { display: flex; align-items: center; gap: 18px; flex-shrink: 0; }
        .arena-status-badge { display: flex; align-items: center; gap: 8px; }
        .arena-status-label { font-size: 15px; font-weight: 900; letter-spacing: 0.06em; }
        .arena-timer-box {
          padding: 8px 20px;
          border-radius: 12px;
          background: #111928;
          border: 1px solid rgba(255,255,255,0.13);
          font-size: 28px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          color: #f8fafc;
          min-width: 118px;
          text-align: center;
          letter-spacing: 0.04em;
        }

        /* ─── Stage ─── */
        .arena-stage {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: radial-gradient(ellipse at 50% 22%, #16263a 0%, #070e1c 50%, #030810 100%);
          position: relative;
        }

        /* ─── Question ─── */
        .arena-question-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 28px 16px;
        }
        .arena-question-card {
          width: 100%;
          max-width: 900px;
          border-radius: 22px;
          background: #ffffff;
          overflow: hidden;
          animation: questionIn 0.4s ease both;
        }
        .arena-question-inner {
          padding: 30px 44px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 14px;
        }
        .arena-question-text {
          margin: 0;
          font-size: clamp(1.35rem, 2.8vw, 2.5rem);
          font-weight: 700;
          color: #0f1a2e;
          line-height: 1.22;
          max-width: 740px;
          letter-spacing: -0.015em;
        }

        /* ─── Video grid ─── */
        .arena-stage-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          grid-template-areas: "compA mod compB";
          gap: 10px;
          padding: 0 14px 16px;
          align-items: end;
        }
        .arena-cell-a   { grid-area: compA; }
        .arena-cell-mod { grid-area: mod;   }
        .arena-cell-b   { grid-area: compB; }
        .arena-cell-a   .arena-competitor-article { border-color: rgba(79,198,106,0.18); }
        .arena-cell-b   .arena-competitor-article { border-color: rgba(108,168,245,0.18); }

        /* ─── Media / mod bars ─── */
        .arena-media-bar {
          flex-shrink: 0;
          background: #07101a;
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 11px 20px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        .arena-mod-bar {
          flex-shrink: 0;
          background: #06101c;
          border-top: 1px solid rgba(255,255,255,0.07);
          padding: 16px 22px;
        }
        .arena-mod-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        /* ─── Competition effects ─── */
        .arena-you-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          background: rgba(255,255,255,0.16);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #fff;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.15em;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.28);
          z-index: 2;
          pointer-events: none;
          animation: youBadgeBlink 3.2s ease-in-out infinite;
        }
        .arena-spotlight-green { animation: spotlightGreen 1.8s ease-in-out infinite; border-color: rgba(79,198,106,0.65) !important; }
        .arena-spotlight-blue  { animation: spotlightBlue  1.8s ease-in-out infinite; border-color: rgba(108,168,245,0.65) !important; }
        .score-flash { animation: scoreGain 0.52s cubic-bezier(0.34,1.56,0.64,1) both; display: inline-block; }
        .arena-reply-urgent-green {
          background: rgba(79,198,106,0.22) !important;
          border-color: rgba(79,198,106,0.80) !important;
          color: #4fc66a !important;
          animation: replyPulseGreen 1.1s ease-in-out infinite;
        }
        .arena-reply-urgent-blue {
          background: rgba(108,168,245,0.22) !important;
          border-color: rgba(108,168,245,0.80) !important;
          color: #6ca8f5 !important;
          animation: replyPulseBlue 1.1s ease-in-out infinite;
        }
        .arena-question-card-waiting {
          animation: awaitingPulse 2.8s ease-in-out infinite !important;
        }

        /* ─── Mobile ─── */
        @media (max-width: 767px) {
          .arena-header {
            padding: 0 14px;
            height: 56px;
            gap: 10px;
          }
          .arena-header-center { display: none; }
          .arena-brand-sub     { display: none; }
          .arena-timer-box {
            font-size: 20px;
            padding: 6px 14px;
            min-width: 82px;
            border-radius: 10px;
          }
          .arena-status-label { font-size: 12px; letter-spacing: 0.04em; }
          .arena-status-row   { gap: 10px; }

          .arena-question-wrap { padding: 12px 10px 10px; flex: none; }
          .arena-question-card { border-radius: 16px; }
          .arena-question-inner { padding: 20px 18px 18px; gap: 10px; }
          .arena-question-text { font-size: clamp(1rem, 4.5vw, 1.4rem); }

          .arena-stage-grid {
            grid-template-columns: 1fr 1fr;
            grid-template-areas: "compA compB" "mod mod";
            gap: 8px;
            padding: 0 8px 12px;
          }
          .arena-media-bar {
            padding: 10px 12px;
            overflow-x: auto;
          }
          .arena-mod-bar  { padding: 12px 12px; }
          .arena-mod-controls { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }
          .arena-reply-urgent-green,
          .arena-reply-urgent-blue { padding: 14px 0 !important; font-size: 16px !important; border-radius: 12px !important; letter-spacing: 0.1em !important; }
        }
        @media (max-width: 420px) {
          .arena-timer-box { font-size: 17px; min-width: 72px; }
          .arena-question-inner { padding: 16px 14px; }
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="arena-header">
        {/* Left: Logo + brand */}
        <button
          type="button"
          onClick={() => navigate('/arena')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
            padding: 0,
            flexShrink: 0,
          }}
        >
          <LogoMark />
          <div className="arena-brand-text">
            <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: T.text, lineHeight: 1.2 }}>Konesans+</p>
            <p className="arena-brand-sub" style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.textMuted, lineHeight: 1.2 }}>Competition</p>
          </div>
        </button>

        {/* Center: Question pill */}
        <div className="arena-header-center">
          {questionNumber > 0
            ? `Q ${String(questionNumber).padStart(2, '0')}${totalQuestions > 0 ? ` — ${String(totalQuestions).padStart(2, '0')}` : ''}`
            : 'En attente du match'}
        </div>

        {/* Right: status + timer */}
        <div className="arena-status-row">
          <div className="arena-status-badge">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: isDirectLive ? T.red : isPaused ? T.gold : 'rgba(255,255,255,0.22)',
                boxShadow: isDirectLive ? `0 0 10px ${T.red}` : 'none',
                animation: isDirectLive ? 'pulseDot 1.4s ease-in-out infinite' : 'none',
                flexShrink: 0,
                display: 'inline-block',
              }}
            />
            <span
              className="arena-status-label"
              style={{ color: isDirectLive ? T.red : isPaused ? T.gold : T.textMuted }}
            >
              {isPaused ? 'PAUSE' : isDirectLive ? 'EN DIRECT' : 'PRÊT'}
            </span>
          </div>

          {spectatorCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span style={{ fontSize: 14, lineHeight: 1, color: T.textSoft }}>●</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: T.textMuted, letterSpacing: '0.05em' }}>
                {spectatorCount} spectateur{spectatorCount > 1 ? 's' : ''}
              </span>
            </div>
          )}

          <div
            className="arena-timer-box"
            style={{ color: timeLeft !== null && timeLeft <= 10 && isDirectLive ? T.red : T.text }}
          >
            <span
              key={timeLeft !== null && timeLeft <= 10 && isDirectLive ? `beat-${timeLeft}` : 'idle'}
              style={{
                display: 'block',
                animation: timeLeft !== null && timeLeft <= 10 && isDirectLive ? 'beatSecond 0.38s ease both' : 'none',
              }}
            >
              {formatTimer(timeLeft)}
            </span>
          </div>
        </div>
      </header>

      {/* ── Stage ──────────────────────────────────────────────────────── */}
      <div className="arena-stage">
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
        <div className="arena-question-wrap">
          <div
            key={`q-${currentQuestion?.id ?? 'idle'}`}
            className={`arena-question-card${phase === 'waiting' ? ' arena-question-card-waiting' : ''}`}
            style={{ boxShadow: phase !== 'waiting' ? '0 0 80px rgba(230,194,122,0.18), 0 20px 60px rgba(0,0,0,0.5)' : undefined }}
          >
            {/* Phase accent bar at top */}
            <div
              style={{
                height: 4,
                background:
                  phase === 'live-question'
                    ? `linear-gradient(90deg, ${T.gold}, ${T.goldLight}, ${T.gold}99)`
                    : phase === 'live-between'
                    ? `linear-gradient(90deg, ${T.green}, #88ffb0, ${T.green}99)`
                    : phase === 'paused'
                    ? `linear-gradient(90deg, ${T.red}88, ${T.red}44)`
                    : 'rgba(0,0,0,0.06)',
                transition: 'background 0.6s ease',
              }}
            />
            <div className="arena-question-inner">
              {currentQuestionTarget && phase === 'live-question' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 14px',
                    borderRadius: 999,
                    background: 'rgba(0,0,0,0.06)',
                    color: '#5a6a82',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.11em',
                  }}
                >
                  POUR {(currentQuestionTarget.displayName ?? `COMPÉTITEUR ${currentQuestionTarget.slot}`).toUpperCase()}
                </span>
              )}
              <h1 className="arena-question-text">
                {questionPanelText}
              </h1>
            </div>
          </div>
        </div>

        {/* 3-panel video grid */}
        <div className="arena-stage-grid">
          <div className="arena-cell-a">
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
          </div>

          <div className="arena-cell-mod">
            <ModeratorPanel
              displayName={moderatorProfile.displayName}
              stageParticipant={moderatorStage}
              isLocal={user?.id === moderatorProfile.userId}
            />
          </div>

          <div className="arena-cell-b">
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
      </div>

      {/* ── Camera / mic controls ───────────────────────────────────────── */}
      {canControlLocalMedia && (
        <div className="arena-media-bar">
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
        <div className="arena-mod-bar">
          <div className="arena-mod-controls">
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

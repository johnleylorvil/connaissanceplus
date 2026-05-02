import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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

const T = {
  bg: '#09111d',
  bgGlow: '#19283d',
  panel: 'rgba(11, 20, 33, 0.92)',
  panelSoft: 'rgba(15, 26, 41, 0.82)',
  panelGlass: 'rgba(18, 28, 45, 0.74)',
  border: 'rgba(196, 205, 223, 0.14)',
  borderStrong: 'rgba(226, 232, 240, 0.24)',
  text: '#f8fafc',
  textMuted: 'rgba(226, 232, 240, 0.72)',
  textSoft: 'rgba(191, 202, 219, 0.6)',
  gold: '#e6c27a',
  green: '#79e08f',
  greenSoft: 'rgba(121, 224, 143, 0.18)',
  blue: '#8fb9ff',
  red: '#ff6f7d',
  redSoft: 'rgba(255, 111, 125, 0.16)',
}

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
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?'
}

function getQuestionPanelText(opts: {
  phase: CompetitionPhase
  isOralQuestion: boolean
  questionPrompt: string | null
  currentQuestionTarget: QuestionTarget | null
}) {
  if (opts.phase === 'waiting') return 'Le modérateur peut lancer la première question.'
  if (opts.phase === 'live-waiting') return 'La prochaine question va commencer.'
  if (opts.phase === 'paused') return 'Le match est en pause. La scène reste prête pour la reprise.'
  if (opts.phase === 'live-between') return 'Question clôturée. Le modérateur rend sa décision.'
  if (opts.phase === 'live-question' && opts.questionPrompt) return opts.questionPrompt
  if (opts.phase === 'live-question' && opts.isOralQuestion) {
    return opts.currentQuestionTarget
      ? `Question orale pour ${opts.currentQuestionTarget.displayName ?? `Compétiteur ${opts.currentQuestionTarget.slot}`}.`
      : 'Question orale posée en direct.'
  }
  return 'Préparation du plateau live.'
}

function getStageStatusLabel(phase: CompetitionPhase) {
  switch (phase) {
    case 'paused':
      return 'EN PAUSE'
    case 'live-question':
    case 'live-waiting':
    case 'live-between':
      return 'EN DIRECT'
    default:
      return 'PRÊT'
  }
}

function getStageStatusStyle(phase: CompetitionPhase): CSSProperties {
  if (phase === 'paused') {
    return {
      background: 'rgba(230, 194, 122, 0.16)',
      border: '1px solid rgba(230, 194, 122, 0.34)',
      color: '#f7deb0',
    }
  }
  if (phase === 'live-question' || phase === 'live-waiting' || phase === 'live-between') {
    return {
      background: T.redSoft,
      border: '1px solid rgba(255, 111, 125, 0.35)',
      color: '#ffc4cb',
    }
  }
  return {
    background: 'rgba(143, 185, 255, 0.12)',
    border: '1px solid rgba(143, 185, 255, 0.28)',
    color: '#d7e5ff',
  }
}

function getStageParticipantForUser(
  stageParticipants: StageParticipant[],
  subjectUserId: string | null | undefined,
  currentUserId: string | undefined,
) {
  if (!subjectUserId) return null
  if (currentUserId && subjectUserId === currentUserId) {
    return stageParticipants.find((participant) => participant.isLocal) ?? null
  }
  return stageParticipants.find((participant) => participant.identity === subjectUserId) ?? null
}

function getScoreFill(score: number, totalQuestions: number, bestScore: number) {
  const denominator = Math.max(totalQuestions, bestScore, 1)
  return `${Math.min((score / denominator) * 100, 100)}%`
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
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de mettre à jour la diffusion publique.')
    } finally {
      setStatusRequest(null)
    }
  }

  const isYoutube = stream?.provider === 'youtube' && Boolean(stream.streamUrl)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '14px 16px', borderRadius: 18, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.03)' }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.12em', fontWeight: 800, color: T.textSoft }}>DIFFUSION PUBLIQUE</p>
        <p style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 800, color: T.text }}>
          {isYoutube
            ? `YouTube Live ${stream?.status === 'live' ? 'actif' : stream?.status === 'stopped' ? 'terminé' : 'prêt'}`
            : 'Aucun lien public configuré'}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: T.textMuted }}>
          {isYoutube
            ? 'La page spectateurs reste séparée de la scène privée des compétiteurs.'
            : 'Ajoutez un lien YouTube depuis l’admin si vous voulez ouvrir ce match aux spectateurs.'}
        </p>
      </div>

      {isYoutube && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            onClick={() => updateStatus('live')}
            disabled={statusRequest !== null}
            style={{
              padding: '11px 14px',
              borderRadius: 999,
              border: '1px solid rgba(121,224,143,0.32)',
              background: 'rgba(121,224,143,0.12)',
              color: '#d2f6db',
              fontWeight: 800,
              cursor: statusRequest ? 'default' : 'pointer',
            }}
          >
            {statusRequest === 'live' ? 'OUVERTURE...' : 'OUVRIR AU PUBLIC'}
          </button>
          <button
            type="button"
            onClick={() => updateStatus('stopped')}
            disabled={statusRequest !== null}
            style={{
              padding: '11px 14px',
              borderRadius: 999,
              border: '1px solid rgba(255,111,125,0.3)',
              background: 'rgba(255,111,125,0.12)',
              color: '#ffd0d5',
              fontWeight: 800,
              cursor: statusRequest ? 'default' : 'pointer',
            }}
          >
            {statusRequest === 'stopped' ? 'FERMETURE...' : 'FERMER LE PUBLIC'}
          </button>
          <a
            href={`/arena/watch/${competitionId}`}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '11px 14px',
              borderRadius: 999,
              border: `1px solid ${T.borderStrong}`,
              color: T.text,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            PAGE SPECTATEURS
          </a>
        </div>
      )}

      {errorMessage && <p style={{ margin: 0, fontSize: 12, color: '#ffd0d5' }}>{errorMessage}</p>}
    </div>
  )
}

type MediaFrameProps = {
  stageParticipant: StageParticipant | null
  isLocal: boolean
  accent: string
  children?: ReactNode
}

function MediaFrame({ stageParticipant, isLocal, accent, children }: MediaFrameProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const cameraTrack = stageParticipant?.cameraPublication?.track ?? null
  const micTrack = stageParticipant?.micPublication?.track ?? null
  const cameraEnabled = stageParticipant?.isCameraEnabled ?? false
  const displayName = stageParticipant?.displayName ?? stageParticipant?.identity ?? 'Participant'

  useEffect(() => {
    const element = videoRef.current
    if (!element || !cameraTrack) return
    cameraTrack.attach(element)
    return () => {
      cameraTrack.detach(element)
    }
  }, [cameraTrack])

  useEffect(() => {
    const element = audioRef.current
    if (!element || !micTrack || isLocal) return
    micTrack.attach(element)
    return () => {
      micTrack.detach(element)
    }
  }, [isLocal, micTrack])

  return (
    <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden', background: '#050a12' }}>
      {cameraEnabled ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.08), rgba(5,10,18,0.98))',
          }}
        >
          <div
            style={{
              width: 78,
              height: 78,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 900,
              color: accent,
              border: `1px solid ${accent}66`,
              background: `${accent}12`,
              boxShadow: `0 0 40px ${accent}24`,
            }}
          >
            {getInitials(displayName)}
          </div>
        </div>
      )}

      {!isLocal && <audio ref={audioRef} autoPlay />}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(5,10,18,0.08) 0%, rgba(5,10,18,0.3) 58%, rgba(5,10,18,0.84) 100%)',
        }}
      />
      {children}
    </div>
  )
}

type CompetitorCardProps = {
  participant: MatchParticipant
  stageParticipant: StageParticipant | null
  isLocal: boolean
  isOnline: boolean
  isTargeted: boolean
  canReplyHere: boolean
  onReply: () => void
  buttonLabel: string
  scoreFill: string
  accent: string
  hasSubmitted: boolean
  statusLabel: string
}

function CompetitorCard({
  participant,
  stageParticipant,
  isLocal,
  isOnline,
  isTargeted,
  canReplyHere,
  onReply,
  buttonLabel,
  scoreFill,
  accent,
  hasSubmitted,
  statusLabel,
}: CompetitorCardProps) {
  const micActive = stageParticipant?.isMicEnabled ?? false

  return (
    <article
      style={{
        borderRadius: 24,
        overflow: 'hidden',
        border: `1px solid ${isTargeted ? 'rgba(121,224,143,0.45)' : T.borderStrong}`,
        background: T.panelGlass,
        boxShadow: isTargeted ? '0 0 0 1px rgba(121,224,143,0.2), 0 18px 60px rgba(121,224,143,0.16)' : '0 18px 60px rgba(2, 6, 13, 0.46)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <MediaFrame stageParticipant={stageParticipant} isLocal={isLocal} accent={accent}>
        <div style={{ position: 'absolute', top: 14, left: 14 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '6px 10px',
              borderRadius: 999,
              background: 'rgba(8,15,27,0.55)',
              border: `1px solid ${T.border}`,
              color: T.text,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            Compétiteur {participant.slot}
          </span>
        </div>

        {micActive && (
          <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 3, height: 10, borderRadius: 999, background: '#ffd8dc', animation: 'voiceBars 0.85s ease-in-out infinite' }} />
            <span style={{ width: 3, height: 16, borderRadius: 999, background: '#ffd8dc', animation: 'voiceBars 0.9s ease-in-out infinite 0.08s' }} />
            <span style={{ width: 3, height: 12, borderRadius: 999, background: '#ffd8dc', animation: 'voiceBars 0.75s ease-in-out infinite 0.15s' }} />
          </div>
        )}

        {isTargeted && (
          <div style={{ position: 'absolute', left: 14, bottom: 14 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 999,
                background: T.greenSoft,
                border: '1px solid rgba(121,224,143,0.35)',
                color: '#dff7e5',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.green, boxShadow: '0 0 14px rgba(121,224,143,0.8)' }} />
              À SON TOUR
            </span>
          </div>
        )}
      </MediaFrame>

      <div style={{ padding: '16px 18px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, color: T.textMuted, fontWeight: 700 }}>
              {isOnline ? 'En ligne' : 'Hors ligne'}
            </p>
            <h3
              style={{
                margin: '6px 0 0',
                fontSize: 18,
                lineHeight: 1.05,
                color: T.text,
                fontWeight: 800,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {participant.displayName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onReply}
            disabled={!canReplyHere}
            style={{
              padding: '12px 20px',
              borderRadius: 999,
              border: `1px solid ${canReplyHere ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.1)'}`,
              background: canReplyHere ? 'linear-gradient(180deg, rgba(245,248,255,0.94), rgba(217,225,239,0.88))' : 'rgba(255,255,255,0.08)',
              color: canReplyHere ? '#111827' : T.textMuted,
              fontSize: 14,
              fontWeight: 800,
              cursor: canReplyHere ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
              boxShadow: canReplyHere ? '0 10px 28px rgba(255,255,255,0.18)' : 'none',
            }}
          >
            {buttonLabel}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 14, alignItems: 'center', marginTop: 14 }}>
          <div style={{ fontSize: 48, lineHeight: 0.92, color: accent, fontWeight: 900 }}>{participant.score}</div>
          <div>
            <div style={{ height: 14, borderRadius: 999, background: 'rgba(255,255,255,0.11)', overflow: 'hidden' }}>
              <div
                style={{
                  width: scoreFill,
                  height: '100%',
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${accent}, rgba(255,255,255,0.88))`,
                }}
              />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: hasSubmitted ? '#dff7e5' : T.textMuted, fontWeight: 700 }}>
              {statusLabel}
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}

type ModeratorCardProps = {
  displayName: string
  stageParticipant: StageParticipant | null
  isLocal: boolean
  isOnline: boolean
}

function ModeratorCard({ displayName, stageParticipant, isLocal, isOnline }: ModeratorCardProps) {
  return (
    <article
      style={{
        borderRadius: 24,
        overflow: 'hidden',
        border: '1px solid rgba(230,194,122,0.42)',
        background: T.panelGlass,
        boxShadow: '0 18px 60px rgba(2, 6, 13, 0.46), 0 0 0 1px rgba(230,194,122,0.15)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <MediaFrame stageParticipant={stageParticipant} isLocal={isLocal} accent={T.gold}>
        <div style={{ position: 'absolute', top: 14, left: 14 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '6px 10px',
              borderRadius: 999,
              background: 'rgba(230,194,122,0.15)',
              border: '1px solid rgba(230,194,122,0.28)',
              color: '#f7deb0',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.08em',
            }}
          >
            MODÉRATEUR
          </span>
        </div>
      </MediaFrame>

      <div style={{ padding: '18px 18px 20px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: T.textMuted, fontWeight: 700 }}>{isOnline ? 'En ligne' : 'Connexion en attente'}</p>
        <h3 style={{ margin: '8px 0 0', fontSize: 20, color: T.text, fontWeight: 800 }}>{displayName}</h3>
      </div>
    </article>
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
    arenaApi.getLiveState(competitionId)
      .then((liveState) => {
        const live = liveState as { participants?: Array<{ userId: string }> }
        setIsRegisteredCompetitor(Boolean(live.participants?.some((participant) => participant.userId === user.id)))
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
    state,
    leaderboard,
    roundEnded,
    competitionResult,
    error,
    isPaused,
    onlineParticipantIds,
    onlineUsers,
    submissionStatuses,
  } = socketState

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
    const fromState = (liveState?.participants ?? []).map((participant) => {
      const row = liveLeaderboard.find((entry) => entry.participantUserId === participant.userId)
      return {
        participantUserId: participant.userId,
        displayName: participant.displayName,
        score: row?.score ?? 0,
        slot: participant.slot,
      }
    })

    const seeded = fromState.length > 0
      ? fromState
      : liveLeaderboard.slice(0, 2).map((row, index) => ({
          participantUserId: row.participantUserId,
          displayName: row.displayName,
          score: row.score,
          slot: (index === 0 ? 'A' : 'B') as 'A' | 'B',
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
    const slot = currentQuestion.position % 2 === 1 ? 'A' as const : 'B' as const
    const participant = participants.find((entry) => entry.slot === slot)
    return participant
      ? { participantUserId: participant.participantUserId, displayName: participant.displayName, slot }
      : null
  }, [currentQuestion, liveState?.currentQuestionTarget, participants])

  const userMode: UserMode = useMemo(() => {
    if (isModerator) return 'moderator'
    if (isRegisteredCompetitor && user?.id && participants.some((participant) => participant.participantUserId === user.id)) {
      return 'competitor'
    }
    return 'spectator'
  }, [isModerator, isRegisteredCompetitor, participants, user?.id])

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
      return Math.max(0, Math.round((startedAt + (secondsPerQuestion * 1000) - Date.now()) / 1000))
    }

    setTimeLeft(computeRemaining())
    timerRef.current = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value === null || value <= 0) return 0
        return value - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
    }
  }, [currentQuestion, currentQuestionEndTime, currentQuestionStartedAt, questionIsClosed, secondsPerQuestion])

  useEffect(() => {
    if (!currentQuestion?.questionId || !accessToken) {
      setQuestionPrompt(null)
      return
    }

    let cancelled = false
    arenaApi.getArenaQuestion(currentQuestion.questionId, accessToken)
      .then((question) => {
        if (!cancelled) setQuestionPrompt(question.prompt)
      })
      .catch(() => {
        if (!cancelled) setQuestionPrompt(null)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, currentQuestion?.questionId])

  useEffect(() => {
    if (!competitionId || !accessToken || userMode === 'spectator' || !canControlLocalMedia) return
    arenaApi.getRtcToken(competitionId, accessToken)
      .then((data) => {
        setRtcUrl(data.url)
        setRtcToken(data.token)
      })
      .catch(() => {})
  }, [accessToken, canControlLocalMedia, competitionId, userMode])

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
  const bestScore = participants.length > 0 ? Math.max(...participants.map((participant) => participant.score)) : 0
  const leaders = participants.filter((participant) => participant.score === bestScore)
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
    const moderatorMatch = liveState?.matchParticipants?.find((entry) => entry.role === 'moderator')
    if (moderatorMatch) {
      return { userId: moderatorMatch.userId, displayName: moderatorMatch.displayName }
    }
    if (isModerator && user) {
      return { userId: user.id, displayName: `${user.firstName} ${user.lastName}`.trim() }
    }
    return { userId: null, displayName: 'Modérateur' }
  }, [isModerator, liveState?.matchParticipants, user])

  const competitorA = participants.find((participant) => participant.slot === 'A') ?? participants[0]
  const competitorB = participants.find((participant) => participant.slot === 'B') ?? participants[1]

  const competitorAStage = getStageParticipantForUser(stageParticipants, competitorA?.participantUserId, user?.id)
  const competitorBStage = getStageParticipantForUser(stageParticipants, competitorB?.participantUserId, user?.id)
  const moderatorStage = getStageParticipantForUser(stageParticipants, moderatorProfile.userId, user?.id)

  const competitorAOnline = Boolean(competitorA && (onlineParticipantIds.includes(competitorA.participantUserId) || competitorAStage))
  const competitorBOnline = Boolean(competitorB && (onlineParticipantIds.includes(competitorB.participantUserId) || competitorBStage))
  const moderatorOnline = Boolean(
    moderatorProfile.userId
      ? onlineUsers.some((entry: { userId: string; role: string }) => entry.userId === moderatorProfile.userId)
      : false,
  ) || Boolean(moderatorStage) || (isModerator && stageConnected)

  const questionPanelText = getQuestionPanelText({
    phase,
    isOralQuestion,
    questionPrompt,
    currentQuestionTarget,
  })

  const adminFetch = async (url: string, method = 'PATCH', body?: unknown) => {
    try {
      const init: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
      if (body) init.body = JSON.stringify(body)
      const response = await fetch(url, init)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        alert(data.message || 'Erreur')
      }
    } catch (requestError) {
      alert((requestError as Error).message)
    }
  }

  const nextQuestionNumber = Math.min(questionNumber + 1, totalQuestions)
  const canOpenFirstQuestion = phase === 'waiting'
  const canOpenNextQuestion = isLive && (phase === 'live-waiting' || phase === 'live-between') && questionNumber < totalQuestions
  const canCloseQuestion = isLive && phase === 'live-question' && Boolean(currentQuestion)
  const canScoreQuestion = isLive && phase === 'live-between' && Boolean(currentQuestion)

  if (phase === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at top, ${T.bgGlow}, ${T.bg} 46%)` }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', border: `3px solid ${T.border}`, borderTopColor: T.gold, animation: 'spin 0.8s linear infinite' }} />
          <p style={{ margin: 0, color: T.textMuted, fontWeight: 800, letterSpacing: '0.14em' }}>CONNEXION À LA SCÈNE...</p>
        </div>
      </div>
    )
  }

  if (phase === 'finished') {
    const podium = (competitionResult as { podium?: ArenaLeaderboardRow[] } | null)?.podium ?? liveLeaderboard.slice(0, 3)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at top, rgba(230,194,122,0.18), ${T.bg} 42%)`, padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 560, borderRadius: 28, border: `1px solid ${T.borderStrong}`, background: T.panel, padding: 30, boxShadow: '0 22px 70px rgba(2, 6, 13, 0.52)' }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.textSoft, letterSpacing: '0.16em' }}>MATCH TERMINÉ</p>
          <h1 style={{ margin: '10px 0 0', fontSize: 38, lineHeight: 0.98, color: T.gold }}>Fin de rencontre</h1>
          {podium[0] && <p style={{ margin: '10px 0 0', color: T.text, fontSize: 16 }}>Vainqueur: {podium[0].displayName}</p>}

          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {podium.slice(0, 3).map((entry, index) => (
              <div
                key={entry.participantUserId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 18px',
                  borderRadius: 18,
                  border: `1px solid ${index === 0 ? 'rgba(230,194,122,0.38)' : T.border}`,
                  background: index === 0 ? 'rgba(230,194,122,0.08)' : 'rgba(255,255,255,0.03)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: index === 0 ? 'rgba(230,194,122,0.18)' : 'rgba(255,255,255,0.06)', color: index === 0 ? T.gold : T.text, fontWeight: 900 }}>
                    {index + 1}
                  </span>
                  <span style={{ color: T.text, fontSize: 16, fontWeight: 800 }}>{entry.displayName}</span>
                </div>
                <span style={{ color: index === 0 ? T.gold : T.text, fontSize: 24, fontWeight: 900 }}>{entry.score}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => navigate('/arena')}
            style={{
              marginTop: 24,
              padding: '14px 20px',
              borderRadius: 999,
              border: 'none',
              background: 'linear-gradient(135deg, #f0d59a, #d7ab4f)',
              color: '#1b1509',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            RETOUR À L’ARENA
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '20px 14px 40px',
        background: `radial-gradient(circle at top, ${T.bgGlow}, ${T.bg} 48%)`,
        color: T.text,
      }}
    >
      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.82); }
        }
        @keyframes voiceBars {
          0%, 100% { transform: scaleY(0.55); opacity: 0.65; }
          50% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>

      <div style={{ width: '100%', maxWidth: 1320, margin: '0 auto' }}>
        {(error || isPaused) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {error && (
              <div style={{ padding: '12px 16px', borderRadius: 16, background: 'rgba(255,111,125,0.12)', border: '1px solid rgba(255,111,125,0.25)', color: '#ffd0d5', fontWeight: 700 }}>
                {error}
              </div>
            )}
            {isPaused && (
              <div style={{ padding: '12px 16px', borderRadius: 16, background: 'rgba(230,194,122,0.12)', border: '1px solid rgba(230,194,122,0.25)', color: '#f7deb0', fontWeight: 700 }}>
                Match en pause. La scène reste figée jusqu’à reprise du modérateur.
              </div>
            )}
          </div>
        )}

        <header
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
            alignItems: 'center',
            gap: 16,
            padding: '18px 18px',
            borderRadius: 28,
            border: `1px solid ${T.border}`,
            background: 'linear-gradient(180deg, rgba(10,16,27,0.96), rgba(12,18,31,0.88))',
            boxShadow: '0 20px 60px rgba(2, 6, 13, 0.45)',
            backdropFilter: 'blur(18px)',
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/arena')}
            style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', minWidth: 0, textAlign: 'left' }}
          >
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: '50%',
                border: '1px solid rgba(230,194,122,0.35)',
                background: 'radial-gradient(circle at 30% 30%, rgba(230,194,122,0.22), rgba(12,18,31,0.92))',
                color: T.gold,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              K+
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: T.textSoft }}>ARENA LIVE</p>
              <p style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {liveState?.competitionName ?? 'Match Arena'}
              </p>
            </div>
          </button>

          <div style={{ justifySelf: 'center', padding: '14px 26px', borderRadius: 999, border: `1px solid ${T.borderStrong}`, background: 'linear-gradient(180deg, rgba(38,47,62,0.84), rgba(28,37,52,0.84))', color: T.text, fontSize: 18, fontWeight: 800, textAlign: 'center', minWidth: 240 }}>
            {questionNumber > 0 ? `Question ${questionNumber}` : 'En attente du match'}
          </div>

          <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 18px',
                borderRadius: 999,
                fontWeight: 900,
                letterSpacing: '0.05em',
                ...getStageStatusStyle(phase),
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: phase === 'paused' ? T.gold : T.red, animation: phase === 'waiting' ? 'none' : 'pulseDot 1.4s ease-in-out infinite' }} />
              {getStageStatusLabel(phase)}
            </span>

            <div style={{ minWidth: 116, textAlign: 'center', padding: '10px 18px', borderRadius: 18, border: `1px solid ${T.borderStrong}`, background: 'rgba(255,255,255,0.06)', fontSize: 26, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              {formatTimer(timeLeft)}
            </div>
          </div>
        </header>

        <main style={{ marginTop: 18 }}>
          <section
            style={{
              borderRadius: 34,
              padding: '44px 28px 34px',
              border: `1px solid ${T.border}`,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
              boxShadow: '0 24px 80px rgba(2, 6, 13, 0.48)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: 760,
                  minHeight: 210,
                  borderRadius: 30,
                  border: '1px solid rgba(235, 241, 255, 0.75)',
                  background: 'linear-gradient(180deg, rgba(247,250,255,0.98), rgba(232,238,248,0.96))',
                  color: '#121a29',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.25), 0 0 55px rgba(230,194,122,0.34)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '30px 34px',
                  position: 'relative',
                }}
              >
                {currentQuestionTarget && (
                  <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 14px',
                        borderRadius: 999,
                        background: 'rgba(17,24,39,0.08)',
                        color: '#2f3a4d',
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                      }}
                    >
                      POUR {currentQuestionTarget.displayName ?? `COMPÉTITEUR ${currentQuestionTarget.slot}`}
                    </span>
                  </div>
                )}
                <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 4rem)', lineHeight: 1.08, fontWeight: 700, maxWidth: 620 }}>
                  {questionPanelText}
                </h1>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_0.86fr_1.05fr] lg:items-end">
              <CompetitorCard
                participant={competitorA}
                stageParticipant={competitorAStage}
                isLocal={user?.id === competitorA.participantUserId}
                isOnline={competitorAOnline}
                isTargeted={currentQuestionTarget?.participantUserId === competitorA.participantUserId && phase === 'live-question'}
                canReplyHere={Boolean(user?.id === competitorA.participantUserId && canSignalAnswer)}
                onReply={() => {
                  if (!currentQuestion || !user?.id) return
                  submitAnswer(currentQuestion.id, user.id)
                }}
                buttonLabel={(submissionStatuses[competitorA.participantUserId] as SubmissionSnapshot | undefined)?.submitted ? 'Signalé' : 'Répondre'}
                scoreFill={getScoreFill(competitorA.score, totalQuestions, bestScore)}
                accent={T.green}
                hasSubmitted={Boolean((submissionStatuses[competitorA.participantUserId] as SubmissionSnapshot | undefined)?.submitted)}
                statusLabel={
                  (submissionStatuses[competitorA.participantUserId] as SubmissionSnapshot | undefined)?.submitted
                    ? 'Réponse signalée'
                    : currentQuestionTarget?.participantUserId === competitorA.participantUserId && phase === 'live-question'
                      ? 'Question en cours pour lui'
                      : competitorAOnline
                        ? 'Prêt à intervenir'
                        : 'Connexion en attente'
                }
              />

              <ModeratorCard
                displayName={moderatorProfile.displayName}
                stageParticipant={moderatorStage}
                isLocal={user?.id === moderatorProfile.userId}
                isOnline={moderatorOnline}
              />

              <CompetitorCard
                participant={competitorB}
                stageParticipant={competitorBStage}
                isLocal={user?.id === competitorB.participantUserId}
                isOnline={competitorBOnline}
                isTargeted={currentQuestionTarget?.participantUserId === competitorB.participantUserId && phase === 'live-question'}
                canReplyHere={Boolean(user?.id === competitorB.participantUserId && canSignalAnswer)}
                onReply={() => {
                  if (!currentQuestion || !user?.id) return
                  submitAnswer(currentQuestion.id, user.id)
                }}
                buttonLabel={(submissionStatuses[competitorB.participantUserId] as SubmissionSnapshot | undefined)?.submitted ? 'Signalé' : 'Répondre'}
                scoreFill={getScoreFill(competitorB.score, totalQuestions, bestScore)}
                accent={T.blue}
                hasSubmitted={Boolean((submissionStatuses[competitorB.participantUserId] as SubmissionSnapshot | undefined)?.submitted)}
                statusLabel={
                  (submissionStatuses[competitorB.participantUserId] as SubmissionSnapshot | undefined)?.submitted
                    ? 'Réponse signalée'
                    : currentQuestionTarget?.participantUserId === competitorB.participantUserId && phase === 'live-question'
                      ? 'Question en cours pour lui'
                      : competitorBOnline
                        ? 'Prêt à intervenir'
                        : 'Connexion en attente'
                }
              />
            </div>

            {canControlLocalMedia && (
              <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
                <button
                  type="button"
                  onClick={toggleCamera}
                  disabled={isCameraLoading}
                  style={{
                    padding: '12px 18px',
                    borderRadius: 999,
                    border: `1px solid ${localCameraEnabled ? T.borderStrong : 'rgba(121,224,143,0.3)'}`,
                    background: localCameraEnabled ? 'rgba(255,255,255,0.08)' : 'rgba(121,224,143,0.12)',
                    color: localCameraEnabled ? T.text : '#dff7e5',
                    fontWeight: 800,
                    cursor: isCameraLoading ? 'default' : 'pointer',
                  }}
                >
                  {isCameraLoading ? 'Caméra...' : localCameraEnabled ? 'Couper la caméra' : 'Activer la caméra'}
                </button>
                <button
                  type="button"
                  onClick={toggleMic}
                  style={{
                    padding: '12px 18px',
                    borderRadius: 999,
                    border: `1px solid ${localMicEnabled ? T.borderStrong : 'rgba(121,224,143,0.3)'}`,
                    background: localMicEnabled ? 'rgba(255,255,255,0.08)' : 'rgba(121,224,143,0.12)',
                    color: localMicEnabled ? T.text : '#dff7e5',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {localMicEnabled ? 'Couper le micro' : 'Activer le micro'}
                </button>
              </div>
            )}

            {stagePermissionError && (
              <p style={{ margin: '14px 0 0', textAlign: 'center', color: '#ffd0d5', fontSize: 13, fontWeight: 700 }}>
                {stagePermissionError}
              </p>
            )}
          </section>

          {isModerator && (
            <section
              style={{
                marginTop: 18,
                padding: '22px 20px',
                borderRadius: 28,
                border: `1px solid ${T.border}`,
                background: 'linear-gradient(180deg, rgba(12,18,31,0.92), rgba(9,15,26,0.88))',
                boxShadow: '0 18px 60px rgba(2, 6, 13, 0.42)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.14em', fontWeight: 800, color: T.textSoft }}>COMMANDES MODÉRATEUR</p>
                  <h2 style={{ margin: '8px 0 0', fontSize: 28, lineHeight: 1, color: T.text }}>Régie du match</h2>
                  <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.55, color: T.textMuted }}>
                    Question {questionNumber || 0}/{totalQuestions || 0}
                    {currentQuestionTarget ? ` · Pour ${currentQuestionTarget.displayName ?? `Compétiteur ${currentQuestionTarget.slot}`}` : ''}
                  </p>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
                  {(canOpenFirstQuestion || canOpenNextQuestion) && (
                    <button
                      type="button"
                      onClick={() => adminFetch(`${ARENA_API}/competitions/${competitionId}/next-round`, 'POST')}
                      style={{ padding: '12px 16px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #c7defe, #7bb9ff)', color: '#0b1626', fontWeight: 900, cursor: 'pointer' }}
                    >
                      {canOpenFirstQuestion ? 'LANCER LE MATCH' : `OUVRIR LA QUESTION ${nextQuestionNumber}`}
                    </button>
                  )}

                  {canCloseQuestion && currentQuestion && (
                    <button
                      type="button"
                      onClick={() => adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/end`)}
                      style={{ padding: '12px 16px', borderRadius: 999, border: '1px solid rgba(255,111,125,0.28)', background: 'rgba(255,111,125,0.12)', color: '#ffd0d5', fontWeight: 900, cursor: 'pointer' }}
                    >
                      CLÔTURER
                    </button>
                  )}

                  {isLive && (
                    <button
                      type="button"
                      onClick={() => adminFetch(`${ARENA_API}/competitions/${competitionId}/${isPaused ? 'resume' : 'pause'}`)}
                      style={{ padding: '12px 16px', borderRadius: 999, border: `1px solid ${T.borderStrong}`, background: 'rgba(255,255,255,0.08)', color: T.text, fontWeight: 900, cursor: 'pointer' }}
                    >
                      {isPaused ? 'REPRENDRE' : 'PAUSE'}
                    </button>
                  )}
                </div>
              </div>

              {canScoreQuestion && currentQuestion && (
                <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/score`, 'PATCH', { verdict: 'correct' })}
                    style={{ padding: '12px 16px', borderRadius: 999, border: '1px solid rgba(121,224,143,0.3)', background: 'rgba(121,224,143,0.12)', color: '#dff7e5', fontWeight: 900, cursor: 'pointer' }}
                  >
                    BONNE RÉPONSE
                  </button>
                  <button
                    type="button"
                    onClick={() => adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/score`, 'PATCH', { verdict: 'incorrect' })}
                    style={{ padding: '12px 16px', borderRadius: 999, border: '1px solid rgba(255,111,125,0.28)', background: 'rgba(255,111,125,0.12)', color: '#ffd0d5', fontWeight: 900, cursor: 'pointer' }}
                  >
                    MAUVAISE RÉPONSE
                  </button>
                  <button
                    type="button"
                    onClick={() => adminFetch(`${ARENA_API}/rounds/${currentQuestion.id}/score`, 'PATCH', { verdict: 'cancelled' })}
                    style={{ padding: '12px 16px', borderRadius: 999, border: `1px solid ${T.borderStrong}`, background: 'rgba(255,255,255,0.08)', color: T.text, fontWeight: 900, cursor: 'pointer' }}
                  >
                    QUESTION ANNULÉE
                  </button>
                </div>
              )}

              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: '14px 16px', borderRadius: 20, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.03)' }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.textMuted }}>
                    {currentQuestionTarget
                      ? `Décision attendue pour ${currentQuestionTarget.displayName ?? `Compétiteur ${currentQuestionTarget.slot}`}. Une bonne réponse vaut 1 point.`
                      : 'Le vainqueur est déterminé au nombre de bonnes réponses.'}
                  </p>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <button
                    type="button"
                    disabled={!uniqueWinner}
                    onClick={async () => {
                      if (!uniqueWinner) {
                        alert('Impossible de terminer le match: il y a une égalité en tête.')
                        return
                      }
                      if (!window.confirm(`Déclarer ${uniqueWinner.displayName} vainqueur et terminer le match ?`)) return
                      await adminFetch(`${ARENA_API}/competitions/${competitionId}/complete`, 'PATCH', { participantUserId: uniqueWinner.participantUserId })
                    }}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 999,
                      border: '1px solid rgba(230,194,122,0.32)',
                      background: 'rgba(230,194,122,0.14)',
                      color: '#f7deb0',
                      fontWeight: 900,
                      cursor: uniqueWinner ? 'pointer' : 'default',
                      opacity: uniqueWinner ? 1 : 0.58,
                    }}
                  >
                    TERMINER LE MATCH
                  </button>
                  {!uniqueWinner && <span style={{ fontSize: 12, color: '#ffd0d5' }}>Égalité en tête: départagez avant de clôturer.</span>}
                </div>

                <PublicStreamPanel competitionId={competitionId} accessToken={accessToken} />
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import KonesansLogo from '../../components/KonesansLogo'
import { arenaApi, ARENA_API, type ArenaLeaderboardRow, type ArenaPublicStream } from '../arenaApi'
import { useLiveKitStage, type StageParticipant } from '../hooks/useLiveKitStage'
import { useArenaSocket } from '../useArenaSocket'
import { Maximize2, Minimize2 } from 'lucide-react'

type UserMode = 'competitor' | 'moderator' | 'spectator'
type FeaturedStage = 'A' | 'M' | 'B' | null

type MatchParticipant = {
  participantUserId: string
  schoolId?: string | null
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
  schoolId?: string | null
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
  participants?: Array<{ userId: string; schoolId?: string | null; displayName: string; city?: string | null; department?: string | null; slot: 'A' | 'B' }>
  matchParticipants?: Array<{ userId: string; schoolId?: string | null; displayName: string; city?: string | null; department?: string | null; role: 'competitorA' | 'competitorB' | 'moderator' }>
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
  isFeatured: boolean
  onToggleFeatured: () => void
}

function CompetitorPanel({
  participant,
  stageParticipant,
  isLocal,
  isFeatured,
  onToggleFeatured,
}: CompetitorPanelProps) {
  const isSpeaking = (stageParticipant?.participant as { isSpeaking?: boolean } | undefined)?.isSpeaking ?? false
  const initials = getInitials(participant.displayName)
  const slotColor = participant.slot === 'A' ? T.green : T.blue

  return (
    <article
      className={`arena-video-card arena-competitor-article${isFeatured ? ' arena-video-card-featured' : ''}`}
      style={{ borderColor: isFeatured ? `${slotColor}88` : 'rgba(255,255,255,0.12)' }}
    >
      <div className="arena-video-frame">
        <VideoRenderer
          stageParticipant={stageParticipant}
          isLocal={isLocal}
          avatarText={initials}
          avatarColor={slotColor}
        />
        <AudioRenderer stageParticipant={stageParticipant} isLocal={isLocal} />
        <div className="arena-video-shade" />
        <button
          type="button"
          className="arena-focus-button"
          onClick={onToggleFeatured}
          aria-label={isFeatured ? 'Revenir a la vue normale' : `Mettre ${participant.displayName} en avant`}
          title={isFeatured ? 'Vue normale' : 'Mettre en avant'}
        >
          {isFeatured ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
        </button>
        {isLocal && <div className="arena-you-badge">VOUS</div>}
        <div className="arena-participant-name-overlay arena-video-nameplate">
          <p>Ecole {participant.slot}</p>
          <strong>{participant.displayName}</strong>
        </div>
        {isSpeaking && <div className="arena-speaking-indicator"><AudioWave /></div>}
      </div>

      <div className="arena-video-footer">
        <span>Ecole {participant.slot}</span>
        <strong>{participant.displayName}</strong>
      </div>
    </article>
  )
}

// ??? ModeratorPanel ───────────────────────────────────────────────────────────
function ModeratorPanel({
  displayName,
  stageParticipant,
  isLocal,
  isFeatured,
  onToggleFeatured,
}: {
  displayName: string
  stageParticipant: StageParticipant | null
  isLocal: boolean
  isFeatured: boolean
  onToggleFeatured: () => void
}) {
  const initials = getInitials(displayName)
  const isSpeaking = (stageParticipant?.participant as { isSpeaking?: boolean } | undefined)?.isSpeaking ?? false

  return (
    <article
      className={`arena-video-card arena-moderator-card${isFeatured ? ' arena-video-card-featured' : ''}`}
      style={{ borderColor: isFeatured ? `${T.gold}aa` : 'rgba(230,194,122,0.45)' }}
    >
      <div className="arena-video-frame">
        <VideoRenderer
          stageParticipant={stageParticipant}
          isLocal={isLocal}
          avatarText={initials}
          avatarColor={T.gold}
        />
        <AudioRenderer stageParticipant={stageParticipant} isLocal={isLocal} />
        <div className="arena-video-shade" />
        <button
          type="button"
          className="arena-focus-button"
          onClick={onToggleFeatured}
          aria-label={isFeatured ? 'Revenir a la vue normale' : 'Mettre le moderateur en avant'}
          title={isFeatured ? 'Vue normale' : 'Mettre en avant'}
        >
          {isFeatured ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
        </button>
        {isLocal && <div className="arena-you-badge">VOUS</div>}
        <div className="arena-participant-name-overlay arena-video-nameplate">
          <p>Moderateur</p>
          <strong>{displayName}</strong>
        </div>
        {isSpeaking && <div className="arena-speaking-indicator"><AudioWave /></div>}
      </div>

      <div className="arena-video-footer">
        <span>Moderateur</span>
        <strong>{displayName}</strong>
      </div>
    </article>
  )
}

// ??? PublicStreamPanel ────────────────────────────────────────────────────────
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
  return <KonesansLogo size={48} />
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
  const [featuredStage, setFeaturedStage] = useState<FeaturedStage>(null)

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

  const { socketState } = useArenaSocket(socketParams)
  const { state, leaderboard, roundEnded, competitionResult, error, isPaused, onlineParticipantIds, onlineUsers } =
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

  const participants = useMemo<MatchParticipant[]>(() => {
    const fromState = (liveState?.participants ?? []).map((p) => {
      const row = liveLeaderboard.find((e) => e.participantUserId === p.userId)
      return { participantUserId: p.userId, schoolId: p.schoolId ?? row?.schoolId ?? null, displayName: p.displayName, score: row?.score ?? 0, slot: p.slot }
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
        displayName: seeded.length === 0 ? 'Etablissement A' : 'Etablissement B',
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

  const completeMatchWithWinner = async (winner: MatchParticipant) => {
    if (!window.confirm(`Declarer ${winner.displayName} vainqueur et terminer le match ?`)) return
    await adminFetch(`${ARENA_API}/competitions/${competitionId}/complete`, 'PATCH', {
      participantUserId: winner.participantUserId,
    })
  }
  const canOpenFirstQuestion = phase === 'waiting'
  const isDirectLive = phase === 'live-question' || phase === 'live-waiting' || phase === 'live-between'

  const getStageCellClass = (slot: Exclude<FeaturedStage, null>, baseClass: string) => {
    if (!featuredStage) return baseClass
    if (featuredStage === slot) return `${baseClass} arena-cell-featured`
    const sideIndex = (['A', 'M', 'B'] as Array<Exclude<FeaturedStage, null>>).filter((value) => value !== featuredStage).indexOf(slot) + 1
    return `${baseClass} arena-cell-secondary arena-cell-side-${sideIndex}`
  }

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
        /* Tokens visuels: palette sombre institutionnelle et rayons cohérents */
        .arena-root {
          --surface-900: #0c1422;
          --surface-850: #101a2a;
          --surface-800: #132034;
          --surface-700: #1b2a3f;
          --border-soft: rgba(226, 234, 248, 0.10);
          --border-strong: rgba(226, 234, 248, 0.18);
          --text-main: #f3f7ff;
          --text-muted: #b7c2d5;
          --success-soft: rgba(79, 198, 106, 0.12);
          --info-soft: rgba(108, 168, 245, 0.12);
          --radius-sm: 8px;
          --radius-md: 12px;
          --radius-lg: 14px;
          --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.28);
          --shadow-md: 0 8px 22px rgba(0, 0, 0, 0.34);
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }

        /* Animations minimales et fonctionnelles */
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.9); }
        }
        @keyframes voiceBars {
          0%, 100% { transform: scaleY(0.58); opacity: 0.7; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes questionIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scoreFlash {
          0% { transform: scale(1); }
          45% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        @keyframes timerWarn {
          0%, 100% { color: #ff6b6b; }
          50% { color: #ff8585; }
        }
        @keyframes beatSecond {
          0% { transform: scale(1); }
          30% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @keyframes scoreGain {
          0% { transform: scale(1); }
          35% { transform: scale(1.13); }
          100% { transform: scale(1); }
        }
        @keyframes spotlightGreen {
          0%, 100% { box-shadow: 0 0 0 1px rgba(79,198,106,0.24), var(--shadow-md); }
          50% { box-shadow: 0 0 0 2px rgba(79,198,106,0.34), var(--shadow-md); }
        }
        @keyframes spotlightBlue {
          0%, 100% { box-shadow: 0 0 0 1px rgba(108,168,245,0.24), var(--shadow-md); }
          50% { box-shadow: 0 0 0 2px rgba(108,168,245,0.34), var(--shadow-md); }
        }
        @keyframes replyPulseGreen {
          0%, 100% { box-shadow: inset 0 0 0 0 rgba(79,198,106,0.0); }
          50% { box-shadow: inset 0 0 0 999px rgba(79,198,106,0.04); }
        }
        @keyframes replyPulseBlue {
          0%, 100% { box-shadow: inset 0 0 0 0 rgba(108,168,245,0.0); }
          50% { box-shadow: inset 0 0 0 999px rgba(108,168,245,0.04); }
        }
        @keyframes youBadgeBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.78; }
        }
        @keyframes awaitingPulse {
          0%, 100% { box-shadow: var(--shadow-sm); }
          50% { box-shadow: var(--shadow-md); }
        }

        /* En-tête: lisibilité forte, style outil SaaS mature */
        .arena-header {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 72px;
          padding: 0 24px;
          gap: 16px;
          position: sticky;
          top: 0;
          z-index: 10;
          background: #0f1827;
          border-bottom: 1px solid var(--border-soft);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03);
        }
        .arena-brand-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .arena-brand-sub {
          color: var(--text-muted) !important;
        }
        .arena-header-center {
          max-width: min(44vw, 540px); padding: 0; border: 0; background: transparent;
          color: var(--text-main);
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }
        .arena-header-center strong { display: block; overflow: hidden; text-overflow: ellipsis; font-size: 14px; }
        .arena-status-row {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-shrink: 0;
        }
        .arena-status-badge {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .arena-status-label {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.07em;
        }
        .arena-timer-box {
          min-width: 112px;
          padding: 8px 16px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-strong);
          background: #101a2b;
          color: var(--text-main);
          text-align: center;
          font-size: 26px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.03em;
          box-shadow: var(--shadow-sm);
        }

        /* Scène: fond plus sobre, sans halo agressif */
        .arena-stage {
          flex: 1;
          display: flex;
          flex-direction: column;
          position: relative;
          background: linear-gradient(180deg, #0b1320 0%, #0a121f 100%);
        }

        /* Question: priorité visuelle sur le contenu texte */
        .arena-question-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 24px 16px;
        }
        .arena-question-card {
          width: 100%;
          max-width: 900px;
          overflow: hidden;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-soft);
          background: var(--surface-850);
          box-shadow: var(--shadow-md) !important;
          animation: questionIn 0.26s ease-out both;
        }
        .arena-question-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 12px;
          padding: 28px 40px 24px;
        }
        .arena-question-text {
          margin: 0;
          max-width: 760px;
          color: var(--text-main);
          font-size: clamp(1.32rem, 2.7vw, 2.35rem);
          font-weight: 700;
          line-height: 1.24;
          letter-spacing: -0.01em;
        }

        /* Grille live: structure identique, cartes uniformisées */
        .arena-stage-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          grid-template-areas: "compA mod compB";
          gap: 12px;
          padding: 0 14px 16px;
          align-items: end;
        }
        .arena-cell-a { grid-area: compA; }
        .arena-cell-mod { grid-area: mod; }
        .arena-cell-b { grid-area: compB; }

        /* Surcharge des styles inline des cartes pour réduire les effets néon */
        .arena-competitor-article,
        .arena-cell-mod article {
          border-radius: var(--radius-lg) !important;
          border-width: 1px !important;
          box-shadow: var(--shadow-md) !important;
        }
        .arena-cell-a .arena-competitor-article {
          border-color: rgba(79, 198, 106, 0.22) !important;
        }
        .arena-cell-b .arena-competitor-article {
          border-color: rgba(108, 168, 245, 0.22) !important;
        }
        .arena-competitor-article > div:last-child,
        .arena-cell-mod article > div:last-child {
          background: var(--surface-800) !important;
          border-top-color: var(--border-soft) !important;
        }
        .arena-competitor-article > div:last-child span[style*="font-size: 44"],
        .arena-competitor-article > div:last-child span[style*="font-size:44"] {
          text-shadow: none !important;
        }
        .arena-competitor-article > div:last-child > div > div > div {
          box-shadow: none !important;
        }

        /* Badges et accents: sobre, informatif, non décoratif */
        .arena-you-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 2;
          pointer-events: none;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--border-soft);
          background: rgba(15, 24, 39, 0.92);
          color: #e4ebf8;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.12em;
          animation: youBadgeBlink 4s ease-in-out infinite;
        }
        .arena-spotlight-green {
          border-color: rgba(79,198,106,0.42) !important;
          animation: spotlightGreen 2.4s ease-in-out infinite;
        }
        .arena-spotlight-blue {
          border-color: rgba(108,168,245,0.42) !important;
          animation: spotlightBlue 2.4s ease-in-out infinite;
        }
        .score-flash {
          display: inline-block;
          animation: scoreGain 0.34s ease-out both;
        }

        /* Boutons de réponse: logique existante, langage visuel pro */
        .arena-reply-urgent-green {
          background: var(--success-soft) !important;
          border-color: rgba(79,198,106,0.48) !important;
          color: #bde9ca !important;
          animation: replyPulseGreen 1.4s ease-in-out infinite;
        }
        .arena-reply-urgent-blue {
          background: var(--info-soft) !important;
          border-color: rgba(108,168,245,0.48) !important;
          color: #c5ddff !important;
          animation: replyPulseBlue 1.4s ease-in-out infinite;
        }
        .arena-question-card-waiting {
          animation: awaitingPulse 3.2s ease-in-out infinite !important;
        }

        /* Barres d'actions: proches des conventions visio enterprise */
        .arena-media-bar,
        .arena-mod-bar {
          flex-shrink: 0;
          background: #0f1827;
          border-top: 1px solid var(--border-soft);
        }
        .arena-media-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
        }
        .arena-mod-bar {
          padding: 16px 20px;
        }
        .arena-mod-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }
        .arena-media-bar button,
        .arena-mod-controls button,
        .arena-stage-grid article button {
          border-radius: 999px !important;
          box-shadow: none !important;
          transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
        }
        .arena-media-bar button:hover,
        .arena-mod-controls button:hover,
        .arena-stage-grid article button:hover {
          filter: brightness(1.06);
        }

        /* Adaptation mobile: grille et lisibilité conservées */
        .arena-stage-layout {
          flex: 1; min-height: 0; display: grid;
          grid-template-columns: minmax(0, 1fr) 370px; gap: 24px;
          padding: 32px 24px 20px; align-items: start;
        }
        .arena-question-wrap { width: 100%; padding: 0; min-height: 0; align-self: start; }
        .arena-question-card { max-width: 760px; }
        .arena-question-inner { min-height: 210px; justify-content: center; padding: 30px 36px; }
        .arena-question-text { font-size: clamp(1.35rem, 2.35vw, 2rem); }
        .arena-stage-grid {
          display: flex; flex-direction: column; gap: 10px; padding: 0;
          align-self: center; width: 100%;
        }
        .arena-cell-mod { order: -1; }
        .arena-competitor-article, .arena-cell-mod article {
          display: grid !important; grid-template-columns: 148px minmax(0, 1fr);
          min-height: 132px; overflow: hidden;
        }
        .arena-competitor-article > div:first-child,
        .arena-cell-mod article > div:first-child { aspect-ratio: auto !important; min-height: 132px; }
        .arena-competitor-article > div:last-child { padding: 11px 13px !important; justify-content: center; gap: 9px !important; }
        .arena-participant-name-overlay, .arena-moderator-video-badge { display: none; }
        .arena-compact-participant-meta { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .arena-compact-participant-meta span, .arena-compact-role { color: var(--text-muted); font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
        .arena-compact-participant-meta strong { overflow: hidden; color: var(--text-main); font-size: 14px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
        .arena-compact-score-row > span { min-width: 38px !important; font-size: 34px !important; }
        .arena-compact-score-row button { padding: 7px 0 !important; font-size: 11px !important; }
        .arena-cell-mod article > div:last-child { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 5px; padding: 14px !important; text-align: left !important; }
        .arena-cell-mod article > div:last-child p { font-size: 15px !important; }
        .arena-media-bar { justify-content: center; }
        .arena-mod-controls { max-width: 1180px; margin: 0 auto; }

        @media (max-width: 900px) {
          .arena-stage-layout { display: flex; flex-direction: column; gap: 10px; padding: 10px; }
          .arena-header {
            height: 56px;
            padding: 0 12px;
            gap: 10px;
          }
          .arena-header-center { display: none; }
          .arena-brand-sub { display: none; }
          .arena-status-row { gap: 10px; }
          .arena-status-label {
            font-size: 12px;
            letter-spacing: 0.05em;
          }
          .arena-timer-box {
            min-width: 80px;
            padding: 6px 12px;
            border-radius: 10px;
            font-size: 20px;
          }

          .arena-question-wrap {
            flex: none; min-height: 190px; padding: 0;
          }
          .arena-question-card {
            border-radius: 12px;
          }
          .arena-question-inner {
            min-height: 150px; padding: 20px 18px 18px;
            gap: 10px;
          }
          .arena-question-text {
            font-size: clamp(1rem, 4.5vw, 1.4rem);
          }

          .arena-stage-grid {
            flex-direction: row; gap: 8px; padding: 0 0 4px;
            overflow-x: auto; align-self: auto;
          }
          .arena-stage-grid > div { min-width: 300px; }
          .arena-competitor-article, .arena-cell-mod article { grid-template-columns: 120px minmax(0, 1fr); }
          .arena-cell-mod { order: 0; }
          .arena-media-bar {
            position: sticky; bottom: 0; z-index: 12; padding: 10px 12px;
            overflow-x: auto;
          }
          .arena-mod-bar {
            padding: 12px;
          }
          .arena-mod-controls {
            flex-wrap: nowrap;
            overflow-x: auto;
            padding-bottom: 4px;
          }
          .arena-reply-urgent-green,
          .arena-reply-urgent-blue {
            border-radius: 10px !important;
            padding: 12px 0 !important;
            font-size: 15px !important;
            letter-spacing: 0.08em !important;
          }
        }
        @media (max-width: 420px) {
          .arena-timer-box {
            min-width: 72px;
            font-size: 17px;
          }
          .arena-question-inner {
            padding: 16px 14px;
          }
        }


        /* Broadcast Arena: transforme le live en plateau humain et competitif */
        .arena-stage {
          isolation: isolate;
          overflow: hidden;
          background:
            linear-gradient(180deg, rgba(4, 8, 16, 0.34), rgba(4, 8, 16, 0.72)),
            repeating-linear-gradient(90deg, #15191f 0 74px, #8d101c 74px 142px, #15191f 142px 214px, #101318 214px 286px);
        }
        .arena-stage::before {
          content: '';
          position: absolute;
          inset: 48px 24px 88px;
          z-index: 0;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 18px);
          pointer-events: none;
        }
        .arena-broadcast-scoreboard {
          position: relative;
          z-index: 5;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 78px minmax(150px, 210px) 78px minmax(0, 1fr);
          grid-template-areas:
            "teamA scoreA center scoreB teamB"
            "name name center watch watch";
          align-items: stretch;
          min-height: 72px;
          color: #ffffff;
          filter: drop-shadow(0 14px 22px rgba(0,0,0,0.32));
        }
        .broadcast-team {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 12px;
          padding: 0 22px;
          font-size: clamp(1rem, 2vw, 1.65rem);
          font-weight: 900;
          text-transform: uppercase;
        }
        .broadcast-team strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .broadcast-team-a {
          grid-area: teamA;
          background: linear-gradient(90deg, #2088c7, #55aee7);
        }
        .broadcast-team-b {
          grid-area: teamB;
          justify-content: flex-end;
          background: linear-gradient(90deg, #b7081b, #df1730);
        }
        .broadcast-team-initials {
          flex: 0 0 auto;
          width: 42px;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.86);
          background: rgba(255,255,255,0.18);
          font-size: 0.82rem;
          font-weight: 950;
        }
        .broadcast-score {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #eef5ff;
          color: #5b78a4;
          font-size: clamp(2.1rem, 4vw, 3.35rem);
          font-weight: 950;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .broadcast-score-a { grid-area: scoreA; }
        .broadcast-score-b { grid-area: scoreB; }
        .broadcast-center {
          grid-area: center;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          padding: 6px 18px;
          background: #ffd916;
          color: #0c1730;
          text-align: center;
          text-transform: uppercase;
          clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%);
        }
        .broadcast-center::before {
          content: '';
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          width: 18px;
          height: 32px;
          background: #cf1127;
          clip-path: polygon(46% 0, 100% 0, 64% 42%, 100% 42%, 34% 100%, 52% 55%, 16% 55%);
        }
        .broadcast-center strong {
          margin-top: 14px;
          font-size: 18px;
          font-weight: 950;
          letter-spacing: 0;
        }
        .broadcast-center span:last-child {
          font-size: 20px;
          font-weight: 950;
          font-variant-numeric: tabular-nums;
        }
        .broadcast-live {
          min-width: 68px;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(12, 23, 48, 0.16);
          color: #0c1730;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.08em;
        }
        .broadcast-live.is-live {
          background: #cf1127;
          color: #fff;
          animation: liveBlink 1.35s ease-in-out infinite;
        }
        .broadcast-meta {
          min-width: 0;
          padding: 6px 18px;
          background: rgba(5, 9, 17, 0.78);
          color: rgba(255,255,255,0.82);
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .broadcast-meta-name {
          grid-area: name;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .broadcast-meta-watch {
          grid-area: watch;
          text-align: right;
        }
        .arena-stage-layout {
          position: relative;
          z-index: 1;
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: clamp(12px, 2.2vh, 20px);
          padding: clamp(16px, 2.5vw, 32px) clamp(16px, 3vw, 36px) 92px;
          align-items: stretch;
        }
        .arena-question-wrap {
          order: 2;
          flex: 0 0 auto;
          width: min(100%, 1180px);
          min-height: auto;
          align-self: center;
          padding: 0;
        }
        .arena-question-card {
          max-width: none;
          border-radius: 10px;
          border-color: rgba(255,255,255,0.18);
          background: rgba(7, 12, 24, 0.90);
          backdrop-filter: blur(12px);
        }
        .arena-question-inner {
          min-height: 128px;
          padding: clamp(18px, 2vw, 28px) clamp(18px, 3vw, 36px);
        }
        .arena-question-text {
          max-width: 1000px;
          font-size: clamp(1.18rem, 2.1vw, 2rem);
          line-height: 1.2;
          letter-spacing: 0;
        }
        .arena-stage-grid {
          order: 1;
          display: grid;
          grid-template-columns: minmax(0, 1.12fr) minmax(220px, 0.58fr) minmax(0, 1.12fr);
          grid-template-areas: "compA mod compB";
          gap: clamp(12px, 1.8vw, 22px);
          padding: 0;
          align-items: center;
          width: min(100%, 1280px);
          margin: 0 auto;
        }
        .arena-cell-mod { order: 0; }
        .arena-competitor-article,
        .arena-cell-mod article {
          display: flex !important;
          min-height: 0;
          border-radius: 10px !important;
          background: rgba(5, 9, 18, 0.94) !important;
          box-shadow: 0 18px 54px rgba(0,0,0,0.46) !important;
        }
        .arena-competitor-article > div:first-child {
          aspect-ratio: 16 / 10 !important;
          min-height: clamp(220px, 28vw, 410px) !important;
        }
        .arena-cell-mod article > div:first-child {
          aspect-ratio: 4 / 3 !important;
          min-height: clamp(170px, 20vw, 260px) !important;
        }
        .arena-competitor-article > div:last-child,
        .arena-cell-mod article > div:last-child {
          background: rgba(8, 14, 26, 0.98) !important;
        }
        .arena-lower-third {
          position: absolute;
          left: 24px;
          right: 24px;
          bottom: 14px;
          z-index: 6;
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr) 180px;
          align-items: center;
          min-height: 54px;
          border: 2px solid #0d2d91;
          background: #ffd916;
          color: #0d2d91;
          box-shadow: 0 16px 34px rgba(0,0,0,0.34);
          overflow: hidden;
          text-transform: uppercase;
        }
        .lower-third-brand,
        .lower-third-count {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0d2d91;
          color: #fff;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.06em;
        }
        .lower-third-main {
          min-width: 0;
          padding: 0 20px;
          overflow: hidden;
          color: #0d2d91;
          font-size: clamp(1rem, 1.8vw, 1.55rem);
          font-style: italic;
          font-weight: 950;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lower-third-count {
          background: #cf1127;
        }
        @keyframes liveBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.64; }
        }
        @media (max-width: 900px) {
          .arena-broadcast-scoreboard {
            grid-template-columns: minmax(0, 1fr) 48px 92px 48px minmax(0, 1fr);
            min-height: 58px;
          }
          .broadcast-team { gap: 7px; padding: 0 8px; font-size: 0.82rem; }
          .broadcast-team-initials { width: 30px; height: 30px; font-size: 0.64rem; }
          .broadcast-score { font-size: 2rem; }
          .broadcast-center { padding: 5px 8px; clip-path: none; }
          .broadcast-center::before { display: none; }
          .broadcast-center strong { margin-top: 0; font-size: 13px; }
          .broadcast-center span:last-child { font-size: 15px; }
          .broadcast-live { min-width: 54px; font-size: 9px; }
          .broadcast-meta { display: none; }
          .arena-stage::before { inset: 58px 10px 76px; }
          .arena-stage-layout { gap: 10px; padding: 12px 10px 82px; }
          .arena-stage-grid {
            display: grid;
            grid-template-columns: minmax(260px, 1fr) minmax(210px, 0.82fr) minmax(260px, 1fr);
            overflow-x: auto;
            align-items: stretch;
            width: 100%;
          }
          .arena-stage-grid > div { min-width: 0; }
          .arena-competitor-article,
          .arena-cell-mod article { grid-template-columns: none !important; }
          .arena-competitor-article > div:first-child { min-height: 190px !important; }
          .arena-cell-mod article > div:first-child { min-height: 160px !important; }
          .arena-question-inner { min-height: 112px; padding: 16px; }
          .arena-question-text { font-size: clamp(1rem, 4.4vw, 1.36rem); }
          .arena-lower-third {
            left: 10px;
            right: 10px;
            bottom: 10px;
            grid-template-columns: 116px minmax(0, 1fr);
            min-height: 46px;
          }
          .lower-third-brand { font-size: 10px; }
          .lower-third-main { padding: 0 12px; font-size: 0.94rem; }
          .lower-third-count { display: none; }
        }
        @media (max-width: 520px) {
          .arena-broadcast-scoreboard {
            grid-template-columns: minmax(0, 1fr) 42px 74px 42px minmax(0, 1fr);
          }
          .broadcast-team strong { max-width: 78px; }
          .broadcast-team-initials { display: none; }
          .broadcast-score { font-size: 1.72rem; }
          .broadcast-center strong { font-size: 11px; }
          .broadcast-center span:last-child { font-size: 13px; }
        }
        /* Simplified school live stage */
        .arena-header-center { display: flex; flex-direction: column; gap: 4px; text-align: center; }
        .arena-header-center span { overflow: hidden; color: var(--text-muted); font-size: 12px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
        .arena-stage { background: #080d16; }
        .arena-stage::before { display: none; }
        .arena-stage-layout { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; padding: clamp(16px, 2.5vw, 34px); }
        .arena-stage-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 0.62fr) minmax(0, 1fr); grid-template-areas: 'compA mod compB'; gap: clamp(14px, 2vw, 24px); width: min(100%, 1420px); margin: 0 auto; align-items: center; }
        .arena-stage-grid-focused { grid-template-columns: minmax(0, 1fr) minmax(260px, 360px); grid-template-rows: 1fr 1fr; grid-template-areas: none; align-items: stretch; }
        .arena-stage-grid-focused .arena-cell-featured { grid-column: 1; grid-row: 1 / span 2; }
        .arena-stage-grid-focused .arena-cell-side-1 { grid-column: 2; grid-row: 1; }
        .arena-stage-grid-focused .arena-cell-side-2 { grid-column: 2; grid-row: 2; }
        .arena-video-card { display: flex !important; flex-direction: column; min-height: 0; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px !important; background: #080d16 !important; box-shadow: 0 18px 54px rgba(0,0,0,0.42) !important; }
        .arena-video-card-featured { box-shadow: 0 22px 70px rgba(0,0,0,0.58) !important; }
        .arena-video-frame { position: relative; min-height: clamp(260px, 34vw, 520px); aspect-ratio: 16 / 10; overflow: hidden; background: #030710; flex: 1; }
        .arena-cell-secondary .arena-video-frame { min-height: 190px; }
        .arena-cell-mod:not(.arena-cell-featured) .arena-video-frame { min-height: clamp(210px, 24vw, 360px); }
        .arena-video-shade { position: absolute; inset: auto 0 0; height: 46%; background: linear-gradient(0deg, rgba(3,7,16,0.9), transparent); pointer-events: none; }
        .arena-video-nameplate { bottom: 16px !important; left: 16px !important; }
        .arena-video-nameplate p { margin: 0; color: rgba(255,255,255,0.66); font-size: 11px; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; }
        .arena-video-nameplate strong { display: block; margin-top: 4px; color: #fff; font-size: clamp(1rem, 1.8vw, 1.45rem); line-height: 1.08; }
        .arena-video-footer { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-top: 1px solid rgba(255,255,255,0.10); background: #0d1522 !important; }
        .arena-video-footer span { color: var(--text-muted); font-size: 11px; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; }
        .arena-video-footer strong { overflow: hidden; color: var(--text-main); font-size: 16px; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
        .arena-focus-button { position: absolute; top: 12px; right: 12px; z-index: 3; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: rgba(8,13,22,0.76); color: #fff; cursor: pointer; backdrop-filter: blur(8px); transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.16s ease; }
        .arena-focus-button:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.28); transform: translateY(-1px); }
        .arena-speaking-indicator { position: absolute; right: 16px; bottom: 18px; z-index: 2; }
        .arena-media-bar { justify-content: center; }
        /* Zoom-like focus refinements */
        .arena-header { height: 58px; padding: 0 18px; background: rgba(2, 4, 8, 0.92); border-bottom-color: rgba(255,255,255,0.08); }
        .arena-header button > div:first-child { transform: scale(0.86); transform-origin: left center; }
        .arena-brand-text p:first-child { font-size: 14px !important; }
        .arena-brand-sub { font-size: 11px !important; }
        .arena-header-center strong { font-size: 14px; }
        .arena-status-label { font-size: 12px; letter-spacing: 0.05em; }
        .arena-stage { background: #000; overflow: hidden; }
        .arena-stage-layout { padding: 0; align-items: stretch; justify-content: stretch; width: 100%; }
        .arena-stage-grid { width: 100%; max-width: none; min-height: calc(100vh - 184px); padding: clamp(10px, 1.4vw, 18px); }
        .arena-stage-grid-focused { position: relative; display: block !important; min-height: calc(100vh - 158px); height: calc(100vh - 158px); padding: 0; overflow: hidden; background: #000; }
        .arena-stage-grid-focused .arena-cell-featured { position: absolute; inset: 0; z-index: 1; }
        .arena-stage-grid-focused .arena-cell-featured .arena-video-card { height: 100%; border: 0 !important; border-radius: 0 !important; background: #000 !important; box-shadow: none !important; }
        .arena-stage-grid-focused .arena-cell-featured .arena-video-frame { height: 100%; min-height: 0 !important; aspect-ratio: auto !important; }
        .arena-stage-grid-focused .arena-cell-featured .arena-video-footer { display: none; }
        .arena-stage-grid-focused .arena-cell-secondary { position: absolute; right: 16px; z-index: 5; width: min(320px, 23vw); min-width: 220px; height: 178px; }
        .arena-stage-grid-focused .arena-cell-side-1 { top: 16px; }
        .arena-stage-grid-focused .arena-cell-side-2 { top: 206px; }
        .arena-stage-grid-focused .arena-cell-secondary .arena-video-card { height: 100%; border: 2px solid rgba(255,255,255,0.20) !important; border-radius: 8px !important; box-shadow: 0 10px 30px rgba(0,0,0,0.45) !important; }
        .arena-stage-grid-focused .arena-cell-secondary .arena-video-frame { height: 100%; min-height: 0 !important; aspect-ratio: auto !important; }
        .arena-stage-grid-focused .arena-cell-secondary .arena-video-footer { display: none; }
        .arena-stage-grid-focused .arena-cell-secondary .arena-video-nameplate { bottom: 8px !important; left: 8px !important; }
        .arena-stage-grid-focused .arena-cell-secondary .arena-video-nameplate p { display: none; }
        .arena-stage-grid-focused .arena-cell-secondary .arena-video-nameplate strong { max-width: 190px; overflow: hidden; padding: 3px 7px; border-radius: 5px; background: rgba(0,0,0,0.58); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
        .arena-stage-grid-focused .arena-cell-secondary .arena-focus-button { width: 30px; height: 30px; top: 8px; right: 8px; }
        .arena-stage-grid-focused .arena-cell-secondary .arena-focus-button svg { width: 14px; height: 14px; }
        .arena-video-card { border-radius: 8px !important; }
        .arena-video-frame { min-height: clamp(280px, 38vw, 590px); }
        .arena-video-footer { padding: 10px 12px; }
        .arena-video-footer strong { font-size: 14px; }
        .arena-focus-button { width: 34px; height: 34px; top: 10px; right: 10px; }
        .arena-focus-button svg { width: 16px; height: 16px; }
        .arena-media-bar, .arena-mod-bar { background: rgba(3, 6, 12, 0.90); border-top-color: rgba(255,255,255,0.10); }
        .arena-media-bar { min-height: 50px; padding: 7px 14px; gap: 7px; }
        .arena-mod-bar { padding: 8px 14px; }
        .arena-mod-controls { justify-content: center; gap: 7px; }
        .arena-media-bar button, .arena-mod-controls button { min-height: 34px !important; padding: 7px 11px !important; font-size: 12px !important; line-height: 1 !important; }
        .arena-mod-controls > span { font-size: 10px !important; }
        @media (max-width: 900px) {
          .arena-header { height: auto; min-height: 64px; padding: 10px 12px; }
          .arena-header-center { max-width: 42vw; }
          .arena-stage-layout { padding: 12px; }
          .arena-stage-grid, .arena-stage-grid-focused { display: flex; flex-direction: column; width: 100%; gap: 12px; }
          .arena-stage-grid > div, .arena-stage-grid-focused > div { width: 100%; }
          .arena-video-frame, .arena-cell-secondary .arena-video-frame, .arena-cell-mod:not(.arena-cell-featured) .arena-video-frame { min-height: 220px; }
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

        {/* Center: match title */}
        <div className="arena-header-center">
          <strong>{liveState?.competitionName ?? 'Match Arena'}</strong>
          <span>{isPaused ? 'Match en pause' : isDirectLive ? 'Match en direct' : 'En attente du match'}</span>
        </div>

        {/* Right: simple status */}
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
              {isPaused ? 'PAUSE' : isDirectLive ? 'EN DIRECT' : 'PRET'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Stage ──────────────────────────────────────────────────────── */}
      <div className="arena-stage">
        {(error || isPaused) && (
          <div style={{ padding: '14px 20px 0', display: 'flex', gap: 10, flexWrap: 'wrap', position: 'relative', zIndex: 2 }}>
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
                Match en pause
              </div>
            )}
          </div>
        )}

        <div className="arena-stage-layout">
          <div className={`arena-stage-grid${featuredStage ? ' arena-stage-grid-focused' : ''}`}>
            <div className={getStageCellClass('A', 'arena-cell-a')}>
              <CompetitorPanel
                participant={competitorA}
                stageParticipant={competitorAStage}
                isLocal={user?.id === competitorA.participantUserId}
                isFeatured={featuredStage === 'A'}
                onToggleFeatured={() => setFeaturedStage((current) => current === 'A' ? null : 'A')}
              />
            </div>

            <div className={getStageCellClass('M', 'arena-cell-mod')}>
              <ModeratorPanel
                displayName={moderatorProfile.displayName}
                stageParticipant={moderatorStage}
                isLocal={user?.id === moderatorProfile.userId}
                isFeatured={featuredStage === 'M'}
                onToggleFeatured={() => setFeaturedStage((current) => current === 'M' ? null : 'M')}
              />
            </div>

            <div className={getStageCellClass('B', 'arena-cell-b')}>
              <CompetitorPanel
                participant={competitorB}
                stageParticipant={competitorBStage}
                isLocal={user?.id === competitorB.participantUserId}
                isFeatured={featuredStage === 'B'}
                onToggleFeatured={() => setFeaturedStage((current) => current === 'B' ? null : 'B')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Camera / mic controls ───────────────────────────────────────── */}
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
              REGIE LIVE
            </span>

            {canOpenFirstQuestion && (
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
                LANCER LE MATCH
              </button>
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
              onClick={() => completeMatchWithWinner(competitorA)}
              style={{
                padding: '10px 16px',
                borderRadius: 999,
                border: '1px solid rgba(79,198,106,0.35)',
                background: 'rgba(79,198,106,0.12)',
                color: '#dff7e5',
                fontWeight: 900,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              TERMINER: {competitorA.displayName}
            </button>

            <button
              type="button"
              onClick={() => completeMatchWithWinner(competitorB)}
              style={{
                padding: '10px 16px',
                borderRadius: 999,
                border: '1px solid rgba(108,168,245,0.35)',
                background: 'rgba(108,168,245,0.12)',
                color: '#dcebff',
                fontWeight: 900,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              TERMINER: {competitorB.displayName}
            </button>
          </div>

          <PublicStreamPanel competitionId={competitionId} accessToken={accessToken} />
        </div>
      )}
    </div>
  )
}

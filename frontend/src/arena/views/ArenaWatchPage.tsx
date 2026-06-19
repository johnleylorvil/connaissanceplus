import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Hls from 'hls.js'
import { useAuth } from '../../context/AuthContext'
import { arenaApi, type ArenaLeaderboardRow, type ArenaPublicStream } from '../arenaApi'

const VIEWER_ID_KEY = (matchId: string) => `arena_viewer_${matchId}`
const CAN_PLAY_NATIVE_HLS =
  typeof document !== 'undefined'
    ? document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== ''
    : false

type LiveQuestion = {
  id: string
  position: number
  questionId: string | null
  startedAt: string | null
  endedAt: string | null
  endTime: string | null
}

type LiveState = {
  competitionName: string
  status: string
  currentRoundNumber: number
  currentQuestionNumber?: number
  totalRounds: number
  totalQuestions?: number
  secondsPerQuestion: number
  currentRound: LiveQuestion | null
  currentQuestion?: LiveQuestion | null
  participants?: Array<{ userId: string; displayName: string; slot: 'A' | 'B' }>
  currentQuestionTarget?: { participantUserId: string; displayName: string | null; slot: 'A' | 'B' } | null
}

type CompetitionPhase = 'waiting' | 'live' | 'paused' | 'between' | 'finished'

const T = {
  bg: '#09111d',
  bgGlow: '#19283d',
  panel: 'rgba(11, 20, 33, 0.92)',
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

function formatTimer(seconds: number | null) {
  if (seconds === null) return '--:--'
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.max(0, seconds % 60)).padStart(2, '0')}`
}

function getScoreFill(score: number, totalQuestions: number, bestScore: number) {
  const denominator = Math.max(totalQuestions, bestScore, 1)
  return `${Math.min((score / denominator) * 100, 100)}%`
}

function getPhase(liveState: LiveState | null): CompetitionPhase {
  if (!liveState) return 'waiting'
  if (liveState.status === 'completed') return 'finished'
  if (liveState.status === 'paused') return 'paused'
  if (liveState.status !== 'live') return 'waiting'
  const currentQuestion = liveState.currentQuestion ?? liveState.currentRound ?? null
  if (currentQuestion?.endedAt) return 'between'
  return 'live'
}

function getStatusStyle(phase: CompetitionPhase): CSSProperties {
  if (phase === 'paused') {
    return {
      background: 'rgba(230, 194, 122, 0.16)',
      border: '1px solid rgba(230, 194, 122, 0.34)',
      color: '#f7deb0',
    }
  }
  if (phase === 'live' || phase === 'between') {
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

function getStatusLabel(phase: CompetitionPhase) {
  switch (phase) {
    case 'paused':
      return 'EN PAUSE'
    case 'live':
    case 'between':
      return 'EN DIRECT'
    case 'finished':
      return 'TERMINÉ'
    default:
      return 'PRÊT'
  }
}

function getQuestionPanelText(opts: {
  phase: CompetitionPhase
  questionPrompt: string | null
  currentQuestionTarget: LiveState['currentQuestionTarget']
  hasVideo: boolean
}) {
  if (opts.phase === 'finished') return 'La rencontre est terminée.'
  if (opts.phase === 'paused') return 'Le match est en pause. La diffusion reprendra dès la décision du modérateur.'
  if (opts.phase === 'between') return 'Question clôturée. Le modérateur annonce sa décision.'
  if (opts.phase === 'waiting' && !opts.hasVideo) return 'La diffusion publique apparaîtra ici dès son ouverture.'
  if (opts.phase === 'waiting') return 'Le plateau se prépare avant l’ouverture du direct.'
  if (opts.questionPrompt) return opts.questionPrompt
  if (opts.currentQuestionTarget) {
    return `Question en cours pour ${opts.currentQuestionTarget.displayName ?? `Compétiteur ${opts.currentQuestionTarget.slot}`}.`
  }
  return 'Le direct est en cours.'
}

type SpectatorCompetitorCardProps = {
  label: string
  name: string
  score: number
  accent: string
  isTargeted: boolean
  scoreFill: string
  statusLabel: string
}

function SpectatorCompetitorCard({ label, name, score, accent, isTargeted, scoreFill, statusLabel }: SpectatorCompetitorCardProps) {
  return (
    <article
      style={{
        borderRadius: 24,
        padding: '18px 18px 20px',
        border: `1px solid ${isTargeted ? 'rgba(121,224,143,0.45)' : T.borderStrong}`,
        background: T.panelGlass,
        boxShadow: isTargeted ? '0 0 0 1px rgba(121,224,143,0.18), 0 18px 60px rgba(121,224,143,0.12)' : '0 18px 60px rgba(2, 6, 13, 0.42)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.08em', fontWeight: 800, color: T.textSoft }}>{label}</p>
          <h3 style={{ margin: '8px 0 0', fontSize: 20, lineHeight: 1.05, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</h3>
        </div>
        <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 0.9, color: accent }}>{score}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ height: 14, borderRadius: 999, background: 'rgba(255,255,255,0.11)', overflow: 'hidden' }}>
          <div style={{ width: scoreFill, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${accent}, rgba(255,255,255,0.88))` }} />
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: isTargeted ? '#dff7e5' : T.textMuted, fontWeight: 700 }}>
          {statusLabel}
        </p>
      </div>
    </article>
  )
}

export default function ArenaWatchPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { accessToken } = useAuth()

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof window.setInterval> | null>(null)

  const [broadcastStatus, setBroadcastStatus] = useState<'idle' | 'starting' | 'live' | 'stopped'>('idle')
  const [broadcastProvider, setBroadcastProvider] = useState<'none' | 'youtube' | 'hls'>('none')
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [chatUrl, setChatUrl] = useState<string | null>(null)
  const [viewerCount, setViewerCount] = useState<number>(0)
  const [muted, setMuted] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clockTick, setClockTick] = useState(() => Date.now())
  const [liveState, setLiveState] = useState<LiveState | null>(null)
  const [leaderboard, setLeaderboard] = useState<ArenaLeaderboardRow[]>([])
  const [questionPrompt, setQuestionPrompt] = useState<string | null>(null)

  const currentQuestion = liveState?.currentQuestion ?? liveState?.currentRound ?? null

  useEffect(() => {
    if (!matchId) return
    let stopped = false

    const poll = async () => {
      try {
        const data = await arenaApi.getBroadcast(matchId) as ArenaPublicStream
        if (stopped) return
        setBroadcastProvider(data.provider)
        setBroadcastStatus(data.status as typeof broadcastStatus)
        setPlaybackUrl(data.playbackUrl ?? null)
        setStreamUrl(data.streamUrl ?? null)
        setEmbedUrl(data.embedUrl ?? null)
        setChatUrl(data.chatUrl ?? null)
        if (data.status !== 'live') {
          setError(null)
        }
      } catch {
        // ignore polling errors for public stream metadata
      }
    }

    poll()
    const interval = window.setInterval(poll, 1500)
    return () => {
      stopped = true
      window.clearInterval(interval)
    }
  }, [matchId])

  useEffect(() => {
    if (!matchId) return

    const storedId = localStorage.getItem(VIEWER_ID_KEY(matchId))
    let viewerId: string | null = storedId

    const register = async () => {
      if (!viewerId) {
        try {
          const response = await arenaApi.viewerJoin(matchId) as { viewerId: string }
          viewerId = response.viewerId
          localStorage.setItem(VIEWER_ID_KEY(matchId), viewerId)
        } catch {
          return
        }
      }

      pingIntervalRef.current = window.setInterval(async () => {
        if (!viewerId || !matchId) return
        try {
          await arenaApi.viewerPing(matchId, viewerId)
        } catch {
          // ignore ping errors
        }

        try {
          const countResponse = await arenaApi.getViewerCount(matchId) as { count: number }
          setViewerCount(countResponse.count)
        } catch {
          // ignore viewer count errors
        }
      }, 25_000)
    }

    void register()
    return () => {
      if (pingIntervalRef.current) window.clearInterval(pingIntervalRef.current)
    }
  }, [matchId])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !playbackUrl || broadcastStatus !== 'live' || broadcastProvider !== 'hls') return

    setError(null)

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 8,
        maxBufferLength: 8,
        maxMaxBufferLength: 12,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
      })

      hlsRef.current = hls
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setError(null)
        void video.play().catch(() => {})
      })
      hls.loadSource(playbackUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
          setError('La diffusion se reconnecte...')
          return
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
          setError('Lecture en cours de récupération...')
          return
        }

        setError('Erreur de lecture — veuillez rafraîchir.')
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playbackUrl
      void video.play().catch(() => {})
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [playbackUrl, broadcastProvider, broadcastStatus])

  useEffect(() => {
    if (!matchId) return
    let cancelled = false

    const load = () => {
      Promise.all([
        arenaApi.getLiveState(matchId),
        arenaApi.getLiveLeaderboard(matchId),
      ])
        .then(([state, liveBoard]) => {
          if (cancelled) return
          setLiveState(state as LiveState)
          setLeaderboard(liveBoard)
        })
        .catch(() => {})
    }

    load()
    const interval = window.setInterval(load, 3000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [matchId])

  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    if (!currentQuestion || currentQuestion.endedAt) return

    timerRef.current = window.setInterval(() => {
      setClockTick(Date.now())
    }, 1000)

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [currentQuestion])

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

  const timeLeft = useMemo(() => {
    if (!currentQuestion || currentQuestion.endedAt) return null
    if (currentQuestion.endTime) {
      return Math.max(0, Math.round((new Date(currentQuestion.endTime).getTime() - clockTick) / 1000))
    }
    const startedAt = currentQuestion.startedAt ? new Date(currentQuestion.startedAt).getTime() : clockTick
    const durationMs = (liveState?.secondsPerQuestion ?? 30) * 1000
    return Math.max(0, Math.round((startedAt + durationMs - clockTick) / 1000))
  }, [clockTick, currentQuestion, liveState?.secondsPerQuestion])

  const playbackUnsupported = broadcastProvider === 'hls' && broadcastStatus === 'live' && !!playbackUrl && !Hls.isSupported() && !CAN_PLAY_NATIVE_HLS
  const displayError = playbackUnsupported ? 'Votre navigateur ne supporte pas la lecture HLS.' : error
  const phase = getPhase(liveState)
  const isLive = liveState?.status === 'live' || liveState?.status === 'paused'
  const hasVideo = broadcastStatus === 'live'
  const questionNumber = liveState?.currentQuestionNumber ?? liveState?.currentRoundNumber ?? 0
  const totalQuestions = liveState?.totalQuestions ?? liveState?.totalRounds ?? 0
  const hasYoutubeStream = broadcastProvider === 'youtube' && Boolean(streamUrl)
  const scoreByParticipantId = new Map(leaderboard.map((row) => [row.participantUserId, row.score]))
  const seededParticipants = (liveState?.participants ?? []).map((participant) => ({
    participantUserId: participant.userId,
    displayName: participant.displayName,
    score: scoreByParticipantId.get(participant.userId) ?? 0,
    slot: participant.slot,
  }))
  const teamA = seededParticipants.find((participant) => participant.slot === 'A')
    ?? (leaderboard[0]
      ? {
          participantUserId: leaderboard[0].participantUserId,
          displayName: leaderboard[0].displayName,
          score: leaderboard[0].score,
          slot: 'A' as const,
        }
      : null)
  const teamB = seededParticipants.find((participant) => participant.slot === 'B')
    ?? (leaderboard[1]
      ? {
          participantUserId: leaderboard[1].participantUserId,
          displayName: leaderboard[1].displayName,
          score: leaderboard[1].score,
          slot: 'B' as const,
        }
      : null)
  const bestScore = Math.max(teamA?.score ?? 0, teamB?.score ?? 0, 1)
  const questionPanelText = getQuestionPanelText({
    phase,
    questionPrompt,
    currentQuestionTarget: liveState?.currentQuestionTarget ?? null,
    hasVideo,
  })

  if (!matchId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at top, ${T.bgGlow}, ${T.bg} 48%)`, color: T.text }}>
        Identifiant de match manquant.
      </div>
    )
  }

  return (
    <div className="arena-watch" style={{ minHeight: '100vh', padding: '20px 14px 40px', background: `radial-gradient(circle at top, ${T.bgGlow}, ${T.bg} 48%)`, color: T.text }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.82); }
        }
      `}</style>

      <div className="arena-watch-shell" style={{ width: '100%', maxWidth: 1320, margin: '0 auto' }}>
        {displayError && (
          <div style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 16, background: 'rgba(255,111,125,0.12)', border: '1px solid rgba(255,111,125,0.25)', color: '#ffd0d5', fontWeight: 700 }}>
            {displayError}
          </div>
        )}

        <header className="arena-watch-header"
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
            onClick={() => navigate('/arena/spectator')}
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
              <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: T.textSoft }}>MODE SPECTATEUR</p>
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
                ...getStatusStyle(phase),
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: phase === 'paused' ? T.gold : T.red, animation: phase === 'waiting' || phase === 'finished' ? 'none' : 'pulseDot 1.4s ease-in-out infinite' }} />
              {getStatusLabel(phase)}
            </span>

            <div style={{ minWidth: 116, textAlign: 'center', padding: '10px 18px', borderRadius: 18, border: `1px solid ${T.borderStrong}`, background: 'rgba(255,255,255,0.06)', fontSize: 26, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              {formatTimer(timeLeft)}
            </div>
          </div>
        </header>

        <main className="arena-watch-main" style={{ marginTop: 18 }}>
          <section className="arena-watch-stage"
            style={{
              borderRadius: 34,
              padding: '44px 28px 34px',
              border: `1px solid ${T.border}`,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
              boxShadow: '0 24px 80px rgba(2, 6, 13, 0.48)',
            }}
          >
            <div className="arena-watch-question-wrap" style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
              <div className="arena-watch-question"
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
                {liveState?.currentQuestionTarget && (
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
                      POUR {liveState.currentQuestionTarget.displayName ?? `COMPÉTITEUR ${liveState.currentQuestionTarget.slot}`}
                    </span>
                  </div>
                )}

                <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 4rem)', lineHeight: 1.08, fontWeight: 700, maxWidth: 620 }}>
                  {questionPanelText}
                </h1>
              </div>
            </div>

            <div className="arena-watch-content grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
              <div className="arena-watch-video"
                style={{
                  position: 'relative',
                  borderRadius: 28,
                  overflow: 'hidden',
                  border: `1px solid ${T.borderStrong}`,
                  background: '#000',
                  boxShadow: '0 24px 70px rgba(2, 6, 13, 0.58)',
                }}
              >
                {hasVideo ? (
                  broadcastProvider === 'youtube' && embedUrl ? (
                    <iframe
                      src={embedUrl}
                      title={liveState?.competitionName ?? 'YouTube Live Arena'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                      style={{ width: '100%', display: 'block', aspectRatio: '16/9', border: 'none', background: '#000' }}
                    />
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        muted={muted}
                        playsInline
                        autoPlay
                        style={{ width: '100%', display: 'block', aspectRatio: '16/9', background: '#000' }}
                      />
                      {muted && (
                        <button
                          type="button"
                          onClick={() => {
                            setMuted(false)
                            if (videoRef.current) videoRef.current.muted = false
                          }}
                          style={{
                            position: 'absolute',
                            left: '50%',
                            bottom: 20,
                            transform: 'translateX(-50%)',
                            padding: '12px 22px',
                            borderRadius: 999,
                            border: '1px solid rgba(255,255,255,0.22)',
                            background: 'rgba(9,17,29,0.82)',
                            color: '#fff',
                            fontWeight: 800,
                            cursor: 'pointer',
                            backdropFilter: 'blur(10px)',
                          }}
                        >
                          Activer le son
                        </button>
                      )}
                    </>
                  )
                ) : (
                  <div style={{ aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at top, rgba(255,255,255,0.06), rgba(0,0,0,0.96) 58%)', padding: 24, textAlign: 'center' }}>
                    <div style={{ maxWidth: 420 }}>
                      <div style={{ width: 52, height: 52, margin: '0 auto 18px', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.12)', borderTopColor: T.gold, animation: 'spin 1s linear infinite' }} />
                      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.text }}>
                        {broadcastStatus === 'stopped' ? 'Diffusion terminée' : isLive ? 'Diffusion en cours...' : 'En attente du direct...'}
                      </p>
                      <p style={{ margin: '10px 0 0', fontSize: 13, color: T.textMuted, lineHeight: 1.6 }}>
                        {broadcastStatus === 'stopped'
                          ? 'La diffusion publique est terminée. Consultez l’Arena pour retrouver le résultat final.'
                          : hasYoutubeStream
                            ? 'Le direct est en cours. L’intégration YouTube apparaîtra ici dès que la diffusion externe est confirmée.'
                            : 'La diffusion apparaîtra ici dès qu’elle sera activée pour le public.'}
                      </p>
                    </div>
                  </div>
                )}

                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(5,10,18,0.08), rgba(5,10,18,0.22) 58%, rgba(5,10,18,0.76))' }} />

                <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ padding: '7px 12px', borderRadius: 999, background: 'rgba(9,17,29,0.78)', border: `1px solid ${T.border}`, color: T.text, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
                    QUESTION {questionNumber || 0}/{totalQuestions || 0}
                  </span>
                  {liveState?.currentQuestionTarget && (
                    <span style={{ padding: '7px 12px', borderRadius: 999, background: 'rgba(9,17,29,0.78)', border: `1px solid ${T.border}`, color: T.text, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
                      POUR {liveState.currentQuestionTarget.displayName ?? `Compétiteur ${liveState.currentQuestionTarget.slot}`}
                    </span>
                  )}
                  <span style={{ padding: '7px 12px', borderRadius: 999, background: 'rgba(9,17,29,0.78)', border: `1px solid ${T.border}`, color: T.text, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
                    {broadcastProvider === 'youtube' ? 'YOUTUBE LIVE' : broadcastProvider === 'hls' ? 'FLUX HLS' : 'PRÉPARATION'}
                  </span>
                </div>
              </div>

              <aside className="arena-watch-aside" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: '18px 18px', borderRadius: 24, border: `1px solid ${T.borderStrong}`, background: T.panelGlass, boxShadow: '0 18px 60px rgba(2, 6, 13, 0.4)', backdropFilter: 'blur(16px)' }}>
                  <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.12em', fontWeight: 800, color: T.textSoft }}>INFOS LIVE</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 14 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, color: T.textMuted }}>Spectateurs</p>
                      <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 900, color: T.text }}>{viewerCount}</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, color: T.textMuted }}>Chrono</p>
                      <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 900, color: timeLeft !== null && timeLeft <= 5 ? '#ffd0d5' : T.text }}>{formatTimer(timeLeft)}</p>
                    </div>
                  </div>
                </div>

                {(streamUrl || chatUrl) && (
                  <div style={{ padding: '18px 18px', borderRadius: 24, border: `1px solid ${T.borderStrong}`, background: T.panelGlass, boxShadow: '0 18px 60px rgba(2, 6, 13, 0.4)', backdropFilter: 'blur(16px)' }}>
                    <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.12em', fontWeight: 800, color: T.textSoft }}>LIENS PUBLICS</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                      {streamUrl && (
                        <a href={streamUrl} target="_blank" rel="noreferrer" style={{ padding: '12px 14px', borderRadius: 999, textDecoration: 'none', textAlign: 'center', fontWeight: 800, color: '#0b1626', background: 'linear-gradient(135deg, #c7defe, #7bb9ff)' }}>
                          OUVRIR LA DIFFUSION
                        </a>
                      )}
                      {chatUrl && (
                        <a href={chatUrl} target="_blank" rel="noreferrer" style={{ padding: '12px 14px', borderRadius: 999, textDecoration: 'none', textAlign: 'center', fontWeight: 800, color: T.text, border: `1px solid ${T.borderStrong}`, background: 'rgba(255,255,255,0.06)' }}>
                          OUVRIR LE CHAT
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {leaderboard.length > 0 && (
                  <div style={{ padding: '18px 18px', borderRadius: 24, border: `1px solid ${T.borderStrong}`, background: T.panelGlass, boxShadow: '0 18px 60px rgba(2, 6, 13, 0.4)', backdropFilter: 'blur(16px)' }}>
                    <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.12em', fontWeight: 800, color: T.textSoft }}>CLASSEMENT</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                      {leaderboard.map((row, index) => (
                        <div key={row.participantUserId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 16, background: index === 0 ? 'rgba(230,194,122,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${index === 0 ? 'rgba(230,194,122,0.22)' : T.border}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <span style={{ width: 26, textAlign: 'center', fontWeight: 900, color: index === 0 ? T.gold : T.textMuted }}>{index + 1}</span>
                            <span style={{ color: T.text, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.displayName}</span>
                          </div>
                          <span style={{ color: index === 0 ? T.gold : T.text, fontWeight: 900, fontSize: 20 }}>{row.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            </div>

            {(teamA || teamB) && (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" style={{ marginTop: 18 }}>
                {teamA && (
                  <SpectatorCompetitorCard
                    label="Compétiteur A"
                    name={teamA.displayName}
                    score={teamA.score}
                    accent={T.green}
                    isTargeted={liveState?.currentQuestionTarget?.participantUserId === teamA.participantUserId && phase === 'live'}
                    scoreFill={getScoreFill(teamA.score, totalQuestions, bestScore)}
                    statusLabel={
                      liveState?.currentQuestionTarget?.participantUserId === teamA.participantUserId && phase === 'live'
                        ? 'Question en cours pour lui'
                        : 'Suivi public du score'
                    }
                  />
                )}
                {teamB && (
                  <SpectatorCompetitorCard
                    label="Compétiteur B"
                    name={teamB.displayName}
                    score={teamB.score}
                    accent={T.blue}
                    isTargeted={liveState?.currentQuestionTarget?.participantUserId === teamB.participantUserId && phase === 'live'}
                    scoreFill={getScoreFill(teamB.score, totalQuestions, bestScore)}
                    statusLabel={
                      liveState?.currentQuestionTarget?.participantUserId === teamB.participantUserId && phase === 'live'
                        ? 'Question en cours pour lui'
                        : 'Suivi public du score'
                    }
                  />
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

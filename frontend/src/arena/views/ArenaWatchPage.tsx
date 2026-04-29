import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import { arenaApi, type ArenaLeaderboardRow, type ArenaPublicStream } from '../arenaApi'

const VIEWER_ID_KEY = (matchId: string) => `arena_viewer_${matchId}`
const CAN_PLAY_NATIVE_HLS =
  typeof document !== 'undefined'
    ? document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== ''
    : false

type LiveState = {
  competitionName: string
  status: string
  currentRoundNumber: number
  totalRounds: number
  secondsPerQuestion: number
  currentRound: { startedAt: string | null; endedAt: string | null; endTime: string | null } | null
  participants?: Array<{ userId: string; displayName: string; slot: 'A' | 'B' }>
}

export default function ArenaWatchPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Live state from polling
  const [liveState, setLiveState] = useState<LiveState | null>(null)
  const [leaderboard, setLeaderboard] = useState<ArenaLeaderboardRow[]>([])
  const currentRound = liveState?.currentRound ?? null

  // Poll broadcast status every 5s until live
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
      } catch { /* ignore */ }
    }

    poll()
    const interval = setInterval(poll, 1500)
    return () => { stopped = true; clearInterval(interval) }
  }, [matchId])

  // Register as viewer + start ping heartbeat
  useEffect(() => {
    if (!matchId) return

    const storedId = localStorage.getItem(VIEWER_ID_KEY(matchId))
    let viewerId: string | null = storedId

    const register = async () => {
      if (!viewerId) {
        try {
          const res = await arenaApi.viewerJoin(matchId) as { viewerId: string }
          viewerId = res.viewerId
          localStorage.setItem(VIEWER_ID_KEY(matchId), viewerId)
        } catch { return }
      }

      pingIntervalRef.current = setInterval(async () => {
        if (!viewerId || !matchId) return
        try { await arenaApi.viewerPing(matchId, viewerId) } catch { /* ignore */ }
        try {
          const c = await arenaApi.getViewerCount(matchId) as { count: number }
          setViewerCount(c.count)
        } catch { /* ignore */ }
      }, 25_000)
    }

    void register()
    return () => { if (pingIntervalRef.current) clearInterval(pingIntervalRef.current) }
  }, [matchId])

  // Attach HLS player when playbackUrl is known
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
        void video.play().catch(() => { /* autoplay blocked — user interaction needed */ })
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
      // Native HLS (Safari)
      video.src = playbackUrl
      void video.play().catch(() => {})
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [playbackUrl, broadcastStatus, broadcastProvider])

  // Poll live state + leaderboard every 3s
  useEffect(() => {
    if (!matchId) return
    let cancelled = false
    const load = () => {
      Promise.all([
        arenaApi.getLiveState(matchId),
        arenaApi.getLiveLeaderboard(matchId),
      ]).then(([state, lb]) => {
        if (cancelled) return
        setLiveState(state as LiveState)
        setLeaderboard(lb)
      }).catch(() => {})
    }
    load()
    const interval = setInterval(load, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [matchId])

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!currentRound || currentRound.endedAt) {
      return
    }
    timerRef.current = setInterval(() => {
      setClockTick(Date.now())
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [currentRound])

  const timeLeft = useMemo(() => {
    const round = currentRound
    if (!round || round.endedAt) return null
    if (round.endTime) {
      return Math.max(0, Math.round((new Date(round.endTime).getTime() - clockTick) / 1000))
    }
    const started = round.startedAt ? new Date(round.startedAt).getTime() : clockTick
    const durationMs = (liveState?.secondsPerQuestion ?? 30) * 1000
    return Math.max(0, Math.round((started + durationMs - clockTick) / 1000))
  }, [clockTick, currentRound, liveState?.secondsPerQuestion])

  const playbackUnsupported = broadcastProvider === 'hls' && broadcastStatus === 'live' && !!playbackUrl && !Hls.isSupported() && !CAN_PLAY_NATIVE_HLS
  const displayError = playbackUnsupported ? 'Votre navigateur ne supporte pas la lecture HLS.' : error

  if (!matchId) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0c1929', color: '#fff' }}>Identifiant de match manquant.</div>
  }

  const isLive = liveState?.status === 'live' || liveState?.status === 'paused'
  const roundInProgress = !!liveState?.currentRound && !liveState.currentRound.endedAt
  const hasYoutubeStream = broadcastProvider === 'youtube' && !!streamUrl
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

  return (
    <div style={{ minHeight: '100vh', background: '#0c1929', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 52, background: '#0a1a33', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate('/arena/spectator')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', fontSize: 18, padding: '0 2px' }}
            title="Retour"
          >
            ←
          </button>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
              {liveState?.competitionName ?? 'Arena Live'}
            </p>
            {isLive && (
              <p style={{ fontSize: 11, margin: 0, color: 'rgba(255,255,255,0.5)' }}>
                Round {liveState?.currentRoundNumber ?? 0} / {liveState?.totalRounds ?? '—'} · Mode spectateur
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isLive && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.5)', padding: '3px 10px', borderRadius: 4, letterSpacing: '0.06em', color: '#f87171', fontWeight: 700 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
              EN DIRECT
            </span>
          )}
          {roundInProgress && timeLeft !== null && (
            <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: timeLeft <= 5 ? '#f87171' : '#fff', background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 12px', minWidth: 56, textAlign: 'center' }}>
              {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          )}
          {viewerCount > 0 && (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
              {viewerCount.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Live scoreboard banner */}
      {leaderboard.length >= 2 && (
        <div style={{ background: '#020d1f', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          {/* Team A */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{teamA?.displayName ?? '—'}</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#60a5fa', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{teamA?.score ?? 0}</span>
          </div>
          {/* VS divider */}
          <div style={{ padding: '0 20px', textAlign: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>VS</span>
          </div>
          {/* Team B */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-start' }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#f87171', minWidth: 36, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{teamB?.score ?? 0}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{teamB?.displayName ?? '—'}</span>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: broadcastStatus === 'live' ? 'flex-start' : 'center', padding: 24 }}>
        {displayError && (
          <div style={{ marginBottom: 16, padding: '10px 18px', background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 8, fontSize: 13, color: '#f87171' }}>
            {displayError}
          </div>
        )}

        {broadcastStatus !== 'live' ? (
          <div style={{ textAlign: 'center', maxWidth: 440 }}>
            {/* Show live leaderboard even without video broadcast */}
            {leaderboard.length >= 2 && (
              <div style={{ marginBottom: 32, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Classement en direct</p>
                  {roundInProgress && timeLeft !== null && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: timeLeft <= 5 ? '#f87171' : '#a5b4fc', fontVariantNumeric: 'tabular-nums' }}>
                      {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>
                {leaderboard.map((row, i) => (
                  <div key={row.participantUserId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: i < leaderboard.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: i < 3 ? 18 : 13, minWidth: 24 }}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{row.displayName}</span>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 700, color: i === 0 ? '#fbbf24' : '#a5b4fc' }}>{row.score}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#6366f1', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
            <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
              {broadcastStatus === 'stopped' ? 'Match terminé' : isLive ? 'Match en cours…' : 'En attente de la diffusion…'}
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              {broadcastStatus === 'stopped'
                ? "La diffusion est terminée. Consultez l'Arena pour les résultats."
                : isLive
                  ? hasYoutubeStream
                    ? 'Le match est en cours. La vidéo YouTube apparaîtra ici dès que le modérateur confirmera la mise en direct publique.'
                    : 'Le match est en cours. La scène privée reste sur Konesans+ et la vidéo publique YouTube apparaîtra ici après configuration.'
                  : 'La diffusion démarrera quand l’équipe aura configuré et activé le live public YouTube.'}
            </p>
            {hasYoutubeStream && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
                <a href={streamUrl!} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                  Ouvrir sur YouTube
                </a>
                {chatUrl && (
                  <a href={chatUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
                    Ouvrir le chat
                  </a>
                )}
              </div>
            )}
            {broadcastStatus === 'stopped' && (
              <button onClick={() => navigate('/arena/spectator')} className="btn btn-primary" style={{ marginTop: 20 }}>
                Retour aux lives
              </button>
            )}
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Video */}
            <div style={{ position: 'relative', background: '#000', borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
              {broadcastProvider === 'youtube' && embedUrl ? (
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
                    <div
                      style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '10px 22px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', backdropFilter: 'blur(4px)' }}
                      onClick={() => {
                        setMuted(false)
                        if (videoRef.current) videoRef.current.muted = false
                      }}
                    >
                      🔇 Activer le son
                    </div>
                  )}
                </>
              )}
              {/* Overlay: round info bottom-left */}
              {isLive && (
                <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.8)', letterSpacing: '0.05em' }}>
                    ROUND {liveState?.currentRoundNumber ?? 0}/{liveState?.totalRounds ?? '—'}
                  </span>
                  {roundInProgress && timeLeft !== null && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: timeLeft <= 5 ? 'rgba(239,68,68,0.7)' : 'rgba(0,0,0,0.65)', color: '#fff', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>
                      {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>
              )}
            </div>

            {broadcastProvider === 'youtube' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 16px' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff' }}>Diffusion publique YouTube</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    La scène privée reste sur Konesans+, mais la vidéo spectateur est servie par YouTube Live pour réduire la latence d\'exploitation côté plateforme.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {streamUrl && (
                    <a href={streamUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                      Ouvrir sur YouTube
                    </a>
                  )}
                  {chatUrl && (
                    <a href={chatUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
                      Chat YouTube
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Leaderboard below video */}
            {leaderboard.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Classement</p>
                </div>
                {leaderboard.map((row, i) => (
                  <div key={row.participantUserId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: i < leaderboard.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: i < 3 ? 16 : 13, minWidth: 22 }}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{row.displayName}</span>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 700, color: i === 0 ? '#fbbf24' : '#a5b4fc' }}>{row.score}</span>
                  </div>
                ))}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', margin: 0 }}>
              {broadcastProvider === 'youtube'
                ? 'Vidéo publique YouTube Live · Le score, les rounds et la modération restent synchronisés par Konesans+'
                : 'Latence HLS standard (~10–20s) · Haute définition'}
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

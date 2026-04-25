import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiCall } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useDuelSocket } from '../duel/useDuelSocket'
import { useChimeMeeting, type ChimeJoinInfo } from '../duel/useChimeMeeting'
import DuelOralModeratorPanel from '../duel/DuelOralModeratorPanel'
import { userHome } from '../auth/authRules'

type DuelQuestion = {
  duelQuestionId: string
  position: number
  prompt: string
  options: { A: string; B: string; C: string; D: string }
  difficulty: 'easy' | 'medium' | 'hard'
}

type ParticipantState = {
  userId: string
  name: string
  score: number
  answeredCount: number
  currentQuestion: number
  isFinished: boolean
  totalTimeSeconds: number | null
  answers: Array<{
    duelQuestionId: string
    position: number
    isCorrect: boolean | null
  }>
}

type DuelState = {
  duelId: string
  joinCode: string
  competitionId: string
  competitionName: string
  status: 'waiting' | 'in_progress' | 'completed'
  mode?: 'qcm' | 'oral_live'
  questionCount: number
  winnerUserId: string | null
  currentUserId: string
  questions: DuelQuestion[]
  participants: ParticipantState[]
  canAnswer: boolean
  myAnsweredCount: number
}

const QUESTION_TIME_SECONDS = 10

function adaptOralLiveState(
  data: Partial<DuelState> & { participants?: ParticipantState[] },
  duelId: string,
  currentUserId: string,
): DuelState {
  return {
    duelId,
    joinCode: data.joinCode ?? '',
    competitionId: data.competitionId ?? '',
    competitionName: data.competitionName ?? 'Duel oral live',
    status: data.status ?? 'waiting',
    mode: 'oral_live',
    questionCount: data.questionCount ?? 0,
    winnerUserId: data.winnerUserId ?? null,
    currentUserId,
    questions: [],
    participants: data.participants ?? [],
    canAnswer: false,
    myAnsweredCount: 0,
  }
}

export default function DuelPage() {
  const { duelId } = useParams<{ duelId: string }>()
  const navigate = useNavigate()
  const { accessToken, user } = useAuth()

  const [duelState, setDuelState] = useState<DuelState | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null)
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SECONDS)

  const isOralLive = duelState?.mode === 'oral_live'
  const isModerator = user?.role === 'admin' || user?.role === 'moderator'
  const homePath = userHome(user)

  // ── ORAL_LIVE: real-time socket + Chime ──────────────────────────────
  const { connected: wsConnected, duelState: wsDuelState } = useDuelSocket(
    isOralLive ? duelId : undefined,
    accessToken,
  )
  const chime = useChimeMeeting()
  const [joiningAudio, setJoiningAudio] = useState(false)
  const [audioJoined, setAudioJoined] = useState(false)

  const joinAudio = async () => {
    if (!duelId || joiningAudio) return
    setJoiningAudio(true)
    try {
      const info = await apiCall<ChimeJoinInfo>(
        `/duels/${duelId}/oral/join`,
        { method: 'POST' },
        accessToken,
      )
      await chime.join(info)
      setAudioJoined(true)
    } catch (e) {
      setError((e as { message: string }).message)
    } finally {
      setJoiningAudio(false)
    }
  }
  // ─────────────────────────────────────────────────────────────────────

  const myParticipant = useMemo(
    () => duelState?.participants.find((participant) => participant.userId === duelState.currentUserId) ?? null,
    [duelState],
  )
  const duelStatus = duelState?.status
  const duelCanAnswer = duelState?.canAnswer
  const myAnsweredCount = duelState?.myAnsweredCount

  const currentQuestion = useMemo(() => {
    if (!duelState || !myParticipant) return null
    return duelState.questions[myParticipant.answeredCount] ?? null
  }, [duelState, myParticipant])

  const loadState = useCallback(async (silent = false) => {
    if (!duelId) return
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const data = await apiCall<Partial<DuelState> & { participants?: ParticipantState[]; mode?: 'qcm' | 'oral_live' }>(`/duels/${duelId}/state`, {}, accessToken)
      if (data.mode === 'oral_live') {
        setDuelState(adaptOralLiveState(data, duelId, user?.id ?? ''))
      } else {
        setDuelState(data as DuelState)
      }
    } catch (err) {
      setError((err as { message: string }).message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [accessToken, duelId, user?.id])

  const submitAnswer = useCallback(async (option?: 'A' | 'B' | 'C' | 'D') => {
    if (!duelId || !duelState || !duelState.canAnswer || !currentQuestion || submitting) return

    setSubmitting(true)
    setError('')
    try {
      const body: { duelQuestionId: string; selectedOption?: 'A' | 'B' | 'C' | 'D' } = {
        duelQuestionId: currentQuestion.duelQuestionId,
      }
      if (option) {
        body.selectedOption = option
      }

      const data = await apiCall<DuelState>(
        `/duels/${duelId}/answer`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
        accessToken,
      )
      setDuelState(data)
      setSelectedOption(null)
    } catch (err) {
      setError((err as { message: string }).message)
    } finally {
      setSubmitting(false)
    }
  }, [accessToken, currentQuestion, duelId, duelState, submitting])

  useEffect(() => {
    void loadState()
  }, [loadState])

  useEffect(() => {
    if (!duelId || isOralLive) return
    const interval = setInterval(() => {
      void loadState(true)
    }, 2000)

    return () => clearInterval(interval)
  }, [duelId, isOralLive, loadState])

  useEffect(() => {
    if (duelStatus !== 'in_progress' || !duelCanAnswer) return
    setTimeLeft(QUESTION_TIME_SECONDS)
    setSelectedOption(null)
  }, [duelCanAnswer, duelStatus, myAnsweredCount])

  useEffect(() => {
    if (duelStatus !== 'in_progress' || !duelCanAnswer || isOralLive) return

    const interval = setInterval(() => {
      setTimeLeft((seconds) => {
        if (seconds <= 1) {
          void submitAnswer()
          return QUESTION_TIME_SECONDS
        }
        return seconds - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [currentQuestion?.duelQuestionId, duelCanAnswer, duelStatus, isOralLive, submitAnswer])

  if (loading && !duelState) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--ink-3)', fontSize: 18 }}>Chargement du concours…</p>
      </div>
    )
  }

  if (!duelState) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div className="alert alert-error" style={{ marginBottom: 16 }}>{error || 'Concours introuvable'}</div>
          <button onClick={() => navigate(homePath)} className="btn btn-primary btn-sm">Retour</button>
        </div>
      </div>
    )
  }

  const winner = duelState.participants.find((participant) => participant.userId === duelState.winnerUserId)

  // ── ORAL_LIVE render branch ─────────────────────────────────────────────
  if (isOralLive) {
    type OralParticipant = { userId: string; name: string; score: number; role: 'A' | 'B' }
    type OralState = { status?: string; moderatorUserId?: string | null; winnerUserId?: string | null; participants?: OralParticipant[]; liveStartedAt?: string | null }
    const live = (wsDuelState ?? {}) as OralState
    const oralStatus = (live.status ?? duelState.status) as string
    const oralParticipants: OralParticipant[] = live.participants ?? (duelState.participants as unknown as OralParticipant[]) ?? []
    const oralWinner = live.winnerUserId ?? duelState.winnerUserId
    const myOralRole = oralParticipants.find((p) => p.userId === user?.id)?.role

    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid var(--rule)', padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => navigate(homePath)} style={{ fontSize: 16, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>← Retour</button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Duel Oral Live</p>
            <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{duelState.competitionName}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: wsConnected ? '#d1fae5' : '#fee2e2', color: wsConnected ? '#065f46' : '#991b1b' }}>
            {wsConnected ? '● Live' : '○ Déconnecté'}
          </span>
        </div>

        <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div className="alert alert-error">{error}</div>}

          {/* Score scoreboard */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {oralParticipants.length > 0 ? oralParticipants.map((p) => (
              <div key={p.userId} className="card" style={{ border: p.userId === user?.id ? '1.5px solid var(--cobalt)' : '1px solid var(--rule)', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Compétiteur {p.role}
                  {p.userId === user?.id && <span style={{ color: 'var(--cobalt)', marginLeft: 6 }}>Vous</span>}
                </p>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{p.name}</p>
                <p className="display" style={{ fontSize: 42, color: 'var(--cobalt)', fontWeight: 800 }}>{p.score ?? 0}</p>
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>points</p>
              </div>
            )) : (
              <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '32px 16px', color: 'var(--ink-3)' }}>
                En attente des participants…
              </div>
            )}
          </div>

          {/* Audio room */}
          {oralStatus === 'in_progress' && (
            <div className="card">
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>Salle audio</p>
              {chime.error && <p style={{ fontSize: 13, color: 'var(--error)', marginBottom: 8 }}>{chime.error}</p>}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {!audioJoined ? (
                  <button onClick={() => void joinAudio()} disabled={joiningAudio || chime.status === 'connecting'} className="btn btn-primary btn-sm">
                    {joiningAudio || chime.status === 'connecting' ? 'Connexion…' : 'Rejoindre l\'audio'}
                  </button>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: '#065f46', fontWeight: 600 }}>
                      {chime.status === 'connected' ? '🎙 Connecté' : chime.status === 'connecting' ? 'Connexion…' : '⚠ Déconnecté'}
                    </span>
                    <button onClick={chime.toggleMute} className="btn btn-ghost btn-sm" style={{ minWidth: 90 }}>
                      {chime.isMuted ? '🔇 Muet' : '🎙 Micro actif'}
                    </button>
                    <button onClick={() => { void chime.leave(); setAudioJoined(false) }} className="btn btn-ghost btn-sm">
                      Quitter audio
                    </button>
                  </>
                )}
              </div>
              {live.moderatorUserId && (
                <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10 }}>
                  Modérateur actif · Rôle : {myOralRole ?? (isModerator ? 'Modérateur' : '?')}
                </p>
              )}
            </div>
          )}

          {/* Waiting state */}
          {oralStatus === 'waiting' && (
            <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <p className="overline" style={{ marginBottom: 8 }}>En attente</p>
              <h2 className="display" style={{ fontSize: 30, color: 'var(--cobalt)', marginBottom: 10 }}>Le modérateur n'a pas encore démarré le duel</h2>
              <p style={{ fontSize: 16, color: 'var(--ink-3)' }}>Restez sur cette page. Le duel démarrera bientôt.</p>
            </div>
          )}

          {/* Completed state */}
          {oralStatus === 'completed' && (
            <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <p className="overline" style={{ marginBottom: 8 }}>Résultat</p>
              <h2 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 14 }}>Duel terminé</h2>
              {oralWinner ? (
                <p style={{ fontSize: 18, color: 'var(--ink)' }}>
                  Gagnant : <span style={{ fontWeight: 700, color: 'var(--cobalt)' }}>
                    {oralParticipants.find((p) => p.userId === oralWinner)?.name ?? oralWinner}
                  </span>
                  {oralWinner === user?.id && <span style={{ marginLeft: 8, fontSize: 15, color: 'var(--ok)' }}>— Félicitations !</span>}
                </p>
              ) : (
                <p style={{ fontSize: 17, color: 'var(--ink-3)' }}>Match nul — égalité parfaite.</p>
              )}
              <button onClick={() => navigate(homePath)} className="btn btn-primary btn-sm" style={{ marginTop: 20 }}>Retour</button>
            </div>
          )}

          {/* Moderator scoring panel */}
          {isModerator && oralStatus === 'in_progress' && (
            <DuelOralModeratorPanel duelId={duelId!} accessToken={accessToken} />
          )}
        </div>
      </div>
    )
  }
  // ── End ORAL_LIVE branch ────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--rule)', padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => navigate(homePath)} style={{ fontSize: 16, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>← Retour</button>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Concours</p>
          <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{duelState.competitionName}</p>
        </div>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, padding: '4px 12px', borderRadius: 4, background: timeLeft <= 3 ? 'var(--error)' : 'var(--stone)', color: timeLeft <= 3 ? '#fff' : 'var(--cobalt)' }}>
          {duelState.canAnswer ? `${timeLeft}s` : '—'}
        </span>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <div className="alert alert-error">{error}</div>}

        {/* Participant scorecards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {duelState.participants.map((participant) => (
            <div key={participant.userId} className="card" style={{ border: participant.userId === duelState.currentUserId ? '1.5px solid var(--cobalt)' : '1px solid var(--rule)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                  {participant.name}
                  {participant.userId === duelState.currentUserId && <span style={{ marginLeft: 6, fontSize: 14, color: 'var(--cobalt)' }}>Vous</span>}
                </p>
                <p className="display" style={{ fontSize: 26, color: 'var(--cobalt)' }}>{participant.score}</p>
              </div>
              <p style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 12 }}>
                {participant.answeredCount}/{duelState.questionCount}
                {participant.isFinished && participant.totalTimeSeconds ? ` · ${participant.totalTimeSeconds}s` : ''}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {participant.answers.map((answer) => (
                  <span
                    key={`${participant.userId}-${answer.duelQuestionId}`}
                    style={{ width: 22, height: 22, borderRadius: '50%', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, background: answer.isCorrect === null ? 'var(--rule)' : answer.isCorrect ? 'var(--ok)' : 'var(--error)', color: answer.isCorrect === null ? 'var(--ink-3)' : '#fff' }}
                  >
                    {answer.position}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Waiting */}
        {duelState.status === 'waiting' && (
          <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p className="overline" style={{ marginBottom: 8 }}>Matchmaking</p>
            <h2 className="display" style={{ fontSize: 30, color: 'var(--cobalt)', marginBottom: 10 }}>Recherche d'un adversaire</h2>
            <p style={{ fontSize: 17, color: 'var(--ink-3)', lineHeight: 1.7 }}>Le matchmaking est en cours sur {duelState.competitionName}.<br/>Restez sur cette page.</p>
          </div>
        )}

        {/* Questions (can answer) */}
        {duelState.status === 'in_progress' && duelState.canAnswer && currentQuestion && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontSize: 14, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Question {currentQuestion.position}/{duelState.questionCount}</p>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 18, lineHeight: 1.55 }}>{currentQuestion.prompt}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {(Object.entries(currentQuestion.options) as ['A' | 'B' | 'C' | 'D', string][]).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => setSelectedOption(key)}
                  className={`quiz-option${selectedOption === key ? ' selected' : ''}`}
                >
                  <span className="opt-key">{key}</span>
                  <span>{value}</span>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => void submitAnswer()} disabled={submitting} className="btn btn-ghost btn-sm">Passer</button>
              <button onClick={() => void submitAnswer(selectedOption ?? undefined)} disabled={submitting || !selectedOption} className="btn btn-primary btn-sm">Valider</button>
            </div>
          </div>
        )}

        {/* Waiting for opponent */}
        {duelState.status === 'in_progress' && !duelState.canAnswer && (
          <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
            <h2 className="display" style={{ fontSize: 28, color: 'var(--cobalt)', marginBottom: 10 }}>En attente de l'adversaire</h2>
            <p style={{ fontSize: 17, color: 'var(--ink-3)', lineHeight: 1.7 }}>Vous avez terminé. Le résultat final arrive dès que l'autre joueur termine.</p>
          </div>
        )}

        {/* Completed */}
        {duelState.status === 'completed' && (
          <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
            <p className="overline" style={{ marginBottom: 8 }}>Résultat final</p>
            <h2 className="display" style={{ fontSize: 34, color: 'var(--cobalt)', marginBottom: 14 }}>Concours terminé</h2>
            {duelState.winnerUserId ? (
              <p style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 8 }}>
                Gagnant : <span style={{ fontWeight: 700, color: 'var(--cobalt)' }}>{winner?.name}</span>
                {duelState.winnerUserId === duelState.currentUserId && <span style={{ marginLeft: 8, fontSize: 15, color: 'var(--ok)' }}>— Félicitations !</span>}
              </p>
            ) : (
              <p style={{ fontSize: 17, color: 'var(--ink-3)', marginBottom: 8 }}>Égalité parfaite — même score, même temps.</p>
            )}
            <p style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 22 }}>Départage : score, puis temps total le plus court.</p>
            <button onClick={() => navigate(homePath)} className="btn btn-primary btn-sm">Retour</button>
          </div>
        )}
      </div>
    </div>
  )
}

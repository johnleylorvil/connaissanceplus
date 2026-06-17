import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  status: 'waiting' | 'in_progress' | 'completed' | 'cancelled'
  mode?: 'qcm' | 'oral_live'
  questionCount: number
  currentQuestionPosition?: number
  buzzerPhase?: 'waiting_for_buzz' | 'answering'
  activeResponderUserId?: string | null
  firstResponderUserId?: string | null
  responseDeadlineAt?: string | null
  responseSeconds?: number
  winnerUserId: string | null
  currentUserId: string
  currentQuestion?: DuelQuestion | null
  questionAttempts?: Array<{
    userId: string
    selectedOption: 'A' | 'B' | 'C' | 'D' | null
    isCorrect: boolean
    attemptNumber: number
    answeredAt: string
  }>
  questions: DuelQuestion[]
  participants: ParticipantState[]
  canBuzz?: boolean
  canAnswer: boolean
  myAnsweredCount: number
}

const QUESTION_TIME_SECONDS = 8

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
    currentQuestion: null,
    questionAttempts: [],
    questions: [],
    participants: data.participants ?? [],
    canBuzz: false,
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

  const activeResponder = useMemo(
    () => duelState?.participants.find((participant) => participant.userId === duelState.activeResponderUserId) ?? null,
    [duelState],
  )
  const duelStatus = duelState?.status
  const duelCanAnswer = duelState?.canAnswer
  const myAnsweredCount = duelState?.myAnsweredCount

  const duelStatusRef = useRef(duelStatus)
  useEffect(() => { duelStatusRef.current = duelStatus }, [duelStatus])

  useEffect(() => {
    return () => {
      if (duelStatusRef.current === 'waiting' && duelId && accessToken) {
        void apiCall('/duels/matchmaking/cancel', { method: 'DELETE' }, accessToken)
      }
    }
  }, [duelId, accessToken])

  const currentQuestion = useMemo(() => {
    if (!duelState) return null
    return duelState.currentQuestion ?? duelState.questions.find((question) => question.position === duelState.currentQuestionPosition) ?? null
  }, [duelState])

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
      if (option) body.selectedOption = option

      const data = await apiCall<DuelState>(
        `/duels/${duelId}/answer`,
        { method: 'POST', body: JSON.stringify(body) },
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

  const buzz = useCallback(async () => {
    if (!duelId || !duelState?.canBuzz || submitting) return

    setSubmitting(true)
    setError('')
    try {
      const data = await apiCall<DuelState>(
        `/duels/${duelId}/buzz`,
        { method: 'POST' },
        accessToken,
      )
      setDuelState(data)
      setSelectedOption(null)
    } catch (err) {
      setError((err as { message: string }).message)
    } finally {
      setSubmitting(false)
    }
  }, [accessToken, duelId, duelState?.canBuzz, submitting])

  useEffect(() => {
    void loadState()
  }, [loadState])

  useEffect(() => {
    if (!duelId || isOralLive) return
    if (duelStatus === 'cancelled' || duelStatus === 'completed') return
    const interval = setInterval(() => {
      void loadState(true)
    }, 2000)

    return () => clearInterval(interval)
  }, [duelId, isOralLive, loadState, duelStatus])

  useEffect(() => {
    if (duelStatus !== 'in_progress') return
    setTimeLeft(duelState?.responseSeconds ?? QUESTION_TIME_SECONDS)
    setSelectedOption(null)
  }, [currentQuestion?.duelQuestionId, duelState?.buzzerPhase, duelState?.responseSeconds, duelStatus, myAnsweredCount])

  useEffect(() => {
    if (duelStatus !== 'in_progress' || !duelCanAnswer || isOralLive) return

    const interval = setInterval(() => {
      const deadline = duelState?.responseDeadlineAt ? new Date(duelState.responseDeadlineAt).getTime() : 0
      const nextSeconds = deadline > 0 ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0
      setTimeLeft(nextSeconds)
      if (nextSeconds <= 0) {
        void loadState(true)
      }
    }, 250)

    return () => clearInterval(interval)
  }, [currentQuestion?.duelQuestionId, duelCanAnswer, duelStatus, duelState?.responseDeadlineAt, isOralLive, loadState])

  if (loading && !duelState) {
    return (
      <div className="duel-loading-screen">
        <p>Chargement du génie scolaire...</p>
      </div>
    )
  }

  if (!duelState) {
    return (
      <div className="duel-loading-screen">
        <div className="card duel-missing-card">
          <div className="alert alert-error">{error || 'Duel introuvable'}</div>
          <button onClick={() => navigate(homePath)} className="btn btn-primary btn-sm">Retour</button>
        </div>
      </div>
    )
  }

  const winner = duelState.participants.find((participant) => participant.userId === duelState.winnerUserId)

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
        <div style={{ background: '#fff', borderBottom: '1px solid var(--rule)', padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => navigate(homePath)} style={{ fontSize: 16, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Retour</button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Génie scolaire oral en direct</p>
            <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{duelState.competitionName}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: wsConnected ? '#d1fae5' : '#fee2e2', color: wsConnected ? '#065f46' : '#991b1b' }}>
            {wsConnected ? 'Live' : 'Déconnecté'}
          </span>
        </div>

        <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div className="alert alert-error">{error}</div>}

          <div className="responsive-two-col" style={{ gap: 12 }}>
            {oralParticipants.length > 0 ? oralParticipants.map((p) => (
              <div key={p.userId} className="card" style={{ border: p.userId === user?.id ? '1.5px solid var(--cobalt)' : '1px solid var(--rule)', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Participant {p.role}
                  {p.userId === user?.id && <span style={{ color: 'var(--cobalt)', marginLeft: 6 }}>Vous</span>}
                </p>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{p.name}</p>
                <p className="display" style={{ fontSize: 42, color: 'var(--cobalt)', fontWeight: 800 }}>{p.score ?? 0}</p>
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>points</p>
              </div>
            )) : (
              <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '32px 16px', color: 'var(--ink-3)' }}>
                En attente des participants...
              </div>
            )}
          </div>

          {oralStatus === 'in_progress' && (
            <div className="card">
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>Salle audio</p>
              {chime.error && <p style={{ fontSize: 13, color: 'var(--error)', marginBottom: 8 }}>{chime.error}</p>}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {!audioJoined ? (
                  <button onClick={() => void joinAudio()} disabled={joiningAudio || chime.status === 'connecting'} className="btn btn-primary btn-sm">
                    {joiningAudio || chime.status === 'connecting' ? 'Connexion...' : 'Rejoindre l\'audio'}
                  </button>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: '#065f46', fontWeight: 600 }}>
                      {chime.status === 'connected' ? 'Connecté' : chime.status === 'connecting' ? 'Connexion...' : 'Déconnecté'}
                    </span>
                    <button onClick={chime.toggleMute} className="btn btn-ghost btn-sm" style={{ minWidth: 90 }}>
                      {chime.isMuted ? 'Muet' : 'Micro actif'}
                    </button>
                    <button onClick={() => { void chime.leave(); setAudioJoined(false) }} className="btn btn-ghost btn-sm">
                      Quitter audio
                    </button>
                  </>
                )}
              </div>
              {live.moderatorUserId && (
                <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10 }}>
                  Modérateur actif - Rôle : {myOralRole ?? (isModerator ? 'Modérateur' : '?')}
                </p>
              )}
            </div>
          )}

          {oralStatus === 'waiting' && (
            <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <p className="overline" style={{ marginBottom: 8 }}>En attente</p>
              <h2 className="display" style={{ fontSize: 30, color: 'var(--cobalt)', marginBottom: 10 }}>Le génie n'a pas encore commencé</h2>
              <p style={{ fontSize: 16, color: 'var(--ink-3)' }}>Restez sur cette page. Le lancement sera annoncé ici dès le démarrage.</p>
            </div>
          )}

          {oralStatus === 'completed' && (
            <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <p className="overline" style={{ marginBottom: 8 }}>Résultat</p>
              <h2 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 14 }}>Génie terminé</h2>
              {oralWinner ? (
                <p style={{ fontSize: 18, color: 'var(--ink)' }}>
                  Gagnant : <span style={{ fontWeight: 700, color: 'var(--cobalt)' }}>
                    {oralParticipants.find((p) => p.userId === oralWinner)?.name ?? oralWinner}
                  </span>
                  {oralWinner === user?.id && <span style={{ marginLeft: 8, fontSize: 15, color: 'var(--ok)' }}>Félicitations !</span>}
                </p>
              ) : (
                <p style={{ fontSize: 17, color: 'var(--ink-3)' }}>Match nul - égalité parfaite.</p>
              )}
              <button onClick={() => navigate(homePath)} className="btn btn-primary btn-sm" style={{ marginTop: 20 }}>Retour</button>
            </div>
          )}

          {isModerator && oralStatus === 'in_progress' && (
            <DuelOralModeratorPanel duelId={duelId!} accessToken={accessToken} />
          )}
        </div>
      </div>
    )
  }

  const timerMax = duelState.responseSeconds ?? QUESTION_TIME_SECONDS
  const timerPct = Math.max(0, Math.min(100, (timeLeft / Math.max(1, timerMax)) * 100))
  const timerBarColor = timeLeft <= 3 ? 'var(--error)' : timeLeft <= 5 ? 'var(--gold)' : 'var(--ok)'
  const questionKey = currentQuestion?.duelQuestionId ?? duelState.currentQuestionPosition ?? 0
  const isMine = (uid: string) => uid === duelState.currentUserId
  const isWinner = duelState.winnerUserId === duelState.currentUserId
  const isSecondChance = Boolean(duelState.firstResponderUserId && duelState.firstResponderUserId !== duelState.activeResponderUserId)
  const me = duelState.participants.find((participant) => isMine(participant.userId)) ?? duelState.participants[0]
  const opponent = duelState.participants.find((participant) => !isMine(participant.userId))
  const statusCopy = duelState.canAnswer
    ? `À vous de répondre - ${timeLeft}s`
    : activeResponder
      ? `${activeResponder.name} répond${isSecondChance ? ' - deuxième chance' : ''}`
      : 'Appuyez sur le buzzer pour répondre'
  const resultTitle = duelState.winnerUserId ? (isWinner ? 'Victoire' : 'Défaite') : 'Égalité'
  const resultNote = duelState.winnerUserId
    ? isWinner
      ? 'Votre classement hebdomadaire va progresser.'
      : 'Analysez la manche et relancez un duel quand vous êtes prêt.'
    : 'Score identique: la prochaine réponse rapide fera la différence.'

  return (
    <div className="duel-esport-shell">
      <header className="duel-esport-header">
        <button onClick={() => navigate(homePath)} className="duel-back-button">Retour</button>
        <div className="duel-header-title">
          <p>Génie scolaire classé</p>
          <strong>{duelState.competitionName}</strong>
        </div>
        <div className={`duel-timer-pill${duelState.canAnswer ? ' active' : ''}${duelState.canAnswer && timeLeft <= 3 ? ' urgent' : ''}`}>
          {duelState.canAnswer ? `${timeLeft}s` : 'VS'}
        </div>
      </header>

      <main className="duel-esport-main">
        {error && <div className="alert alert-error">{error}</div>}

        <section className="duel-score-arena">
          <div className="duel-score-grid">
            {duelState.participants.map((participant) => {
              const mine = isMine(participant.userId)
              const isWinningCard = duelState.status === 'completed' && duelState.winnerUserId === participant.userId
              return (
                <article
                  key={participant.userId}
                  className={`duel-player-card${mine ? ' mine' : ''}${isWinningCard ? ' winner-glow' : ''}`}
                >
                  <div className="duel-player-meta">
                    <span>{mine ? 'Vous' : 'Adversaire'}</span>
                    {participant.isFinished && <strong>Terminé</strong>}
                  </div>
                  <div className="duel-player-main">
                    <div className="duel-player-avatar">{participant.name.slice(0, 1).toUpperCase()}</div>
                    <div>
                      <h2>{participant.name}</h2>
                      <p>{participant.answeredCount}/{duelState.questionCount} questions{participant.totalTimeSeconds ? ` - ${participant.totalTimeSeconds}s` : ''}</p>
                    </div>
                  </div>
                  <div className="duel-player-score">{participant.score}</div>
                  <div className="duel-answer-track">
                    {participant.answers.map((answer) => (
                      <span
                        key={`${participant.userId}-${answer.duelQuestionId}`}
                        className={answer.isCorrect === null ? 'pending' : answer.isCorrect ? 'correct' : 'wrong'}
                      >
                        {answer.position}
                      </span>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>

          <div className="duel-vs-strip">
            <span>{me?.name ?? 'Vous'}</span>
            <strong>VS</strong>
            <span>{opponent?.name ?? 'En recherche'}</span>
          </div>
        </section>

        {duelState.status === 'waiting' && (
          <section className="duel-matchmaking-panel anim-fade-up">
            <p className="overline">Matchmaking en cours</p>
            <h1 className="display">Recherche d'un adversaire</h1>
            <div className="duel-search-stage">
              <div className="duel-search-player ready">
                <span>{user?.firstName?.[0] ?? 'E'}</span>
                <strong>{user?.firstName ?? 'Vous'}</strong>
                <small>Prêt</small>
              </div>
              <div className="duel-search-radar">
                <div />
                <strong>VS</strong>
              </div>
              <div className="duel-search-player pending">
                <span>?</span>
                <strong>Adversaire</strong>
                <small>Recherche</small>
              </div>
            </div>
            <p className="duel-wait-copy">
              Restez sur cette page. Le match démarre automatiquement dès qu'un adversaire est trouvé.
            </p>
            <div className="duel-wait-actions">
              <span>Expiration automatique dans 15 minutes</span>
              <button onClick={() => navigate(homePath)} className="btn btn-ghost btn-sm">Annuler la recherche</button>
            </div>
          </section>
        )}

        {duelState.status === 'cancelled' && (
          <section className="duel-result-panel cancelled anim-fade-up">
            <p className="overline">Matchmaking expiré</p>
            <h1 className="display">Aucun adversaire trouvé</h1>
            <p>Le délai de 15 minutes a expiré. Relancez une recherche depuis le tableau de bord.</p>
            <button onClick={() => navigate(homePath)} className="btn btn-primary btn-sm">Retour au tableau de bord</button>
          </section>
        )}

        {duelState.status === 'in_progress' && currentQuestion && (
          <section key={questionKey} className="duel-question-panel anim-slide-in">
            <div className="duel-question-topline">
              <span>Question {currentQuestion.position}/{duelState.questionCount}</span>
              <strong className={duelState.canAnswer ? 'is-your-turn' : ''}>{statusCopy}</strong>
            </div>

            <div className="duel-center-timer">
              <span style={{ width: `${timerPct}%`, background: timerBarColor }} />
            </div>

            <p className="duel-question-prompt">{currentQuestion.prompt}</p>

            <div className="duel-options-list">
              {(Object.entries(currentQuestion.options) as ['A' | 'B' | 'C' | 'D', string][]).map(([key, value], i) => (
                <button
                  key={key}
                  onClick={() => duelState.canAnswer && setSelectedOption(key)}
                  disabled={!duelState.canAnswer || submitting}
                  className={`quiz-option duel-option anim-fade-up${selectedOption === key ? ' selected' : ''}`}
                  style={{
                    animationDelay: `${i * 0.06}s`,
                    opacity: duelState.canAnswer ? 1 : 0.68,
                    cursor: duelState.canAnswer ? 'pointer' : 'not-allowed',
                  }}
                >
                  <span className="opt-key" data-key={key}>{key}</span>
                  <span>{value}</span>
                </button>
              ))}
            </div>

            {duelState.questionAttempts && duelState.questionAttempts.length > 0 && (
              <div className="duel-attempt-feed">
                {duelState.questionAttempts.map((attempt) => {
                  const participant = duelState.participants.find((item) => item.userId === attempt.userId)
                  return (
                    <p key={`${attempt.userId}-${attempt.attemptNumber}`} className={attempt.isCorrect ? 'correct' : 'wrong'}>
                      {participant?.name ?? 'Participant'}: {attempt.isCorrect ? 'bonne réponse' : attempt.selectedOption ? 'mauvaise réponse' : 'temps dépassé'}
                    </p>
                  )
                })}
              </div>
            )}

            <div className="duel-action-row">
              {duelState.canBuzz && (
                <button onClick={() => void buzz()} disabled={submitting} className="btn btn-primary duel-buzzer-button">
                  {submitting ? '...' : 'Je réponds'}
                </button>
              )}
              {duelState.canAnswer && (
                <button
                  onClick={() => void submitAnswer(selectedOption ?? undefined)}
                  disabled={submitting || !selectedOption}
                  className="btn btn-primary duel-submit-button"
                >
                  {submitting ? 'Validation...' : selectedOption ? `Valider ${selectedOption}` : 'Choisir une réponse'}
                </button>
              )}
            </div>
          </section>
        )}

        {duelState.status === 'completed' && (
          <section className={`duel-result-panel anim-pop-in${isWinner ? ' victory' : duelState.winnerUserId ? ' defeat' : ' draw'}`}>
            <p className="overline">Résultat final</p>
            <h1 className="display">{resultTitle}</h1>
            <div className="duel-final-score">
              {duelState.participants.map((participant) => (
                <div key={participant.userId}>
                  <span>{participant.name}</span>
                  <strong>{participant.score}</strong>
                </div>
              ))}
            </div>
            {duelState.winnerUserId ? (
              <p>Gagnant: <strong>{winner?.name}</strong>. {resultNote}</p>
            ) : (
              <p>{resultNote}</p>
            )}
            <p className="duel-rule-note">Règle finale: le meilleur score gagne.</p>
            <button onClick={() => navigate(homePath)} className="btn btn-primary btn-sm">Retour au tableau de bord</button>
          </section>
        )}
      </main>
    </div>
  )
}

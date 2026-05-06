import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiCall } from '../api/client'

type Question = {
  sessionQuestionId: string
  questionId: string
  prompt: string
  options: { A: string; B: string; C: string; D: string }
  difficulty: 'easy' | 'medium' | 'hard'
}
type AnswerMap = Record<string, 'A' | 'B' | 'C' | 'D'>
type SubmitResult = {
  sessionId: string
  score: number
  totalQuestions: number
  submittedAnswers: number
  percentage: number
}

const QUESTION_TIME_SECONDS = 10

const difficultyColor: Record<string, string> = {
  easy: 'var(--ok)',
  medium: 'var(--gold)',
  hard: 'var(--error)',
}

const difficultyLabel: Record<string, string> = {
  easy: 'Facile',
  medium: 'Moyen',
  hard: 'Difficile',
}

const resultMessage = (pct: number) => {
  if (pct === 100) return '🔥 Parfait — vrai génie !'
  if (pct >= 80)  return '🌟 Excellent travail !'
  if (pct >= 60)  return '👍 Bien joué !'
  if (pct >= 40)  return '📚 Continue à t\'entraîner !'
  return '💪 Tu peux mieux faire — relance une manche !'
}

function useCountUp(target: number, duration = 900) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (target === 0) { setDisplay(0); return }
    const start = performance.now()
    const frame = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      setDisplay(Math.round(progress * target))
      if (progress < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }, [target, duration])
  return display
}

export default function QuizPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { accessToken } = useAuth()

  const questions: Question[] = location.state?.questions ?? []
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [questionTimeLeft, setQuestionTimeLeft] = useState(QUESTION_TIME_SECONDS)
  const [questionKey, setQuestionKey] = useState(0)

  // Animated score counter
  const animatedScore = useCountUp(result?.score ?? 0)
  const animatedPct   = useCountUp(result?.percentage ?? 0)

  // Ref to avoid stale closure in timer
  const currentRef = useRef(current)
  useEffect(() => { currentRef.current = current }, [current])

  const advanceQuestion = useCallback(() => {
    setCurrent((prev) => {
      const next = prev + 1
      return next < questions.length ? next : prev
    })
    setQuestionKey((k) => k + 1)
    setQuestionTimeLeft(QUESTION_TIME_SECONDS)
  }, [questions.length])

  const handleSubmit = useCallback(async () => {
    if (submitting || submitted) return
    setSubmitting(true)
    setError('')
    try {
      const data = await apiCall<SubmitResult>(
        `/quizzes/${sessionId}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({
            answers: Object.entries(answers).map(([sessionQuestionId, selectedOption]) => ({
              sessionQuestionId,
              selectedOption,
            })),
          }),
        },
        accessToken,
      )
      setResult(data)
      setSubmitted(true)
    } catch (err) {
      setError((err as { message: string }).message)
    } finally {
      setSubmitting(false)
    }
  }, [accessToken, answers, sessionId, submitted, submitting])

  useEffect(() => {
    if (questions.length === 0) {
      navigate('/dashboard')
    }
  }, [navigate, questions.length])

  useEffect(() => {
    if (submitted || questions.length === 0) return
    setQuestionTimeLeft(QUESTION_TIME_SECONDS)
    setQuestionKey((k) => k + 1)
  }, [current, submitted, questions.length])

  useEffect(() => {
    if (submitted || questions.length === 0) return

    const interval = setInterval(() => {
      setQuestionTimeLeft((seconds) => {
        if (seconds <= 1) {
          if (currentRef.current >= questions.length - 1) {
            void handleSubmit()
            return 0
          }
          advanceQuestion()
          return QUESTION_TIME_SECONDS
        }
        return seconds - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [advanceQuestion, handleSubmit, submitted, questions.length])

  const q = questions[current]

  const selectAnswer = (opt: 'A' | 'B' | 'C' | 'D') => {
    if (submitted) return
    setAnswers((prev) => ({ ...prev, [q.sessionQuestionId]: opt }))
  }

  const answeredCount = Object.keys(answers).length
  const progress = ((current + 1) / questions.length) * 100

  // Timer bar color
  const timerPct = (questionTimeLeft / QUESTION_TIME_SECONDS) * 100
  const timerColor = questionTimeLeft <= 3
    ? 'var(--error)'
    : questionTimeLeft <= 5
    ? 'var(--gold)'
    : 'var(--ok)'

  if (submitted && result) {
    const pct = result.percentage
    const ringColor = pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--cobalt)' : 'var(--gold)'

    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div className="card anim-pop-in" style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <p className="overline" style={{ marginBottom: 16 }}>Résultat final</p>

          {/* Animated score ring */}
          <div className="result-score-ring" style={{ color: ringColor, borderColor: ringColor }}>
            {animatedScore}/{result.totalQuestions}
          </div>

          {/* Result message */}
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            {resultMessage(pct)}
          </p>

          {/* Percentage bar */}
          <div style={{ height: 10, background: 'var(--rule)', borderRadius: 5, overflow: 'hidden', margin: '16px 0 6px' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${ringColor}, ${ringColor}bb)`,
              borderRadius: 5,
              transition: 'width 1.1s cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
          <p className="display" style={{ fontSize: 40, color: ringColor, marginBottom: 24 }}>
            {animatedPct}%
          </p>

          <div className="responsive-two-col" style={{ gap: 1, border: '1px solid var(--rule)', borderRadius: 10, overflow: 'hidden', background: 'var(--rule)', marginBottom: 20 }}>
            <div style={{ background: '#fff', padding: '16px 10px' }}>
              <div className="display" style={{ fontSize: 34, color: 'var(--ok)' }}>{result.score}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Correctes</div>
            </div>
            <div style={{ background: '#fff', padding: '16px 10px' }}>
              <div className="display" style={{ fontSize: 34, color: 'var(--error)' }}>{result.totalQuestions - result.score}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Incorrectes</div>
            </div>
          </div>

          <div style={{ background: 'rgba(27,53,99,0.04)', border: '1px solid rgba(27,53,99,0.1)', borderRadius: 8, padding: '12px 16px', marginBottom: 22 }}>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.6 }}>
              Chaque bonne réponse améliore votre préparation. Le classement hebdomadaire dépend de vos performances en affrontement.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => navigate('/dashboard', { replace: true })} className="btn btn-primary btn-full">Retour au tableau de bord</button>
            <button onClick={() => navigate('/dashboard')} className="btn btn-ghost btn-full">Lancer une autre manche</button>
          </div>
        </div>
      </div>
    )
  }

  if (!q) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--rule)', padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/dashboard')} style={{ fontSize: 16, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>← Quitter</button>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Question {current + 1}/{questions.length}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, color: 'var(--ink-3)' }}>{answeredCount}/{questions.length} réponses</span>
          <span style={{
            fontFamily: 'monospace', fontWeight: 800, fontSize: 17,
            padding: '4px 14px', borderRadius: 6,
            background: questionTimeLeft <= 3 ? 'var(--error)' : questionTimeLeft <= 5 ? 'var(--gold)' : 'var(--cobalt)',
            color: '#fff',
            transition: 'background 0.3s',
            animation: questionTimeLeft <= 3 ? 'timerPulse 0.5s ease infinite' : 'none',
          }}>
            {questionTimeLeft}s
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="quiz-progress-bar-wrap">
        <div className="quiz-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        {/* Timer bar */}
        <div className="quiz-timer-bar-wrap">
          <div
            className={`quiz-timer-bar${questionTimeLeft <= 3 ? ' urgent' : ''}`}
            style={{ width: `${timerPct}%`, background: timerColor }}
          />
        </div>

        {/* Question card with slide-in animation keyed on question index */}
        <div key={questionKey} className="card anim-slide-in" style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: difficultyColor[q.difficulty], letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 20, background: `${difficultyColor[q.difficulty]}18` }}>
              {difficultyLabel[q.difficulty]}
            </span>
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{current + 1} / {questions.length}</span>
          </div>
          <p style={{ fontSize: 19, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.65 }}>{q.prompt}</p>
        </div>

        {/* Options */}
        <div key={`opts-${questionKey}`} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {(Object.entries(q.options) as [string, string][]).map(([key, value], i) => {
            const selected = answers[q.sessionQuestionId] === key
            return (
              <button
                key={key}
                onClick={() => selectAnswer(key as 'A' | 'B' | 'C' | 'D')}
                className={`quiz-option anim-fade-up${selected ? ' selected' : ''}`}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <span className="opt-key" data-key={key}>{key}</span>
                <span>{value}</span>
              </button>
            )
          })}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.65 }}>10 secondes par question — passage automatique.</p>
          {current < questions.length - 1 ? (
            <button onClick={advanceQuestion} className="btn btn-primary btn-sm">Suivant →</button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary btn-sm">{submitting ? '…' : 'Terminer'}</button>
          )}
        </div>

        {answeredCount > 0 && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button onClick={handleSubmit} disabled={submitting} className="btn btn-ghost btn-sm">
              Terminer maintenant ({answeredCount}/{questions.length})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

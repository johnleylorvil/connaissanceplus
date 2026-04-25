import { useCallback, useEffect, useState } from 'react'
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
  }, [current, submitted, questions.length])

  useEffect(() => {
    if (submitted || questions.length === 0) return

    const interval = setInterval(() => {
      setQuestionTimeLeft((seconds) => {
        if (seconds <= 1) {
          if (current >= questions.length - 1) {
            void handleSubmit()
            return 0
          }
          setCurrent((prev) => prev + 1)
          return QUESTION_TIME_SECONDS
        }
        return seconds - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [current, handleSubmit, submitted, questions.length])

  const q = questions[current]

  const selectAnswer = (opt: 'A' | 'B' | 'C' | 'D') => {
    if (submitted) return
    setAnswers((prev) => ({ ...prev, [q.sessionQuestionId]: opt }))
  }

  const answeredCount = Object.keys(answers).length
  const progress = ((current + 1) / questions.length) * 100

  if (submitted && result) {
    const pct = result.percentage

    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <p className="overline" style={{ marginBottom: 8 }}>Résultat</p>
          <h1 className="display" style={{ fontSize: 44, color: 'var(--cobalt)', marginBottom: 6 }}>{result.score}/{result.totalQuestions}</h1>
          <p style={{ fontSize: 17, color: 'var(--ink-3)', marginBottom: 22 }}>questions correctes</p>

          <div style={{ height: 3, background: 'var(--rule)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--cobalt)' : 'var(--gold)', borderRadius: 2, transition: 'width 0.8s' }} />
          </div>
          <p className="display" style={{ fontSize: 34, color: pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--cobalt)' : 'var(--gold)', marginBottom: 28 }}>{pct}%</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden', background: 'var(--rule)', marginBottom: 20 }}>
            <div style={{ background: '#fff', padding: '14px 10px' }}>
              <div className="display" style={{ fontSize: 30, color: 'var(--ok)' }}>{result.score}</div>
              <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>Correctes</div>
            </div>
            <div style={{ background: '#fff', padding: '14px 10px' }}>
              <div className="display" style={{ fontSize: 30, color: 'var(--error)' }}>{result.totalQuestions - result.score}</div>
              <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>Incorrectes</div>
            </div>
          </div>

          <div style={{ background: 'rgba(27,53,99,0.04)', border: '1px solid rgba(27,53,99,0.1)', borderRadius: 6, padding: '12px 16px', marginBottom: 20 }}>
            <p style={{ fontSize: 15, color: 'var(--ink-3)', lineHeight: 1.6 }}>
              Chaque bonne réponse vaut 1 point pour votre entraînement. Le classement hebdomadaire dépend de vos résultats en duel.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => navigate('/dashboard', { replace: true })} className="btn btn-primary btn-full">Retour au tableau de bord</button>
            <button onClick={() => navigate('/dashboard')} className="btn btn-ghost btn-full">Jouer un autre quiz</button>
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
          <span style={{ fontSize: 15, color: 'var(--ink-3)' }}>{answeredCount}/{questions.length} répondues</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, padding: '4px 12px', borderRadius: 4, background: questionTimeLeft <= 3 ? 'var(--error)' : 'var(--stone)', color: questionTimeLeft <= 3 ? '#fff' : 'var(--cobalt)' }}>
            {questionTimeLeft}s
          </span>
        </div>
      </div>

      {/* Progress line */}
      <div style={{ height: 2, background: 'var(--rule)' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--cobalt)', transition: 'width 0.3s' }} />
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        {/* Question card */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: difficultyColor[q.difficulty], letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {difficultyLabel[q.difficulty]}
            </span>
            <span style={{ fontSize: 15, color: 'var(--ink-3)' }}>{current + 1} / {questions.length}</span>
          </div>
          <p style={{ fontSize: 19, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.65 }}>{q.prompt}</p>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {(Object.entries(q.options) as [string, string][]).map(([key, value]) => {
            const selected = answers[q.sessionQuestionId] === key
            return (
              <button
                key={key}
                onClick={() => selectAnswer(key as 'A' | 'B' | 'C' | 'D')}
                className={`quiz-option${selected ? ' selected' : ''}`}
              >
                <span className="opt-key">{key}</span>
                <span>{value}</span>
              </button>
            )
          })}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontSize: 15, color: 'var(--ink-3)', lineHeight: 1.65 }}>10 secondes par question · passage automatique</p>
          {current < questions.length - 1 ? (
            <button onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))} className="btn btn-primary btn-sm">Suivant →</button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary btn-sm">{submitting ? '…' : 'Soumettre'}</button>
          )}
        </div>

        {answeredCount > 0 && (
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button onClick={handleSubmit} disabled={submitting} className="btn btn-ghost btn-sm">
              Soumettre maintenant ({answeredCount}/{questions.length})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

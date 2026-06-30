import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiCall } from '../api/client'
import { useAuth } from '../context/AuthContext'

type OptionKey = 'A' | 'B' | 'C' | 'D'
type QuizMode = 'chrono' | 'training' | 'minute'

type Question = {
  sessionQuestionId: string
  questionId: string
  prompt: string
  options: Record<OptionKey, string>
  difficulty: 'easy' | 'medium' | 'hard'
  correctOption: OptionKey
  explanation: string | null
}

type Correction = {
  sessionQuestionId: string
  questionId: string
  prompt: string
  options: Record<OptionKey, string>
  selectedOption: OptionKey | null
  correctOption: OptionKey
  isCorrect: boolean
  explanation: string | null
}

type AnswerMap = Record<string, OptionKey | null>
type SubmitResult = {
  sessionId: string
  score: number
  totalQuestions: number
  submittedAnswers: number
  percentage: number
  corrections?: Correction[]
}

const MODE_CONFIG: Record<QuizMode, { label: string; shortLabel: string; seconds: number; global: boolean }> = {
  chrono: { label: 'Defi chrono', shortLabel: 'Chrono', seconds: 10, global: false },
  training: { label: 'Mode entrainement', shortLabel: 'Entrainement', seconds: 20, global: false },
  minute: { label: 'Course minute', shortLabel: 'Minute', seconds: 60, global: true },
}

const difficultyLabel: Record<string, string> = {
  easy: 'Facile',
  medium: 'Moyen',
  hard: 'Difficile',
}

const cleanQuizPrompt = (prompt: string) => prompt.replace(/^\[[^\]]+\s+-\s+Q\d+\]\s*/i, '').trim()

const resultMessage = (pct: number) => {
  if (pct === 100) return "Parfait, rien ne t'a echappe."
  if (pct >= 80) return 'Excellent travail.'
  if (pct >= 60) return 'Belle manche.'
  if (pct >= 40) return 'Continue, tu progresses.'
  return 'Reprends calmement et relance une manche.'
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
  const mode: QuizMode = location.state?.mode ?? 'chrono'
  const modeConfig = MODE_CONFIG[mode]
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [questionTimeLeft, setQuestionTimeLeft] = useState(modeConfig.global ? 0 : modeConfig.seconds)
  const [globalTimeLeft, setGlobalTimeLeft] = useState(modeConfig.global ? modeConfig.seconds : 0)
  const [feedbackQuestionId, setFeedbackQuestionId] = useState<string | null>(null)

  const answersRef = useRef(answers)
  const submittedRef = useRef(submitted)
  const currentRef = useRef(current)
  useEffect(() => { answersRef.current = answers }, [answers])
  useEffect(() => { submittedRef.current = submitted }, [submitted])
  useEffect(() => { currentRef.current = current }, [current])

  const animatedScore = useCountUp(result?.score ?? 0)
  const animatedPct = useCountUp(result?.percentage ?? 0)
  const corrections = result?.corrections ?? []

  useEffect(() => {
    if (questions.length === 0) navigate('/dashboard')
  }, [navigate, questions.length])

  const submitQuiz = useCallback(async (finalAnswers: AnswerMap = answersRef.current) => {
    if (submitting || submittedRef.current || !sessionId) return
    submittedRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const data = await apiCall<SubmitResult>(
        `/quizzes/${sessionId}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({
            answers: Object.entries(finalAnswers)
              .filter((entry): entry is [string, OptionKey] => entry[1] !== null)
              .map(([sessionQuestionId, selectedOption]) => ({ sessionQuestionId, selectedOption })),
          }),
        },
        accessToken,
      )
      setResult(data)
      setSubmitted(true)
    } catch (err) {
      submittedRef.current = false
      setSubmitted(false)
      setError((err as { message: string }).message)
    } finally {
      setSubmitting(false)
    }
  }, [accessToken, sessionId, submitting])

  const moveNextOrFinish = useCallback((nextAnswers: AnswerMap) => {
    const index = currentRef.current
    if (index >= questions.length - 1) {
      void submitQuiz(nextAnswers)
      return
    }
    setCurrent(index + 1)
    setQuestionTimeLeft(modeConfig.global ? 0 : modeConfig.seconds)
    setFeedbackQuestionId(null)
  }, [modeConfig.global, modeConfig.seconds, questions.length, submitQuiz])

  const markCurrentWrong = useCallback(() => {
    const question = questions[currentRef.current]
    if (!question || submittedRef.current) return answersRef.current
    const nextAnswers = { ...answersRef.current, [question.sessionQuestionId]: null }
    answersRef.current = nextAnswers
    setAnswers(nextAnswers)
    return nextAnswers
  }, [questions])

  useEffect(() => {
    if (submitted || questions.length === 0 || modeConfig.global || feedbackQuestionId) return
    setQuestionTimeLeft(modeConfig.seconds)
    const interval = window.setInterval(() => {
      setQuestionTimeLeft((seconds) => {
        if (seconds <= 1) {
          const nextAnswers = markCurrentWrong()
          if (mode === 'training') {
            setFeedbackQuestionId(questions[currentRef.current]?.sessionQuestionId ?? null)
          } else {
            moveNextOrFinish(nextAnswers)
          }
          return 0
        }
        return seconds - 1
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [feedbackQuestionId, markCurrentWrong, mode, modeConfig.global, modeConfig.seconds, moveNextOrFinish, questions, submitted])

  useEffect(() => {
    if (submitted || questions.length === 0 || !modeConfig.global) return
    setGlobalTimeLeft(modeConfig.seconds)
    const interval = window.setInterval(() => {
      setGlobalTimeLeft((seconds) => {
        if (seconds <= 1) {
          void submitQuiz(answersRef.current)
          return 0
        }
        return seconds - 1
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [modeConfig.global, modeConfig.seconds, questions.length, submitQuiz, submitted])

  const q = questions[current]
  const answeredCount = Object.keys(answers).length
  const activeSeconds = modeConfig.global ? globalTimeLeft : questionTimeLeft
  const timerPct = Math.max(0, Math.min(100, (activeSeconds / Math.max(1, modeConfig.seconds)) * 100))
  const correctionVisible = mode === 'training' && q && feedbackQuestionId === q.sessionQuestionId

  const selectAnswer = (option: OptionKey) => {
    if (!q || submitted || submitting || correctionVisible) return
    const nextAnswers = { ...answersRef.current, [q.sessionQuestionId]: option }
    answersRef.current = nextAnswers
    setAnswers(nextAnswers)

    if (mode === 'training') {
      setFeedbackQuestionId(q.sessionQuestionId)
      return
    }

    moveNextOrFinish(nextAnswers)
  }

  const skipQuestion = () => {
    if (!q || submitted || submitting || mode !== 'minute') return
    const nextAnswers = { ...answersRef.current, [q.sessionQuestionId]: null }
    answersRef.current = nextAnswers
    setAnswers(nextAnswers)
    moveNextOrFinish(nextAnswers)
  }

  const continueTraining = () => {
    moveNextOrFinish(answersRef.current)
  }

  if (submitted && result) {
    return (
      <div className="chalk-quiz-page result">
        <section className="chalk-result-board anim-pop-in">
          <p className="chalk-kicker">Resultat final</p>
          <div className="chalk-result-score">{animatedScore}/{result.totalQuestions}</div>
          <h1>{resultMessage(result.percentage)}</h1>
          <div className="chalk-result-meter"><span style={{ width: `${animatedPct}%` }} /></div>
          <p className="chalk-result-percent">{animatedPct}%</p>

          <div className="chalk-correction-list">
            {corrections.map((item, index) => (
              <article key={item.sessionQuestionId} className={item.isCorrect ? 'correct' : 'wrong'}>
                <div>
                  <span>Q{index + 1}</span>
                  <strong>{item.isCorrect ? 'Correct' : 'A revoir'}</strong>
                </div>
                <p>{cleanQuizPrompt(item.prompt)}</p>
                <small>
                  Ta reponse: {item.selectedOption ? `${item.selectedOption}. ${item.options[item.selectedOption] ?? ''}` : 'aucune'}
                  {' | '}Bonne reponse: {item.correctOption}. {item.options[item.correctOption] ?? ''}
                </small>
                {item.explanation && <em>{item.explanation}</em>}
              </article>
            ))}
          </div>

          <div className="chalk-result-actions">
            <button onClick={() => navigate('/dashboard', { replace: true })} className="btn btn-primary">Retour au tableau de bord</button>
            <button onClick={() => navigate('/dashboard')} className="btn btn-ghost">Lancer une autre manche</button>
          </div>
        </section>
      </div>
    )
  }

  if (!q) return null

  const selected = answers[q.sessionQuestionId]
  const isCorrect = selected === q.correctOption
  const timerLabel = modeConfig.global ? `${globalTimeLeft}s` : `${questionTimeLeft}s`

  return (
    <div className="chalk-quiz-page">
      <div className="chalk-board-shell">
        <header className="chalk-board-top">
          <button onClick={() => navigate('/dashboard')} className="chalk-exit-button">x</button>
          <div>
            <span>{modeConfig.label}</span>
            <strong>Question {current + 1}/{questions.length}</strong>
          </div>
          <b>{timerLabel}</b>
        </header>

        <div className="chalk-progress-track"><span style={{ width: `${timerPct}%` }} /></div>
        <div className="chalk-stars" aria-hidden="true">
          {questions.slice(0, Math.min(5, questions.length)).map((_, index) => <span key={index}>☆</span>)}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <main className="chalk-question-stage anim-slide-in" key={q.sessionQuestionId}>
          <p className="chalk-difficulty">{difficultyLabel[q.difficulty]}</p>
          <h1>{cleanQuizPrompt(q.prompt)}</h1>

          <div className="chalk-options-grid">
            {(Object.entries(q.options) as [OptionKey, string][]).map(([key, value]) => {
              const isSelected = selected === key
              const showCorrect = correctionVisible && q.correctOption === key
              const showWrong = correctionVisible && isSelected && !isCorrect
              return (
                <button
                  key={key}
                  onClick={() => selectAnswer(key)}
                  disabled={submitting || correctionVisible}
                  className={`chalk-option${isSelected ? ' selected' : ''}${showCorrect ? ' correct' : ''}${showWrong ? ' wrong' : ''}`}
                >
                  <span>{key}</span>
                  <strong>{value}</strong>
                </button>
              )
            })}
          </div>
        </main>

        {correctionVisible && (
          <section className={`chalk-feedback ${isCorrect ? 'correct' : 'wrong'}`}>
            <strong>{isCorrect ? 'Bonne reponse' : 'Mauvaise reponse'}</strong>
            <p>Bonne reponse: {q.correctOption}. {q.options[q.correctOption]}</p>
            {q.explanation && <small>{q.explanation}</small>}
            <button onClick={continueTraining} className="btn btn-primary btn-sm">
              {current >= questions.length - 1 ? 'Terminer' : 'Continuer'}
            </button>
          </section>
        )}

        <footer className="chalk-board-bottom">
          <span>{answeredCount}/{questions.length} reponses</span>
          {mode === 'minute' && (
            <button onClick={skipQuestion} disabled={submitting} className="btn btn-ghost btn-sm">Passer</button>
          )}
          <span>{modeConfig.shortLabel}</span>
        </footer>
      </div>
    </div>
  )
}
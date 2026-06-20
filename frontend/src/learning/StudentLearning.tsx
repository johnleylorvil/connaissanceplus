import { useEffect, useMemo, useState, type FormEvent } from 'react'
import MarkdownContent from './MarkdownContent'
import { getCurriculum, getLearningChapter, getTutorConversation, sendTutorMessage } from './learningApi'
import type { Curriculum, LearningChapter, TutorLanguage, TutorMessage } from './types'

type LearningMode = 'library' | 'ai'

type Props = {
  token: string
  mode: LearningMode
  onModeChange: (mode: LearningMode) => void
}

const QUICK_PROMPTS: Record<TutorLanguage, string[]> = {
  fr: ['Explique ce chapitre simplement.', 'Donne-moi un exemple concret.', 'Résume les idées essentielles.', 'Pose-moi trois questions pour vérifier ma compréhension.'],
  ht: ['Eksplike chapit sa a yon fason senp.', 'Ban mwen yon egzanp konkrè.', 'Rezime lide ki pi enpòtan yo.', 'Poze m twa kesyon pou verifye sa mwen konprann.'],
}

export default function StudentLearning({ token, mode, onModeChange }: Props) {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedChapterId, setSelectedChapterId] = useState('')
  const [chapter, setChapter] = useState<LearningChapter | null>(null)
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState<TutorLanguage>('fr')
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [chapterLoading, setChapterLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [tutorError, setTutorError] = useState('')
  const [lastQuestion, setLastQuestion] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    getCurriculum(token)
      .then((data) => {
        setCurriculum(data)
        const firstSubject = data.subjects.find((subject) => subject.chapters.length > 0)
        if (firstSubject) {
          setSelectedSubjectId((current) => current || firstSubject.id)
          setSelectedChapterId((current) => current || firstSubject.chapters[0].id)
        }
      })
      .catch((err: { message?: string }) => setError(err.message ?? 'Impossible de charger votre programme.'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!selectedChapterId) {
      setChapter(null)
      return
    }
    setChapterLoading(true)
    getLearningChapter(selectedChapterId, token)
      .then(setChapter)
      .catch((err: { message?: string }) => setError(err.message ?? 'Impossible de charger ce chapitre.'))
      .finally(() => setChapterLoading(false))
  }, [selectedChapterId, token])

  useEffect(() => {
    if (mode !== 'ai' || !selectedChapterId) return
    setTutorError('')
    getTutorConversation(selectedChapterId, language, token)
      .then((data) => setMessages(data.messages))
      .catch((err: { message?: string }) => setTutorError(err.message ?? "Impossible de charger l'historique."))
  }, [language, mode, selectedChapterId, token])

  const filteredSubjects = useMemo(() => {
    if (!curriculum) return []
    const query = search.trim().toLocaleLowerCase('fr')
    if (!query) return curriculum.subjects
    return curriculum.subjects
      .map((subject) => ({
        ...subject,
        chapters: subject.chapters.filter((item) =>
          subject.name.toLocaleLowerCase('fr').includes(query)
          || item.title.toLocaleLowerCase('fr').includes(query)
          || item.summary.toLocaleLowerCase('fr').includes(query)),
      }))
      .filter((subject) => subject.chapters.length > 0)
  }, [curriculum, search])

  const selectedSubject = curriculum?.subjects.find((subject) => subject.id === selectedSubjectId)

  const selectChapter = (subjectId: string, chapterId: string) => {
    setSelectedSubjectId(subjectId)
    setSelectedChapterId(chapterId)
    setError('')
  }

  const submitQuestion = async (question: string) => {
    const clean = question.trim()
    if (!clean || !selectedChapterId || sending) return
    setSending(true)
    setTutorError('')
    setLastQuestion(clean)
    try {
      const response = await sendTutorMessage(selectedChapterId, language, clean, token)
      setMessages((current) => [...current, ...response.messages])
      setDraft('')
    } catch (err) {
      setTutorError((err as { message?: string }).message ?? 'Le tuteur est temporairement indisponible.')
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submitQuestion(draft)
  }

  if (loading) return <div className="card learning-empty">Chargement de votre programme...</div>
  if (error && !curriculum) return <div className="alert alert-error">{error}</div>
  if (!curriculum?.class) return <div className="card learning-empty">Complétez votre classe dans votre profil pour accéder au programme.</div>

  return (
    <div className="learning-page">
      <header className="learning-header">
        <div>
          <p className="overline">Programme de {curriculum.class.name}</p>
          <h1 className="display">{mode === 'library' ? 'Bibliothèque de contenus' : 'IA pédagogique'}</h1>
          <p>{mode === 'library' ? 'Consultez les chapitres publiés pour votre classe.' : 'Votre tuteur répond à partir du chapitre sélectionné.'}</p>
        </div>
        <div className="learning-mode-switch" role="tablist" aria-label="Espace apprentissage">
          <button className={mode === 'library' ? 'active' : ''} onClick={() => onModeChange('library')}>Bibliothèque</button>
          <button className={mode === 'ai' ? 'active' : ''} onClick={() => onModeChange('ai')}>Tuteur IA</button>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {curriculum.subjects.every((subject) => subject.chapters.length === 0) ? (
        <div className="card learning-empty">
          <strong>Aucun chapitre publié pour le moment.</strong>
          <span>Les contenus validés par l’administration apparaîtront ici.</span>
        </div>
      ) : mode === 'library' ? (
        <div className="learning-library-layout">
          <aside className="learning-outline card">
            <label className="field-label" htmlFor="learning-search">Rechercher</label>
            <input id="learning-search" className="field-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Matière ou chapitre" />
            <div className="learning-subject-list">
              {filteredSubjects.map((subject) => (
                <details key={subject.id} open={subject.id === selectedSubjectId}>
                  <summary>{subject.name}<span>{subject.chapters.length}</span></summary>
                  {subject.chapters.map((item) => (
                    <button key={item.id} className={item.id === selectedChapterId ? 'active' : ''} onClick={() => selectChapter(subject.id, item.id)}>
                      <strong>{item.title}</strong><span>{item.summary}</span>
                    </button>
                  ))}
                </details>
              ))}
              {filteredSubjects.length === 0 && <p className="learning-muted">Aucun résultat.</p>}
            </div>
          </aside>
          <section className="learning-reader card">
            {chapterLoading ? <p>Chargement du chapitre...</p> : chapter ? (
              <>
                <p className="overline">{chapter.subject.name}</p>
                <h2 className="display">{chapter.title}</h2>
                <p className="learning-chapter-summary">{chapter.summary}</p>
                <MarkdownContent content={chapter.content} />
                <button className="btn btn-primary learning-ask-button" onClick={() => onModeChange('ai')}>Expliquer avec l’IA</button>
              </>
            ) : <p className="learning-muted">Choisissez un chapitre pour commencer.</p>}
          </section>
        </div>
      ) : (
        <div className="learning-tutor card">
          <div className="learning-tutor-controls">
            <label><span className="field-label">Matière</span>
              <select className="field-input" value={selectedSubjectId} onChange={(event) => {
                const subject = curriculum.subjects.find((item) => item.id === event.target.value)
                setSelectedSubjectId(event.target.value)
                setSelectedChapterId(subject?.chapters[0]?.id ?? '')
                setMessages([])
              }}>
                {curriculum.subjects.filter((subject) => subject.chapters.length > 0).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </label>
            <label><span className="field-label">Chapitre</span>
              <select className="field-input" value={selectedChapterId} onChange={(event) => { setSelectedChapterId(event.target.value); setMessages([]) }}>
                {selectedSubject?.chapters.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
            <label><span className="field-label">Langue</span>
              <select className="field-input" value={language} onChange={(event) => { setLanguage(event.target.value as TutorLanguage); setMessages([]) }}>
                <option value="fr">Français</option><option value="ht">Kreyòl ayisyen</option>
              </select>
            </label>
          </div>

          <div className="learning-quick-prompts">
            {QUICK_PROMPTS[language].map((prompt) => <button key={prompt} disabled={sending} onClick={() => void submitQuestion(prompt)}>{prompt}</button>)}
          </div>

          <div className="learning-chat" aria-live="polite">
            {messages.length === 0 ? (
              <div className="learning-chat-empty"><strong>Posez votre première question.</strong><span>Le tuteur utilisera le contenu du chapitre sélectionné.</span></div>
            ) : messages.map((message) => (
              <div key={message.id} className={`learning-message ${message.role}`}>
                <span>{message.role === 'assistant' ? 'Tuteur Konesans+' : 'Vous'}</span>
                <MarkdownContent content={message.content} />
              </div>
            ))}
            {sending && <div className="learning-message assistant"><span>Tuteur Konesans+</span><p>Préparation de l’explication...</p></div>}
          </div>

          {tutorError && <div className="alert alert-error learning-tutor-error">{tutorError}{lastQuestion && <button onClick={() => void submitQuestion(lastQuestion)} disabled={sending}>Réessayer</button>}</div>}
          <form className="learning-chat-form" onSubmit={handleSubmit}>
            <textarea className="field-input" maxLength={2000} rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={language === 'ht' ? 'Ekri kesyon ou la...' : 'Écrivez votre question...'} />
            <button className="btn btn-primary" disabled={sending || !draft.trim()}>Envoyer</button>
          </form>
        </div>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import MarkdownContent from './MarkdownContent'
import { getCurriculum, getLearningChapter, getTutorConversation, sendTutorMessage } from './learningApi'
import type { Curriculum, LearningChapter, TutorLanguage, TutorMessage } from './types'

type LearningMode = 'library' | 'ai'

type Props = {
  token: string
  mode: LearningMode
  onModeChange: (mode: LearningMode) => void
  preferredLanguage?: TutorLanguage
}

const QUICK_PROMPTS: Record<TutorLanguage, string[]> = {
  fr: [
    'Explique ce chapitre simplement.',
    'Donne-moi un exemple concret.',
    'Resume les idees essentielles.',
    'Pose-moi trois questions pour verifier ma comprehension.',
  ],
  ht: [
    'Eksplike chapit sa a yon fason senp.',
    'Ban mwen yon egzanp konkret.',
    'Rezime lide ki pi enpotan yo.',
    'Poze m twa kesyon pou verifye sa mwen konprann.',
  ],
}

const THEME_PROMPTS: Array<{ label: string; prompt: Record<TutorLanguage, string> }> = [
  { label: 'Resume', prompt: { fr: 'Fais un resume clair du chapitre selectionne.', ht: 'Fe yon rezime kle sou chapit mwen chwazi a.' } },
  { label: 'Explication simple', prompt: { fr: 'Explique ce chapitre avec des mots simples.', ht: 'Eksplike chapit sa a ak mo ki senp.' } },
  { label: 'Exemple', prompt: { fr: 'Donne un exemple concret lie a ce chapitre.', ht: 'Ban mwen yon egzanp konkret ki mache ak chapit sa a.' } },
  { label: 'Exercice', prompt: { fr: 'Prepare un petit exercice avec correction sur ce chapitre.', ht: 'Prepare yon ti egzesis ak koreksyon sou chapit sa a.' } },
]

export default function StudentLearning({ token, mode, onModeChange, preferredLanguage }: Props) {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedChapterId, setSelectedChapterId] = useState('')
  const [chapter, setChapter] = useState<LearningChapter | null>(null)
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState<TutorLanguage>(preferredLanguage ?? 'fr')
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
        const firstWithChapters = data.subjects.find((subject) => subject.chapters.length > 0)
        const firstSubject = firstWithChapters ?? data.subjects[0]
        if (firstSubject) {
          setSelectedSubjectId((current) => current || firstSubject.id)
          setSelectedChapterId((current) => current || firstSubject.chapters[0]?.id || '')
        }
      })
      .catch((err: { message?: string }) => setError(err.message ?? 'Impossible de charger votre programme.'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!selectedChapterId) {
      setChapter(null)
      setMessages([])
      return
    }
    setChapterLoading(true)
    getLearningChapter(selectedChapterId, token)
      .then(setChapter)
      .catch((err: { message?: string }) => setError(err.message ?? 'Impossible de charger ce chapitre.'))
      .finally(() => setChapterLoading(false))
  }, [selectedChapterId, token])

  useEffect(() => {
    if (!selectedChapterId) return
    setTutorError('')
    getTutorConversation(selectedChapterId, language, token)
      .then((data) => setMessages(data.messages))
      .catch((err: { message?: string }) => setTutorError(err.message ?? "Impossible de charger l'historique."))
  }, [language, selectedChapterId, token])

  const filteredSubjects = useMemo(() => {
    if (!curriculum) return []
    const query = search.trim().toLocaleLowerCase('fr')
    if (!query) return curriculum.subjects
    return curriculum.subjects
      .map((subject) => {
        const subjectMatch = subject.name.toLocaleLowerCase('fr').includes(query)
        return {
          ...subject,
          chapters: subjectMatch
            ? subject.chapters
            : subject.chapters.filter((item) =>
                item.title.toLocaleLowerCase('fr').includes(query)
                || item.summary.toLocaleLowerCase('fr').includes(query),
              ),
          subjectMatch,
        }
      })
      .filter((subject) => subject.subjectMatch || subject.chapters.length > 0)
  }, [curriculum, search])

  const selectedSubject = curriculum?.subjects.find((subject) => subject.id === selectedSubjectId)
  const hasPublishedChapters = Boolean(curriculum?.subjects.some((subject) => subject.chapters.length > 0))
  const totalChapters = curriculum?.subjects.reduce((sum, subject) => sum + subject.chapters.length, 0) ?? 0

  const selectSubject = (subjectId: string) => {
    const subject = curriculum?.subjects.find((item) => item.id === subjectId)
    setSelectedSubjectId(subjectId)
    setSelectedChapterId(subject?.chapters[0]?.id ?? '')
    setChapter(null)
    setMessages([])
    setError('')
  }

  const selectChapter = (subjectId: string, chapterId: string) => {
    setSelectedSubjectId(subjectId)
    setSelectedChapterId(chapterId)
    setMessages([])
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
      onModeChange('ai')
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
  if (!curriculum?.class) return <div className="card learning-empty">Completez votre classe dans votre profil pour acceder au programme.</div>

  return (
    <div className="learning-page learning-hub-page">
      <header className="learning-hub-hero">
        <div>
          <p className="overline">Programme de {curriculum.class.name}</p>
          <h1 className="display">Bibliotheque intelligente</h1>
          <p>
            Explorez les documents officiels par matiere, ouvrez les chapitres publies,
            puis demandez au tuteur IA de les resumer ou de les expliquer.
          </p>
        </div>
        <nav className="learning-hub-nav" aria-label="Navigation apprentissage">
          <button className={mode === 'library' ? 'active' : ''} onClick={() => onModeChange('library')} type="button">Contenus</button>
          <button onClick={() => document.getElementById('learning-themes')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} type="button">Themes</button>
          <button className={mode === 'ai' ? 'active' : ''} onClick={() => onModeChange('ai')} type="button">Tuteur IA</button>
        </nav>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="learning-search-panel" aria-label="Recherche dans la bibliotheque">
        <label>
          <span>Recherche dans les documents officiels</span>
          <input
            className="field-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Matiere, chapitre ou theme"
          />
        </label>
        <div className="learning-search-stats" aria-label="Couverture du programme">
          <strong>{curriculum.subjects.length}</strong>
          <span>matieres</span>
          <strong>{totalChapters}</strong>
          <span>chapitres publies</span>
        </div>
      </section>

      {!hasPublishedChapters && (
        <section className="learning-notice">
          <strong>Aucun chapitre publie pour le moment.</strong>
          <span>
            Les matieres de votre classe sont deja listees ci-dessous. Les chapitres apparaitront
            des que l'administration publiera les contenus officiels.
          </span>
        </section>
      )}

      <section className="learning-hub-grid">
        <aside className="learning-document-rail" aria-label="Documents officiels par matiere">
          <div className="learning-section-title">
            <p className="overline">Documents officiels</p>
            <h2>Matieres</h2>
          </div>

          <div className="learning-book-list">
            {filteredSubjects.map((subject) => (
              <button
                key={subject.id}
                type="button"
                className={`learning-book-card ${subject.id === selectedSubjectId ? 'active' : ''}`}
                onClick={() => selectSubject(subject.id)}
              >
                <span>{subject.name.slice(0, 3).toUpperCase()}</span>
                <div>
                  <strong>{subject.name}</strong>
                  <small>{subject.chapters.length} chapitre{subject.chapters.length > 1 ? 's' : ''} publie{subject.chapters.length > 1 ? 's' : ''}</small>
                </div>
              </button>
            ))}
            {filteredSubjects.length === 0 && <p className="learning-muted">Aucune matiere ne correspond a cette recherche.</p>}
          </div>
        </aside>

        <main className="learning-chapter-stage">
          <div className="learning-section-title">
            <p className="overline">{selectedSubject?.name ?? 'Matiere'}</p>
            <h2>Chapitres et contenu</h2>
          </div>

          <div className="learning-chapter-tabs">
            {selectedSubject?.chapters.map((item, index) => (
              <button
                key={item.id}
                className={item.id === selectedChapterId ? 'active' : ''}
                onClick={() => selectChapter(selectedSubject.id, item.id)}
                type="button"
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{item.title}</strong>
                <small>{item.summary}</small>
              </button>
            ))}
            {selectedSubject && selectedSubject.chapters.length === 0 && (
              <div className="learning-empty-inline">
                <strong>Aucun chapitre publie dans cette matiere.</strong>
                <span>Le document officiel existe dans le programme, mais son contenu n'est pas encore publie.</span>
              </div>
            )}
          </div>

          <article className="learning-reader learning-smart-reader">
            {chapterLoading ? <p>Chargement du chapitre...</p> : chapter ? (
              <>
                <p className="overline">{chapter.subject.name}</p>
                <h2 className="display">{chapter.title}</h2>
                <p className="learning-chapter-summary">{chapter.summary}</p>
                <MarkdownContent content={chapter.content} />
              </>
            ) : (
              <div className="learning-empty-inline reader-empty">
                <strong>Choisissez un chapitre publie.</strong>
                <span>Le contenu officiel complet s'affichera ici avec ses titres, exemples et explications.</span>
              </div>
            )}
          </article>
        </main>

        <aside className="learning-ai-dock" aria-label="Tuteur IA pedagogique">
          <div className="learning-section-title">
            <p className="overline">IA pedagogique</p>
            <h2>Analyse du chapitre</h2>
          </div>

          <div className="learning-ai-context">
            <span>Source active</span>
            <strong>{chapter?.title ?? selectedSubject?.name ?? 'Aucun chapitre selectionne'}</strong>
            <p>
              {chapter
                ? "Le tuteur utilise le chapitre selectionne et l'historique de cette conversation."
                : 'Selectionnez un chapitre publie pour activer les resumes, recherches par theme et explications personnalisees.'}
            </p>
          </div>

          <label className="learning-language-field">
            <span className="field-label">Langue du tuteur</span>
            <select className="field-input" value={language} onChange={(event) => { setLanguage(event.target.value as TutorLanguage); setMessages([]) }}>
              <option value="fr">Francais</option>
              <option value="ht">Kreyol ayisyen</option>
            </select>
          </label>

          <div id="learning-themes" className="learning-theme-cloud" aria-label="Themes et actions rapides">
            {THEME_PROMPTS.map((theme) => (
              <button
                key={theme.label}
                type="button"
                disabled={!selectedChapterId || sending}
                onClick={() => void submitQuestion(theme.prompt[language])}
              >
                {theme.label}
              </button>
            ))}
          </div>

          <div className="learning-quick-prompts">
            {QUICK_PROMPTS[language].map((prompt) => (
              <button key={prompt} disabled={!selectedChapterId || sending} onClick={() => void submitQuestion(prompt)} type="button">
                {prompt}
              </button>
            ))}
          </div>

          <div className="learning-chat learning-smart-chat" aria-live="polite">
            {messages.length === 0 ? (
              <div className="learning-chat-empty">
                <strong>{selectedChapterId ? 'Posez votre premiere question.' : 'IA en attente de chapitre.'}</strong>
                <span>{selectedChapterId ? 'Le tuteur utilisera le contenu officiel selectionne.' : 'Publiez ou choisissez un chapitre pour commencer.'}</span>
              </div>
            ) : messages.map((message) => (
              <div key={message.id} className={`learning-message ${message.role}`}>
                <span>{message.role === 'assistant' ? 'Tuteur Konesans+' : 'Vous'}</span>
                <MarkdownContent content={message.content} />
              </div>
            ))}
            {sending && <div className="learning-message assistant"><span>Tuteur Konesans+</span><p>Preparation de l'explication...</p></div>}
          </div>

          {tutorError && <div className="alert alert-error learning-tutor-error">{tutorError}{lastQuestion && <button onClick={() => void submitQuestion(lastQuestion)} disabled={sending}>Reessayer</button>}</div>}

          <form className="learning-chat-form learning-smart-form" onSubmit={handleSubmit}>
            <textarea
              className="field-input"
              maxLength={2000}
              rows={3}
              value={draft}
              disabled={!selectedChapterId}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={selectedChapterId ? (language === 'ht' ? 'Ekri kesyon ou la...' : 'Ecrivez votre question...') : 'Selectionnez un chapitre publie pour poser une question.'}
            />
            <button className="btn btn-primary" disabled={sending || !draft.trim() || !selectedChapterId}>Envoyer</button>
          </form>
        </aside>
      </section>
    </div>
  )
}

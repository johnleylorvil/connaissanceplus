import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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

type TutorAction = {
  id: string
  label: string
  helper: string
  prompt: Record<TutorLanguage, string>
}

const TUTOR_ACTIONS: TutorAction[] = [
  {
    id: 'summary',
    label: 'Resumer',
    helper: 'Idees essentielles',
    prompt: {
      fr: 'Resume le chapitre officiel selectionne en gardant seulement les idees essentielles. Termine par 3 points a retenir.',
      ht: 'Fe yon rezime chapit ofisyel mwen chwazi a. Mete 3 lide prensipal pou m sonje.',
    },
  },
  {
    id: 'simple',
    label: 'Simplifier',
    helper: 'Explication claire',
    prompt: {
      fr: 'Explique le passage autour de ma position de lecture avec des mots simples, sans sortir du document officiel.',
      ht: 'Eksplike pati mwen ap li a ak mo ki senp, san soti nan dokiman ofisyel la.',
    },
  },
  {
    id: 'examples',
    label: 'Exemples',
    helper: 'Situations concretes',
    prompt: {
      fr: 'Donne des exemples concrets lies au chapitre selectionne, puis indique quelle idee du chapitre chaque exemple illustre.',
      ht: 'Ban mwen egzanp konkret ki mache ak chapit la, epi di ki lide nan chapit la chak egzanp montre.',
    },
  },
  {
    id: 'practice',
    label: 'Exercices',
    helper: 'Avec correction',
    prompt: {
      fr: 'Cree 4 exercices progressifs bases uniquement sur ce chapitre, avec correction et explication courte.',
      ht: 'Kreye 4 egzesis ki baze selman sou chapit sa a, avek koreksyon ak ti eksplikasyon.',
    },
  },
  {
    id: 'quiz',
    label: 'Quiz',
    helper: 'Verifier la comprehension',
    prompt: {
      fr: 'Genere un mini quiz de 5 questions a choix multiple a partir du chapitre officiel, puis donne les reponses corrigees.',
      ht: 'Fe yon ti quiz 5 kesyon chwa miltip sou chapit ofisyel la, epi bay koreksyon yo.',
    },
  },
  {
    id: 'references',
    label: 'Passages',
    helper: 'Retrouver la source',
    prompt: {
      fr: 'Retrouve les passages pertinents du chapitre pour repondre a ma question. Cite les idees et explique ou regarder dans le document.',
      ht: 'Chache pasaj ki pi enpotan nan chapit la pou reponn kesyon mwen. Eksplike kote pou m gade nan dokiman an.',
    },
  },
]

export default function StudentLearning({ token, mode: _mode, onModeChange, preferredLanguage }: Props) {
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
  const [readingProgress, setReadingProgress] = useState(0)
  const readerRef = useRef<HTMLElement | null>(null)

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
      setReadingProgress(0)
      return
    }
    setChapterLoading(true)
    setReadingProgress(0)
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
  const selectedChapterSummary = selectedSubject?.chapters.find((item) => item.id === selectedChapterId)
  const hasPublishedChapters = Boolean(curriculum?.subjects.some((subject) => subject.chapters.length > 0))
  const totalChapters = curriculum?.subjects.reduce((sum, subject) => sum + subject.chapters.length, 0) ?? 0
  const currentBookTitle = selectedSubject ? `Livre officiel de ${selectedSubject.name}` : 'Livre officiel'

  const selectSubject = (subjectId: string) => {
    const subject = curriculum?.subjects.find((item) => item.id === subjectId)
    setSelectedSubjectId(subjectId)
    setSelectedChapterId(subject?.chapters[0]?.id ?? '')
    setChapter(null)
    setMessages([])
    setReadingProgress(0)
    setError('')
  }

  const selectChapter = (subjectId: string, chapterId: string) => {
    setSelectedSubjectId(subjectId)
    setSelectedChapterId(chapterId)
    setMessages([])
    setReadingProgress(0)
    setError('')
  }

  const updateReadingProgress = () => {
    const node = readerRef.current
    if (!node) return
    const max = node.scrollHeight - node.clientHeight
    setReadingProgress(max <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((node.scrollTop / max) * 100))))
  }

  const submitQuestion = async (question: string) => {
    const clean = question.trim()
    if (!clean || !selectedChapterId || sending) return
    const contextAwareQuestion = `${clean}\n\nContexte automatique: classe ${curriculum?.class?.name ?? ''}, matiere ${selectedSubject?.name ?? ''}, livre ${currentBookTitle}, chapitre ${chapter?.title ?? selectedChapterSummary?.title ?? ''}, position de lecture environ ${readingProgress}%. Reponds uniquement a partir du document officiel et renvoie vers les passages pertinents quand c'est utile.`
    setSending(true)
    setTutorError('')
    setLastQuestion(clean)
    try {
      const response = await sendTutorMessage(selectedChapterId, language, contextAwareQuestion, token)
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

  if (loading) return <div className="card learning-empty">Chargement de votre manuel intelligent...</div>
  if (error && !curriculum) return <div className="alert alert-error">{error}</div>
  if (!curriculum?.class) return <div className="card learning-empty">Completez votre classe dans votre profil pour acceder au manuel officiel.</div>

  return (
    <div className="learning-page smart-manual-page">
      <header className="smart-manual-topbar">
        <div>
          <p className="overline">Manuel scolaire intelligent</p>
          <h1 className="display">{currentBookTitle}</h1>
          <p>Le document officiel reste au centre. Le tuteur IA comprend automatiquement la classe, la matiere, le livre, le chapitre et votre position de lecture.</p>
        </div>
        <div className="smart-manual-progress" aria-label="Progression de lecture">
          <span>{readingProgress}%</span>
          <small>lecture</small>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="smart-manual-search" aria-label="Recherche dans le manuel">
        <label>
          <span>Rechercher dans les matieres, livres et chapitres</span>
          <input className="field-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex: fractions, revolution, cycle de l'eau" />
        </label>
        <div>
          <strong>{curriculum.subjects.length}</strong><span>matieres</span>
          <strong>{totalChapters}</strong><span>chapitres</span>
        </div>
      </section>

      {!hasPublishedChapters && (
        <section className="smart-manual-empty-note">
          <strong>Aucun chapitre publie pour le moment.</strong>
          <span>Les matieres de votre classe sont visibles. Les livres et chapitres officiels apparaitront ici apres publication par l'administration.</span>
        </section>
      )}

      <section className="smart-manual-shell">
        <aside className="manual-navigation" aria-label="Navigation classe matiere livre chapitre">
          <div className="manual-nav-block class-block">
            <span>Classe</span>
            <strong>{curriculum.class.name}</strong>
          </div>

          <div className="manual-nav-block">
            <div className="manual-nav-heading"><span>Matieres</span><small>{filteredSubjects.length}</small></div>
            <div className="manual-subject-list">
              {filteredSubjects.map((subject) => (
                <button key={subject.id} type="button" className={subject.id === selectedSubjectId ? 'active' : ''} onClick={() => selectSubject(subject.id)}>
                  <strong>{subject.name}</strong>
                  <small>{subject.chapters.length} chapitre{subject.chapters.length > 1 ? 's' : ''}</small>
                </button>
              ))}
              {filteredSubjects.length === 0 && <p className="learning-muted">Aucune matiere trouvee.</p>}
            </div>
          </div>

          <div className="manual-nav-block">
            <div className="manual-nav-heading"><span>Livre</span><small>officiel</small></div>
            <article className="manual-book-card">
              <div>{selectedSubject?.name.slice(0, 3).toUpperCase() ?? 'DOC'}</div>
              <strong>{currentBookTitle}</strong>
              <small>Programme de {curriculum.class.name}</small>
            </article>
          </div>

          <div className="manual-nav-block">
            <div className="manual-nav-heading"><span>Chapitres</span><small>{selectedSubject?.chapters.length ?? 0}</small></div>
            <div className="manual-chapter-list">
              {selectedSubject?.chapters.map((item, index) => (
                <button key={item.id} type="button" className={item.id === selectedChapterId ? 'active' : ''} onClick={() => selectChapter(selectedSubject.id, item.id)}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{item.title}</strong><small>{item.summary}</small></div>
                </button>
              ))}
              {selectedSubject && selectedSubject.chapters.length === 0 && <p className="learning-muted">Aucun chapitre publie.</p>}
            </div>
          </div>
        </aside>

        <main className="manual-reader-column">
          <div className="manual-breadcrumb" aria-label="Fil d'Ariane">
            <span>{curriculum.class.name}</span>
            <span>{selectedSubject?.name ?? 'Matiere'}</span>
            <span>{currentBookTitle}</span>
            <strong>{chapter?.title ?? selectedChapterSummary?.title ?? 'Chapitre'}</strong>
          </div>

          <article ref={readerRef} onScroll={updateReadingProgress} className="manual-reader" aria-label="Texte officiel du chapitre">
            {chapterLoading ? <p>Chargement du chapitre...</p> : chapter ? (
              <>
                <div className="manual-reader-header">
                  <p className="overline">Document officiel</p>
                  <h2>{chapter.title}</h2>
                  <p>{chapter.summary}</p>
                </div>
                <MarkdownContent content={chapter.content} />
              </>
            ) : (
              <div className="manual-reader-placeholder">
                <strong>Choisissez un chapitre.</strong>
                <span>Le texte officiel occupera cette zone de lecture.</span>
              </div>
            )}
          </article>
        </main>

        <aside className="manual-ai-panel" aria-label="Tuteur IA contextuel">
          <div className="manual-ai-header">
            <div>
              <p className="overline">Tuteur IA</p>
              <h2>Copilote du manuel</h2>
            </div>
            <select className="field-input" value={language} onChange={(event) => { setLanguage(event.target.value as TutorLanguage); setMessages([]) }}>
              <option value="fr">Francais</option>
              <option value="ht">Kreyol</option>
            </select>
          </div>

          <div className="manual-ai-context">
            <span>Contexte automatique</span>
            <strong>{chapter?.title ?? selectedSubject?.name ?? 'Aucun chapitre'}</strong>
            <p>{selectedChapterId ? `Position de lecture: ${readingProgress}%. Le tuteur repond a partir du document officiel.` : 'Selectionnez un chapitre pour activer le tuteur.'}</p>
          </div>

          <div className="manual-ai-actions">
            {TUTOR_ACTIONS.map((action) => (
              <button key={action.id} type="button" disabled={!selectedChapterId || sending} onClick={() => void submitQuestion(action.prompt[language])}>
                <strong>{action.label}</strong>
                <small>{action.helper}</small>
              </button>
            ))}
          </div>

          <div className="manual-ai-chat" aria-live="polite">
            {messages.length === 0 ? (
              <div className="manual-ai-empty">
                <strong>{selectedChapterId ? 'Demandez sans expliquer le contexte.' : 'IA en attente du chapitre.'}</strong>
                <span>{selectedChapterId ? 'Le tuteur connait deja le livre, le chapitre et votre lecture.' : 'Ouvrez un chapitre pour commencer.'}</span>
              </div>
            ) : messages.map((message) => (
              <div key={message.id} className={`learning-message ${message.role}`}>
                <span>{message.role === 'assistant' ? 'Tuteur Konesans+' : 'Vous'}</span>
                <MarkdownContent content={message.content} />
              </div>
            ))}
            {sending && <div className="learning-message assistant"><span>Tuteur Konesans+</span><p>Analyse du passage...</p></div>}
          </div>

          {tutorError && <div className="alert alert-error learning-tutor-error">{tutorError}{lastQuestion && <button onClick={() => void submitQuestion(lastQuestion)} disabled={sending}>Reessayer</button>}</div>}

          <form className="manual-ai-form" onSubmit={handleSubmit}>
            <textarea className="field-input" rows={3} maxLength={2000} disabled={!selectedChapterId} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={selectedChapterId ? 'Posez votre question sur ce passage...' : 'Selectionnez un chapitre pour poser une question.'} />
            <button className="btn btn-primary" disabled={sending || !draft.trim() || !selectedChapterId}>Envoyer</button>
          </form>
        </aside>
      </section>
    </div>
  )
}
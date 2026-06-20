import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import MarkdownContent from './MarkdownContent'
import { createAdminChapter, deleteAdminChapter, listAdminChapters, updateAdminChapter } from './learningApi'
import type { AdminChapter } from './types'

type SchoolClass = { id: string; name: string }
type Subject = { id: string; name: string; classId: string }

type Props = { token: string; classes: SchoolClass[]; subjects: Subject[] }

type ChapterForm = { classId: string; subjectId: string; title: string; summary: string; content: string; position: string; status: 'draft' | 'published' }
const emptyForm: ChapterForm = { classId: '', subjectId: '', title: '', summary: '', content: '', position: '0', status: 'draft' }

export default function AdminLearningManager({ token, classes, subjects }: Props) {
  const [chapters, setChapters] = useState<AdminChapter[]>([])
  const [filterClassId, setFilterClassId] = useState('')
  const [filterSubjectId, setFilterSubjectId] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setChapters(await listAdminChapters({ classId: filterClassId, subjectId: filterSubjectId }, token))
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Impossible de charger les chapitres.')
    } finally {
      setLoading(false)
    }
  }, [filterClassId, filterSubjectId, token])

  useEffect(() => { void load() }, [load])

  const formSubjects = useMemo(() => subjects.filter((subject) => !form.classId || subject.classId === form.classId), [form.classId, subjects])
  const filterSubjects = useMemo(() => subjects.filter((subject) => !filterClassId || subject.classId === filterClassId), [filterClassId, subjects])

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm)
    setPreview(false)
  }

  const editChapter = (chapter: AdminChapter) => {
    setEditingId(chapter.id)
    setForm({
      classId: chapter.subject.classId,
      subjectId: chapter.subjectId,
      title: chapter.title,
      summary: chapter.summary,
      content: chapter.content,
      position: String(chapter.position),
      status: chapter.status,
    })
    setPreview(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.subjectId) return
    setSaving(true)
    setError('')
    setMessage('')
    const payload = {
      subjectId: form.subjectId,
      title: form.title,
      summary: form.summary,
      content: form.content,
      position: Number(form.position),
      status: form.status,
    }
    try {
      if (editingId) await updateAdminChapter(editingId, payload, token)
      else await createAdminChapter(payload, token)
      setMessage(editingId ? 'Chapitre mis à jour.' : 'Chapitre créé.')
      resetForm()
      await load()
    } catch (err) {
      setError((err as { message?: string }).message ?? "Impossible d'enregistrer le chapitre.")
    } finally {
      setSaving(false)
    }
  }

  const togglePublication = async (chapter: AdminChapter) => {
    setError('')
    try {
      await updateAdminChapter(chapter.id, { status: chapter.status === 'published' ? 'draft' : 'published' }, token)
      await load()
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Impossible de modifier la publication.')
    }
  }

  const remove = async (chapter: AdminChapter) => {
    if (!window.confirm(`Supprimer définitivement « ${chapter.title} » ?`)) return
    setError('')
    try {
      await deleteAdminChapter(chapter.id, token)
      if (editingId === chapter.id) resetForm()
      await load()
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Impossible de supprimer le chapitre.')
    }
  }

  return (
    <div className="admin-learning-page">
      <header className="learning-header">
        <div><p className="overline">Gestion académique</p><h1 className="display">Bibliothèque de contenus</h1><p>Créez et validez les chapitres accessibles aux élèves et au tuteur IA.</p></div>
      </header>
      {message && <div className="alert alert-ok">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <form className="card admin-learning-form" onSubmit={submit}>
        <div className="admin-learning-form-heading">
          <div><p className="overline">{editingId ? 'Modification' : 'Nouveau contenu'}</p><h2>{editingId ? 'Modifier le chapitre' : 'Ajouter un chapitre'}</h2></div>
          {editingId && <button type="button" className="btn btn-ghost btn-sm" onClick={resetForm}>Annuler</button>}
        </div>
        <div className="responsive-two-col">
          <label><span className="field-label">Classe</span><select required className="field-input" value={form.classId} onChange={(event) => setForm({ ...form, classId: event.target.value, subjectId: '' })}><option value="">Choisir une classe</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span className="field-label">Matière</span><select required className="field-input" value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })}><option value="">Choisir une matière</option>{formSubjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <label><span className="field-label">Titre</span><input required maxLength={160} className="field-input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label><span className="field-label">Résumé</span><textarea required maxLength={600} rows={2} className="field-input" value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label>
        <div className="admin-learning-editor-heading"><span className="field-label">Contenu Markdown</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview((value) => !value)}>{preview ? 'Continuer la rédaction' : 'Aperçu'}</button></div>
        {preview ? <div className="admin-learning-preview"><MarkdownContent content={form.content || '_Aucun contenu_'}/></div> : <textarea required maxLength={50000} rows={14} className="field-input admin-learning-editor" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder={'## Objectif\n\nPrésentez le cours avec des titres, listes et exemples.'} />}
        <div className="responsive-two-col">
          <label><span className="field-label">Ordre</span><input required min={0} type="number" className="field-input" value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} /></label>
          <label><span className="field-label">Statut</span><select className="field-input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as 'draft' | 'published' })}><option value="draft">Brouillon</option><option value="published">Publié</option></select></label>
        </div>
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement...' : editingId ? 'Enregistrer les changements' : 'Créer le chapitre'}</button>
      </form>

      <section className="card admin-learning-list">
        <div className="admin-learning-list-heading"><div><p className="overline">Catalogue</p><h2>Chapitres ({chapters.length})</h2></div><div className="admin-learning-filters"><select className="field-input" value={filterClassId} onChange={(event) => { setFilterClassId(event.target.value); setFilterSubjectId('') }}><option value="">Toutes les classes</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="field-input" value={filterSubjectId} onChange={(event) => setFilterSubjectId(event.target.value)}><option value="">Toutes les matières</option>{filterSubjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div>
        {loading ? <p className="learning-muted">Chargement...</p> : chapters.length === 0 ? <p className="learning-muted">Aucun chapitre ne correspond à ces filtres.</p> : (
          <div className="admin-learning-rows">{chapters.map((chapter) => (
            <article key={chapter.id}><div className="admin-learning-order">{chapter.position}</div><div><strong>{chapter.title}</strong><span>{chapter.subject.academicClass?.name ?? classes.find((item) => item.id === chapter.subject.classId)?.name} · {chapter.subject.name}</span><p>{chapter.summary}</p></div><span className={`admin-learning-status ${chapter.status}`}>{chapter.status === 'published' ? 'Publié' : 'Brouillon'}</span><div className="admin-learning-actions"><button className="btn btn-ghost btn-sm" onClick={() => editChapter(chapter)}>Modifier</button><button className="btn btn-ghost btn-sm" onClick={() => void togglePublication(chapter)}>{chapter.status === 'published' ? 'Dépublier' : 'Publier'}</button><button className="btn btn-danger btn-sm" onClick={() => void remove(chapter)}>Supprimer</button></div></article>
          ))}</div>
        )}
      </section>
    </div>
  )
}

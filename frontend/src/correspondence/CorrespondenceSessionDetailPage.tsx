import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createLetter, getMyLetters, getSession, submitLetter, updateLetter } from './correspondenceApi'
import type { ContestSession, Letter } from './types'

const DEFAULT_MIN = 500
const DEFAULT_MAX = 5000
const AUTOSAVE_DELAY_MS = 1500

export default function CorrespondenceSessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { accessToken, user } = useAuth()
  const navigate = useNavigate()

  const [session, setSession] = useState<ContestSession | null>(null)
  const [myLetters, setMyLetters] = useState<Letter[]>([])
  const [draft, setDraft] = useState<Letter | null>(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const minLen = session?.rules?.minBodyLength ?? DEFAULT_MIN
  const maxLen = session?.rules?.maxBodyLength ?? DEFAULT_MAX
  const maxLetters = session?.rules?.maxLettersPerUser ?? 1

  const loadData = useCallback(async () => {
    if (!accessToken || !id) return
    const [s, letters] = await Promise.all([
      getSession(id, accessToken),
      getMyLetters(accessToken, id),
    ])
    setSession(s)
    setMyLetters(letters)
    const existing = letters.find((l) => l.status === 'draft')
    if (existing) {
      setDraft(existing)
      setBody(existing.body)
    }
  }, [accessToken, id])

  useEffect(() => { loadData().catch(() => {}) }, [loadData])

  // ── Autosave ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!accessToken || !session || session.status !== 'open') return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(async () => {
      if (!body.trim()) return
      setSaving(true)
      try {
        if (draft) {
          const updated = await updateLetter(draft.id, body, undefined, accessToken)
          setDraft(updated)
        } else if (myLetters.length < maxLetters) {
          const created = await createLetter(id!, body, undefined, accessToken)
          setDraft(created)
          setMyLetters((prev) => [created, ...prev])
        }
      } catch { /* silent autosave */ }
      finally { setSaving(false) }
    }, AUTOSAVE_DELAY_MS)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body])

  const handleSubmit = async () => {
    if (!accessToken || !draft) {
      setError('Aucun brouillon à soumettre.')
      return
    }
    if (body.length < minLen) {
      setError(`Votre lettre doit faire au moins ${minLen} caractères.`)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await submitLetter(draft.id, accessToken)
      setSuccess('Lettre soumise avec succès ! Vous serez notifié(e) lorsqu\'elle sera assignée.')
      await loadData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  if (!session) return <div style={{ padding: 32, color: 'var(--ink-3)' }}>Chargement…</div>

  const isOpen = session.status === 'open'
  const submittedLetters = myLetters.filter((l) => l.status !== 'draft')
  const hasReachedMax = myLetters.length >= maxLetters && !draft
  const charCount = body.length
  const isValid = charCount >= minLen && charCount <= maxLen

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <button
        onClick={() => navigate('/correspondence')}
        style={{ background: 'none', border: 'none', color: 'var(--cobalt)', fontSize: 14, cursor: 'pointer', marginBottom: 16, padding: 0 }}
      >
        ← Retour aux sessions
      </button>

      {/* Session header */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--cobalt)', margin: 0 }}>{session.title}</h1>
          <span style={{ fontSize: 12, fontWeight: 600, color: isOpen ? '#16a34a' : '#6b7280', background: isOpen ? '#dcfce7' : '#f3f4f6', borderRadius: 20, padding: '3px 12px' }}>
            {isOpen ? 'Ouvert' : session.status}
          </span>
        </div>
        <p style={{ marginTop: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>{session.themePrompt}</p>
        <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 13, color: 'var(--ink-3)' }}>
          <span>📅 {new Date(session.startAt).toLocaleDateString('fr-FR')} → {new Date(session.endAt).toLocaleDateString('fr-FR')}</span>
          <span>✉️ {minLen}–{maxLen} caractères</span>
        </div>
      </div>

      {/* Already submitted letters */}
      {submittedLetters.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Lettre(s) soumise(s)
          </h3>
          {submittedLetters.map((l) => (
            <div key={l.id} style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 8, fontSize: 14, color: '#166534' }}>
              ✅ Lettre soumise le {new Date(l.submittedAt!).toLocaleDateString('fr-FR')} — statut : <strong>{l.status}</strong>
            </div>
          ))}
        </div>
      )}

      {/* Letter editor */}
      {isOpen && !hasReachedMax && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: 'var(--ink)' }}>
              {draft ? 'Continuer ma lettre' : 'Écrire une lettre'}
            </h2>
            {saving && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sauvegarde…</span>}
          </div>

          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 }}>
            Répondez au thème : <em>"{session.themePrompt}"</em>. Votre identité restera anonyme.
          </p>

          <textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setError(''); setSuccess('') }}
            placeholder={`Écrivez votre lettre ici… (entre ${minLen} et ${maxLen} caractères)`}
            rows={14}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '14px 16px',
              border: `1.5px solid ${charCount > maxLen ? '#dc2626' : 'var(--border)'}`,
              borderRadius: 10, fontSize: 15, lineHeight: 1.7, resize: 'vertical',
              fontFamily: 'Georgia, serif', color: 'var(--ink)', background: 'var(--paper)',
              outline: 'none',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 13, color: charCount > maxLen ? '#dc2626' : charCount >= minLen ? '#16a34a' : 'var(--ink-3)' }}>
              {charCount}/{maxLen} caractères
              {charCount < minLen && ` (min ${minLen})`}
            </span>
            {success && <span style={{ fontSize: 13, color: '#16a34a' }}>{success}</span>}
            {error && <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>}
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !isValid || !draft}
            style={{
              marginTop: 16, width: '100%', padding: '13px 0',
              background: isValid && draft ? 'var(--cobalt)' : '#d1d5db',
              color: isValid && draft ? '#fff' : '#9ca3af',
              border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700,
              cursor: isValid && draft ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'Soumission…' : '📨 Soumettre ma lettre'}
          </button>
          {!draft && (
            <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', marginTop: 8 }}>
              La lettre sera sauvegardée automatiquement pendant que vous écrivez.
            </p>
          )}
        </div>
      )}

      {!isOpen && submittedLetters.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <p>Cette session est <strong>{session.status}</strong>. Les soumissions ne sont plus acceptées.</p>
        </div>
      )}

      {!user && (
        <p style={{ color: '#dc2626', marginTop: 12 }}>Vous devez être connecté(e) pour écrire.</p>
      )}
    </div>
  )
}

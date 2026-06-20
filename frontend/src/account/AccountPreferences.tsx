import { useEffect, useState, type FormEvent } from 'react'
import './account.css'
import { apiCall } from '../api/client'
import type { AuthUser } from '../context/AuthContext'

type Props = { token: string; user: AuthUser; onUpdated: (user: AuthUser) => void }

export default function AccountPreferences({ token, user, onUpdated }: Props) {
  const [preferredTutorLanguage, setPreferredTutorLanguage] = useState<'fr' | 'ht'>(user.preferredTutorLanguage ?? 'fr')
  const [notificationsEnabled, setNotificationsEnabled] = useState(user.notificationsEnabled ?? true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setPreferredTutorLanguage(user.preferredTutorLanguage ?? 'fr')
    setNotificationsEnabled(user.notificationsEnabled ?? true)
  }, [user.notificationsEnabled, user.preferredTutorLanguage])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const updated = await apiCall<AuthUser>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ preferredTutorLanguage, notificationsEnabled }),
      }, token)
      onUpdated(updated)
      setMessage('Vos préférences ont été enregistrées.')
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Impossible d’enregistrer vos préférences.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="account-page">
      <header className="account-heading">
        <p className="overline">Compte</p>
        <h1 className="display">Préférences</h1>
        <p>Adaptez le tuteur et les alertes de Konesans+ à votre façon d’apprendre.</p>
      </header>
      <form className="card account-card account-form" onSubmit={submit}>
        {message && <div className="alert alert-ok">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}
        <fieldset className="account-fieldset">
          <legend>Langue du tuteur pédagogique</legend>
          <p>Cette langue sera sélectionnée automatiquement lorsque vous ouvrez l’IA pédagogique.</p>
          <div className="account-choice-grid">
            <label className={preferredTutorLanguage === 'fr' ? 'selected' : ''}><input type="radio" name="tutor-language" value="fr" checked={preferredTutorLanguage === 'fr'} onChange={() => setPreferredTutorLanguage('fr')} /><span><strong>Français</strong><small>Explications et exercices en français.</small></span></label>
            <label className={preferredTutorLanguage === 'ht' ? 'selected' : ''}><input type="radio" name="tutor-language" value="ht" checked={preferredTutorLanguage === 'ht'} onChange={() => setPreferredTutorLanguage('ht')} /><span><strong>Kreyòl ayisyen</strong><small>Eksplikasyon ak egzèsis an kreyòl.</small></span></label>
          </div>
        </fieldset>
        <fieldset className="account-fieldset">
          <legend>Notifications</legend>
          <label className="account-toggle"><span><strong>Notifications de la plateforme</strong><small>Afficher les annonces, résultats et rappels dans Konesans+.</small></span><input type="checkbox" checked={notificationsEnabled} onChange={(event) => setNotificationsEnabled(event.target.checked)} /></label>
        </fieldset>
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Enregistrement...' : 'Enregistrer les préférences'}</button>
      </form>
    </div>
  )
}

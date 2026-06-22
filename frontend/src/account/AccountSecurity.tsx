import { useState, type FormEvent } from 'react'
import './account.css'
import { apiCall } from '../api/client'

export default function AccountSecurity({ token, compact = false, minimumLength = 6 }: { token: string; compact?: boolean; minimumLength?: number }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (form.newPassword !== form.confirmPassword) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.')
      return
    }
    if (form.newPassword === form.currentPassword) {
      setError('Le nouveau mot de passe doit être différent du mot de passe actuel.')
      return
    }
    setLoading(true)
    try {
      await apiCall('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      }, token)
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setMessage('Votre mot de passe a été modifié avec succès.')
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Impossible de modifier le mot de passe.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="account-page">
      {!compact && <header className="account-heading">
        <p className="overline">Compte</p>
        <h1 className="display">Sécurité</h1>
        <p>Choisissez un mot de passe unique que vous n’utilisez pas sur un autre service.</p>
      </header>}
      <form className="card account-card account-form" onSubmit={submit}>
        <div><h2>Changer le mot de passe</h2><p>Votre mot de passe doit contenir au moins {minimumLength} caractères.</p></div>
        {message && <div className="alert alert-ok">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}
        <label><span className="field-label">Mot de passe actuel</span><input required type="password" autoComplete="current-password" className="field-input" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} /></label>
        <label><span className="field-label">Nouveau mot de passe</span><input required minLength={minimumLength} type="password" autoComplete="new-password" className="field-input" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} /></label>
        <label><span className="field-label">Confirmer le nouveau mot de passe</span><input required minLength={minimumLength} type="password" autoComplete="new-password" className="field-input" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} /></label>
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Modification...' : 'Modifier le mot de passe'}</button>
      </form>
    </div>
  )
}

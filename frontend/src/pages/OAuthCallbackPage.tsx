import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type AuthUser } from '../context/AuthContext'
import { apiCall } from '../api/client'
import { userHome } from '../auth/authRules'

export default function OAuthCallbackPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')

    if (!token) {
      navigate('/login?error=oauth_failed', { replace: true })
      return
    }

    apiCall<AuthUser>('/auth/me', undefined, token)
      .then((user) => {
        login(token, user)
        navigate(userHome(user), { replace: true })
      })
      .catch(() => {
        navigate('/login?error=oauth_failed', { replace: true })
      })
  }, [login, navigate])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ fontSize: 18, color: 'var(--ink-3)' }}>Connexion en cours…</p>
    </div>
  )
}

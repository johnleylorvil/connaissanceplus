import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import KonesansLogo from '../components/KonesansLogo'
import { apiCall, GOOGLE_AUTH_ENABLED, GOOGLE_AUTH_URL, type ApiError } from '../api/client'
import type { AuthUser, UserRole } from '../context/AuthContext'
import { userHome } from '../auth/authRules'
import { getPortalUrl, portalAllowsRole, portalForRole, resolvePortalMode } from '../auth/portal'

type AuthResponse = { accessToken: string; user: AuthUser }

function BrandQuote({ isAdminPortal }: { isAdminPortal: boolean }) {
  if (isAdminPortal) {
    return (
      <>
        "Pilotez la
        <br />
        plateforme,
        <br />
        avec clarté."
      </>
    )
  }

  return (
    <>
      "Entrez dans le
      <br />
      génie scolaire,
      <br />
      progressez."
    </>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, initialized, login, logout } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const portal = resolvePortalMode()
  const isAdminPortal = portal === 'admin'
  const studentPortalUrl = getPortalUrl('public', '/login')
  const adminPortalUrl = getPortalUrl('admin', '/login')

  // Already authenticated → go to the correct portal immediately.
  // We wait for `initialized` to avoid a premature redirect before auth
  // state has been restored from localStorage.
  useEffect(() => {
    if (initialized && user) {
      const normalizedRole = user.role.toLowerCase() as UserRole
      if (!portalAllowsRole(portal, normalizedRole)) {
        logout()
        window.location.replace(getPortalUrl(portalForRole(normalizedRole), '/login'))
        return
      }

      navigate(userHome(user), { replace: true })
    }
  }, [initialized, user, navigate, logout, portal])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await apiCall<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(form),
      })

      // The role comes exclusively from the backend JWT.
      const actualRole = (data.user.role as string).toLowerCase() as UserRole
      const normalizedUser: AuthUser = { ...data.user, role: actualRole }

      if (!portalAllowsRole(portal, actualRole)) {
        setError(
          isAdminPortal
            ? `Accès réservé aux administrateurs et modérateurs. Les étudiants doivent utiliser ${studentPortalUrl}.`
            : `Accès réservé aux étudiants et responsables école. Les administrateurs et modérateurs doivent utiliser ${adminPortalUrl}.`
        )
        return
      }

      login(data.accessToken, normalizedUser)
      navigate(userHome(normalizedUser), { replace: true })
    } catch (err) {
      setError((err as ApiError).message || 'Impossible de vous connecter pour le moment.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">

      {/* ── FORM PANEL ── */}
      <div className="auth-panel">

        <Link to={isAdminPortal ? '/login' : '/'} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, textDecoration: 'none', marginBottom: 52 }}>
          <span className="brand" style={{ fontSize: 18, color: 'var(--cobalt)' }}>Konesans</span>
          <span className="brand" style={{ fontSize: 18, color: 'var(--gold)' }}>+</span>
        </Link>

        <h1 className="display" style={{ fontSize: 'clamp(30px, 7vw, 38px)', color: 'var(--ink)', marginBottom: 8, letterSpacing: '-0.03em' }}>
          {isAdminPortal ? 'Portail d’administration' : 'Bon retour sur Konesans+'}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--ink-3)', marginBottom: 32, lineHeight: 1.6 }}>
          {isAdminPortal
            ? 'Accès réservé aux administrateurs et aux modérateurs autorisés.'
            : 'Connectez-vous pour retrouver votre espace, vos matchs Arena et votre progression.'}
        </p>

        {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label className="field-label">Adresse email</label>
            <input
              type="email" required value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="field-input" placeholder="vous@exemple.com"
            />
          </div>
          <div>
            <label className="field-label">Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'} required value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="field-input" placeholder="••••••••" style={{ paddingRight: 42 }}
              />
              <button
                type="button" onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink-3)', display: 'flex', alignItems: 'center' }}
              >
                {showPass ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg" style={{ marginTop: 4 }}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        {!isAdminPortal && (
          <>
            {GOOGLE_AUTH_ENABLED && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>ou</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                </div>

                <button
                  type="button"
                  onClick={() => { window.location.href = GOOGLE_AUTH_URL }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 0', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', background: '#fff', border: '1px solid var(--rule)', borderRadius: 4, cursor: 'pointer', color: 'var(--ink)', transition: 'border-color 0.15s', letterSpacing: '0.01em' }}
                >
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.42-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.38-8.16 2.38-6.26 0-11.57-3.59-13.46-8.83l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
                  Se connecter avec Google
                </button>
              </>
            )}

            <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-3)', marginTop: 24 }}>
              Pas encore de compte ?{' '}
              <Link to="/register" style={{ color: 'var(--cobalt)', fontWeight: 600, textDecoration: 'none' }}>S'inscrire gratuitement</Link>
            </p>
          </>
        )}

        {isAdminPortal && (
          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-3)', marginTop: 24 }}>
            Vous cherchez l'espace étudiant ?{' '}
            <a href={studentPortalUrl} style={{ color: 'var(--cobalt)', fontWeight: 600, textDecoration: 'none' }}>Aller au portail public</a>
          </p>
        )}
      </div>

      {/* ── BRAND PANEL (desktop only) ── */}
      <div className="hidden md:flex" style={{ background: 'var(--cobalt)', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 10%', position: 'sticky', top: 0, height: '100vh' }}>
        <div>
          <KonesansLogo size={44} showName />
        </div>
        <div>
          <blockquote className="display" style={{ fontSize: 'clamp(26px,2.8vw,40px)', color: '#fff', fontStyle: 'italic', lineHeight: 1.25, marginBottom: 24, letterSpacing: '-0.03em' }}>
            <BrandQuote isAdminPortal={isAdminPortal} />
          </blockquote>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.8 }}>
            {isAdminPortal
              ? 'Espace interne dédié au pilotage, à la modération et au suivi opérationnel de Konesans+.'
                : 'La plateforme haïtienne de génie scolaire en ligne, pensée pour se préparer, concourir et progresser.'}
          </p>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24 }}>
          {isAdminPortal ? (
            <>
              <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>Portail étudiant</p>
              <a href={studentPortalUrl} style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textDecoration: 'none' }}>Ouvrir le site public →</a>
            </>
          ) : (
            <>
              <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>Pas encore inscrit ?</p>
              <Link to="/register" style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textDecoration: 'none' }}>Créer mon compte →</Link>
            </>
          )}
        </div>
      </div>

    </div>
  )
}



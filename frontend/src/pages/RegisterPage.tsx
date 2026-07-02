import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import KonesansLogo from '../components/KonesansLogo'
import { apiCall, GOOGLE_AUTH_ENABLED, GOOGLE_AUTH_URL } from '../api/client'
import type { AuthUser } from '../context/AuthContext'
import { userHome } from '../auth/authRules'
import { HAITI_CITIES_BY_DEPARTMENT, HAITI_DEPARTMENTS } from '../constants/haitiDepartments'

type SchoolClass = { id: string; name: string }
type AuthResponse = { accessToken: string; user: AuthUser }
type OtpRequestResponse = { status: 'otp_sent'; verificationId: string; email: string; expiresInSeconds: number; resendAvailableInSeconds: number }

function getOtpErrorMessage(error: unknown, fallback: string) {
  const message = (error as { message?: string })?.message?.trim()
  if (!message) return fallback
  if (message === 'Failed to fetch') {
    return "Impossible de contacter le serveur pour l'instant. Réessayez dans quelques instants."
  }
  return message
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    gender: '',
    classId: '',
    school: '',
    city: '',
    department: '',
    sectionName: '',
    canBeContacted: false,
    acceptedPrivacyPolicy: false,
  })
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [otpEmail, setOtpEmail] = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)
  const cityOptions = form.department ? HAITI_CITIES_BY_DEPARTMENT[form.department as keyof typeof HAITI_CITIES_BY_DEPARTMENT] ?? [] : []

  useEffect(() => {
    apiCall<SchoolClass[]>('/classes').then(setClasses).catch(() => {})
  }, [])

  useEffect(() => {
    if (resendCountdown <= 0) return
    const timeout = window.setTimeout(() => setResendCountdown((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearTimeout(timeout)
  }, [resendCountdown])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.acceptedPrivacyPolicy) {
      setError("Vous devez accepter la politique de confidentialité pour vous inscrire.")
      return
    }
    setError('')
    setNotice('')
    setLoading(true)
    try {
      const data = await apiCall<OtpRequestResponse>('/students/register/request-otp', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setVerificationId(data.verificationId)
      setOtpEmail(data.email)
      setOtpCode('')
      setResendCountdown(data.resendAvailableInSeconds)
      setNotice(`Un code de vérification a été envoyé à ${data.email}. Saisissez-le pour finaliser votre inscription.`)
    } catch (err) {
      setError(getOtpErrorMessage(err, "Impossible de démarrer l'inscription."))
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (!verificationId || resendCountdown > 0) return
    setError('')
    setNotice('')
    setLoading(true)
    try {
      const data = await apiCall<OtpRequestResponse>('/students/register/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ verificationId }),
      })
      setOtpEmail(data.email)
      setResendCountdown(data.resendAvailableInSeconds)
      setOtpCode('')
      setNotice(`Un nouveau code de vérification a été envoyé à ${data.email}.`)
    } catch (err) {
      setError(getOtpErrorMessage(err, "Impossible de renvoyer le code de vérification."))
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault()
    if (!verificationId) return
    setError('')
    setNotice('')
    setLoading(true)
    try {
      const data = await apiCall<AuthResponse>('/students/register/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ verificationId, code: otpCode }),
      })
      login(data.accessToken, data.user)
      navigate(userHome(data.user), { replace: true })
    } catch (err) {
      setError(getOtpErrorMessage(err, 'Impossible de vérifier le code pour le moment.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">

      {/* -- FORM PANEL -- */}
      <div className="auth-panel" style={{ justifyContent: 'flex-start' }}>

        <Link to="/" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, textDecoration: 'none', marginBottom: 44 }}>
          <span className="brand" style={{ fontSize: 18, color: 'var(--cobalt)' }}>Konesans</span>
          <span className="brand" style={{ fontSize: 18, color: 'var(--gold)' }}>+</span>
        </Link>

        <h1 className="display" style={{ fontSize: 'clamp(28px, 7vw, 34px)', color: 'var(--ink)', marginBottom: 6, letterSpacing: '-0.03em' }}>Créer mon compte</h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 32, lineHeight: 1.6 }}>
          Créez votre espace pour participer au génie scolaire en ligne, avec manches académiques, affrontements et classement hebdomadaire.
        </p>

        {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}
        {notice && <div className="alert" style={{ marginBottom: 20, background: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8' }}>{notice}</div>}

        {verificationId ? (
          <form onSubmit={handleVerifyOtp} className="auth-form-stack">
            <p style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6, marginTop: -2 }}>
              Entrez le code reçu par e-mail{otpEmail ? ` à ${otpEmail}` : ''}. Il reste valable pendant 10 minutes.
            </p>
            <div>
              <label className="field-label">Code de vérification</label>
              <input
                type="text"
                inputMode="numeric"
                required
                minLength={6}
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="field-input"
                placeholder="6 chiffres"
              />
            </div>

            <button type="submit" disabled={loading || otpCode.length !== 6} className="btn btn-primary btn-full btn-lg" style={{ marginTop: 4 }}>
              {loading ? 'Vérification…' : 'Vérifier mon adresse e-mail'}
            </button>

            <button type="button" className="btn btn-ghost btn-full" onClick={handleResendOtp} disabled={loading || resendCountdown > 0}>
              {resendCountdown > 0 ? `Renvoyer le code dans ${resendCountdown}s` : 'Renvoyer le code'}
            </button>

            <button type="button" className="btn btn-ghost btn-full" onClick={() => { setVerificationId(null); setOtpCode(''); setOtpEmail(''); setNotice(''); setResendCountdown(0) }}>
              Modifier mes informations
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="auth-form-stack">
          <div className="auth-form-grid">
            <div>
              <label className="field-label">Prénom</label>
              <input type="text" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="field-input" placeholder="Jean" />
            </div>
            <div>
              <label className="field-label">Nom</label>
              <input type="text" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="field-input" placeholder="Pierre" />
            </div>
          </div>

          <div>
            <label className="field-label">Adresse email</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="field-input" placeholder="jean@exemple.com" />
          </div>

          <div>
            <label className="field-label">Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'} required minLength={6}
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="field-input" placeholder="Minimum 6 caractères" style={{ paddingRight: 42 }}
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
          </div>          <div>
            <label className="field-label">Genre</label>
            <select required value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="field-input">
              <option value="">Choisir un genre</option>
              <option value="masculin">Masculin</option>
              <option value="feminin">Feminin</option>
            </select>
          </div>


          <div>
            <label className="field-label">Niveau académique</label>
            <select required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} className="field-input">
              <option value="">Choisir un niveau</option>
              {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
            </select>
          </div>

          <div className="auth-form-grid">
            <div>
              <label className="field-label">École <span style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>(optionnel)</span></label>
              <input type="text" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} className="field-input" placeholder="Nom de l'école" />
            </div>
            <div>
              <label className="field-label">Ville <span style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>(optionnel)</span></label>
              <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="field-input" disabled={!form.department}>
                <option value="">{form.department ? 'Choisir une ville' : 'Choisir d\'abord un département'}</option>
                {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
            </div>
          </div>

          <div className="auth-form-grid">
            <div>
              <label className="field-label">Département <span style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>(optionnel)</span></label>
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value, city: '' })} className="field-input">
                <option value="">Choisir un département</option>
                {HAITI_DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Section <span style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>(optionnel)</span></label>
              <input type="text" value={form.sectionName} onChange={(e) => setForm({ ...form, sectionName: e.target.value })} className="field-input" placeholder="A, B, C..." />
            </div>
          </div>

          <label className="auth-check" style={{ paddingTop: 2 }}>
            <input
              type="checkbox" checked={form.canBeContacted}
              onChange={(e) => setForm({ ...form, canBeContacted: e.target.checked })}
              style={{ marginTop: 3, accentColor: 'var(--cobalt)', width: 14, height: 14, flexShrink: 0 }}
            />
            <span className="auth-check-text">
              J’accepte de recevoir les annonces et informations utiles de Konesans+.
            </span>
          </label>

          <label className="auth-check">
            <input
              type="checkbox" required checked={form.acceptedPrivacyPolicy}
              onChange={(e) => setForm({ ...form, acceptedPrivacyPolicy: e.target.checked })}
              style={{ marginTop: 3, accentColor: 'var(--cobalt)', width: 14, height: 14, flexShrink: 0 }}
            />
            <span className="auth-check-text">
              J'ai lu et j'accepte la{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cobalt)', fontWeight: 600, textDecoration: 'none' }}>
                politique de confidentialité
              </Link>{' '}
              de Konesans+ <span style={{ color: 'var(--error)' }}>*</span>
            </span>
          </label>

          <button type="submit" disabled={loading || !form.acceptedPrivacyPolicy} className="btn btn-primary btn-full btn-lg" style={{ marginTop: 4 }}>
            {loading ? 'Envoi du code…' : 'Recevoir mon code de vérification'}
          </button>
        </form>
        )}

        {!verificationId && GOOGLE_AUTH_ENABLED && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
              <span style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>ou</span>
              <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
            </div>

            <button
              type="button"
              onClick={() => { window.location.href = GOOGLE_AUTH_URL }}
              className="auth-social-button"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 0', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', background: '#fff', border: '1px solid var(--rule)', borderRadius: 4, cursor: 'pointer', color: 'var(--ink)', transition: 'border-color 0.15s', letterSpacing: '0.01em' }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.42-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.38-8.16 2.38-6.26 0-11.57-3.59-13.46-8.83l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
              S'inscrire avec Google
            </button>
          </>
        )}

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-3)', marginTop: 18, marginBottom: 16 }}>
          Déjà un compte ?{' '}
          <Link to="/login" style={{ color: 'var(--cobalt)', fontWeight: 600, textDecoration: 'none' }}>Se connecter</Link>
        </p>
      </div>

      {/* -- BRAND PANEL (desktop only) -- */}
      <div className="hidden md:flex" style={{ background: 'var(--cobalt)', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 10%', position: 'sticky', top: 0, height: '100vh' }}>
        <div>
          <KonesansLogo size={44} showName />
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 20 }}>Rejoignez la compétition</p>
          <blockquote className="display" style={{ fontSize: 'clamp(24px,2.5vw,36px)', color: '#fff', fontStyle: 'italic', lineHeight: 1.3, marginBottom: 24, letterSpacing: '-0.03em' }}>
            "Votre première question vous attend."
          </blockquote>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.8 }}>
            Inscription gratuite, progression visible et accès direct aux compétitions académiques.
          </p>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>Déjà un compte ?</p>
          <Link to="/login" style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textDecoration: 'none' }}>Connexion →</Link>
        </div>
      </div>

    </div>
  )
}







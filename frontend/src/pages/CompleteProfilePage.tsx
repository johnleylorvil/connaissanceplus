import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiCall, type ApiError } from '../api/client'
import { useAuth, type AuthUser } from '../context/AuthContext'
import { needsStudentProfileCompletion, userHome } from '../auth/authRules'
import { HAITI_CITIES_BY_DEPARTMENT, HAITI_DEPARTMENTS } from '../constants/haitiDepartments'

type SchoolClass = { id: string; name: string }

export default function CompleteProfilePage() {
  const navigate = useNavigate()
  const { user, accessToken, logout, updateUser } = useAuth()
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    classId: user?.classId ?? '',
    school: user?.school ?? '',
    city: user?.city ?? '',
    department: user?.department ?? '',
    sectionName: user?.sectionName ?? '',
    canBeContacted: user?.canBeContacted ?? false,
    acceptedPrivacyPolicy: user?.acceptedPrivacyPolicy ?? false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const cityOptions = form.department ? HAITI_CITIES_BY_DEPARTMENT[form.department as keyof typeof HAITI_CITIES_BY_DEPARTMENT] ?? [] : []

  useEffect(() => {
    if (user && !needsStudentProfileCompletion(user)) {
      navigate(userHome(user), { replace: true })
    }
  }, [navigate, user])

  useEffect(() => {
    apiCall<SchoolClass[]>('/classes')
      .then(setClasses)
      .catch(() => setError('Impossible de charger les classes scolaires.'))
  }, [])

  if (!user || !accessToken) {
    return null
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.classId) {
      setError('Choisissez votre classe scolaire.')
      return
    }
    if (!form.acceptedPrivacyPolicy) {
      setError('Vous devez accepter la politique de confidentialité pour continuer.')
      return
    }

    setError('')
    setLoading(true)
    try {
      const updated = await apiCall<AuthUser>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          classId: form.classId,
          school: form.school || undefined,
          city: form.city || undefined,
          department: form.department || undefined,
          sectionName: form.sectionName || undefined,
          canBeContacted: form.canBeContacted,
          acceptedPrivacyPolicy: form.acceptedPrivacyPolicy,
        }),
      }, accessToken)
      updateUser(updated)
      navigate(userHome(updated), { replace: true })
    } catch (err) {
      setError((err as ApiError).message || 'Impossible de terminer votre profil.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, textDecoration: 'none', marginBottom: 44 }}>
          <span className="brand" style={{ fontSize: 18, color: 'var(--cobalt)' }}>Konesans</span>
          <span className="brand" style={{ fontSize: 18, color: 'var(--gold)' }}>+</span>
        </Link>

        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 12 }}>
          Profil requis
        </p>
        <h1 className="display" style={{ fontSize: 'clamp(30px, 7vw, 36px)', color: 'var(--ink)', marginBottom: 8, letterSpacing: '-0.03em' }}>
          Terminez votre inscription.
        </h1>
        <p style={{ fontSize: 15, color: 'var(--ink-3)', marginBottom: 28, lineHeight: 1.7 }}>
          Votre compte est bien relié. Il nous manque seulement quelques informations scolaires pour activer votre espace élève dans de bonnes conditions.
        </p>

        {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="auth-form-grid">
            <div>
              <label className="field-label">Prénom</label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Nom</label>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="field-input"
              />
            </div>
          </div>

          <div>
            <label className="field-label">Classe scolaire</label>
            <select
              required
              value={form.classId}
              onChange={(e) => setForm({ ...form, classId: e.target.value })}
              className="field-input"
            >
              <option value="">Choisir une classe</option>
              {classes.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>
              ))}
            </select>
          </div>

          <div className="auth-form-grid">
            <div>
              <label className="field-label">École</label>
              <input
                type="text"
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
                className="field-input"
                placeholder="Nom de l'école"
              />
            </div>
            <div>
              <label className="field-label">Ville</label>
              <select
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="field-input"
                disabled={!form.department}
              >
                <option value="">{form.department ? 'Choisir une ville' : 'Choisir d\'abord un département'}</option>
                {cityOptions.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="auth-form-grid">
            <div>
              <label className="field-label">Département</label>
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value, city: '' })}
                className="field-input"
              >
                <option value="">Choisir un département</option>
                {HAITI_DEPARTMENTS.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Section</label>
              <input
                type="text"
                value={form.sectionName}
                onChange={(e) => setForm({ ...form, sectionName: e.target.value })}
                className="field-input"
                placeholder="A, B, C..."
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', paddingTop: 2 }}>
            <input
              type="checkbox"
              checked={form.canBeContacted}
              onChange={(e) => setForm({ ...form, canBeContacted: e.target.checked })}
              style={{ marginTop: 3, accentColor: 'var(--cobalt)', width: 14, height: 14, flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
              J'accepte d'être contacté par Konesans+ pour les annonces et opportunités.
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.acceptedPrivacyPolicy}
              onChange={(e) => setForm({ ...form, acceptedPrivacyPolicy: e.target.checked })}
              style={{ marginTop: 3, accentColor: 'var(--cobalt)', width: 14, height: 14, flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
              J'ai lu et j'accepte la{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cobalt)', fontWeight: 600, textDecoration: 'none' }}>
                politique de confidentialité
              </Link>{' '}
              de Konesans+.
            </span>
          </label>

          <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg" style={{ marginTop: 4 }}>
            {loading ? 'Activation en cours…' : 'Activer mon compte étudiant'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            logout()
            navigate('/', { replace: true })
          }}
          className="btn btn-sm"
          style={{ marginTop: 18, alignSelf: 'flex-start', border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink-2)' }}
        >
          Se déconnecter
        </button>
      </div>

      <div className="hidden md:flex" style={{ background: 'var(--cobalt)', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 10%', position: 'sticky', top: 0, height: '100vh' }}>
        <div>
          <span className="brand" style={{ fontSize: 15, color: 'rgba(255,255,255,0.3)' }}>Konesans+</span>
        </div>
        <div>
          <blockquote className="display" style={{ fontSize: 'clamp(26px,2.8vw,40px)', color: '#fff', fontStyle: 'italic', lineHeight: 1.25, marginBottom: 24, letterSpacing: '-0.03em' }}>
            "Un profil complet,<br />puis la compétition."
          </blockquote>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.8 }}>
            Cette étape permet d’afficher les bonnes matières, les bons quiz et un classement cohérent avec votre niveau réel.
          </p>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>Protection des données</p>
          <Link to="/privacy" style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 600, textDecoration: 'none' }}>
            Consulter la politique →
          </Link>
        </div>
      </div>
    </div>
  )
}
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import { useAuth } from './context/AuthContext'
import type { UserRole } from './context/AuthContext'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import CompleteProfilePage from './pages/CompleteProfilePage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import PublicLeaderboardPage from './pages/PublicLeaderboardPage'
import StudentDashboard from './pages/StudentDashboard'
import AdminDashboard from './pages/AdminDashboard'
import QuizPage from './pages/QuizPage'
import DuelPage from './pages/DuelPage'
import OAuthCallbackPage from './pages/OAuthCallbackPage'
import ArenaPage from './arena/ArenaPage'
import ArenaLive from './arena/views/ArenaLive'
import ArenaWatchPage from './arena/views/ArenaWatchPage'
import ArenaSpectator from './arena/ArenaSpectator'
import ModeratorArenaPage from './pages/ModeratorArenaPage'
import { needsStudentProfileCompletion, userHome } from './auth/authRules'
import { getPortalUrl, portalAllowsRole, portalForRole, resolvePortalMode } from './auth/portal'

/** Neutral loading screen — shown while auth state is being restored. */
function AuthLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--paper)',
    }}>
      <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>Chargement…</span>
    </div>
  )
}

function PortalRedirect({ role }: { role: UserRole }) {
  const { logout } = useAuth()

  useEffect(() => {
    logout()
    window.location.replace(getPortalUrl(portalForRole(role), '/login'))
  }, [logout, role])

  return <AuthLoader />
}

function ExternalRedirect({ url }: { url: string }) {
  useEffect(() => {
    window.location.replace(url)
  }, [url])

  return <AuthLoader />
}

function RootPage() {
  return resolvePortalMode() === 'admin' ? <Navigate to="/login" replace /> : <LandingPage />
}

function RegisterEntry() {
  if (resolvePortalMode() === 'admin') {
    return <ExternalRedirect url={getPortalUrl('public', '/register')} />
  }

  return <RegisterPage />
}

/**
 * Single unified route guard.
 *
 * States handled:
 *   1. Not yet initialized  → show neutral loader (no flash of protected content)
 *   2. Not authenticated    → redirect to /login (with `from` state for return URL)
 *   3. Wrong role           → redirect to the user's own portal
 *   4. Correct role         → render children
 */
function RequireRole({ allowedRoles, children }: { allowedRoles: UserRole[]; children: ReactNode }) {
  const { user, initialized } = useAuth()
  const location = useLocation()

  // ① Wait for auth state to be read from storage.
  //    Without this, the guard would evaluate on the very first render
  //    before localStorage has been read, always seeing user=null.
  if (!initialized) return <AuthLoader />

  // ② Not logged in → send to login, preserve intended destination.
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (location.pathname === '/complete-profile' && !needsStudentProfileCompletion(user)) {
    return <Navigate to={userHome(user)} replace />
  }

  if (needsStudentProfileCompletion(user) && location.pathname !== '/complete-profile') {
    return <Navigate to="/complete-profile" replace />
  }

  // ③ Logged in but wrong role → send to their own portal.
  //    Normalize to lowercase defensively in case localStorage had stale casing.
  const normalizedRole = user.role.toLowerCase() as UserRole
  if (!portalAllowsRole(resolvePortalMode(), normalizedRole)) {
    return <PortalRedirect role={normalizedRole} />
  }

  if (!allowedRoles.includes(normalizedRole)) {
    return <Navigate to={userHome(user)} replace />
  }

  return <>{children}</>
}

function NotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', background: 'var(--paper)', gap: 12,
    }}>
      <p style={{ fontSize: 48, fontWeight: 700, color: 'var(--cobalt)' }}>404</p>
      <p style={{ fontSize: 16, color: 'var(--ink-3)' }}>Page introuvable</p>
      <Link to="/" style={{ fontSize: 14, color: 'var(--cobalt)', textDecoration: 'none', fontWeight: 600 }}>
        Retour à l'accueil
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* ── Public routes ── */}
      <Route path="/" element={<RootPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterEntry />} />
      <Route path="/classement" element={<PublicLeaderboardPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/arena/spectator" element={<ArenaSpectator />} />
      <Route path="/arena/spectator/:id" element={<ArenaSpectator />} />
      <Route path="/arena/watch/:id" element={<ArenaWatchPage />} />

      {/* ── Student routes ── */}
      <Route
        path="/complete-profile"
        element={
          <RequireRole allowedRoles={['student']}>
            <CompleteProfilePage />
          </RequireRole>
        }
      />
      <Route
        path="/dashboard"
        element={
          <RequireRole allowedRoles={['student']}>
            <StudentDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/quiz/:sessionId"
        element={
          <RequireRole allowedRoles={['student']}>
            <QuizPage />
          </RequireRole>
        }
      />
      <Route
        path="/duel/:duelId"
        element={
          <RequireRole allowedRoles={['student', 'admin', 'moderator']}>
            <DuelPage />
          </RequireRole>
        }
      />

      {/* ── Shared auth routes (any authenticated role) ── */}
      <Route
        path="/arena"
        element={
          <RequireRole allowedRoles={['student', 'admin', 'moderator']}>
            <ArenaPage />
          </RequireRole>
        }
      />
      <Route
        path="/arena/live/:id"
        element={
          <RequireRole allowedRoles={['student', 'admin', 'moderator']}>
            <ArenaLive />
          </RequireRole>
        }
      />

      {/* ── Admin portal — ADMIN only ── */}
      <Route
        path="/admin"
        element={
          <RequireRole allowedRoles={['admin']}>
            <AdminDashboard />
          </RequireRole>
        }
      />

      {/* ── Moderator portal — MODERATOR only ──
           Both /moderator and /moderator/arena are guarded.
           An ADMIN hitting /moderator/arena is redirected to /admin.
           A STUDENT hitting /moderator/arena is redirected to /.          */}
      <Route
        path="/moderator"
        element={
          <RequireRole allowedRoles={['admin', 'moderator']}>
            <Navigate to="/moderator/arena" replace />
          </RequireRole>
        }
      />
      <Route
        path="/moderator/arena"
        element={
          <RequireRole allowedRoles={['admin', 'moderator']}>
            <ModeratorArenaPage />
          </RequireRole>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

import { createContext, useContext } from 'react'

export type UserRole = 'student' | 'admin' | 'moderator' | 'school'

export type AuthUser = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: UserRole
  gender?: 'masculin' | 'feminin' | null
  avatarUrl?: string | null
  classId: string | null
  acceptedPrivacyPolicy: boolean
  requiresProfileCompletion: boolean
  school?: string | null
  schoolId?: string | null
  city?: string | null
  department?: string | null
  sectionName?: string | null
  canBeContacted?: boolean
  preferredTutorLanguage?: 'fr' | 'ht'
  notificationsEnabled?: boolean
}

export type AuthState = {
  user: AuthUser | null
  accessToken: string | null
}

export type AuthContextValue = AuthState & {
  /** True once the stored session has been read and validated on app start. */
  initialized: boolean
  login: (token: string, user: AuthUser) => void
  logout: () => void
  updateUser: (user: AuthUser) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'konesans_auth'

export const EMPTY_STATE: AuthState = { user: null, accessToken: null }

export function normalizeAuthUser(
  user: Partial<AuthUser> & { role: string; levelId?: string | null; className?: string | null },
): AuthUser {
  const role = user.role.toLowerCase() as UserRole
  const classId = user.classId ?? user.levelId ?? null
  const acceptedPrivacyPolicy =
    typeof user.acceptedPrivacyPolicy === 'boolean'
      ? user.acceptedPrivacyPolicy
      : role === 'student'
      ? Boolean(classId)
      : true

  return {
    id: user.id ?? '',
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    email: user.email ?? '',
    role,
    gender: user.gender === 'masculin' || user.gender === 'feminin' ? user.gender : null,
    avatarUrl: user.avatarUrl ?? null,
    classId,
    acceptedPrivacyPolicy,
    requiresProfileCompletion:
      typeof user.requiresProfileCompletion === 'boolean'
        ? user.requiresProfileCompletion
        : role === 'student' && (!classId || !acceptedPrivacyPolicy),
    school: user.school ?? null,
    schoolId: user.schoolId ?? null,
    city: user.city ?? null,
    department: user.department ?? null,
    sectionName: user.sectionName ?? user.className ?? null,
    canBeContacted: user.canBeContacted,
    preferredTutorLanguage: user.preferredTutorLanguage === 'ht' ? 'ht' : 'fr',
    notificationsEnabled: user.notificationsEnabled ?? true,
  }
}

/** Reads and validates the stored session synchronously. */
export function loadFromStorage(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    const parsed = JSON.parse(raw) as Partial<AuthState>
    const { user, accessToken } = parsed
    if (!user || !accessToken || typeof user.role !== 'string') {
      localStorage.removeItem(STORAGE_KEY)
      return EMPTY_STATE
    }
    const normalizedUser = normalizeAuthUser(user as Partial<AuthUser> & { role: string })
    return { user: normalizedUser, accessToken }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return EMPTY_STATE
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}



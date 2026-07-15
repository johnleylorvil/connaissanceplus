import type { AuthUser } from '../context/AuthContext'

type UserLike = Pick<AuthUser, 'role' | 'classId' | 'acceptedPrivacyPolicy'>

export function roleHome(role: string): string {
  switch (role.toLowerCase()) {
    case 'admin':
      return '/admin'
    case 'moderator':
      return '/moderator/arena'
    case 'student':
      return '/dashboard'
    case 'school':
      return '/arena'
    default:
      return '/'
  }
}

export function needsStudentProfileCompletion(user: UserLike | null | undefined): boolean {
  if (!user) return false
  return user.role.toLowerCase() === 'student' && (!user.classId || !user.acceptedPrivacyPolicy)
}

export function userHome(user: UserLike | null | undefined): string {
  if (!user) return '/'
  if (needsStudentProfileCompletion(user)) return '/complete-profile'
  return roleHome(user.role)
}
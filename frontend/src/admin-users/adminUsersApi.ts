import { apiCall } from '../api/client'

export type AdminUserRole = 'student' | 'school' | 'moderator' | 'admin'
export type AdminUser = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: AdminUserRole
  isActive: boolean
  createdAt: string
  suspendedAt: string | null
  suspensionReason: string | null
  school: string | null
  city: string | null
  department: string | null
  sectionName: string | null
  academicClass?: { id: string; name: string } | null
}
export type AdminUsersResponse = {
  items: AdminUser[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  countsByRole: Record<AdminUserRole, number>
  countsByStatus: { active: number; suspended: number }
}
export type AdminUserFilters = { search?: string; role?: AdminUserRole; status?: 'active' | 'suspended'; scope?: 'team'; page?: number; pageSize?: number }

export function listAdminUsers(filters: AdminUserFilters, token: string) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) })
  return apiCall<AdminUsersResponse>(`/admin/users?${params.toString()}`, {}, token)
}
export function suspendAdminUser(id: string, reason: string, token: string) {
  return apiCall<AdminUser>(`/admin/users/${id}/suspend`, { method: 'PATCH', body: JSON.stringify({ reason }) }, token)
}
export function reactivateAdminUser(id: string, token: string) {
  return apiCall<AdminUser>(`/admin/users/${id}/reactivate`, { method: 'PATCH' }, token)
}
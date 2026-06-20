import { apiCall } from '../api/client'
import type { AdminInsights } from './types'

export const getAdminInsights = (token: string) =>
  apiCall<AdminInsights>('/admin/insights', {}, token)

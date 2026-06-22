import { apiCall } from '../api/client'

export type PlatformSettings = {
  id: string; organizationName: string; legalName: string | null; supportEmail: string | null
  websiteUrl: string | null; country: string; timezone: string; logoUrl: string | null
  minimumPasswordLength: number; registrationEnabled: boolean; tutorEnabled: boolean
  correspondenceEnabled: boolean; notificationsEnabled: boolean; updatedAt: string
}
export type IntegrationStatus = Record<'openai' | 'google' | 'email' | 'sponsorStorage' | 'livekit' | 'youtube', { configured: boolean; missing: string[] }> & { generatedAt: string }
export const getSettings = (token: string) => apiCall<PlatformSettings>('/admin/settings', {}, token)
export const updateSettings = (token: string, value: Partial<PlatformSettings>) => apiCall<PlatformSettings>('/admin/settings', { method: 'PATCH', body: JSON.stringify(value) }, token)
export const getIntegrations = (token: string) => apiCall<IntegrationStatus>('/admin/settings/integrations', {}, token)
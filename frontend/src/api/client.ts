function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function resolveGoogleAuthEnabled(): boolean {
  if (import.meta.env.DEV) {
    return true
  }

  return String(import.meta.env.VITE_ENABLE_GOOGLE_AUTH ?? '').toLowerCase() === 'true'
}

function resolveApiOrigin(): string {
  const configured =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    (import.meta.env.VITE_API_BASE as string | undefined) ??
    'http://localhost:3000'

  const normalized = trimTrailingSlash(configured.trim())
  return normalized.endsWith('/api') ? normalized.slice(0, -4) : normalized
}

export const API_ORIGIN = resolveApiOrigin()
export const API_BASE = `${API_ORIGIN}/api`
export const SOCKET_BASE = API_ORIGIN
export const GOOGLE_AUTH_ENABLED = resolveGoogleAuthEnabled()
export const GOOGLE_AUTH_URL = `${API_BASE}/auth/google`

export class ApiError extends Error {
  public readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiCall<T>(
  path: string,
  init?: RequestInit,
  token?: string | null,
): Promise<T> {
  const isFormDataBody = typeof FormData !== 'undefined' && init?.body instanceof FormData
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  }
  if (!isFormDataBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(', ')
      : (data.message ?? `Erreur ${res.status}`)
    throw new ApiError(res.status, message)
  }

  return data as T
}

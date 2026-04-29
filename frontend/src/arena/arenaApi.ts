import { API_BASE } from '../api/client'

export const ARENA_API = `${API_BASE}/arena`
export const ADMIN_API = `${API_BASE}/admin`

export type ArenaLeaderboardRow = {
  rank: number
  participantUserId: string
  displayName: string
  score: number
}

export type ArenaCompetition = {
  id: string
  name: string
  status: 'pending' | 'approved' | 'live' | 'paused' | 'completed' | 'cancelled'
  questionCount: number
  secondsPerQuestion: number
  scheduledAt: string
  startedAt?: string
  completedAt?: string
  description: string | null
  currentRound: number
  winnerParticipantUserId: string | null
  winnerParticipantName?: string | null
  moderatorUserId: string | null
  moderatorName?: string | null
  moderatorEmail?: string | null
  createdAt: string
}

export type AdminUser = {
  id: string
  firstName: string
  lastName: string
  email: string
}

export type ModeratorUser = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: 'admin' | 'moderator'
}

export type ArenaQuestion = {
  id: string
  prompt: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
}


export type ArenaRegistration = {
  id: string
  competitionId: string
  participantUserId: string
  participantName?: string
  status: 'pending' | 'approved' | 'rejected'
  registeredAt: string
}

export type CreateArenaCompetitionPayload = {
  name: string
  questionCount: number
  secondsPerQuestion: number
  scheduledAt: string
  description?: string
}

async function arenaFetch<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${ARENA_API}${path}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? `Erreur ${res.status}`)
    throw new Error(msg)
  }
  return data as T
}

export const arenaApi = {
  // Competitions
  getCompetitions: (status?: string) =>
    arenaFetch<ArenaCompetition[]>(`/competitions${status ? `?status=${status}` : ''}`),
  getLiveCompetitions: () =>
    arenaFetch<ArenaCompetition[]>(`/competitions?status=live`),
  getCompetition: (id: string) => arenaFetch<ArenaCompetition>(`/competitions/${id}`),
  createCompetition: (payload: CreateArenaCompetitionPayload, token: string) =>
    arenaFetch<ArenaCompetition>('/competitions', { method: 'POST', body: JSON.stringify(payload) }, token),
  registerParticipant: (competitionId: string, token: string) =>
    arenaFetch<ArenaRegistration>('/competitions/register', { method: 'POST', body: JSON.stringify({ competitionId }) }, token),
  getRegistrations: (competitionId: string, token: string) =>
    arenaFetch<ArenaRegistration[]>(`/competitions/${competitionId}/registrations`, {}, token),
  getLiveState: (competitionId: string) =>
    arenaFetch<unknown>(`/competitions/${competitionId}/state`),
  getLiveLeaderboard: (competitionId: string) =>
    arenaFetch<ArenaLeaderboardRow[]>(
      `/competitions/${competitionId}/leaderboard`,
    ),

  // History
  getHistory: () => arenaFetch<ArenaCompetition[]>('/history'),
  getMyHistory: (token: string) => arenaFetch<ArenaCompetition[]>('/history/my', {}, token),

  // Questions (no correct answer exposed during live)
  getArenaQuestion: (questionId: string, token: string) =>
    arenaFetch<ArenaQuestion>(`/questions/${questionId}`, {}, token),

  // Chat
  getChatHistory: (competitionId: string, participantId: string, token: string) =>
    arenaFetch<{ id: string; senderName: string; message: string; createdAt: string }[]>(
      `/competitions/${competitionId}/chat/${participantId}`,
      {},
      token,
    ),

  // Moderator management
  getModeratable: (token: string) =>
    arenaFetch<ArenaCompetition[]>('/moderatable', {}, token),
  claimModerator: (competitionId: string, token: string) =>
    arenaFetch<ArenaCompetition>(`/competitions/${competitionId}/claim-moderator`, { method: 'POST' }, token),
  assignModerator: (competitionId: string, userId: string, token: string) =>
    arenaFetch<ArenaCompetition>(`/competitions/${competitionId}/assign-moderator`, { method: 'POST', body: JSON.stringify({ userId }) }, token),
  releaseModerator: (competitionId: string, token: string) =>
    arenaFetch<ArenaCompetition>(`/competitions/${competitionId}/release-moderator`, { method: 'POST' }, token),
  getAdminUsers: (token: string) =>
    arenaFetch<AdminUser[]>('/admins', {}, token),
  getModeratorUsers: (token: string) =>
    arenaFetch<ModeratorUser[]>('/moderators', {}, token),
  getMyModeratorMatches: (token: string) =>
    arenaFetch<ArenaCompetition[]>('/moderator/my-matches', {}, token),

  // ── RTC Stage Token ─────────────────────────────────────────────────────
  getRtcToken: (competitionId: string, token: string) =>
    arenaFetch<{ url: string; token: string; roomName: string; identity: string; role: string }>(
      `/competitions/${competitionId}/rtc-token`,
      { method: 'POST' },
      token,
    ),

  // ── Broadcast (HLS Egress) ────────────────────────────────────────────
  startBroadcast: (competitionId: string, token: string) =>
    arenaFetch<{ egressId: string; status: string; playbackUrl: string }>(
      `/competitions/${competitionId}/broadcast/start`,
      { method: 'POST' },
      token,
    ),
  stopBroadcast: (competitionId: string, token: string) =>
    arenaFetch<{ status: string }>(
      `/competitions/${competitionId}/broadcast/stop`,
      { method: 'POST' },
      token,
    ),
  getBroadcast: (competitionId: string) =>
    arenaFetch<{ status: string; playbackUrl: string | null; startedAt: string | null }>(
      `/competitions/${competitionId}/broadcast`,
    ),

  // ── Viewer Counter (Redis heartbeat) ─────────────────────────────────
  viewerJoin: (competitionId: string) =>
    arenaFetch<{ viewerId: string }>(
      `/competitions/${competitionId}/viewers/join`,
      { method: 'POST' },
    ),
  viewerPing: (competitionId: string, viewerId: string) =>
    arenaFetch<{ ok: boolean }>(
      `/competitions/${competitionId}/viewers/ping`,
      { method: 'POST', body: JSON.stringify({ viewerId }) },
    ),
  getViewerCount: (competitionId: string) =>
    arenaFetch<{ count: number }>(`/competitions/${competitionId}/viewers/count`),
}

// ── Admin moderator management (uses /api/admin, not /api/arena) ──────────
export type CreateModeratorPayload = {
  firstName: string
  lastName: string
  email: string
  password?: string
  generatePassword?: boolean
}

export type ModeratorListItem = {
  id: string
  firstName: string
  lastName: string
  email: string
  createdAt: string
  role: 'admin' | 'moderator'
}

export type ModeratorOtpRequestResponse = {
  status: 'otp_sent'
  verificationId: string
  email: string
  expiresInSeconds: number
  resendAvailableInSeconds: number
}

export type VerifyModeratorOtpResponse = ModeratorListItem & {
  status: 'created' | 'already_eligible'
  message?: string
}

export type CreateModeratorResponse = ModeratorOtpRequestResponse | VerifyModeratorOtpResponse

async function adminFetch<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${ADMIN_API}${path}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? `Erreur ${res.status}`)
    throw new Error(msg)
  }
  return data as T
}

export const adminApi = {
  listModerators: (token: string) =>
    adminFetch<ModeratorListItem[]>('/moderators', {}, token),

  createModerator: (payload: CreateModeratorPayload, token: string) =>
    adminFetch<CreateModeratorResponse>('/moderators', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token),

  verifyModeratorOtp: (payload: { verificationId: string; code: string }, token: string) =>
    adminFetch<VerifyModeratorOtpResponse>('/moderators/verify-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token),

  resendModeratorOtp: (payload: { verificationId: string }, token: string) =>
    adminFetch<ModeratorOtpRequestResponse>('/moderators/resend-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token),
}

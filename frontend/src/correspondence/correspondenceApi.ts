import { apiCall } from '../api/client';
import type {
  ContestSession,
  InboxItem,
  Letter,
  ModerationCase,
  ModerationTargetType,
  OpenedAssignment,
  Thread,
  VoteResult,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────────

export const listSessions = (token: string): Promise<ContestSession[]> =>
  apiCall('/correspondence/sessions', undefined, token);

export const getSession = (id: string, token: string): Promise<ContestSession> =>
  apiCall(`/correspondence/sessions/${id}`, undefined, token);

// ─────────────────────────────────────────────────────────────────────────────
// Letters
// ─────────────────────────────────────────────────────────────────────────────

export const createLetter = (
  sessionId: string,
  body: string,
  metadata: { mood?: string; tags?: string[] } | undefined,
  token: string,
): Promise<Letter> =>
  apiCall(`/correspondence/sessions/${sessionId}/letters`, {
    method: 'POST',
    body: JSON.stringify({ body, metadata }),
  }, token);

export const updateLetter = (
  letterId: string,
  body: string,
  metadata: { mood?: string; tags?: string[] } | undefined,
  token: string,
): Promise<Letter> =>
  apiCall(`/correspondence/letters/${letterId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body, metadata }),
  }, token);

export const submitLetter = (letterId: string, token: string): Promise<Letter> =>
  apiCall(`/correspondence/letters/${letterId}/submit`, { method: 'POST' }, token);

export const getMyLetters = (token: string, sessionId?: string): Promise<Letter[]> => {
  const qs = sessionId ? `?sessionId=${sessionId}` : '';
  return apiCall(`/correspondence/me/letters${qs}`, undefined, token);
};

// ─────────────────────────────────────────────────────────────────────────────
// Inbox
// ─────────────────────────────────────────────────────────────────────────────

export const getInbox = (token: string): Promise<InboxItem[]> =>
  apiCall('/correspondence/me/inbox', undefined, token);

export const openAssignment = (assignmentId: string, token: string): Promise<OpenedAssignment> =>
  apiCall(`/correspondence/assignments/${assignmentId}/open`, { method: 'POST' }, token);

// ─────────────────────────────────────────────────────────────────────────────
// Threads & messages
// ─────────────────────────────────────────────────────────────────────────────

export const getThread = (threadId: string, token: string): Promise<Thread> =>
  apiCall(`/correspondence/threads/${threadId}`, undefined, token);

export const sendMessage = (threadId: string, body: string, token: string): Promise<unknown> =>
  apiCall(`/correspondence/threads/${threadId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  }, token);

// ─────────────────────────────────────────────────────────────────────────────
// Votes
// ─────────────────────────────────────────────────────────────────────────────

export const castVote = (sessionId: string, letterId: string, score: number, token: string): Promise<unknown> =>
  apiCall(`/correspondence/sessions/${sessionId}/votes`, {
    method: 'POST',
    body: JSON.stringify({ letterId, score }),
  }, token);

export const getResults = (sessionId: string, token: string): Promise<VoteResult[]> =>
  apiCall(`/correspondence/sessions/${sessionId}/results`, undefined, token);

// ─────────────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────────────

export const createReport = (
  targetType: ModerationTargetType,
  targetId: string,
  reason: string,
  details: string | undefined,
  token: string,
): Promise<unknown> =>
  apiCall('/correspondence/reports', {
    method: 'POST',
    body: JSON.stringify({ targetType, targetId, reason, details }),
  }, token);

// ─────────────────────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────────────────────

export const adminListSessions = (token: string): Promise<ContestSession[]> =>
  apiCall('/admin/correspondence/sessions', undefined, token);

export const adminCreateSession = (
  payload: {
    title: string;
    themePrompt: string;
    startAt: string;
    endAt: string;
    gracePeriodHours?: number;
    rules?: Record<string, unknown>;
  },
  token: string,
): Promise<ContestSession> =>
  apiCall('/admin/correspondence/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);

export const adminUpdateSession = (
  id: string,
  payload: Record<string, unknown>,
  token: string,
): Promise<ContestSession> =>
  apiCall(`/admin/correspondence/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, token);

export const adminTriggerAssign = (sessionId: string, token: string): Promise<{ assigned: number; skipped: number }> =>
  apiCall('/admin/correspondence/jobs/assign', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  }, token);

export const adminListReports = (token: string, status?: string): Promise<ModerationCase[]> => {
  const qs = status ? `?status=${status}` : '';
  return apiCall(`/admin/correspondence/reports${qs}`, undefined, token);
};

export const adminHandleReport = (
  caseId: string,
  action: 'handle' | 'dismiss',
  token: string,
): Promise<ModerationCase> =>
  apiCall(`/admin/correspondence/reports/${caseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  }, token);

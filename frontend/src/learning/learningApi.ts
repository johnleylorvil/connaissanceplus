import { apiCall } from '../api/client'
import type { AdminChapter, Curriculum, LearningChapter, TutorLanguage, TutorMessage } from './types'

export const getCurriculum = (token: string) =>
  apiCall<Curriculum>('/learning/curriculum', {}, token)

export const getLearningChapter = (chapterId: string, token: string) =>
  apiCall<LearningChapter>(`/learning/chapters/${chapterId}`, {}, token)

export const getTutorConversation = (chapterId: string, language: TutorLanguage, token: string) =>
  apiCall<{ messages: TutorMessage[] }>(`/learning/chapters/${chapterId}/conversation?language=${language}`, {}, token)

export const sendTutorMessage = (chapterId: string, language: TutorLanguage, message: string, token: string) =>
  apiCall<{ conversationId: string; messages: TutorMessage[] }>(`/learning/chapters/${chapterId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ language, message }),
  }, token)

export const listAdminChapters = (filters: { classId?: string; subjectId?: string }, token: string) => {
  const query = new URLSearchParams()
  if (filters.classId) query.set('classId', filters.classId)
  if (filters.subjectId) query.set('subjectId', filters.subjectId)
  const suffix = query.size ? `?${query}` : ''
  return apiCall<AdminChapter[]>(`/admin/learning/chapters${suffix}`, {}, token)
}

export const createAdminChapter = (payload: object, token: string) =>
  apiCall<AdminChapter>('/admin/learning/chapters', { method: 'POST', body: JSON.stringify(payload) }, token)

export const updateAdminChapter = (id: string, payload: object, token: string) =>
  apiCall<AdminChapter>(`/admin/learning/chapters/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token)

export const deleteAdminChapter = (id: string, token: string) =>
  apiCall<{ success: boolean }>(`/admin/learning/chapters/${id}`, { method: 'DELETE' }, token)

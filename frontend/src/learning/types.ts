export type LearningChapterSummary = {
  id: string
  title: string
  summary: string
  position: number
  updatedAt: string
}

export type LearningSubject = {
  id: string
  name: string
  chapters: LearningChapterSummary[]
}

export type Curriculum = {
  class: { id: string; name: string } | null
  subjects: LearningSubject[]
}

export type LearningChapter = LearningChapterSummary & {
  content: string
  subject: { id: string; name: string }
}

export type TutorLanguage = 'fr' | 'ht'
export type TutorMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type AdminChapter = LearningChapterSummary & {
  subjectId: string
  content: string
  status: 'draft' | 'published'
  subject: { id: string; name: string; classId: string; academicClass?: { id: string; name: string } }
}

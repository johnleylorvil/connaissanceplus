// ─────────────────────────────────────────────────────────────────────────────
// Shared types — kept in sync with backend correspondence.entities.ts
// ─────────────────────────────────────────────────────────────────────────────

export type ContestSessionStatus = 'draft' | 'open' | 'closed' | 'scoring' | 'published';
export type LetterStatus = 'draft' | 'submitted' | 'assigned' | 'delivered' | 'archived';
export type ModerationTargetType = 'letter' | 'message' | 'user';
export type ModerationCaseStatus = 'pending' | 'handled' | 'dismissed';

export interface SessionRules {
  maxLettersPerUser: number;
  maxLettersReceived: number;
  minBodyLength: number;
  maxBodyLength: number;
  allowVoting: boolean;
  locale?: string;
  avoidRecentPairingDays?: number;
}

export interface ContestSession {
  id: string;
  title: string;
  themePrompt: string;
  startAt: string;
  endAt: string;
  gracePeriodHours: number;
  status: ContestSessionStatus;
  rules: SessionRules | null;
  createdBy: string;
  createdAt: string;
}

export interface Letter {
  id: string;
  sessionId: string;
  authorUserId: string;
  body: string;
  metadata: { mood?: string; tags?: string[] } | null;
  createdAt: string;
  submittedAt: string | null;
  status: LetterStatus;
}

export interface InboxItem {
  assignmentId: string;
  sessionId: string;
  sessionTitle: string;
  themePrompt: string;
  assignedAt: string;
  openedAt: string | null;
  threadId: string | null;
  letterPreview: string | null;
}

export interface OpenedAssignment {
  assignmentId: string;
  thread: { id: string } | null;
  letter: {
    id: string;
    body: string;
    metadata: { mood?: string; tags?: string[] } | null;
    submittedAt: string | null;
    authorAlias: string;
  };
}

export interface ThreadMessage {
  id: string;
  body: string;
  createdAt: string;
  senderAlias: string;
  isOwn: boolean;
}

export interface Thread {
  threadId: string;
  isAnonymous: boolean;
  createdAt: string;
  lastMessageAt: string | null;
  messages: ThreadMessage[];
}

export interface VoteResult {
  letterId: string;
  totalScore: number;
  rank: number;
}

export interface ModerationCase {
  id: string;
  reporterUserId: string;
  targetType: ModerationTargetType;
  targetId: string;
  reason: string;
  details: string | null;
  status: ModerationCaseStatus;
  createdAt: string;
  handledBy: string | null;
  handledAt: string | null;
}

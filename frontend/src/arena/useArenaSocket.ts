import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { SOCKET_BASE } from '../api/client'
import type { ArenaLeaderboardRow } from './arenaApi'

const ARENA_WS_URL = `${SOCKET_BASE}/arena`

export type LiveRound = {
  id: string
  position: number
  questionId: string | null
  startedAt: string | null
  endedAt: string | null
  endTime: string | null
}

export type ArenaParticipant = {
  userId: string
  displayName: string
  slot: 'A' | 'B'
}

export type ArenaMatchParticipant = {
  userId: string
  displayName: string
  role: 'competitorA' | 'competitorB' | 'moderator' | 'spectator'
}

export type ArenaLiveState = {
  competitionId: string
  competitionName: string
  status: string
  type: string
  secondsPerQuestion: number
  currentRoundNumber: number
  currentQuestionNumber?: number
  totalRounds: number
  totalQuestions?: number
  currentRound: LiveRound | null
  currentQuestion?: LiveRound | null
  leaderboard: ArenaLeaderboardRow[]
  participants?: ArenaParticipant[]
  matchParticipants?: ArenaMatchParticipant[]
}

export type ArenaOnlineUser = {
  userId: string
  participantId: string
  role: string
}

export type SubmissionStatus = {
  submitted: boolean
  option: string | null
  at: string | null
}

export type ArenaSocketState = {
  connected: boolean
  state: ArenaLiveState | null
  leaderboard: ArenaLeaderboardRow[]
  roundEnded: { correctOption: string; explanation: string | null } | null
  competitionResult: { winnerParticipantUserId: string; podium: ArenaLeaderboardRow[] } | null
  error: string | null
  isPaused: boolean
  onlineParticipantIds: string[]
  onlineUsers: ArenaOnlineUser[]
  /** HLS viewer count (from Redis heartbeat, pushed by server every 8s) */
  viewerCount: number
  /** HLS broadcast URL (pushed when broadcast starts) */
  hlsUrl: string | null
  submissionStatuses: Record<string, SubmissionStatus>
}

export function useArenaSocket(params: {
  competitionId: string
  userId: string
  participantId: string
  role: string
  token: string
} | null) {
  const socketRef = useRef<Socket | null>(null)
  const [socketState, setSocketState] = useState<ArenaSocketState>({
    connected: false,
    state: null,
    leaderboard: [],
    roundEnded: null,
    competitionResult: null,
    error: null,
    isPaused: false,
    onlineParticipantIds: [],
    onlineUsers: [],
    viewerCount: 0,
    hlsUrl: null,
    submissionStatuses: {},
  })

  useEffect(() => {
    if (!params) return

    const socket = io(ARENA_WS_URL, {
      transports: ['websocket'],
      auth: { token: params.token },
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setSocketState((s) => ({ ...s, connected: true }))
      socket.emit('arena:join', {
        competitionId: params.competitionId,
        userId: params.userId,
        participantId: params.participantId,
        role: params.role,
        token: params.token,
      })
    })

    socket.on('disconnect', () => {
      setSocketState((s) => ({ ...s, connected: false }))
    })

    socket.on('arena:joined', (state: ArenaLiveState) => {
      setSocketState((s) => ({
        ...s,
        state,
        leaderboard: state.leaderboard,
        roundEnded: state.currentRound?.endedAt
          ? { correctOption: '', explanation: null }
          : null,
      }))
    })

    socket.on('arena:leaderboard', (leaderboard: ArenaLeaderboardRow[]) => {
      setSocketState((s) => ({ ...s, leaderboard }))
    })

    // score.updated is an alias for arena:leaderboard — payload is wrapped in { leaderboard }
    socket.on('score.updated', (data: { leaderboard: ArenaLeaderboardRow[] }) => {
      setSocketState((s) => ({ ...s, leaderboard: data.leaderboard }))
    })

    socket.on('arena:round-start', (data: { round: LiveRound; question?: LiveRound; leaderboard: ArenaLeaderboardRow[] }) => {
      const nextQuestion = data.question ?? data.round
      setSocketState((s) => ({
        ...s,
        leaderboard: data.leaderboard,
        roundEnded: null,
        submissionStatuses: {},
        state: s.state
          ? {
              ...s.state,
              currentRound: data.round,
              currentQuestion: nextQuestion,
              currentRoundNumber: data.round.position,
              currentQuestionNumber: nextQuestion.position,
            }
          : null,
      }))
    })

    socket.on(
      'arena:round-end',
      (data: { correctOption: string; explanation: string | null; leaderboard: ArenaLeaderboardRow[] }) => {
        setSocketState((s) => ({
          ...s,
          leaderboard: data.leaderboard,
          roundEnded: { correctOption: data.correctOption, explanation: data.explanation },
          state: s.state
            ? {
                ...s.state,
                currentRound: s.state.currentRound
                  ? { ...s.state.currentRound, endedAt: new Date().toISOString() }
                  : s.state.currentRound,
                currentQuestion: s.state.currentQuestion
                  ? { ...s.state.currentQuestion, endedAt: new Date().toISOString() }
                  : s.state.currentQuestion,
              }
            : null,
        }))
      },
    )

    socket.on('arena:competition-end', (result: { winnerParticipantUserId: string; podium: ArenaLeaderboardRow[] }) => {
      setSocketState((s) => ({ ...s, competitionResult: result }))
    })

    socket.on('arena:competition-paused', () => {
      setSocketState((s) => ({
        ...s,
        isPaused: true,
        state: s.state ? { ...s.state, status: 'paused' } : null,
      }))
    })

    socket.on('arena:competition-resumed', () => {
      setSocketState((s) => ({
        ...s,
        isPaused: false,
        state: s.state ? { ...s.state, status: 'live' } : null,
      }))
    })

    socket.on('arena:answer-submitted', (data: { participantId: string; option: string | null; at: string }) => {
      setSocketState((s) => ({
        ...s,
        submissionStatuses: {
          ...s.submissionStatuses,
          [data.participantId]: { submitted: true, option: data.option ?? null, at: data.at },
        },
      }))
    })

    socket.on('arena:participant-disqualified', (data: { participantId: string; leaderboard: ArenaLeaderboardRow[] }) => {
      setSocketState((s) => ({ ...s, leaderboard: data.leaderboard }))
    })

    socket.on('arena:score-adjusted', (leaderboard: ArenaLeaderboardRow[]) => {
      setSocketState((s) => ({ ...s, leaderboard }))
    })

    socket.on('arena:participant-connected', (data: { participantId: string }) => {
      setSocketState((s) => ({
        ...s,
        onlineParticipantIds: s.onlineParticipantIds.includes(data.participantId)
          ? s.onlineParticipantIds
          : [...s.onlineParticipantIds, data.participantId],
      }))
    })

    socket.on('arena:participant-disconnected', (data: { participantId: string }) => {
      setSocketState((s) => ({
        ...s,
        onlineParticipantIds: s.onlineParticipantIds.filter((id) => id !== data.participantId),
      }))
    })

    socket.on('arena:online-participants', (data: { participantIds: string[] }) => {
      setSocketState((s) => ({ ...s, onlineParticipantIds: data.participantIds }))
    })

    socket.on('arena:online-users', (data: { users: ArenaOnlineUser[] }) => {
      setSocketState((s) => ({ ...s, onlineUsers: data.users }))
    })

    // Redis heartbeat viewer count (replaces legacy WS-based counter)
    socket.on('arena:viewers-count', (data: { count: number }) => {
      setSocketState((s) => ({ ...s, viewerCount: data.count }))
    })

    // HLS broadcast URL pushed when moderator starts the broadcast
    socket.on('arena:hls-url', (data: { url: string }) => {
      setSocketState((s) => ({ ...s, hlsUrl: data.url }))
    })

    socket.on('arena:error', (data: { message: string }) => {
      setSocketState((s) => ({ ...s, error: data.message }))
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [params])

  const submitAnswer = useCallback(
    (roundId: string, participantId: string, selectedOption: 'A' | 'B' | 'C' | 'D' = 'A') => {
      socketRef.current?.emit('arena:participant-answer', { roundId, participantId, selectedOption })
    },
    [],
  )

  return { socketState, submitAnswer }
}


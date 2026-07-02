import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { SOCKET_BASE } from '../api/client'

export interface DuelParticipant {
  userId: string
  name: string
  score: number
  role: 'A' | 'B'
  academicLevelName?: string | null
  avatarUrl?: string | null
  gender?: 'masculin' | 'feminin' | null
}

export interface DuelChatMessage {
  id: string
  duelId: string
  userId: string
  message: string
  createdAt: string
}

export interface DuelSocketState {
  duelId: string
  mode: 'qcm' | 'oral_live'
  status: 'waiting' | 'matched' | 'in_progress' | 'completed'
  competitionName: string
  moderatorUserId: string | null
  winnerUserId: string | null
  participants: DuelParticipant[]
  liveStartedAt: string | null
  result?: 'A' | 'B' | 'DRAW'
}

interface UseDuelSocketReturn {
  connected: boolean
  duelState: DuelSocketState | null
  messages: DuelChatMessage[]
  sendMessage: (message: string) => void
  ended: boolean
  endResult: DuelSocketState | null
}

export function useDuelSocket(duelId: string | undefined, token: string | null): UseDuelSocketReturn {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [duelState, setDuelState] = useState<DuelSocketState | null>(null)
  const [messages, setMessages] = useState<DuelChatMessage[]>([])
  const [ended, setEnded] = useState(false)
  const [endResult, setEndResult] = useState<DuelSocketState | null>(null)

  useEffect(() => {
    if (!duelId || !token) return

    setMessages([])
    setEnded(false)
    setEndResult(null)

    const socket = io(`${SOCKET_BASE}/duels`, {
      transports: ['websocket'],
      reconnection: true,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('duel:join', { duelId, token })
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('duel:state', (state: DuelSocketState) => {
      setDuelState(state)
    })

    socket.on('duel:score-update', (state: DuelSocketState) => {
      setDuelState(state)
    })

    socket.on('duel:ended', (state: DuelSocketState) => {
      setDuelState(state)
      setEndResult(state)
      setEnded(true)
    })

    socket.on('chat:message', (message: DuelChatMessage) => {
      setMessages((current) => [...current, message].slice(-80))
    })

    return () => {
      socket.emit('duel:leave', { duelId })
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [duelId, token])

  const sendMessage = useCallback((message: string) => {
    const trimmed = message.trim()
    if (!duelId || !trimmed) return
    socketRef.current?.emit('chat:message', { duelId, message: trimmed })
  }, [duelId])

  return { connected, duelState, messages, sendMessage, ended, endResult }
}


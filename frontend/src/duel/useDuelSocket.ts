import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { SOCKET_BASE } from '../api/client'

export interface DuelParticipant {
  userId: string
  name: string
  score: number
  role: 'A' | 'B'
}

export interface DuelSocketState {
  duelId: string
  mode: 'qcm' | 'oral_live'
  status: 'waiting' | 'in_progress' | 'completed'
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
  ended: boolean
  endResult: DuelSocketState | null
}

export function useDuelSocket(duelId: string | undefined, token: string | null): UseDuelSocketReturn {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [duelState, setDuelState] = useState<DuelSocketState | null>(null)
  const [ended, setEnded] = useState(false)
  const [endResult, setEndResult] = useState<DuelSocketState | null>(null)

  useEffect(() => {
    if (!duelId || !token) return

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

    return () => {
      socket.emit('duel:leave', { duelId })
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [duelId, token])

  return { connected, duelState, ended, endResult }
}

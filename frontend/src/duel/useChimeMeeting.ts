import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ConsoleLogger,
  DefaultDeviceController,
  DefaultMeetingSession,
  LogLevel,
  MeetingSessionConfiguration,
} from 'amazon-chime-sdk-js'

export interface ChimeJoinInfo {
  meeting: {
    MeetingId: string
    MediaRegion: string
    MediaPlacement: {
      AudioHostUrl: string
      AudioFallbackUrl: string
      SignalingUrl: string
      TurnControlUrl: string
    }
  }
  attendee: {
    AttendeeId: string
    ExternalUserId: string
    JoinToken: string
  }
}

export type ChimeMeetingStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'muted'
  | 'error'
  | 'ended'

interface UseChimeMeetingReturn {
  status: ChimeMeetingStatus
  error: string | null
  isMuted: boolean
  join: (joinInfo: ChimeJoinInfo) => Promise<void>
  leave: () => Promise<void>
  toggleMute: () => void
}

export function useChimeMeeting(): UseChimeMeetingReturn {
  const sessionRef = useRef<DefaultMeetingSession | null>(null)
  const deviceControllerRef = useRef<DefaultDeviceController | null>(null)
  const [status, setStatus] = useState<ChimeMeetingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)

  const leave = useCallback(async () => {
    try {
      if (sessionRef.current) {
        sessionRef.current.audioVideo.stop()
        sessionRef.current = null
      }
      if (deviceControllerRef.current) {
        await deviceControllerRef.current.destroy()
        deviceControllerRef.current = null
      }
    } catch {
      // best-effort cleanup
    }
    setStatus('ended')
    setIsMuted(false)
  }, [])

  const join = useCallback(async (joinInfo: ChimeJoinInfo) => {
    setStatus('connecting')
    setError(null)

    try {
      const logger = new ConsoleLogger('Chime', LogLevel.WARN)

      const deviceController = new DefaultDeviceController(logger)
      deviceControllerRef.current = deviceController

      const configuration = new MeetingSessionConfiguration(
        joinInfo.meeting,
        joinInfo.attendee,
      )

      const session = new DefaultMeetingSession(configuration, logger, deviceController)
      sessionRef.current = session

      // Request microphone permission and select default input device
      const audioInputDevices = await session.audioVideo.listAudioInputDevices()
      if (audioInputDevices.length === 0) {
        throw new Error('No microphone found. Please connect a microphone and try again.')
      }
      await session.audioVideo.startAudioInput(audioInputDevices[0].deviceId)

      // Bind audio output to a hidden <audio> element
      let audioEl = document.getElementById('chime-audio-output') as HTMLAudioElement | null
      if (!audioEl) {
        audioEl = document.createElement('audio')
        audioEl.id = 'chime-audio-output'
        audioEl.autoplay = true
        audioEl.style.display = 'none'
        document.body.appendChild(audioEl)
      }
      session.audioVideo.bindAudioElement(audioEl)

      session.audioVideo.addObserver({
        audioVideoDidStart() {
          setStatus('connected')
        },
        audioVideoDidStop() {
          setStatus('ended')
        },
        audioVideoDidStartConnecting(reconnecting) {
          if (reconnecting) setStatus('connecting')
        },
      })

      session.audioVideo.start()
    } catch (err) {
      const message = (err as Error).message ?? 'Failed to connect to audio room'
      setError(message)
      setStatus('error')
    }
  }, [])

  const toggleMute = useCallback(() => {
    if (!sessionRef.current) return
    const av = sessionRef.current.audioVideo
    if (isMuted) {
      av.realtimeUnmuteLocalAudio()
      setIsMuted(false)
    } else {
      av.realtimeMuteLocalAudio()
      setIsMuted(true)
    }
  }, [isMuted])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void leave()
    }
  }, [leave])

  return { status, error, isMuted, join, leave, toggleMute }
}

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Room,
  RoomEvent,
  LocalParticipant,
  RemoteParticipant,
  Track,
  VideoPresets,
  type Participant,
  type TrackPublication,
} from 'livekit-client'

function formatStageConnectionError(message: string): string {
  if (/failed to fetch|networkerror|fetch failed/i.test(message)) {
    return 'Serveur LiveKit inaccessible - verifiez que le service LiveKit tourne et que LIVEKIT_URL est correct.'
  }

  return `Connexion scene impossible : ${message}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type StageParticipant = {
  identity: string
  displayName: string | null
  /** Camera track publication — attach its .track to a <video> element */
  cameraPublication: TrackPublication | undefined
  /** Microphone track publication */
  micPublication: TrackPublication | undefined
  isCameraEnabled: boolean
  isMicEnabled: boolean
  isLocal: boolean
  /** The underlying LiveKit Participant object, for track attachment */
  participant: Participant
}

type UseLiveKitStageParams = {
  /** WebSocket URL for the LiveKit server (ws:// or wss://) */
  url: string | null
  /** JWT token issued by POST /rtc-token */
  token: string | null
  /** Only publish if the user is a stage participant (not a spectator) */
  canPublish: boolean
}

type UseLiveKitStageReturn = {
  roomConnected: boolean
  participants: StageParticipant[]
  localCameraEnabled: boolean
  localMicEnabled: boolean
  isCameraLoading: boolean
  permissionError: string | null
  toggleCamera: () => Promise<void>
  toggleMic: () => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a StageParticipant from a LiveKit Participant
// ─────────────────────────────────────────────────────────────────────────────

function toStageParticipant(p: LocalParticipant | RemoteParticipant): StageParticipant {
  const cameraPub = p.getTrackPublication(Track.Source.Camera)
  const micPub = p.getTrackPublication(Track.Source.Microphone)
  return {
    identity: p.identity,
    displayName: p.name ?? null,
    cameraPublication: cameraPub,
    micPublication: micPub,
    isCameraEnabled: p.isCameraEnabled,
    isMicEnabled: p.isMicrophoneEnabled,
    isLocal: p instanceof LocalParticipant,
    participant: p,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useLiveKitStage({
  url,
  token,
  canPublish,
}: UseLiveKitStageParams): UseLiveKitStageReturn {
  const roomRef = useRef<Room | null>(null)
  const [roomConnected, setRoomConnected] = useState(false)
  const [participants, setParticipants] = useState<StageParticipant[]>([])
  const [localCameraEnabled, setLocalCameraEnabled] = useState(false)
  const [localMicEnabled, setLocalMicEnabled] = useState(false)
  const [isCameraLoading, setIsCameraLoading] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  // ── Refresh the participants snapshot when anything changes ─────────────
  const refreshParticipants = useCallback((room: Room) => {
    const all: StageParticipant[] = [toStageParticipant(room.localParticipant)]
    for (const remote of room.remoteParticipants.values()) {
      all.push(toStageParticipant(remote))
    }
    setParticipants(all)
    setLocalCameraEnabled(room.localParticipant.isCameraEnabled)
    setLocalMicEnabled(room.localParticipant.isMicrophoneEnabled)
  }, [])

  // ── Connect / disconnect ────────────────────────────────────────────────
  useEffect(() => {
    if (!url || !token) return

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h360.resolution,
      },
    })
    roomRef.current = room

    const onAny = () => refreshParticipants(room)

    room.on(RoomEvent.Connected, () => {
      setPermissionError(null)
      setRoomConnected(true)
      refreshParticipants(room)
    })
    room.on(RoomEvent.Disconnected, () => {
      setRoomConnected(false)
      setParticipants([])
    })
    room.on(RoomEvent.ParticipantConnected, onAny)
    room.on(RoomEvent.ParticipantDisconnected, onAny)
    room.on(RoomEvent.TrackPublished, onAny)
    room.on(RoomEvent.TrackUnpublished, onAny)
    room.on(RoomEvent.TrackSubscribed, onAny)
    room.on(RoomEvent.TrackUnsubscribed, onAny)
    room.on(RoomEvent.TrackMuted, onAny)
    room.on(RoomEvent.TrackUnmuted, onAny)
    room.on(RoomEvent.LocalTrackPublished, onAny)
    room.on(RoomEvent.LocalTrackUnpublished, onAny)

    room.connect(url, token).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Connexion LiveKit échouée'
      setPermissionError(formatStageConnectionError(msg))
    })

    return () => {
      room.disconnect()
      roomRef.current = null
      setRoomConnected(false)
      setParticipants([])
    }
  }, [url, token, refreshParticipants])

  // ── Camera toggle ───────────────────────────────────────────────────────
  const toggleCamera = useCallback(async () => {
    const room = roomRef.current
    if (!room || !canPublish) return
    setIsCameraLoading(true)
    setPermissionError(null)
    try {
      await room.localParticipant.setCameraEnabled(!localCameraEnabled)
      refreshParticipants(room)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur caméra'
      if (/permission|notallowed|denied/i.test(msg)) {
        setPermissionError('Accès caméra refusé — vérifiez les permissions du navigateur.')
      } else {
        setPermissionError(msg)
      }
    } finally {
      setIsCameraLoading(false)
    }
  }, [canPublish, localCameraEnabled, refreshParticipants])

  // ── Mic toggle ──────────────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room || !canPublish) return
    try {
      await room.localParticipant.setMicrophoneEnabled(!localMicEnabled)
      refreshParticipants(room)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur microphone'
      setPermissionError(msg)
    }
  }, [canPublish, localMicEnabled, refreshParticipants])

  return {
    roomConnected,
    participants,
    localCameraEnabled,
    localMicEnabled,
    isCameraLoading,
    permissionError,
    toggleCamera,
    toggleMic,
  }
}

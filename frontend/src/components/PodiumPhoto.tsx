import { useState } from 'react'
import { API_ORIGIN } from '../api/client'

type PodiumPhotoProps = {
  avatarUrl?: string | null
  studentName: string
  accent: string
}

export default function PodiumPhoto({ avatarUrl, studentName, accent }: PodiumPhotoProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const source = avatarUrl?.trim()
  if (!source) return null

  const src = source.startsWith('/') ? `${API_ORIGIN}${source}` : source
  if (failedSource === src) return null

  return (
    <img
      src={src}
      alt={`Photo de ${studentName}`}
      width={180}
      height={180}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSource(src)}
      style={{
        display: 'block',
        width: 'min(180px, 100%)',
        height: 'auto',
        aspectRatio: '1',
        objectFit: 'cover',
        objectPosition: 'center',
        borderRadius: '50%',
        border: `3px solid ${accent}`,
        padding: 4,
        background: '#fff',
        boxShadow: '0 10px 26px rgba(15,32,64,0.12)',
        margin: '0 auto 20px',
      }}
    />
  )
}

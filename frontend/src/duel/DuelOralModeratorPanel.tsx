import { useState } from 'react'
import { apiCall } from '../api/client'

interface Props {
  duelId: string
  accessToken: string | null
  onScored?: () => void
  onEnded?: () => void
}

type AwardTarget = 'A' | 'B' | 'BOTH' | 'NONE'

export default function DuelOralModeratorPanel({ duelId, accessToken, onScored, onEnded }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastAction, setLastAction] = useState('')

  const score = async (awardedTo: AwardTarget, points = 1) => {
    setLoading(true)
    setError('')
    try {
      await apiCall(
        `/duels/${duelId}/oral/score`,
        {
          method: 'PATCH',
          body: JSON.stringify({ awardedTo, points }),
        },
        accessToken,
      )
      setLastAction(`+${points} → ${awardedTo}`)
      onScored?.()
    } catch (e) {
      setError((e as { message: string }).message)
    } finally {
      setLoading(false)
    }
  }

  const endMatch = async () => {
    if (!window.confirm('Terminer le match ? Cette action est irréversible.')) return
    setLoading(true)
    setError('')
    try {
      await apiCall(
        `/duels/${duelId}/oral/end`,
        { method: 'PATCH' },
        accessToken,
      )
      onEnded?.()
    } catch (e) {
      setError((e as { message: string }).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        background: '#fef3c7',
        border: '1px solid #fbbf24',
        borderRadius: 8,
        padding: '16px 20px',
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#92400e',
          marginBottom: 12,
        }}
      >
        Panneau Modérateur
      </p>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--error)', marginBottom: 10 }}>{error}</p>
      )}
      {lastAction && (
        <p style={{ fontSize: 13, color: '#065f46', marginBottom: 10 }}>✓ {lastAction}</p>
      )}

      <p style={{ fontSize: 13, color: '#78350f', marginBottom: 8, fontWeight: 600 }}>
        Attribuer les points :
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => void score('A')}
          disabled={loading}
          style={scoreBtn('#2563eb')}
        >
          +1 Compétiteur A
        </button>
        <button
          onClick={() => void score('B')}
          disabled={loading}
          style={scoreBtn('#7c3aed')}
        >
          +1 Compétiteur B
        </button>
        <button
          onClick={() => void score('BOTH')}
          disabled={loading}
          style={scoreBtn('#059669')}
        >
          +1 Les deux
        </button>
        <button
          onClick={() => void score('NONE')}
          disabled={loading}
          style={scoreBtn('#6b7280')}
        >
          Aucun point
        </button>
      </div>

      <button
        onClick={() => void endMatch()}
        disabled={loading}
        style={{
          background: '#dc2626',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '8px 16px',
          fontSize: 14,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          fontFamily: 'inherit',
        }}
      >
        Terminer le match
      </button>
    </div>
  )
}

function scoreBtn(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 14px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}

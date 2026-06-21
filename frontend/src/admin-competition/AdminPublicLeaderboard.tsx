import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiCall } from '../api/client'

type SchoolClass = { id: string; name: string }

type LeaderboardRow = {
  userId: string
  studentName: string
  winCount: number
  lossCount: number
  duelCount: number
  totalCorrectAnswers: number
  winTimeSeconds: number
  lastWinAt: string | null
}

export default function AdminPublicLeaderboard({ classes }: { classes: SchoolClass[] }) {
  const [classId, setClassId] = useState('')
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = classId ? `?classId=${encodeURIComponent(classId)}` : ''
      setRows(await apiCall<LeaderboardRow[]>(`/leaderboard/weekly${query}`))
    } catch (cause) {
      setRows([])
      setError(cause instanceof Error ? cause.message : 'Impossible de charger le classement.')
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => { void load() }, [load])
  const podium = useMemo(() => rows.slice(0, 3), [rows])

  return (
    <div>
      <p className="overline" style={{ marginBottom: 8 }}>Compétitions</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 6 }}>Classement public</h1>
          <p style={{ color: 'var(--ink-3)', maxWidth: 660, lineHeight: 1.6 }}>
            Aperçu en lecture seule du classement calculé automatiquement à partir des performances de la plateforme.
          </p>
        </div>
        <Link className="btn btn-ghost btn-sm" to="/classement" target="_blank" rel="noreferrer">Voir la page publique</Link>
      </div>

      <div className="card" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label className="field-label" htmlFor="admin-leaderboard-class">Filtrer par classe</label>
          <select id="admin-leaderboard-class" className="field-input" value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Toutes les classes</option>
            {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
          </select>
        </div>
        <span style={{ padding: '7px 11px', borderRadius: 999, background: 'var(--stone)', color: 'var(--ink-3)', fontSize: 12, fontWeight: 700 }}>Lecture seule</span>
      </div>

      {loading && <div className="card"><p style={{ color: 'var(--ink-3)' }}>Chargement du classement…</p></div>}
      {!loading && error && <div className="alert alert-error">{error} <button className="btn btn-ghost btn-sm" onClick={() => void load()}>Réessayer</button></div>}
      {!loading && !error && rows.length === 0 && <div className="card" style={{ textAlign: 'center', padding: 30 }}><p style={{ color: 'var(--ink-3)' }}>Aucun résultat disponible pour cette sélection.</p></div>}

      {!loading && !error && rows.length > 0 && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="responsive-three-col" style={{ gap: 12 }}>
            {podium.map((row, index) => <PodiumCard key={row.userId} row={row} rank={index + 1} />)}
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Rang</th><th>Élève</th><th>Victoires</th><th>Défaites</th><th>Duels</th><th>Bonnes réponses</th></tr></thead>
                <tbody>{rows.map((row, index) => <tr key={row.userId}><td>#{index + 1}</td><td style={{ fontWeight: 600 }}>{row.studentName}</td><td>{row.winCount}</td><td>{row.lossCount}</td><td>{row.duelCount}</td><td>{row.totalCorrectAnswers}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PodiumCard({ row, rank }: { row: LeaderboardRow; rank: number }) {
  const accent = rank === 1 ? 'var(--gold)' : rank === 2 ? 'var(--cobalt)' : '#8A6A43'
  return (
    <article className="card" style={{ borderColor: rank === 1 ? 'rgba(176,121,26,.35)' : 'var(--rule)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: accent, fontWeight: 800, marginBottom: 10 }}><span>{rank === 1 ? '1re place' : `${rank}e place`}</span><span>#{rank}</span></div>
      <h2 className="display" style={{ fontSize: 23, color: 'var(--ink)', marginBottom: 10 }}>{row.studentName}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>{row.winCount} victoire{row.winCount !== 1 ? 's' : ''} · {row.totalCorrectAnswers} bonnes réponses</p>
    </article>
  )
}
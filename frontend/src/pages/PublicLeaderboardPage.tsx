import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiCall } from '../api/client'

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

export default function PublicLeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiCall<LeaderboardRow[]>('/leaderboard/weekly')
      .then((data) => {
        setRows(data)
        setError('')
      })
      .catch(() => {
        setRows([])
        setError('Impossible de charger le classement pour le moment.')
      })
      .finally(() => setLoading(false))
  }, [])

  const podium = useMemo(() => rows.slice(0, 3), [rows])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      <section style={{ background: 'var(--cobalt)', color: '#fff', padding: '88px 6vw 64px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p className="overline" style={{ margin: '0 0 14px' }}>Classement public</p>
          <h1 className="display" style={{ margin: '0 0 14px', fontSize: 'clamp(34px,6vw,60px)', letterSpacing: '-0.04em', lineHeight: 1.04 }}>
            Classement hebdomadaire
            <br />
            des élèves
          </h1>
          <p style={{ margin: 0, maxWidth: 760, fontSize: 17, color: 'rgba(255,255,255,0.84)', lineHeight: 1.8 }}>
            Cette page est publique. Parents, élèves et visiteurs peuvent suivre les performances de la semaine sans créer de compte.
          </p>
        </div>
      </section>

      <section style={{ padding: '32px 6vw 84px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>
              Mis a jour chaque semaine selon les victoires, la precision des reponses et la constance en duel.
            </p>
            <Link to="/" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
              Retour a l'accueil
            </Link>
          </div>

          {loading && (
            <div style={{ borderRadius: 18, border: '1px solid var(--rule)', background: '#fff', padding: '20px 18px' }}>
              <p style={{ margin: 0, color: 'var(--ink-3)' }}>Chargement du classement...</p>
            </div>
          )}

          {!loading && error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div style={{ borderRadius: 18, border: '1px solid var(--rule)', background: '#fff', padding: '20px 18px' }}>
              <p style={{ margin: 0, color: 'var(--ink-3)' }}>
                Aucun resultat disponible pour cette semaine.
              </p>
            </div>
          )}

          {!loading && !error && rows.length > 0 && (
            <>
              <div className="responsive-three-col" style={{ gap: 14 }}>
                {podium.map((row, index) => {
                  const rank = index + 1
                  const accent = rank === 1 ? 'var(--gold)' : rank === 2 ? 'var(--cobalt)' : '#8A6A43'

                  return (
                    <article
                      key={row.userId}
                      style={{
                        background: '#fff',
                        border: `1px solid ${rank === 1 ? 'rgba(176,121,26,0.32)' : 'var(--rule)'}`,
                        borderRadius: 20,
                        padding: '18px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: accent }}>
                          {rank === 1 ? '1re place' : rank === 2 ? '2e place' : '3e place'}
                        </span>
                        <span style={{ fontSize: 20, fontWeight: 700, color: accent }}>#{rank}</span>
                      </div>
                      <p className="display" style={{ margin: '0 0 8px', fontSize: 28, color: 'var(--ink)' }}>
                        {row.studentName}
                      </p>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>Victoires: {row.winCount}</p>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>Bonnes reponses: {row.totalCorrectAnswers}</p>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>Duels joues: {row.duelCount}</p>
                      </div>
                    </article>
                  )
                })}
              </div>

              <div style={{ borderRadius: 20, border: '1px solid var(--rule)', background: '#fff', overflowX: 'auto' }}>
                <table className="data-table" aria-label="Classement hebdomadaire public">
                  <thead>
                    <tr>
                      <th>Rang</th>
                      <th>Eleve</th>
                      <th>Victoires</th>
                      <th>Defaites</th>
                      <th>Duels</th>
                      <th>Bonnes reponses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.userId}>
                        <td>{index + 1}</td>
                        <td>{row.studentName}</td>
                        <td>{row.winCount}</td>
                        <td>{row.lossCount}</td>
                        <td>{row.duelCount}</td>
                        <td>{row.totalCorrectAnswers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

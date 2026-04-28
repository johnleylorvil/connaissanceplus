import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { userHome } from '../auth/authRules'
import ArenaOverview from './views/ArenaOverview'
import ArenaCompetitionsList from './views/ArenaCompetitionsList'
import ArenaHistory from './views/ArenaHistory'

export type ArenaTab = 'overview' | 'competitions' | 'history'

const navItems: { key: ArenaTab; label: string; adminOnly?: boolean }[] = [
  { key: 'overview', label: 'Vue generale' },
  { key: 'competitions', label: 'Competitions' },
  { key: 'history', label: 'Historique' },
]

type ArenaWorkspaceProps = {
  embedded?: boolean
}

export default function ArenaWorkspace({ embedded = false }: ArenaWorkspaceProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<ArenaTab>('overview')

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const visibleItems = navItems.filter((item) => !item.adminOnly || user.role === 'admin')
  const homePath = userHome(user)

  const content = (
    <>
      {tab === 'overview' && <ArenaOverview onNavigate={setTab} />}
      {tab === 'competitions' && <ArenaCompetitionsList />}
      {tab === 'history' && <ArenaHistory />}
    </>
  )

  if (embedded) {
    return (
      <div>
        <div style={{ marginBottom: 22 }}>
          <p className="overline" style={{ marginBottom: 8 }}>Competition live</p>
          <h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 4 }}>Arena</h1>
          <p style={{ fontSize: 16, color: 'var(--ink-3)', lineHeight: 1.7 }}>Retrouvez les competitions live, les inscriptions et l'historique sans quitter votre tableau de bord.</p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {visibleItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={tab === item.key ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            >
              {item.label}
            </button>
          ))}
        </div>

        {content}
      </div>
    )
  }

  return (
    <div className="dashboard-shell">
      <div
        style={{
          background: '#fff',
          borderBottom: '1px solid var(--rule)',
          padding: '0 24px',
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(homePath)}
            style={{
              fontSize: 14,
              color: 'var(--ink-3)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            ← Retour au portail
          </button>
          <span style={{ color: 'var(--rule)' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <span className="brand" style={{ fontSize: 15, color: 'var(--cobalt)' }}>Arena</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 52px)' }}>
        <aside
          className="hidden md:flex"
          style={{
            width: 200,
            background: '#fff',
            borderRight: '1px solid var(--rule)',
            minHeight: '100%',
            flexDirection: 'column',
            padding: '16px 8px',
            flexShrink: 0,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              padding: '4px 12px',
              marginBottom: 6,
            }}
          >
            Arena
          </p>
          {visibleItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`nav-item${tab === item.key ? ' active' : ''}`}
              style={{ marginBottom: 2 }}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <div className="md:hidden bottom-tab-nav" style={{ zIndex: 30 }}>
          <div style={{ display: 'flex', gap: 0 }}>
            {visibleItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                style={{
                  flex: '0 0 auto',
                  padding: '10px 14px',
                  fontSize: 12,
                  fontWeight: tab === item.key ? 700 : 500,
                  color: tab === item.key ? 'var(--cobalt)' : 'var(--ink-3)',
                  background: 'none',
                  border: 'none',
                  borderBottom: tab === item.key ? '2px solid var(--cobalt)' : '2px solid transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <main className="dashboard-main" style={{ flex: 1, maxWidth: 860 }}>
          {content}
        </main>
      </div>
    </div>
  )
}
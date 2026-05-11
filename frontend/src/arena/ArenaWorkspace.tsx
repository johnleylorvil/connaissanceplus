import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { userHome } from '../auth/authRules'
import ArenaOverview from './views/ArenaOverview'
import ArenaCompetitionsList from './views/ArenaCompetitionsList'
import ArenaHistory from './views/ArenaHistory'

export type ArenaTab = 'overview' | 'competitions' | 'history'

const WS = {
  bg: '#070a12',
  header: '#08101e',
  sidebar: '#08101e',
  border: 'rgba(255,255,255,0.07)',
  text: '#f8fafc',
  textMuted: 'rgba(255,255,255,0.50)',
  textSoft: 'rgba(255,255,255,0.32)',
  gold: '#e6c27a',
  goldDim: 'rgba(230,194,122,0.18)',
  activeText: '#f8fafc',
}

const navItems: { key: ArenaTab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Vue générale', icon: '◈' },
  { key: 'competitions', label: 'Compétitions', icon: '◆' },
  { key: 'history', label: 'Historique', icon: '◉' },
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
      <div style={{ borderRadius: 16, overflow: 'hidden', background: WS.bg, border: `1px solid ${WS.border}` }}>
        {/* Embedded header */}
        <div
          style={{
            background: WS.header,
            borderBottom: `1px solid ${WS.border}`,
            padding: '14px 18px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 30%, rgba(230,194,122,0.22), #050d18)',
                border: `1px solid rgba(230,194,122,0.35)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 900,
                color: WS.gold,
                flexShrink: 0,
              }}
            >
              K+
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: WS.text }}>Arena</p>
            <p style={{ margin: 0, fontSize: 12, color: WS.textMuted }}>Compétitions live</p>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                style={{
                  padding: '8px 16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: tab === item.key ? 800 : 600,
                  color: tab === item.key ? WS.text : WS.textMuted,
                  borderBottom: tab === item.key ? `2px solid ${WS.gold}` : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'all .15s',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '20px 18px 24px' }}>{content}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: WS.bg }}>
      <style>{`
        .arena-nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-radius: 10px;
          border: none; background: none; cursor: pointer;
          font-family: inherit; font-size: 13px; font-weight: 600;
          color: ${WS.textMuted}; text-align: left; width: 100%;
          transition: all .15s ease;
        }
        .arena-nav-item:hover { background: rgba(255,255,255,0.05); color: ${WS.text}; }
        .arena-nav-item.active {
          background: ${WS.goldDim};
          color: ${WS.gold};
          font-weight: 800;
        }
        .arena-nav-icon { font-size: 12px; flex-shrink: 0; }
      `}</style>

      {/* ── Top header (mobile) ─────────────────────────────── */}
      <header
        style={{
          background: WS.header,
          borderBottom: `1px solid ${WS.border}`,
          padding: '0 18px',
          height: 54,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(homePath)}
            style={{
              fontSize: 13,
              color: WS.textMuted,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            ← Retour
          </button>
          <span style={{ color: WS.border, fontSize: 16 }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 30%, rgba(230,194,122,0.20), #050d18)',
                border: `1px solid rgba(230,194,122,0.32)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 900,
                color: WS.gold,
                flexShrink: 0,
              }}
            >
              K+
            </div>
            <span style={{ fontSize: 14, fontWeight: 900, color: WS.text }}>Arena</span>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* ── Sidebar (desktop) ─────────────────────────────── */}
        <aside
          className="hidden md:flex"
          style={{
            width: 208,
            background: WS.sidebar,
            borderRight: `1px solid ${WS.border}`,
            flexDirection: 'column',
            padding: '20px 10px 16px',
            flexShrink: 0,
            position: 'sticky',
            top: 54,
            height: 'calc(100vh - 54px)',
            overflowY: 'auto',
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: WS.textSoft,
              padding: '0 14px',
              marginBottom: 8,
            }}
          >
            Navigation
          </p>
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`arena-nav-item${tab === item.key ? ' active' : ''}`}
              style={{ marginBottom: 2 }}
            >
              <span className="arena-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}

          {/* Spacer + back link at bottom */}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => navigate(homePath)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 14px',
              borderRadius: 10,
              border: `1px solid ${WS.border}`,
              background: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: WS.textSoft,
              fontFamily: 'inherit',
              marginTop: 12,
              width: '100%',
              transition: 'all .15s',
            }}
          >
            ← Portail
          </button>
        </aside>

        {/* ── Mobile bottom nav ─────────────────────────────── */}
        <div
          className="md:hidden bottom-tab-nav"
          style={{ zIndex: 30, background: WS.header, borderTop: `1px solid ${WS.border}` }}
        >
          <div style={{ display: 'flex' }}>
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                style={{
                  flex: 1,
                  padding: '10px 8px 9px',
                  fontSize: 11,
                  fontWeight: tab === item.key ? 800 : 500,
                  color: tab === item.key ? WS.gold : WS.textMuted,
                  background: 'none',
                  border: 'none',
                  borderTop: tab === item.key ? `2px solid ${WS.gold}` : '2px solid transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 13 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Main content ──────────────────────────────────── */}
        <main
          style={{
            flex: 1,
            maxWidth: 860,
            padding: '28px 24px 48px',
            overflowY: 'auto',
          }}
        >
          {content}
        </main>
      </div>
    </div>
  )
}
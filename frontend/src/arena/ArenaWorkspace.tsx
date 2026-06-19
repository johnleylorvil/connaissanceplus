import { Navigate, useNavigate } from 'react-router-dom'
import { userHome } from '../auth/authRules'
import KonesansLogo from '../components/KonesansLogo'
import { useAuth } from '../context/AuthContext'
import ArenaCompetitionsList from './views/ArenaCompetitionsList'

type ArenaWorkspaceProps = { embedded?: boolean }

export default function ArenaWorkspace({ embedded = false }: ArenaWorkspaceProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user) return <Navigate to="/login" replace />
  if (embedded) return <EmbeddedArena />
  return <ArenaShell onBack={() => navigate(userHome(user))} />
}

function EmbeddedArena() {
  return (
    <section className="arena-hub arena-hub-embedded">
      <div className="arena-hub-embedded-header">
        <KonesansLogo size={34} />
        <div><strong>Arena</strong><span>Comp&eacute;titions en direct</span></div>
      </div>
      <ArenaCompetitionsList embedded />
    </section>
  )
}

function ArenaShell({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="arena-hub">
      <header className="arena-hub-header">
        <button type="button" className="arena-hub-back" onClick={onBack}>
          <span aria-hidden="true">&larr;</span><span>Retour au portail</span>
        </button>
        <button type="button" className="arena-hub-brand" onClick={() => navigate('/arena')}>
          <KonesansLogo size={38} />
          <span><strong>Konesans+ Arena</strong><small>Comp&eacute;titions</small></span>
        </button>
        <button type="button" className="arena-hub-watch" onClick={() => navigate('/arena/spectator')}>
          Mode spectateur
        </button>
      </header>
      <main className="arena-hub-main"><ArenaCompetitionsList /></main>
    </div>
  )
}

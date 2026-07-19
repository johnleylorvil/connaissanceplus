import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { listAdminUsers, reactivateAdminUser, suspendAdminUser, type AdminUser, type AdminUserRole, type AdminUsersResponse } from './adminUsersApi'

type Props = { token: string; currentUserId: string; mode: 'all' | 'team'; onCreateModerator: () => void }
const ROLE_LABEL: Record<AdminUserRole, string> = { student: 'Étudiant', school: 'Responsable école', moderator: 'Modérateur', admin: 'Administrateur' }
const emptyData: AdminUsersResponse = { items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 }, countsByRole: { student: 0, school: 0, moderator: 0, admin: 0 }, countsByStatus: { active: 0, suspended: 0 } }

function getUserScopeLabel(user: AdminUser, mode: 'all' | 'team') {
  if (user.role === 'student') return [user.academicClass?.name, user.school].filter(Boolean).join(' \u00b7 ') || '\u2014'
  if (user.role === 'school') return user.school ? 'Responsable de ' + user.school : 'Responsable \u00e9cole / \u00e9tablissement non li\u00e9'
  if (user.role === 'admin') return mode === 'team' ? 'Administration compl\u00e8te' : 'Administration compl\u00e8te'
  return 'Arena'
}

export default function AdminUsersView({ token, currentUserId, mode, onCreateModerator }: Props) {
  const [data, setData] = useState(emptyData)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<AdminUserRole | ''>(mode === 'team' ? 'moderator' : '')
  const [status, setStatus] = useState<'active' | 'suspended' | ''>('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [suspending, setSuspending] = useState<AdminUser | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const selectedRole = role || undefined
      const result = await listAdminUsers({ search: search || undefined, role: selectedRole, scope: mode === 'team' && !selectedRole ? 'team' : undefined, status: status || undefined, page, pageSize: 25 }, token)
      setData(result)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de charger les utilisateurs.') }
    finally { setLoading(false) }
  }, [mode, page, role, search, status, token])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setPage(1); setRole(mode === 'team' ? '' : '') }, [mode])

  const submitSearch = (event: FormEvent) => { event.preventDefault(); setPage(1); setSearch(searchDraft.trim()) }
  const reactivate = async (user: AdminUser) => {
    if (!window.confirm(`Réactiver le compte de ${user.firstName} ${user.lastName} ?`)) return
    setSaving(true); setError('')
    try { await reactivateAdminUser(user.id, token); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Réactivation impossible.') }
    finally { setSaving(false) }
  }
  const suspend = async (event: FormEvent) => {
    event.preventDefault(); if (!suspending) return
    setSaving(true); setError('')
    try { await suspendAdminUser(suspending.id, reason, token); setSuspending(null); setReason(''); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Suspension impossible.') }
    finally { setSaving(false) }
  }

  const cards = mode === 'team'
    ? [{ label: 'Administrateurs', value: data.countsByRole.admin }, { label: 'Modérateurs', value: data.countsByRole.moderator }, { label: 'Comptes suspendus', value: data.countsByStatus.suspended }]
    : [{ label: 'Tous', value: data.countsByRole.student + data.countsByRole.school + data.countsByRole.moderator + data.countsByRole.admin }, { label: 'Étudiants', value: data.countsByRole.student }, { label: 'Responsables école', value: data.countsByRole.school }, { label: 'Modérateurs', value: data.countsByRole.moderator }, { label: 'Administrateurs', value: data.countsByRole.admin }, { label: 'Suspendus', value: data.countsByStatus.suspended }]

  return <div>
    <p className="overline" style={{ marginBottom: 8 }}>Utilisateurs</p>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
      <div><h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)' }}>{mode === 'team' ? 'Équipe administrative' : 'Tous les utilisateurs'}</h1><p style={{ color: 'var(--ink-3)', marginTop: 6 }}>{mode === 'team' ? 'Accès administrateur et modération des compétitions.' : 'Recherchez et gérez tous les comptes de la plateforme.'}</p></div>
      {mode === 'team' && <button className="btn btn-primary btn-sm" onClick={onCreateModerator}>+ Créer un modérateur</button>}
    </div>

    {mode === 'team' && <div className="responsive-three-col" style={{ gap: 12, marginBottom: 20 }}>
      <RoleCard title="Administrateur" text="Gestion complète des contenus, utilisateurs, communications et compétitions." />
      <RoleCard title="Modérateur" text="Animation et modération des compétitions Arena qui lui sont affectées." />
      <RoleCard title="Étudiant" text="Accès au portail d’apprentissage, aux quiz, duels et activités étudiantes." />
    </div>}

    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(130px, 1fr))`, gap: 10, marginBottom: 16 }}>
      {cards.map((card) => <div className="card" key={card.label} style={{ padding: 14 }}><p style={{ fontSize: 12, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{card.label}</p><strong style={{ fontSize: 25, color: 'var(--cobalt)' }}>{card.value}</strong></div>)}
    </div>

    <div className="card" style={{ marginBottom: 16 }}>
      <form onSubmit={submitSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <input className="field-input" style={{ flex: '1 1 220px' }} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Nom ou adresse email" />
        <select className="field-input" style={{ flex: '1 1 160px' }} value={role} onChange={(e) => { setRole(e.target.value as AdminUserRole | ''); setPage(1) }}><option value="">Tous les rôles</option>{mode !== 'team' && <option value="student">Étudiants</option>}{mode !== 'team' && <option value="school">Responsables école</option>}<option value="moderator">Modérateurs</option><option value="admin">Administrateurs</option></select>
        <select className="field-input" style={{ flex: '1 1 160px' }} value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1) }}><option value="">Tous les statuts</option><option value="active">Actifs</option><option value="suspended">Suspendus</option></select>
        <button className="btn btn-primary btn-sm" type="submit">Rechercher</button>
      </form>
    </div>

    {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error} <button className="btn btn-ghost btn-sm" onClick={() => void load()}>Réessayer</button></div>}
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Utilisateur</th><th>Rôle</th><th>{mode === 'team' ? 'Accès' : 'Classe / école'}</th><th>Statut</th><th>Inscription</th><th>Action</th></tr></thead><tbody>
      {!loading && data.items.map((user) => <tr key={user.id}><td><strong>{user.firstName} {user.lastName}</strong><br/><span style={{ fontSize: 13 }}>{user.email}</span></td><td>{ROLE_LABEL[user.role]}</td><td>{getUserScopeLabel(user, mode)}</td><td><span style={{ color: user.isActive ? 'var(--ok)' : 'var(--error)', fontWeight: 700 }}>{user.isActive ? 'Actif' : 'Suspendu'}</span>{!user.isActive && user.suspensionReason && <div title={user.suspensionReason} style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.suspensionReason}</div>}</td><td>{new Date(user.createdAt).toLocaleDateString('fr-HT')}</td><td>{user.id === currentUserId ? <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Votre compte</span> : user.isActive ? <button className="btn btn-ghost btn-sm" disabled={saving} style={{ color: 'var(--error)' }} onClick={() => { setSuspending(user); setReason('') }}>Suspendre</button> : <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => void reactivate(user)}>Réactiver</button>}</td></tr>)}
    </tbody></table>{loading && <p style={{ padding: 32, textAlign: 'center' }}>Chargement…</p>}{!loading && data.items.length === 0 && <p style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>Aucun utilisateur ne correspond aux filtres.</p>}</div></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}><span style={{ color: 'var(--ink-3)', fontSize: 13 }}>{data.pagination.total} résultat{data.pagination.total !== 1 ? 's' : ''}</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Précédent</button><span style={{ padding: '7px 4px' }}>{page} / {Math.max(1, data.pagination.totalPages)}</span><button className="btn btn-ghost btn-sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Suivant</button></div></div>

    {suspending && <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 16 }}><form className="card" onSubmit={suspend} style={{ width: '100%', maxWidth: 440 }}><h2 style={{ fontSize: 20, marginBottom: 8 }}>Suspendre ce compte</h2><p style={{ color: 'var(--ink-3)', marginBottom: 14 }}>{suspending.firstName} {suspending.lastName} perdra immédiatement son accès.</p><label className="field-label">Motif de suspension</label><textarea className="field-input" required minLength={5} maxLength={300} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} /><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setSuspending(null)}>Annuler</button><button className="btn btn-primary btn-sm" disabled={saving || reason.trim().length < 5}>Confirmer</button></div></form></div>}
  </div>
}

function RoleCard({ title, text }: { title: string; text: string }) { return <div className="card" style={{ padding: 16 }}><h2 style={{ fontSize: 17, color: 'var(--cobalt)', marginBottom: 6 }}>{title}</h2><p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-3)' }}>{text}</p></div> }
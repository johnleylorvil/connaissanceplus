import { useState, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
}

type FilterKey =
  | 'all'
  | 'unread'
  | 'action'
  | 'arena'
  | 'challenge'
  | 'correspondence'
  | 'certification'
  | 'system'

type Priority = 'critical' | 'important' | 'normal' | 'low'
type DensityMode = 'comfort' | 'compact'

interface CategoryMeta {
  label: string
  icon: string
  color: string
  bgColor: string
}

// ── Category config ────────────────────────────────────────────────────────

const CATEGORY: Record<string, CategoryMeta> = {
  arena:          { label: 'Arena',          icon: '🏟',  color: '#1B4FD8', bgColor: '#EEF2FF' },
  challenge:      { label: 'Challenge',      icon: '⚡',  color: '#B0791A', bgColor: '#FEF3C7' },
  correspondence: { label: 'Correspondance', icon: '✉',  color: '#0F766E', bgColor: '#ECFDF5' },
  certification:  { label: 'Certification',  icon: '🎓',  color: '#7C3AED', bgColor: '#F5F3FF' },
  reward:         { label: 'Récompense',     icon: '🏆',  color: '#B0791A', bgColor: '#FEF3C7' },
  system:         { label: 'Système',        icon: 'ℹ',   color: '#374151', bgColor: '#F3F4F6' },
  info:           { label: 'Info',           icon: 'ℹ',   color: '#374151', bgColor: '#F3F4F6' },
}

const FALLBACK_CATEGORY: CategoryMeta = {
  label: 'Info',
  icon: '📌',
  color: '#756C61',
  bgColor: '#F4EEE3',
}

function getCategoryMeta(type: string): CategoryMeta {
  return CATEGORY[type?.toLowerCase()] ?? FALLBACK_CATEGORY
}

// ── Priority ──────────────────────────────────────────────────────────────

function getPriority(type: string): Priority {
  const t = type?.toLowerCase()
  if (t === 'arena')                                   return 'critical'
  if (t === 'challenge' || t === 'certification' || t === 'reward') return 'important'
  if (t === 'correspondence')                          return 'normal'
  return 'low'
}

function getPriorityScore(priority: Priority, isRead: boolean): number {
  const base: Record<Priority, number> = { critical: 100, important: 70, normal: 40, low: 10 }
  return base[priority] - (isRead ? 5 : 0)
}

interface PriorityDisplay {
  label: string
  color: string
  bg: string
}

const PRIORITY_META: Record<Priority, PriorityDisplay> = {
  critical:  { label: 'Urgent',    color: '#991B1B', bg: '#FEF2F2' },
  important: { label: 'Important', color: '#92400E', bg: '#FFFBEB' },
  normal:    { label: '',          color: '',        bg: '' },
  low:       { label: '',          color: '',        bg: '' },
}

// ── Time helpers ───────────────────────────────────────────────────────────

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60_000)     return "À l'instant"
  if (diff < 3_600_000)  return `Il y a ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `Il y a ${Math.floor(diff / 3_600_000)} h`
  if (diff < 172_800_000) return 'Hier'
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function getTimeGroup(dateStr: string): 'today' | 'week' | 'older' {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 86_400_000)   return 'today'
  if (diff < 604_800_000)  return 'week'
  return 'older'
}

const GROUP_LABELS: Record<string, string> = {
  today: "Aujourd'hui",
  week:  'Cette semaine',
  older: 'Plus anciennes',
}

// ── Contextual actions ─────────────────────────────────────────────────────

interface NotifAction {
  label: string
  variant: 'primary' | 'ghost'
  tab: string
}

function getActions(type: string): NotifAction[] {
  const t = type?.toLowerCase()
  if (t === 'arena')
    return [
      { label: 'Voir le match',       variant: 'primary', tab: 'arena' },
      { label: 'Confirmer présence',  variant: 'ghost',   tab: 'arena' },
    ]
  if (t === 'challenge')
    return [
      { label: 'Voir les résultats',  variant: 'primary', tab: 'quiz' },
      { label: 'Rejouer',             variant: 'ghost',   tab: 'quiz' },
    ]
  if (t === 'correspondence')
    return [{ label: 'Ouvrir',        variant: 'primary', tab: 'correspondence' }]
  if (t === 'certification')
    return [{ label: 'Voir la certification', variant: 'primary', tab: 'home' }]
  if (t === 'reward')
    return [{ label: 'Voir ma récompense',    variant: 'primary', tab: 'home' }]
  return [{ label: 'Voir les détails',        variant: 'ghost',   tab: 'home' }]
}

// ── Filter config ──────────────────────────────────────────────────────────

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',            label: 'Toutes' },
  { key: 'unread',         label: 'Non lues' },
  { key: 'action',         label: 'Action requise' },
  { key: 'arena',          label: 'Arena' },
  { key: 'challenge',      label: 'Challenge' },
  { key: 'correspondence', label: 'Correspondance' },
  { key: 'certification',  label: 'Certification' },
  { key: 'system',         label: 'Système' },
]

// ── Main component ─────────────────────────────────────────────────────────

interface NotificationCenterProps {
  notifications: NotificationItem[]
  onMarkAllRead: () => void
  onMarkOneRead: (id: string) => void
  onDelete: (id: string) => void
  onNavigate: (tab: string) => void
  error: string
}

export default function NotificationCenter({
  notifications,
  onMarkAllRead,
  onMarkOneRead,
  onDelete,
  onNavigate,
  error,
}: NotificationCenterProps) {
  const [filter, setFilter]   = useState<FilterKey>('all')
  const [density, setDensity] = useState<DensityMode>('comfort')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const unreadCount = notifications.filter((n) => !n.isRead).length

  // ── Derived list: filter + sort ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...notifications]
    if (filter === 'unread')
      list = list.filter((n) => !n.isRead)
    else if (filter === 'action')
      list = list.filter((n) => {
        const p = getPriority(n.type)
        return p === 'critical' || p === 'important'
      })
    else if (filter !== 'all')
      list = list.filter((n) => n.type?.toLowerCase() === filter)

    list.sort(
      (a, b) =>
        getPriorityScore(getPriority(b.type), b.isRead) -
        getPriorityScore(getPriority(a.type), a.isRead),
    )
    return list
  }, [notifications, filter])

  // ── Temporal grouping ────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const groups: Record<'today' | 'week' | 'older', NotificationItem[]> = {
      today: [],
      week: [],
      older: [],
    }
    filtered.forEach((n) => groups[getTimeGroup(n.createdAt)].push(n))
    return groups
  }, [filtered])

  const handleExpand = (n: NotificationItem) => {
    if (expandedId === n.id) {
      setExpandedId(null)
    } else {
      setExpandedId(n.id)
      if (!n.isRead) onMarkOneRead(n.id)
    }
  }

  // ── Smart summary data ───────────────────────────────────────────────────
  const todayCount  = grouped.today.length
  const arenaUnread = notifications.filter(
    (n) => n.type?.toLowerCase() === 'arena' && !n.isRead,
  )
  const certItems = notifications.filter(
    (n) => n.type?.toLowerCase() === 'certification',
  )
  const actionCount = notifications.filter((n) => {
    const p = getPriority(n.type)
    return p === 'critical' || p === 'important'
  }).length

  // ── Badge counts for filter chips ────────────────────────────────────────
  const chipCount = (key: FilterKey): number => {
    if (key === 'all')     return notifications.length
    if (key === 'unread')  return unreadCount
    if (key === 'action')  return actionCount
    return notifications.filter((n) => n.type?.toLowerCase() === key).length
  }

  return (
    <div className="nc-root">

      {/* ━━━━ Header ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="nc-header">
        <div className="nc-header-left">
          <h1 className="display nc-title">
            Notifications
            {unreadCount > 0 && (
              <span className="nc-unread-pill">{unreadCount}</span>
            )}
          </h1>
          <p className="nc-subtitle">
            {unreadCount > 0
              ? `${unreadCount} non lue${unreadCount !== 1 ? 's' : ''} · ${notifications.length} au total`
              : `${notifications.length} notification${notifications.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="nc-header-actions">
          <button
            className="nc-density-toggle"
            onClick={() => setDensity((d) => (d === 'comfort' ? 'compact' : 'comfort'))}
            title={density === 'comfort' ? 'Passer en vue compacte' : 'Passer en vue confort'}
          >
            {density === 'comfort' ? '⊟ Compact' : '⊞ Confort'}
          </button>
          {unreadCount > 0 && (
            <button onClick={onMarkAllRead} className="btn btn-ghost btn-sm">
              ✓ Tout marquer comme lu
            </button>
          )}
        </div>
      </div>

      {/* ━━━━ Filter chips ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="nc-filter-bar">
        {FILTERS.map(({ key, label }) => {
          const count = chipCount(key)
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`nc-chip${filter === key ? ' nc-chip-active' : ''}`}
            >
              {label}
              {count > 0 && (
                <span className="nc-chip-count">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ━━━━ Body ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="nc-body">

        {/* ── Main list ── */}
        <div className="nc-list-panel">
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="nc-empty-state">
              <div className="nc-empty-icon">🔔</div>
              <p className="nc-empty-title">Aucune notification</p>
              <p className="nc-empty-sub">
                {filter === 'all'
                  ? "Vous êtes à jour ! Revenez bientôt."
                  : "Aucun résultat pour ce filtre."}
              </p>
            </div>
          ) : (
            <div className="nc-groups">
              {(['today', 'week', 'older'] as const).map((gKey) => {
                const items = grouped[gKey]
                if (!items.length) return null
                return (
                  <div key={gKey} className="nc-group">
                    <div className="nc-group-label">{GROUP_LABELS[gKey]}</div>
                    <div className="nc-cards">
                      {items.map((n) => (
                        <NotifCard
                          key={n.id}
                          notification={n}
                          density={density}
                          expanded={expandedId === n.id}
                          onExpand={() => handleExpand(n)}
                          onDelete={() => onDelete(n.id)}
                          onNavigate={onNavigate}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Smart Summary sidebar (desktop only) ── */}
        <aside className="nc-summary-rail">

          {/* Stats block */}
          <div className="nc-summary-card">
            <p className="nc-summary-heading">Résumé</p>
            <div className="nc-summary-stats">
              <div className="nc-summary-stat">
                <span className="nc-summary-num">{todayCount}</span>
                <span className="nc-summary-lbl">aujourd'hui</span>
              </div>
              <div className="nc-summary-stat">
                <span className="nc-summary-num" style={{ color: unreadCount > 0 ? 'var(--cobalt)' : 'inherit' }}>
                  {unreadCount}
                </span>
                <span className="nc-summary-lbl">non lues</span>
              </div>
              <div className="nc-summary-stat">
                <span className="nc-summary-num" style={{ color: actionCount > 0 ? '#991B1B' : 'inherit' }}>
                  {actionCount}
                </span>
                <span className="nc-summary-lbl">à traiter</span>
              </div>
            </div>
          </div>

          {/* Arena alert */}
          {arenaUnread.length > 0 && (
            <div className="nc-summary-card nc-summary-card-alert">
              <p className="nc-summary-heading">🏟 Arena</p>
              <p className="nc-summary-text">
                {arenaUnread.length} match{arenaUnread.length > 1 ? 's' : ''} en attente
              </p>
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: 10, width: '100%' }}
                onClick={() => onNavigate('arena')}
              >
                Aller à l'Arena
              </button>
            </div>
          )}

          {/* Certifications */}
          {certItems.length > 0 && (
            <div className="nc-summary-card">
              <p className="nc-summary-heading">🎓 Certifications</p>
              <p className="nc-summary-text">
                {certItems.length} certification{certItems.length > 1 ? 's' : ''} reçue{certItems.length > 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Quick settings */}
          <div className="nc-summary-card">
            <p className="nc-summary-heading">Préférences</p>
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start', gap: 8, marginBottom: 6 }}
            >
              ⚙ Paramètres
            </button>
          </div>

        </aside>
      </div>
    </div>
  )
}

// ── Notification Card ──────────────────────────────────────────────────────

interface NotifCardProps {
  notification: NotificationItem
  density: DensityMode
  expanded: boolean
  onExpand: () => void
  onDelete: () => void
  onNavigate: (tab: string) => void
}

function NotifCard({
  notification: n,
  density,
  expanded,
  onExpand,
  onDelete,
  onNavigate,
}: NotifCardProps) {
  const cat      = getCategoryMeta(n.type)
  const priority = getPriority(n.type)
  const pMeta    = PRIORITY_META[priority]
  const actions  = getActions(n.type)
  const compact  = density === 'compact'

  return (
    <div
      className={[
        'nc-card',
        !n.isRead   ? 'nc-card-unread'   : '',
        expanded    ? 'nc-card-expanded' : '',
        compact     ? 'nc-card-compact'  : '',
      ].filter(Boolean).join(' ')}
      onClick={onExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onExpand() }}
    >
      {/* Unread accent bar */}
      {!n.isRead && (
        <div className="nc-card-accent" style={{ background: cat.color }} />
      )}

      <div className="nc-card-inner">
        {/* Category icon */}
        <div
          className="nc-card-icon"
          style={{ background: cat.bgColor, color: cat.color }}
          aria-hidden="true"
        >
          {cat.icon}
        </div>

        {/* Main content */}
        <div className="nc-card-content">

          {/* Row 1: badges + time + unread dot */}
          <div className="nc-card-meta">
            <span
              className="nc-cat-badge"
              style={{ color: cat.color, background: cat.bgColor, borderColor: cat.color + '33' }}
            >
              {cat.label}
            </span>
            {priority !== 'low' && pMeta.label && (
              <span
                className="nc-priority-badge"
                style={{ color: pMeta.color, background: pMeta.bg }}
              >
                {pMeta.label}
              </span>
            )}
            <span className="nc-card-time">{getRelativeTime(n.createdAt)}</span>
            {!n.isRead && (
              <span
                className="nc-unread-dot"
                style={{ background: cat.color }}
                aria-label="Non lue"
              />
            )}
          </div>

          {/* Row 2: title */}
          <p className={`nc-card-title${!n.isRead ? ' nc-card-title-bold' : ''}`}>
            {n.title}
          </p>

          {/* Row 3: summary (hidden in compact unless expanded) */}
          {!compact && (
            <p className="nc-card-summary">{n.message}</p>
          )}

          {/* Expanded body */}
          {expanded && (
            <div
              className="nc-card-expanded-body"
              onClick={(e) => e.stopPropagation()}
            >
              {compact && (
                <p className="nc-card-full-msg">{n.message}</p>
              )}
              <p className="nc-card-full-date">
                {new Date(n.createdAt).toLocaleString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>

              <div className="nc-card-actions">
                {actions.map((a) => (
                  <button
                    key={a.label}
                    className={`btn btn-sm ${a.variant === 'primary' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNavigate(a.tab)
                    }}
                  >
                    {a.label}
                  </button>
                ))}
                <button
                  className="btn btn-sm btn-danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

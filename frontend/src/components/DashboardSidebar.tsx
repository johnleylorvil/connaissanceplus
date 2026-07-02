import type { ReactNode } from 'react'

export type DashboardSidebarNode = {
  id: string
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  muted?: boolean
  badge?: ReactNode
  icon?: ReactNode
  children?: DashboardSidebarNode[]
}

export type DashboardSidebarSection = {
  title: string
  note?: string
  items: DashboardSidebarNode[]
}

type DashboardSidebarProps = {
  portalLabel: string
  identityLabel: string
  identityCaption?: string
  identityMeta?: string
  avatarText?: string
  avatarUrl?: string | null
  sections: DashboardSidebarSection[]
  onLogout: () => void
  logoutLabel: string
  footerNote?: string
}

function SidebarNode({ node, depth = 0 }: { node: DashboardSidebarNode; depth?: number }) {
  const hasChildren = Boolean(node.children?.length)

  return (
    <div className="sidebar-node" data-depth={depth}>
      <button
        type="button"
        disabled={node.disabled || !node.onClick}
        onClick={node.onClick}
        className={`sidebar-item${node.active ? ' active' : ''}${node.muted ? ' muted' : ''}${node.disabled ? ' disabled' : ''}`}
        style={{ paddingInlineStart: 12 + depth * 16 }}
      >
        {node.icon ? <span className="sidebar-item-icon">{node.icon}</span> : null}
        <span className="sidebar-item-label">{node.label}</span>
        {node.badge ? <span className="sidebar-item-badge">{node.badge}</span> : null}
        {hasChildren && <span className="sidebar-item-caret">›</span>}
      </button>

      {hasChildren && (
        <div className="sidebar-node-children">
          {node.children?.map((child) => <SidebarNode key={child.id} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}

export default function DashboardSidebar({
  portalLabel,
  identityLabel,
  identityCaption,
  identityMeta,
  avatarText,
  avatarUrl,
  sections,
  onLogout,
  logoutLabel,
  footerNote,
}: DashboardSidebarProps) {
  return (
    <aside className="dashboard-sidebar hidden md:flex flex-col">
      <div className="dashboard-sidebar-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <span className="brand" style={{ fontSize: 17, color: 'var(--cobalt)' }}>Konesans</span>
          <span className="brand" style={{ fontSize: 17, color: 'var(--gold)' }}>+</span>
        </div>
        <p className="dashboard-sidebar-caption">{portalLabel}</p>
      </div>

      <div className="dashboard-sidebar-identity">
        {avatarUrl ? (
          <img className="dashboard-sidebar-avatar" src={avatarUrl} alt="" />
        ) : avatarText ? (
          <div className="dashboard-sidebar-avatar">{avatarText}</div>
        ) : null}
        <div style={{ minWidth: 0 }}>
          <p className="dashboard-sidebar-title">{identityLabel}</p>
          {identityCaption ? <p className="dashboard-sidebar-subtitle">{identityCaption}</p> : null}
          {identityMeta ? <p className="dashboard-sidebar-meta">{identityMeta}</p> : null}
        </div>
      </div>

      <nav className="dashboard-sidebar-nav">
        {sections.map((section) => (
          <details key={section.title} className="sidebar-section" open>
            <summary className="sidebar-section-summary">
              <span>{section.title}</span>
              {section.note ? <span className="sidebar-section-note">{section.note}</span> : null}
            </summary>
            <div className="sidebar-section-body">
              {section.items.map((item) => <SidebarNode key={item.id} node={item} />)}
            </div>
          </details>
        ))}
      </nav>

      <div className="dashboard-sidebar-footer">
        {footerNote ? <p className="dashboard-sidebar-footer-note">{footerNote}</p> : null}
        <button onClick={onLogout} className="sidebar-item sidebar-logout">
          {logoutLabel}
        </button>
      </div>
    </aside>
  )
}





import { useState } from 'react'

/**
 * Reusable collapsible sidebar
 * Props:
 *   tabs: [{ key, icon, label, badge? }]
 *   activeTab: string
 *   onTabChange: (key) => void
 *   title: string
 *   subtitle?: string
 */
export default function Sidebar({ tabs, activeTab, onTabChange, title, subtitle }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-title-block">
            <div className="sidebar-subtitle">{subtitle || 'AgroMitra'}</div>
            <div className="sidebar-title">{title}</div>
          </div>
        )}
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Nav items */}
      <nav className="sidebar-nav">
        {tabs.map(({ key, icon, label, badge }) => (
          <button
            key={key}
            className={`sidebar-item ${activeTab === key ? 'sidebar-item-active' : ''}`}
            onClick={() => onTabChange(key)}
            title={collapsed ? label : undefined}
          >
            <span className="sidebar-icon">{icon}</span>
            {!collapsed && (
              <span className="sidebar-label">
                {label}
                {badge != null && badge !== '' && (
                  <span className="sidebar-badge">{badge}</span>
                )}
              </span>
            )}
            {collapsed && badge != null && badge !== '' && (
              <span className="sidebar-badge-dot" />
            )}
          </button>
        ))}
      </nav>
    </aside>
  )
}

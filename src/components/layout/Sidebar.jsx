import React from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { useStore } from '../../store/index.js'

const NAV_ITEMS = [
  { path: 'dashboard',     icon: '📊', label: 'Dashboard' },
  { path: 'tareas',        icon: '✅', label: 'Tareas' },
  { path: 'objetivos',     icon: '🎯', label: 'Objetivos' },
  { path: 'kpis',          icon: '📈', label: 'KPIs' },
  { path: 'reuniones',     icon: '🤝', label: 'Reuniones' },
  { path: 'problemas',     icon: '🔧', label: 'Problemas' },
  { path: 'ideas',         icon: '💡', label: 'Ideas' },
  { path: 'bitacora',      icon: '📚', label: 'Bitácora' },
  { path: 'configuracion', icon: '⚙️', label: 'Config' }
]

export default function Sidebar({ collapsed, tareasVencidas = 0 }) {
  const { slug } = useParams()

  return (
    <aside style={{
      width: collapsed ? 56 : 'var(--sidebar-w)',
      minWidth: collapsed ? 56 : 'var(--sidebar-w)',
      background: 'var(--bg-card)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      transition: 'width 0.2s, min-width 0.2s',
      overflow: 'hidden'
    }}>
      {/* Logo */}
      <div style={{
        height: 'var(--header-h)',
        display: 'flex',
        alignItems: 'center',
        padding: collapsed ? '0 16px' : '0 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0
      }}>
        <span style={{ fontSize: 20 }}>🏭</span>
        {!collapsed && (
          <span style={{
            marginLeft: 10,
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--accent)',
            letterSpacing: '-0.3px'
          }}>Business OS</span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={`/${slug}/${item.path}`}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: collapsed ? '10px 16px' : '9px 16px',
              color: isActive ? 'var(--accent)' : 'var(--text-2)',
              background: isActive ? 'rgba(0,212,255,0.08)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize: 13,
              transition: 'all 0.15s',
              position: 'relative',
              textDecoration: 'none'
            })}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && (
              <span style={{ flex: 1 }}>{item.label}</span>
            )}
            {item.path === 'tareas' && tareasVencidas > 0 && (
              <span style={{
                background: 'var(--danger)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 10,
                minWidth: 16,
                textAlign: 'center'
              }}>{tareasVencidas > 99 ? '99+' : tareasVencidas}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom info */}
      {!collapsed && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-3)'
        }}>
          Business OS v0.1
        </div>
      )}
    </aside>
  )
}

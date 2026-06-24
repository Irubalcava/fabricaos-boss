import React from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { useStore } from '../../store/index.js'

const NAV_PRIMARY = [
  { path: 'dashboard', label: 'Dashboard', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { path: 'tareas',    label: 'Tareas',    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>, badge: true },
  { path: 'objetivos', label: 'Objetivos', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
  { path: 'kpis',      label: 'KPIs',      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
]

const NAV_SECONDARY = [
  { path: 'reuniones', label: 'Reuniones', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
  { path: 'problemas', label: 'Problemas', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  { path: 'ideas',     label: 'Ideas',     icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/></svg> },
]

const NAV_UTILITY = [
  { path: 'bitacora',      label: 'Bitácora', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
  { path: 'configuracion', label: 'Config',   icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg> },
]

function NavItem({ item, slug, collapsed, tareasVencidas }) {
  return (
    <NavLink
      to={`/${slug}/${item.path}`}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '9px 16px' : '8px 14px',
        color: isActive ? 'var(--accent)' : 'var(--text-2)',
        background: isActive ? 'var(--accent)10' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        fontWeight: isActive ? 600 : 400,
        fontSize: 13,
        transition: 'all 0.12s',
        position: 'relative',
        textDecoration: 'none',
        borderRadius: '0 8px 8px 0',
        margin: '1px 0',
      })}
      onMouseEnter={e => { if (!e.currentTarget.style.borderLeftColor.includes('accent')) e.currentTarget.style.background = 'var(--bg-input)' }}
      onMouseLeave={e => { if (!e.currentTarget.style.borderLeftColor.includes('accent')) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
      {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
      {item.badge && tareasVencidas > 0 && (
        <span style={{ background: 'var(--danger)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, minWidth: 16, textAlign: 'center' }}>
          {tareasVencidas > 99 ? '99+' : tareasVencidas}
        </span>
      )}
    </NavLink>
  )
}

function Divider({ label, collapsed }) {
  if (collapsed) return <div style={{ height: 1, background: 'var(--border)', margin: '6px 12px' }} />
  return (
    <div style={{ padding: '10px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 1 }}>
      {label}
    </div>
  )
}

export default function Sidebar({ collapsed, tareasVencidas = 0 }) {
  const { slug } = useParams()
  const { workspace, miembro, miembros } = useStore()

  const miNombre = (() => {
    const yo = miembros?.find(m => m.profile_id === miembro?.profile_id)
    return yo?.profiles?.nombre || yo?.nombre || null
  })()

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
      {/* Logo / Workspace */}
      <div style={{
        height: 'var(--header-h)',
        display: 'flex', alignItems: 'center',
        padding: '0 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0, gap: 10
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent-2), var(--accent))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: -0.5
        }}>
          {(workspace?.nombre || 'B').charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-1)', letterSpacing: '-0.3px', lineHeight: 1.2 }} className="truncate">
              {workspace?.nombre || 'Business OS'}
            </div>
            {miNombre && (
              <div style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.3 }} className="truncate">
                {miNombre}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingTop: 8, overflowY: 'auto' }}>
        {/* Primario */}
        {NAV_PRIMARY.map(item => (
          <NavItem key={item.path} item={item} slug={slug} collapsed={collapsed} tareasVencidas={tareasVencidas} />
        ))}

        {/* Operación */}
        <Divider label="Operación" collapsed={collapsed} />
        {NAV_SECONDARY.map(item => (
          <NavItem key={item.path} item={item} slug={slug} collapsed={collapsed} tareasVencidas={tareasVencidas} />
        ))}

        {/* Utilidad */}
        <Divider label="Sistema" collapsed={collapsed} />
        {NAV_UTILITY.map(item => (
          <NavItem key={item.path} item={item} slug={slug} collapsed={collapsed} tareasVencidas={tareasVencidas} />
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-4)' }}>
          Business OS v0.1
        </div>
      )}
    </aside>
  )
}

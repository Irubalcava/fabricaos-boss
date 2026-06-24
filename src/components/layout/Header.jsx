import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('boss-theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('boss-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  return { theme, toggle }
}

export default function Header({ onToggleSidebar, onQuickAction }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { workspace, user, notificacionesNoLeidas, miembro } = useStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotif, setShowNotif] = useState(false)
  const { theme, toggle: toggleTheme } = useTheme()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    toast.info('Sesión cerrada')
    navigate('/login')
  }

  const initials = (user?.email || 'U').slice(0, 2).toUpperCase()
  const rolLabel = { owner: 'Owner', admin: 'Admin', miembro: 'Miembro', viewer: 'Viewer' }

  return (
    <header style={{
      height: 'var(--header-h)',
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 12,
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="btn btn-ghost"
        style={{ padding: '6px 8px', fontSize: 16 }}
      >☰</button>

      {/* Workspace name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        {workspace?.logo_url ? (
          <img src={workspace.logo_url} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'linear-gradient(135deg, var(--accent-2), var(--accent))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff'
          }}>
            {(workspace?.nombre || 'B').charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)', lineHeight: 1.2 }}>
            {workspace?.nombre || 'Workspace'}
          </div>
          {miembro?.boss_rol && (
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
              {rolLabel[miembro.boss_rol] || miembro.boss_rol}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { label: '+ Tarea', action: 'tarea', color: 'var(--accent)' },
          { label: '+ Problema', action: 'problema', color: 'var(--danger)' },
          { label: '+ Idea', action: 'idea', color: 'var(--warning)' },
          { label: '+ Decisión', action: 'decision', color: 'var(--accent-2)' }
        ].map(btn => (
          <button
            key={btn.action}
            onClick={() => onQuickAction?.(btn.action)}
            style={{
              padding: '4px 10px',
              background: 'var(--bg-input)',
              border: `1px solid ${btn.color}22`,
              borderRadius: 6,
              color: btn.color,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={e => e.currentTarget.style.background = `${btn.color}15`}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-input)'}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-2)',
          borderRadius: 6,
          padding: '5px 8px',
          fontSize: 15,
          cursor: 'pointer',
          color: 'var(--text-2)',
          transition: 'all 0.15s',
          lineHeight: 1
        }}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      {/* Notificaciones */}
      <button
        onClick={() => setShowNotif(v => !v)}
        style={{
          position: 'relative',
          background: 'none', border: 'none',
          fontSize: 18, cursor: 'pointer', color: 'var(--text-2)',
          padding: '4px 6px'
        }}
      >
        🔔
        {notificacionesNoLeidas > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            background: 'var(--danger)',
            color: '#fff', fontSize: 9, fontWeight: 700,
            width: 16, height: 16, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>{notificacionesNoLeidas > 9 ? '9+' : notificacionesNoLeidas}</span>
        )}
      </button>

      {/* Avatar / User menu */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowUserMenu(v => !v)}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent-2), var(--accent))',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 12
          }}
        >
          {initials}
        </button>

        {showUserMenu && (
          <div style={{
            position: 'absolute', right: 0, top: 40,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-2)',
            borderRadius: 8,
            minWidth: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 200,
            overflow: 'hidden'
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{user?.email}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {rolLabel[miembro?.boss_rol] || 'Colaborador'}
              </div>
            </div>
            <button
              onClick={toggleTheme}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', textAlign: 'left',
                padding: '10px 16px', background: 'none', border: 'none',
                color: 'var(--text-2)', fontSize: 13, cursor: 'pointer'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
              {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            </button>
            <button
              onClick={() => { navigate(`/${slug}/configuracion`); setShowUserMenu(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px', background: 'none', border: 'none',
                color: 'var(--text-2)', fontSize: 13, cursor: 'pointer'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >⚙️ Configuración</button>
            <button
              onClick={() => { navigate('/select'); setShowUserMenu(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px', background: 'none', border: 'none',
                color: 'var(--text-2)', fontSize: 13, cursor: 'pointer'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >🏭 Cambiar workspace</button>
            <button
              onClick={handleLogout}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px', background: 'none', border: 'none',
                color: 'var(--danger)', fontSize: 13, cursor: 'pointer',
                borderTop: '1px solid var(--border)'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >↪ Cerrar sesión</button>
          </div>
        )}
      </div>
    </header>
  )
}

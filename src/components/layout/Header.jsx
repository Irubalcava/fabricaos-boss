import React, { useState, useEffect, useRef } from 'react'
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

const QUICK_ACTIONS = [
  { label: 'Tarea',    action: 'tarea',    icon: '✅', color: '#00d4ff', desc: 'Nueva tarea pendiente' },
  { label: 'Problema', action: 'problema', icon: '⚡', color: '#ef4444', desc: 'Registrar un bloqueador' },
  { label: 'Idea',     action: 'idea',     icon: '💡', color: '#f59e0b', desc: 'Capturar una oportunidad' },
  { label: 'Decisión', action: 'decision', icon: '📋', color: '#6366f1', desc: 'Documentar una decisión' },
]

export default function Header({ onToggleSidebar, onQuickAction }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { workspace, user, notificacionesNoLeidas, miembro } = useStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showPlus, setShowPlus] = useState(false)
  const { theme, toggle: toggleTheme } = useTheme()
  const plusRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (plusRef.current && !plusRef.current.contains(e.target)) setShowPlus(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    toast.info('Sesión cerrada')
    navigate('/login')
  }

  const rolLabel = { owner: 'Owner', admin: 'Admin', miembro: 'Miembro', viewer: 'Viewer' }
  const initials = (user?.email || 'U').slice(0, 2).toUpperCase()

  return (
    <header style={{
      height: 'var(--header-h)',
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 10,
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Sidebar toggle */}
      <button onClick={onToggleSidebar} className="btn btn-ghost" style={{ padding: '6px 8px', fontSize: 16 }}>☰</button>

      {/* Workspace */}
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
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', lineHeight: 1.2 }}>
            {workspace?.nombre || 'Workspace'}
          </div>
          {miembro?.boss_rol && (
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
              {rolLabel[miembro.boss_rol] || miembro.boss_rol}
            </div>
          )}
        </div>
      </div>

      {/* Botón "+" unificado */}
      <div ref={plusRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowPlus(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px',
            background: showPlus ? 'var(--accent)' : 'var(--accent)18',
            border: '1px solid var(--accent)44',
            borderRadius: 8,
            color: showPlus ? '#fff' : 'var(--accent)',
            fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          <span>Crear</span>
        </button>

        {showPlus && (
          <div style={{
            position: 'absolute', right: 0, top: 44,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-2)',
            borderRadius: 10,
            minWidth: 220,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            zIndex: 300,
            overflow: 'hidden',
            padding: 6,
          }}>
            {QUICK_ACTIONS.map(btn => (
              <button key={btn.action}
                onClick={() => { onQuickAction?.(btn.action); setShowPlus(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '10px 12px',
                  background: 'none', border: 'none',
                  borderRadius: 7,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.1s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-input)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: btn.color + '18',
                  border: `1px solid ${btn.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15
                }}>{btn.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{btn.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{btn.desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Theme toggle */}
      <button onClick={toggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '5px 8px', fontSize: 15, cursor: 'pointer', color: 'var(--text-2)', lineHeight: 1 }}>
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      {/* Notificaciones */}
      <button style={{ position: 'relative', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-2)', padding: '4px 6px' }}>
        🔔
        {notificacionesNoLeidas > 0 && (
          <span style={{ position: 'absolute', top: 0, right: 0, background: 'var(--danger)', color: '#fff', fontSize: 9, fontWeight: 700, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {notificacionesNoLeidas > 9 ? '9+' : notificacionesNoLeidas}
          </span>
        )}
      </button>

      {/* Avatar */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowUserMenu(v => !v)}
          style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-2), var(--accent))', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>
          {initials}
        </button>

        {showUserMenu && (
          <div style={{ position: 'absolute', right: 0, top: 40, background: 'var(--bg-card)', border: '1px solid var(--border-2)', borderRadius: 8, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 200, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{user?.email}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{rolLabel[miembro?.boss_rol] || 'Colaborador'}</div>
            </div>
            {[
              { icon: theme === 'dark' ? '☀️' : '🌙', label: theme === 'dark' ? 'Modo claro' : 'Modo oscuro', fn: () => { toggleTheme(); setShowUserMenu(false) } },
              { icon: '⚙️', label: 'Configuración', fn: () => { navigate(`/${slug}/configuracion`); setShowUserMenu(false) } },
              { icon: '🏭', label: 'Cambiar workspace', fn: () => { navigate('/select'); setShowUserMenu(false) } },
            ].map(item => (
              <button key={item.label} onClick={item.fn}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                {item.icon} {item.label}
              </button>
            ))}
            <button onClick={handleLogout}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--danger)', fontSize: 13, cursor: 'pointer', borderTop: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              ↪ Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useStore } from '../../store/index.js'
import { toast } from '../ui/Toast.jsx'

const ROL_LABELS = { owner: 'Owner', admin: 'Admin', miembro: 'Miembro', viewer: 'Viewer' }

export default function WorkspaceSelect() {
  const navigate = useNavigate()
  const { user, setUser } = useStore()
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadWorkspaces()
  }, [])

  async function loadWorkspaces() {
    try {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) { navigate('/login'); return }
      setUser(u)

      const { data } = await supabase
        .from('colaboradores')
        .select('boss_rol, fabricas:fabrica_id(id, nombre, slug, giro, logo_url)')
        .eq('profile_id', u.id)
        .not('boss_rol', 'is', null)
        .neq('activo', false)

      setWorkspaces((data || []).filter(m => m.fabricas))
    } catch (err) {
      toast.error('Error cargando workspaces')
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (slug) => {
    navigate(`/${slug}/dashboard`)
  }

  const GIRO_ICONS = {
    restaurante: '🍽️', fábrica: '🏭', tienda: '🛍️', florería: '🌸',
    consultora: '💼', agencia: '🎯', farmacia: '💊', clínica: '🏥', otro: '🏢'
  }

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)'
      }}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    )
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,212,255,0.05), transparent)'
    }}>
      <div style={{ maxWidth: 680, width: '100%', padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>
            Selecciona tu workspace
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 6 }}>
            Tienes acceso a {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}
          </p>
        </div>

        {workspaces.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🏭</div>
            <p>No tienes acceso a ningún workspace</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => navigate('/onboarding')}
            >Crear workspace</button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 16
          }}>
            {workspaces.map(({ boss_rol, fabricas: fab }) => (
              <button
                key={fab.id}
                onClick={() => handleSelect(fab.slug)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-2)',
                  borderRadius: 12,
                  padding: 20,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)20'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-2)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 10,
                  background: 'linear-gradient(135deg, var(--accent-2), var(--accent))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22
                }}>
                  {fab.logo_url
                    ? <img src={fab.logo_url} alt="" style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'cover' }} />
                    : (GIRO_ICONS[fab.giro] || '🏢')
                  }
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{fab.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{fab.giro}</div>
                </div>
                <span className={`badge badge-${boss_rol === 'owner' ? 'blue' : boss_rol === 'admin' ? 'purple' : 'gray'}`}>
                  {ROL_LABELS[boss_rol] || boss_rol}
                </span>
              </button>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            className="btn btn-ghost"
            onClick={() => navigate('/onboarding')}
          >+ Crear nuevo workspace</button>
        </div>
      </div>
    </div>
  )
}

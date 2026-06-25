import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useStore } from '../../store/index.js'
import { toast } from '../ui/Toast.jsx'

const ROL_LABELS = { owner: 'Owner', admin: 'Admin', miembro: 'Miembro', viewer: 'Viewer' }

const GIRO_ICONS = {
  restaurante: '🍽️', fábrica: '🏭', tienda: '🛍️', florería: '🌸',
  consultora: '💼', agencia: '🎯', farmacia: '💊', clínica: '🏥', otro: '🏢'
}

export default function WorkspaceSelect() {
  const navigate = useNavigate()
  const { user, setUser } = useStore()
  const [workspaces,   setWorkspaces]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [activating,   setActivating]   = useState(null)   // fabrica_id en checkout
  const [waitingFor,   setWaitingFor]   = useState(null)   // fabrica_id esperando webhook
  const [upgradeHint,  setUpgradeHint]  = useState(null)   // fabrica_id que intentó entrar sin Boss

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('boss_checkout') === 'success') {
      toast.info('Procesando activación... esto toma unos segundos.')
      // Limpiar la URL sin recargar
      window.history.replaceState({}, '', window.location.pathname)
      // Guardar el fabrica_id que está esperando activación en sessionStorage
      const pendingId = sessionStorage.getItem('boss_checkout_fabrica')
      if (pendingId) setWaitingFor(pendingId)
    }
    if (params.get('boss_checkout') === 'canceled') {
      toast.error('Proceso de pago cancelado.')
      window.history.replaceState({}, '', window.location.pathname)
    }
    // Hint desde Shell cuando boss_is_active = false al intentar entrar
    const hint = sessionStorage.getItem('boss_upgrade_hint')
    if (hint) {
      sessionStorage.removeItem('boss_upgrade_hint')
      setUpgradeHint(hint)
    }
    loadWorkspaces()
  }, [])

  // Polling para detectar cuando el webhook activa boss_is_active
  useEffect(() => {
    if (!waitingFor) return
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('fabricas')
        .select('boss_is_active, slug')
        .eq('id', waitingFor)
        .single()
      if (data?.boss_is_active) {
        clearInterval(interval)
        sessionStorage.removeItem('boss_checkout_fabrica')
        setWaitingFor(null)
        toast.success('Business OS activado. Entrando...')
        setTimeout(() => navigate(`/${data.slug}/dashboard`), 800)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [waitingFor])

  async function loadWorkspaces() {
    try {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) { navigate('/login'); return }
      setUser(u)

      const { data } = await supabase
        .from('colaboradores')
        .select('boss_rol, fabricas:fabrica_id(id, nombre, slug, giro, logo_url, boss_is_active, boss_subscription_status)')
        .eq('profile_id', u.id)
        .not('boss_rol', 'is', null)
        .neq('activo', false)

      setWorkspaces((data || []).filter(m => m.fabricas))
    } catch {
      toast.error('Error cargando workspaces')
    } finally {
      setLoading(false)
    }
  }

  async function activarBoss(fab, billing = 'mensual') {
    setActivating(fab.id)
    try {
      sessionStorage.setItem('boss_checkout_fabrica', fab.id)
      const { data, error } = await supabase.functions.invoke('stripe-boss-checkout', {
        body: { billing },
      })
      if (error || data?.error) {
        sessionStorage.removeItem('boss_checkout_fabrica')
        toast.error(data?.error || error?.message || 'Error al iniciar pago')
        return
      }
      if (data?.url) window.location.href = data.url
    } catch {
      sessionStorage.removeItem('boss_checkout_fabrica')
      toast.error('Error inesperado. Intenta de nuevo.')
    } finally {
      setActivating(null)
    }
  }

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,212,255,0.05), transparent)'
    }}>
      <div style={{ maxWidth: 720, width: '100%', padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>
            Selecciona tu workspace
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 6 }}>
            Tienes acceso a {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Banner de espera de activación */}
        {waitingFor && (
          <div style={{
            background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.35)',
            borderRadius: 12, padding: '14px 20px', marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderColor: '#818cf8', borderTopColor: 'transparent' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#a5b4fc' }}>Activando Business OS...</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Procesando el pago con Stripe. Esto puede tardar unos segundos.
              </div>
            </div>
          </div>
        )}

        {workspaces.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🏭</div>
            <p>No tienes acceso a ningún workspace</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/onboarding')}>
              Crear workspace
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16 }}>
            {workspaces.map(({ boss_rol, fabricas: fab }) => {
              const activo      = !!fab.boss_is_active
              const canUpgrade  = !activo && (boss_rol === 'owner' || boss_rol === 'admin')
              const isWaiting   = waitingFor === fab.id
              const isActivating = activating === fab.id
              const isHinted    = upgradeHint === fab.id

              return (
                <div key={fab.id} style={{ position: 'relative' }}>
                  {/* Tarjeta principal */}
                  <button
                    onClick={() => activo ? navigate(`/${fab.slug}/dashboard`) : undefined}
                    disabled={!activo || isWaiting}
                    style={{
                      width: '100%',
                      background: activo ? 'var(--bg-card)' : 'rgba(255,255,255,.03)',
                      border: `1px solid ${isWaiting ? 'rgba(99,102,241,.5)' : activo ? 'var(--border-2)' : 'rgba(255,255,255,.08)'}`,
                      borderRadius: 12, padding: 20,
                      cursor: activo && !isWaiting ? 'pointer' : 'default',
                      textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12,
                      opacity: !activo && !canUpgrade ? 0.5 : 1,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (activo && !isWaiting) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(0,212,255,.2)' } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = activo ? 'var(--border-2)' : 'rgba(255,255,255,.08)'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{
                      width: 48, height: 48, borderRadius: 10,
                      background: activo ? 'linear-gradient(135deg, var(--accent-2), var(--accent))' : 'rgba(255,255,255,.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                    }}>
                      {fab.logo_url
                        ? <img src={fab.logo_url} alt="" style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'cover' }} />
                        : (GIRO_ICONS[fab.giro] || '🏢')
                      }
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: activo ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {fab.nombre}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{fab.giro}</div>
                    </div>
                    <span className={`badge badge-${boss_rol === 'owner' ? 'blue' : boss_rol === 'admin' ? 'purple' : 'gray'}`}>
                      {ROL_LABELS[boss_rol] || boss_rol}
                    </span>

                    {/* Badge de estado */}
                    {isWaiting && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#a5b4fc', fontWeight: 600 }}>
                        <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2, borderColor: '#818cf8', borderTopColor: 'transparent', flexShrink: 0 }} />
                        Activando...
                      </div>
                    )}
                    {!activo && !isWaiting && !canUpgrade && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
                        Business OS no disponible
                      </div>
                    )}
                  </button>

                  {/* Anuncio de intento de acceso sin Boss activo */}
                  {isHinted && canUpgrade && !isWaiting && (
                    <div style={{
                      position: 'absolute', top: -10, left: 0, right: 0,
                      background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
                      borderRadius: 10, padding: '6px 12px',
                      fontSize: 11, color: '#f87171', fontWeight: 600, textAlign: 'center',
                    }}>
                      Business OS no está activo en este workspace
                    </div>
                  )}

                  {/* Overlay de upgrade para owner/admin */}
                  {canUpgrade && !isWaiting && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'linear-gradient(0deg, rgba(0,0,0,.85) 60%, transparent)',
                      borderRadius: '0 0 12px 12px', padding: '24px 16px 16px',
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      <div style={{ fontSize: 11, color: '#c7d2fe', fontWeight: 600 }}>
                        🧠 Business OS no activado
                      </div>
                      <button
                        onClick={() => activarBoss(fab, 'mensual')}
                        disabled={!!activating}
                        style={{
                          width: '100%', padding: '9px', borderRadius: 8,
                          background: isActivating ? 'rgba(99,102,241,.5)' : 'rgba(99,102,241,1)',
                          color: '#fff', fontSize: 12, fontWeight: 700, border: 'none',
                          cursor: activating ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        {isActivating
                          ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderColor: '#fff', borderTopColor: 'transparent' }} /> Redirigiendo...</>
                          : '✨ Activar Business OS'
                        }
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/onboarding')}>
            + Crear nuevo workspace
          </button>
        </div>
      </div>
    </div>
  )
}

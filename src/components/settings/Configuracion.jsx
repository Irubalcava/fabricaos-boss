import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { activarPush, desactivarPush, estadoPush, pushSoportado } from '../../lib/push.js'

const ROL_OPTIONS = ['owner', 'admin', 'miembro', 'viewer']
const ROL_LABELS = { owner: 'Owner', admin: 'Admin', miembro: 'Miembro', viewer: 'Viewer' }
const ROL_COLORS = { owner: 'var(--accent)', admin: '#a78bfa', miembro: 'var(--success)', viewer: 'var(--text-3)' }
const COLORES_SUCURSAL = ['#00d4ff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

function emptySucursal() {
  return { nombre: '', ubicacion: '', responsable_id: '', color: '#00d4ff' }
}

export default function Configuracion() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const {
    workspace, miembro, miembros,
    sucursales: sucursalesStore, setSucursales: setSucursalesStore,
    setWorkspace, setMiembros, isOwner, isAdmin, user
  } = useStore()

  const [tab, setTab] = useState('workspace')
  const [saving, setSaving] = useState(false)
  const [wsForm, setWsForm] = useState({ nombre: '', giro: '', descripcion: '' })

  // Miembros / Equipo
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRol, setInviteRol] = useState('miembro')
  const [inviteSucursal, setInviteSucursal] = useState('')
  const [inviting, setInviting] = useState(false)
  const [deleting, setDeleting] = useState(null)

  // Sucursales
  const [modalSucursal, setModalSucursal] = useState(false)
  const [sucursalForm, setSucursalForm] = useState(emptySucursal())
  const [editSucursalId, setEditSucursalId] = useState(null)
  const [savingSucursal, setSavingSucursal] = useState(false)

  // Push
  const [pushStatus, setPushStatus] = useState('checking')
  const [togglingPush, setTogglingPush] = useState(false)

  useEffect(() => {
    if (workspace) {
      setWsForm({ nombre: workspace.nombre || '', giro: workspace.giro || '', descripcion: workspace.descripcion || '' })
    }
  }, [workspace])

  useEffect(() => {
    estadoPush().then(s => setPushStatus(s))
  }, [])

  // ─── Workspace ────────────────────────────────────────────
  async function handleSaveWorkspace() {
    if (!wsForm.nombre.trim()) { toast.error('El nombre es requerido'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('fabricas')
        .update({ nombre: wsForm.nombre.trim(), giro: wsForm.giro, descripcion: wsForm.descripcion.trim() || null })
        .eq('id', workspace.id).select().single()
      if (error) throw error
      setWorkspace(data)
      toast.success('Workspace actualizado')
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  // ─── Sucursales ───────────────────────────────────────────
  async function handleSaveSucursal() {
    if (!sucursalForm.nombre.trim()) { toast.error('El nombre es requerido'); return }
    setSavingSucursal(true)
    try {
      const payload = {
        fabrica_id: workspace.id,
        nombre: sucursalForm.nombre.trim(),
        ubicacion: sucursalForm.ubicacion.trim() || null,
        responsable_id: sucursalForm.responsable_id || null,
        color: sucursalForm.color || '#00d4ff'
      }
      if (editSucursalId) {
        const { error } = await supabase.from('bos_sucursales').update(payload).eq('id', editSucursalId)
        if (error) throw error
        toast.success('Sucursal actualizada')
      } else {
        const { error } = await supabase.from('bos_sucursales').insert(payload)
        if (error) throw error
        toast.success('Sucursal creada')
      }
      setModalSucursal(false)
      setEditSucursalId(null)
      setSucursalForm(emptySucursal())
      await reloadSucursales()
    } catch (err) { toast.error(err.message) }
    finally { setSavingSucursal(false) }
  }

  async function handleDeleteSucursal(id, nombre) {
    if (!confirm(`¿Eliminar sucursal "${nombre}"? Los datos vinculados a ella perderán la referencia.`)) return
    const { error } = await supabase.from('bos_sucursales').update({ activo: false }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Sucursal desactivada')
    await reloadSucursales()
  }

  async function reloadSucursales() {
    const { data } = await supabase.from('bos_sucursales').select('*').eq('fabrica_id', workspace.id).eq('activo', true).order('nombre')
    setSucursalesStore(data || [])
  }

  function openEditSucursal(s) {
    setSucursalForm({ nombre: s.nombre, ubicacion: s.ubicacion || '', responsable_id: s.responsable_id || '', color: s.color || '#00d4ff' })
    setEditSucursalId(s.id)
    setModalSucursal(true)
  }

  // ─── Equipo / Miembros ────────────────────────────────────
  async function handleInvite() {
    if (!inviteEmail.trim()) { toast.error('Ingresa un email'); return }
    setInviting(true)
    try {
      const { data: perfil } = await supabase.from('profiles').select('id, email').eq('email', inviteEmail.trim()).maybeSingle()
      if (!perfil) { toast.error('Usuario no encontrado. Debe registrarse primero.'); return }
      if (miembros.some(m => m.profile_id === perfil.id)) { toast.error('Ya es miembro'); return }

      const { error } = await supabase.from('colaboradores').insert({
        fabrica_id: workspace.id,
        profile_id: perfil.id,
        nombre: perfil.email,
        boss_rol: inviteRol,
        sucursal_id: inviteSucursal || null,
        activo: true
      })
      if (error) throw error

      const { data: nuevos } = await supabase.from('colaboradores').select('*').eq('fabrica_id', workspace.id).not('boss_rol', 'is', null)
      setMiembros(nuevos || [])
      await supabase.from('bos_bitacora').insert({ fabrica_id: workspace.id, tipo: 'workspace', titulo: `Nuevo miembro: ${inviteEmail}`, automatico: true, created_by: miembro?.profile_id })
      setInviteEmail(''); setInviteSucursal('')
      toast.success(`${inviteEmail} añadido como ${inviteRol}`)
    } catch (err) { toast.error(err.message) }
    finally { setInviting(false) }
  }

  async function handleCambiarRol(memberId, nuevoRol) {
    if (memberId === miembro?.id && nuevoRol !== 'owner') {
      if (!confirm('¿Cambiar tu propio rol? Perderás privilegios.')) return
    }
    const { error } = await supabase.from('colaboradores').update({ boss_rol: nuevoRol }).eq('id', memberId)
    if (error) { toast.error(error.message); return }
    await reloadMiembros()
    toast.success('Rol actualizado')
  }

  async function handleAsignarSucursal(memberId, sucursalId) {
    const { error } = await supabase.from('colaboradores').update({ sucursal_id: sucursalId || null }).eq('id', memberId)
    if (error) { toast.error(error.message); return }
    await reloadMiembros()
    toast.success('Sucursal asignada')
  }

  async function handleRemoveMember(memberId, memberNombre) {
    if (memberId === miembro?.id) { toast.error('No puedes eliminarte'); return }
    if (!confirm(`¿Eliminar a ${memberNombre} del workspace?`)) return
    setDeleting(memberId)
    const { error } = await supabase.from('colaboradores').update({ boss_rol: null, activo: false }).eq('id', memberId)
    if (error) { toast.error(error.message); setDeleting(null); return }
    await reloadMiembros()
    setDeleting(null)
    toast.success(`${memberNombre} eliminado`)
  }

  async function reloadMiembros() {
    const { data } = await supabase.from('colaboradores').select('*').eq('fabrica_id', workspace.id).not('boss_rol', 'is', null)
    setMiembros(data || [])
  }

  // ─── Push Notifications ───────────────────────────────────
  async function togglePush() {
    setTogglingPush(true)
    try {
      if (pushStatus === 'activo') {
        await desactivarPush(supabase, user?.id)
        setPushStatus('inactivo')
        toast.success('Notificaciones desactivadas')
      } else {
        await activarPush(supabase, workspace.id, user?.id)
        setPushStatus('activo')
        toast.success('Notificaciones activadas 🔔')
      }
    } catch (err) {
      toast.error(err.message)
    } finally {
      setTogglingPush(false)
    }
  }

  const tabs = [
    { id: 'workspace',  label: '🏭 Workspace',   show: true },
    { id: 'sucursales', label: '🏢 Sucursales',   show: true },
    { id: 'equipo',     label: '👥 Equipo',        show: true },
    { id: 'cuenta',     label: '👤 Mi cuenta',     show: true },
    { id: 'peligroso',  label: '⚠ Zona peligrosa', show: isOwner?.() }
  ].filter(t => t.show)

  const getNombreMiembro = (profileId) => {
    const m = miembros.find(x => x.profile_id === profileId)
    return m?.profiles?.nombre || m?.nombre || profileId || '—'
  }

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <h1 className="page-title">Configuración</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              background: 'none', border: 'none', padding: '8px 14px', fontSize: 13,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? 'var(--accent)' : 'var(--text-2)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
              cursor: 'pointer', transition: 'all 0.15s', marginBottom: -1
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── WORKSPACE ── */}
      {tab === 'workspace' && (
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>Información del workspace</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="label">Nombre</label>
              <input className="input" value={wsForm.nombre} onChange={e => setWsForm(p => ({ ...p, nombre: e.target.value }))} disabled={!isAdmin?.()} />
            </div>
            <div className="form-group">
              <label className="label">Giro</label>
              <input className="input" value={wsForm.giro} onChange={e => setWsForm(p => ({ ...p, giro: e.target.value }))} disabled={!isAdmin?.()} placeholder="Ej: Restaurante, Manufactura, Retail..." />
            </div>
            <div className="form-group">
              <label className="label">Descripción del negocio</label>
              <textarea className="input" value={wsForm.descripcion} onChange={e => setWsForm(p => ({ ...p, descripcion: e.target.value }))} disabled={!isAdmin?.()} placeholder="Contexto del negocio — la IA usa esto para generar sugerencias más relevantes" rows={3} />
            </div>
            <div className="form-group">
              <label className="label">Slug (URL)</label>
              <input className="input" value={workspace?.slug || ''} disabled style={{ opacity: 0.5 }} />
            </div>
            {isAdmin?.() && (
              <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={handleSaveWorkspace} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Guardar cambios'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── SUCURSALES ── */}
      {tab === 'sucursales' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Sucursales ({sucursalesStore.length})</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Cada miembro del equipo se asigna a una sucursal</div>
            </div>
            {isAdmin?.() && (
              <button className="btn btn-primary" onClick={() => { setSucursalForm(emptySucursal()); setEditSucursalId(null); setModalSucursal(true) }}>
                + Nueva sucursal
              </button>
            )}
          </div>

          {sucursalesStore.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
              <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16 }}>No hay sucursales registradas</div>
              {isAdmin?.() && (
                <button className="btn btn-primary" onClick={() => { setSucursalForm(emptySucursal()); setEditSucursalId(null); setModalSucursal(true) }}>
                  Crear primera sucursal
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {sucursalesStore.map(s => {
                const responsable = s.responsable_id ? getNombreMiembro(s.responsable_id) : null
                const miembrosEnSucursal = miembros.filter(m => m.sucursal_id === s.id)
                return (
                  <div key={s.id} className="card" style={{ borderLeft: `4px solid ${s.color || 'var(--accent)'}`, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{s.nombre}</div>
                        {s.ubicacion && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>📍 {s.ubicacion}</div>}
                      </div>
                      {isAdmin?.() && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEditSucursal(s)}>✏</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteSucursal(s.id, s.nombre)}>✕</button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
                      {responsable && (
                        <span style={{ color: 'var(--text-2)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 10 }}>
                          👤 {responsable}
                        </span>
                      )}
                      <span style={{ color: 'var(--text-3)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 10 }}>
                        {miembrosEnSucursal.length} miembro{miembrosEnSucursal.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── EQUIPO ── */}
      {tab === 'equipo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isAdmin?.() && (
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Agregar miembro</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: 1, minWidth: 200 }} value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="email@ejemplo.com"
                  onKeyDown={e => e.key === 'Enter' && handleInvite()} />
                <select className="input" style={{ width: 120 }} value={inviteRol} onChange={e => setInviteRol(e.target.value)}>
                  {ROL_OPTIONS.filter(r => r !== 'owner').map(r => <option key={r} value={r}>{ROL_LABELS[r]}</option>)}
                </select>
                <select className="input" style={{ width: 160 }} value={inviteSucursal} onChange={e => setInviteSucursal(e.target.value)}>
                  <option value="">Sin sucursal</option>
                  {sucursalesStore.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <button className="btn btn-primary" onClick={handleInvite} disabled={inviting}>
                  {inviting ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Agregar'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>El usuario debe tener cuenta en el sistema primero.</p>
            </div>
          )}

          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Equipo ({miembros.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {miembros.map(m => {
                const sucursalMiembro = sucursalesStore.find(s => s.id === m.sucursal_id)
                return (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: 'var(--bg-input)',
                    border: m.id === miembro?.id ? '1px solid var(--accent)40' : '1px solid var(--border)',
                    borderRadius: 8
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: `linear-gradient(135deg, ${ROL_COLORS[m.boss_rol] || 'var(--text-3)'}, var(--accent))`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 700, fontSize: 12
                    }}>
                      {(m.nombre || m.profile_id || 'U').slice(0, 2).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }} className="truncate">
                        {m.profiles?.nombre || m.nombre || m.profile_id}
                        {m.id === miembro?.id && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>· tú</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: ROL_COLORS[m.boss_rol], textTransform: 'uppercase' }}>
                          {ROL_LABELS[m.boss_rol] || m.boss_rol}
                        </span>
                        {sucursalMiembro && (
                          <span style={{ fontSize: 10, color: 'var(--text-3)', background: sucursalMiembro.color + '22', padding: '1px 6px', borderRadius: 8 }}>
                            {sucursalMiembro.nombre}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Controles */}
                    {isAdmin?.() && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {/* Sucursal */}
                        <select
                          value={m.sucursal_id || ''}
                          onChange={e => handleAsignarSucursal(m.id, e.target.value)}
                          style={{ fontSize: 11, background: 'var(--bg-card)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', maxWidth: 130 }}
                        >
                          <option value="">Sin sucursal</option>
                          {sucursalesStore.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                        </select>
                        {/* Rol */}
                        <select
                          value={m.boss_rol}
                          onChange={e => handleCambiarRol(m.id, e.target.value)}
                          disabled={m.boss_rol === 'owner' && !isOwner?.()}
                          style={{ fontSize: 11, background: 'var(--bg-card)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '3px 6px', color: ROL_COLORS[m.boss_rol], cursor: 'pointer' }}
                        >
                          {ROL_OPTIONS.map(r => <option key={r} value={r}>{ROL_LABELS[r]}</option>)}
                        </select>
                        {m.id !== miembro?.id && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                            disabled={deleting === m.id}
                            onClick={() => handleRemoveMember(m.id, m.nombre)}>
                            {deleting === m.id ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✕'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── MI CUENTA ── */}
      {tab === 'cuenta' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Mi perfil</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 20
              }}>
                {(miembro?.nombre || 'U').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>{miembro?.nombre || miembro?.profile_id}</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
                  <span style={{ color: ROL_COLORS[miembro?.boss_rol] }}>{ROL_LABELS[miembro?.boss_rol]}</span>
                  {' '}· {workspace?.nombre}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { label: 'Workspace', value: workspace?.nombre },
                { label: 'Rol', value: ROL_LABELS[miembro?.boss_rol] },
                { label: 'Sucursal', value: sucursalesStore.find(s => s.id === miembro?.sucursal_id)?.nombre || 'Todas (admin)' },
                { label: 'Giro', value: workspace?.giro }
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-3)' }}>{item.label}</span>
                  <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{item.value || '—'}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" style={{ marginTop: 16, alignSelf: 'flex-start' }} onClick={() => navigate('/select')}>
              Cambiar workspace
            </button>
          </div>

          {/* Push Notifications */}
          <div className="card">
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>🔔 Notificaciones push</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.5 }}>
              Recibe alertas en tu celular cuando haya tareas vencidas, métricas sin actualizar o problemas críticos.
            </div>

            {!pushSoportado() ? (
              <div style={{ fontSize: 13, color: 'var(--warning)', background: 'var(--warning)15', padding: '10px 14px', borderRadius: 8 }}>
                ⚠ Tu navegador no soporta notificaciones push. Usa Chrome o Safari en iOS 16.4+.
              </div>
            ) : pushStatus === 'bloqueado' ? (
              <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger)15', padding: '10px 14px', borderRadius: 8 }}>
                🚫 Las notificaciones están bloqueadas en tu navegador. Ve a Configuración del navegador → Privacidad → Notificaciones para desbloquear este sitio.
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: pushStatus === 'activo' ? 'var(--success)' : 'var(--text-2)' }}>
                    {pushStatus === 'activo' ? '✓ Activadas en este dispositivo' :
                     pushStatus === 'checking' ? 'Verificando...' : 'Desactivadas'}
                  </div>
                  {!import.meta.env.VITE_VAPID_PUBLIC_KEY && (
                    <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 3 }}>
                      ⚠ Configura VITE_VAPID_PUBLIC_KEY para activar notificaciones reales
                    </div>
                  )}
                </div>
                <button
                  className={`btn ${pushStatus === 'activo' ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                  onClick={togglePush}
                  disabled={togglingPush || pushStatus === 'checking' || !import.meta.env.VITE_VAPID_PUBLIC_KEY}
                >
                  {togglingPush
                    ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                    : pushStatus === 'activo' ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ZONA PELIGROSA ── */}
      {tab === 'peligroso' && isOwner?.() && (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--danger)', marginBottom: 16 }}>⚠ Zona peligrosa</div>
          <div style={{ padding: 16, background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>Eliminar workspace</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
              Elimina permanentemente el workspace, todos los datos y configuraciones. No se puede deshacer.
            </div>
            <button className="btn btn-danger btn-sm"
              onClick={async () => {
                const confirmText = prompt(`Escribe el nombre del workspace para confirmar: "${workspace?.nombre}"`)
                if (confirmText !== workspace?.nombre) { toast.error('Nombre incorrecto, cancelado'); return }
                try {
                  await supabase.from('fabricas').delete().eq('id', workspace.id)
                  toast.success('Workspace eliminado')
                  navigate('/onboarding')
                } catch (err) { toast.error(err.message) }
              }}>
              Eliminar workspace permanentemente
            </button>
          </div>
        </div>
      )}

      {/* Modal sucursal */}
      <Modal
        open={modalSucursal}
        onClose={() => { setModalSucursal(false); setEditSucursalId(null) }}
        title={editSucursalId ? 'Editar sucursal' : 'Nueva sucursal'}
        size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => { setModalSucursal(false); setEditSucursalId(null) }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSaveSucursal} disabled={savingSucursal}>
            {savingSucursal ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : (editSucursalId ? 'Guardar' : 'Crear')}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="label">Nombre *</label>
            <input className="input" value={sucursalForm.nombre} onChange={e => setSucursalForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Sucursal Norte, Planta 2..." autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Ubicación</label>
            <input className="input" value={sucursalForm.ubicacion} onChange={e => setSucursalForm(p => ({ ...p, ubicacion: e.target.value }))} placeholder="Dirección o ciudad" />
          </div>
          <div className="form-group">
            <label className="label">Responsable</label>
            <select className="input" value={sucursalForm.responsable_id} onChange={e => setSucursalForm(p => ({ ...p, responsable_id: e.target.value }))}>
              <option value="">Sin responsable</option>
              {miembros.map(m => (
                <option key={m.profile_id} value={m.profile_id}>
                  {m.profiles?.nombre || m.nombre || m.profile_id}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Color identificador</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {COLORES_SUCURSAL.map(c => (
                <button key={c} type="button"
                  onClick={() => setSucursalForm(p => ({ ...p, color: c }))}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                    outline: sucursalForm.color === c ? `3px solid ${c}` : 'none',
                    outlineOffset: 2, transform: sucursalForm.color === c ? 'scale(1.2)' : 'scale(1)',
                    transition: 'all 0.15s'
                  }} />
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

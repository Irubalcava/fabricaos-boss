import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'

const ROL_OPTIONS = ['owner', 'admin', 'miembro', 'viewer']
const ROL_LABELS = { owner: 'Owner', admin: 'Admin', miembro: 'Miembro', viewer: 'Viewer' }
const ROL_COLORS = { owner: 'var(--accent)', admin: 'var(--accent-2)', miembro: 'var(--success)', viewer: 'var(--text-3)' }

export default function Configuracion() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { workspace, miembro, miembros, setWorkspace, setMiembros, isOwner, isAdmin } = useStore()
  const [tab, setTab] = useState('workspace')
  const [saving, setSaving] = useState(false)
  const [wsForm, setWsForm] = useState({ nombre: '', giro: '', descripcion: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRol, setInviteRol] = useState('miembro')
  const [inviting, setInviting] = useState(false)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    if (workspace) {
      setWsForm({
        nombre: workspace.nombre || '',
        giro: workspace.giro || '',
        descripcion: workspace.descripcion || ''
      })
    }
  }, [workspace])

  async function handleSaveWorkspace() {
    if (!wsForm.nombre.trim()) { toast.error('El nombre es requerido'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('fabricas')
        .update({ nombre: wsForm.nombre.trim(), giro: wsForm.giro, descripcion: wsForm.descripcion.trim() || null })
        .eq('id', workspace.id)
        .select()
        .single()
      if (error) throw error
      setWorkspace(data)
      toast.success('Workspace actualizado')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) { toast.error('Ingresa un email'); return }
    setInviting(true)
    try {
      // Find user by email
      const { data: perfil } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', inviteEmail.trim())
        .maybeSingle()

      if (!perfil) {
        toast.error('Usuario no encontrado. El usuario debe registrarse primero.')
        return
      }

      // Check if already member
      const exists = miembros.some(m => m.profile_id === perfil.id)
      if (exists) { toast.error('Este usuario ya es miembro'); return }

      const { error } = await supabase.from('colaboradores').insert({
        fabrica_id: workspace.id,
        profile_id: perfil.id,
        nombre: perfil.email,
        boss_rol: inviteRol,
        activo: true
      })
      if (error) throw error

      // Reload members
      const { data: nuevos } = await supabase
        .from('colaboradores')
        .select('*')
        .eq('fabrica_id', workspace.id)
        .not('boss_rol', 'is', null)
      setMiembros(nuevos || [])

      await supabase.from('bos_bitacora').insert({
        fabrica_id: workspace.id,
        tipo: 'workspace',
        titulo: `Nuevo miembro: ${inviteEmail}`,
        automatico: true,
        created_by: miembro?.profile_id
      })

      setInviteEmail('')
      toast.success(`${inviteEmail} añadido como ${inviteRol}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setInviting(false)
    }
  }

  async function handleCambiarRol(memberId, nuevoRol) {
    if (memberId === miembro?.id && nuevoRol !== 'owner') {
      if (!confirm('¿Cambiar tu propio rol? Perderás privilegios.')) return
    }
    const { error } = await supabase.from('colaboradores').update({ boss_rol: nuevoRol }).eq('id', memberId)
    if (error) { toast.error(error.message); return }
    const { data } = await supabase.from('colaboradores').select('*').eq('fabrica_id', workspace.id).not('boss_rol', 'is', null)
    setMiembros(data || [])
    toast.success('Rol actualizado')
  }

  async function handleRemoveMember(memberId, memberNombre) {
    if (memberId === miembro?.id) { toast.error('No puedes eliminarte a ti mismo'); return }
    if (!confirm(`¿Eliminar a ${memberNombre} del workspace?`)) return
    setDeleting(memberId)
    const { error } = await supabase.from('colaboradores').update({ boss_rol: null, activo: false }).eq('id', memberId)
    if (error) { toast.error(error.message); setDeleting(null); return }
    const { data } = await supabase.from('colaboradores').select('*').eq('fabrica_id', workspace.id).not('boss_rol', 'is', null)
    setMiembros(data || [])
    setDeleting(null)
    toast.success(`${memberNombre} eliminado del workspace`)
  }

  const tabs = [
    { id: 'workspace', label: '🏭 Workspace', show: true },
    { id: 'miembros', label: '👥 Miembros', show: true },
    { id: 'cuenta', label: '👤 Mi cuenta', show: true },
    { id: 'peligroso', label: '⚠ Zona peligrosa', show: isOwner?.() }
  ].filter(t => t.show)

  return (
    <div className="page" style={{ maxWidth: 800 }}>
      <h1 className="page-title">Configuración</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: 'none', border: 'none',
              padding: '8px 14px',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? 'var(--accent)' : 'var(--text-2)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
              cursor: 'pointer',
              transition: 'all 0.15s',
              marginBottom: -1
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Workspace */}
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
              <input className="input" value={wsForm.giro} onChange={e => setWsForm(p => ({ ...p, giro: e.target.value }))} disabled={!isAdmin?.()} />
            </div>
            <div className="form-group">
              <label className="label">Descripción</label>
              <textarea className="input" value={wsForm.descripcion} onChange={e => setWsForm(p => ({ ...p, descripcion: e.target.value }))} disabled={!isAdmin?.()} placeholder="Descripción del negocio" />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="label">Slug (URL)</label>
                <input className="input" value={workspace?.slug || ''} disabled style={{ opacity: 0.6 }} />
              </div>
            </div>
            {isAdmin?.() && (
              <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={handleSaveWorkspace} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Guardar cambios'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Miembros */}
      {tab === 'miembros' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isAdmin?.() && (
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Invitar miembro</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input className="input" style={{ flex: 1 }} value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="email@ejemplo.com" onKeyDown={e => e.key === 'Enter' && handleInvite()} />
                <select className="input" style={{ width: 130 }} value={inviteRol} onChange={e => setInviteRol(e.target.value)}>
                  {ROL_OPTIONS.filter(r => r !== 'owner').map(r => <option key={r} value={r}>{ROL_LABELS[r]}</option>)}
                </select>
                <button className="btn btn-primary" onClick={handleInvite} disabled={inviting}>
                  {inviting ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Invitar'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
                El usuario debe tener una cuenta en el sistema primero.
              </p>
            </div>
          )}

          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
              Miembros ({miembros.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {miembros.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px',
                  background: 'var(--bg-input)',
                  border: m.id === miembro?.id ? '1px solid var(--accent)40' : '1px solid var(--border)',
                  borderRadius: 8
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${ROL_COLORS[m.boss_rol] || 'var(--text-3)'}, var(--accent-2))`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0
                  }}>
                    {(m.nombre || m.profile_id || 'U').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }} className="truncate">
                      {m.nombre || m.profile_id}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {m.id === miembro?.id ? 'Tú · ' : ''}{ROL_LABELS[m.boss_rol] || m.boss_rol}
                    </div>
                  </div>
                  {isAdmin?.() && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mi cuenta */}
      {tab === 'cuenta' && (
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Mi perfil en este workspace</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent-2), var(--accent))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 20
              }}>
                {(miembro?.nombre || 'U').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>{miembro?.nombre}</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
                  <span style={{ color: ROL_COLORS[miembro?.boss_rol] }}>{ROL_LABELS[miembro?.boss_rol]}</span>
                  {' '}· {workspace?.nombre}
                </div>
              </div>
            </div>
            <hr className="divider" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Workspace', value: workspace?.nombre },
                { label: 'Slug', value: workspace?.slug },
                { label: 'Rol', value: ROL_LABELS[miembro?.boss_rol] },
                { label: 'Giro', value: workspace?.giro }
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-3)' }}>{item.label}</span>
                  <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{item.value || '—'}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}
              onClick={() => navigate('/select')}>
              Cambiar workspace
            </button>
          </div>
        </div>
      )}

      {/* Zona peligrosa */}
      {tab === 'peligroso' && isOwner?.() && (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--danger)', marginBottom: 16 }}>⚠ Zona peligrosa</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 16, background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>Eliminar workspace</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
                Esta acción eliminará permanentemente el workspace, todos los datos, miembros y configuraciones. No se puede deshacer.
              </div>
              <button className="btn btn-danger btn-sm"
                onClick={async () => {
                  const confirmText = prompt(`Escribe el nombre del workspace para confirmar: "${workspace?.nombre}"`)
                  if (confirmText !== workspace?.nombre) { toast.error('Nombre incorrecto, acción cancelada'); return }
                  try {
                    await supabase.from('fabricas').delete().eq('id', workspace.id)
                    toast.success('Workspace eliminado')
                    navigate('/onboarding')
                  } catch (err) {
                    toast.error(err.message)
                  }
                }}>
                Eliminar workspace permanentemente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

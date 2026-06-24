import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'

const ESTADOS = ['pendiente', 'en_progreso', 'bloqueada', 'hecha', 'cancelada']
const PRIORIDADES = ['baja', 'media', 'alta', 'critica']

const ESTADO_COLORS = {
  pendiente: 'var(--text-3)', en_progreso: 'var(--accent)',
  bloqueada: 'var(--danger)', hecha: 'var(--success)', cancelada: 'var(--text-4)'
}
const PRIORIDAD_COLORS = { baja: 'var(--text-3)', media: 'var(--warning)', alta: 'var(--danger)', critica: '#ff2d55' }
const ESTADO_LABELS = { pendiente: 'Pendiente', en_progreso: 'En progreso', bloqueada: 'Bloqueada', hecha: 'Hecha', cancelada: 'Cancelada' }

function uid() { return Math.random().toString(36).slice(2, 10) }

function empty() {
  return { titulo: '', descripcion: '', asignado_a: '', prioridad: 'media', estado: 'pendiente', fecha_limite: '', presupuesto: [] }
}

function fmtMXN(n) {
  const v = parseFloat(n)
  if (!v) return ''
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 })
}

export default function Tareas() {
  const location = useLocation()
  const { workspace, miembro, miembros } = useStore()
  const [tareas, setTareas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('all')
  const [filtroAsignado, setFiltroAsignado] = useState('all')
  const [showPresupuesto, setShowPresupuesto] = useState(false)

  useEffect(() => { if (workspace?.id) loadTareas() }, [workspace])

  useEffect(() => {
    if (location.state?.openCreate) {
      setForm(empty()); setEditId(null); setModalOpen(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  async function loadTareas() {
    setLoading(true)
    const { data } = await supabase.from('bos_tareas').select('*').eq('fabrica_id', workspace.id).order('created_at', { ascending: false })
    setTareas(data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('El título es requerido'); return }
    setSaving(true)
    try {
      const payload = {
        fabrica_id: workspace.id,
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        asignado_a: form.asignado_a || null,
        prioridad: form.prioridad,
        estado: form.estado,
        fecha_limite: form.fecha_limite || null,
        presupuesto: form.presupuesto.length ? form.presupuesto : null,
        created_by: miembro?.profile_id
      }
      if (editId) {
        const { error } = await supabase.from('bos_tareas').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Tarea actualizada')
      } else {
        const { error } = await supabase.from('bos_tareas').insert(payload)
        if (error) throw error
        toast.success('Tarea creada')
        await supabase.from('bos_bitacora').insert({ fabrica_id: workspace.id, tipo: 'tarea', titulo: `Nueva tarea: ${form.titulo}`, automatico: true, created_by: miembro?.profile_id })
      }
      setModalOpen(false)
      loadTareas()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta tarea?')) return
    const { error } = await supabase.from('bos_tareas').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Tarea eliminada'); loadTareas()
  }

  async function handleEstadoChange(id, nuevoEstado) {
    const { error } = await supabase.from('bos_tareas').update({ estado: nuevoEstado }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setTareas(prev => prev.map(t => t.id === id ? { ...t, estado: nuevoEstado } : t))
  }

  function openEdit(tarea) {
    setForm({ titulo: tarea.titulo, descripcion: tarea.descripcion || '', asignado_a: tarea.asignado_a || '', prioridad: tarea.prioridad || 'media', estado: tarea.estado || 'pendiente', fecha_limite: tarea.fecha_limite || '', presupuesto: tarea.presupuesto || [] })
    setShowPresupuesto(!!(tarea.presupuesto?.length))
    setEditId(tarea.id); setModalOpen(true)
  }

  function addItem() {
    setForm(p => ({ ...p, presupuesto: [...p.presupuesto, { id: uid(), concepto: '', para_que: '', precio: '', tienda: '', link: '' }] }))
  }

  function exportarPresupuestos() {
    const conPresupuesto = tareas.filter(t => t.presupuesto?.length > 0)
    if (!conPresupuesto.length) { toast.error('No hay presupuestos para exportar'); return }
    const filas = [['Tarea', 'Estado', 'Prioridad', 'Concepto', 'Para qué', 'Precio', 'Dónde comprar', 'Link']]
    conPresupuesto.forEach(t => {
      t.presupuesto.forEach(it => {
        filas.push([t.titulo, t.estado, t.prioridad, it.concepto || '', it.para_que || '', parseFloat(it.precio) || 0, it.tienda || '', it.link || ''])
      })
      const total = totalPresupuesto(t.presupuesto)
      if (t.presupuesto.length > 1) filas.push([t.titulo, '', '', 'TOTAL', '', total, '', ''])
    })
    const csv = filas.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `presupuestos_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function updateItem(id, field, val) {
    setForm(p => ({ ...p, presupuesto: p.presupuesto.map(it => it.id === id ? { ...it, [field]: val } : it) }))
  }

  function removeItem(id) {
    setForm(p => ({ ...p, presupuesto: p.presupuesto.filter(it => it.id !== id) }))
  }

  const today = new Date().toISOString().split('T')[0]
  const tareasFiltradas = tareas.filter(t => {
    if (filtroEstado !== 'all' && t.estado !== filtroEstado) return false
    if (filtroAsignado !== 'all' && t.asignado_a !== filtroAsignado) return false
    return true
  })
  const isVencida = (t) => t.fecha_limite && t.fecha_limite < today && !['hecha', 'cancelada'].includes(t.estado)

  const totalPresupuesto = (items) => (items || []).reduce((s, it) => s + (parseFloat(it.precio) || 0), 0)

  if (loading) return <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div className="spinner" /></div>

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Tareas</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {tareas.some(t => t.presupuesto?.length > 0) && (
            <button className="btn btn-secondary" onClick={exportarPresupuestos}>⬇ Excel</button>
          )}
          <button className="btn btn-primary" onClick={() => { setForm(empty()); setShowPresupuesto(false); setEditId(null); setModalOpen(true) }}>+ Nueva tarea</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 'auto' }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="all">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={filtroAsignado} onChange={e => setFiltroAsignado(e.target.value)}>
          <option value="all">Todos los miembros</option>
          {miembros.map(m => <option key={m.profile_id} value={m.profile_id}>{m.nombre}</option>)}
        </select>
      </div>

      {tareasFiltradas.length === 0 ? (
        <div className="empty-state">
          <div className="icon">✅</div>
          <p>No hay tareas{filtroEstado !== 'all' || filtroAsignado !== 'all' ? ' con estos filtros' : ''}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tareasFiltradas.map(tarea => {
            const vencida = isVencida(tarea)
            const total = totalPresupuesto(tarea.presupuesto)
            return (
              <div key={tarea.id} className="card" style={{ padding: '12px 16px', borderColor: vencida ? 'rgba(239,68,68,0.3)' : 'var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <select value={tarea.estado} onChange={e => handleEstadoChange(tarea.id, e.target.value)}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-2)', borderRadius: 6, color: ESTADO_COLORS[tarea.estado], fontSize: 11, fontWeight: 600, padding: '3px 6px', cursor: 'pointer', flexShrink: 0 }}>
                  {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
                </select>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: tarea.estado === 'hecha' ? 'var(--text-3)' : 'var(--text-1)', textDecoration: tarea.estado === 'hecha' ? 'line-through' : 'none' }} className="truncate">
                    {tarea.titulo}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: PRIORIDAD_COLORS[tarea.prioridad] }}>{tarea.prioridad}</span>
                    {tarea.fecha_limite && <span style={{ fontSize: 11, color: vencida ? 'var(--danger)' : 'var(--text-3)' }}>{vencida ? '⚠ ' : ''}{tarea.fecha_limite}</span>}
                    {tarea.asignado_a && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>→ {miembros.find(m => m.profile_id === tarea.asignado_a)?.nombre || '?'}</span>}
                    {total > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 99, padding: '1px 7px', fontWeight: 600 }}>
                        💰 {fmtMXN(total)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(tarea)}>✏</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(tarea.id)}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar tarea' : 'Nueva tarea'} size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : (editId ? 'Guardar' : 'Crear')}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="label">Título *</label>
            <input className="input" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="¿Qué hay que hacer?" autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Descripción</label>
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Detalles adicionales..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Prioridad</label>
              <select className="input" value={form.prioridad} onChange={e => setForm(p => ({ ...p, prioridad: e.target.value }))}>
                {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Estado</label>
              <select className="input" value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
                {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Asignar a</label>
              <select className="input" value={form.asignado_a} onChange={e => setForm(p => ({ ...p, asignado_a: e.target.value }))}>
                <option value="">Sin asignar</option>
                {miembros.map(m => <option key={m.profile_id} value={m.profile_id}>{m.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Fecha límite</label>
              <input className="input" type="date" value={form.fecha_limite} onChange={e => setForm(p => ({ ...p, fecha_limite: e.target.value }))} />
            </div>
          </div>

          {/* Presupuesto */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showPresupuesto ? 12 : 0 }}>
              <button type="button" onClick={() => { setShowPresupuesto(v => !v); if (!showPresupuesto && form.presupuesto.length === 0) addItem() }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: showPresupuesto ? 'var(--success)' : 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                <span style={{ fontSize: 16 }}>💰</span>
                {showPresupuesto ? 'Presupuesto estimado' : '+ Agregar presupuesto estimado'}
              </button>
              {showPresupuesto && form.presupuesto.length > 0 && (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>
                  Total: {fmtMXN(totalPresupuesto(form.presupuesto))}
                </span>
              )}
            </div>

            {showPresupuesto && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form.presupuesto.map((item, i) => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 1fr auto', gap: 8, alignItems: 'start', padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border-2)' }}>
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Concepto</p>
                      <input className="input" style={{ fontSize: 12 }} value={item.concepto} onChange={e => updateItem(item.id, 'concepto', e.target.value)} placeholder={`Ítem ${i + 1}`} />
                    </div>
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Para qué</p>
                      <input className="input" style={{ fontSize: 12 }} value={item.para_que || ''} onChange={e => updateItem(item.id, 'para_que', e.target.value)} placeholder="Propósito del gasto" />
                    </div>
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Precio</p>
                      <input className="input" style={{ fontSize: 12 }} type="number" value={item.precio} onChange={e => updateItem(item.id, 'precio', e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Dónde comprar</p>
                      <input className="input" style={{ fontSize: 12 }} value={item.tienda} onChange={e => updateItem(item.id, 'tienda', e.target.value)} placeholder="Tienda o proveedor" />
                    </div>
                    <button type="button" onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 16, cursor: 'pointer', padding: '4px', marginTop: 20, lineHeight: 1 }}>✕</button>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '6px 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Link del producto</p>
                      <input className="input" style={{ fontSize: 12 }} type="url" value={item.link} onChange={e => updateItem(item.id, 'link', e.target.value)} placeholder="https://..." />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addItem}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', background: 'var(--bg-input)', border: '1px dashed var(--border-2)', borderRadius: 8, color: 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.color = 'var(--text-3)' }}
                >
                  + Agregar ítem
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

import React, { useEffect, useState, useMemo } from 'react'
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
const PRIORIDAD_COLORS = { baja: '#6b7280', media: '#f59e0b', alta: '#f97316', critica: '#ef4444' }
const ESTADO_LABELS = { pendiente: 'Pendiente', en_progreso: 'En progreso', bloqueada: 'Bloqueada', hecha: 'Hecha', cancelada: 'Cancelada' }
const PRIORIDAD_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' }

// Grupos de estados: activas primero, completadas al final (colapsadas)
const GRUPOS = [
  { key: 'en_progreso', label: '🔵 En progreso', color: 'var(--accent)' },
  { key: 'bloqueada',   label: '🔴 Bloqueadas',  color: 'var(--danger)' },
  { key: 'pendiente',   label: '⚪ Pendientes',   color: 'var(--text-3)' },
  { key: 'hecha',       label: '✅ Hechas',       color: 'var(--success)' },
  { key: 'cancelada',   label: '✖ Canceladas',   color: 'var(--text-4)' },
]

function uid() { return Math.random().toString(36).slice(2, 10) }
function empty() {
  return { titulo: '', descripcion: '', asignado_a: '', prioridad: 'media', estado: 'pendiente', fecha_limite: '', presupuesto: [], objetivo_id: '' }
}
function fmtMXN(n) {
  const v = parseFloat(n); if (!v) return ''
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 })
}
function totalPresupuesto(items) { return (items || []).reduce((s, it) => s + (parseFloat(it.precio) || 0), 0) }

// ─── Chip componente ──────────────────────────────────────
function Chip({ active, onClick, children, color }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        padding: '5px 14px', borderRadius: 20, border: `1px solid ${active ? (color || 'var(--accent)') : 'var(--border-2)'}`,
        background: active ? (color || 'var(--accent)') + '18' : 'var(--bg-input)',
        color: active ? (color || 'var(--accent)') : 'var(--text-3)',
        fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0,
        whiteSpace: 'nowrap'
      }}>
      {children}
    </button>
  )
}

// ─── TareaRow ─────────────────────────────────────────────
function TareaRow({ tarea, onEstado, onEdit, onDelete, miembros, objetivos, isVencida }) {
  const total = totalPresupuesto(tarea.presupuesto)
  const responsable = miembros.find(m => m.profile_id === tarea.asignado_a)
  const objetivo = objetivos.find(o => o.id === tarea.objetivo_id)
  const vencida = isVencida(tarea)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      background: 'var(--bg-card)',
      border: `1px solid ${vencida ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
      borderLeft: `4px solid ${PRIORIDAD_COLORS[tarea.prioridad] || 'var(--border)'}`,
      borderRadius: 8, transition: 'all 0.1s'
    }}>
      {/* Estado selector */}
      <select value={tarea.estado} onChange={e => onEstado(tarea.id, e.target.value)}
        style={{
          background: 'var(--bg-input)', border: '1px solid var(--border-2)', borderRadius: 6,
          color: ESTADO_COLORS[tarea.estado], fontSize: 11, fontWeight: 700, padding: '3px 6px',
          cursor: 'pointer', flexShrink: 0, textTransform: 'uppercase'
        }}>
        {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
      </select>

      {/* Contenido */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, lineHeight: 1.35,
          color: tarea.estado === 'hecha' ? 'var(--text-3)' : 'var(--text-1)',
          textDecoration: tarea.estado === 'hecha' ? 'line-through' : 'none'
        }} className="truncate">
          {tarea.titulo}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          {tarea.fecha_limite && (
            <span style={{ fontSize: 11, color: vencida ? 'var(--danger)' : 'var(--text-3)', fontWeight: vencida ? 600 : 400 }}>
              {vencida ? '⚠ ' : '📅 '}{tarea.fecha_limite}
            </span>
          )}
          {responsable && (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              → {responsable.profiles?.nombre?.split(' ')[0] || responsable.nombre?.split(' ')[0] || '?'}
            </span>
          )}
          {objetivo && (
            <span style={{ fontSize: 10, color: '#6366f1', background: 'rgba(99,102,241,0.1)', padding: '1px 7px', borderRadius: 8 }}>
              🎯 {objetivo.titulo.slice(0, 28)}{objetivo.titulo.length > 28 ? '…' : ''}
            </span>
          )}
          {total > 0 && (
            <span style={{ fontSize: 11, color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 99, padding: '1px 7px', fontWeight: 600 }}>
              💰 {fmtMXN(total)}
            </span>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(tarea)}>✏</button>
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => onDelete(tarea.id)}>✕</button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────
export default function Tareas() {
  const location = useLocation()
  const { workspace, miembro, miembros, sucursal } = useStore()

  const [tareas, setTareas] = useState([])
  const [objetivos, setObjetivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showPresupuesto, setShowPresupuesto] = useState(false)

  // Filtros
  const [filtroRapido, setFiltroRapido] = useState('todos')   // todos | mis_tareas | hoy | vencidas | esta_semana
  const [filtroEstado, setFiltroEstado] = useState('all')
  const [filtroObjetivo, setFiltroObjetivo] = useState('all')

  // Grupos colapsados (hechas y canceladas empiezan colapsadas)
  const [colapsados, setColapsados] = useState({ hecha: true, cancelada: true })

  const today = new Date().toISOString().split('T')[0]
  const getSemana = () => {
    const hoy = new Date(); const dow = hoy.getDay() === 0 ? 7 : hoy.getDay()
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - dow + 1)
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
    return { inicio: lunes.toISOString().split('T')[0], fin: domingo.toISOString().split('T')[0] }
  }

  useEffect(() => { if (workspace?.id) { loadTareas(); loadObjetivos() } }, [workspace, sucursal])

  useEffect(() => {
    if (location.state?.openCreate) {
      setForm(empty()); setEditId(null); setShowPresupuesto(false); setModalOpen(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  async function loadTareas() {
    setLoading(true)
    let q = supabase.from('bos_tareas').select('*').eq('fabrica_id', workspace.id).order('created_at', { ascending: false })
    if (sucursal?.id) q = q.eq('sucursal_id', sucursal.id)
    const { data } = await q
    setTareas(data || [])
    setLoading(false)
  }

  async function loadObjetivos() {
    const { data } = await supabase.from('bos_objetivos').select('id,titulo').eq('fabrica_id', workspace.id).not('estado', 'in', '("completado","cancelado")').order('titulo')
    setObjetivos(data || [])
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
        objetivo_id: form.objetivo_id || null,
        sucursal_id: miembro?.sucursal_id || null,
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
    await supabase.from('bos_tareas').delete().eq('id', id)
    toast.success('Eliminada')
    loadTareas()
  }

  async function handleEstadoChange(id, nuevoEstado) {
    const { error } = await supabase.from('bos_tareas').update({ estado: nuevoEstado }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setTareas(prev => prev.map(t => t.id === id ? { ...t, estado: nuevoEstado } : t))
    if (nuevoEstado === 'hecha') setColapsados(p => ({ ...p, hecha: false }))
  }

  function openEdit(tarea) {
    setForm({
      titulo: tarea.titulo, descripcion: tarea.descripcion || '',
      asignado_a: tarea.asignado_a || '', prioridad: tarea.prioridad || 'media',
      estado: tarea.estado || 'pendiente', fecha_limite: tarea.fecha_limite || '',
      presupuesto: tarea.presupuesto || [], objetivo_id: tarea.objetivo_id || ''
    })
    setShowPresupuesto(!!(tarea.presupuesto?.length))
    setEditId(tarea.id); setModalOpen(true)
  }

  function addItem() {
    setForm(p => ({ ...p, presupuesto: [...p.presupuesto, { id: uid(), concepto: '', para_que: '', precio: '', tienda: '', link: '' }] }))
  }
  function updateItem(id, field, val) {
    setForm(p => ({ ...p, presupuesto: p.presupuesto.map(it => it.id === id ? { ...it, [field]: val } : it) }))
  }
  function removeItem(id) {
    setForm(p => ({ ...p, presupuesto: p.presupuesto.filter(it => it.id !== id) }))
  }

  function exportarPresupuestos() {
    const con = tareas.filter(t => t.presupuesto?.length > 0)
    if (!con.length) { toast.error('No hay presupuestos'); return }
    const filas = [['Tarea', 'Estado', 'Prioridad', 'Concepto', 'Para qué', 'Precio', 'Dónde comprar', 'Link']]
    con.forEach(t => {
      t.presupuesto.forEach(it => filas.push([t.titulo, t.estado, t.prioridad, it.concepto || '', it.para_que || '', parseFloat(it.precio) || 0, it.tienda || '', it.link || '']))
      if (t.presupuesto.length > 1) filas.push([t.titulo, '', '', 'TOTAL', '', totalPresupuesto(t.presupuesto), '', ''])
    })
    const csv = filas.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `presupuestos_${today}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  const isVencida = (t) => t.fecha_limite && t.fecha_limite < today && !['hecha', 'cancelada'].includes(t.estado)

  // ── Filtrado ──
  const tareasFiltradas = useMemo(() => {
    const semana = getSemana()
    return tareas.filter(t => {
      if (filtroEstado !== 'all' && t.estado !== filtroEstado) return false
      if (filtroObjetivo !== 'all' && t.objetivo_id !== filtroObjetivo) return false
      switch (filtroRapido) {
        case 'mis_tareas':   return t.asignado_a === miembro?.profile_id || t.created_by === miembro?.profile_id
        case 'hoy':          return t.fecha_limite === today
        case 'vencidas':     return isVencida(t)
        case 'esta_semana':  return t.fecha_limite >= semana.inicio && t.fecha_limite <= semana.fin
        default:             return true
      }
    })
  }, [tareas, filtroRapido, filtroEstado, filtroObjetivo, miembro, today])

  // ── Conteos para chips ──
  const semana = getSemana()
  const cMis = tareas.filter(t => t.asignado_a === miembro?.profile_id || t.created_by === miembro?.profile_id).length
  const cHoy = tareas.filter(t => t.fecha_limite === today && !['hecha', 'cancelada'].includes(t.estado)).length
  const cVencidas = tareas.filter(t => isVencida(t)).length
  const cSemana = tareas.filter(t => t.fecha_limite >= semana.inicio && t.fecha_limite <= semana.fin && !['hecha', 'cancelada'].includes(t.estado)).length

  // ── Agrupación por estado ──
  const tareasAgrupadas = useMemo(() => {
    return GRUPOS.map(g => ({
      ...g,
      items: tareasFiltradas.filter(t => t.estado === g.key)
    })).filter(g => g.items.length > 0)
  }, [tareasFiltradas])

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
    </div>
  )

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Tareas</h1>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {tareasFiltradas.filter(t => !['hecha', 'cancelada'].includes(t.estado)).length} activas · {tareas.filter(t => t.estado === 'hecha').length} completadas
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tareas.some(t => t.presupuesto?.length > 0) && (
            <button className="btn btn-secondary btn-sm" onClick={exportarPresupuestos}>⬇ Excel</button>
          )}
          <button className="btn btn-primary" onClick={() => { setForm(empty()); setShowPresupuesto(false); setEditId(null); setModalOpen(true) }}>
            + Nueva tarea
          </button>
        </div>
      </div>

      {/* Filtros rápidos — chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
        <Chip active={filtroRapido === 'todos'} onClick={() => setFiltroRapido('todos')}>Todos ({tareas.length})</Chip>
        <Chip active={filtroRapido === 'mis_tareas'} onClick={() => setFiltroRapido('mis_tareas')}>Mis tareas ({cMis})</Chip>
        {cHoy > 0 && <Chip active={filtroRapido === 'hoy'} onClick={() => setFiltroRapido('hoy')} color="#f59e0b">Hoy ({cHoy})</Chip>}
        {cVencidas > 0 && <Chip active={filtroRapido === 'vencidas'} onClick={() => setFiltroRapido('vencidas')} color="#ef4444">Vencidas ({cVencidas})</Chip>}
        {cSemana > 0 && <Chip active={filtroRapido === 'esta_semana'} onClick={() => setFiltroRapido('esta_semana')}>Esta semana ({cSemana})</Chip>}
      </div>

      {/* Filtros secundarios */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 'auto', fontSize: 12 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="all">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
        </select>
        {objetivos.length > 0 && (
          <select className="input" style={{ width: 'auto', fontSize: 12, maxWidth: 200 }} value={filtroObjetivo} onChange={e => setFiltroObjetivo(e.target.value)}>
            <option value="all">Todos los objetivos</option>
            {objetivos.map(o => <option key={o.id} value={o.id}>{o.titulo.slice(0, 36)}</option>)}
          </select>
        )}
      </div>

      {/* Lista agrupada */}
      {tareasFiltradas.length === 0 ? (
        <div className="empty-state">
          <div className="icon">✅</div>
          <p>No hay tareas{filtroRapido !== 'todos' || filtroEstado !== 'all' ? ' con estos filtros' : ''}</p>
          {filtroRapido !== 'todos' && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setFiltroRapido('todos'); setFiltroEstado('all'); setFiltroObjetivo('all') }}>
              Quitar filtros
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {tareasAgrupadas.map(grupo => {
            const colapsado = colapsados[grupo.key]
            return (
              <div key={grupo.key}>
                {/* Cabecera del grupo */}
                <button
                  onClick={() => setColapsados(p => ({ ...p, [grupo.key]: !p[grupo.key] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px',
                    borderBottom: `1px solid ${grupo.color}30`, marginBottom: 8
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: grupo.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {grupo.label}
                  </span>
                  <span style={{ fontSize: 11, background: grupo.color + '18', color: grupo.color, padding: '1px 8px', borderRadius: 10, fontWeight: 700 }}>
                    {grupo.items.length}
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-4)', fontSize: 11 }}>{colapsado ? '▶' : '▼'}</span>
                </button>

                {!colapsado && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {grupo.items.map(tarea => (
                      <TareaRow
                        key={tarea.id} tarea={tarea}
                        onEstado={handleEstadoChange} onEdit={openEdit} onDelete={handleDelete}
                        miembros={miembros} objetivos={objetivos} isVencida={isVencida}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar tarea' : 'Nueva tarea'} size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : (editId ? 'Guardar' : 'Crear')}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Título */}
          <div className="form-group">
            <label className="label">Título *</label>
            <input className="input" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="¿Qué hay que hacer?" autoFocus />
          </div>

          {/* Descripción */}
          <div className="form-group">
            <label className="label">Descripción</label>
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Detalles adicionales..." rows={2} />
          </div>

          {/* Prioridad + Estado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Prioridad</label>
              <select className="input" value={form.prioridad} onChange={e => setForm(p => ({ ...p, prioridad: e.target.value }))}>
                {PRIORIDADES.map(p => <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Estado</label>
              <select className="input" value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
                {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
              </select>
            </div>
          </div>

          {/* Asignado + Fecha */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Asignar a</label>
              <select className="input" value={form.asignado_a} onChange={e => setForm(p => ({ ...p, asignado_a: e.target.value }))}>
                <option value="">Sin asignar</option>
                {miembros.map(m => (
                  <option key={m.profile_id} value={m.profile_id}>
                    {m.profiles?.nombre || m.nombre || m.profile_id}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Fecha límite</label>
              <input className="input" type="date" value={form.fecha_limite} onChange={e => setForm(p => ({ ...p, fecha_limite: e.target.value }))} />
            </div>
          </div>

          {/* Objetivo */}
          {objetivos.length > 0 && (
            <div className="form-group">
              <label className="label">Vincular a objetivo</label>
              <select className="input" value={form.objetivo_id} onChange={e => setForm(p => ({ ...p, objetivo_id: e.target.value }))}>
                <option value="">Sin objetivo</option>
                {objetivos.map(o => <option key={o.id} value={o.id}>🎯 {o.titulo}</option>)}
              </select>
            </div>
          )}

          {/* Presupuesto */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showPresupuesto ? 12 : 0 }}>
              <button type="button" onClick={() => { setShowPresupuesto(v => !v); if (!showPresupuesto && form.presupuesto.length === 0) addItem() }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: showPresupuesto ? 'var(--success)' : 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                <span>💰</span>
                {showPresupuesto ? 'Presupuesto estimado' : '+ Agregar presupuesto estimado'}
              </button>
              {showPresupuesto && form.presupuesto.length > 0 && (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>Total: {fmtMXN(totalPresupuesto(form.presupuesto))}</span>
              )}
            </div>
            {showPresupuesto && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form.presupuesto.map((item, i) => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 1fr auto', gap: 8, alignItems: 'start', padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border-2)' }}>
                    {[
                      { field: 'concepto', label: 'Concepto', placeholder: `Ítem ${i + 1}` },
                      { field: 'para_que', label: 'Para qué', placeholder: 'Propósito' },
                      { field: 'precio', label: 'Precio', placeholder: '0.00', type: 'number' },
                      { field: 'tienda', label: 'Dónde comprar', placeholder: 'Tienda / proveedor' },
                    ].map(({ field, label, placeholder, type }) => (
                      <div key={field}>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</p>
                        <input className="input" style={{ fontSize: 12 }} type={type || 'text'} value={item[field] || ''} onChange={e => updateItem(item.id, field, e.target.value)} placeholder={placeholder} />
                      </div>
                    ))}
                    <button type="button" onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 16, cursor: 'pointer', padding: '4px', marginTop: 20, lineHeight: 1 }}>✕</button>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '6px 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Link del producto</p>
                      <input className="input" style={{ fontSize: 12 }} type="url" value={item.link || ''} onChange={e => updateItem(item.id, 'link', e.target.value)} placeholder="https://..." />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addItem}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', background: 'var(--bg-input)', border: '1px dashed var(--border-2)', borderRadius: 8, color: 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.color = 'var(--text-3)' }}>
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

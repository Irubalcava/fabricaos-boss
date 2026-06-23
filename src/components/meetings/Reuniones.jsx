import React, { useEffect, useState } from 'react'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { generateSummary } from '../../lib/claude.js'

const TIPOS = ['semanal', 'mensual', 'extraordinaria', 'one_on_one', 'estratégica', 'otro']
const ESTADOS = ['programada', 'en_curso', 'realizada', 'cancelada']

function empty() {
  return {
    titulo: '',
    tipo: 'semanal',
    fecha: new Date().toISOString().split('T')[0],
    hora_inicio: '09:00',
    hora_fin: '10:00',
    descripcion: '',
    estado: 'programada'
  }
}

export default function Reuniones() {
  const { workspace, miembro, miembros } = useStore()
  const [reuniones, setReuniones] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDetail, setModalDetail] = useState(null)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [acuerdoNuevo, setAcuerdoNuevo] = useState('')
  const [acuerdos, setAcuerdos] = useState([])
  const [resumiendo, setResumiendo] = useState(false)
  const [resumenIA, setResumenIA] = useState('')

  useEffect(() => {
    if (workspace?.id) loadReuniones()
  }, [workspace])

  async function loadReuniones() {
    setLoading(true)
    const { data } = await supabase
      .from('bos_reuniones')
      .select('*')
      .eq('fabrica_id', workspace.id)
      .order('fecha', { ascending: false })
      .order('hora_inicio', { ascending: false })
    setReuniones(data || [])
    setLoading(false)
  }

  async function openDetail(reunion) {
    setModalDetail(reunion)
    const { data } = await supabase
      .from('bos_acuerdos_reunion')
      .select('*')
      .eq('reunion_id', reunion.id)
      .order('created_at')
    setAcuerdos(data || [])
    setAcuerdoNuevo('')
    setResumenIA('')
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('El título es requerido'); return }
    setSaving(true)
    try {
      const payload = {
        fabrica_id: workspace.id,
        titulo: form.titulo.trim(),
        tipo: form.tipo,
        fecha: form.fecha,
        hora_inicio: form.hora_inicio || null,
        hora_fin: form.hora_fin || null,
        descripcion: form.descripcion.trim() || null,
        estado: form.estado,
        created_by: miembro?.profile_id
      }
      if (editId) {
        const { error } = await supabase.from('bos_reuniones').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Reunión actualizada')
      } else {
        const { error } = await supabase.from('bos_reuniones').insert(payload)
        if (error) throw error
        toast.success('Reunión creada')
      }
      setModalOpen(false)
      loadReuniones()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta reunión?')) return
    const { error } = await supabase.from('bos_reuniones').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Reunión eliminada')
    loadReuniones()
  }

  async function handleAddAcuerdo() {
    if (!acuerdoNuevo.trim()) return
    const { error, data } = await supabase.from('bos_acuerdos_reunion').insert({
      reunion_id: modalDetail.id,
      fabrica_id: workspace.id,
      descripcion: acuerdoNuevo.trim(),
      created_by: miembro?.profile_id
    }).select().single()
    if (error) { toast.error(error.message); return }
    setAcuerdos(prev => [...prev, data])
    setAcuerdoNuevo('')
    // Auto-create task
    await supabase.from('bos_tareas').insert({
      fabrica_id: workspace.id,
      titulo: acuerdoNuevo.trim(),
      descripcion: `Acuerdo de reunión: ${modalDetail.titulo}`,
      estado: 'pendiente',
      prioridad: 'media',
      created_by: miembro?.profile_id
    })
    toast.success('Acuerdo añadido y tarea creada')
  }

  async function handleDeleteAcuerdo(id) {
    const { error } = await supabase.from('bos_acuerdos_reunion').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setAcuerdos(prev => prev.filter(a => a.id !== id))
  }

  async function handleResumenIA() {
    if (!modalDetail) return
    setResumiendo(true)
    try {
      const acuerdosTexto = acuerdos.map((a, i) => `${i + 1}. ${a.descripcion}`).join('\n')
      const prompt = `Resume esta reunión de negocios en 3-4 oraciones ejecutivas:
Reunión: ${modalDetail.titulo}
Tipo: ${modalDetail.tipo}
Fecha: ${modalDetail.fecha}
Descripción/Agenda: ${modalDetail.descripcion || 'No especificada'}
Acuerdos tomados:
${acuerdosTexto || 'Sin acuerdos registrados'}

Resumen ejecutivo:`
      const res = await generateSummary(prompt)
      setResumenIA(res)
    } catch (e) {
      toast.error('Error generando resumen')
    } finally {
      setResumiendo(false)
    }
  }

  async function handleEstadoChange(id, estado) {
    const { error } = await supabase.from('bos_reuniones').update({ estado }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setReuniones(prev => prev.map(r => r.id === id ? { ...r, estado } : r))
  }

  const ESTADO_COLORS = {
    programada: 'var(--accent)',
    en_curso: 'var(--warning)',
    realizada: 'var(--success)',
    cancelada: 'var(--text-3)'
  }

  const today = new Date().toISOString().split('T')[0]
  const reunionesHoy = reuniones.filter(r => r.fecha === today)
  const reunionesPasadas = reuniones.filter(r => r.fecha < today)
  const reunionesFuturas = reuniones.filter(r => r.fecha > today)

  if (loading) {
    return <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div className="spinner" /></div>
  }

  function ReunionesList({ items, titulo }) {
    if (!items.length) return null
    return (
      <div style={{ marginBottom: 24 }}>
        <div className="section-title">{titulo}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(r => (
            <div key={r.id} className="card" style={{ padding: '12px 16px', cursor: 'pointer' }}
              onClick={() => openDetail(r)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: ESTADO_COLORS[r.estado],
                      background: ESTADO_COLORS[r.estado] + '18',
                      padding: '2px 8px', borderRadius: 10
                    }}>{r.estado}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.tipo}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{r.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    {r.fecha} {r.hora_inicio && `· ${r.hora_inicio}${r.hora_fin ? ' – ' + r.hora_fin : ''}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <select
                    value={r.estado}
                    onChange={e => handleEstadoChange(r.id, e.target.value)}
                    style={{ fontSize: 11, background: 'var(--bg-input)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '3px 6px', color: ESTADO_COLORS[r.estado], cursor: 'pointer' }}
                  >
                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    setForm({ titulo: r.titulo, tipo: r.tipo, fecha: r.fecha, hora_inicio: r.hora_inicio || '', hora_fin: r.hora_fin || '', descripcion: r.descripcion || '', estado: r.estado })
                    setEditId(r.id)
                    setModalOpen(true)
                  }}>✏</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(r.id)}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Reuniones</h1>
        <button className="btn btn-primary" onClick={() => { setForm(empty()); setEditId(null); setModalOpen(true) }}>
          + Nueva reunión
        </button>
      </div>

      {reuniones.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🤝</div>
          <p>No hay reuniones registradas</p>
        </div>
      ) : (
        <>
          <ReunionesList items={reunionesHoy} titulo="HOY" />
          <ReunionesList items={reunionesFuturas} titulo="PRÓXIMAS" />
          <ReunionesList items={reunionesPasadas} titulo="PASADAS" />
        </>
      )}

      {/* Modal crear/editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar reunión' : 'Nueva reunión'} size="md"
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
            <input className="input" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Ej: Revisión semanal de ventas" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Tipo</label>
              <select className="input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Estado</label>
              <select className="input" value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Fecha</label>
              <input className="input" type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Hora inicio</label>
              <input className="input" type="time" value={form.hora_inicio} onChange={e => setForm(p => ({ ...p, hora_inicio: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Hora fin</label>
              <input className="input" type="time" value={form.hora_fin} onChange={e => setForm(p => ({ ...p, hora_fin: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Agenda / Descripción</label>
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="¿Qué se tratará en esta reunión?" />
          </div>
        </div>
      </Modal>

      {/* Modal detalle / acuerdos */}
      <Modal open={!!modalDetail} onClose={() => setModalDetail(null)} title={modalDetail?.titulo} size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {modalDetail?.fecha} · {modalDetail?.hora_inicio} – {modalDetail?.hora_fin} · {modalDetail?.tipo}
          </div>
          {modalDetail?.descripcion && (
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{modalDetail.descripcion}</p>
          )}
          <hr className="divider" />
          <div style={{ fontWeight: 600, fontSize: 14 }}>Acuerdos y tareas</div>
          {acuerdos.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--success)' }}>✓</span>
              <span style={{ flex: 1, color: 'var(--text-1)' }}>{a.descripcion}</span>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteAcuerdo(a.id)}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              value={acuerdoNuevo}
              onChange={e => setAcuerdoNuevo(e.target.value)}
              placeholder="Nuevo acuerdo (se creará una tarea automáticamente)..."
              onKeyDown={e => e.key === 'Enter' && handleAddAcuerdo()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary btn-sm" onClick={handleAddAcuerdo}>+ Añadir</button>
          </div>
          <hr className="divider" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Resumen IA</span>
            <button className="btn btn-secondary btn-sm" onClick={handleResumenIA} disabled={resumiendo}>
              {resumiendo ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✨ Generar'}
            </button>
          </div>
          {resumenIA && (
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, background: 'var(--bg-input)', padding: 12, borderRadius: 8 }}>
              {resumenIA}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}

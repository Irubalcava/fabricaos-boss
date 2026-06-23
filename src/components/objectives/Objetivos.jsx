import React, { useEffect, useState } from 'react'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { checkDuplicadoObjetivo } from '../../lib/claude.js'

const ESTADOS = ['activo', 'en_pausa', 'completado', 'cancelado']
const PERIODICIDAD = ['semanal', 'mensual', 'trimestral', 'anual']

const ESTADO_COLORS = {
  activo: 'var(--accent)',
  en_pausa: 'var(--warning)',
  completado: 'var(--success)',
  cancelado: 'var(--text-3)'
}

function empty() {
  return { titulo: '', descripcion: '', responsable: '', fecha_inicio: '', fecha_fin: '', periodicidad: 'mensual', estado: 'activo' }
}

export default function Objetivos() {
  const { workspace, miembro, miembros } = useStore()
  const [objetivos, setObjetivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [duplicadoWarning, setDuplicadoWarning] = useState('')
  const [checkingDup, setCheckingDup] = useState(false)
  const [modalKr, setModalKr] = useState(null)
  const [krList, setKrList] = useState([])
  const [newKr, setNewKr] = useState({ descripcion: '', meta: '', progreso: 0 })
  const [filtroEstado, setFiltroEstado] = useState('all')

  useEffect(() => {
    if (workspace?.id) loadObjetivos()
  }, [workspace])

  async function loadObjetivos() {
    setLoading(true)
    const { data } = await supabase
      .from('bos_objetivos')
      .select('*, bos_key_results(*)')
      .eq('fabrica_id', workspace.id)
      .order('created_at', { ascending: false })
    setObjetivos(data || [])
    setLoading(false)
  }

  async function checkDuplicate(titulo) {
    if (!titulo || titulo.length < 10) return
    setCheckingDup(true)
    try {
      const resultado = await checkDuplicadoObjetivo(titulo, objetivos)
      if (resultado && !resultado.toLowerCase().includes('sin duplicados')) {
        setDuplicadoWarning(resultado)
      } else {
        setDuplicadoWarning('')
      }
    } catch {
      setDuplicadoWarning('')
    } finally {
      setCheckingDup(false)
    }
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('El título es requerido'); return }
    setSaving(true)
    try {
      const payload = {
        fabrica_id: workspace.id,
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        responsable: form.responsable || null,
        fecha_inicio: form.fecha_inicio || null,
        fecha_fin: form.fecha_fin || null,
        periodicidad: form.periodicidad,
        estado: form.estado,
        created_by: miembro?.profile_id
      }
      if (editId) {
        const { error } = await supabase.from('bos_objetivos').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Objetivo actualizado')
      } else {
        const { error } = await supabase.from('bos_objetivos').insert(payload)
        if (error) throw error
        toast.success('Objetivo creado')
        await supabase.from('bos_bitacora').insert({
          fabrica_id: workspace.id,
          tipo: 'objetivo',
          titulo: `Nuevo objetivo: ${form.titulo}`,
          automatico: true,
          created_by: miembro?.profile_id
        })
      }
      setModalOpen(false)
      setDuplicadoWarning('')
      loadObjetivos()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este objetivo?')) return
    const { error } = await supabase.from('bos_objetivos').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Objetivo eliminado')
    loadObjetivos()
  }

  async function handleEstadoChange(id, estado) {
    const { error } = await supabase.from('bos_objetivos').update({ estado }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setObjetivos(prev => prev.map(o => o.id === id ? { ...o, estado } : o))
  }

  async function openKrModal(obj) {
    setModalKr(obj)
    const { data } = await supabase.from('bos_key_results').select('*').eq('objetivo_id', obj.id).order('created_at')
    setKrList(data || [])
    setNewKr({ descripcion: '', meta: '', progreso: 0 })
  }

  async function handleAddKr() {
    if (!newKr.descripcion.trim()) { toast.error('Descripción requerida'); return }
    const { error } = await supabase.from('bos_key_results').insert({
      objetivo_id: modalKr.id,
      fabrica_id: workspace.id,
      descripcion: newKr.descripcion.trim(),
      meta: newKr.meta ? parseFloat(newKr.meta) : null,
      progreso: parseFloat(newKr.progreso) || 0
    })
    if (error) { toast.error(error.message); return }
    const { data } = await supabase.from('bos_key_results').select('*').eq('objetivo_id', modalKr.id).order('created_at')
    setKrList(data || [])
    setNewKr({ descripcion: '', meta: '', progreso: 0 })
    toast.success('Key Result añadido')
    loadObjetivos()
  }

  async function handleKrProgreso(krId, progreso) {
    const { error } = await supabase.from('bos_key_results').update({ progreso: parseFloat(progreso) }).eq('id', krId)
    if (error) { toast.error(error.message); return }
    setKrList(prev => prev.map(k => k.id === krId ? { ...k, progreso: parseFloat(progreso) } : k))
    loadObjetivos()
  }

  async function handleDeleteKr(krId) {
    const { error } = await supabase.from('bos_key_results').delete().eq('id', krId)
    if (error) { toast.error(error.message); return }
    setKrList(prev => prev.filter(k => k.id !== krId))
    loadObjetivos()
  }

  function calcProgreso(obj) {
    const krs = obj.bos_key_results || []
    if (!krs.length) return 0
    const avg = krs.reduce((sum, k) => {
      const pct = k.meta ? Math.min(100, (k.progreso / k.meta) * 100) : k.progreso
      return sum + pct
    }, 0) / krs.length
    return Math.round(avg)
  }

  const objetivosFiltrados = filtroEstado === 'all' ? objetivos : objetivos.filter(o => o.estado === filtroEstado)

  if (loading) {
    return <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div className="spinner" /></div>
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Objetivos (OKRs)</h1>
        <button className="btn btn-primary" onClick={() => { setForm(empty()); setEditId(null); setDuplicadoWarning(''); setModalOpen(true) }}>
          + Nuevo objetivo
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', ...ESTADOS].map(e => (
          <button key={e} className={`btn btn-sm ${filtroEstado === e ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFiltroEstado(e)}>
            {e === 'all' ? 'Todos' : e}
          </button>
        ))}
      </div>

      {objetivosFiltrados.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🎯</div>
          <p>No hay objetivos</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {objetivosFiltrados.map(obj => {
            const progreso = calcProgreso(obj)
            const krs = obj.bos_key_results || []
            return (
              <div key={obj.id} className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: ESTADO_COLORS[obj.estado],
                        background: ESTADO_COLORS[obj.estado] + '18',
                        padding: '2px 8px', borderRadius: 10
                      }}>{obj.estado}</span>
                      {obj.fecha_fin && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Hasta {obj.fecha_fin}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>{obj.titulo}</div>
                    {obj.descripcion && (
                      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>{obj.descripcion}</div>
                    )}
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: 'var(--text-3)' }}>
                        <span>{krs.length} key results</span>
                        <span style={{ color: progreso >= 80 ? 'var(--success)' : progreso >= 50 ? 'var(--warning)' : 'var(--text-2)', fontWeight: 600 }}>{progreso}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{
                          width: `${progreso}%`,
                          background: progreso >= 80 ? 'var(--success)' : progreso >= 50 ? 'var(--warning)' : 'var(--accent)'
                        }} />
                      </div>
                    </div>
                    {krs.slice(0, 3).map(kr => (
                      <div key={kr.id} style={{ fontSize: 12, color: 'var(--text-3)', paddingLeft: 12, borderLeft: '2px solid var(--border)', marginTop: 4 }}>
                        {kr.descripcion}
                        {kr.meta ? ` — ${kr.progreso}/${kr.meta}` : ''}
                      </div>
                    ))}
                    {krs.length > 3 && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, paddingLeft: 12 }}>+{krs.length - 3} más</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openKrModal(obj)}>KRs</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setForm({ titulo: obj.titulo, descripcion: obj.descripcion || '', responsable: obj.responsable || '', fecha_inicio: obj.fecha_inicio || '', fecha_fin: obj.fecha_fin || '', periodicidad: obj.periodicidad || 'mensual', estado: obj.estado })
                      setEditId(obj.id)
                      setModalOpen(true)
                    }}>✏</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(obj.id)}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal objetivo */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar objetivo' : 'Nuevo objetivo'} size="md"
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
            <input className="input" value={form.titulo}
              onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
              onBlur={e => !editId && checkDuplicate(e.target.value)}
              placeholder="Ej: Incrementar ventas un 30% este trimestre" autoFocus />
            {checkingDup && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Verificando duplicados...</span>}
            {duplicadoWarning && <span style={{ fontSize: 11, color: 'var(--warning)' }}>⚠ {duplicadoWarning}</span>}
          </div>
          <div className="form-group">
            <label className="label">Descripción</label>
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="¿Por qué es importante este objetivo?" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Estado</label>
              <select className="input" value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Periodicidad</label>
              <select className="input" value={form.periodicidad} onChange={e => setForm(p => ({ ...p, periodicidad: e.target.value }))}>
                {PERIODICIDAD.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Fecha inicio</label>
              <input className="input" type="date" value={form.fecha_inicio} onChange={e => setForm(p => ({ ...p, fecha_inicio: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Fecha fin</label>
              <input className="input" type="date" value={form.fecha_fin} onChange={e => setForm(p => ({ ...p, fecha_fin: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Responsable</label>
            <select className="input" value={form.responsable} onChange={e => setForm(p => ({ ...p, responsable: e.target.value }))}>
              <option value="">Sin responsable</option>
              {miembros.map(m => <option key={m.profile_id} value={m.profile_id}>{m.nombre}</option>)}
            </select>
          </div>
        </div>
      </Modal>

      {/* Modal Key Results */}
      <Modal open={!!modalKr} onClose={() => setModalKr(null)} title={`Key Results: ${modalKr?.titulo}`} size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {krList.map(kr => (
            <div key={kr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-1)', marginBottom: 4 }}>{kr.descripcion}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min={0} max={kr.meta || 100} step={1}
                    value={kr.progreso}
                    onChange={e => handleKrProgreso(kr.id, e.target.value)}
                    style={{ flex: 1, accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--accent)', minWidth: 40 }}>
                    {kr.progreso}{kr.meta ? `/${kr.meta}` : '%'}
                  </span>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteKr(kr.id)}>✕</button>
            </div>
          ))}
          <hr className="divider" />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>Añadir Key Result</div>
          <div className="form-group">
            <input className="input" value={newKr.descripcion} onChange={e => setNewKr(p => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción del KR" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="label">Meta</label>
              <input className="input" type="number" value={newKr.meta} onChange={e => setNewKr(p => ({ ...p, meta: e.target.value }))} placeholder="Ej: 100" />
            </div>
            <div className="form-group">
              <label className="label">Progreso actual</label>
              <input className="input" type="number" value={newKr.progreso} onChange={e => setNewKr(p => ({ ...p, progreso: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={handleAddKr}>+ Añadir KR</button>
        </div>
      </Modal>
    </div>
  )
}

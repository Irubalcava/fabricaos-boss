import React, { useEffect, useState } from 'react'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { checkDuplicadoObjetivo, generarPlanObjetivo } from '../../lib/claude.js'

const ESTADOS = ['activo', 'en_pausa', 'completado', 'cancelado']
const PERIODICIDAD = ['semanal', 'mensual', 'trimestral', 'anual']
const AREAS_NEGOCIO = ['Ventas', 'Marketing', 'Operaciones', 'RH', 'Finanzas', 'Tecnología', 'Logística', 'Administración']
const TIPOS_OBJETIVO = [
  { value: 'crecer', label: 'Crecer' },
  { value: 'reducir', label: 'Reducir' },
  { value: 'mantener', label: 'Mantener' },
  { value: 'lanzar', label: 'Lanzar algo nuevo' },
]

const ESTADO_COLORS = {
  activo: 'var(--accent)', en_pausa: 'var(--warning)',
  completado: 'var(--success)', cancelado: 'var(--text-3)'
}

function empty() {
  return {
    titulo: '', descripcion: '', responsable: '', fecha_inicio: '',
    fecha_fin: '', periodicidad: 'mensual', estado: 'activo',
    kpi_ids: [], area: '', tipo: 'crecer'
  }
}

function fmtMXN(n) {
  const v = parseFloat(n)
  if (!v) return '$0'
  return `$${v.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`
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
  const [kpisDisponibles, setKpisDisponibles] = useState([])

  // Plan IA state
  const [objetivoParaPlan, setObjetivoParaPlan] = useState(null)
  const [generandoPlan, setGenerandoPlan] = useState(false)
  const [planIA, setPlanIA] = useState(null)
  const [aceptandoPlan, setAceptandoPlan] = useState(false)

  useEffect(() => {
    if (workspace?.id) { loadObjetivos(); loadKpisDisponibles() }
  }, [workspace])

  async function loadKpisDisponibles() {
    const { data } = await supabase.from('bos_kpis').select('id, nombre, unidad, tipo').eq('fabrica_id', workspace.id).eq('activo', true).order('nombre')
    setKpisDisponibles(data || [])
  }

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
        kpi_ids: form.kpi_ids?.length ? form.kpi_ids : null,
        area: form.area || null,
        tipo: form.tipo || null,
        created_by: miembro?.profile_id
      }

      if (editId) {
        const { error } = await supabase.from('bos_objetivos').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Objetivo actualizado')
        setModalOpen(false)
        setDuplicadoWarning('')
        loadObjetivos()
      } else {
        const { data: newObj, error } = await supabase.from('bos_objetivos').insert(payload).select().single()
        if (error) throw error
        await supabase.from('bos_bitacora').insert({
          fabrica_id: workspace.id, tipo: 'objetivo',
          titulo: `Nuevo objetivo: ${form.titulo}`, automatico: true,
          created_by: miembro?.profile_id
        })
        setModalOpen(false)
        setDuplicadoWarning('')
        loadObjetivos()
        // Trigger plan IA
        setObjetivoParaPlan(newObj)
        setGenerandoPlan(true)
        setPlanIA(null)
        try {
          const plan = await generarPlanObjetivo({
            titulo: newObj.titulo,
            descripcion: newObj.descripcion,
            area: newObj.area,
            tipo: newObj.tipo,
            periodicidad: newObj.periodicidad,
            fecha_inicio: newObj.fecha_inicio,
            fecha_fin: newObj.fecha_fin,
          })
          setPlanIA(plan)
        } catch {
          toast.error('No se pudo generar el plan IA')
          setPlanIA(null)
        } finally {
          setGenerandoPlan(false)
        }
      }
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function aceptarPlan() {
    if (!objetivoParaPlan || !planIA) return
    setAceptandoPlan(true)
    try {
      // Crear tareas en bos_tareas
      if (planIA.tareas?.length) {
        const tareasPayload = planIA.tareas.map(t => ({
          fabrica_id: workspace.id,
          titulo: t.titulo,
          descripcion: `${t.descripcion || ''}${t.duracion ? ` (${t.duracion})` : ''} — Objetivo: ${objetivoParaPlan.titulo}`,
          estado: 'pendiente',
          prioridad: 'media',
          created_by: miembro?.profile_id
        }))
        const { error } = await supabase.from('bos_tareas').insert(tareasPayload)
        if (error) throw error
      }

      // Crear key results desde métricas
      if (planIA.metricas?.length) {
        const krsPayload = planIA.metricas.map(m => ({
          objetivo_id: objetivoParaPlan.id,
          fabrica_id: workspace.id,
          descripcion: `${m.nombre} · ${m.frecuencia} · meta: ${m.meta} ${m.unidad}`,
          meta: parseFloat(m.meta) || null,
          progreso: 0
        }))
        const { error } = await supabase.from('bos_key_results').insert(krsPayload)
        if (error) throw error
      }

      // Guardar presupuesto y responsables en objetivo
      await supabase.from('bos_objetivos').update({
        plan_ia: {
          presupuesto: planIA.presupuesto || [],
          responsables: planIA.responsables || []
        }
      }).eq('id', objetivoParaPlan.id)

      toast.success(`Plan activado: ${planIA.tareas?.length || 0} tareas y ${planIA.metricas?.length || 0} métricas creadas`)
      setObjetivoParaPlan(null)
      setPlanIA(null)
      loadObjetivos()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAceptandoPlan(false)
    }
  }

  // Edición inline del plan
  function updatePlanTarea(i, field, val) {
    setPlanIA(p => ({ ...p, tareas: p.tareas.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }))
  }
  function removePlanTarea(i) {
    setPlanIA(p => ({ ...p, tareas: p.tareas.filter((_, idx) => idx !== i) }))
  }
  function updatePlanMetrica(i, field, val) {
    setPlanIA(p => ({ ...p, metricas: p.metricas.map((m, idx) => idx === i ? { ...m, [field]: val } : m) }))
  }
  function removePlanMetrica(i) {
    setPlanIA(p => ({ ...p, metricas: p.metricas.filter((_, idx) => idx !== i) }))
  }
  function updatePlanPresupuesto(i, field, val) {
    setPlanIA(p => ({ ...p, presupuesto: p.presupuesto.map((x, idx) => idx === i ? { ...x, [field]: val } : x) }))
  }
  function removePlanPresupuesto(i) {
    setPlanIA(p => ({ ...p, presupuesto: p.presupuesto.filter((_, idx) => idx !== i) }))
  }
  function removePlanResponsable(i) {
    setPlanIA(p => ({ ...p, responsables: p.responsables.filter((_, idx) => idx !== i) }))
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
      objetivo_id: modalKr.id, fabrica_id: workspace.id,
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

  const totalPresupuestoPlan = (items) => (items || []).reduce((s, x) => s + (parseFloat(x.monto) || 0), 0)

  const objetivosFiltrados = filtroEstado === 'all' ? objetivos : objetivos.filter(o => o.estado === filtroEstado)

  if (loading) {
    return <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div className="spinner" /></div>
  }

  const ROL_COLORS = { lidera: 'var(--accent)', apoya: 'var(--warning)', informa: 'var(--text-3)' }

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
            const planGuardado = obj.plan_ia
            return (
              <div key={obj.id} className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: ESTADO_COLORS[obj.estado],
                        background: ESTADO_COLORS[obj.estado] + '18', padding: '2px 8px', borderRadius: 10
                      }}>{obj.estado}</span>
                      {obj.area && (
                        <span style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent)15', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                          {obj.area}
                        </span>
                      )}
                      {obj.tipo && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 10 }}>
                          {TIPOS_OBJETIVO.find(t => t.value === obj.tipo)?.label || obj.tipo}
                        </span>
                      )}
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
                        {kr.descripcion}{kr.meta ? ` — ${kr.progreso}/${kr.meta}` : ''}
                      </div>
                    ))}
                    {krs.length > 3 && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, paddingLeft: 12 }}>+{krs.length - 3} más</div>
                    )}
                    {planGuardado?.presupuesto?.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                        💰 Presupuesto: {fmtMXN(totalPresupuestoPlan(planGuardado.presupuesto))}
                      </div>
                    )}
                    {obj.kpi_ids?.length > 0 && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', alignSelf: 'center' }}>KPIs:</span>
                        {obj.kpi_ids.map(kid => {
                          const k = kpisDisponibles.find(k => k.id === kid)
                          return k ? (
                            <span key={kid} style={{ fontSize: 11, color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 99, padding: '1px 8px', fontWeight: 600 }}>
                              📈 {k.nombre}
                            </span>
                          ) : null
                        })}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openKrModal(obj)}>KRs</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setForm({
                        titulo: obj.titulo, descripcion: obj.descripcion || '',
                        responsable: obj.responsable || '', fecha_inicio: obj.fecha_inicio || '',
                        fecha_fin: obj.fecha_fin || '', periodicidad: obj.periodicidad || 'mensual',
                        estado: obj.estado, kpi_ids: obj.kpi_ids || [],
                        area: obj.area || '', tipo: obj.tipo || 'crecer'
                      })
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

      {/* Modal crear/editar objetivo */}
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

          {/* Contexto para IA */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Área del negocio</label>
              <select className="input" value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))}>
                <option value="">Seleccionar área</option>
                {AREAS_NEGOCIO.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Tipo de objetivo</label>
              <select className="input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                {TIPOS_OBJETIVO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {!editId && (
            <div style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent)12', padding: '7px 10px', borderRadius: 6, marginTop: -6 }}>
              ✨ Al crear el objetivo, la IA generará automáticamente tareas, métricas y presupuesto para revisión.
            </div>
          )}

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
              {miembros.map(m => <option key={m.profile_id} value={m.profile_id}>{m.profiles?.nombre || m.nombre || m.profile_id}</option>)}
            </select>
          </div>

          {kpisDisponibles.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <label className="label" style={{ marginBottom: 8 }}>📈 KPIs vinculados</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {kpisDisponibles.map(k => {
                  const sel = (form.kpi_ids || []).includes(k.id)
                  return (
                    <button key={k.id} type="button"
                      onClick={() => setForm(p => ({ ...p, kpi_ids: sel ? p.kpi_ids.filter(id => id !== k.id) : [...(p.kpi_ids || []), k.id] }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, border: `1px solid ${sel ? '#10b981' : 'var(--border-2)'}`, background: sel ? 'rgba(16,185,129,0.1)' : 'var(--bg-input)', color: sel ? '#10b981' : 'var(--text-2)', fontSize: 12, fontWeight: sel ? 700 : 400, cursor: 'pointer' }}>
                      <span>{sel ? '✓' : '+'}</span> {k.nombre}{k.unidad ? ` (${k.unidad})` : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Plan IA */}
      <Modal
        open={!!objetivoParaPlan}
        onClose={() => { if (!generandoPlan && !aceptandoPlan) { setObjetivoParaPlan(null); setPlanIA(null) } }}
        title={generandoPlan ? '✨ Generando plan...' : '✨ Plan generado por IA'}
        size="xl"
        footer={!generandoPlan && planIA ? (
          <>
            <button className="btn btn-secondary" onClick={() => { setObjetivoParaPlan(null); setPlanIA(null) }}>Omitir plan</button>
            <button className="btn btn-primary" onClick={aceptarPlan} disabled={aceptandoPlan}>
              {aceptandoPlan
                ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />Creando...</>
                : `✓ Aceptar plan (${(planIA.tareas?.length || 0)} tareas · ${(planIA.metricas?.length || 0)} métricas)`}
            </button>
          </>
        ) : undefined}
      >
        {generandoPlan ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3, margin: '0 auto 20px' }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>Analizando tu objetivo...</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>La IA está generando tareas, métricas, presupuesto y responsables</div>
          </div>
        ) : planIA ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* Tareas */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                ✅ Tareas sugeridas
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 10 }}>{planIA.tareas?.length || 0}</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 'auto' }}>Se crearán en Tareas al aceptar</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(planIA.tareas || []).map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border-2)' }}>
                    <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, minWidth: 18, paddingTop: 10 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        className="input"
                        style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}
                        value={t.titulo}
                        onChange={e => updatePlanTarea(i, 'titulo', e.target.value)}
                      />
                      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>
                        {t.descripcion}
                        {t.duracion && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>· {t.duracion}</span>}
                        {t.area && <span style={{ marginLeft: 6 }}>· {t.area}</span>}
                      </div>
                    </div>
                    <button onClick={() => removePlanTarea(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18, padding: '6px 4px', flexShrink: 0, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Métricas */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                📊 Métricas de seguimiento
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 10 }}>{planIA.metricas?.length || 0}</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 'auto' }}>Se crearán como Key Results</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(planIA.metricas || []).map((m, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 10, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border-2)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{m.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.frecuencia} · {m.unidad}{m.descripcion ? ` · ${m.descripcion}` : ''}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3, fontWeight: 600 }}>META</div>
                      <input type="number" className="input" style={{ fontSize: 12, textAlign: 'right' }}
                        value={m.meta}
                        onChange={e => updatePlanMetrica(i, 'meta', e.target.value)} />
                    </div>
                    <button onClick={() => removePlanMetrica(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Presupuesto */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                💰 Presupuesto estimado
                <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 10px', borderRadius: 10 }}>
                  Total: {fmtMXN(totalPresupuestoPlan(planIA.presupuesto))}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(planIA.presupuesto || []).map((p, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px auto', gap: 10, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border-2)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{p.categoria}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.justificacion}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3, fontWeight: 600 }}>MONTO (MXN)</div>
                      <input type="number" className="input" style={{ fontSize: 12, textAlign: 'right' }}
                        value={p.monto}
                        onChange={e => updatePlanPresupuesto(i, 'monto', e.target.value)} />
                    </div>
                    <button onClick={() => removePlanPresupuesto(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Responsables */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>👥 Áreas involucradas</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {(planIA.responsables || []).map((r, i) => (
                  <div key={i} style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 8, border: `1px solid ${ROL_COLORS[r.rol] || 'var(--border-2)'}33`, position: 'relative' }}>
                    <button onClick={() => removePlanResponsable(i)} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, padding: 2, lineHeight: 1 }}>✕</button>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3, paddingRight: 20 }}>{r.area}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: ROL_COLORS[r.rol] || 'var(--text-3)', marginBottom: 4 }}>{r.rol}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{r.descripcion}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--danger)' }}>
            No se pudo generar el plan. Verifica que VITE_ANTHROPIC_API_KEY esté configurada.
          </div>
        )}
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

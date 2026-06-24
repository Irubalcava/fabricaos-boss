import React, { useEffect, useState, useCallback } from 'react'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { checkDuplicadoObjetivo, generarPlanObjetivo } from '../../lib/claude.js'

const ESTADOS = ['activo', 'en_pausa', 'completado', 'cancelado']
const PERIODICIDAD = ['semanal', 'mensual', 'trimestral', 'anual']
const AREAS_NEGOCIO = ['Ventas', 'Marketing', 'Operaciones', 'RH', 'Finanzas', 'Tecnología', 'Logística', 'Administración']
const TIPOS_OBJETIVO = [
  { value: 'crecer',  label: '📈 Crecer' },
  { value: 'reducir', label: '📉 Reducir' },
  { value: 'mantener', label: '🛡 Mantener' },
  { value: 'lanzar',  label: '🚀 Lanzar algo nuevo' },
]
const ESTADO_COLORS = {
  activo: 'var(--accent)', en_pausa: 'var(--warning)',
  completado: 'var(--success)', cancelado: 'var(--text-3)'
}
const ESTADO_TAREAS_COLORS = {
  pendiente: 'var(--text-3)', en_progreso: 'var(--accent)',
  bloqueada: 'var(--danger)', hecha: 'var(--success)', cancelada: 'var(--text-4)'
}
const ESTADO_TAREAS_LABELS = { pendiente: 'Pendiente', en_progreso: 'En progreso', bloqueada: 'Bloqueada', hecha: 'Hecha', cancelada: 'Cancelada' }
const TODOS_ESTADOS_TAREA = ['pendiente', 'en_progreso', 'bloqueada', 'hecha', 'cancelada']
const ROL_COLORS = { lidera: 'var(--accent)', apoya: 'var(--warning)', informa: 'var(--text-3)' }

function empty() {
  return {
    titulo: '', descripcion: '', responsable: '', fecha_inicio: '',
    fecha_fin: '', periodicidad: 'mensual', estado: 'activo',
    kpi_ids: [], area: '', tipo: 'crecer'
  }
}
function fmtMXN(n) {
  const v = parseFloat(n); if (!v) return '$0'
  return `$${v.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`
}
function totalPresupuestoPlan(items) { return (items || []).reduce((s, x) => s + (parseFloat(x.monto) || 0), 0) }
function diasActivo(iso) { return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : 0 }

// ─── Calcula pasos de configuración ───────────────────────
function calcSetup(obj, krsCount, tareasCount) {
  const krs = krsCount ?? (obj.bos_key_results?.length || 0)
  const steps = [
    { id: 'creado',   label: 'Objetivo creado',      done: true },
    { id: 'plan',     label: 'Plan definido',         done: !!obj.plan_ia },
    { id: 'metricas', label: 'Métricas configuradas', done: krs > 0 },
    { id: 'tareas',   label: 'Tareas vinculadas',     done: (tareasCount ?? 0) > 0 },
    { id: 'activo',   label: 'En seguimiento',        done: obj.estado === 'completado' || (krs > 0 && (obj.bos_key_results || []).some(k => k.progreso > 0)) },
  ]
  const done = steps.filter(s => s.done).length
  const next = steps.find(s => !s.done)
  return { steps, done, total: steps.length, pct: Math.round((done / steps.length) * 100), nextStep: next }
}

// ─── Componentes base ─────────────────────────────────────
function ProgressBar({ pct, color, height = 5 }) {
  return (
    <div style={{ height, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color || 'var(--accent)', borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  )
}
function FilterChip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500, border: `1px solid ${active ? 'var(--accent)' : 'var(--border-2)'}`, background: active ? 'var(--accent)18' : 'var(--bg-input)', color: active ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0 }}>
      {children}
    </button>
  )
}
function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 18, gap: 2, flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{ background: 'none', border: 'none', padding: '7px 14px', fontSize: 12, fontWeight: active === t.id ? 700 : 400, color: active === t.id ? 'var(--accent)' : 'var(--text-3)', borderBottom: `2px solid ${active === t.id ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer', marginBottom: -1, transition: 'all 0.12s' }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── Stepper de configuración ─────────────────────────────
function SetupStepper({ steps, pct }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Configuración del objetivo</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? 'var(--success)' : 'var(--accent)' }}>{pct}%</div>
      </div>
      <ProgressBar pct={pct} color={pct === 100 ? 'var(--success)' : 'var(--accent)'} height={4} />
      <div style={{ display: 'flex', gap: 0, marginTop: 10, position: 'relative' }}>
        {steps.map((s, i) => (
          <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {/* Línea conectora */}
            {i < steps.length - 1 && (
              <div style={{ position: 'absolute', top: 10, left: '50%', width: '100%', height: 2, background: steps[i + 1].done ? 'var(--success)' : 'var(--border-2)', zIndex: 0 }} />
            )}
            {/* Punto */}
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: s.done ? 'var(--success)' : 'var(--bg-input)', border: `2px solid ${s.done ? 'var(--success)' : 'var(--border-2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, flexShrink: 0, transition: 'all 0.2s' }}>
              {s.done ? <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>✓</span> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-2)', display: 'block' }} />}
            </div>
            {/* Label */}
            <div style={{ fontSize: 9, color: s.done ? 'var(--success)' : 'var(--text-3)', textAlign: 'center', marginTop: 4, fontWeight: s.done ? 600 : 400, lineHeight: 1.3, maxWidth: 60 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Panel de detalle ─────────────────────────────────────
function ObjetivoDetalle({ obj, onClose, onEditar, workspace, miembro, miembros, onReload }) {
  const [tab, setTab] = useState('plan')
  const [tareas, setTareas] = useState([])
  const [krs, setKrs] = useState(obj.bos_key_results || [])
  const [bitacora, setBitacora] = useState([])
  const [loadingTab, setLoadingTab] = useState(false)
  const [newKr, setNewKr] = useState({ descripcion: '', meta: '', progreso: 0 })
  const [addingKr, setAddingKr] = useState(false)
  const [estado, setEstado] = useState(obj.estado)

  // Tarea nueva inline
  const [showNewTarea, setShowNewTarea] = useState(false)
  const [newTarea, setNewTarea] = useState({ titulo: '', prioridad: 'media', fecha_limite: '', responsable_id: '' })
  const [savingTarea, setSavingTarea] = useState(false)

  // Plan manual
  const [modoManual, setModoManual] = useState(false)
  const [planManualTexto, setPlanManualTexto] = useState(obj.plan_ia?.texto || '')
  const [planManualAreas, setPlanManualAreas] = useState(obj.plan_ia?.responsables || [])
  const [savingPlan, setSavingPlan] = useState(false)

  // Plan IA desde detalle
  const [generandoPlanDetalle, setGenerandoPlanDetalle] = useState(false)
  const [planIADetalle, setPlanIADetalle] = useState(null)
  const [aceptandoPlan, setAceptandoPlan] = useState(false)

  const setup = calcSetup(obj, krs.length, tareas.length)

  const TABS = [
    { id: 'plan',        label: `🗺 Plan${obj.plan_ia ? ' ✓' : ''}` },
    { id: 'tareas',      label: `✅ Tareas${tareas.length > 0 ? ` (${tareas.length})` : ''}` },
    { id: 'metricas',    label: `📊 Métricas${krs.length > 0 ? ` (${krs.length})` : ''}` },
    { id: 'presupuesto', label: '💰 Presupuesto' },
    { id: 'historial',   label: '📋 Historial' },
  ]

  useEffect(() => { loadTabData(tab) }, [tab])

  async function loadTabData(t) {
    setLoadingTab(true)
    try {
      if (t === 'tareas') {
        const { data } = await supabase.from('bos_tareas').select('*').eq('fabrica_id', workspace.id).eq('objetivo_id', obj.id).order('created_at', { ascending: false })
        setTareas(data || [])
      } else if (t === 'metricas') {
        const { data } = await supabase.from('bos_key_results').select('*').eq('objetivo_id', obj.id).order('created_at')
        setKrs(data || [])
      } else if (t === 'historial') {
        const { data } = await supabase.from('bos_bitacora').select('*').eq('fabrica_id', workspace.id).ilike('titulo', `%${obj.titulo.slice(0, 20)}%`).order('created_at', { ascending: false }).limit(20)
        setBitacora(data || [])
      }
    } finally { setLoadingTab(false) }
  }

  async function handleEstadoChange(nuevoEstado) {
    const { error } = await supabase.from('bos_objetivos').update({ estado: nuevoEstado }).eq('id', obj.id)
    if (error) { toast.error(error.message); return }
    setEstado(nuevoEstado); toast.success('Estado actualizado'); onReload()
  }

  async function handleTareaEstado(id, nuevoEstado) {
    const { error } = await supabase.from('bos_tareas').update({ estado: nuevoEstado }).eq('id', id)
    if (!error) setTareas(prev => prev.map(t => t.id === id ? { ...t, estado: nuevoEstado } : t))
  }

  async function handleKrProgreso(krId, progreso) {
    const { error } = await supabase.from('bos_key_results').update({ progreso: parseFloat(progreso) }).eq('id', krId)
    if (error) { toast.error(error.message); return }
    setKrs(prev => prev.map(k => k.id === krId ? { ...k, progreso: parseFloat(progreso) } : k))
    onReload()
  }

  async function handleAddKr() {
    if (!newKr.descripcion.trim()) { toast.error('Descripción requerida'); return }
    setAddingKr(true)
    const { error } = await supabase.from('bos_key_results').insert({
      objetivo_id: obj.id, fabrica_id: workspace.id,
      descripcion: newKr.descripcion.trim(),
      meta: newKr.meta ? parseFloat(newKr.meta) : null,
      progreso: parseFloat(newKr.progreso) || 0
    })
    setAddingKr(false)
    if (error) { toast.error(error.message); return }
    setNewKr({ descripcion: '', meta: '', progreso: 0 })
    toast.success('Métrica añadida'); loadTabData('metricas'); onReload()
  }

  async function handleDeleteKr(krId) {
    await supabase.from('bos_key_results').delete().eq('id', krId)
    setKrs(prev => prev.filter(k => k.id !== krId)); onReload()
  }

  // Guardar plan manual
  async function handleSavePlanManual() {
    if (!planManualTexto.trim() && planManualAreas.length === 0) { toast.error('Escribe el plan o añade áreas'); return }
    setSavingPlan(true)
    const planData = {
      manual: true, texto: planManualTexto.trim(),
      responsables: planManualAreas.filter(a => a.area?.trim()),
      presupuesto: obj.plan_ia?.presupuesto || []
    }
    const { error } = await supabase.from('bos_objetivos').update({ plan_ia: planData }).eq('id', obj.id)
    if (error) { toast.error(error.message) } else {
      toast.success('Plan guardado ✓')
      setModoManual(false); onReload()
    }
    setSavingPlan(false)
  }

  // Generar plan IA desde el detalle
  async function handleGenerarPlanIA() {
    setGenerandoPlanDetalle(true); setPlanIADetalle(null)
    try {
      const plan = await generarPlanObjetivo({ titulo: obj.titulo, descripcion: obj.descripcion, area: obj.area, tipo: obj.tipo, periodicidad: obj.periodicidad, fecha_inicio: obj.fecha_inicio, fecha_fin: obj.fecha_fin })
      setPlanIADetalle(plan)
    } catch { toast.error('No se pudo generar el plan IA') }
    finally { setGenerandoPlanDetalle(false) }
  }

  async function handleAddTarea() {
    if (!newTarea.titulo.trim()) { toast.error('El título es requerido'); return }
    setSavingTarea(true)
    const payload = {
      fabrica_id: workspace.id,
      objetivo_id: obj.id,
      titulo: newTarea.titulo.trim(),
      prioridad: newTarea.prioridad,
      estado: 'pendiente',
      fecha_limite: newTarea.fecha_limite || null,
      responsable_id: newTarea.responsable_id || null,
      created_by: miembro?.profile_id,
    }
    const { data, error } = await supabase.from('bos_tareas').insert(payload).select().single()
    setSavingTarea(false)
    if (error) { toast.error(error.message); return }
    setTareas(prev => [data, ...prev])
    setNewTarea({ titulo: '', prioridad: 'media', fecha_limite: '', responsable_id: '' })
    setShowNewTarea(false)
    toast.success('Tarea creada')
    onReload()
  }

  async function handleDeleteTarea(id) {
    await supabase.from('bos_tareas').delete().eq('id', id)
    setTareas(prev => prev.filter(t => t.id !== id))
    onReload()
  }

  async function handleAceptarPlanIA() {
    if (!planIADetalle) return
    setAceptandoPlan(true)
    try {
      if (planIADetalle.tareas?.length) {
        await supabase.from('bos_tareas').insert(planIADetalle.tareas.map(t => ({ fabrica_id: workspace.id, titulo: t.titulo, objetivo_id: obj.id, descripcion: `${t.descripcion || ''}${t.duracion ? ` (${t.duracion})` : ''}`, estado: 'pendiente', prioridad: 'media', created_by: miembro?.profile_id })))
      }
      if (planIADetalle.metricas?.length) {
        await supabase.from('bos_key_results').insert(planIADetalle.metricas.map(m => ({ objetivo_id: obj.id, fabrica_id: workspace.id, descripcion: `${m.nombre} · ${m.frecuencia} · meta: ${m.meta} ${m.unidad}`, meta: parseFloat(m.meta) || null, progreso: 0 })))
      }
      await supabase.from('bos_objetivos').update({ plan_ia: { presupuesto: planIADetalle.presupuesto || [], responsables: planIADetalle.responsables || [] } }).eq('id', obj.id)
      toast.success(`Plan activado: ${planIADetalle.tareas?.length || 0} tareas · ${planIADetalle.metricas?.length || 0} métricas`)
      setPlanIADetalle(null); onReload(); loadTabData('tareas'); loadTabData('metricas')
    } catch (err) { toast.error(err.message) }
    finally { setAceptandoPlan(false) }
  }

  const progresoKrs = krs.length === 0 ? 0 : Math.round(krs.reduce((s, k) => s + (k.meta ? Math.min(100, (k.progreso / k.meta) * 100) : k.progreso), 0) / krs.length)
  const tareasHechas = tareas.filter(t => t.estado === 'hecha').length
  const progresoPorTareas = tareas.length === 0 ? 0 : Math.round((tareasHechas / tareas.length) * 100)
  const planIA = obj.plan_ia
  const getNombre = (pid) => { const m = miembros.find(x => x.profile_id === pid); return m?.profiles?.nombre || m?.nombre || pid || '—' }

  return (
    <div>
      {/* Setup stepper */}
      <SetupStepper steps={setup.steps} pct={setup.pct} />

      {/* Header */}
      <div style={{ padding: '14px 16px', background: 'var(--bg-input)', borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
              {obj.area && <span style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent)15', padding: '2px 8px', borderRadius: 8, fontWeight: 600 }}>{obj.area}</span>}
              {obj.tipo && <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 8 }}>{TIPOS_OBJETIVO.find(t => t.value === obj.tipo)?.label || obj.tipo}</span>}
              {obj.fecha_fin && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>📅 Hasta {obj.fecha_fin}</span>}
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>⏱ {diasActivo(obj.created_at)} días activo</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{obj.titulo}</div>
            {obj.descripcion && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{obj.descripcion}</div>}
          </div>
          <select value={estado} onChange={e => handleEstadoChange(e.target.value)}
            style={{ background: ESTADO_COLORS[estado] + '18', border: `1px solid ${ESTADO_COLORS[estado]}40`, borderRadius: 8, color: ESTADO_COLORS[estado], fontSize: 11, fontWeight: 700, padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>
              <span>Progreso métricas</span><span style={{ fontWeight: 700, color: 'var(--accent)' }}>{progresoKrs}%</span>
            </div>
            <ProgressBar pct={progresoKrs} color="var(--accent)" />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>
              <span>Tareas completadas</span><span style={{ fontWeight: 700, color: 'var(--success)' }}>{tareasHechas}/{tareas.length || '?'}</span>
            </div>
            <ProgressBar pct={progresoPorTareas} color="var(--success)" />
          </div>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {loadingTab && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} /></div>}

      {/* ── TAB: PLAN ── */}
      {!loadingTab && tab === 'plan' && (
        <div>
          {/* Generando desde detalle */}
          {generandoPlanDetalle && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto 12px' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Generando plan con IA...</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Analizando objetivo, creando tareas y métricas</div>
            </div>
          )}

          {/* Plan IA generado desde detalle (preview) */}
          {!generandoPlanDetalle && planIADetalle && (
            <div>
              <div style={{ padding: '10px 14px', background: 'rgba(0,212,255,0.08)', border: '1px solid var(--accent)40', borderRadius: 8, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                  ✨ Plan listo: {planIADetalle.tareas?.length || 0} tareas · {planIADetalle.metricas?.length || 0} métricas
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setPlanIADetalle(null)}>Descartar</button>
                  <button className="btn btn-primary btn-sm" onClick={handleAceptarPlanIA} disabled={aceptandoPlan}>
                    {aceptandoPlan ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✓ Aceptar plan'}
                  </button>
                </div>
              </div>
              {(planIADetalle.tareas || []).slice(0, 4).map((t, i) => (
                <div key={i} style={{ padding: '7px 12px', background: 'var(--bg-input)', borderRadius: 7, marginBottom: 5, fontSize: 13, color: 'var(--text-1)' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, marginRight: 8 }}>{i + 1}</span>{t.titulo}
                </div>
              ))}
              {(planIADetalle.tareas?.length || 0) > 4 && <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 12px' }}>+{planIADetalle.tareas.length - 4} tareas más...</div>}
            </div>
          )}

          {/* Sin plan generado */}
          {!generandoPlanDetalle && !planIADetalle && !planIA && !modoManual && (
            <div style={{ textAlign: 'center', padding: '28px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🗺</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>No hay plan definido todavía</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>Define el camino para alcanzar este objetivo</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={handleGenerarPlanIA}>
                  ✨ Generar plan con IA
                </button>
                <button className="btn btn-secondary" onClick={() => setModoManual(true)}>
                  ✏ Crear plan manualmente
                </button>
              </div>
            </div>
          )}

          {/* Modo manual */}
          {!generandoPlanDetalle && !planIADetalle && modoManual && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label" style={{ marginBottom: 6 }}>Descripción del plan</label>
                <textarea className="input" value={planManualTexto} onChange={e => setPlanManualTexto(e.target.value)}
                  rows={5} placeholder="Describe el plan de acción para alcanzar este objetivo. ¿Qué pasos se seguirán? ¿Qué recursos se necesitan? ¿Cuáles son los hitos clave?"
                  style={{ fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label className="label" style={{ marginBottom: 0 }}>Áreas involucradas</label>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPlanManualAreas(prev => [...prev, { area: '', rol: 'lidera', descripcion: '' }])}>+ Añadir área</button>
                </div>
                {planManualAreas.map((a, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 3fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input className="input" value={a.area} onChange={e => setPlanManualAreas(prev => prev.map((x, xi) => xi === i ? { ...x, area: e.target.value } : x))} placeholder="Área (ej: Ventas)" style={{ fontSize: 12 }} />
                    <select className="input" value={a.rol} onChange={e => setPlanManualAreas(prev => prev.map((x, xi) => xi === i ? { ...x, rol: e.target.value } : x))} style={{ fontSize: 12 }}>
                      <option value="lidera">Lidera</option>
                      <option value="apoya">Apoya</option>
                      <option value="informa">Informa</option>
                    </select>
                    <input className="input" value={a.descripcion} onChange={e => setPlanManualAreas(prev => prev.map((x, xi) => xi === i ? { ...x, descripcion: e.target.value } : x))} placeholder="¿Qué hace este área?" style={{ fontSize: 12 }} />
                    <button onClick={() => setPlanManualAreas(prev => prev.filter((_, xi) => xi !== i))} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setModoManual(false); setPlanManualTexto(obj.plan_ia?.texto || '') }}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSavePlanManual} disabled={savingPlan}>
                  {savingPlan ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '💾 Guardar plan'}
                </button>
              </div>
            </div>
          )}

          {/* Plan existente (IA o manual) */}
          {!generandoPlanDetalle && !planIADetalle && !modoManual && planIA && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Indicador de tipo de plan */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-input)', padding: '3px 10px', borderRadius: 6 }}>
                  {planIA.manual ? '✏ Plan manual' : '✨ Plan generado por IA'}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setModoManual(true); setPlanManualTexto(planIA.texto || ''); setPlanManualAreas(planIA.responsables || []) }}>Editar</button>
                  <button className="btn btn-ghost btn-sm" onClick={handleGenerarPlanIA} title="Regenerar con IA">🔄 IA</button>
                </div>
              </div>

              {/* Texto del plan (si es manual) */}
              {planIA.manual && planIA.texto && (
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.75, background: 'var(--bg-input)', padding: '12px 14px', borderRadius: 8, whiteSpace: 'pre-line' }}>
                  {planIA.texto}
                </div>
              )}

              {/* Responsables */}
              {planIA.responsables?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>👥 Áreas involucradas</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                    {planIA.responsables.map((r, i) => (
                      <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8, borderLeft: `3px solid ${ROL_COLORS[r.rol] || 'var(--border)'}` }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{r.area}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: ROL_COLORS[r.rol] || 'var(--text-3)', marginBottom: 3 }}>{r.rol}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{r.descripcion}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resumen presupuesto */}
              {planIA.presupuesto?.length > 0 && (
                <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Presupuesto total estimado</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{fmtMXN(totalPresupuestoPlan(planIA.presupuesto))}</span>
                </div>
              )}

              {obj.responsable && (
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  Responsable principal: <strong style={{ color: 'var(--text-1)' }}>{getNombre(obj.responsable)}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TAREAS ── */}
      {!loadingTab && tab === 'tareas' && (
        <div>
          {/* Encabezado con botón nueva tarea */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['pendiente', 'en_progreso', 'bloqueada', 'hecha'].map(e => {
                const cnt = tareas.filter(t => t.estado === e).length
                if (!cnt) return null
                return <span key={e} style={{ fontSize: 11, fontWeight: 600, color: ESTADO_TAREAS_COLORS[e], background: ESTADO_TAREAS_COLORS[e] + '18', padding: '2px 10px', borderRadius: 10 }}>{cnt} {ESTADO_TAREAS_LABELS[e]}</span>
              })}
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewTarea(v => !v)}>
              {showNewTarea ? '✕ Cancelar' : '+ Nueva tarea'}
            </button>
          </div>

          {/* Formulario inline nueva tarea */}
          {showNewTarea && (
            <div style={{ padding: '14px 16px', background: 'var(--bg-input)', border: '1px dashed var(--accent)60', borderRadius: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>Nueva tarea vinculada al objetivo</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  className="input" autoFocus
                  placeholder="Título de la tarea (requerido)"
                  value={newTarea.titulo}
                  onChange={e => setNewTarea(p => ({ ...p, titulo: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAddTarea()}
                  style={{ fontSize: 13 }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <select className="input" value={newTarea.prioridad} onChange={e => setNewTarea(p => ({ ...p, prioridad: e.target.value }))} style={{ fontSize: 12 }}>
                    <option value="baja">Prioridad: Baja</option>
                    <option value="media">Prioridad: Media</option>
                    <option value="alta">Prioridad: Alta</option>
                    <option value="urgente">Prioridad: Urgente</option>
                  </select>
                  <input
                    className="input" type="date"
                    value={newTarea.fecha_limite}
                    onChange={e => setNewTarea(p => ({ ...p, fecha_limite: e.target.value }))}
                    style={{ fontSize: 12 }}
                  />
                  <select className="input" value={newTarea.responsable_id} onChange={e => setNewTarea(p => ({ ...p, responsable_id: e.target.value }))} style={{ fontSize: 12 }}>
                    <option value="">Sin asignar</option>
                    {miembros.map(m => (
                      <option key={m.profile_id} value={m.profile_id}>
                        {m.profiles?.nombre || m.nombre || m.profile_id}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setShowNewTarea(false); setNewTarea({ titulo: '', prioridad: 'media', fecha_limite: '', responsable_id: '' }) }}>Cancelar</button>
                  <button className="btn btn-primary btn-sm" onClick={handleAddTarea} disabled={savingTarea}>
                    {savingTarea ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✓ Crear tarea'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lista de tareas */}
          {tareas.length === 0 && !showNewTarea ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 14 }}>No hay tareas vinculadas a este objetivo</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Pulsa "+ Nueva tarea" para agregar la primera</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tareas.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg-card)', border: `1px solid var(--border)`, borderLeft: `4px solid ${ESTADO_TAREAS_COLORS[t.estado] || 'var(--border)'}`, borderRadius: 8 }}>
                  <select value={t.estado} onChange={e => handleTareaEstado(t.id, e.target.value)}
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-2)', borderRadius: 6, color: ESTADO_TAREAS_COLORS[t.estado], fontSize: 11, fontWeight: 700, padding: '3px 6px', cursor: 'pointer', flexShrink: 0 }}>
                    {TODOS_ESTADOS_TAREA.map(e => <option key={e} value={e}>{ESTADO_TAREAS_LABELS[e]}</option>)}
                  </select>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: t.estado === 'hecha' ? 'var(--text-3)' : 'var(--text-1)', textDecoration: t.estado === 'hecha' ? 'line-through' : 'none' }} className="truncate">{t.titulo}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                      {t.fecha_limite && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>📅 {t.fecha_limite}</span>}
                      {t.responsable_id && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>👤 {getNombre(t.responsable_id)?.split(' ')[0]}</span>}
                    </div>
                  </div>
                  {t.prioridad && <span style={{ fontSize: 10, fontWeight: 700, color: t.prioridad === 'urgente' ? 'var(--danger)' : t.prioridad === 'alta' ? '#f97316' : 'var(--text-3)', textTransform: 'uppercase', flexShrink: 0 }}>{t.prioridad}</span>}
                  <button onClick={() => handleDeleteTarea(t.id)} style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 14, padding: '2px 4px', opacity: 0.5, flexShrink: 0 }} title="Eliminar tarea"
                    onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.5}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: MÉTRICAS ── */}
      {!loadingTab && tab === 'metricas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {krs.map(kr => {
            const pct = kr.meta ? Math.min(100, Math.round((kr.progreso / kr.meta) * 100)) : kr.progreso
            const color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--accent)'
            return (
              <div key={kr.id} style={{ padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>{kr.descripcion}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color, flexShrink: 0 }}>{pct}%</span>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteKr(kr.id)}>✕</button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="range" min={0} max={kr.meta || 100} step={1} value={kr.progreso} onChange={e => handleKrProgreso(kr.id, e.target.value)} style={{ flex: 1, accentColor: color }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600, minWidth: 55, textAlign: 'right' }}>{kr.progreso}{kr.meta ? `/${kr.meta}` : '%'}</span>
                </div>
                <ProgressBar pct={pct} color={color} />
              </div>
            )
          })}
          <div style={{ padding: '12px 14px', background: 'var(--bg-input)', border: '1px dashed var(--border-2)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>+ Nueva métrica / Key Result</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input className="input" style={{ flex: 2, minWidth: 160, fontSize: 12 }} value={newKr.descripcion} onChange={e => setNewKr(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Ventas mensuales" />
              <input className="input" style={{ width: 80, fontSize: 12 }} type="number" value={newKr.meta} onChange={e => setNewKr(p => ({ ...p, meta: e.target.value }))} placeholder="Meta" />
              <input className="input" style={{ width: 80, fontSize: 12 }} type="number" value={newKr.progreso} onChange={e => setNewKr(p => ({ ...p, progreso: e.target.value }))} placeholder="Actual" />
              <button className="btn btn-primary btn-sm" onClick={handleAddKr} disabled={addingKr}>
                {addingKr ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: PRESUPUESTO ── */}
      {!loadingTab && tab === 'presupuesto' && (
        <div>
          {!planIA?.presupuesto?.length ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>
              <div style={{ fontSize: 14 }}>Sin presupuesto registrado</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Genera un plan con IA para obtener estimados de presupuesto</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Total estimado</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#10b981' }}>{fmtMXN(totalPresupuestoPlan(planIA.presupuesto))}</span>
              </div>
              {planIA.presupuesto.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{p.categoria}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.justificacion}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981', flexShrink: 0 }}>{fmtMXN(p.monto)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: HISTORIAL ── */}
      {!loadingTab && tab === 'historial' && (
        <div>
          {bitacora.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14 }}>Sin actividad registrada</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {bitacora.map(e => (
                <div key={e.id} style={{ display: 'flex', gap: 10, padding: '7px 10px', borderRadius: 7 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 6 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{e.titulo}</div>
                    {e.descripcion && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{e.descripcion}</div>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0, paddingTop: 2 }}>
                    {new Date(e.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────
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
  const [filtroEstado, setFiltroEstado] = useState('all')
  const [kpisDisponibles, setKpisDisponibles] = useState([])
  const [detalleObj, setDetalleObj] = useState(null)

  // Plan IA (al crear)
  const [objetivoParaPlan, setObjetivoParaPlan] = useState(null)
  const [generandoPlan, setGenerandoPlan] = useState(false)
  const [planIA, setPlanIA] = useState(null)
  const [aceptandoPlan, setAceptandoPlan] = useState(false)

  useEffect(() => {
    if (workspace?.id) { loadObjetivos(); loadKpisDisponibles() }
  }, [workspace])

  async function loadKpisDisponibles() {
    const { data } = await supabase.from('bos_kpis').select('id, nombre, unidad').eq('fabrica_id', workspace.id).eq('activo', true).order('nombre')
    setKpisDisponibles(data || [])
  }

  async function loadObjetivos() {
    setLoading(true)
    const { data } = await supabase.from('bos_objetivos').select('*, bos_key_results(*)').eq('fabrica_id', workspace.id).order('created_at', { ascending: false })
    setObjetivos(data || [])
    setLoading(false)
  }

  async function checkDuplicate(titulo) {
    if (!titulo || titulo.length < 10) return
    setCheckingDup(true)
    try {
      const res = await checkDuplicadoObjetivo(titulo, objetivos)
      setDuplicadoWarning(res && !res.toLowerCase().includes('sin duplicados') ? res : '')
    } catch { setDuplicadoWarning('') }
    finally { setCheckingDup(false) }
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('El título es requerido'); return }
    setSaving(true)
    try {
      const payload = {
        fabrica_id: workspace.id, titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null, responsable: form.responsable || null,
        fecha_inicio: form.fecha_inicio || null, fecha_fin: form.fecha_fin || null,
        periodicidad: form.periodicidad, estado: form.estado,
        kpi_ids: form.kpi_ids?.length ? form.kpi_ids : null,
        area: form.area || null, tipo: form.tipo || null, created_by: miembro?.profile_id
      }
      if (editId) {
        const { error } = await supabase.from('bos_objetivos').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Objetivo actualizado')
        setModalOpen(false); setDuplicadoWarning(''); loadObjetivos()
      } else {
        const { data: newObj, error } = await supabase.from('bos_objetivos').insert(payload).select().single()
        if (error) throw error
        await supabase.from('bos_bitacora').insert({ fabrica_id: workspace.id, tipo: 'objetivo', titulo: `Nuevo objetivo: ${form.titulo}`, automatico: true, created_by: miembro?.profile_id })
        setModalOpen(false); setDuplicadoWarning(''); loadObjetivos()
        // Trigger plan IA
        setObjetivoParaPlan(newObj); setGenerandoPlan(true); setPlanIA(null)
        try {
          const plan = await generarPlanObjetivo({ titulo: newObj.titulo, descripcion: newObj.descripcion, area: newObj.area, tipo: newObj.tipo, periodicidad: newObj.periodicidad, fecha_inicio: newObj.fecha_inicio, fecha_fin: newObj.fecha_fin })
          setPlanIA(plan)
        } catch { toast.error('No se pudo generar el plan IA'); setPlanIA(null) }
        finally { setGenerandoPlan(false) }
      }
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function aceptarPlan() {
    if (!objetivoParaPlan || !planIA) return
    setAceptandoPlan(true)
    try {
      if (planIA.tareas?.length) {
        await supabase.from('bos_tareas').insert(planIA.tareas.map(t => ({ fabrica_id: workspace.id, titulo: t.titulo, objetivo_id: objetivoParaPlan.id, descripcion: `${t.descripcion || ''}${t.duracion ? ` (${t.duracion})` : ''}`, estado: 'pendiente', prioridad: 'media', created_by: miembro?.profile_id })))
      }
      if (planIA.metricas?.length) {
        await supabase.from('bos_key_results').insert(planIA.metricas.map(m => ({ objetivo_id: objetivoParaPlan.id, fabrica_id: workspace.id, descripcion: `${m.nombre} · ${m.frecuencia} · meta: ${m.meta} ${m.unidad}`, meta: parseFloat(m.meta) || null, progreso: 0 })))
      }
      await supabase.from('bos_objetivos').update({ plan_ia: { presupuesto: planIA.presupuesto || [], responsables: planIA.responsables || [] } }).eq('id', objetivoParaPlan.id)
      toast.success(`Plan activado: ${planIA.tareas?.length || 0} tareas · ${planIA.metricas?.length || 0} métricas`)
      setObjetivoParaPlan(null); setPlanIA(null); loadObjetivos()
    } catch (err) { toast.error(err.message) }
    finally { setAceptandoPlan(false) }
  }

  function updatePlanTarea(i, f, v) { setPlanIA(p => ({ ...p, tareas: p.tareas.map((t, idx) => idx === i ? { ...t, [f]: v } : t) })) }
  function removePlanTarea(i)        { setPlanIA(p => ({ ...p, tareas: p.tareas.filter((_, idx) => idx !== i) })) }
  function updatePlanMetrica(i, f, v){ setPlanIA(p => ({ ...p, metricas: p.metricas.map((m, idx) => idx === i ? { ...m, [f]: v } : m) })) }
  function removePlanMetrica(i)      { setPlanIA(p => ({ ...p, metricas: p.metricas.filter((_, idx) => idx !== i) })) }
  function updatePlanPresup(i, f, v) { setPlanIA(p => ({ ...p, presupuesto: p.presupuesto.map((x, idx) => idx === i ? { ...x, [f]: v } : x) })) }
  function removePlanPresup(i)       { setPlanIA(p => ({ ...p, presupuesto: p.presupuesto.filter((_, idx) => idx !== i) })) }
  function removePlanResp(i)         { setPlanIA(p => ({ ...p, responsables: p.responsables.filter((_, idx) => idx !== i) })) }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este objetivo?')) return
    await supabase.from('bos_objetivos').delete().eq('id', id)
    toast.success('Objetivo eliminado'); loadObjetivos()
    if (detalleObj?.id === id) setDetalleObj(null)
  }

  function calcProgreso(obj) {
    const krs = obj.bos_key_results || []
    if (!krs.length) return 0
    return Math.round(krs.reduce((s, k) => s + (k.meta ? Math.min(100, (k.progreso / k.meta) * 100) : k.progreso), 0) / krs.length)
  }

  const objetivosFiltrados = filtroEstado === 'all' ? objetivos : objetivos.filter(o => o.estado === filtroEstado)

  if (loading) return <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /></div>

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Objetivos</h1>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {objetivos.filter(o => o.estado === 'activo').length} activos · {objetivos.filter(o => o.estado === 'completado').length} completados
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(empty()); setEditId(null); setDuplicadoWarning(''); setModalOpen(true) }}>
          + Nuevo objetivo
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <FilterChip active={filtroEstado === 'all'} onClick={() => setFiltroEstado('all')}>Todos ({objetivos.length})</FilterChip>
        {ESTADOS.map(e => {
          const cnt = objetivos.filter(o => o.estado === e).length
          if (!cnt) return null
          return <FilterChip key={e} active={filtroEstado === e} onClick={() => setFiltroEstado(e)}>{e} ({cnt})</FilterChip>
        })}
      </div>

      {/* Lista */}
      {objetivosFiltrados.length === 0 ? (
        <div className="empty-state"><div className="icon">🎯</div><p>No hay objetivos</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {objetivosFiltrados.map(obj => {
            const progreso = calcProgreso(obj)
            const krs = obj.bos_key_results || []
            const semColor = progreso >= 80 ? 'var(--success)' : progreso >= 50 ? 'var(--warning)' : 'var(--accent)'
            const isSelected = detalleObj?.id === obj.id
            const setup = calcSetup(obj)

            return (
              <div key={obj.id}>
                <div className="card" style={{
                  padding: '14px 18px', cursor: 'pointer',
                  borderColor: isSelected ? 'var(--accent)50' : 'var(--border)',
                  borderLeft: `4px solid ${ESTADO_COLORS[obj.estado] || 'var(--border)'}`,
                  transition: 'all 0.15s'
                }}
                  onClick={() => setDetalleObj(isSelected ? null : obj)}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--accent)30' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: ESTADO_COLORS[obj.estado], textTransform: 'uppercase' }}>{obj.estado}</span>
                        {obj.area && <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent)12', padding: '1px 7px', borderRadius: 8 }}>{obj.area}</span>}
                        {obj.tipo && <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--bg-input)', padding: '1px 7px', borderRadius: 8 }}>{TIPOS_OBJETIVO.find(t => t.value === obj.tipo)?.label || obj.tipo}</span>}
                        {obj.fecha_fin && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>📅 {obj.fecha_fin}</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }} className="truncate">{obj.titulo}</div>

                      {/* Setup progress (si no está completo) */}
                      {setup.pct < 100 ? (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>
                            <span>⚙ Configuración {setup.done}/{setup.total}</span>
                            {setup.nextStep && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>→ {setup.nextStep.label}</span>}
                          </div>
                          <ProgressBar pct={setup.pct} color={setup.pct === 100 ? 'var(--success)' : '#f59e0b'} height={3} />
                        </div>
                      ) : null}

                      {/* Progreso real (métricas) */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>
                          <span>{krs.length} métricas</span>
                          <span style={{ fontWeight: 700, color: semColor }}>{progreso}%</span>
                        </div>
                        <ProgressBar pct={progreso} color={semColor} height={5} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" title="Editar"
                        onClick={e => { e.stopPropagation(); setForm({ titulo: obj.titulo, descripcion: obj.descripcion || '', responsable: obj.responsable || '', fecha_inicio: obj.fecha_inicio || '', fecha_fin: obj.fecha_fin || '', periodicidad: obj.periodicidad || 'mensual', estado: obj.estado, kpi_ids: obj.kpi_ids || [], area: obj.area || '', tipo: obj.tipo || 'crecer' }); setEditId(obj.id); setModalOpen(true) }}>✏</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                        onClick={e => { e.stopPropagation(); handleDelete(obj.id) }}>✕</button>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', paddingTop: 4 }}>{isSelected ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)30', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '20px 20px', marginTop: -1 }}>
                    <ObjetivoDetalle
                      obj={obj}
                      onClose={() => setDetalleObj(null)}
                      onEditar={() => { setForm({ titulo: obj.titulo, descripcion: obj.descripcion || '', responsable: obj.responsable || '', fecha_inicio: obj.fecha_inicio || '', fecha_fin: obj.fecha_fin || '', periodicidad: obj.periodicidad || 'mensual', estado: obj.estado, kpi_ids: obj.kpi_ids || [], area: obj.area || '', tipo: obj.tipo || 'crecer' }); setEditId(obj.id); setModalOpen(true) }}
                      workspace={workspace} miembro={miembro} miembros={miembros} onReload={loadObjetivos}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal crear/editar */}
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
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="¿Por qué es importante?" rows={2} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Área</label>
              <select className="input" value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))}>
                <option value="">Seleccionar</option>
                {AREAS_NEGOCIO.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Tipo</label>
              <select className="input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                {TIPOS_OBJETIVO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          {!editId && (
            <div style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent)12', padding: '7px 10px', borderRadius: 6 }}>
              ✨ La IA generará tareas, métricas y presupuesto automáticamente al crear — o puedes crear el plan manualmente después.
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
                      style={{ padding: '3px 10px', borderRadius: 99, border: `1px solid ${sel ? '#10b981' : 'var(--border-2)'}`, background: sel ? 'rgba(16,185,129,0.1)' : 'var(--bg-input)', color: sel ? '#10b981' : 'var(--text-2)', fontSize: 12, fontWeight: sel ? 700 : 400, cursor: 'pointer' }}>
                      {sel ? '✓' : '+'} {k.nombre}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Plan IA (al crear) */}
      <Modal
        open={!!objetivoParaPlan}
        onClose={() => { if (!generandoPlan && !aceptandoPlan) { setObjetivoParaPlan(null); setPlanIA(null) } }}
        title={generandoPlan ? '✨ Generando plan...' : '✨ Plan generado por IA'} size="xl"
        footer={!generandoPlan && planIA ? (
          <>
            <button className="btn btn-secondary" onClick={() => { setObjetivoParaPlan(null); setPlanIA(null) }}>Omitir — crear manualmente después</button>
            <button className="btn btn-primary" onClick={aceptarPlan} disabled={aceptandoPlan}>
              {aceptandoPlan ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />Creando...</> : `✓ Aceptar (${planIA.tareas?.length || 0} tareas · ${planIA.metricas?.length || 0} métricas)`}
            </button>
          </>
        ) : undefined}
      >
        {generandoPlan ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3, margin: '0 auto 20px' }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>Analizando tu objetivo...</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Generando tareas, métricas, presupuesto y responsables</div>
          </div>
        ) : planIA ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {/* Tareas */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                ✅ Tareas sugeridas <span style={{ fontSize: 11, background: 'var(--bg-input)', color: 'var(--text-3)', padding: '2px 8px', borderRadius: 10 }}>{planIA.tareas?.length || 0}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>Edita antes de aceptar</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {(planIA.tareas || []).map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', background: 'var(--bg-input)', borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, minWidth: 18, paddingTop: 9 }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <input className="input" style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }} value={t.titulo} onChange={e => updatePlanTarea(i, 'titulo', e.target.value)} />
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.descripcion}{t.duracion && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>· {t.duracion}</span>}</div>
                    </div>
                    <button onClick={() => removePlanTarea(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18, padding: '5px 4px', lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
            {/* Métricas */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                📊 Métricas <span style={{ fontSize: 11, background: 'var(--bg-input)', color: 'var(--text-3)', padding: '2px 8px', borderRadius: 10 }}>{planIA.metricas?.length || 0}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>Se crearán como Key Results</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {(planIA.metricas || []).map((m, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 10, alignItems: 'center', padding: '9px 12px', background: 'var(--bg-input)', borderRadius: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{m.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.frecuencia} · {m.unidad}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3, fontWeight: 600 }}>META</div>
                      <input type="number" className="input" style={{ fontSize: 12 }} value={m.meta} onChange={e => updatePlanMetrica(i, 'meta', e.target.value)} />
                    </div>
                    <button onClick={() => removePlanMetrica(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
            {/* Presupuesto */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                💰 Presupuesto
                <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 10px', borderRadius: 10 }}>
                  {fmtMXN(totalPresupuestoPlan(planIA.presupuesto))}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {(planIA.presupuesto || []).map((p, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px auto', gap: 10, alignItems: 'center', padding: '9px 12px', background: 'var(--bg-input)', borderRadius: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{p.categoria}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.justificacion}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3, fontWeight: 600 }}>MONTO (MXN)</div>
                      <input type="number" className="input" style={{ fontSize: 12 }} value={p.monto} onChange={e => updatePlanPresup(i, 'monto', e.target.value)} />
                    </div>
                    <button onClick={() => removePlanPresup(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
            {/* Responsables */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>👥 Áreas involucradas</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {(planIA.responsables || []).map((r, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8, borderLeft: `3px solid ${ROL_COLORS[r.rol] || 'var(--border)'}`, position: 'relative' }}>
                    <button onClick={() => removePlanResp(i)} style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, padding: 2, lineHeight: 1 }}>✕</button>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2, paddingRight: 20 }}>{r.area}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: ROL_COLORS[r.rol] || 'var(--text-3)', marginBottom: 3 }}>{r.rol}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.descripcion}</div>
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
    </div>
  )
}

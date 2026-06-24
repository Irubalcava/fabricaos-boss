import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { suggestCausas, generateSummary } from '../../lib/claude.js'

const PIPELINE = ['detectado', 'analizando', 'en_solucion', 'resuelto']
const IMPACTOS = ['bajo', 'medio', 'alto', 'critico']

const ESTADO_COLORS = {
  detectado: '#ef4444', analizando: '#f59e0b',
  en_solucion: 'var(--accent)', resuelto: '#10b981', descartado: 'var(--text-3)'
}
const ESTADO_LABELS = {
  detectado: 'Detectado', analizando: 'Analizando',
  en_solucion: 'En solución', resuelto: 'Resuelto', descartado: 'Descartado'
}
const IMPACTO_COLORS = {
  bajo: 'var(--text-3)', medio: '#f59e0b', alto: '#ef4444', critico: '#ff2d55'
}

function empty() {
  return {
    titulo: '', descripcion: '', impacto: 'alto', estado: 'detectado',
    causas: [], solucion: '', responsable: '', fecha_limite: '', objetivo_id: '',
    crearTarea: true, prioridadTarea: 'alta'
  }
}

// ─── Stepper de estados ───────────────────────────────────
function EstadoStepper({ estado, onChange, compact = false }) {
  const idx = PIPELINE.indexOf(estado)
  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'nowrap' }}>
        {PIPELINE.map((e, i) => (
          <React.Fragment key={e}>
            <button onClick={() => onChange(e)} title={ESTADO_LABELS[e]}
              style={{
                width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0,
                background: i < idx ? '#10b981' : i === idx ? ESTADO_COLORS[e] : 'var(--border-2)',
                transform: i === idx ? 'scale(1.4)' : 'scale(1)',
                transition: 'all 0.15s'
              }} />
            {i < PIPELINE.length - 1 && <div style={{ width: 10, height: 1, background: i < idx ? '#10b981' : 'var(--border-2)', flexShrink: 0 }} />}
          </React.Fragment>
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--bg-input)', borderRadius: 8, padding: 3 }}>
      {PIPELINE.map((e, i) => (
        <React.Fragment key={e}>
          <button onClick={() => onChange(e)}
            style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: i === idx ? 700 : 400,
              background: i === idx ? ESTADO_COLORS[e] : 'transparent',
              color: i === idx ? '#fff' : i < idx ? '#10b981' : 'var(--text-3)',
              transition: 'all 0.15s', whiteSpace: 'nowrap'
            }}>
            {i < idx ? '✓ ' : ''}{ESTADO_LABELS[e]}
          </button>
          {i < PIPELINE.length - 1 && <div style={{ width: 12, height: 1, background: i < idx ? '#10b98140' : 'var(--border)', flexShrink: 0 }} />}
        </React.Fragment>
      ))}
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 14, gap: 2 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{ background: 'none', border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: active === t.id ? 700 : 400, color: active === t.id ? 'var(--accent)' : 'var(--text-3)', borderBottom: `2px solid ${active === t.id ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer', marginBottom: -1, transition: 'all 0.12s', whiteSpace: 'nowrap' }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── Panel de detalle ─────────────────────────────────────
function ProblemaDetalle({ problema, miembros, workspace, miembro, objetivos, onReload }) {
  const [tab, setTab] = useState('causas')
  const [causas, setCausas] = useState(problema.causas || [])
  const [solucion, setSolucion] = useState(problema.solucion || '')
  const [savingCausas, setSavingCausas] = useState(false)
  const [savingSolucion, setSavingSolucion] = useState(false)
  const [loadingCausas, setLoadingCausas] = useState(false)
  const [tareas, setTareas] = useState([])
  const [loadingTareas, setLoadingTareas] = useState(false)
  const [nuevaTarea, setNuevaTarea] = useState('')
  const [addingTarea, setAddingTarea] = useState(false)
  const [estado, setEstado] = useState(problema.estado)

  const responsableNombre = (() => {
    const m = miembros.find(x => x.profile_id === problema.responsable)
    return m?.profiles?.nombre || m?.nombre || problema.responsable || '—'
  })()
  const objetivo = objetivos.find(o => o.id === problema.objetivo_id)

  const diasRestantes = (() => {
    if (!problema.fecha_limite) return null
    const diff = Math.ceil((new Date(problema.fecha_limite) - new Date()) / 86400000)
    return diff
  })()

  useEffect(() => {
    if (tab === 'plan') loadTareas()
  }, [tab])

  async function loadTareas() {
    setLoadingTareas(true)
    const { data } = await supabase.from('bos_tareas').select('*').eq('fabrica_id', workspace.id).ilike('descripcion', `%problema:${problema.id}%`).order('created_at')
    setTareas(data || [])
    setLoadingTareas(false)
  }

  async function handleEstadoChange(nuevoEstado) {
    const { error } = await supabase.from('bos_problemas').update({ estado: nuevoEstado }).eq('id', problema.id)
    if (error) { toast.error(error.message); return }
    setEstado(nuevoEstado)
    if (nuevoEstado === 'resuelto') {
      await supabase.from('bos_bitacora').insert({ fabrica_id: workspace.id, tipo: 'problema', titulo: `Problema resuelto: ${problema.titulo}`, automatico: true, created_by: miembro?.profile_id })
      toast.success('Problema marcado como resuelto ✓')
    }
    onReload()
  }

  async function handleSuggestCausas() {
    if (!problema.titulo) return
    setLoadingCausas(true)
    try {
      const causasSugeridas = await suggestCausas(problema.titulo)
      setCausas(causasSugeridas)
    } catch { toast.error('Error generando causas') }
    finally { setLoadingCausas(false) }
  }

  async function handleSaveCausas() {
    setSavingCausas(true)
    await supabase.from('bos_problemas').update({ causas: causas.filter(c => c.trim()) }).eq('id', problema.id)
    setSavingCausas(false); toast.success('Causas guardadas'); onReload()
  }

  async function handleSaveSolucion() {
    setSavingSolucion(true)
    await supabase.from('bos_problemas').update({ solucion: solucion.trim() || null }).eq('id', problema.id)
    setSavingSolucion(false); toast.success('Plan guardado'); onReload()
  }

  async function handleAddTarea() {
    const t = nuevaTarea.trim()
    if (!t) return
    setAddingTarea(true)
    try {
      await supabase.from('bos_tareas').insert({
        fabrica_id: workspace.id, titulo: t, estado: 'pendiente', prioridad: 'alta',
        descripcion: `problema:${problema.id}`,
        asignado_a: problema.responsable || null,
        created_by: miembro?.profile_id
      })
      setNuevaTarea(''); loadTareas(); toast.success('Tarea creada')
    } catch (err) { toast.error(err.message) }
    finally { setAddingTarea(false) }
  }

  async function handleTareaEstado(id, nuevoEstado) {
    await supabase.from('bos_tareas').update({ estado: nuevoEstado }).eq('id', id)
    setTareas(prev => prev.map(t => t.id === id ? { ...t, estado: nuevoEstado } : t))
  }

  async function handleDescartar() {
    if (!confirm('¿Descartar este problema?')) return
    await handleEstadoChange('descartado')
  }

  return (
    <div>
      {/* Estado stepper */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <EstadoStepper estado={estado} onChange={handleEstadoChange} />
        {estado !== 'resuelto' && estado !== 'descartado' && (
          <button onClick={handleDescartar} style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
            Descartar
          </button>
        )}
      </div>

      <Tabs
        tabs={[
          { id: 'causas', label: `🔍 Causas raíz${causas.length > 0 ? ` (${causas.length})` : ''}` },
          { id: 'plan',   label: `🛠 Plan${tareas.length > 0 ? ` (${tareas.length})` : ''}` },
          { id: 'info',   label: '📋 Contexto' },
        ]}
        active={tab} onChange={setTab}
      />

      {/* ── TAB: CAUSAS ── */}
      {tab === 'causas' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleSuggestCausas} disabled={loadingCausas}>
              {loadingCausas ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✨ Sugerir causas IA'}
            </button>
            {causas.join('') !== (problema.causas || []).join('') && (
              <button className="btn btn-primary btn-sm" onClick={handleSaveCausas} disabled={savingCausas}>
                {savingCausas ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : 'Guardar'}
              </button>
            )}
          </div>
          {causas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-3)', fontSize: 13 }}>
              Sin causas raíz definidas · usa IA para sugerir
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {causas.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{i + 1}.</span>
                  <input className="input" value={c} onChange={e => setCausas(prev => prev.map((x, xi) => xi === i ? e.target.value : x))}
                    style={{ flex: 1, fontSize: 13 }} />
                  <button onClick={() => setCausas(prev => prev.filter((_, xi) => xi !== i))}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setCausas(prev => [...prev, ''])}
            style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)', background: 'none', border: '1px dashed var(--accent)40', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', width: '100%' }}>
            + Añadir causa
          </button>
        </div>
      )}

      {/* ── TAB: PLAN ── */}
      {tab === 'plan' && (
        <div>
          {/* Solución */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Plan de solución</div>
              {solucion !== (problema.solucion || '') && (
                <button className="btn btn-primary btn-sm" onClick={handleSaveSolucion} disabled={savingSolucion}>
                  {savingSolucion ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : 'Guardar'}
                </button>
              )}
            </div>
            <textarea className="input" value={solucion} onChange={e => setSolucion(e.target.value)}
              rows={3} placeholder="¿Cómo se va a resolver? Describe los pasos o la solución implementada..."
              style={{ fontSize: 13, lineHeight: 1.6, resize: 'vertical' }} />
          </div>

          {/* Tareas de seguimiento */}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
            Tareas de seguimiento
          </div>
          {loadingTareas ? (
            <div style={{ textAlign: 'center', padding: 12 }}><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /></div>
          ) : tareas.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0', marginBottom: 8 }}>Sin tareas vinculadas</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {tareas.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-input)', borderRadius: 7 }}>
                  <input type="checkbox" checked={t.estado === 'hecha'} onChange={e => handleTareaEstado(t.id, e.target.checked ? 'hecha' : 'pendiente')}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} />
                  <span style={{ flex: 1, fontSize: 13, color: t.estado === 'hecha' ? 'var(--text-3)' : 'var(--text-1)', textDecoration: t.estado === 'hecha' ? 'line-through' : 'none' }}>
                    {t.titulo}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: t.prioridad === 'alta' ? 'var(--danger)' : 'var(--text-3)', textTransform: 'uppercase' }}>{t.prioridad}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={nuevaTarea} onChange={e => setNuevaTarea(e.target.value)}
              placeholder="Nueva acción de seguimiento..." onKeyDown={e => e.key === 'Enter' && handleAddTarea()}
              style={{ flex: 1, fontSize: 13 }} />
            <button className="btn btn-primary btn-sm" onClick={handleAddTarea} disabled={!nuevaTarea.trim() || addingTarea}>
              {addingTarea ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '+'}
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: CONTEXTO ── */}
      {tab === 'info' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {problema.descripcion && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Descripción</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{problema.descripcion}</div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>RESPONSABLE</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{responsableNombre}</div>
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>IMPACTO</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: IMPACTO_COLORS[problema.impacto] || 'var(--text-1)', textTransform: 'capitalize' }}>{problema.impacto}</div>
            </div>
            {problema.fecha_limite && (
              <div style={{ padding: '10px 12px', background: diasRestantes !== null && diasRestantes < 0 ? 'rgba(239,68,68,0.08)' : 'var(--bg-input)', borderRadius: 8, border: diasRestantes !== null && diasRestantes < 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>FECHA LÍMITE</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: diasRestantes !== null && diasRestantes < 0 ? '#ef4444' : 'var(--text-1)' }}>
                  {new Date(problema.fecha_limite + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  {diasRestantes !== null && (
                    <span style={{ fontSize: 11, marginLeft: 6, color: diasRestantes < 0 ? '#ef4444' : diasRestantes <= 3 ? '#f59e0b' : 'var(--text-3)' }}>
                      {diasRestantes < 0 ? `${Math.abs(diasRestantes)}d vencida` : diasRestantes === 0 ? 'hoy' : `${diasRestantes}d restantes`}
                    </span>
                  )}
                </div>
              </div>
            )}
            {objetivo && (
              <div style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>OBJETIVO VINCULADO</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }} className="truncate">{objetivo.titulo}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────
export default function Problemas() {
  const location = useLocation()
  const { workspace, miembro, miembros } = useStore()
  const [problemas, setProblemas] = useState([])
  const [objetivos, setObjetivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadingCausasForm, setLoadingCausasForm] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('activos')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { if (workspace?.id) { loadProblemas(); loadObjetivos() } }, [workspace])
  useEffect(() => {
    if (location.state?.openCreate) {
      setForm(empty()); setEditId(null); setModalOpen(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  async function loadProblemas() {
    setLoading(true)
    const { data } = await supabase.from('bos_problemas').select('*').eq('fabrica_id', workspace.id).order('created_at', { ascending: false })
    setProblemas(data || [])
    setLoading(false)
  }

  async function loadObjetivos() {
    const { data } = await supabase.from('bos_objetivos').select('id,titulo').eq('fabrica_id', workspace.id).eq('estado', 'activo').order('titulo')
    setObjetivos(data || [])
  }

  async function handleSuggestCausasForm() {
    if (!form.titulo.trim()) { toast.error('Primero escribe el título'); return }
    setLoadingCausasForm(true)
    try {
      const causas = await suggestCausas(form.titulo)
      setForm(p => ({ ...p, causas }))
    } catch { toast.error('Error generando causas') }
    finally { setLoadingCausasForm(false) }
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('El título es requerido'); return }
    if (!form.responsable) { toast.error('El responsable es requerido'); return }
    if (!form.fecha_limite) { toast.error('La fecha límite es requerida'); return }
    setSaving(true)
    try {
      const payload = {
        fabrica_id: workspace.id, titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null, impacto: form.impacto, estado: form.estado,
        causas: form.causas.filter(c => c.trim()).length ? form.causas.filter(c => c.trim()) : null,
        solucion: form.solucion.trim() || null, responsable: form.responsable || null,
        fecha_limite: form.fecha_limite || null, objetivo_id: form.objetivo_id || null,
        created_by: miembro?.profile_id
      }
      if (editId) {
        const { error } = await supabase.from('bos_problemas').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Problema actualizado')
      } else {
        const { data: prob, error } = await supabase.from('bos_problemas').insert(payload).select().single()
        if (error) throw error
        toast.success('Problema registrado')
        await supabase.from('bos_bitacora').insert({ fabrica_id: workspace.id, tipo: 'problema', titulo: `Problema detectado: ${form.titulo}`, automatico: true, created_by: miembro?.profile_id })
        if (form.crearTarea && prob) {
          await supabase.from('bos_tareas').insert({
            fabrica_id: workspace.id, titulo: `Resolver: ${form.titulo}`,
            descripcion: `problema:${prob.id}`,
            prioridad: form.prioridadTarea, estado: 'pendiente',
            asignado_a: form.responsable || null,
            fecha_limite: form.fecha_limite || null,
            created_by: miembro?.profile_id
          })
          toast.success('Tarea de seguimiento creada')
        }
      }
      setModalOpen(false); loadProblemas()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este problema?')) return
    await supabase.from('bos_problemas').delete().eq('id', id)
    toast.success('Eliminado'); loadProblemas()
    if (expandedId === id) setExpandedId(null)
  }

  const abiertos = problemas.filter(p => !['resuelto', 'descartado'].includes(p.estado))
  const criticos = abiertos.filter(p => p.impacto === 'critico' || p.impacto === 'alto')

  const problemasFiltrados = (() => {
    switch (filtroEstado) {
      case 'activos':    return problemas.filter(p => !['resuelto', 'descartado'].includes(p.estado))
      case 'resuelto':   return problemas.filter(p => p.estado === 'resuelto')
      case 'critico':    return problemas.filter(p => ['alto', 'critico'].includes(p.impacto) && !['resuelto', 'descartado'].includes(p.estado))
      case 'descartado': return problemas.filter(p => p.estado === 'descartado')
      default:           return problemas
    }
  })()

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
    </div>
  )

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Problemas</h1>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {abiertos.length > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>{abiertos.length} abierto{abiertos.length > 1 ? 's' : ''}</span>}
            {criticos.length > 0 && <span style={{ color: '#ff2d55', fontWeight: 700 }}> · {criticos.length} de alto impacto</span>}
            {abiertos.length === 0 && <span style={{ color: '#10b981' }}>Sin problemas abiertos ✓</span>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(empty()); setEditId(null); setModalOpen(true) }}>
          + Reportar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { id: 'activos',    label: `Activos (${abiertos.length})`, color: abiertos.length > 0 ? '#ef4444' : undefined },
          { id: 'critico',    label: `Alto impacto (${criticos.length})`, color: criticos.length > 0 ? '#ff2d55' : undefined },
          { id: 'resuelto',   label: `Resueltos (${problemas.filter(p => p.estado === 'resuelto').length})` },
          { id: 'todos',      label: `Todos (${problemas.length})` },
          { id: 'descartado', label: `Descartados (${problemas.filter(p => p.estado === 'descartado').length})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFiltroEstado(f.id)}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontWeight: filtroEstado === f.id ? 700 : 400,
              border: `1px solid ${filtroEstado === f.id ? (f.color || 'var(--accent)') : 'var(--border-2)'}`,
              background: filtroEstado === f.id ? (f.color || 'var(--accent)') + '18' : 'var(--bg-input)',
              color: filtroEstado === f.id ? (f.color || 'var(--accent)') : 'var(--text-3)'
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {problemasFiltrados.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🔧</div>
          <p>No hay problemas{filtroEstado !== 'todos' ? ' en esta vista' : ''}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {problemasFiltrados.map(p => {
            const isExpanded = expandedId === p.id
            const resp = miembros.find(m => m.profile_id === p.responsable)
            const respNombre = resp?.profiles?.nombre || resp?.nombre || '—'
            const dias = p.fecha_limite ? Math.ceil((new Date(p.fecha_limite) - new Date()) / 86400000) : null

            return (
              <div key={p.id}>
                <div className="card" style={{
                  padding: '12px 16px', cursor: 'pointer',
                  border: isExpanded ? `1px solid ${IMPACTO_COLORS[p.impacto]}30` : '1px solid var(--border)',
                  borderLeft: `4px solid ${IMPACTO_COLORS[p.impacto] || 'var(--border)'}`,
                  transition: 'all 0.15s'
                }} onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Top row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: IMPACTO_COLORS[p.impacto], textTransform: 'uppercase' }}>{p.impacto}</span>
                        <EstadoStepper estado={p.estado} onChange={async (e) => { const { error } = await supabase.from('bos_problemas').update({ estado: e }).eq('id', p.id); if (!error) setProblemas(prev => prev.map(x => x.id === p.id ? { ...x, estado: e } : x)) }} compact />
                        {dias !== null && (
                          <span style={{ fontSize: 10, color: dias < 0 ? '#ef4444' : dias <= 2 ? '#f59e0b' : 'var(--text-3)', fontWeight: dias < 0 ? 700 : 400 }}>
                            {dias < 0 ? `⚠ ${Math.abs(dias)}d vencida` : dias === 0 ? '⚠ Hoy' : `${dias}d`}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }} className="truncate">{p.titulo}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {respNombre !== '—' && `→ ${respNombre}`}
                        {p.objetivo_id && ` · 🎯 ${objetivos.find(o => o.id === p.objetivo_id)?.titulo?.slice(0, 30) || 'objetivo'}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                      <button className="btn btn-ghost btn-sm" title="Editar" onClick={e => {
                        e.stopPropagation()
                        setForm({ titulo: p.titulo, descripcion: p.descripcion || '', impacto: p.impacto, estado: p.estado, causas: p.causas || [], solucion: p.solucion || '', responsable: p.responsable || '', fecha_limite: p.fecha_limite || '', objetivo_id: p.objetivo_id || '', crearTarea: false, prioridadTarea: 'alta' })
                        setEditId(p.id); setModalOpen(true)
                      }}>✏</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={e => { e.stopPropagation(); handleDelete(p.id) }}>✕</button>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ background: 'var(--bg-card)', border: `1px solid ${IMPACTO_COLORS[p.impacto]}25`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '14px 16px', marginTop: -1 }}>
                    <ProblemaDetalle
                      problema={p} miembros={miembros} workspace={workspace}
                      miembro={miembro} objetivos={objetivos} onReload={loadProblemas}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editId ? 'Editar problema' : 'Reportar problema'} size="md"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : (editId ? 'Guardar' : 'Registrar')}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="label">Título del problema *</label>
            <input className="input" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Describe el problema brevemente" autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Descripción</label>
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="¿Cuándo ocurrió? ¿Qué impacto tiene?" rows={2} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Impacto</label>
              <select className="input" value={form.impacto} onChange={e => setForm(p => ({ ...p, impacto: e.target.value }))}>
                {IMPACTOS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Fecha límite *</label>
              <input className="input" type="date" value={form.fecha_limite} onChange={e => setForm(p => ({ ...p, fecha_limite: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Responsable *</label>
            <select className="input" value={form.responsable} onChange={e => setForm(p => ({ ...p, responsable: e.target.value }))}>
              <option value="">Seleccionar responsable...</option>
              {(miembros || []).map(m => {
                const nombre = m.profiles?.nombre || m.nombre || m.profile_id
                return <option key={m.profile_id} value={m.profile_id}>{nombre}</option>
              })}
            </select>
          </div>
          {objetivos.length > 0 && (
            <div className="form-group">
              <label className="label">Vincular a objetivo (opcional)</label>
              <select className="input" value={form.objetivo_id} onChange={e => setForm(p => ({ ...p, objetivo_id: e.target.value }))}>
                <option value="">Sin vínculo</option>
                {objetivos.map(o => <option key={o.id} value={o.id}>{o.titulo}</option>)}
              </select>
            </div>
          )}

          {/* Causas con IA */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="label" style={{ marginBottom: 0 }}>Causas raíz</label>
              <button className="btn btn-ghost btn-sm" onClick={handleSuggestCausasForm} disabled={loadingCausasForm}>
                {loadingCausasForm ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✨ Sugerir con IA'}
              </button>
            </div>
            {form.causas.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input className="input" value={c} onChange={e => setForm(p => ({ ...p, causas: p.causas.map((cc, ii) => ii === i ? e.target.value : cc) }))} style={{ flex: 1, fontSize: 13 }} />
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setForm(p => ({ ...p, causas: p.causas.filter((_, ii) => ii !== i) }))}>✕</button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => setForm(p => ({ ...p, causas: [...p.causas, ''] }))}>+ Añadir causa</button>
          </div>

          {/* Auto-crear tarea (solo en nuevo) */}
          {!editId && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div onClick={() => setForm(p => ({ ...p, crearTarea: !p.crearTarea }))}
                  style={{ width: 36, height: 20, borderRadius: 10, background: form.crearTarea ? 'var(--accent)' : 'var(--bg-input)', border: `2px solid ${form.crearTarea ? 'var(--accent)' : 'var(--border-2)'}`, position: 'relative', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 2, left: form.crearTarea ? 16 : 2, width: 12, height: 12, borderRadius: '50%', background: form.crearTarea ? '#fff' : 'var(--text-3)', transition: 'left 0.2s' }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Crear tarea de seguimiento</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Asignada al responsable con la misma fecha límite</p>
                </div>
              </label>
              {form.crearTarea && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Prioridad:</span>
                  {['baja', 'media', 'alta', 'critica'].map(pr => (
                    <button key={pr} type="button" onClick={() => setForm(f => ({ ...f, prioridadTarea: pr }))}
                      style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${form.prioridadTarea === pr ? 'var(--accent)' : 'var(--border-2)'}`, background: form.prioridadTarea === pr ? 'var(--accent)15' : 'transparent', color: form.prioridadTarea === pr ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      {pr}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

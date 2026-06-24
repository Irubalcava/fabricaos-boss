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
  { value: 'crecer', label: '📈 Crecer' },
  { value: 'reducir', label: '📉 Reducir' },
  { value: 'mantener', label: '🛡 Mantener' },
  { value: 'lanzar', label: '🚀 Lanzar algo nuevo' },
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

// ─── Barra de progreso visual ─────────────────────────────
function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 5, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color || 'var(--accent)', borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  )
}

// ─── Chip filtro ──────────────────────────────────────────
function FilterChip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-2)'}`,
        background: active ? 'var(--accent)18' : 'var(--bg-input)',
        color: active ? 'var(--accent)' : 'var(--text-3)',
        cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0
      }}>
      {children}
    </button>
  )
}

// ─── Tabs ─────────────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, gap: 2, flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            background: 'none', border: 'none', padding: '8px 14px', fontSize: 13,
            fontWeight: active === t.id ? 700 : 400,
            color: active === t.id ? 'var(--accent)' : 'var(--text-3)',
            borderBottom: `2px solid ${active === t.id ? 'var(--accent)' : 'transparent'}`,
            cursor: 'pointer', marginBottom: -1, transition: 'all 0.12s'
          }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── Modal de detalle ─────────────────────────────────────
function ObjetivoDetalle({ obj, onClose, onEditar, workspace, miembro, miembros, onReload }) {
  const [tab, setTab] = useState('plan')
  const [tareas, setTareas] = useState([])
  const [krs, setKrs] = useState([])
  const [bitacora, setBitacora] = useState([])
  const [loadingTab, setLoadingTab] = useState(false)
  const [newKr, setNewKr] = useState({ descripcion: '', meta: '', progreso: 0 })
  const [addingKr, setAddingKr] = useState(false)
  const [estado, setEstado] = useState(obj.estado)

  const TABS_DETALLE = [
    { id: 'plan',        label: '🗺 Plan' },
    { id: 'tareas',      label: `✅ Tareas${tareas.length > 0 ? ` (${tareas.length})` : ''}` },
    { id: 'metricas',    label: `📊 Métricas${krs.length > 0 ? ` (${krs.length})` : ''}` },
    { id: 'presupuesto', label: '💰 Presupuesto' },
    { id: 'historial',   label: '📋 Historial' },
  ]

  useEffect(() => {
    loadTabData(tab)
  }, [tab])

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
    } finally {
      setLoadingTab(false)
    }
  }

  async function handleEstadoChange(nuevoEstado) {
    const { error } = await supabase.from('bos_objetivos').update({ estado: nuevoEstado }).eq('id', obj.id)
    if (error) { toast.error(error.message); return }
    setEstado(nuevoEstado)
    toast.success('Estado actualizado')
    onReload()
  }

  async function handleTareaEstado(tareaId, nuevoEstado) {
    const { error } = await supabase.from('bos_tareas').update({ estado: nuevoEstado }).eq('id', tareaId)
    if (error) { toast.error(error.message); return }
    setTareas(prev => prev.map(t => t.id === tareaId ? { ...t, estado: nuevoEstado } : t))
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
    toast.success('Métrica añadida')
    loadTabData('metricas')
    onReload()
  }

  async function handleDeleteKr(krId) {
    await supabase.from('bos_key_results').delete().eq('id', krId)
    setKrs(prev => prev.filter(k => k.id !== krId))
    onReload()
  }

  // Progress desde KRs
  const progresoKrs = krs.length === 0 ? 0 : Math.round(
    krs.reduce((s, k) => s + (k.meta ? Math.min(100, (k.progreso / k.meta) * 100) : k.progreso), 0) / krs.length
  )
  // Progress desde tareas
  const tareasHechas = tareas.filter(t => t.estado === 'hecha').length
  const progresoPorTareas = tareas.length === 0 ? 0 : Math.round((tareasHechas / tareas.length) * 100)

  const planIA = obj.plan_ia
  const getNombre = (pid) => { const m = miembros.find(x => x.profile_id === pid); return m?.profiles?.nombre || m?.nombre || pid || '—' }

  return (
    <div>
      {/* Header del objetivo */}
      <div style={{ padding: '16px 20px', background: 'var(--bg-input)', borderRadius: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {obj.area && <span style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent)15', padding: '2px 8px', borderRadius: 8, fontWeight: 600 }}>{obj.area}</span>}
              {obj.tipo && <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 8 }}>{TIPOS_OBJETIVO.find(t => t.value === obj.tipo)?.label || obj.tipo}</span>}
              {obj.fecha_fin && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>📅 Hasta {obj.fecha_fin}</span>}
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>⏱ {diasActivo(obj.created_at)} días activo</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>{obj.titulo}</div>
            {obj.descripcion && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{obj.descripcion}</div>}
          </div>
          <select value={estado} onChange={e => handleEstadoChange(e.target.value)}
            style={{ background: ESTADO_COLORS[estado] + '18', border: `1px solid ${ESTADO_COLORS[estado]}40`, borderRadius: 8, color: ESTADO_COLORS[estado], fontSize: 11, fontWeight: 700, padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        {/* Progreso doble */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
              <span>Progreso métricas</span><span style={{ fontWeight: 700, color: 'var(--accent)' }}>{progresoKrs}%</span>
            </div>
            <ProgressBar pct={progresoKrs} color="var(--accent)" />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
              <span>Tareas completadas</span><span style={{ fontWeight: 700, color: 'var(--success)' }}>{tareasHechas}/{tareas.length || '?'}</span>
            </div>
            <ProgressBar pct={progresoPorTareas} color="var(--success)" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={TABS_DETALLE} active={tab} onChange={setTab} />

      {loadingTab && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} /></div>}

      {/* ── TAB: PLAN ── */}
      {!loadingTab && tab === 'plan' && (
        <div>
          {!planIA ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🗺</div>
              <div style={{ fontSize: 14, marginBottom: 4 }}>No hay plan generado todavía</div>
              <div style={{ fontSize: 12 }}>El plan se genera automáticamente al crear el objetivo</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Responsables */}
              {planIA.responsables?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>👥 Áreas involucradas</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {planIA.responsables.map((r, i) => (
                      <div key={i} style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 8, borderLeft: `3px solid ${ROL_COLORS[r.rol] || 'var(--border)'}` }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{r.area}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: ROL_COLORS[r.rol] || 'var(--text-3)', marginBottom: 4 }}>{r.rol}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{r.descripcion}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resumen presupuesto en Plan */}
              {planIA.presupuesto?.length > 0 && (
                <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Presupuesto total estimado</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{fmtMXN(totalPresupuestoPlan(planIA.presupuesto))}</span>
                </div>
              )}

              {/* Responsable del objetivo */}
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
          {tareas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 14 }}>No hay tareas vinculadas a este objetivo</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Ve a Tareas y vincula este objetivo al crear o editar una tarea</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Mini resumen */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                {['pendiente', 'en_progreso', 'bloqueada', 'hecha'].map(e => {
                  const cnt = tareas.filter(t => t.estado === e).length
                  if (!cnt) return null
                  return <span key={e} style={{ fontSize: 11, fontWeight: 600, color: ESTADO_TAREAS_COLORS[e], background: ESTADO_TAREAS_COLORS[e] + '18', padding: '2px 10px', borderRadius: 10 }}>{cnt} {ESTADO_TAREAS_LABELS[e]}</span>
                })}
              </div>
              {tareas.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  background: 'var(--bg-card)', border: `1px solid var(--border)`,
                  borderLeft: `4px solid ${ESTADO_TAREAS_COLORS[t.estado] || 'var(--border)'}`,
                  borderRadius: 8
                }}>
                  <select value={t.estado} onChange={e => handleTareaEstado(t.id, e.target.value)}
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-2)', borderRadius: 6, color: ESTADO_TAREAS_COLORS[t.estado], fontSize: 11, fontWeight: 700, padding: '3px 6px', cursor: 'pointer', flexShrink: 0 }}>
                    {TODOS_ESTADOS_TAREA.map(e => <option key={e} value={e}>{ESTADO_TAREAS_LABELS[e]}</option>)}
                  </select>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: t.estado === 'hecha' ? 'var(--text-3)' : 'var(--text-1)', textDecoration: t.estado === 'hecha' ? 'line-through' : 'none' }} className="truncate">
                      {t.titulo}
                    </div>
                    {t.fecha_limite && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>📅 {t.fecha_limite}</div>
                    )}
                  </div>
                  {t.prioridad && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: t.prioridad === 'alta' || t.prioridad === 'critica' ? 'var(--danger)' : 'var(--text-3)', textTransform: 'uppercase', flexShrink: 0 }}>{t.prioridad}</span>
                  )}
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
              <div key={kr.id} style={{ padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>{kr.descripcion}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color, flexShrink: 0 }}>{pct}%</span>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteKr(kr.id)}>✕</button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="range" min={0} max={kr.meta || 100} step={1}
                    value={kr.progreso}
                    onChange={e => handleKrProgreso(kr.id, e.target.value)}
                    style={{ flex: 1, accentColor: color }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                    {kr.progreso}{kr.meta ? `/${kr.meta}` : '%'}
                  </span>
                </div>
                <ProgressBar pct={pct} color={color} />
              </div>
            )
          })}

          {/* Añadir KR */}
          <div style={{ padding: '14px 16px', background: 'var(--bg-input)', border: '1px dashed var(--border-2)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10 }}>+ Nueva métrica / Key Result</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input className="input" style={{ flex: 2, minWidth: 180, fontSize: 12 }} value={newKr.descripcion}
                onChange={e => setNewKr(p => ({ ...p, descripcion: e.target.value }))}
                placeholder="Ej: Ventas mensuales" />
              <input className="input" style={{ width: 90, fontSize: 12 }} type="number" value={newKr.meta}
                onChange={e => setNewKr(p => ({ ...p, meta: e.target.value }))} placeholder="Meta" />
              <input className="input" style={{ width: 90, fontSize: 12 }} type="number" value={newKr.progreso}
                onChange={e => setNewKr(p => ({ ...p, progreso: e.target.value }))} placeholder="Actual" />
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
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>💰</div>
              <div style={{ fontSize: 14 }}>Sin presupuesto registrado</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>El plan IA incluye presupuesto automático al crear el objetivo</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Total estimado</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: '#10b981' }}>{fmtMXN(totalPresupuestoPlan(planIA.presupuesto))}</span>
              </div>
              {planIA.presupuesto.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{p.categoria}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.justificacion}</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981', flexShrink: 0 }}>{fmtMXN(p.monto)}</div>
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
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14 }}>Sin actividad registrada</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {bitacora.map(e => (
                <div key={e.id} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 7 }}>
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

  // Plan IA
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
        const tp = planIA.tareas.map(t => ({
          fabrica_id: workspace.id, titulo: t.titulo, objetivo_id: objetivoParaPlan.id,
          descripcion: `${t.descripcion || ''}${t.duracion ? ` (${t.duracion})` : ''}`, estado: 'pendiente', prioridad: 'media', created_by: miembro?.profile_id
        }))
        const { error } = await supabase.from('bos_tareas').insert(tp)
        if (error) throw error
      }
      if (planIA.metricas?.length) {
        const kp = planIA.metricas.map(m => ({
          objetivo_id: objetivoParaPlan.id, fabrica_id: workspace.id,
          descripcion: `${m.nombre} · ${m.frecuencia} · meta: ${m.meta} ${m.unidad}`,
          meta: parseFloat(m.meta) || null, progreso: 0
        }))
        const { error } = await supabase.from('bos_key_results').insert(kp)
        if (error) throw error
      }
      await supabase.from('bos_objetivos').update({ plan_ia: { presupuesto: planIA.presupuesto || [], responsables: planIA.responsables || [] } }).eq('id', objetivoParaPlan.id)
      toast.success(`Plan activado: ${planIA.tareas?.length || 0} tareas · ${planIA.metricas?.length || 0} métricas`)
      setObjetivoParaPlan(null); setPlanIA(null); loadObjetivos()
    } catch (err) { toast.error(err.message) }
    finally { setAceptandoPlan(false) }
  }

  // Edición inline plan
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
      {/* Header */}
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
        <FilterChip active={filtroEstado === 'all'} onClick={() => setFiltroEstado('all')}>
          Todos ({objetivos.length})
        </FilterChip>
        {ESTADOS.map(e => {
          const cnt = objetivos.filter(o => o.estado === e).length
          if (!cnt) return null
          return <FilterChip key={e} active={filtroEstado === e} onClick={() => setFiltroEstado(e)}>{e} ({cnt})</FilterChip>
        })}
      </div>

      {/* Lista */}
      {objetivosFiltrados.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🎯</div>
          <p>No hay objetivos</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {objetivosFiltrados.map(obj => {
            const progreso = calcProgreso(obj)
            const krs = obj.bos_key_results || []
            const semColor = progreso >= 80 ? 'var(--success)' : progreso >= 50 ? 'var(--warning)' : 'var(--accent)'
            const isSelected = detalleObj?.id === obj.id

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
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: ESTADO_COLORS[obj.estado], textTransform: 'uppercase' }}>{obj.estado}</span>
                        {obj.area && <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent)12', padding: '1px 7px', borderRadius: 8 }}>{obj.area}</span>}
                        {obj.tipo && <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--bg-input)', padding: '1px 7px', borderRadius: 8 }}>{TIPOS_OBJETIVO.find(t => t.value === obj.tipo)?.label || obj.tipo}</span>}
                        {obj.fecha_fin && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>📅 {obj.fecha_fin}</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }} className="truncate">{obj.titulo}</div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>
                          <span>{krs.length} métricas</span>
                          <span style={{ fontWeight: 700, color: semColor }}>{progreso}%</span>
                        </div>
                        <ProgressBar pct={progreso} color={semColor} />
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

                {/* Panel de detalle expandido */}
                {isSelected && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)30', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '20px 20px', marginTop: -1 }}>
                    <ObjetivoDetalle
                      obj={obj}
                      onClose={() => setDetalleObj(null)}
                      onEditar={() => { setForm({ titulo: obj.titulo, descripcion: obj.descripcion || '', responsable: obj.responsable || '', fecha_inicio: obj.fecha_inicio || '', fecha_fin: obj.fecha_fin || '', periodicidad: obj.periodicidad || 'mensual', estado: obj.estado, kpi_ids: obj.kpi_ids || [], area: obj.area || '', tipo: obj.tipo || 'crecer' }); setEditId(obj.id); setModalOpen(true) }}
                      workspace={workspace}
                      miembro={miembro}
                      miembros={miembros}
                      onReload={loadObjetivos}
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
              ✨ La IA generará tareas, métricas y presupuesto automáticamente al crear.
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

      {/* Modal Plan IA */}
      <Modal
        open={!!objetivoParaPlan}
        onClose={() => { if (!generandoPlan && !aceptandoPlan) { setObjetivoParaPlan(null); setPlanIA(null) } }}
        title={generandoPlan ? '✨ Generando plan...' : '✨ Plan generado por IA'} size="xl"
        footer={!generandoPlan && planIA ? (
          <>
            <button className="btn btn-secondary" onClick={() => { setObjetivoParaPlan(null); setPlanIA(null) }}>Omitir plan</button>
            <button className="btn btn-primary" onClick={aceptarPlan} disabled={aceptandoPlan}>
              {aceptandoPlan
                ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />Creando...</>
                : `✓ Aceptar (${planIA.tareas?.length || 0} tareas · ${planIA.metricas?.length || 0} métricas)`}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Tareas */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                ✅ Tareas sugeridas <span style={{ fontSize: 11, background: 'var(--bg-input)', color: 'var(--text-3)', padding: '2px 8px', borderRadius: 10 }}>{planIA.tareas?.length || 0}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>Edita antes de aceptar</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(planIA.tareas || []).map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, minWidth: 18, paddingTop: 10 }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <input className="input" style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }} value={t.titulo} onChange={e => updatePlanTarea(i, 'titulo', e.target.value)} />
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.descripcion}{t.duracion && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>· {t.duracion}</span>}</div>
                    </div>
                    <button onClick={() => removePlanTarea(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18, padding: '6px 4px', lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
            {/* Métricas */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                📊 Métricas <span style={{ fontSize: 11, background: 'var(--bg-input)', color: 'var(--text-3)', padding: '2px 8px', borderRadius: 10 }}>{planIA.metricas?.length || 0}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>Se crearán como Key Results</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(planIA.metricas || []).map((m, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 10, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8 }}>
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
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                💰 Presupuesto
                <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 10px', borderRadius: 10 }}>
                  {fmtMXN(totalPresupuestoPlan(planIA.presupuesto))}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(planIA.presupuesto || []).map((p, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px auto', gap: 10, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8 }}>
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
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>👥 Áreas involucradas</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {(planIA.responsables || []).map((r, i) => (
                  <div key={i} style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 8, borderLeft: `3px solid ${ROL_COLORS[r.rol] || 'var(--border)'}`, position: 'relative' }}>
                    <button onClick={() => removePlanResp(i)} style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, padding: 2, lineHeight: 1 }}>✕</button>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2, paddingRight: 20 }}>{r.area}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: ROL_COLORS[r.rol] || 'var(--text-3)', marginBottom: 4 }}>{r.rol}</div>
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

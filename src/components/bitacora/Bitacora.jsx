import React, { useEffect, useState, useRef } from 'react'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { generateSummary } from '../../lib/claude.js'

const TIPOS = ['general', 'tarea', 'kpi', 'objetivo', 'problema', 'idea', 'reunion', 'decision', 'workspace']
const TIPO_ICONS = {
  general: '📝', tarea: '✅', kpi: '📈', objetivo: '🎯',
  problema: '🔧', idea: '💡', reunion: '🤝', decision: '⚖️', workspace: '🏭'
}
const TIPO_COLORS = {
  tarea: '#10b981', kpi: 'var(--accent)', objetivo: '#8b5cf6', problema: '#ef4444',
  idea: '#f59e0b', reunion: '#06b6d4', decision: '#f97316', workspace: 'var(--text-3)', general: 'var(--text-3)'
}

const PAGE_SIZE = 30
const PERIODOS = [
  { id: 'hoy',    label: 'Hoy' },
  { id: 'semana', label: '7 días' },
  { id: 'mes',    label: '30 días' },
  { id: 'todo',   label: 'Todo' },
]

function empty() { return { titulo: '', descripcion: '', tipo: 'general' } }

function getPeriodoStart(periodo) {
  const d = new Date()
  if (periodo === 'hoy') { d.setHours(0, 0, 0, 0); return d.toISOString() }
  if (periodo === 'semana') { d.setDate(d.getDate() - 7); return d.toISOString() }
  if (periodo === 'mes') { d.setDate(d.getDate() - 30); return d.toISOString() }
  return null
}

export default function Bitacora() {
  const { workspace, miembro } = useStore()
  const [entradas, setEntradas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('all')
  const [busqueda, setBusqueda] = useState('')
  const [periodo, setPeriodo] = useState('semana')
  const [pagina, setPagina] = useState(0)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({})
  const [resumenIA, setResumenIA] = useState('')
  const [generandoResumen, setGenerandoResumen] = useState(false)
  const channelRef = useRef(null)
  const busquedaTimer = useRef(null)

  useEffect(() => {
    if (!workspace?.id) return
    loadEntradas()
    loadStats()
    subscribeRealtime()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [workspace])

  useEffect(() => { if (workspace?.id) { loadEntradas(); loadStats() } }, [filtroTipo, periodo, pagina])

  // Realtime — nuevas entradas aparecen sin recargar
  function subscribeRealtime() {
    channelRef.current = supabase
      .channel(`bitacora-${workspace.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'bos_bitacora',
        filter: `fabrica_id=eq.${workspace.id}`
      }, payload => {
        setEntradas(prev => {
          const ya = prev.find(e => e.id === payload.new.id)
          if (ya) return prev
          return [payload.new, ...prev].slice(0, PAGE_SIZE)
        })
        setTotal(t => t + 1)
        setStats(prev => {
          const tipo = payload.new.tipo || 'general'
          return { ...prev, [tipo]: (prev[tipo] || 0) + 1 }
        })
      })
      .subscribe()
  }

  async function loadEntradas() {
    setLoading(true)
    let q = supabase.from('bos_bitacora').select('*', { count: 'exact' })
      .eq('fabrica_id', workspace.id)
      .order('created_at', { ascending: false })
      .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1)

    if (filtroTipo !== 'all') q = q.eq('tipo', filtroTipo)
    const start = getPeriodoStart(periodo)
    if (start) q = q.gte('created_at', start)
    if (busqueda.trim()) q = q.or(`titulo.ilike.%${busqueda.trim()}%,descripcion.ilike.%${busqueda.trim()}%`)

    const { data, count } = await q
    setEntradas(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  async function loadStats() {
    const start = getPeriodoStart(periodo)
    let q = supabase.from('bos_bitacora').select('tipo').eq('fabrica_id', workspace.id)
    if (start) q = q.gte('created_at', start)
    const { data } = await q
    const counts = {}
    ;(data || []).forEach(e => { counts[e.tipo] = (counts[e.tipo] || 0) + 1 })
    setStats(counts)
  }

  // Búsqueda con debounce
  function handleBusqueda(val) {
    setBusqueda(val)
    clearTimeout(busquedaTimer.current)
    busquedaTimer.current = setTimeout(() => { setPagina(0); loadEntradas() }, 350)
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('El título es requerido'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('bos_bitacora').insert({
        fabrica_id: workspace.id, tipo: form.tipo,
        titulo: form.titulo.trim(), descripcion: form.descripcion.trim() || null,
        automatico: false, created_by: miembro?.profile_id
      })
      if (error) throw error
      toast.success('Entrada registrada')
      setModalOpen(false); setForm(empty()); setPagina(0)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta entrada?')) return
    await supabase.from('bos_bitacora').delete().eq('id', id)
    toast.success('Eliminada')
    setEntradas(prev => prev.filter(e => e.id !== id))
    setTotal(t => t - 1)
  }

  async function handleGenerarResumen() {
    setGenerandoResumen(true); setResumenIA('')
    try {
      // Cargar hasta 80 entradas para el resumen
      const start = getPeriodoStart(periodo)
      let q = supabase.from('bos_bitacora').select('tipo, titulo, created_at').eq('fabrica_id', workspace.id).order('created_at', { ascending: false }).limit(80)
      if (start) q = q.gte('created_at', start)
      const { data } = await q
      if (!data?.length) { toast.info('No hay actividad para resumir'); setGenerandoResumen(false); return }

      const periodoLabel = { hoy: 'hoy', semana: 'esta semana', mes: 'este mes', todo: 'en total' }[periodo]
      const actividad = data.map(e => `• [${e.tipo}] ${e.titulo}`).join('\n')

      const prompt = `Eres el asistente de Business OS. Resume la actividad del equipo de forma ejecutiva y en español.

Período: ${periodoLabel}
Total de eventos: ${data.length}

Actividad registrada:
${actividad}

Genera un resumen narrativo de 3-5 oraciones que destaque:
1. Qué tipo de actividad predominó
2. Logros o avances relevantes
3. Áreas de atención (problemas, tareas pendientes)
4. Tendencia general del negocio

Responde directamente con el resumen, sin introducción.`

      const txt = await generateSummary(prompt, 500)
      setResumenIA(txt)
    } catch { toast.error('Error generando resumen') }
    finally { setGenerandoResumen(false) }
  }

  const totalPaginas = Math.ceil(total / PAGE_SIZE)
  const totalStats = Object.values(stats).reduce((s, v) => s + v, 0)

  function agruparPorFecha(items) {
    const g = {}
    items.forEach(e => {
      const f = e.created_at?.split('T')[0] || 'sin-fecha'
      if (!g[f]) g[f] = []
      g[f].push(e)
    })
    return g
  }

  function formatFecha(fechaStr) {
    const hoy = new Date().toISOString().split('T')[0]
    const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    if (fechaStr === hoy) return 'Hoy'
    if (fechaStr === ayer) return 'Ayer'
    return new Date(fechaStr + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  function formatHora(iso) {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  }

  const grupos = agruparPorFecha(entradas)

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Bitácora</h1>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {total} entradas · <span style={{ color: 'var(--accent)', fontSize: 11 }}>🔴 En vivo</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleGenerarResumen} disabled={generandoResumen}>
            {generandoResumen ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />Analizando...</> : '✨ Resumen IA'}
          </button>
          <button className="btn btn-primary" onClick={() => { setForm(empty()); setModalOpen(true) }}>
            + Anotar
          </button>
        </div>
      </div>

      {/* Stats por tipo */}
      {totalStats > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {TIPOS.filter(t => stats[t] > 0).sort((a, b) => (stats[b] || 0) - (stats[a] || 0)).map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: `${TIPO_COLORS[t]}15`, border: `1px solid ${TIPO_COLORS[t]}30` }}>
              <span style={{ fontSize: 12 }}>{TIPO_ICONS[t]}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: TIPO_COLORS[t] }}>{stats[t]}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{t}</span>
            </div>
          ))}
        </div>
      )}

      {/* Resumen IA */}
      {resumenIA && (
        <div style={{ padding: '14px 16px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6' }}>✨ Resumen IA — {PERIODOS.find(p => p.id === periodo)?.label}</div>
            <button onClick={() => setResumenIA('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 14, padding: '0 4px' }}>✕</button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.75 }}>{resumenIA}</div>
        </div>
      )}

      {/* Controles */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Periodo */}
        <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: 8, padding: 3, gap: 2 }}>
          {PERIODOS.map(p => (
            <button key={p.id} onClick={() => { setPeriodo(p.id); setPagina(0) }}
              style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: periodo === p.id ? 700 : 400, background: periodo === p.id ? 'var(--accent)' : 'transparent', color: periodo === p.id ? '#000' : 'var(--text-3)', transition: 'all 0.12s' }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Tipo */}
        <select className="input" style={{ width: 'auto', fontSize: 12 }} value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPagina(0) }}>
          <option value="all">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{TIPO_ICONS[t]} {t}</option>)}
        </select>

        {/* Búsqueda */}
        <input className="input" style={{ flex: 1, minWidth: 180, fontSize: 12 }}
          value={busqueda} onChange={e => handleBusqueda(e.target.value)}
          placeholder="Buscar en bitácora..." />

        {(busqueda || filtroTipo !== 'all') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setBusqueda(''); setFiltroTipo('all'); setPagina(0) }} style={{ fontSize: 11, color: 'var(--text-3)' }}>
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Timeline */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
        </div>
      ) : entradas.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📚</div>
          <p>No hay entradas{busqueda || filtroTipo !== 'all' ? ' con estos filtros' : ' en este período'}</p>
        </div>
      ) : (
        <>
          {Object.entries(grupos).map(([fecha, items]) => (
            <div key={fecha} style={{ marginBottom: 24 }}>
              {/* Separador de fecha */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
                  {formatFecha(fecha)}
                </div>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{items.length} evento{items.length > 1 ? 's' : ''}</div>
              </div>

              {/* Entradas con línea vertical */}
              <div style={{ position: 'relative', paddingLeft: 28 }}>
                {/* Línea vertical */}
                <div style={{ position: 'absolute', left: 10, top: 4, bottom: 4, width: 2, background: 'var(--border)', borderRadius: 1 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {items.map((entry, idx) => {
                    const color = TIPO_COLORS[entry.tipo] || 'var(--text-3)'
                    return (
                      <div key={entry.id} style={{ position: 'relative' }}>
                        {/* Punto en línea */}
                        <div style={{
                          position: 'absolute', left: -22, top: 14,
                          width: 10, height: 10, borderRadius: '50%',
                          background: entry.automatico ? 'var(--bg-card)' : color,
                          border: `2px solid ${color}`,
                          zIndex: 1
                        }} />

                        <div style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          padding: '9px 12px',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          borderLeft: `3px solid ${color}`,
                          borderRadius: 8,
                          transition: 'border-color 0.12s'
                        }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = color}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.borderLeftColor = color }}
                        >
                          {/* Icono */}
                          <div style={{ width: 24, height: 24, borderRadius: 6, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                            {TIPO_ICONS[entry.tipo] || '📝'}
                          </div>

                          {/* Contenido */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{entry.titulo}</span>
                              {entry.automatico
                                ? <span style={{ fontSize: 9, color: 'var(--text-3)', background: 'var(--border)', padding: '1px 5px', borderRadius: 8, fontWeight: 600 }}>AUTO</span>
                                : <span style={{ fontSize: 9, color: color, background: `${color}18`, padding: '1px 5px', borderRadius: 8, fontWeight: 600 }}>MANUAL</span>
                              }
                            </div>
                            {entry.descripcion && (
                              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.5 }}>{entry.descripcion}</div>
                            )}
                          </div>

                          {/* Hora + acción */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>{formatHora(entry.created_at)}</span>
                            {!entry.automatico && (
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '2px 6px' }} onClick={() => handleDelete(entry.id)}>✕</button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary btn-sm" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>← Anterior</button>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{pagina + 1} / {totalPaginas} · {total} entradas</span>
              <button className="btn btn-secondary btn-sm" disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)}>Siguiente →</button>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Anotar en bitácora" size="md"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Registrar'}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="label">Tipo</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TIPOS.map(t => (
                <button key={t} type="button" onClick={() => setForm(p => ({ ...p, tipo: t }))}
                  style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${form.tipo === t ? TIPO_COLORS[t] : 'var(--border-2)'}`, background: form.tipo === t ? `${TIPO_COLORS[t]}18` : 'var(--bg-input)', color: form.tipo === t ? TIPO_COLORS[t] : 'var(--text-3)', fontSize: 12, fontWeight: form.tipo === t ? 700 : 400, cursor: 'pointer' }}>
                  {TIPO_ICONS[t]} {t}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="label">¿Qué ocurrió? *</label>
            <input className="input" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Describe el evento brevemente" autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Detalles (opcional)</label>
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Contexto adicional..." rows={3} />
          </div>
        </div>
      </Modal>
    </div>
  )
}

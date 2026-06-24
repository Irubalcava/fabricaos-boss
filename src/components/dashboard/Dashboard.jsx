import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { generateSummary } from '../../lib/claude.js'

// ─── SVG icons ────────────────────────────────────────────
const IC = {
  check:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  target:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  alert:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  cal:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  activity:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  idea:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/></svg>,
  doc:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  reunion: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
}

const TIPO_ICON = { tarea: IC.check, objetivo: IC.target, problema: IC.alert, reunion: IC.reunion, idea: IC.idea, default: IC.doc }
const PRIORIDAD_COLOR = { urgente: '#ef4444', alta: '#f97316', media: '#f59e0b', baja: '#6b7280' }

// ─── helpers ──────────────────────────────────────────────
function getSaludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function diasActivo(isoDate) {
  if (!isoDate) return 0
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000)
}

function semaforo(dias) {
  if (dias < 30)  return { color: '#10b981', label: 'Al día' }
  if (dias < 90)  return { color: '#f59e0b', label: 'En curso' }
  return           { color: '#ef4444', label: 'Atención' }
}

function pct(hecha, total) {
  return total === 0 ? 0 : Math.round((hecha / total) * 100)
}

// ─── sub-components ───────────────────────────────────────
function Dot({ color, size = 8, glow = false }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: color, flexShrink: 0,
      boxShadow: glow ? `0 0 6px ${color}` : 'none'
    }} />
  )
}

function BigStat({ value, label, sub, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, minWidth: 0, background: 'var(--bg-card)', border: `1px solid ${color}25`,
      borderRadius: 12, padding: '18px 20px', cursor: 'pointer', textAlign: 'left',
      transition: 'all 0.15s'
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '55'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = color + '25'; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{ fontSize: 38, fontWeight: 900, color, lineHeight: 1, letterSpacing: -1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 3 }}>{sub}</div>}
    </button>
  )
}

function ObjetivoCard({ obj, onClick }) {
  const dias = diasActivo(obj.created_at)
  const sem = semaforo(dias)
  const progreso = pct(obj._tareas_hechas || 0, obj._tareas_total || 0)
  const TIPO_LABELS = { crecer: '📈 Crecer', mejorar: '🔧 Mejorar', resolver: '⚡ Resolver', mantener: '🛡 Mantener' }

  return (
    <button onClick={onClick} style={{
      background: 'var(--bg-card)', border: `1px solid var(--border)`,
      borderLeft: `4px solid ${sem.color}`,
      borderRadius: 10, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
      transition: 'all 0.15s', minWidth: 220, flex: 1
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = sem.color + '60'; e.currentTarget.style.background = sem.color + '06' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3, flex: 1 }} className="truncate">
          {obj.titulo}
        </div>
        <Dot color={sem.color} size={9} glow />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {obj.area && <span style={{ fontSize: 10, background: 'var(--bg-input)', color: 'var(--text-3)', padding: '2px 7px', borderRadius: 8 }}>{obj.area}</span>}
        {obj.tipo && <span style={{ fontSize: 10, background: 'var(--bg-input)', color: 'var(--text-3)', padding: '2px 7px', borderRadius: 8 }}>{TIPO_LABELS[obj.tipo] || obj.tipo}</span>}
      </div>
      {/* Barra de progreso */}
      <div>
        <div style={{ height: 4, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progreso}%`, background: sem.color, borderRadius: 4, transition: 'width 0.5s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{sem.label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{progreso}% de tareas</span>
        </div>
      </div>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────
export default function Dashboard() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { workspace, miembro, miembros, sucursal } = useStore()

  const [stats, setStats] = useState({ tareasPendientes: 0, tareasVencidas: 0, objetivosActivos: 0, problemasAbiertos: 0, reunionesHoy: 0 })
  const [tareasHoy, setTareasHoy] = useState([])
  const [reunionesHoy, setReunionesHoy] = useState([])
  const [objetivos, setObjetivos] = useState([])
  const [problemas, setProblemas] = useState([])
  const [actividad, setActividad] = useState([])
  const [resumenIA, setResumenIA] = useState('')
  const [loadingIA, setLoadingIA] = useState(false)
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]
  const esLunes = new Date().getDay() === 1
  const nombreDia = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  // Sucursal filter helper
  const addSucursalFilter = (q) => {
    if (sucursal?.id) return q.eq('sucursal_id', sucursal.id)
    return q
  }

  useEffect(() => {
    if (workspace?.id) loadDashboard()
  }, [workspace, sucursal])

  useEffect(() => {
    if (loading || !workspace?.id) return
    const key = `resumen_lunes_${workspace.id}_${today}`
    const guardado = localStorage.getItem(key)
    if (guardado) { setResumenIA(guardado); return }
    if (esLunes) handleResumenIA(true)
  }, [loading])

  async function loadDashboard() {
    setLoading(true)
    const fabId = workspace.id

    // Base query builder
    const q = (table) => {
      let base = supabase.from(table).select('*', { count: 'exact', head: true }).eq('fabrica_id', fabId)
      return addSucursalFilter(base)
    }

    try {
      const [
        tareasRes, vencidasRes, objCountRes, probCountRes,
        tareasHoyRes, reunionesRes, objetivosRes, problemasRes, actividadRes
      ] = await Promise.all([
        // Counts
        q('bos_tareas').not('estado', 'in', '("hecha","cancelada")'),
        q('bos_tareas').lt('fecha_limite', today).not('estado', 'in', '("hecha","cancelada")'),
        q('bos_objetivos').not('estado', 'in', '("completado","cancelado")'),
        q('bos_problemas').not('estado', 'in', '("resuelto","descartado")'),

        // Tareas de hoy (items reales)
        addSucursalFilter(
          supabase.from('bos_tareas').select('id,titulo,prioridad,estado,responsable_id').eq('fabrica_id', fabId).eq('fecha_limite', today).not('estado', 'in', '("hecha","cancelada")')
        ).limit(6),

        // Reuniones de hoy
        addSucursalFilter(
          supabase.from('bos_reuniones').select('id,titulo,hora_inicio,sucursal').eq('fabrica_id', fabId).eq('fecha', today)
        ).order('hora_inicio'),

        // Objetivos activos con area y tipo
        addSucursalFilter(
          supabase.from('bos_objetivos').select('id,titulo,area,tipo,estado,created_at,fecha_fin').eq('fabrica_id', fabId).not('estado', 'in', '("completado","cancelado")')
        ).order('created_at', { ascending: false }).limit(6),

        // Problemas abiertos
        addSucursalFilter(
          supabase.from('bos_problemas').select('id,titulo,prioridad,estado,created_at').eq('fabrica_id', fabId).not('estado', 'in', '("resuelto","descartado")')
        ).order('created_at', { ascending: false }).limit(5),

        // Actividad
        supabase.from('bos_bitacora').select('*').eq('fabrica_id', fabId).order('created_at', { ascending: false }).limit(6)
      ])

      setStats({
        tareasPendientes: tareasRes.count || 0,
        tareasVencidas:   vencidasRes.count || 0,
        objetivosActivos: objCountRes.count || 0,
        problemasAbiertos: probCountRes.count || 0
      })
      setTareasHoy(tareasHoyRes.data || [])
      setReunionesHoy(reunionesRes.data || [])
      setActividad(actividadRes.data || [])

      // Objetivos con conteo de tareas
      const objs = objetivosRes.data || []
      if (objs.length > 0) {
        const tareasPromises = objs.map(obj =>
          Promise.all([
            supabase.from('bos_tareas').select('*', { count: 'exact', head: true }).eq('fabrica_id', fabId).eq('objetivo_id', obj.id).eq('estado', 'hecha'),
            supabase.from('bos_tareas').select('*', { count: 'exact', head: true }).eq('fabrica_id', fabId).eq('objetivo_id', obj.id)
          ])
        )
        const resultados = await Promise.all(tareasPromises)
        const objsConProg = objs.map((obj, i) => ({
          ...obj,
          _tareas_hechas: resultados[i][0].count || 0,
          _tareas_total:  resultados[i][1].count || 0
        }))
        setObjetivos(objsConProg)
      } else {
        setObjetivos([])
      }

      setProblemas(problemasRes.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleResumenIA = useCallback(async (auto = false) => {
    if (loadingIA) return
    setLoadingIA(true)
    try {
      const prompt = `Eres el asistente ejecutivo de "${workspace?.nombre}". Hoy es ${nombreDia}.

Estado actual:
- Tareas pendientes: ${stats.tareasPendientes} (${stats.tareasVencidas} vencidas)
- Tareas que vencen hoy: ${tareasHoy.length}
- Objetivos activos: ${stats.objetivosActivos}
- Problemas abiertos: ${stats.problemasAbiertos}
- Reuniones hoy: ${reunionesHoy.length}

Objetivos activos: ${objetivos.map(o => `"${o.titulo}" (${o.area || 'general'})`).join(', ') || 'ninguno'}
Problemas abiertos: ${problemas.map(p => `"${p.titulo}"`).join(', ') || 'ninguno'}

Dame un resumen ejecutivo en 3 oraciones. Prioriza lo urgente. Sé directo, sin preamble.`

      const res = await generateSummary(prompt, 512)
      setResumenIA(res)
      if (auto) {
        const key = `resumen_lunes_${workspace?.id}_${today}`
        localStorage.setItem(key, res)
      }
    } catch (e) {
      setResumenIA('Error generando resumen.')
    } finally {
      setLoadingIA(false)
    }
  }, [stats, tareasHoy, reunionesHoy, objetivos, problemas, workspace, loadingIA])

  const getNombre = (profileId) => {
    const m = miembros.find(x => x.profile_id === profileId)
    return m?.profiles?.nombre || m?.nombre || null
  }

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    )
  }

  const hayDatos = stats.tareasPendientes + stats.objetivosActivos + stats.problemasAbiertos > 0

  return (
    <div className="page" style={{ maxWidth: 900 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>
              {getSaludo()}{miembro?.nombre ? `, ${miembro.nombre.split(' ')[0]}` : ''} 👋
            </h1>
            <p style={{ color: 'var(--text-3)', fontSize: 13, textTransform: 'capitalize' }}>{nombreDia}</p>
          </div>
          {sucursal && (
            <span style={{ fontSize: 12, fontWeight: 600, background: (sucursal.color || 'var(--accent)') + '20', color: sucursal.color || 'var(--accent)', padding: '4px 12px', borderRadius: 20, border: `1px solid ${sucursal.color || 'var(--accent)'}40`, flexShrink: 0, marginTop: 4 }}>
              🏢 {sucursal.nombre}
            </span>
          )}
        </div>
      </div>

      {/* ── ¿QUÉ HAGO HOY? ── */}
      {(tareasHoy.length > 0 || reunionesHoy.length > 0) && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
            ¿Qué hago hoy?
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tareasHoy.map(t => (
              <button key={t.id} onClick={() => navigate(`/${slug}/tareas`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderLeft: `4px solid ${PRIORIDAD_COLOR[t.prioridad] || 'var(--accent)'}`,
                  borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-input)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)' }}
              >
                <span style={{ color: PRIORIDAD_COLOR[t.prioridad] || 'var(--accent)' }}>{IC.check}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }} className="truncate">{t.titulo}</span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                  {getNombre(t.responsable_id) && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-input)', padding: '2px 7px', borderRadius: 8 }}>
                      {getNombre(t.responsable_id).split(' ')[0]}
                    </span>
                  )}
                  {t.prioridad && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: PRIORIDAD_COLOR[t.prioridad], textTransform: 'uppercase' }}>
                      {t.prioridad}
                    </span>
                  )}
                </div>
              </button>
            ))}
            {reunionesHoy.map(r => (
              <button key={r.id} onClick={() => navigate(`/${slug}/reuniones`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderLeft: '4px solid #6366f1',
                  borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-input)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)' }}
              >
                <span style={{ color: '#6366f1' }}>{IC.reunion}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }} className="truncate">
                  {r.titulo}
                </span>
                {r.hora_inicio && (
                  <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>{r.hora_inicio.slice(0, 5)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 3 BIG NUMBERS ── */}
      {hayDatos && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <BigStat
            value={stats.tareasPendientes}
            label="Tareas pendientes"
            sub={stats.tareasVencidas > 0 ? `${stats.tareasVencidas} vencidas` : null}
            color="#00d4ff"
            onClick={() => navigate(`/${slug}/tareas`)}
          />
          <BigStat
            value={stats.objetivosActivos}
            label="Objetivos activos"
            color="#6366f1"
            onClick={() => navigate(`/${slug}/objetivos`)}
          />
          <BigStat
            value={stats.problemasAbiertos}
            label="Problemas abiertos"
            color={stats.problemasAbiertos > 0 ? '#ef4444' : 'var(--text-3)'}
            onClick={() => navigate(`/${slug}/problemas`)}
          />
        </div>
      )}

      {/* ── OBJETIVOS ── */}
      {objetivos.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase' }}>
              ¿Cómo van los objetivos?
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${slug}/objetivos`)}>Ver todos →</button>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {objetivos.slice(0, 4).map(obj => (
              <ObjetivoCard key={obj.id} obj={obj} onClick={() => navigate(`/${slug}/objetivos`)} />
            ))}
          </div>
        </div>
      )}

      {/* ── BLOQUEADORES ── */}
      {problemas.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', letterSpacing: 1, textTransform: 'uppercase' }}>
              ¿Hay algo bloqueado?
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${slug}/problemas`)}>Ver todos →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {problemas.map(p => (
              <button key={p.id} onClick={() => navigate(`/${slug}/problemas`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.18)',
                  borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.04)' }}
              >
                <span style={{ color: PRIORIDAD_COLOR[p.prioridad] || '#ef4444' }}>{IC.alert}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }} className="truncate">{p.titulo}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: PRIORIDAD_COLOR[p.prioridad] || '#ef4444', textTransform: 'uppercase' }}>
                    {p.prioridad || 'media'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                    {diasActivo(p.created_at)}d
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── RESUMEN IA ── */}
      <div className="card" style={{ marginBottom: 24, borderColor: resumenIA ? 'rgba(0,212,255,0.2)' : 'var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🤖</div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', margin: 0 }}>Resumen ejecutivo IA</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                {esLunes && !resumenIA ? 'Generando resumen del lunes...' : 'Análisis del estado actual del negocio'}
              </p>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => handleResumenIA(false)} disabled={loadingIA || !hayDatos} style={{ opacity: hayDatos ? 1 : 0.4 }}>
            {loadingIA ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✨ Actualizar'}
          </button>
        </div>
        {resumenIA && (
          <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.75, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            {resumenIA}
          </p>
        )}
      </div>

      {/* ── ONBOARDING vacío ── */}
      {!hayDatos && (
        <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(0,212,255,0.06) 100%)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 14, padding: '28px 24px', marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🚀</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>Tu workspace está listo</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>Empieza creando un objetivo o registrando tus primeras tareas</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { label: '🎯 Crear objetivo', path: 'objetivos' },
              { label: '✅ Agregar tarea', path: 'tareas' },
              { label: '⚡ Registrar problema', path: 'problemas' },
            ].map(item => (
              <button key={item.path} className="btn btn-secondary" onClick={() => navigate(`/${slug}/${item.path}`)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── ACTIVIDAD ── */}
      {actividad.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase' }}>
              Actividad reciente
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${slug}/bitacora`)}>Ver todo →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {actividad.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 8px', borderRadius: 7, transition: 'background 0.1s' }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg-input)'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--bg-input)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', flexShrink: 0, marginTop: 1 }}>
                  {TIPO_ICON[e.tipo] || TIPO_ICON.default}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }} className="truncate">{e.titulo}</div>
                  {e.descripcion && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }} className="truncate">{e.descripcion}</div>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0, paddingTop: 2 }}>
                  {new Date(e.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

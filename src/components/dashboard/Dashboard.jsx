import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { generateSummary } from '../../lib/claude.js'

const ICONS = {
  tarea:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  kpi:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  objetivo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  problema: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  idea:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/></svg>,
  reunion:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  decision: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="3"/><path d="M7.05 4.05L5.636 5.464"/><line x1="1" y1="9" x2="3" y2="9"/><path d="M16.95 4.05L18.364 5.464"/><line x1="21" y1="9" x2="23" y2="9"/><path d="M4.22 15H2a10 10 0 0120 0h-2.22"/><path d="M12 15v7"/></svg>,
  workspace:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>,
  general:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
}

function IconBadge({ type, color, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: color + '18',
      border: `1px solid ${color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color, flexShrink: 0
    }}>
      {ICONS[type] || ICONS.general}
    </div>
  )
}

const MODULOS = [
  { key: 'tareas',    label: 'Tareas',     desc: 'Organiza y asigna tareas a tu equipo',       color: '#00d4ff', type: 'tarea',    path: 'tareas'    },
  { key: 'kpis',     label: 'KPIs',        desc: 'Mide el desempeño con indicadores clave',     color: '#10b981', type: 'kpi',      path: 'kpis'      },
  { key: 'objetivos',label: 'Objetivos',   desc: 'Define metas y haz seguimiento de avance',    color: '#6366f1', type: 'objetivo', path: 'objetivos' },
  { key: 'problemas',label: 'Problemas',   desc: 'Registra y resuelve obstáculos del negocio',  color: '#ef4444', type: 'problema', path: 'problemas' },
  { key: 'ideas',    label: 'Ideas',       desc: 'Captura y evalúa ideas de mejora',            color: '#f59e0b', type: 'idea',     path: 'ideas'     },
  { key: 'reuniones',label: 'Reuniones',   desc: 'Agenda juntas y registra acuerdos',           color: '#00d4ff', type: 'reunion',  path: 'reuniones' },
  { key: 'decisiones',label:'Decisiones',  desc: 'Vota y documenta decisiones importantes',     color: '#6366f1', type: 'decision', path: 'decisiones'},
]

export default function Dashboard() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { workspace, miembro } = useStore()
  const [stats, setStats] = useState({
    tareasPendientes: 0, tareasHoy: 0,
    kpisActivos: 0, objetivosActivos: 0,
    problemasAbiertos: 0, ideasPendientes: 0,
    reunionesHoy: 0, decisionesPendientes: 0
  })
  const [actividadReciente, setActividadReciente] = useState([])
  const [resumenIA, setResumenIA] = useState('')
  const [loadingIA, setLoadingIA] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (workspace?.id) loadStats() }, [workspace])

  async function loadStats() {
    setLoading(true)
    const fabId = workspace.id
    const today = new Date().toISOString().split('T')[0]
    const [
      { count: tareasPendientes }, { count: tareasHoy },
      { count: kpisActivos }, { count: objetivosActivos },
      { count: problemasAbiertos }, { count: ideasPendientes },
      { count: reunionesHoy }, { count: decisionesPendientes },
      { data: bitacora }
    ] = await Promise.all([
      supabase.from('bos_tareas').select('*', { count: 'exact', head: true }).eq('fabrica_id', fabId).not('estado', 'in', '("hecha","cancelada")'),
      supabase.from('bos_tareas').select('*', { count: 'exact', head: true }).eq('fabrica_id', fabId).eq('fecha_limite', today).not('estado', 'in', '("hecha","cancelada")'),
      supabase.from('bos_kpis').select('*', { count: 'exact', head: true }).eq('fabrica_id', fabId).eq('activo', true),
      supabase.from('bos_objetivos').select('*', { count: 'exact', head: true }).eq('fabrica_id', fabId).not('estado', 'in', '("completado","cancelado")'),
      supabase.from('bos_problemas').select('*', { count: 'exact', head: true }).eq('fabrica_id', fabId).not('estado', 'in', '("resuelto","descartado")'),
      supabase.from('bos_ideas').select('*', { count: 'exact', head: true }).eq('fabrica_id', fabId).eq('estado', 'pendiente'),
      supabase.from('bos_reuniones').select('*', { count: 'exact', head: true }).eq('fabrica_id', fabId).eq('fecha', today),
      supabase.from('bos_decisiones').select('*', { count: 'exact', head: true }).eq('fabrica_id', fabId).eq('estado', 'votacion'),
      supabase.from('bos_bitacora').select('*').eq('fabrica_id', fabId).order('created_at', { ascending: false }).limit(8)
    ])
    setStats({ tareasPendientes: tareasPendientes||0, tareasHoy: tareasHoy||0, kpisActivos: kpisActivos||0, objetivosActivos: objetivosActivos||0, problemasAbiertos: problemasAbiertos||0, ideasPendientes: ideasPendientes||0, reunionesHoy: reunionesHoy||0, decisionesPendientes: decisionesPendientes||0 })
    setActividadReciente(bitacora || [])
    setLoading(false)
  }

  async function handleResumenIA() {
    setLoadingIA(true)
    try {
      const prompt = `Eres el asistente de Business OS. Resume el estado actual del negocio "${workspace?.nombre}" en 3-4 oraciones ejecutivas basándote en estos datos:\n- Tareas pendientes: ${stats.tareasPendientes} (${stats.tareasHoy} vencen hoy)\n- KPIs activos: ${stats.kpisActivos}\n- Objetivos en curso: ${stats.objetivosActivos}\n- Problemas abiertos: ${stats.problemasAbiertos}\n- Ideas pendientes de evaluar: ${stats.ideasPendientes}\n- Reuniones hoy: ${stats.reunionesHoy}\n- Decisiones en votación: ${stats.decisionesPendientes}\n\nSé conciso, ejecutivo y menciona las prioridades más urgentes.`
      const res = await generateSummary(prompt)
      setResumenIA(res)
    } catch (e) {
      setResumenIA('Error generando resumen. Verifica tu API key de Claude.')
    } finally {
      setLoadingIA(false)
    }
  }

  const totalDatos = stats.tareasPendientes + stats.kpisActivos + stats.objetivosActivos + stats.problemasAbiertos + stats.ideasPendientes + stats.reunionesHoy + stats.decisionesPendientes
  const esVacio = totalDatos === 0

  const STAT_CARDS = [
    { label: 'Tareas pendientes', value: stats.tareasPendientes, sub: stats.tareasHoy > 0 ? `${stats.tareasHoy} vencen hoy` : null, color: '#00d4ff', type: 'tarea', path: 'tareas', urgente: stats.tareasHoy > 0 },
    { label: 'KPIs activos',       value: stats.kpisActivos,         color: '#10b981', type: 'kpi',      path: 'kpis'      },
    { label: 'Objetivos en curso',  value: stats.objetivosActivos,    color: '#6366f1', type: 'objetivo', path: 'objetivos' },
    { label: 'Problemas abiertos',  value: stats.problemasAbiertos,   color: '#ef4444', type: 'problema', path: 'problemas', urgente: stats.problemasAbiertos > 0 },
    { label: 'Ideas a evaluar',     value: stats.ideasPendientes,     color: '#f59e0b', type: 'idea',     path: 'ideas'     },
    { label: 'Reuniones hoy',       value: stats.reunionesHoy,        color: '#00d4ff', type: 'reunion',  path: 'reuniones' },
    { label: 'Decisiones en votación', value: stats.decisionesPendientes, color: '#6366f1', type: 'decision', path: 'decisiones', urgente: stats.decisionesPendientes > 0 },
  ]

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    )
  }

  return (
    <div className="page">
      {/* Saludo */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>
          Bienvenido{miembro?.nombre ? `, ${miembro.nombre.split(' ')[0]}` : ''} 👋
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Onboarding — solo cuando workspace vacío */}
      {esVacio && (
        <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(0,212,255,0.06) 100%)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 14, padding: '24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
              {ICONS.objetivo}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', margin: 0 }}>Tu workspace está listo — ¡empieza aquí!</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Elige por dónde quieres comenzar</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {MODULOS.map(m => (
              <button
                key={m.key}
                onClick={() => navigate(`/${slug}/${m.path}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-2)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = m.color; e.currentTarget.style.background = m.color + '0a' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--bg-card)' }}
              >
                <IconBadge type={m.type} color={m.color} size={32} />
                <div>
                  <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-1)', margin: 0 }}>{m.label}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0, lineHeight: 1.3 }}>{m.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Resumen IA */}
      <div className="card" style={{ marginBottom: 24, borderColor: esVacio ? 'var(--border)' : 'rgba(0,212,255,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🤖</div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', margin: 0 }}>Resumen ejecutivo IA</p>
              {esVacio && <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Disponible cuando tengas datos registrados</p>}
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleResumenIA}
            disabled={loadingIA || esVacio}
            title={esVacio ? 'Agrega tus primeros datos para obtener un análisis' : ''}
            style={{ opacity: esVacio ? 0.45 : 1 }}
          >
            {loadingIA ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '✨ Generar resumen'}
          </button>
        </div>
        {resumenIA && (
          <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.7, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            {resumenIA}
          </p>
        )}
      </div>

      {/* Stat cards — solo si hay datos */}
      {!esVacio && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 28 }}>
          {STAT_CARDS.map(card => (
            <button
              key={card.path}
              onClick={() => navigate(`/${slug}/${card.path}`)}
              style={{ background: 'var(--bg-card)', border: `1px solid ${card.urgente ? card.color + '40' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '16px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 10 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = card.color + '60'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = card.urgente ? card.color + '40' : 'var(--border)'; e.currentTarget.style.transform = 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <IconBadge type={card.type} color={card.color} size={32} />
                {card.urgente && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: card.color, boxShadow: `0 0 6px ${card.color}`, display: 'block' }} />
                )}
              </div>
              <div>
                <div style={{ fontSize: 30, fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500, marginTop: 3 }}>{card.label}</div>
                {card.sub && <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 2 }}>{card.sub}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Actividad reciente */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Actividad reciente</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${slug}/bitacora`)}>Ver todo →</button>
        </div>
        {actividadReciente.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 0', gap: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bg-input)', border: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
              {ICONS.general}
            </div>
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>La actividad de tu equipo aparecerá aquí</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {actividadReciente.map(entry => (
              <div key={entry.id}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, transition: 'background 0.1s', cursor: 'default' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-input)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--bg-input)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', flexShrink: 0, marginTop: 1 }}>
                  {ICONS[entry.tipo] || ICONS.general}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }} className="truncate">{entry.titulo}</div>
                  {entry.descripcion && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }} className="truncate">{entry.descripcion}</div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0, paddingTop: 2 }}>
                  {new Date(entry.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

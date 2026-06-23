import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { generateSummary } from '../../lib/claude.js'

export default function Dashboard() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { workspace, miembro } = useStore()
  const [stats, setStats] = useState({
    tareasPendientes: 0,
    tareasHoy: 0,
    kpisActivos: 0,
    objetivosActivos: 0,
    problemasAbiertos: 0,
    ideasPendientes: 0,
    reunionesHoy: 0,
    decisionesPendientes: 0
  })
  const [actividadReciente, setActividadReciente] = useState([])
  const [resumenIA, setResumenIA] = useState('')
  const [loadingIA, setLoadingIA] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (workspace?.id) loadStats()
  }, [workspace])

  async function loadStats() {
    setLoading(true)
    const fabId = workspace.id
    const today = new Date().toISOString().split('T')[0]

    const [
      { count: tareasPendientes },
      { count: tareasHoy },
      { count: kpisActivos },
      { count: objetivosActivos },
      { count: problemasAbiertos },
      { count: ideasPendientes },
      { count: reunionesHoy },
      { count: decisionesPendientes },
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

    setStats({
      tareasPendientes: tareasPendientes || 0,
      tareasHoy: tareasHoy || 0,
      kpisActivos: kpisActivos || 0,
      objetivosActivos: objetivosActivos || 0,
      problemasAbiertos: problemasAbiertos || 0,
      ideasPendientes: ideasPendientes || 0,
      reunionesHoy: reunionesHoy || 0,
      decisionesPendientes: decisionesPendientes || 0
    })
    setActividadReciente(bitacora || [])
    setLoading(false)
  }

  async function handleResumenIA() {
    setLoadingIA(true)
    try {
      const prompt = `Eres el asistente de Business OS. Resume el estado actual del negocio "${workspace?.nombre}" en 3-4 oraciones ejecutivas basándote en estos datos:
- Tareas pendientes: ${stats.tareasPendientes} (${stats.tareasHoy} vencen hoy)
- KPIs activos: ${stats.kpisActivos}
- Objetivos en curso: ${stats.objetivosActivos}
- Problemas abiertos: ${stats.problemasAbiertos}
- Ideas pendientes de evaluar: ${stats.ideasPendientes}
- Reuniones hoy: ${stats.reunionesHoy}
- Decisiones en votación: ${stats.decisionesPendientes}

Sé conciso, ejecutivo y menciona las prioridades más urgentes.`
      const res = await generateSummary(prompt)
      setResumenIA(res)
    } catch (e) {
      setResumenIA('Error generando resumen. Verifica tu API key de Claude.')
    } finally {
      setLoadingIA(false)
    }
  }

  const STAT_CARDS = [
    { label: 'Tareas pendientes', value: stats.tareasPendientes, sub: `${stats.tareasHoy} vencen hoy`, icon: '✅', color: 'var(--accent)', path: 'tareas', urgente: stats.tareasHoy > 0 },
    { label: 'KPIs activos', value: stats.kpisActivos, icon: '📈', color: 'var(--success)', path: 'kpis' },
    { label: 'Objetivos en curso', value: stats.objetivosActivos, icon: '🎯', color: 'var(--accent-2)', path: 'objetivos' },
    { label: 'Problemas abiertos', value: stats.problemasAbiertos, icon: '🔧', color: 'var(--danger)', path: 'problemas', urgente: stats.problemasAbiertos > 0 },
    { label: 'Ideas a evaluar', value: stats.ideasPendientes, icon: '💡', color: 'var(--warning)', path: 'ideas' },
    { label: 'Reuniones hoy', value: stats.reunionesHoy, icon: '🤝', color: 'var(--accent)', path: 'reuniones' },
    { label: 'Decisiones en votación', value: stats.decisionesPendientes, icon: '⚖️', color: 'var(--accent-2)', path: 'decisiones', urgente: stats.decisionesPendientes > 0 },
  ]

  const TIPO_ICONS = {
    tarea: '✅', kpi: '📈', objetivo: '🎯', problema: '🔧',
    idea: '💡', reunion: '🤝', decision: '⚖️', workspace: '🏭', general: '📝'
  }

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>
          Bienvenido, {miembro?.nombre || workspace?.nombre} 👋
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Resumen IA */}
      <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(0,212,255,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: resumenIA ? 12 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>Resumen ejecutivo IA</span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleResumenIA}
            disabled={loadingIA}
          >
            {loadingIA ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '✨ Generar resumen'}
          </button>
        </div>
        {resumenIA && (
          <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.7, marginTop: 12 }}>
            {resumenIA}
          </p>
        )}
        {!resumenIA && !loadingIA && (
          <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 8 }}>
            Haz clic en "Generar resumen" para obtener un análisis IA del estado de tu negocio
          </p>
        )}
      </div>

      {/* Stat cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 14,
        marginBottom: 28
      }}>
        {STAT_CARDS.map(card => (
          <button
            key={card.path}
            onClick={() => navigate(`/${slug}/${card.path}`)}
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${card.urgente ? card.color + '40' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding: '16px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = card.color; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = card.urgente ? card.color + '40' : 'var(--border)'; e.currentTarget.style.transform = 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 20 }}>{card.icon}</span>
              {card.urgente && (
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: card.color,
                  boxShadow: `0 0 6px ${card.color}`
                }} />
              )}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: card.color, lineHeight: 1 }}>
              {card.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{card.label}</div>
            {card.sub && (
              <div style={{ fontSize: 11, color: card.urgente ? 'var(--warning)' : 'var(--text-3)' }}>{card.sub}</div>
            )}
          </button>
        ))}
      </div>

      {/* Actividad reciente */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Actividad reciente</h3>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/${slug}/bitacora`)}
          >Ver todo →</button>
        </div>

        {actividadReciente.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px' }}>
            <div className="icon">📝</div>
            <p>Sin actividad reciente</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {actividadReciente.map(entry => (
              <div key={entry.id} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 6,
                transition: 'background 0.1s'
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                  {TIPO_ICONS[entry.tipo] || '📝'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }} className="truncate">
                    {entry.titulo}
                  </div>
                  {entry.descripcion && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }} className="truncate">
                      {entry.descripcion}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
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

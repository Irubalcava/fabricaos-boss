import React, { useEffect, useState, useMemo } from 'react'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const TIPOS = ['numero', 'porcentaje', 'moneda', 'booleano']
const FRECUENCIAS = ['diario', 'semanal', 'mensual']
const AREAS = ['Ventas', 'Marketing', 'Operaciones', 'RH', 'Finanzas', 'Tecnología', 'Logística', 'Administración', 'Otro']

// ─── Umbrales de staleness por frecuencia (días) ──────────
const STALE_UMBRAL = {
  diario:   { verde: 2,  amarillo: 4  },
  semanal:  { verde: 8,  amarillo: 14 },
  mensual:  { verde: 35, amarillo: 60 },
}

function diasDesdeUltimaMedicion(kpi) {
  const meds = kpi.bos_kpi_mediciones || []
  if (!meds.length) return Infinity
  const ultima = meds.reduce((max, m) => new Date(m.fecha) > new Date(max.fecha) ? m : max)
  return Math.floor((Date.now() - new Date(ultima.fecha).getTime()) / 86_400_000)
}

function getSemaforo(kpi) {
  const dias = diasDesdeUltimaMedicion(kpi)
  const u = STALE_UMBRAL[kpi.frecuencia] || STALE_UMBRAL.mensual
  if (dias === Infinity) return { color: '#ef4444', label: 'Sin datos', icon: '🔴' }
  if (dias <= u.verde)   return { color: '#10b981', label: 'Al día',    icon: '🟢' }
  if (dias <= u.amarillo)return { color: '#f59e0b', label: 'Próximo',   icon: '🟡' }
  return                        { color: '#ef4444', label: 'Atrasado',  icon: '🔴' }
}

function getTendencia(kpi) {
  const meds = (kpi.bos_kpi_mediciones || [])
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  if (meds.length < 2) return null
  const diff = meds[0].valor - meds[1].valor
  if (diff > 0)  return { icon: '↑', color: '#10b981', label: `+${diff.toLocaleString('es-MX')}` }
  if (diff < 0)  return { icon: '↓', color: '#ef4444', label: diff.toLocaleString('es-MX') }
  return               { icon: '→', color: '#6b7280', label: '±0' }
}

function getUltimoValor(kpi) {
  const meds = kpi.bos_kpi_mediciones || []
  if (!meds.length) return null
  return meds.reduce((max, m) => new Date(m.fecha) > new Date(max.fecha) ? m : max).valor
}

function getPct(kpi) {
  const v = getUltimoValor(kpi)
  if (v === null || !kpi.meta) return null
  return Math.min(100, Math.round((v / kpi.meta) * 100))
}

function formatValor(valor, kpi) {
  if (valor === null || valor === undefined) return '—'
  if (kpi.tipo === 'porcentaje') return `${valor}%`
  if (kpi.tipo === 'moneda') return `$${Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`
  if (kpi.tipo === 'booleano') return valor >= 1 ? '✓ Sí' : '✗ No'
  return `${valor}${kpi.unidad ? ' ' + kpi.unidad : ''}`
}

function getChartData(kpi) {
  return (kpi.bos_kpi_mediciones || [])
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .slice(-12)
    .map(m => ({ fecha: m.fecha.slice(5), valor: m.valor, nota: m.nota }))
}

function calcDesglose(meta, frecuencia, tipo, unidad) {
  const m = parseFloat(meta)
  if (!m || tipo === 'booleano') return null
  const fmt = v => {
    const n = Math.round(v * 100) / 100
    if (tipo === 'moneda') return `$${n.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
    if (tipo === 'porcentaje') return `${n}%`
    return `${n}${unidad ? ' ' + unidad : ''}`
  }
  if (frecuencia === 'diario') return [
    { label: 'Día', valor: fmt(m) }, { label: 'Semana', valor: fmt(m * 7) },
    { label: 'Mes', valor: fmt(m * 30) }, { label: 'Trimestre', valor: fmt(m * 90) },
  ]
  if (frecuencia === 'semanal') return [
    { label: 'Día', valor: fmt(m / 7) }, { label: 'Semana', valor: fmt(m) },
    { label: 'Mes', valor: fmt(m * 4.33) }, { label: 'Trimestre', valor: fmt(m * 13) },
  ]
  return [
    { label: 'Día', valor: fmt(m / 30) }, { label: 'Semana', valor: fmt(m / 4.33) },
    { label: 'Mes', valor: fmt(m) }, { label: 'Trimestre', valor: fmt(m * 3) },
  ]
}

function empty() {
  return { nombre: '', descripcion: '', tipo: 'numero', meta: '', unidad: '', frecuencia: 'mensual', responsable: '', area: '', plan: '' }
}

// ─── Health index global ──────────────────────────────────
function calcHealthIndex(kpis) {
  if (!kpis.length) return null
  const scores = kpis.filter(k => k.activo).map(kpi => {
    const pct = getPct(kpi)
    const sem = getSemaforo(kpi)
    let score = 0
    // Penalizar KPIs stale
    const stalePenalty = sem.color === '#ef4444' ? 0.5 : sem.color === '#f59e0b' ? 0.8 : 1
    if (pct !== null) {
      score = Math.min(100, pct) * stalePenalty
    } else {
      score = sem.color === '#ef4444' ? 0 : sem.color === '#f59e0b' ? 50 : 80
    }
    return score
  })
  if (!scores.length) return null
  return Math.round(scores.reduce((s, x) => s + x, 0) / scores.length)
}

// ─── KPI Card ─────────────────────────────────────────────
function KpiCard({ kpi, expanded, onToggle, onEditar, onEliminar, onMedicion, getNombre }) {
  const sem = getSemaforo(kpi)
  const tendencia = getTendencia(kpi)
  const pct = getPct(kpi)
  const ultimoValor = getUltimoValor(kpi)
  const chartData = getChartData(kpi)
  const dias = diasDesdeUltimaMedicion(kpi)
  const pctColor = pct === null ? 'var(--accent)' : pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ opacity: kpi.activo ? 1 : 0.55 }}>
      <div className="card" style={{
        padding: '14px 16px', cursor: 'pointer',
        borderLeft: `4px solid ${sem.color}`,
        borderColor: expanded ? sem.color + '50' : 'var(--border)',
        transition: 'all 0.15s'
      }} onClick={onToggle}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.borderColor = sem.color + '40' }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        {/* Fila superior: nombre + semáforo + acciones */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: sem.color, flexShrink: 0, boxShadow: `0 0 5px ${sem.color}` }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }} className="truncate">{kpi.nombre}</div>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', fontSize: 10, color: 'var(--text-3)' }}>
              <span>{kpi.frecuencia}</span>
              {kpi.area && <span style={{ color: 'var(--accent)', background: 'var(--accent)15', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>{kpi.area}</span>}
              {kpi.responsable && <span>· {getNombre(kpi.responsable).split(' ')[0]}</span>}
              <span style={{ color: sem.color, fontWeight: 600 }}>· {sem.label}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button className="btn btn-primary btn-sm" onClick={onMedicion}>+ Valor</button>
            <button className="btn btn-ghost btn-sm" onClick={onEditar}>✏</button>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onEliminar}>✕</button>
          </div>
        </div>

        {/* Valor actual + tendencia */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: pctColor, lineHeight: 1, letterSpacing: -1 }}>
            {formatValor(ultimoValor, kpi)}
          </div>
          {tendencia && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, paddingBottom: 4 }}>
              <span style={{ fontSize: 20, color: tendencia.color, fontWeight: 900 }}>{tendencia.icon}</span>
              <span style={{ fontSize: 11, color: tendencia.color, fontWeight: 600 }}>{tendencia.label}</span>
            </div>
          )}
          {dias !== Infinity && (
            <div style={{ marginLeft: 'auto', fontSize: 11, color: sem.color, fontWeight: 600, paddingBottom: 4 }}>
              hace {dias}d
            </div>
          )}
        </div>

        {/* Barra de progreso vs meta */}
        {kpi.meta && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
              <span>Meta: {formatValor(kpi.meta, kpi)}</span>
              <span style={{ color: pctColor, fontWeight: 700 }}>{pct ?? 0}%</span>
            </div>
            <div style={{ height: 5, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct ?? 0}%`, background: pctColor, borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Panel expandido */}
      {expanded && (
        <div style={{ background: 'var(--bg-card)', border: `1px solid ${sem.color}30`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '16px 16px', marginTop: -1 }}>
          {/* Gráfica */}
          {chartData.length > 1 && (
            <div style={{ height: 110, marginBottom: 14 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-2)', borderRadius: 6, fontSize: 11 }}
                    formatter={(v) => [formatValor(v, kpi), 'Valor']}
                  />
                  {kpi.meta && <ReferenceLine y={kpi.meta} stroke={pctColor} strokeDasharray="4 4" strokeOpacity={0.5} />}
                  <Line type="monotone" dataKey="valor" stroke={sem.color} strokeWidth={2} dot={{ fill: sem.color, r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Desglose de meta */}
          {kpi.meta && kpi.tipo !== 'booleano' && (() => {
            const d = calcDesglose(kpi.meta, kpi.frecuencia, kpi.tipo, kpi.unidad)
            return d ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
                {d.map(({ label, valor }) => (
                  <div key={label} style={{ textAlign: 'center', background: 'var(--bg-input)', borderRadius: 6, padding: '6px 4px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{valor}</div>
                  </div>
                ))}
              </div>
            ) : null
          })()}

          {/* Plan */}
          {kpi.plan && (
            <div style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-input)', padding: '8px 10px', borderRadius: 6, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>Plan: </span>{kpi.plan}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────
export default function KPIs() {
  const { workspace, miembro, miembros } = useStore()
  const [kpis, setKpis] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMedicion, setModalMedicion] = useState(null)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [medicionValor, setMedicionValor] = useState('')
  const [medicionNota, setMedicionNota] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [filtroArea, setFiltroArea] = useState('all')
  const [soloAtrasados, setSoloAtrasados] = useState(false)

  useEffect(() => { if (workspace?.id) loadKPIs() }, [workspace])

  async function loadKPIs() {
    setLoading(true)
    const { data } = await supabase
      .from('bos_kpis')
      .select('*, bos_kpi_mediciones(valor, fecha, nota, created_at)')
      .eq('fabrica_id', workspace.id)
      .order('created_at', { ascending: false })
    setKpis(data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.nombre.trim()) { toast.error('El nombre es requerido'); return }
    setSaving(true)
    try {
      const payload = {
        fabrica_id: workspace.id, nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null, tipo: form.tipo,
        meta: form.meta ? parseFloat(form.meta) : null, unidad: form.unidad.trim() || null,
        frecuencia: form.frecuencia, responsable: form.responsable || null,
        area: form.area || null, plan: form.plan.trim() || null, activo: true, created_by: miembro?.profile_id
      }
      if (editId) {
        const { error } = await supabase.from('bos_kpis').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('KPI actualizado')
      } else {
        const { error } = await supabase.from('bos_kpis').insert(payload)
        if (error) throw error
        toast.success('KPI creado')
      }
      setModalOpen(false); loadKPIs()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function handleMedicion() {
    if (!medicionValor && medicionValor !== '0') { toast.error('Ingresa un valor'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('bos_kpi_mediciones').insert({
        kpi_id: modalMedicion.id, fabrica_id: workspace.id,
        valor: parseFloat(medicionValor), nota: medicionNota.trim() || null,
        fecha: new Date().toISOString().split('T')[0], created_by: miembro?.profile_id
      })
      if (error) throw error
      toast.success('Medición registrada ✓')
      setModalMedicion(null); setMedicionValor(''); setMedicionNota(''); loadKPIs()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este KPI y todas sus mediciones?')) return
    await supabase.from('bos_kpis').delete().eq('id', id)
    toast.success('KPI eliminado'); loadKPIs()
    if (expandedId === id) setExpandedId(null)
  }

  function openEdit(kpi) {
    setForm({ nombre: kpi.nombre, descripcion: kpi.descripcion || '', tipo: kpi.tipo, meta: kpi.meta?.toString() || '', unidad: kpi.unidad || '', frecuencia: kpi.frecuencia, responsable: kpi.responsable || '', area: kpi.area || '', plan: kpi.plan || '' })
    setEditId(kpi.id); setModalOpen(true)
  }

  const getNombre = (pid) => {
    const m = miembros?.find(x => x.profile_id === pid)
    return m?.profiles?.nombre || m?.nombre || pid || '—'
  }

  // Áreas únicas para filtro
  const areasUsadas = [...new Set(kpis.map(k => k.area).filter(Boolean))]

  // KPIs filtrados
  const kpisFiltrados = useMemo(() => {
    return kpis.filter(k => {
      if (filtroArea !== 'all' && k.area !== filtroArea) return false
      if (soloAtrasados) {
        const sem = getSemaforo(k)
        return sem.color !== '#10b981'
      }
      return true
    })
  }, [kpis, filtroArea, soloAtrasados])

  // Health index
  const healthIndex = calcHealthIndex(kpis)
  const healthColor = healthIndex === null ? 'var(--text-3)' : healthIndex >= 80 ? '#10b981' : healthIndex >= 50 ? '#f59e0b' : '#ef4444'
  const healthLabel = healthIndex === null ? '—' : healthIndex >= 80 ? 'Saludable' : healthIndex >= 50 ? 'Con atención' : 'Crítico'

  // KPIs atrasados
  const kpisAtrasados = kpis.filter(k => k.activo && getSemaforo(k).color === '#ef4444')
  const kpisAmarillo  = kpis.filter(k => k.activo && getSemaforo(k).color === '#f59e0b')

  const desglose = form.meta && form.tipo !== 'booleano' ? calcDesglose(form.meta, form.frecuencia, form.tipo, form.unidad) : null

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
    </div>
  )

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>KPIs</h1>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {kpis.filter(k => k.activo).length} activos · {kpisAtrasados.length} atrasados
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(empty()); setEditId(null); setModalOpen(true) }}>
          + Nuevo KPI
        </button>
      </div>

      {/* Health index + alertas */}
      {kpis.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, marginBottom: 20 }}>
          {/* Índice de salud */}
          <div className="card" style={{ padding: '16px 24px', textAlign: 'center', borderColor: healthColor + '30', minWidth: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Salud del negocio</div>
            <div style={{ fontSize: 48, fontWeight: 900, color: healthColor, lineHeight: 1, letterSpacing: -2 }}>
              {healthIndex ?? '—'}
            </div>
            {healthIndex !== null && <div style={{ fontSize: 11, color: healthColor, fontWeight: 600, marginTop: 4 }}>{healthLabel}</div>}
          </div>

          {/* Alertas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {kpisAtrasados.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, cursor: 'pointer' }}
                onClick={() => setSoloAtrasados(v => !v)}>
                <span style={{ fontSize: 18 }}>🔴</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444' }}>
                    {kpisAtrasados.length} KPI{kpisAtrasados.length > 1 ? 's' : ''} sin actualizar
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {kpisAtrasados.map(k => k.nombre).join(', ')}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{soloAtrasados ? 'Ver todos' : 'Filtrar →'}</span>
              </div>
            )}
            {kpisAmarillo.length > 0 && !kpisAtrasados.length && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8 }}>
                <span style={{ fontSize: 18 }}>🟡</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>
                  {kpisAmarillo.length} KPI{kpisAmarillo.length > 1 ? 's' : ''} próximos a vencer
                </div>
              </div>
            )}
            {kpisAtrasados.length === 0 && kpisAmarillo.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
                <span style={{ fontSize: 18 }}>🟢</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>Todos los KPIs al día</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filtros */}
      {kpis.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          <button onClick={() => { setFiltroArea('all'); setSoloAtrasados(false) }}
            style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: filtroArea === 'all' && !soloAtrasados ? 700 : 500, border: `1px solid ${filtroArea === 'all' && !soloAtrasados ? 'var(--accent)' : 'var(--border-2)'}`, background: filtroArea === 'all' && !soloAtrasados ? 'var(--accent)18' : 'var(--bg-input)', color: filtroArea === 'all' && !soloAtrasados ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer' }}>
            Todos ({kpis.length})
          </button>
          {areasUsadas.map(a => {
            const cnt = kpis.filter(k => k.area === a).length
            return (
              <button key={a} onClick={() => { setFiltroArea(a); setSoloAtrasados(false) }}
                style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: filtroArea === a ? 700 : 500, border: `1px solid ${filtroArea === a ? 'var(--accent)' : 'var(--border-2)'}`, background: filtroArea === a ? 'var(--accent)18' : 'var(--bg-input)', color: filtroArea === a ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer' }}>
                {a} ({cnt})
              </button>
            )
          })}
          {kpisAtrasados.length > 0 && (
            <button onClick={() => setSoloAtrasados(v => !v)}
              style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: soloAtrasados ? 700 : 500, border: `1px solid ${soloAtrasados ? '#ef4444' : 'var(--border-2)'}`, background: soloAtrasados ? 'rgba(239,68,68,0.12)' : 'var(--bg-input)', color: soloAtrasados ? '#ef4444' : 'var(--text-3)', cursor: 'pointer' }}>
              🔴 Sin actualizar ({kpisAtrasados.length})
            </button>
          )}
        </div>
      )}

      {/* Grid de KPIs */}
      {kpisFiltrados.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📈</div>
          <p>{kpis.length === 0 ? 'No hay KPIs definidos' : 'Sin KPIs con estos filtros'}</p>
          {kpis.length === 0 && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { setForm(empty()); setEditId(null); setModalOpen(true) }}>
              Crear primer KPI
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {kpisFiltrados.map(kpi => (
            <KpiCard
              key={kpi.id} kpi={kpi}
              expanded={expandedId === kpi.id}
              onToggle={() => setExpandedId(expandedId === kpi.id ? null : kpi.id)}
              onEditar={() => openEdit(kpi)}
              onEliminar={() => handleDelete(kpi.id)}
              onMedicion={() => { setModalMedicion(kpi); setMedicionValor(''); setMedicionNota('') }}
              getNombre={getNombre}
            />
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar KPI' : 'Nuevo KPI'} size="md"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : (editId ? 'Guardar' : 'Crear')}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="label">Nombre del KPI *</label>
            <input className="input" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Ventas mensuales" autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Descripción</label>
            <input className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="¿Qué mide este KPI?" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Área</label>
              <select className="input" value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))}>
                <option value="">Sin área</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Encargado</label>
              <select className="input" value={form.responsable} onChange={e => setForm(p => ({ ...p, responsable: e.target.value }))}>
                <option value="">Sin asignar</option>
                {(miembros || []).map(m => <option key={m.profile_id} value={m.profile_id}>{m.profiles?.nombre || m.nombre || m.profile_id}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Tipo</label>
              <select className="input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Frecuencia de medición</label>
              <select className="input" value={form.frecuencia} onChange={e => setForm(p => ({ ...p, frecuencia: e.target.value }))}>
                {FRECUENCIAS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Meta</label>
              <input className="input" type="number" value={form.meta} onChange={e => setForm(p => ({ ...p, meta: e.target.value }))} placeholder="Ej: 100000" />
            </div>
            <div className="form-group">
              <label className="label">Unidad</label>
              <input className="input" value={form.unidad} onChange={e => setForm(p => ({ ...p, unidad: e.target.value }))} placeholder="Ej: piezas, kg, hrs" />
            </div>
          </div>
          {desglose && (
            <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>Vista previa desglose</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {desglose.map(({ label, valor }) => (
                  <div key={label} style={{ textAlign: 'center', background: 'var(--bg-card)', borderRadius: 6, padding: '6px 4px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{valor}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="label">Plan para alcanzar la meta</label>
            <textarea className="input" rows={3} value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value }))} placeholder="Estrategia, acciones clave, recursos necesarios..." style={{ resize: 'vertical' }} />
          </div>
        </div>
      </Modal>

      {/* Modal medición */}
      <Modal open={!!modalMedicion} onClose={() => setModalMedicion(null)} title={`Registrar: ${modalMedicion?.nombre}`} size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalMedicion(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleMedicion} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Registrar'}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {modalMedicion && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--bg-input)', padding: '8px 12px', borderRadius: 6 }}>
              Meta: <strong>{formatValor(modalMedicion.meta, modalMedicion)}</strong> · Frecuencia: {modalMedicion.frecuencia}
              {getUltimoValor(modalMedicion) !== null && (
                <span> · Último: <strong>{formatValor(getUltimoValor(modalMedicion), modalMedicion)}</strong></span>
              )}
            </div>
          )}
          <div className="form-group">
            <label className="label">Valor actual *</label>
            <input className="input" type="number" step="any" value={medicionValor} onChange={e => setMedicionValor(e.target.value)} placeholder={`Ej: ${modalMedicion?.meta || '0'}`} autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Nota (opcional)</label>
            <input className="input" value={medicionNota} onChange={e => setMedicionNota(e.target.value)} placeholder="Observación breve" />
          </div>
        </div>
      </Modal>
    </div>
  )
}

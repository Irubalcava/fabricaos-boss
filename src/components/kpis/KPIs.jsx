import React, { useEffect, useState } from 'react'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const TIPOS = ['numero', 'porcentaje', 'moneda', 'booleano']
const FRECUENCIAS = ['diario', 'semanal', 'mensual']

function empty() {
  return { nombre: '', descripcion: '', tipo: 'numero', meta: '', unidad: '', frecuencia: 'mensual' }
}

export default function KPIs() {
  const { workspace, miembro } = useStore()
  const [kpis, setKpis] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMedicion, setModalMedicion] = useState(null)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [mediciones, setMediciones] = useState({})
  const [medicionValor, setMedicionValor] = useState('')
  const [medicionNota, setMedicionNota] = useState('')
  const [selectedKpi, setSelectedKpi] = useState(null)

  useEffect(() => {
    if (workspace?.id) loadKPIs()
  }, [workspace])

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
        fabrica_id: workspace.id,
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        tipo: form.tipo,
        meta: form.meta ? parseFloat(form.meta) : null,
        unidad: form.unidad.trim() || null,
        frecuencia: form.frecuencia,
        activo: true,
        created_by: miembro?.profile_id
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
      setModalOpen(false)
      loadKPIs()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleMedicion() {
    if (!medicionValor && medicionValor !== '0') { toast.error('Ingresa un valor'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('bos_kpi_mediciones').insert({
        kpi_id: modalMedicion.id,
        fabrica_id: workspace.id,
        valor: parseFloat(medicionValor),
        nota: medicionNota.trim() || null,
        fecha: new Date().toISOString().split('T')[0],
        created_by: miembro?.profile_id
      })
      if (error) throw error
      toast.success('Medición registrada')
      setModalMedicion(null)
      setMedicionValor('')
      setMedicionNota('')
      loadKPIs()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(kpi) {
    const { error } = await supabase.from('bos_kpis').update({ activo: !kpi.activo }).eq('id', kpi.id)
    if (error) { toast.error(error.message); return }
    loadKPIs()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este KPI y todas sus mediciones?')) return
    const { error } = await supabase.from('bos_kpis').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('KPI eliminado')
    loadKPIs()
  }

  function getUltimoValor(kpi) {
    const meds = kpi.bos_kpi_mediciones || []
    if (!meds.length) return null
    return meds.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0].valor
  }

  function getPorcentajeMeta(kpi) {
    const ultimo = getUltimoValor(kpi)
    if (ultimo === null || !kpi.meta) return null
    return Math.min(100, Math.round((ultimo / kpi.meta) * 100))
  }

  function formatValor(valor, kpi) {
    if (valor === null || valor === undefined) return '—'
    if (kpi.tipo === 'porcentaje') return `${valor}%`
    if (kpi.tipo === 'moneda') return `$${Number(valor).toLocaleString('es-MX')}`
    if (kpi.tipo === 'booleano') return valor >= 1 ? '✓ Sí' : '✗ No'
    return `${valor}${kpi.unidad ? ' ' + kpi.unidad : ''}`
  }

  function getChartData(kpi) {
    const meds = (kpi.bos_kpi_mediciones || [])
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .slice(-10)
    return meds.map(m => ({ fecha: m.fecha.slice(5), valor: m.valor }))
  }

  if (loading) {
    return <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div className="spinner" /></div>
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>KPIs</h1>
        <button className="btn btn-primary" onClick={() => { setForm(empty()); setEditId(null); setModalOpen(true) }}>
          + Nuevo KPI
        </button>
      </div>

      {kpis.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📈</div>
          <p>No hay KPIs definidos aún</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { setForm(empty()); setEditId(null); setModalOpen(true) }}>
            Crear primer KPI
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {kpis.map(kpi => {
            const ultimoValor = getUltimoValor(kpi)
            const pct = getPorcentajeMeta(kpi)
            const chartData = getChartData(kpi)
            return (
              <div key={kpi.id} className="card" style={{
                opacity: kpi.activo ? 1 : 0.55,
                display: 'flex', flexDirection: 'column', gap: 14,
                cursor: 'pointer'
              }}
                onClick={() => setSelectedKpi(selectedKpi?.id === kpi.id ? null : kpi)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{kpi.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      {kpi.tipo} · {kpi.frecuencia}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setModalMedicion(kpi)}>+ Valor</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setForm({ nombre: kpi.nombre, descripcion: kpi.descripcion || '', tipo: kpi.tipo, meta: kpi.meta?.toString() || '', unidad: kpi.unidad || '', frecuencia: kpi.frecuencia })
                      setEditId(kpi.id)
                      setModalOpen(true)
                    }}>✏</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(kpi.id)}>✕</button>
                  </div>
                </div>

                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
                  {formatValor(ultimoValor, kpi)}
                </div>

                {kpi.meta && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: 'var(--text-3)' }}>
                      <span>Meta: {formatValor(kpi.meta, kpi)}</span>
                      <span style={{ color: pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--warning)' : 'var(--danger)' }}>{pct ?? 0}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{
                        width: `${pct ?? 0}%`,
                        background: pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--warning)' : 'var(--danger)'
                      }} />
                    </div>
                  </div>
                )}

                {selectedKpi?.id === kpi.id && chartData.length > 1 && (
                  <div style={{ height: 100 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: 'var(--text-3)' }} />
                        <YAxis hide />
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-2)', borderRadius: 6, fontSize: 12 }} />
                        <Line type="monotone" dataKey="valor" stroke="var(--accent)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal crear/editar KPI */}
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
              <label className="label">Tipo</label>
              <select className="input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Frecuencia</label>
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
        </div>
      </Modal>

      {/* Modal registrar medición */}
      <Modal open={!!modalMedicion} onClose={() => setModalMedicion(null)} title={`Registrar medición: ${modalMedicion?.nombre}`} size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalMedicion(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleMedicion} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Registrar'}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="label">Valor *</label>
            <input className="input" type="number" step="any" value={medicionValor} onChange={e => setMedicionValor(e.target.value)} placeholder="Ingresa el valor medido" autoFocus />
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

import React, { useEffect, useState, useCallback } from 'react'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'

const TIPOS = ['general', 'tarea', 'kpi', 'objetivo', 'problema', 'idea', 'reunion', 'decision', 'workspace']

const TIPO_ICONS = {
  general: '📝', tarea: '✅', kpi: '📈', objetivo: '🎯',
  problema: '🔧', idea: '💡', reunion: '🤝', decision: '⚖️', workspace: '🏭'
}

function empty() {
  return { titulo: '', descripcion: '', tipo: 'general' }
}

const PAGE_SIZE = 20

export default function Bitacora() {
  const { workspace, miembro } = useStore()
  const [entradas, setEntradas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('all')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (workspace?.id) loadEntradas()
  }, [workspace, filtroTipo, pagina])

  async function loadEntradas() {
    setLoading(true)
    let query = supabase
      .from('bos_bitacora')
      .select('*', { count: 'exact' })
      .eq('fabrica_id', workspace.id)
      .order('created_at', { ascending: false })
      .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1)

    if (filtroTipo !== 'all') {
      query = query.eq('tipo', filtroTipo)
    }

    const { data, count } = await query
    setEntradas(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  function buscarFiltrado(items) {
    if (!busqueda.trim()) return items
    const q = busqueda.toLowerCase()
    return items.filter(e =>
      e.titulo?.toLowerCase().includes(q) ||
      e.descripcion?.toLowerCase().includes(q)
    )
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('El título es requerido'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('bos_bitacora').insert({
        fabrica_id: workspace.id,
        tipo: form.tipo,
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        automatico: false,
        created_by: miembro?.profile_id
      })
      if (error) throw error
      toast.success('Entrada registrada en bitácora')
      setModalOpen(false)
      setForm(empty())
      setPagina(0)
      loadEntradas()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta entrada de la bitácora?')) return
    const { error } = await supabase.from('bos_bitacora').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Entrada eliminada')
    loadEntradas()
  }

  const entradasFiltradas = buscarFiltrado(entradas)
  const totalPaginas = Math.ceil(total / PAGE_SIZE)

  function agruparPorFecha(items) {
    const grupos = {}
    items.forEach(item => {
      const fecha = item.created_at?.split('T')[0] || 'Sin fecha'
      if (!grupos[fecha]) grupos[fecha] = []
      grupos[fecha].push(item)
    })
    return grupos
  }

  const grupos = agruparPorFecha(entradasFiltradas)

  function formatFecha(fechaStr) {
    const fecha = new Date(fechaStr + 'T12:00:00')
    const hoy = new Date()
    const ayer = new Date(hoy)
    ayer.setDate(hoy.getDate() - 1)

    if (fechaStr === hoy.toISOString().split('T')[0]) return 'Hoy'
    if (fechaStr === ayer.toISOString().split('T')[0]) return 'Ayer'
    return fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  function formatHora(isoStr) {
    const d = new Date(isoStr)
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Bitácora</h1>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{total} entradas registradas</span>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(empty()); setModalOpen(true) }}>
          + Nueva entrada
        </button>
      </div>

      {/* Filtros y búsqueda */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 200 }}
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar en bitácora..."
        />
        <select className="input" style={{ width: 'auto' }} value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPagina(0) }}>
          <option value="all">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{TIPO_ICONS[t]} {t}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
        </div>
      ) : entradasFiltradas.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📚</div>
          <p>No hay entradas{busqueda || filtroTipo !== 'all' ? ' con estos filtros' : ''}</p>
        </div>
      ) : (
        <>
          {Object.entries(grupos).map(([fecha, items]) => (
            <div key={fecha} style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: 'var(--text-3)',
                textTransform: 'uppercase', letterSpacing: '0.5px',
                marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 10
              }}>
                {formatFecha(fecha)}
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4 }}>
                {items.map(entry => (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '10px 12px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'border-color 0.15s'
                  }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-2)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: entry.automatico ? 'rgba(0,212,255,0.1)' : 'rgba(99,102,241,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, flexShrink: 0
                    }}>
                      {TIPO_ICONS[entry.tipo] || '📝'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{entry.titulo}</span>
                        {entry.automatico && (
                          <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--border)', padding: '1px 6px', borderRadius: 10 }}>auto</span>
                        )}
                      </div>
                      {entry.descripcion && (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{entry.descripcion}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatHora(entry.created_at)}</span>
                      {!entry.automatico && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(entry.id)}>✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Paginación */}
          {totalPaginas > 1 && !busqueda && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 }}>
              <button className="btn btn-secondary btn-sm" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>← Anterior</button>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Página {pagina + 1} / {totalPaginas}</span>
              <button className="btn btn-secondary btn-sm" disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)}>Siguiente →</button>
            </div>
          )}
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva entrada en bitácora" size="md"
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
            <select className="input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
              {TIPOS.map(t => <option key={t} value={t}>{TIPO_ICONS[t]} {t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Título *</label>
            <input className="input" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="¿Qué ocurrió?" autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Descripción</label>
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Detalles adicionales..." style={{ minHeight: 100 }} />
          </div>
        </div>
      </Modal>
    </div>
  )
}

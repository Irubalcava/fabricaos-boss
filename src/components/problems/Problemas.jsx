import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { suggestCausas } from '../../lib/claude.js'

const ESTADOS = ['detectado', 'analizando', 'en_solucion', 'resuelto', 'descartado']
const IMPACTOS = ['bajo', 'medio', 'alto', 'critico']

const ESTADO_COLORS = {
  detectado: 'var(--danger)',
  analizando: 'var(--warning)',
  en_solucion: 'var(--accent)',
  resuelto: 'var(--success)',
  descartado: 'var(--text-3)'
}

const IMPACTO_COLORS = {
  bajo: 'var(--text-3)',
  medio: 'var(--warning)',
  alto: 'var(--danger)',
  critico: '#ff2d55'
}

function empty() {
  return { titulo: '', descripcion: '', impacto: 'medio', estado: 'detectado', causas: [], solucion: '', responsable: '' }
}

export default function Problemas() {
  const location = useLocation()
  const { workspace, miembro, miembros } = useStore()
  const [problemas, setProblemas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadingCausas, setLoadingCausas] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('all')
  const [expandido, setExpandido] = useState(null)

  useEffect(() => {
    if (workspace?.id) loadProblemas()
  }, [workspace])

  useEffect(() => {
    if (location.state?.openCreate) {
      setForm(empty())
      setEditId(null)
      setModalOpen(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  async function loadProblemas() {
    setLoading(true)
    const { data } = await supabase
      .from('bos_problemas')
      .select('*')
      .eq('fabrica_id', workspace.id)
      .order('created_at', { ascending: false })
    setProblemas(data || [])
    setLoading(false)
  }

  async function handleSuggestCausas() {
    if (!form.titulo.trim()) { toast.error('Primero escribe el título'); return }
    setLoadingCausas(true)
    try {
      const causas = await suggestCausas(form.titulo)
      setForm(p => ({ ...p, causas }))
    } catch (e) {
      toast.error('Error generando causas')
    } finally {
      setLoadingCausas(false)
    }
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('El título es requerido'); return }
    setSaving(true)
    try {
      const payload = {
        fabrica_id: workspace.id,
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        impacto: form.impacto,
        estado: form.estado,
        causas: form.causas.length ? form.causas : null,
        solucion: form.solucion.trim() || null,
        responsable: form.responsable || null,
        created_by: miembro?.profile_id
      }
      if (editId) {
        const { error } = await supabase.from('bos_problemas').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Problema actualizado')
      } else {
        const { error } = await supabase.from('bos_problemas').insert(payload)
        if (error) throw error
        toast.success('Problema registrado')
        await supabase.from('bos_bitacora').insert({
          fabrica_id: workspace.id,
          tipo: 'problema',
          titulo: `Problema detectado: ${form.titulo}`,
          automatico: true,
          created_by: miembro?.profile_id
        })
      }
      setModalOpen(false)
      loadProblemas()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este problema?')) return
    const { error } = await supabase.from('bos_problemas').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Eliminado')
    loadProblemas()
  }

  async function handleEstadoChange(id, estado) {
    const { error } = await supabase.from('bos_problemas').update({ estado }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setProblemas(prev => prev.map(p => p.id === id ? { ...p, estado } : p))
  }

  const problemasFiltrados = filtroEstado === 'all' ? problemas : problemas.filter(p => p.estado === filtroEstado)
  const abiertos = problemas.filter(p => !['resuelto', 'descartado'].includes(p.estado))

  if (loading) {
    return <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div className="spinner" /></div>
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Problemas</h1>
          {abiertos.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>{abiertos.length} abierto{abiertos.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(empty()); setEditId(null); setModalOpen(true) }}>
          + Reportar problema
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['all', ...ESTADOS].map(e => (
          <button key={e} className={`btn btn-sm ${filtroEstado === e ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFiltroEstado(e)}>
            {e === 'all' ? 'Todos' : e}
            {e !== 'all' && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                ({problemas.filter(p => p.estado === e).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {problemasFiltrados.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🔧</div>
          <p>No hay problemas{filtroEstado !== 'all' ? ' con este estado' : ''}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {problemasFiltrados.map(p => (
            <div key={p.id} className="card" style={{
              borderColor: ['detectado', 'analizando'].includes(p.estado) && p.impacto === 'critico' ? 'rgba(255,45,85,0.4)' : 'var(--border)',
              padding: '14px 18px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: ESTADO_COLORS[p.estado],
                      background: ESTADO_COLORS[p.estado] + '18',
                      padding: '2px 8px', borderRadius: 10
                    }}>{p.estado}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: IMPACTO_COLORS[p.impacto],
                      background: IMPACTO_COLORS[p.impacto] + '18',
                      padding: '2px 8px', borderRadius: 10
                    }}>{p.impacto}</span>
                    {p.responsable && (
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        → {miembros.find(m => m.profile_id === p.responsable)?.nombre || '?'}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4, cursor: 'pointer' }}
                    onClick={() => setExpandido(expandido === p.id ? null : p.id)}>
                    {p.titulo}
                  </div>

                  {expandido === p.id && (
                    <div style={{ marginTop: 10 }}>
                      {p.descripcion && <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>{p.descripcion}</p>}
                      {p.causas?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>CAUSAS RAÍZ</div>
                          {p.causas.map((c, i) => (
                            <div key={i} style={{ fontSize: 13, color: 'var(--text-2)', paddingLeft: 12, borderLeft: '2px solid var(--warning)', marginBottom: 4 }}>
                              {c}
                            </div>
                          ))}
                        </div>
                      )}
                      {p.solucion && (
                        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid var(--success)', borderRadius: 8, padding: 10 }}>
                          <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 4 }}>SOLUCIÓN</div>
                          <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{p.solucion}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <select
                    value={p.estado}
                    onChange={e => handleEstadoChange(p.id, e.target.value)}
                    style={{ fontSize: 11, background: 'var(--bg-input)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '3px 6px', color: ESTADO_COLORS[p.estado], cursor: 'pointer' }}
                  >
                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    setForm({ titulo: p.titulo, descripcion: p.descripcion || '', impacto: p.impacto, estado: p.estado, causas: p.causas || [], solucion: p.solucion || '', responsable: p.responsable || '' })
                    setEditId(p.id)
                    setModalOpen(true)
                  }}>✏</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(p.id)}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar problema' : 'Reportar problema'} size="md"
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
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="¿Cuándo ocurrió? ¿Qué impacto tiene?" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Impacto</label>
              <select className="input" value={form.impacto} onChange={e => setForm(p => ({ ...p, impacto: e.target.value }))}>
                {IMPACTOS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Estado</label>
              <select className="input" value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          {/* Causas con IA */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="label" style={{ marginBottom: 0 }}>Causas raíz</label>
              <button className="btn btn-ghost btn-sm" onClick={handleSuggestCausas} disabled={loadingCausas}>
                {loadingCausas ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✨ Sugerir con IA'}
              </button>
            </div>
            {form.causas.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input
                  className="input"
                  value={c}
                  onChange={e => setForm(p => ({ ...p, causas: p.causas.map((cc, ii) => ii === i ? e.target.value : cc) }))}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                  onClick={() => setForm(p => ({ ...p, causas: p.causas.filter((_, ii) => ii !== i) }))}>✕</button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => setForm(p => ({ ...p, causas: [...p.causas, ''] }))}>
              + Añadir causa
            </button>
          </div>

          <div className="form-group">
            <label className="label">Solución propuesta / implementada</label>
            <textarea className="input" value={form.solucion} onChange={e => setForm(p => ({ ...p, solucion: e.target.value }))} placeholder="¿Cómo se resolvió o se planea resolver?" />
          </div>
          <div className="form-group">
            <label className="label">Responsable</label>
            <select className="input" value={form.responsable} onChange={e => setForm(p => ({ ...p, responsable: e.target.value }))}>
              <option value="">Sin responsable</option>
              {miembros.map(m => <option key={m.profile_id} value={m.profile_id}>{m.nombre}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  )
}

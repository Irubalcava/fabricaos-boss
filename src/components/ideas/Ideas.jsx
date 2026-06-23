import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { suggestProblemaRelacionado } from '../../lib/claude.js'

const ESTADOS = ['pendiente', 'evaluando', 'aprobada', 'en_desarrollo', 'implementada', 'descartada']
const CATEGORIAS = ['proceso', 'producto', 'marketing', 'tecnologia', 'personas', 'finanzas', 'cliente', 'otro']

const ESTADO_COLORS = {
  pendiente: 'var(--text-3)',
  evaluando: 'var(--warning)',
  aprobada: 'var(--accent)',
  en_desarrollo: 'var(--accent-2)',
  implementada: 'var(--success)',
  descartada: 'var(--text-4)'
}

function empty() {
  return { titulo: '', descripcion: '', categoria: 'otro', estado: 'pendiente', impacto_estimado: '', esfuerzo_estimado: 'medio', problema_id: '' }
}

export default function Ideas() {
  const location = useLocation()
  const { workspace, miembro, miembros } = useStore()
  const [ideas, setIdeas] = useState([])
  const [problemas, setProblemas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [buscandoProblema, setBuscandoProblema] = useState(false)
  const [sugerenciaProblema, setSugerenciaProblema] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('all')
  const [filtroCategoria, setFiltroCategoria] = useState('all')

  useEffect(() => {
    if (workspace?.id) { loadIdeas(); loadProblemas() }
  }, [workspace])

  useEffect(() => {
    if (location.state?.openCreate) {
      setForm(empty())
      setEditId(null)
      setSugerenciaProblema(null)
      setModalOpen(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  async function loadIdeas() {
    setLoading(true)
    const { data } = await supabase
      .from('bos_ideas')
      .select('*')
      .eq('fabrica_id', workspace.id)
      .order('created_at', { ascending: false })
    setIdeas(data || [])
    setLoading(false)
  }

  async function loadProblemas() {
    const { data } = await supabase
      .from('bos_problemas')
      .select('id, titulo')
      .eq('fabrica_id', workspace.id)
      .not('estado', 'in', '("resuelto","descartado")')
    setProblemas(data || [])
  }

  async function handleBuscarProblema() {
    if (!form.titulo.trim()) return
    setBuscandoProblema(true)
    try {
      const problemId = await suggestProblemaRelacionado(form.titulo, form.descripcion, problemas)
      if (problemId) {
        setSugerenciaProblema(problemId)
        setForm(p => ({ ...p, problema_id: problemId }))
        toast.info('IA sugirió un problema relacionado')
      } else {
        setSugerenciaProblema(null)
        toast.info('IA: No se detectó problema relacionado')
      }
    } catch (e) {
      toast.error('Error consultando IA')
    } finally {
      setBuscandoProblema(false)
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
        categoria: form.categoria,
        estado: form.estado,
        impacto_estimado: form.impacto_estimado.trim() || null,
        esfuerzo_estimado: form.esfuerzo_estimado || null,
        problema_id: form.problema_id || null,
        created_by: miembro?.profile_id
      }
      if (editId) {
        const { error } = await supabase.from('bos_ideas').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Idea actualizada')
      } else {
        const { error } = await supabase.from('bos_ideas').insert(payload)
        if (error) throw error
        toast.success('Idea registrada')
        await supabase.from('bos_bitacora').insert({
          fabrica_id: workspace.id,
          tipo: 'idea',
          titulo: `Nueva idea: ${form.titulo}`,
          automatico: true,
          created_by: miembro?.profile_id
        })
      }
      setModalOpen(false)
      setSugerenciaProblema(null)
      loadIdeas()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta idea?')) return
    const { error } = await supabase.from('bos_ideas').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Idea eliminada')
    loadIdeas()
  }

  async function handleEstadoChange(id, estado) {
    const { error } = await supabase.from('bos_ideas').update({ estado }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, estado } : i))
  }

  async function handleVotar(id, tipo) {
    const field = tipo === 'up' ? 'votos_positivos' : 'votos_negativos'
    const idea = ideas.find(i => i.id === id)
    const nuevoValor = (idea?.[field] || 0) + 1
    const { error } = await supabase.from('bos_ideas').update({ [field]: nuevoValor }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, [field]: nuevoValor } : i))
  }

  const ESFUERZOS = ['bajo', 'medio', 'alto']
  const CATEGORIA_ICONS = {
    proceso: '⚙️', producto: '📦', marketing: '📣', tecnologia: '💻',
    personas: '👥', finanzas: '💰', cliente: '🤝', otro: '💡'
  }

  const ideasFiltradas = ideas.filter(i => {
    if (filtroEstado !== 'all' && i.estado !== filtroEstado) return false
    if (filtroCategoria !== 'all' && i.categoria !== filtroCategoria) return false
    return true
  })

  if (loading) {
    return <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div className="spinner" /></div>
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Ideas</h1>
        <button className="btn btn-primary" onClick={() => { setForm(empty()); setEditId(null); setSugerenciaProblema(null); setModalOpen(true) }}>
          + Nueva idea
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 'auto' }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="all">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
          <option value="all">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_ICONS[c]} {c}</option>)}
        </select>
      </div>

      {ideasFiltradas.length === 0 ? (
        <div className="empty-state">
          <div className="icon">💡</div>
          <p>No hay ideas</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {ideasFiltradas.map(idea => (
            <div key={idea.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>{CATEGORIA_ICONS[idea.categoria] || '💡'}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: ESTADO_COLORS[idea.estado],
                      background: ESTADO_COLORS[idea.estado] + '18',
                      padding: '2px 8px', borderRadius: 10
                    }}>{idea.estado}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{idea.titulo}</div>
                  {idea.descripcion && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{idea.descripcion}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    setForm({ titulo: idea.titulo, descripcion: idea.descripcion || '', categoria: idea.categoria, estado: idea.estado, impacto_estimado: idea.impacto_estimado || '', esfuerzo_estimado: idea.esfuerzo_estimado || 'medio', problema_id: idea.problema_id || '' })
                    setEditId(idea.id)
                    setModalOpen(true)
                  }}>✏</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(idea.id)}>✕</button>
                </div>
              </div>

              {idea.problema_id && (
                <div style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(0,212,255,0.08)', padding: '4px 8px', borderRadius: 6 }}>
                  🔧 {problemas.find(p => p.id === idea.problema_id)?.titulo || 'Problema relacionado'}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--success)' }}
                    onClick={() => handleVotar(idea.id, 'up')}>
                    👍 {idea.votos_positivos || 0}
                  </button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--danger)' }}
                    onClick={() => handleVotar(idea.id, 'down')}>
                    👎 {idea.votos_negativos || 0}
                  </button>
                </div>
                <select
                  value={idea.estado}
                  onChange={e => handleEstadoChange(idea.id, e.target.value)}
                  style={{ fontSize: 11, background: 'var(--bg-input)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '3px 6px', color: ESTADO_COLORS[idea.estado], cursor: 'pointer' }}
                >
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar idea' : 'Nueva idea'} size="md"
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
            <input className="input" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="¿Cuál es la idea?" autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Descripción</label>
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Detalla la idea..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Categoría</label>
              <select className="input" value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_ICONS[c]} {c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Estado</label>
              <select className="input" value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Impacto estimado</label>
              <input className="input" value={form.impacto_estimado} onChange={e => setForm(p => ({ ...p, impacto_estimado: e.target.value }))} placeholder="Ej: +20% en ventas" />
            </div>
            <div className="form-group">
              <label className="label">Esfuerzo</label>
              <select className="input" value={form.esfuerzo_estimado} onChange={e => setForm(p => ({ ...p, esfuerzo_estimado: e.target.value }))}>
                {ESFUERZOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label className="label" style={{ marginBottom: 0 }}>Problema relacionado</label>
              <button className="btn btn-ghost btn-sm" onClick={handleBuscarProblema} disabled={buscandoProblema}>
                {buscandoProblema ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✨ Buscar con IA'}
              </button>
            </div>
            <select className="input" value={form.problema_id} onChange={e => setForm(p => ({ ...p, problema_id: e.target.value }))}>
              <option value="">Sin problema relacionado</option>
              {problemas.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
            </select>
            {sugerenciaProblema && (
              <span style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, display: 'block' }}>
                ✨ IA sugirió problema relacionado
              </span>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

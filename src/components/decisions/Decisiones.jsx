import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { resumirDecision } from '../../lib/claude.js'

const ESTADOS = ['borrador', 'votacion', 'aprobada', 'rechazada', 'postergada']

const ESTADO_COLORS = {
  borrador: 'var(--text-3)',
  votacion: 'var(--warning)',
  aprobada: 'var(--success)',
  rechazada: 'var(--danger)',
  postergada: 'var(--accent-2)'
}

function empty() {
  return { titulo: '', problema: '', opciones: '', resultado: '', estado: 'borrador', fecha_limite: '' }
}

export default function Decisiones() {
  const location = useLocation()
  const { workspace, miembro, miembros } = useStore()
  const [decisiones, setDecisiones] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDetail, setModalDetail] = useState(null)
  const [votos, setVotos] = useState([])
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [miVoto, setMiVoto] = useState(null)
  const [comentarioVoto, setComentarioVoto] = useState('')
  const [resumenIA, setResumenIA] = useState('')
  const [resumiendo, setResumiendo] = useState(false)

  useEffect(() => {
    if (workspace?.id) loadDecisiones()
  }, [workspace])

  useEffect(() => {
    if (location.state?.openCreate) {
      setForm(empty())
      setEditId(null)
      setModalOpen(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  async function loadDecisiones() {
    setLoading(true)
    const { data } = await supabase
      .from('bos_decisiones')
      .select('*')
      .eq('fabrica_id', workspace.id)
      .order('created_at', { ascending: false })
    setDecisiones(data || [])
    setLoading(false)
  }

  async function openDetail(decision) {
    setModalDetail(decision)
    const { data } = await supabase
      .from('bos_votos_decision')
      .select('*')
      .eq('decision_id', decision.id)
    setVotos(data || [])
    const miV = data?.find(v => v.votante_id === miembro?.profile_id)
    setMiVoto(miV?.voto || null)
    setComentarioVoto(miV?.comentario || '')
    setResumenIA('')
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('El título es requerido'); return }
    setSaving(true)
    try {
      const payload = {
        fabrica_id: workspace.id,
        titulo: form.titulo.trim(),
        problema: form.problema.trim() || null,
        opciones: form.opciones.trim() || null,
        resultado: form.resultado.trim() || null,
        estado: form.estado,
        fecha_limite: form.fecha_limite || null,
        created_by: miembro?.profile_id
      }
      if (editId) {
        const { error } = await supabase.from('bos_decisiones').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Decisión actualizada')
      } else {
        const { error } = await supabase.from('bos_decisiones').insert(payload)
        if (error) throw error
        toast.success('Decisión creada')
        await supabase.from('bos_bitacora').insert({
          fabrica_id: workspace.id,
          tipo: 'decision',
          titulo: `Nueva decisión: ${form.titulo}`,
          automatico: true,
          created_by: miembro?.profile_id
        })
      }
      setModalOpen(false)
      loadDecisiones()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleVotar(voto) {
    if (!modalDetail) return
    const { error } = await supabase.from('bos_votos_decision').upsert({
      decision_id: modalDetail.id,
      fabrica_id: workspace.id,
      votante_id: miembro?.profile_id,
      voto,
      comentario: comentarioVoto.trim() || null
    }, { onConflict: 'decision_id,votante_id' })
    if (error) { toast.error(error.message); return }
    setMiVoto(voto)
    const { data } = await supabase.from('bos_votos_decision').select('*').eq('decision_id', modalDetail.id)
    setVotos(data || [])
    toast.success(`Voto registrado: ${voto}`)
  }

  async function handleResumenIA() {
    if (!modalDetail) return
    setResumiendo(true)
    try {
      const res = await resumirDecision(modalDetail, votos)
      setResumenIA(res)
    } catch (e) {
      toast.error('Error generando resumen')
    } finally {
      setResumiendo(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta decisión?')) return
    const { error } = await supabase.from('bos_decisiones').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Decisión eliminada')
    loadDecisiones()
  }

  const votosSi = votos.filter(v => v.voto === 'si').length
  const votosNo = votos.filter(v => v.voto === 'no').length
  const votosAbstencion = votos.filter(v => v.voto === 'abstencion').length

  if (loading) {
    return <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div className="spinner" /></div>
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Decisiones</h1>
        <button className="btn btn-primary" onClick={() => { setForm(empty()); setEditId(null); setModalOpen(true) }}>
          + Nueva decisión
        </button>
      </div>

      {decisiones.length === 0 ? (
        <div className="empty-state">
          <div className="icon">⚖️</div>
          <p>No hay decisiones registradas</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {decisiones.map(d => (
            <div key={d.id} className="card" style={{ padding: '14px 18px', cursor: 'pointer' }} onClick={() => openDetail(d)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: ESTADO_COLORS[d.estado],
                      background: ESTADO_COLORS[d.estado] + '18',
                      padding: '2px 8px', borderRadius: 10
                    }}>{d.estado}</span>
                    {d.fecha_limite && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Límite: {d.fecha_limite}</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{d.titulo}</div>
                  {d.problema && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{d.problema}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    setForm({ titulo: d.titulo, problema: d.problema || '', opciones: d.opciones || '', resultado: d.resultado || '', estado: d.estado, fecha_limite: d.fecha_limite || '' })
                    setEditId(d.id)
                    setModalOpen(true)
                  }}>✏</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(d.id)}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar decisión' : 'Nueva decisión'} size="md"
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
            <input className="input" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="¿Qué se decide?" autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Contexto / Problema</label>
            <textarea className="input" value={form.problema} onChange={e => setForm(p => ({ ...p, problema: e.target.value }))} placeholder="¿Por qué se necesita tomar esta decisión?" />
          </div>
          <div className="form-group">
            <label className="label">Opciones consideradas</label>
            <textarea className="input" value={form.opciones} onChange={e => setForm(p => ({ ...p, opciones: e.target.value }))} placeholder="Lista las opciones evaluadas..." />
          </div>
          <div className="form-group">
            <label className="label">Resultado elegido</label>
            <input className="input" value={form.resultado} onChange={e => setForm(p => ({ ...p, resultado: e.target.value }))} placeholder="¿Cuál fue la decisión final?" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Estado</label>
              <select className="input" value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Fecha límite votación</label>
              <input className="input" type="date" value={form.fecha_limite} onChange={e => setForm(p => ({ ...p, fecha_limite: e.target.value }))} />
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal detalle */}
      <Modal open={!!modalDetail} onClose={() => setModalDetail(null)} title={modalDetail?.titulo} size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {modalDetail?.problema && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>CONTEXTO</div>
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{modalDetail.problema}</p>
            </div>
          )}
          {modalDetail?.opciones && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>OPCIONES</div>
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{modalDetail.opciones}</p>
            </div>
          )}
          {modalDetail?.resultado && (
            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid var(--success)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 4 }}>RESULTADO</div>
              <p style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{modalDetail.resultado}</p>
            </div>
          )}
          <hr className="divider" />
          {/* Votación */}
          {modalDetail?.estado === 'votacion' && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Tu voto</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {['si', 'no', 'abstencion'].map(v => (
                  <button key={v} className={`btn ${miVoto === v ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    onClick={() => setMiVoto(v)}>
                    {v === 'si' ? '✓ A favor' : v === 'no' ? '✗ En contra' : '— Abstención'}
                  </button>
                ))}
              </div>
              <div className="form-group" style={{ marginBottom: 10 }}>
                <input className="input" value={comentarioVoto} onChange={e => setComentarioVoto(e.target.value)} placeholder="Comentario (opcional)" />
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => miVoto && handleVotar(miVoto)} disabled={!miVoto}>
                Registrar voto
              </button>
            </div>
          )}
          {/* Resultados votación */}
          {votos.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>VOTOS ({votos.length} total)</div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--success)' }}>{votosSi}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>A favor</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--danger)' }}>{votosNo}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>En contra</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-3)' }}>{votosAbstencion}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Abstención</div>
                </div>
              </div>
              {votos.filter(v => v.comentario).map(v => (
                <div key={v.id} style={{ marginTop: 8, fontSize: 12, color: 'var(--text-2)', paddingLeft: 10, borderLeft: `2px solid ${v.voto === 'si' ? 'var(--success)' : v.voto === 'no' ? 'var(--danger)' : 'var(--text-3)'}` }}>
                  {v.comentario}
                </div>
              ))}
            </div>
          )}
          <hr className="divider" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Resumen ejecutivo IA</span>
            <button className="btn btn-secondary btn-sm" onClick={handleResumenIA} disabled={resumiendo}>
              {resumiendo ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✨ Generar'}
            </button>
          </div>
          {resumenIA && (
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, background: 'var(--bg-input)', padding: 12, borderRadius: 8 }}>
              {resumenIA}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}

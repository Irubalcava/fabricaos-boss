import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { generateSummary } from '../../lib/claude.js'

const TIPOS = ['semanal', 'mensual', 'extraordinaria', 'one_on_one', 'estratégica', 'otro']
const ESTADOS = ['programada', 'en_curso', 'realizada', 'cancelada']
const ESTADO_COLORS = {
  programada: 'var(--accent)', en_curso: '#f59e0b',
  realizada: 'var(--success)', cancelada: 'var(--text-3)'
}
const ESTADO_LABELS = { programada: 'Programada', en_curso: 'En curso', realizada: 'Realizada', cancelada: 'Cancelada' }

function empty() {
  return {
    titulo: '', tipo: 'semanal',
    fecha: new Date().toISOString().split('T')[0],
    hora_inicio: '09:00', hora_fin: '10:00',
    descripcion: '', estado: 'programada',
    invitados: [], sucursal: ''
  }
}

// ─── Timer ────────────────────────────────────────────────
function Timer({ running }) {
  const [secs, setSecs] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSecs(s => s + 1), 1000)
    } else {
      clearInterval(ref.current); setSecs(0)
    }
    return () => clearInterval(ref.current)
  }, [running])
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const fmt = n => String(n).padStart(2, '0')
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2 }}>
      {h > 0 && `${fmt(h)}:`}{fmt(m)}:{fmt(s)}
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16, gap: 2, flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{ background: 'none', border: 'none', padding: '7px 14px', fontSize: 12, fontWeight: active === t.id ? 700 : 400, color: active === t.id ? 'var(--accent)' : 'var(--text-3)', borderBottom: `2px solid ${active === t.id ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer', marginBottom: -1, transition: 'all 0.12s' }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── Panel de detalle ─────────────────────────────────────
function ReuniónDetalle({ reunion, miembros, workspace, miembro, onReload, onEdit }) {
  const [tab, setTab] = useState('agenda')
  const [acuerdos, setAcuerdos] = useState([])
  const [acuerdoNuevo, setAcuerdoNuevo] = useState('')
  const [notaRapida, setNotaRapida] = useState('')
  const [estado, setEstado] = useState(reunion.estado)
  const [agenda, setAgenda] = useState(reunion.descripcion || '')
  const [savingAgenda, setSavingAgenda] = useState(false)
  const [generandoAgenda, setGenerandoAgenda] = useState(false)
  const [resumenIA, setResumenIA] = useState(reunion.resumen_ia || '')
  const [generandoResumen, setGenerandoResumen] = useState(false)
  const [tareasPostReunion, setTareasPostReunion] = useState([])
  const [creandoTareas, setCreandoTareas] = useState(false)
  const [addingAcuerdo, setAddingAcuerdo] = useState(false)
  const enCurso = estado === 'en_curso'

  const TABS = [
    { id: 'agenda',   label: `📋 Agenda` },
    { id: 'acuerdos', label: `✅ Acuerdos${acuerdos.length > 0 ? ` (${acuerdos.length})` : ''}` },
    { id: 'resumen',  label: '🤖 Resumen IA' },
  ]

  useEffect(() => {
    loadAcuerdos()
  }, [])

  async function loadAcuerdos() {
    const { data } = await supabase.from('bos_acuerdos_reunion').select('*').eq('reunion_id', reunion.id).order('created_at')
    setAcuerdos(data || [])
  }

  async function handleEstadoChange(nuevoEstado) {
    const { error } = await supabase.from('bos_reuniones').update({ estado: nuevoEstado }).eq('id', reunion.id)
    if (error) { toast.error(error.message); return }
    setEstado(nuevoEstado)
    onReload()
    if (nuevoEstado === 'en_curso') { setTab('agenda'); toast.success('Reunión iniciada ▶') }
    if (nuevoEstado === 'realizada') { setTab('resumen'); toast.success('Reunión finalizada ✓') }
  }

  async function handleSaveAgenda() {
    setSavingAgenda(true)
    const { error } = await supabase.from('bos_reuniones').update({ descripcion: agenda }).eq('id', reunion.id)
    if (error) { toast.error(error.message) } else { toast.success('Agenda guardada') }
    setSavingAgenda(false)
    onReload()
  }

  async function handleGenerarAgenda() {
    setGenerandoAgenda(true)
    try {
      // Cargar contexto: tareas pendientes, problemas abiertos, objetivos activos
      const [tareasRes, problemasRes, objetivosRes] = await Promise.all([
        supabase.from('bos_tareas').select('titulo,prioridad,asignado_a').eq('fabrica_id', workspace.id).not('estado', 'in', '("hecha","cancelada")').order('created_at', { ascending: false }).limit(8),
        supabase.from('bos_problemas').select('titulo,prioridad').eq('fabrica_id', workspace.id).not('estado', 'in', '("resuelto","descartado")').limit(4),
        supabase.from('bos_objetivos').select('titulo,area').eq('fabrica_id', workspace.id).eq('estado', 'activo').limit(4)
      ])

      const invNames = (reunion.invitados || []).map(id => {
        const m = miembros.find(x => x.profile_id === id)
        return m?.profiles?.nombre || m?.nombre || id
      }).join(', ')

      const prompt = `Genera una agenda ejecutiva para la siguiente reunión de negocios. Responde SOLO con los puntos de agenda numerados, sin introducción ni cierre.

Reunión: "${reunion.titulo}"
Tipo: ${reunion.tipo}
Fecha: ${reunion.fecha} ${reunion.hora_inicio ? `a las ${reunion.hora_inicio}` : ''}
${reunion.hora_fin ? `Duración estimada: hasta ${reunion.hora_fin}` : ''}
Participantes: ${invNames || 'Equipo general'}

Contexto del negocio:
Tareas pendientes: ${(tareasRes.data || []).map(t => `"${t.titulo}" (${t.prioridad})`).join(', ') || 'Ninguna'}
Problemas abiertos: ${(problemasRes.data || []).map(p => `"${p.titulo}"`).join(', ') || 'Ninguno'}
Objetivos activos: ${(objetivosRes.data || []).map(o => `"${o.titulo}"${o.area ? ` (${o.area})` : ''}`).join(', ') || 'Ninguno'}

Genera 4-6 puntos de agenda concretos y relevantes, con duración estimada en minutos. Formato:
1. [Punto] — X min`

      const res = await generateSummary(prompt, 512)
      setAgenda(res)
    } catch (e) {
      toast.error('Error generando agenda')
    } finally {
      setGenerandoAgenda(false)
    }
  }

  async function handleAddAcuerdo(texto) {
    const t = (texto || acuerdoNuevo).trim()
    if (!t) return
    setAddingAcuerdo(true)
    try {
      const { data, error } = await supabase.from('bos_acuerdos_reunion').insert({
        reunion_id: reunion.id, fabrica_id: workspace.id,
        descripcion: t, created_by: miembro?.profile_id
      }).select().single()
      if (error) throw error
      setAcuerdos(prev => [...prev, data])
      if (texto) setNotaRapida('')
      else setAcuerdoNuevo('')
      toast.success('Acuerdo registrado')
    } catch (err) { toast.error(err.message) }
    finally { setAddingAcuerdo(false) }
  }

  async function handleDeleteAcuerdo(id) {
    await supabase.from('bos_acuerdos_reunion').delete().eq('id', id)
    setAcuerdos(prev => prev.filter(a => a.id !== id))
  }

  async function handleGenerarResumen() {
    setGenerandoResumen(true)
    setTareasPostReunion([])
    try {
      const acuerdosTexto = acuerdos.map((a, i) => `${i + 1}. ${a.descripcion}`).join('\n')
      const invNames = (reunion.invitados || []).map(id => {
        const m = miembros.find(x => x.profile_id === id)
        return m?.profiles?.nombre || m?.nombre || id
      }).join(', ')

      const prompt = `Eres el asistente de Business OS. Analiza esta reunión y genera un resumen ejecutivo + próximos pasos en JSON.

Reunión: "${reunion.titulo}" (${reunion.tipo})
Fecha: ${reunion.fecha}
Participantes: ${invNames || 'Equipo'}
Agenda tratada: ${agenda || 'No especificada'}
Acuerdos tomados:
${acuerdosTexto || 'Sin acuerdos registrados'}

Responde EXACTAMENTE con este JSON (sin markdown, sin texto extra):
{
  "resumen": "3 oraciones ejecutivas resumiendo la reunión y sus resultados",
  "logros": ["logro 1", "logro 2"],
  "proximos_pasos": [
    {"titulo": "tarea concreta", "prioridad": "alta|media|baja", "dias": 7}
  ]
}`

      const raw = await generateSummary(prompt, 800)

      // Intentar parsear JSON
      let parsed = null
      try {
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) parsed = JSON.parse(match[0])
      } catch { /* Si falla, usar texto directo */ }

      if (parsed) {
        const texto = `${parsed.resumen}\n\n${parsed.logros?.length ? '✓ ' + parsed.logros.join('\n✓ ') : ''}`
        setResumenIA(texto)
        setTareasPostReunion(parsed.proximos_pasos || [])
        // Guardar resumen en DB
        await supabase.from('bos_reuniones').update({ resumen_ia: texto }).eq('id', reunion.id)
      } else {
        setResumenIA(raw)
        await supabase.from('bos_reuniones').update({ resumen_ia: raw }).eq('id', reunion.id)
      }
    } catch (e) {
      toast.error('Error generando resumen')
    } finally {
      setGenerandoResumen(false)
    }
  }

  async function handleCrearTareasPost() {
    if (!tareasPostReunion.length) return
    setCreandoTareas(true)
    try {
      const payload = tareasPostReunion.map(t => {
        const fechaLimite = new Date()
        fechaLimite.setDate(fechaLimite.getDate() + (t.dias || 7))
        return {
          fabrica_id: workspace.id, titulo: t.titulo,
          descripcion: `Acordado en reunión: ${reunion.titulo}`,
          estado: 'pendiente', prioridad: t.prioridad || 'media',
          fecha_limite: fechaLimite.toISOString().split('T')[0],
          created_by: miembro?.profile_id
        }
      })
      const { error } = await supabase.from('bos_tareas').insert(payload)
      if (error) throw error
      toast.success(`${payload.length} tareas creadas ✓`)
      setTareasPostReunion([])
    } catch (err) { toast.error(err.message) }
    finally { setCreandoTareas(false) }
  }

  const getNombre = (id) => {
    const m = miembros.find(x => x.profile_id === id)
    return m?.profiles?.nombre || m?.nombre || id
  }

  return (
    <div>
      {/* Header mini */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {reunion.hora_inicio && (
            <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>
              {reunion.hora_inicio}{reunion.hora_fin ? ` → ${reunion.hora_fin}` : ''}
            </span>
          )}
          {reunion.sucursal && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>📍 {reunion.sucursal}</span>}
          {reunion.invitados?.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {reunion.invitados.slice(0, 4).map(id => (
                <span key={id} style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent)15', padding: '1px 7px', borderRadius: 10 }}>
                  {getNombre(id).split(' ')[0]}
                </span>
              ))}
              {reunion.invitados.length > 4 && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>+{reunion.invitados.length - 4}</span>}
            </div>
          )}
        </div>

        {/* Controles de estado */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {estado === 'programada' && (
            <button className="btn btn-primary btn-sm" onClick={() => handleEstadoChange('en_curso')}>▶ Iniciar</button>
          )}
          {estado === 'en_curso' && (
            <button className="btn btn-sm" style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => handleEstadoChange('realizada')}>
              ■ Finalizar
            </button>
          )}
          <select value={estado} onChange={e => handleEstadoChange(e.target.value)}
            style={{ background: ESTADO_COLORS[estado] + '18', border: `1px solid ${ESTADO_COLORS[estado]}40`, borderRadius: 6, color: ESTADO_COLORS[estado], fontSize: 11, fontWeight: 700, padding: '3px 8px', cursor: 'pointer' }}>
            {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
          </select>
        </div>
      </div>

      {/* Timer cuando en curso */}
      {enCurso && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, marginBottom: 14 }}>
          <Timer running={enCurso} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>Reunión en curso</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Registra acuerdos en la tab de Acuerdos</div>
          </div>
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* ── TAB: AGENDA ── */}
      {tab === 'agenda' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {enCurso ? '📋 Agenda de la reunión' : 'Define los puntos a tratar'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={handleGenerarAgenda} disabled={generandoAgenda}>
                {generandoAgenda ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✨ IA: Generar agenda'}
              </button>
              {agenda !== (reunion.descripcion || '') && (
                <button className="btn btn-primary btn-sm" onClick={handleSaveAgenda} disabled={savingAgenda}>
                  {savingAgenda ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : 'Guardar'}
                </button>
              )}
            </div>
          </div>
          <textarea
            className="input"
            value={agenda}
            onChange={e => setAgenda(e.target.value)}
            rows={enCurso ? 8 : 6}
            placeholder="1. Revisión de ventas — 10 min&#10;2. Problemas pendientes — 15 min&#10;3. Próximos pasos — 10 min"
            style={{ fontSize: 13, lineHeight: 1.7, resize: 'vertical', fontFamily: 'inherit' }}
          />
          {enCurso && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Nota rápida</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" value={notaRapida} onChange={e => setNotaRapida(e.target.value)}
                  placeholder="Registra un punto, acuerdo o decisión..."
                  onKeyDown={e => e.key === 'Enter' && notaRapida.trim() && handleAddAcuerdo(notaRapida)}
                  style={{ flex: 1, fontSize: 13 }} />
                <button className="btn btn-primary btn-sm" onClick={() => handleAddAcuerdo(notaRapida)} disabled={!notaRapida.trim() || addingAcuerdo}>
                  {addingAcuerdo ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '+ Acuerdo'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: ACUERDOS ── */}
      {tab === 'acuerdos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {acuerdos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-3)', fontSize: 13 }}>
              Sin acuerdos registrados todavía
            </div>
          ) : (
            acuerdos.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <span style={{ color: 'var(--success)', fontSize: 14, flexShrink: 0, paddingTop: 1 }}>✓</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', lineHeight: 1.4 }}>{a.descripcion}</span>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', flexShrink: 0 }} onClick={() => handleDeleteAcuerdo(a.id)}>✕</button>
              </div>
            ))
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input className="input" value={acuerdoNuevo} onChange={e => setAcuerdoNuevo(e.target.value)}
              placeholder="Nuevo acuerdo o compromiso..."
              onKeyDown={e => e.key === 'Enter' && handleAddAcuerdo()}
              style={{ flex: 1, fontSize: 13 }} />
            <button className="btn btn-primary btn-sm" onClick={() => handleAddAcuerdo()} disabled={!acuerdoNuevo.trim() || addingAcuerdo}>
              {addingAcuerdo ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '+ Añadir'}
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: RESUMEN IA ── */}
      {tab === 'resumen' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {estado === 'realizada' ? 'Resumen post-reunión' : 'Disponible al finalizar la reunión'}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleGenerarResumen} disabled={generandoResumen}>
              {generandoResumen ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✨ Generar resumen'}
            </button>
          </div>

          {generandoResumen && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 2, margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13 }}>Analizando reunión y acuerdos...</div>
            </div>
          )}

          {resumenIA && !generandoResumen && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', padding: '12px 14px', borderRadius: 8, lineHeight: 1.75, whiteSpace: 'pre-line' }}>
                {resumenIA}
              </div>
            </div>
          )}

          {tareasPostReunion.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                  Próximos pasos sugeridos ({tareasPostReunion.length})
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleCrearTareasPost} disabled={creandoTareas}>
                  {creandoTareas ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : `Crear ${tareasPostReunion.length} tareas`}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tareasPostReunion.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    background: 'var(--bg-input)', border: '1px solid var(--border-2)', borderRadius: 7
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: t.prioridad === 'alta' ? 'var(--danger)' : t.prioridad === 'media' ? '#f59e0b' : 'var(--text-3)', textTransform: 'uppercase', flexShrink: 0, minWidth: 36 }}>{t.prioridad}</span>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{t.titulo}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>{t.dias}d</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!resumenIA && !generandoResumen && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
              <div style={{ fontSize: 13 }}>Genera el resumen para obtener próximos pasos automáticos</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────
export default function Reuniones() {
  const { workspace, miembro, miembros } = useStore()
  const [reuniones, setReuniones] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [filtro, setFiltro] = useState('proximas')  // hoy | proximas | pasadas | todas

  useEffect(() => { if (workspace?.id) loadReuniones() }, [workspace])

  async function loadReuniones() {
    setLoading(true)
    const { data } = await supabase.from('bos_reuniones').select('*').eq('fabrica_id', workspace.id).order('fecha', { ascending: false }).order('hora_inicio', { ascending: false })
    setReuniones(data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('El título es requerido'); return }
    setSaving(true)
    try {
      const payload = {
        fabrica_id: workspace.id, titulo: form.titulo.trim(), tipo: form.tipo,
        fecha: form.fecha, hora_inicio: form.hora_inicio || null, hora_fin: form.hora_fin || null,
        descripcion: form.descripcion.trim() || null, estado: form.estado,
        invitados: form.invitados.length ? form.invitados : null,
        sucursal: form.sucursal.trim() || null, created_by: miembro?.profile_id
      }
      if (editId) {
        const { error } = await supabase.from('bos_reuniones').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Reunión actualizada')
      } else {
        const { error } = await supabase.from('bos_reuniones').insert(payload)
        if (error) throw error
        toast.success('Reunión creada')
        await supabase.from('bos_bitacora').insert({ fabrica_id: workspace.id, tipo: 'reunion', titulo: `Nueva reunión: ${form.titulo}`, automatico: true, created_by: miembro?.profile_id })
      }
      setModalOpen(false); loadReuniones()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta reunión?')) return
    await supabase.from('bos_reuniones').delete().eq('id', id)
    toast.success('Reunión eliminada'); loadReuniones()
    if (expandedId === id) setExpandedId(null)
  }

  const today = new Date().toISOString().split('T')[0]
  const reunionesFiltradas = (() => {
    switch (filtro) {
      case 'hoy':      return reuniones.filter(r => r.fecha === today)
      case 'proximas': return reuniones.filter(r => r.fecha >= today).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio || '').localeCompare(b.hora_inicio || ''))
      case 'pasadas':  return reuniones.filter(r => r.fecha < today)
      default:         return reuniones
    }
  })()

  const cHoy = reuniones.filter(r => r.fecha === today).length
  const cEnCurso = reuniones.filter(r => r.estado === 'en_curso').length

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
    </div>
  )

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Reuniones</h1>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {cHoy > 0 && `${cHoy} hoy · `}{cEnCurso > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}>🔴 {cEnCurso} en curso · </span>}{reuniones.length} total
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(empty()); setEditId(null); setModalOpen(true) }}>
          + Nueva reunión
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { id: 'proximas', label: `Próximas (${reuniones.filter(r => r.fecha >= today).length})` },
          { id: 'hoy',      label: `Hoy (${cHoy})`, color: cHoy > 0 ? 'var(--accent)' : undefined },
          { id: 'pasadas',  label: `Pasadas (${reuniones.filter(r => r.fecha < today).length})` },
          { id: 'todas',    label: `Todas (${reuniones.length})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            style={{
              padding: '4px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              fontWeight: filtro === f.id ? 700 : 500,
              border: `1px solid ${filtro === f.id ? (f.color || 'var(--accent)') : 'var(--border-2)'}`,
              background: filtro === f.id ? (f.color || 'var(--accent)') + '18' : 'var(--bg-input)',
              color: filtro === f.id ? (f.color || 'var(--accent)') : 'var(--text-3)'
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {reunionesFiltradas.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🤝</div>
          <p>No hay reuniones{filtro !== 'todas' ? ' en esta vista' : ''}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reunionesFiltradas.map(r => {
            const isExpanded = expandedId === r.id
            const esHoy = r.fecha === today

            return (
              <div key={r.id}>
                <div className="card" style={{
                  padding: '12px 16px', cursor: 'pointer',
                  borderLeft: `4px solid ${ESTADO_COLORS[r.estado] || 'var(--border)'}`,
                  borderColor: isExpanded ? ESTADO_COLORS[r.estado] + '50' : 'var(--border)',
                  background: r.estado === 'en_curso' ? 'rgba(245,158,11,0.04)' : 'var(--bg-card)',
                  transition: 'all 0.15s'
                }} onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Fecha vertical */}
                    <div style={{ textAlign: 'center', flexShrink: 0, width: 40 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: esHoy ? 'var(--accent)' : 'var(--text-1)', lineHeight: 1 }}>
                        {r.fecha.split('-')[2]}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-MX', { month: 'short' })}
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: ESTADO_COLORS[r.estado], textTransform: 'uppercase' }}>
                          {r.estado === 'en_curso' ? '🔴 En curso' : ESTADO_LABELS[r.estado]}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 6 }}>{r.tipo}</span>
                        {r.hora_inicio && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.hora_inicio}{r.hora_fin ? `–${r.hora_fin}` : ''}</span>}
                        {esHoy && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent)15', padding: '1px 6px', borderRadius: 6 }}>HOY</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }} className="truncate">{r.titulo}</div>
                      {(r.sucursal || r.invitados?.length > 0) && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                          {r.sucursal && `📍 ${r.sucursal}`}
                          {r.invitados?.length > 0 && ` · ${r.invitados.length} invitado${r.invitados.length > 1 ? 's' : ''}`}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" title="Editar"
                        onClick={e => { e.stopPropagation(); setForm({ titulo: r.titulo, tipo: r.tipo, fecha: r.fecha, hora_inicio: r.hora_inicio || '', hora_fin: r.hora_fin || '', descripcion: r.descripcion || '', estado: r.estado, invitados: r.invitados || [], sucursal: r.sucursal || '' }); setEditId(r.id); setModalOpen(true) }}>✏</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                        onClick={e => { e.stopPropagation(); handleDelete(r.id) }}>✕</button>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', paddingTop: 4 }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ background: 'var(--bg-card)', border: `1px solid ${ESTADO_COLORS[r.estado] || 'var(--accent)'}30`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '16px 18px', marginTop: -1 }}>
                    <ReuniónDetalle
                      reunion={r}
                      miembros={miembros}
                      workspace={workspace}
                      miembro={miembro}
                      onReload={loadReuniones}
                      onEdit={() => { setForm({ titulo: r.titulo, tipo: r.tipo, fecha: r.fecha, hora_inicio: r.hora_inicio || '', hora_fin: r.hora_fin || '', descripcion: r.descripcion || '', estado: r.estado, invitados: r.invitados || [], sucursal: r.sucursal || '' }); setEditId(r.id); setModalOpen(true) }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar reunión' : 'Nueva reunión'} size="md"
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
            <input className="input" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Ej: Revisión semanal de ventas" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Tipo</label>
              <select className="input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Estado</label>
              <select className="input" value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
                {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Fecha</label>
              <input className="input" type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Hora inicio</label>
              <input className="input" type="time" value={form.hora_inicio} onChange={e => setForm(p => ({ ...p, hora_inicio: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Hora fin</label>
              <input className="input" type="time" value={form.hora_fin} onChange={e => setForm(p => ({ ...p, hora_fin: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Agenda / Descripción</label>
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="¿Qué se tratará?" rows={3} />
          </div>
          <div className="form-group">
            <label className="label">Sucursal / Lugar</label>
            <input className="input" value={form.sucursal} onChange={e => setForm(p => ({ ...p, sucursal: e.target.value }))} placeholder="Sala de juntas, Zoom, Planta..." />
          </div>
          <div className="form-group">
            <label className="label">Invitados</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(miembros || []).map(m => {
                const id = m.profile_id
                const nombre = m.profiles?.nombre || m.nombre || id
                const sel = form.invitados.includes(id)
                return (
                  <button key={id} type="button"
                    onClick={() => setForm(p => ({ ...p, invitados: sel ? p.invitados.filter(x => x !== id) : [...p.invitados, id] }))}
                    style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: `1px solid ${sel ? 'var(--accent)' : 'var(--border-2)'}`, background: sel ? 'var(--accent)22' : 'var(--bg-input)', color: sel ? 'var(--accent)' : 'var(--text-2)', fontWeight: sel ? 600 : 400 }}>
                    {nombre}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

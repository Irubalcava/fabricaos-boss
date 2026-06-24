import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import { toast } from '../ui/Toast.jsx'
import Modal from '../ui/Modal.jsx'
import { suggestProblemaRelacionado } from '../../lib/claude.js'

const ESTADOS = ['pendiente', 'evaluando', 'aprobada', 'en_desarrollo', 'implementada', 'descartada']
const CATEGORIAS = ['proceso', 'producto', 'marketing', 'tecnologia', 'personas', 'finanzas', 'cliente', 'otro']
const ESFUERZOS = ['bajo', 'medio', 'alto']
const IMPACTOS_NIVEL = ['bajo', 'medio', 'alto', 'critico']

const ESTADO_COLORS = {
  pendiente: 'var(--text-3)', evaluando: '#f59e0b',
  aprobada: 'var(--accent)', en_desarrollo: '#8b5cf6',
  implementada: '#10b981', descartada: 'var(--text-4)'
}
const ESTADO_LABELS = {
  pendiente: 'Pendiente', evaluando: 'Evaluando', aprobada: 'Aprobada',
  en_desarrollo: 'En desarrollo', implementada: 'Implementada', descartada: 'Descartada'
}
const IMPACTO_COLORS = { bajo: 'var(--text-3)', medio: '#f59e0b', alto: '#ef4444', critico: '#ff2d55' }
const ESFUERZO_COLORS = { bajo: '#10b981', medio: '#f59e0b', alto: '#ef4444' }
const CATEGORIA_ICONS = {
  proceso: '⚙️', producto: '📦', marketing: '📣', tecnologia: '💻',
  personas: '👥', finanzas: '💰', cliente: '🤝', otro: '💡'
}

// Quadrant matrix
const QUADRANT = {
  'alto-bajo':   { label: 'Ganar fácil',   color: '#10b981', bg: 'rgba(16,185,129,0.06)' },
  'critico-bajo': { label: 'Ganar fácil',  color: '#10b981', bg: 'rgba(16,185,129,0.06)' },
  'alto-medio':  { label: 'Apostar',        color: 'var(--accent)', bg: 'var(--accent)08' },
  'critico-medio':{ label: 'Apostar',       color: 'var(--accent)', bg: 'var(--accent)08' },
  'alto-alto':   { label: 'Proyecto mayor', color: '#8b5cf6', bg: 'rgba(139,92,246,0.06)' },
  'critico-alto':{ label: 'Proyecto mayor', color: '#8b5cf6', bg: 'rgba(139,92,246,0.06)' },
  'medio-bajo':  { label: 'Rápido',         color: '#f59e0b', bg: 'rgba(245,158,11,0.06)' },
  'medio-medio': { label: 'Normal',         color: 'var(--text-3)', bg: 'var(--bg-input)' },
  'medio-alto':  { label: 'Cuestionable',   color: '#ef4444', bg: 'rgba(239,68,68,0.04)' },
  'bajo-bajo':   { label: 'Relleno',        color: 'var(--text-3)', bg: 'var(--bg-input)' },
  'bajo-medio':  { label: 'Relleno',        color: 'var(--text-3)', bg: 'var(--bg-input)' },
  'bajo-alto':   { label: 'Evitar',         color: '#ef4444', bg: 'rgba(239,68,68,0.04)' },
}

function getQuadrant(impacto, esfuerzo) {
  const key = `${impacto}-${esfuerzo}`
  return QUADRANT[key] || { label: '', color: 'var(--text-3)', bg: 'var(--bg-input)' }
}

function prioridadScore(idea) {
  const imp = { bajo: 1, medio: 2, alto: 3, critico: 4 }[idea.impacto_nivel || 'medio'] || 2
  const esf = { bajo: 3, medio: 2, alto: 1 }[idea.esfuerzo_estimado || 'medio'] || 2
  const votos = (idea.votos_positivos || 0) - (idea.votos_negativos || 0)
  return (imp * esf) + votos
}

function empty() {
  return {
    titulo: '', descripcion: '', categoria: 'otro', estado: 'pendiente',
    impacto_estimado: '', impacto_nivel: 'medio', esfuerzo_estimado: 'medio',
    problema_id: '', responsable: ''
  }
}

// ─── Tabs ─────────────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 14, gap: 2 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{ background: 'none', border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: active === t.id ? 700 : 400, color: active === t.id ? 'var(--accent)' : 'var(--text-3)', borderBottom: `2px solid ${active === t.id ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer', marginBottom: -1, transition: 'all 0.12s' }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── Panel de detalle ─────────────────────────────────────
function IdeaDetalle({ idea, problemas, objetivos, workspace, miembro, onReload, onEdit }) {
  const [tab, setTab] = useState(idea.objetivo_id ? 'vinculo' : 'convertir')
  const [convirtiendo, setConvirtiendo] = useState(null)

  const problema = problemas.find(p => p.id === idea.problema_id)
  const objetivo = objetivos.find(o => o.id === idea.objetivo_id)
  const q = getQuadrant(idea.impacto_nivel || 'medio', idea.esfuerzo_estimado || 'medio')

  async function convertirAObjetivo() {
    setConvirtiendo('objetivo')
    try {
      const { data: obj, error } = await supabase.from('bos_objetivos').insert({
        fabrica_id: workspace.id, titulo: idea.titulo, descripcion: idea.descripcion || null,
        estado: 'activo', tipo: 'lanzar', created_by: miembro?.profile_id
      }).select().single()
      if (error) throw error
      await supabase.from('bos_ideas').update({ objetivo_id: obj.id, estado: 'en_desarrollo' }).eq('id', idea.id)
      await supabase.from('bos_bitacora').insert({ fabrica_id: workspace.id, tipo: 'objetivo', titulo: `Objetivo creado desde idea: ${idea.titulo}`, automatico: true, created_by: miembro?.profile_id })
      toast.success('✓ Idea convertida a objetivo — ve a Objetivos para generar el plan')
      onReload()
    } catch (err) { toast.error(err.message) }
    finally { setConvirtiendo(null) }
  }

  async function convertirATarea() {
    setConvirtiendo('tarea')
    try {
      await supabase.from('bos_tareas').insert({
        fabrica_id: workspace.id, titulo: idea.titulo,
        descripcion: idea.descripcion || `Idea: ${idea.titulo}`,
        estado: 'pendiente', prioridad: ['alto', 'critico'].includes(idea.impacto_nivel) ? 'alta' : 'media',
        created_by: miembro?.profile_id
      })
      await supabase.from('bos_ideas').update({ estado: 'en_desarrollo' }).eq('id', idea.id)
      toast.success('✓ Tarea creada desde idea')
      onReload()
    } catch (err) { toast.error(err.message) }
    finally { setConvirtiendo(null) }
  }

  async function convertirAProblema() {
    setConvirtiendo('problema')
    try {
      await supabase.from('bos_problemas').insert({
        fabrica_id: workspace.id, titulo: idea.titulo,
        descripcion: idea.descripcion || null,
        impacto: ['alto', 'critico'].includes(idea.impacto_nivel) ? idea.impacto_nivel : 'medio',
        estado: 'detectado', created_by: miembro?.profile_id
      })
      toast.success('✓ Problema registrado desde idea')
      onReload()
    } catch (err) { toast.error(err.message) }
    finally { setConvirtiendo(null) }
  }

  async function vincularObjetivo(objId) {
    const { error } = await supabase.from('bos_ideas').update({ objetivo_id: objId || null, estado: objId ? 'en_desarrollo' : idea.estado }).eq('id', idea.id)
    if (error) { toast.error(error.message); return }
    toast.success(objId ? 'Idea vinculada al objetivo' : 'Vínculo eliminado')
    onReload()
  }

  return (
    <div>
      {/* Quadrant badge */}
      {q.label && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: q.bg, border: `1px solid ${q.color}30`, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: q.color }}>{q.label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>impacto {idea.impacto_nivel || '—'} · esfuerzo {idea.esfuerzo_estimado || '—'}</span>
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'convertir', label: '🔀 Convertir' },
          { id: 'detalle',   label: '📝 Detalle' },
          { id: 'vinculo',   label: objetivo ? '🎯 Vinculada ✓' : '🎯 Vincular objetivo' },
        ]}
        active={tab} onChange={setTab}
      />

      {/* ── TAB: CONVERTIR ── */}
      {tab === 'convertir' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
            Convierte esta idea en una acción concreta:
          </div>

          {/* → Objetivo */}
          {idea.objetivo_id ? (
            <div style={{ padding: '14px 16px', background: 'rgba(0,212,255,0.06)', border: '1px solid var(--accent)30', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>🎯 Objetivo creado</div>
              <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{objetivo?.titulo || 'Objetivo vinculado'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Ve a Objetivos para configurar el plan y tareas</div>
            </div>
          ) : (
            <button onClick={convertirAObjetivo} disabled={!!convirtiendo}
              style={{ padding: '14px 16px', background: 'var(--accent)10', border: '2px solid var(--accent)40', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', opacity: convirtiendo === 'objetivo' ? 0.7 : 1 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)18'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)10'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {convirtiendo === 'objetivo' ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <span style={{ fontSize: 22 }}>🎯</span>}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>Convertir a Objetivo</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Crea un objetivo estratégico con plan IA, tareas y métricas</div>
                </div>
              </div>
            </button>
          )}

          {/* → Tarea */}
          <button onClick={convertirATarea} disabled={!!convirtiendo}
            style={{ padding: '12px 14px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', opacity: convirtiendo === 'tarea' ? 0.7 : 1 }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.06)'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {convirtiendo === 'tarea' ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <span style={{ fontSize: 18 }}>✅</span>}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#10b981', marginBottom: 1 }}>Convertir a Tarea</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Crea una tarea concreta asignable al equipo</div>
              </div>
            </div>
          </button>

          {/* → Problema */}
          <button onClick={convertirAProblema} disabled={!!convirtiendo}
            style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', opacity: convirtiendo === 'problema' ? 0.7 : 1 }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.04)'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {convirtiendo === 'problema' ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <span style={{ fontSize: 18 }}>🔧</span>}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 1 }}>Registrar como Problema</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Si la idea nació de un dolor o issue a resolver</div>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ── TAB: DETALLE ── */}
      {tab === 'detalle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {idea.descripcion && (
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, background: 'var(--bg-input)', padding: '10px 12px', borderRadius: 8 }}>
              {idea.descripcion}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 7 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>IMPACTO ESTIMADO</div>
              <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{idea.impacto_estimado || '—'}</div>
            </div>
            <div style={{ padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 7 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>CATEGORÍA</div>
              <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{CATEGORIA_ICONS[idea.categoria]} {idea.categoria}</div>
            </div>
          </div>
          {problema && (
            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
              <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 700, marginBottom: 3 }}>PROBLEMA RELACIONADO</div>
              <div style={{ fontSize: 13, color: 'var(--text-1)' }}>🔧 {problema.titulo}</div>
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onEdit} style={{ alignSelf: 'flex-start' }}>✏ Editar idea</button>
        </div>
      )}

      {/* ── TAB: VINCULAR OBJETIVO ── */}
      {tab === 'vinculo' && (
        <div>
          {objetivo ? (
            <div>
              <div style={{ padding: '14px 16px', background: 'rgba(0,212,255,0.06)', border: '1px solid var(--accent)30', borderRadius: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>🎯 OBJETIVO VINCULADO</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{objetivo.titulo}</div>
                {objetivo.area && <span style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent)15', padding: '2px 8px', borderRadius: 6 }}>{objetivo.area}</span>}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => vincularObjetivo(null)}>
                Desvincula del objetivo
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
                Vincula esta idea a un objetivo estratégico existente:
              </div>
              {objetivos.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '16px 0' }}>
                  No hay objetivos activos. Crea uno primero o usa "Convertir a Objetivo".
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {objetivos.map(o => (
                    <button key={o.id} onClick={() => vincularObjetivo(o.id)}
                      style={{ padding: '10px 14px', background: 'var(--bg-input)', border: '1px solid var(--border-2)', borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-2)'}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{o.titulo}</div>
                      {o.area && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{o.area}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Matriz impacto × esfuerzo ────────────────────────────
function MatrizView({ ideas, onSelect }) {
  const IMPACTO_Y = { bajo: 75, medio: 50, alto: 25, critico: 5 }
  const ESFUERZO_X = { bajo: 15, medio: 45, alto: 75 }

  return (
    <div style={{ position: 'relative', width: '100%', height: 380, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Ejes */}
      <div style={{ position: 'absolute', bottom: 30, left: 0, right: 0, height: 1, background: 'var(--border)' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 30, left: '33%', width: 1, background: 'var(--border)' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 30, left: '66%', width: 1, background: 'var(--border)' }} />

      {/* Etiquetas cuadrantes */}
      {[
        { x: 16, y: 6, label: '⚡ Ganar fácil', color: '#10b981' },
        { x: 49, y: 6, label: '🚀 Apostar', color: 'var(--accent)' },
        { x: 67, y: 6, label: '🏗 Proyecto mayor', color: '#8b5cf6' },
        { x: 1, y: 55, label: 'Relleno', color: 'var(--text-3)' },
        { x: 67, y: 55, label: '⚠ Evitar', color: '#ef4444' },
      ].map((q, i) => (
        <div key={i} style={{ position: 'absolute', left: `${q.x}%`, top: `${q.y}%`, fontSize: 10, fontWeight: 700, color: q.color, opacity: 0.5, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {q.label}
        </div>
      ))}

      {/* Ideas como puntos */}
      {ideas.filter(i => !['descartada', 'implementada'].includes(i.estado)).map(idea => {
        const x = ESFUERZO_X[idea.esfuerzo_estimado || 'medio'] + (Math.random() * 14 - 7)
        const y = IMPACTO_Y[idea.impacto_nivel || 'medio'] + (Math.random() * 10 - 5)
        const color = ESTADO_COLORS[idea.estado] || 'var(--accent)'
        return (
          <button key={idea.id} onClick={() => onSelect(idea)}
            title={idea.titulo}
            style={{
              position: 'absolute', left: `${Math.max(2, Math.min(96, x))}%`, top: `${Math.max(2, Math.min(88, y))}%`,
              width: 24, height: 24, borderRadius: '50%', background: color, border: `2px solid ${color}`,
              cursor: 'pointer', transform: 'translate(-50%,-50%)', transition: 'transform 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, zIndex: 1,
              boxShadow: `0 0 0 3px ${color}30`
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translate(-50%,-50%) scale(1.4)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translate(-50%,-50%) scale(1)'}>
            {CATEGORIA_ICONS[idea.categoria] || '💡'}
          </button>
        )
      })}

      {/* Axis labels */}
      <div style={{ position: 'absolute', bottom: 6, left: '5%', fontSize: 10, color: 'var(--text-3)' }}>← Esfuerzo bajo</div>
      <div style={{ position: 'absolute', bottom: 6, right: '2%', fontSize: 10, color: 'var(--text-3)' }}>Esfuerzo alto →</div>
      <div style={{ position: 'absolute', left: 4, top: '40%', fontSize: 10, color: 'var(--text-3)', writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>Impacto ↑</div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────
export default function Ideas() {
  const location = useLocation()
  const { workspace, miembro } = useStore()
  const [ideas, setIdeas] = useState([])
  const [problemas, setProblemas] = useState([])
  const [objetivos, setObjetivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [buscandoProblema, setBuscandoProblema] = useState(false)
  const [sugerenciaProblema, setSugerenciaProblema] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('activas')
  const [filtroCategoria, setFiltroCategoria] = useState('all')
  const [ordenar, setOrdenar] = useState('prioridad')
  const [vista, setVista] = useState('lista')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (workspace?.id) { loadIdeas(); loadProblemas(); loadObjetivos() }
  }, [workspace])

  useEffect(() => {
    if (location.state?.openCreate) {
      setForm(empty()); setEditId(null); setSugerenciaProblema(null); setModalOpen(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  async function loadIdeas() {
    setLoading(true)
    const { data } = await supabase.from('bos_ideas').select('*').eq('fabrica_id', workspace.id).order('created_at', { ascending: false })
    setIdeas(data || [])
    setLoading(false)
  }
  async function loadProblemas() {
    const { data } = await supabase.from('bos_problemas').select('id, titulo').eq('fabrica_id', workspace.id).not('estado', 'in', '("resuelto","descartado")')
    setProblemas(data || [])
  }
  async function loadObjetivos() {
    const { data } = await supabase.from('bos_objetivos').select('id, titulo, area').eq('fabrica_id', workspace.id).eq('estado', 'activo').order('titulo')
    setObjetivos(data || [])
  }

  async function handleBuscarProblema() {
    if (!form.titulo.trim()) return
    setBuscandoProblema(true)
    try {
      const pid = await suggestProblemaRelacionado(form.titulo, form.descripcion, problemas)
      if (pid) { setSugerenciaProblema(pid); setForm(p => ({ ...p, problema_id: pid })); toast.success('IA sugirió problema relacionado') }
      else { setSugerenciaProblema(null); toast.info('IA: Sin problema relacionado detectado') }
    } catch { toast.error('Error consultando IA') }
    finally { setBuscandoProblema(false) }
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('El título es requerido'); return }
    setSaving(true)
    try {
      const payload = {
        fabrica_id: workspace.id, titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null, categoria: form.categoria, estado: form.estado,
        impacto_estimado: form.impacto_estimado.trim() || null, impacto_nivel: form.impacto_nivel,
        esfuerzo_estimado: form.esfuerzo_estimado, problema_id: form.problema_id || null,
        responsable: form.responsable || null, created_by: miembro?.profile_id
      }
      if (editId) {
        const { error } = await supabase.from('bos_ideas').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Idea actualizada')
      } else {
        const { error } = await supabase.from('bos_ideas').insert(payload)
        if (error) throw error
        toast.success('Idea registrada')
        await supabase.from('bos_bitacora').insert({ fabrica_id: workspace.id, tipo: 'idea', titulo: `Nueva idea: ${form.titulo}`, automatico: true, created_by: miembro?.profile_id })
      }
      setModalOpen(false); setSugerenciaProblema(null); loadIdeas()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta idea?')) return
    await supabase.from('bos_ideas').delete().eq('id', id)
    toast.success('Eliminada'); loadIdeas()
    if (expandedId === id) setExpandedId(null)
  }

  async function handleEstadoChange(id, estado) {
    const { error } = await supabase.from('bos_ideas').update({ estado }).eq('id', id)
    if (!error) setIdeas(prev => prev.map(i => i.id === id ? { ...i, estado } : i))
  }

  async function handleVotar(id, tipo) {
    const field = tipo === 'up' ? 'votos_positivos' : 'votos_negativos'
    const idea = ideas.find(i => i.id === id)
    const val = (idea?.[field] || 0) + 1
    const { error } = await supabase.from('bos_ideas').update({ [field]: val }).eq('id', id)
    if (!error) setIdeas(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i))
  }

  const ideasFiltradas = ideas.filter(i => {
    if (filtroEstado === 'activas' && ['implementada', 'descartada'].includes(i.estado)) return false
    if (filtroEstado !== 'activas' && filtroEstado !== 'all' && i.estado !== filtroEstado) return false
    if (filtroCategoria !== 'all' && i.categoria !== filtroCategoria) return false
    return true
  }).sort((a, b) => {
    if (ordenar === 'prioridad') return prioridadScore(b) - prioridadScore(a)
    if (ordenar === 'votos') return ((b.votos_positivos || 0) - (b.votos_negativos || 0)) - ((a.votos_positivos || 0) - (a.votos_negativos || 0))
    return new Date(b.created_at) - new Date(a.created_at)
  })

  const cActivas = ideas.filter(i => !['implementada', 'descartada'].includes(i.estado)).length
  const cConObjetivo = ideas.filter(i => i.objetivo_id).length

  if (loading) return <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /></div>

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Ideas</h1>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {cActivas} activas · {cConObjetivo > 0 && <span style={{ color: 'var(--accent)' }}>{cConObjetivo} convertidas a objetivo</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setVista(v => v === 'lista' ? 'matriz' : 'lista')}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--bg-input)', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}>
            {vista === 'lista' ? '🎯 Matriz' : '📋 Lista'}
          </button>
          <button className="btn btn-primary" onClick={() => { setForm(empty()); setEditId(null); setSugerenciaProblema(null); setModalOpen(true) }}>
            + Nueva idea
          </button>
        </div>
      </div>

      {/* Filtros y orden */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { id: 'activas',      label: `Activas (${cActivas})` },
          { id: 'pendiente',    label: `Pendientes (${ideas.filter(i => i.estado === 'pendiente').length})` },
          { id: 'aprobada',     label: `Aprobadas (${ideas.filter(i => i.estado === 'aprobada').length})` },
          { id: 'implementada', label: `Implementadas (${ideas.filter(i => i.estado === 'implementada').length})` },
          { id: 'all',          label: `Todas (${ideas.length})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFiltroEstado(f.id)}
            style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontWeight: filtroEstado === f.id ? 700 : 400, border: `1px solid ${filtroEstado === f.id ? 'var(--accent)' : 'var(--border-2)'}`, background: filtroEstado === f.id ? 'var(--accent)18' : 'var(--bg-input)', color: filtroEstado === f.id ? 'var(--accent)' : 'var(--text-3)' }}>
            {f.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Orden:</span>
          {[['prioridad', '⭐ Prioridad'], ['votos', '👍 Votos'], ['fecha', '🕐 Fecha']].map(([v, l]) => (
            <button key={v} onClick={() => setOrdenar(v)}
              style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${ordenar === v ? 'var(--accent)' : 'var(--border-2)'}`, background: ordenar === v ? 'var(--accent)15' : 'transparent', color: ordenar === v ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontWeight: ordenar === v ? 700 : 400, cursor: 'pointer' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Vista Matriz */}
      {vista === 'matriz' && (
        <div style={{ marginBottom: 20 }}>
          <MatrizView ideas={ideasFiltradas} onSelect={idea => { setExpandedId(idea.id === expandedId ? null : idea.id); setVista('lista') }} />
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, textAlign: 'center' }}>
            Haz clic en un punto para ver la idea en modo lista
          </div>
        </div>
      )}

      {/* Vista Lista */}
      {vista === 'lista' && (
        ideasFiltradas.length === 0 ? (
          <div className="empty-state"><div className="icon">💡</div><p>No hay ideas en esta vista</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ideasFiltradas.map(idea => {
              const isExpanded = expandedId === idea.id
              const q = getQuadrant(idea.impacto_nivel || 'medio', idea.esfuerzo_estimado || 'medio')
              const votos = (idea.votos_positivos || 0) - (idea.votos_negativos || 0)
              const tieneObjetivo = !!idea.objetivo_id

              return (
                <div key={idea.id}>
                  <div className="card" style={{
                    padding: '12px 16px', cursor: 'pointer',
                    borderLeft: `4px solid ${ESTADO_COLORS[idea.estado] || 'var(--border)'}`,
                    border: isExpanded ? `1px solid ${ESTADO_COLORS[idea.estado]}30` : '1px solid var(--border)',
                    borderLeft: `4px solid ${ESTADO_COLORS[idea.estado] || 'var(--border)'}`,
                    transition: 'all 0.15s',
                    background: tieneObjetivo ? 'rgba(0,212,255,0.02)' : 'var(--bg-card)'
                  }} onClick={() => setExpandedId(isExpanded ? null : idea.id)}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{CATEGORIA_ICONS[idea.categoria] || '💡'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: ESTADO_COLORS[idea.estado], textTransform: 'uppercase' }}>
                            {ESTADO_LABELS[idea.estado]}
                          </span>
                          {idea.impacto_nivel && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: IMPACTO_COLORS[idea.impacto_nivel], background: IMPACTO_COLORS[idea.impacto_nivel] + '15', padding: '1px 6px', borderRadius: 5 }}>
                              {idea.impacto_nivel}
                            </span>
                          )}
                          {idea.esfuerzo_estimado && (
                            <span style={{ fontSize: 10, color: ESFUERZO_COLORS[idea.esfuerzo_estimado], background: ESFUERZO_COLORS[idea.esfuerzo_estimado] + '15', padding: '1px 6px', borderRadius: 5 }}>
                              ⚡{idea.esfuerzo_estimado}
                            </span>
                          )}
                          {q.label && <span style={{ fontSize: 10, color: q.color, fontWeight: 600 }}>{q.label}</span>}
                          {tieneObjetivo && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>🎯 Objetivo</span>}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }} className="truncate">{idea.titulo}</div>
                        {idea.descripcion && !isExpanded && (
                          <div style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{idea.descripcion}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                        {/* Votos */}
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button onClick={e => { e.stopPropagation(); handleVotar(idea.id, 'up') }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--success)', padding: '2px 4px' }}>
                            👍{idea.votos_positivos || 0}
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleVotar(idea.id, 'down') }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--danger)', padding: '2px 4px' }}>
                            👎{idea.votos_negativos || 0}
                          </button>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); handleDelete(idea.id) }} style={{ color: 'var(--danger)' }}>✕</button>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ background: 'var(--bg-card)', border: `1px solid ${ESTADO_COLORS[idea.estado] || 'var(--accent)'}25`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '14px 16px', marginTop: -1 }}>
                      {/* Estado inline */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 6 }}>
                        <select value={idea.estado} onChange={e => handleEstadoChange(idea.id, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          style={{ background: ESTADO_COLORS[idea.estado] + '18', border: `1px solid ${ESTADO_COLORS[idea.estado]}40`, borderRadius: 6, color: ESTADO_COLORS[idea.estado], fontSize: 11, fontWeight: 700, padding: '3px 8px', cursor: 'pointer' }}>
                          {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
                        </select>
                      </div>
                      <IdeaDetalle
                        idea={idea} problemas={problemas} objetivos={objetivos}
                        workspace={workspace} miembro={miembro}
                        onReload={loadIdeas}
                        onEdit={() => { setForm({ titulo: idea.titulo, descripcion: idea.descripcion || '', categoria: idea.categoria, estado: idea.estado, impacto_estimado: idea.impacto_estimado || '', impacto_nivel: idea.impacto_nivel || 'medio', esfuerzo_estimado: idea.esfuerzo_estimado || 'medio', problema_id: idea.problema_id || '', responsable: idea.responsable || '' }); setEditId(idea.id); setModalOpen(true) }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Modal crear/editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar idea' : 'Nueva idea'} size="md"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : (editId ? 'Guardar' : 'Registrar')}
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
            <textarea className="input" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Detalla la idea..." rows={3} />
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
                {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Nivel de impacto</label>
              <select className="input" value={form.impacto_nivel} onChange={e => setForm(p => ({ ...p, impacto_nivel: e.target.value }))}>
                {IMPACTOS_NIVEL.map(i => <option key={i} value={i} style={{ color: IMPACTO_COLORS[i] }}>{i}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Esfuerzo requerido</label>
              <select className="input" value={form.esfuerzo_estimado} onChange={e => setForm(p => ({ ...p, esfuerzo_estimado: e.target.value }))}>
                {ESFUERZOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="label">Impacto esperado</label>
            <input className="input" value={form.impacto_estimado} onChange={e => setForm(p => ({ ...p, impacto_estimado: e.target.value }))} placeholder="Ej: +20% en ventas, reducir 2h de proceso..." />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label className="label" style={{ marginBottom: 0 }}>Problema relacionado</label>
              <button className="btn btn-ghost btn-sm" onClick={handleBuscarProblema} disabled={buscandoProblema}>
                {buscandoProblema ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✨ IA'}
              </button>
            </div>
            <select className="input" value={form.problema_id} onChange={e => setForm(p => ({ ...p, problema_id: e.target.value }))}>
              <option value="">Sin problema relacionado</option>
              {problemas.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
            </select>
            {sugerenciaProblema && <span style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, display: 'block' }}>✨ IA sugirió problema relacionado</span>}
          </div>
        </div>
      </Modal>
    </div>
  )
}

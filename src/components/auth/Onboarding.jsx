import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useStore } from '../../store/index.js'
import { toast } from '../ui/Toast.jsx'

const GIROS = [
  { value: 'restaurante', label: '🍽️ Restaurante' },
  { value: 'fábrica', label: '🏭 Fábrica' },
  { value: 'tienda', label: '🛍️ Tienda' },
  { value: 'florería', label: '🌸 Florería' },
  { value: 'consultora', label: '💼 Consultora' },
  { value: 'agencia', label: '🎯 Agencia' },
  { value: 'farmacia', label: '💊 Farmacia' },
  { value: 'clínica', label: '🏥 Clínica' },
  { value: 'otro', label: '🏢 Otro' }
]

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { setUser, setWorkspace, setMiembro } = useStore()
  const [step, setStep] = useState(1)
  const [nombre, setNombre] = useState('')
  const [giro, setGiro] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [slugError, setSlugError] = useState('')
  const [loading, setLoading] = useState(false)
  const [user, setUserLocal] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) { setUser(data.user); setUserLocal(data.user) }
      else navigate('/login')
    })
  }, [])

  useEffect(() => {
    if (!slugManual && nombre) {
      setSlug(slugify(nombre))
    }
  }, [nombre, slugManual])

  const checkSlug = async (s) => {
    if (!s || s.length < 3) { setSlugError('Mínimo 3 caracteres'); return false }
    const { data } = await supabase.from('fabricas').select('id').eq('slug', s).maybeSingle()
    if (data) { setSlugError('Este slug ya está en uso'); return false }
    setSlugError('')
    return true
  }

  const handleNext = async () => {
    if (step === 1) {
      if (!nombre.trim()) { toast.error('Escribe el nombre del negocio'); return }
      if (!giro) { toast.error('Selecciona el giro'); return }
      setStep(2)
    } else if (step === 2) {
      const ok = await checkSlug(slug)
      if (!ok) return
      setStep(3)
    }
  }

  const handleCreate = async () => {
    if (!user) { toast.error('No hay sesión activa'); return }
    setLoading(true)
    try {
      // Create workspace
      const { data: fab, error: fabErr } = await supabase
        .from('fabricas')
        .insert({ nombre: nombre.trim(), giro, slug, created_by: user.id })
        .select()
        .single()

      if (fabErr) throw fabErr

      // Add owner membership
      const { data: mem, error: memErr } = await supabase
        .from('colaboradores')
        .insert({
          fabrica_id: fab.id,
          profile_id: user.id,
          nombre: user.email,
          boss_rol: 'owner',
          activo: true
        })
        .select()
        .single()

      if (memErr) throw memErr

      // Bitácora entry
      await supabase.from('bos_bitacora').insert({
        fabrica_id: fab.id,
        tipo: 'workspace',
        titulo: 'Workspace creado',
        descripcion: `Workspace "${fab.nombre}" creado por ${user.email}`,
        automatico: true,
        created_by: user.id
      })

      setWorkspace(fab)
      setMiembro(mem)
      toast.success(`¡Workspace "${fab.nombre}" creado!`)
      navigate(`/${slug}/dashboard`)
    } catch (err) {
      toast.error(err.message || 'Error al crear workspace')
    } finally {
      setLoading(false)
    }
  }

  const StepIndicator = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, justifyContent: 'center' }}>
      {[1, 2, 3].map(s => (
        <React.Fragment key={s}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: s <= step ? 'var(--accent)' : 'var(--bg-input)',
            color: s <= step ? '#000' : 'var(--text-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
            border: s === step ? '2px solid var(--accent)' : '1px solid var(--border-2)',
            transition: 'all 0.2s'
          }}>{s}</div>
          {s < 3 && (
            <div style={{
              width: 40, height: 1,
              background: s < step ? 'var(--accent)' : 'var(--border-2)',
              transition: 'background 0.2s'
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  )

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.07), transparent)'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-2)',
        borderRadius: 16,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 460,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>
            Crear workspace
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
            Configura tu Business OS en 3 pasos
          </p>
        </div>

        <StepIndicator />

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="label">Nombre del negocio</label>
              <input
                className="input"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Helados El Polo"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="label">Giro del negocio</label>
              <select
                className="input"
                value={giro}
                onChange={e => setGiro(e.target.value)}
              >
                <option value="">Selecciona el giro...</option>
                {GIROS.map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
              fontSize: 13,
              color: 'var(--text-2)'
            }}>
              El slug es la URL de tu workspace: <br />
              <strong style={{ color: 'var(--accent)' }}>businessos.app/<span style={{ color: 'var(--text-1)' }}>{slug || 'tu-empresa'}</span>/dashboard</strong>
            </div>
            <div className="form-group">
              <label className="label">Slug (URL amigable)</label>
              <input
                className="input"
                value={slug}
                onChange={e => {
                  setSlugManual(true)
                  setSlug(slugify(e.target.value))
                  setSlugError('')
                }}
                placeholder="mi-empresa"
              />
              {slugError && (
                <span style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{slugError}</span>
              )}
              {!slugError && slug && (
                <span style={{ fontSize: 11, color: 'var(--success)', marginTop: 4 }}>✓ Disponible</span>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🚀</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>
                ¡Todo listo!
              </h3>
            </div>
            {[
              { label: 'Negocio', value: nombre },
              { label: 'Giro', value: giro },
              { label: 'URL', value: `/${slug}/dashboard` }
            ].map(item => (
              <div key={item.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 8
              }}>
                <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{item.label}</span>
                <span style={{ color: 'var(--text-1)', fontSize: 13, fontWeight: 600 }}>{item.value}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          {step > 1 && (
            <button
              className="btn btn-secondary"
              onClick={() => setStep(s => s - 1)}
              disabled={loading}
              style={{ flex: 1 }}
            >← Atrás</button>
          )}
          {step < 3 ? (
            <button
              className="btn btn-primary"
              onClick={handleNext}
              style={{ flex: 1, justifyContent: 'center' }}
            >Siguiente →</button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={loading}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {loading
                ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                : '🚀 Crear workspace'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

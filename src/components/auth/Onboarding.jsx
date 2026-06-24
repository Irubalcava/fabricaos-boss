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
    .slice(0, 32)
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6)
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { setUser, setWorkspace, setMiembro } = useStore()
  const [step, setStep] = useState(1)
  const [nombre, setNombre] = useState('')
  const [giro, setGiro] = useState('')
  const [loading, setLoading] = useState(false)
  const [user, setUserLocal] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) { setUser(data.user); setUserLocal(data.user) }
      else navigate('/login')
    })
  }, [])

  const handleNext = () => {
    if (!nombre.trim()) { toast.error('Escribe el nombre del negocio'); return }
    if (!giro) { toast.error('Selecciona el giro'); return }
    setStep(2)
  }

  const handleCreate = async () => {
    if (!user) { toast.error('No hay sesión activa'); return }
    setLoading(true)
    try {
      const slug = slugify(nombre) + '-' + randomSuffix()

      const { data: fab, error: fabErr } = await supabase
        .from('fabricas')
        .insert({ nombre: nombre.trim(), giro, slug })
        .select()
        .single()

      if (fabErr) throw fabErr

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
      navigate(`/${fab.slug}/dashboard`)
    } catch (err) {
      toast.error(err.message || 'Error al crear workspace')
    } finally {
      setLoading(false)
    }
  }

  const GIRO_ICONS = {
    restaurante: '🍽️', fábrica: '🏭', tienda: '🛍️', florería: '🌸',
    consultora: '💼', agencia: '🎯', farmacia: '💊', clínica: '🏥', otro: '🏢'
  }

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
        maxWidth: 420,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>
            {step === 2 ? (GIRO_ICONS[giro] || '🚀') : '🏢'}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>
            {step === 1 ? 'Crear workspace' : '¡Todo listo!'}
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
            {step === 1
              ? 'Ingresa los datos de tu negocio'
              : 'Confirma los datos y crea tu workspace'}
          </p>
        </div>

        {/* Paso indicador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28, justifyContent: 'center' }}>
          {[1, 2].map(s => (
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
              {s < 2 && (
                <div style={{
                  width: 40, height: 1,
                  background: s < step ? 'var(--accent)' : 'var(--border-2)',
                  transition: 'background 0.2s'
                }} />
              )}
            </React.Fragment>
          ))}
        </div>

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
                onKeyDown={e => e.key === 'Enter' && handleNext()}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Negocio', value: nombre },
              { label: 'Giro', value: GIROS.find(g => g.value === giro)?.label || giro }
            ].map(item => (
              <div key={item.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 10
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
              onClick={() => setStep(1)}
              disabled={loading}
              style={{ flex: 1 }}
            >← Atrás</button>
          )}
          {step === 1 ? (
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

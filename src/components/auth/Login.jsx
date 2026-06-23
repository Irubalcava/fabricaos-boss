import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useStore } from '../../store/index.js'
import { toast } from '../ui/Toast.jsx'

export default function Login() {
  const navigate = useNavigate()
  const { setUser } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) { toast.error('Completa todos los campos'); return }
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      setUser(data.user)

      // Check workspaces
      const { data: memberships } = await supabase
        .from('colaboradores')
        .select('fabrica_id, fabricas:fabrica_id(slug, nombre)')
        .eq('profile_id', data.user.id)
        .not('boss_rol', 'is', null)
        .neq('activo', false)

      const wsList = memberships?.filter(m => m.fabricas) || []

      if (wsList.length === 0) {
        navigate('/onboarding')
      } else if (wsList.length === 1) {
        navigate(`/${wsList[0].fabricas.slug}/dashboard`)
      } else {
        navigate('/select')
      }
    } catch (err) {
      toast.error(err.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,212,255,0.06), transparent)'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-2)',
        borderRadius: 16,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.5px' }}>
            Business <span style={{ color: 'var(--accent)' }}>OS</span>
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 6 }}>
            El sistema operativo de tu negocio
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="label">Contraseña</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ justifyContent: 'center', marginTop: 8, padding: '10px' }}
          >
            {loading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Iniciar sesión'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-3)' }}>
          ¿Primera vez?{' '}
          <button
            onClick={() => navigate('/onboarding')}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }}
          >
            Crear workspace
          </button>
        </p>
      </div>
    </div>
  )
}

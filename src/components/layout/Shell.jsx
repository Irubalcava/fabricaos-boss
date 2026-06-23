import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'
import { toast } from '../ui/Toast.jsx'

// Lazy imports for modules
import Dashboard from '../dashboard/Dashboard.jsx'
import Tareas from '../tasks/Tareas.jsx'
import KPIs from '../kpis/KPIs.jsx'
import Objetivos from '../objectives/Objetivos.jsx'
import Reuniones from '../meetings/Reuniones.jsx'
import Decisiones from '../decisions/Decisiones.jsx'
import Problemas from '../problems/Problemas.jsx'
import Ideas from '../ideas/Ideas.jsx'
import Bitacora from '../bitacora/Bitacora.jsx'
import Configuracion from '../settings/Configuracion.jsx'

export default function Shell() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { setWorkspace, setMiembro, setMiembros, setNotifCount, user, workspace } = useStore()
  const [loading, setLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [tareasVencidas, setTareasVencidas] = useState(0)
  const [quickAction, setQuickAction] = useState(null)

  useEffect(() => {
    if (!user || !slug) return
    loadWorkspace()
  }, [slug, user])

  async function loadWorkspace() {
    setLoading(true)
    try {
      // Load workspace by slug
      const { data: fab, error: fabErr } = await supabase
        .from('fabricas')
        .select('*')
        .eq('slug', slug)
        .single()

      if (fabErr || !fab) {
        toast.error('Workspace no encontrado')
        navigate('/select')
        return
      }

      setWorkspace(fab)

      // Load current user's membership
      const { data: mem } = await supabase
        .from('colaboradores')
        .select('*')
        .eq('fabrica_id', fab.id)
        .eq('profile_id', user.id)
        .not('boss_rol', 'is', null)
        .single()

      if (!mem) {
        toast.error('No tienes acceso a este workspace')
        navigate('/select')
        return
      }

      setMiembro(mem)

      // Load all members
      const { data: miembros } = await supabase
        .from('colaboradores')
        .select('*')
        .eq('fabrica_id', fab.id)
        .not('boss_rol', 'is', null)
        .neq('activo', false)

      setMiembros(miembros || [])

      // Count overdue tasks
      const today = new Date().toISOString().split('T')[0]
      const { count } = await supabase
        .from('bos_tareas')
        .select('*', { count: 'exact', head: true })
        .eq('fabrica_id', fab.id)
        .lt('fecha_limite', today)
        .not('estado', 'in', '("hecha","cancelada")')

      setTareasVencidas(count || 0)

      // Count unread notifications
      const { count: notifCount } = await supabase
        .from('bos_notificaciones')
        .select('*', { count: 'exact', head: true })
        .eq('fabrica_id', fab.id)
        .eq('destinatario_id', user.id)
        .eq('leida', false)

      setNotifCount(notifCount || 0)

    } catch (err) {
      console.error(err)
      toast.error('Error cargando workspace')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAction = (action) => {
    const routes = {
      tarea: 'tareas',
      problema: 'problemas',
      idea: 'ideas',
      decision: 'decisiones'
    }
    navigate(`/${slug}/${routes[action]}`, { state: { openCreate: true } })
  }

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', flexDirection: 'column', gap: 16
      }}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>Cargando workspace...</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        collapsed={sidebarCollapsed}
        tareasVencidas={tareasVencidas}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header
          onToggleSidebar={() => setSidebarCollapsed(v => !v)}
          onQuickAction={handleQuickAction}
        />
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
          <Routes>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="tareas" element={<Tareas />} />
            <Route path="kpis" element={<KPIs />} />
            <Route path="objetivos" element={<Objetivos />} />
            <Route path="reuniones" element={<Reuniones />} />
            <Route path="decisiones" element={<Decisiones />} />
            <Route path="problemas" element={<Problemas />} />
            <Route path="ideas" element={<Ideas />} />
            <Route path="bitacora" element={<Bitacora />} />
            <Route path="configuracion" element={<Configuracion />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

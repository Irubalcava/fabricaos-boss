import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../../store/index.js'
import { supabase } from '../../lib/supabase.js'
import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'
import { toast } from '../ui/Toast.jsx'

import Dashboard from '../dashboard/Dashboard.jsx'
import Tareas from '../tasks/Tareas.jsx'
import Objetivos from '../objectives/Objetivos.jsx'
import Reuniones from '../meetings/Reuniones.jsx'
import Decisiones from '../decisions/Decisiones.jsx'
import KPIs from '../kpis/KPIs.jsx'
import Problemas from '../problems/Problemas.jsx'
import Ideas from '../ideas/Ideas.jsx'
import Bitacora from '../bitacora/Bitacora.jsx'
import Configuracion from '../settings/Configuracion.jsx'

export default function Shell() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const {
    setWorkspace, setMiembro, setMiembros, setNotifCount,
    setSucursales, setSucursal,
    user
  } = useStore()

  const [loading, setLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [tareasVencidas, setTareasVencidas] = useState(0)

  useEffect(() => {
    if (!user || !slug) return
    loadWorkspace()
  }, [slug, user])

  async function loadWorkspace() {
    setLoading(true)
    try {
      // 1) Workspace por slug
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

      // Aplicar color primario del workspace como variable CSS
      if (fab.color_primario) {
        const c = fab.color_primario
        document.documentElement.style.setProperty('--accent', c)
        // Detectar si el color es claro u oscuro para el texto del botón
        const r = parseInt(c.slice(1, 3), 16)
        const g = parseInt(c.slice(3, 5), 16)
        const b = parseInt(c.slice(5, 7), 16)
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        document.documentElement.style.setProperty('--accent-fg', lum > 0.55 ? '#000' : '#fff')
      }

      const today = new Date().toISOString().split('T')[0]

      // 2) Todo en paralelo: membresía, miembros, sucursales, tareas vencidas, notifs
      const [memRes, miembrosRes, sucursalesRes, tareasRes, notifRes] = await Promise.all([
        supabase
          .from('colaboradores')
          .select('*')
          .eq('fabrica_id', fab.id)
          .eq('profile_id', user.id)
          .not('boss_rol', 'is', null)
          .single(),

        supabase
          .from('colaboradores')
          .select('*, profiles:profile_id(nombre, email)')
          .eq('fabrica_id', fab.id)
          .not('boss_rol', 'is', null)
          .neq('activo', false),

        supabase
          .from('bos_sucursales')
          .select('*')
          .eq('fabrica_id', fab.id)
          .eq('activo', true)
          .order('nombre'),

        supabase
          .from('bos_tareas')
          .select('*', { count: 'exact', head: true })
          .eq('fabrica_id', fab.id)
          .lt('fecha_limite', today)
          .not('estado', 'in', '("hecha","cancelada")'),

        supabase
          .from('bos_notificaciones')
          .select('*', { count: 'exact', head: true })
          .eq('fabrica_id', fab.id)
          .eq('destinatario_id', user.id)
          .eq('leida', false)
      ])

      if (!memRes.data) {
        toast.error('No tienes acceso a este workspace')
        navigate('/select')
        return
      }

      const miembro = memRes.data
      setMiembro(miembro)
      setMiembros(miembrosRes.data || [])
      setTareasVencidas(tareasRes.count || 0)
      setNotifCount(notifRes.count || 0)

      // Sucursales
      const sucursalesData = sucursalesRes.data || []
      setSucursales(sucursalesData)

      // Si el usuario tiene sucursal asignada, filtrar por ella
      if (miembro.sucursal_id) {
        const suSucursal = sucursalesData.find(s => s.id === miembro.sucursal_id)
        setSucursal(suSucursal || null)
      } else {
        setSucursal(null) // owner/admin ve todo
      }

    } catch (err) {
      console.error(err)
      toast.error('Error cargando workspace')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAction = (action) => {
    const routes = { tarea: 'tareas', problema: 'problemas', idea: 'ideas', decision: 'decisiones' }
    navigate(`/${slug}/${routes[action]}`, { state: { openCreate: true } })
  }

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', flexDirection: 'column', gap: 16
      }}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>Cargando workspace...</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar collapsed={sidebarCollapsed} tareasVencidas={tareasVencidas} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header
          onToggleSidebar={() => setSidebarCollapsed(v => !v)}
          onQuickAction={handleQuickAction}
        />
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
          <Routes>
            <Route path="dashboard"    element={<Dashboard />} />
            <Route path="tareas"       element={<Tareas />} />
            <Route path="objetivos"    element={<Objetivos />} />
            <Route path="kpis"         element={<KPIs />} />
            <Route path="reuniones"    element={<Reuniones />} />
            <Route path="decisiones"   element={<Decisiones />} />
            <Route path="problemas"    element={<Problemas />} />
            <Route path="ideas"        element={<Ideas />} />
            <Route path="bitacora"     element={<Bitacora />} />
            <Route path="configuracion" element={<Configuracion />} />
            <Route path="*"            element={<Navigate to="dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

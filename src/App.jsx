import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import { useStore } from './store/index.js'
import { ToastProvider } from './components/ui/Toast.jsx'

import Login from './components/auth/Login.jsx'
import Onboarding from './components/auth/Onboarding.jsx'
import WorkspaceSelect from './components/auth/WorkspaceSelect.jsx'
import Shell from './components/layout/Shell.jsx'

function AuthGuard({ children }) {
  const navigate = useNavigate()
  const { user, setUser } = useStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
      }
      setChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        navigate('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (checking) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)'
      }}>
        <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    )
  }

  return children
}

function AppRoutes() {
  const { user } = useStore()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/select" element={<WorkspaceSelect />} />
      <Route path="/:slug/*" element={
        user ? <Shell /> : <Navigate to="/login" replace />
      } />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/boss">
      <ToastProvider>
        <AuthGuard>
          <AppRoutes />
        </AuthGuard>
      </ToastProvider>
    </BrowserRouter>
  )
}

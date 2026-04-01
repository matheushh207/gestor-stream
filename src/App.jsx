import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { getUserRole } from './lib/auth'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import AdminDashboard from './pages/admin/Dashboard'
import AdminRevendas from './pages/admin/Revendas'
import AppDashboard from './pages/app/Dashboard'
import Clientes from './pages/app/Clientes'
import Financeiro from './pages/app/Financeiro'

function GuestRoute({ children }) {
  const [state, setState] = useState({ loading: true, role: null })

  useEffect(() => {
    async function run() {
      const ctx = await getUserRole()
      setState({ loading: false, role: ctx?.role ?? null })
    }
    const sub = supabase.auth.onAuthStateChange(() => run())
    run()
    return () => sub.data.subscription.unsubscribe()
  }, [])

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-gray-400">
        Carregando…
      </div>
    )
  }

  if (state.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />
  }
  if (state.role === 'revenda') {
    return <Navigate to="/app/dashboard" replace />
  }

  return children
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        }
      />

      <Route element={<ProtectedRoute allowedRole="admin" />}>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/revendas" element={<AdminRevendas />} />
      </Route>

      <Route element={<ProtectedRoute allowedRole="revenda" />}>
        <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="/app/dashboard" element={<AppDashboard />} />
        <Route path="/app/clientes" element={<Clientes />} />
        <Route path="/app/financeiro" element={<Financeiro />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getUserRole } from '../lib/auth'
import Sidebar from './Sidebar'

export function ProtectedRoute({ allowedRole }) {
  const [state, setState] = useState({
    loading: true,
    role: null,
    revendaId: null,
  })
  const navigate = useNavigate()

  useEffect(() => {
    async function refresh() {
      const ctx = await getUserRole()
      setState({
        loading: false,
        role: ctx?.role ?? null,
        revendaId: ctx?.revendaId ?? null,
      })
    }
    const sub = supabase.auth.onAuthStateChange(() => {
      refresh()
    })
    refresh()
    return () => sub.data.subscription.unsubscribe()
  }, [])

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-gray-400">
        Carregando…
      </div>
    )
  }

  if (!state.role) {
    return <Navigate to="/login" replace />
  }

  if (allowedRole === 'admin' && state.role !== 'admin') {
    return <Navigate to="/app/dashboard" replace />
  }

  if (allowedRole === 'revenda' && state.role !== 'revenda') {
    return <Navigate to="/admin/dashboard" replace />
  }

  return (
    <div className="min-h-screen bg-gray-900 pl-56">
      <Sidebar role={state.role} />
      <main className="p-6 lg:p-8">
        <Outlet
          context={{
            role: state.role,
            revendaId: state.revendaId,
            navigate,
          }}
        />
      </main>
    </div>
  )
}

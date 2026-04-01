import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Header from '../../components/Header'
import Card from '../../components/Card'

export default function AdminDashboard() {
  const { navigate } = useOutletContext()
  const [stats, setStats] = useState({
    totalRevendas: 0,
    revendasAtivas: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: revendas } = await supabase.from('revendas').select('id, status')
      const totalRevendas = revendas?.length ?? 0
      const revendasAtivas =
        revendas?.filter((r) => r.status === 'ativo').length ?? 0
      setStats({
        totalRevendas,
        revendasAtivas,
      })
      setLoading(false)
    }
    load()
  }, [])

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Visão geral da plataforma"
        onSignOut={() => navigate('/login', { replace: true })}
      />
      {loading ? (
        <p className="text-gray-400">Carregando…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Total de revendas">
            <p className="text-3xl font-bold text-white">{stats.totalRevendas}</p>
          </Card>
          <Card title="Revendas ativas">
            <p className="text-3xl font-bold text-emerald-400">{stats.revendasAtivas}</p>
          </Card>
        </div>
      )}
    </>
  )
}

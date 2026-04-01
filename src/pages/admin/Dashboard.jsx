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
    totalClientes: 0,
    receitaEstimada: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: revendas } = await supabase.from('revendas').select('id, status')
      const { data: clientes } = await supabase.from('clientes').select('valor')
      const totalRevendas = revendas?.length ?? 0
      const revendasAtivas =
        revendas?.filter((r) => r.status === 'ativo').length ?? 0
      const totalClientes = clientes?.length ?? 0
      const receitaEstimada =
        clientes?.reduce((s, c) => s + Number(c.valor || 0), 0) ?? 0
      setStats({
        totalRevendas,
        revendasAtivas,
        totalClientes,
        receitaEstimada,
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card title="Total de revendas">
            <p className="text-3xl font-bold text-white">{stats.totalRevendas}</p>
          </Card>
          <Card title="Revendas ativas">
            <p className="text-3xl font-bold text-emerald-400">{stats.revendasAtivas}</p>
          </Card>
          <Card title="Total de clientes (global)">
            <p className="text-3xl font-bold text-white">{stats.totalClientes}</p>
          </Card>
          <Card title="Receita estimada (soma valores)">
            <p className="text-3xl font-bold text-indigo-400">
              R$ {stats.receitaEstimada.toFixed(2)}
            </p>
          </Card>
        </div>
      )}
    </>
  )
}

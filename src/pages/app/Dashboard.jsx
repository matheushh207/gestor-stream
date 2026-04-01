import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { supabase } from '../../lib/supabase'
import Header from '../../components/Header'
import Card from '../../components/Card'
import {
  statusFromVencimento,
  diasAteVencimento,
  alertaVencimento,
} from '../../lib/clientes'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
)

export default function AppDashboard() {
  const { navigate, revendaId } = useOutletContext()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    if (!revendaId) return
    async function load() {
      const { data: rows } = await supabase
        .from('clientes')
        .select('*')
        .eq('revenda_id', revendaId)
        .order('created_at', { ascending: true })

      const list = rows ?? []
      setClientes(list)

      const warn = []
      for (const c of list) {
        const derived = statusFromVencimento(c.vencimento, c.status)
        const a = alertaVencimento(c.vencimento)
        if (a === 'vencido')
          warn.push({ cliente: c.nome, tipo: 'vencido', id: c.id })
        if (a === 'proximo')
          warn.push({
            cliente: c.nome,
            tipo: 'proximo',
            dias: diasAteVencimento(c.vencimento),
            id: c.id,
          })
      }
      setAlerts(warn)

      for (const c of list) {
        const derived = statusFromVencimento(c.vencimento, c.status)
        if (derived !== c.status) {
          await supabase.from('clientes').update({ status: derived }).eq('id', c.id)
        }
      }
      setLoading(false)
    }
    load()
  }, [revendaId])

  const stats = useMemo(() => {
    const total = clientes.length
    const vencidos = clientes.filter(
      (c) => statusFromVencimento(c.vencimento, c.status) === 'vencido',
    ).length
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const receitaMes = clientes
      .filter((c) => new Date(c.created_at) >= monthStart)
      .reduce((s, c) => s + Number(c.valor || 0), 0)
    const prevista = clientes
      .filter((c) => statusFromVencimento(c.vencimento, c.status) === 'ativo')
      .reduce((s, c) => s + Number(c.valor || 0), 0)
    return { total, vencidos, receitaMes, prevista }
  }, [clientes])

  const chartData = useMemo(() => {
    const byMonth = {}
    for (const c of clientes) {
      const d = new Date(c.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      byMonth[key] = (byMonth[key] || 0) + 1
    }
    const keys = Object.keys(byMonth).sort()
    return {
      labels: keys,
      datasets: [
        {
          label: 'Novos clientes (por mês)',
          data: keys.map((k) => byMonth[k]),
          borderColor: 'rgb(129, 140, 248)',
          backgroundColor: 'rgba(129, 140, 248, 0.2)',
          tension: 0.3,
        },
      ],
    }
  }, [clientes])

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { labels: { color: '#9ca3af' } },
    },
    scales: {
      x: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
      y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
    },
  }

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Sua operação"
        onSignOut={() => navigate('/login', { replace: true })}
      />

      {alerts.length > 0 && (
        <div className="mb-6 space-y-2 rounded-xl border border-amber-900/50 bg-amber-950/30 p-4">
          <p className="text-sm font-semibold text-amber-200">Alertas</p>
          <ul className="list-inside list-disc text-sm text-amber-100/90">
            {alerts.map((a, i) => (
              <li key={`${a.id}-${i}`}>
                {a.tipo === 'vencido' && (
                  <span>
                    <strong>{a.cliente}</strong> — vencido
                  </span>
                )}
                {a.tipo === 'proximo' && (
                  <span>
                    <strong>{a.cliente}</strong> — vence em {a.dias} dia(s)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Carregando…</p>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="Total de clientes">
              <p className="text-3xl font-bold text-white">{stats.total}</p>
            </Card>
            <Card title="Clientes vencidos">
              <p className="text-3xl font-bold text-red-400">{stats.vencidos}</p>
            </Card>
            <Card title="Receita mensal (novos)">
              <p className="text-3xl font-bold text-white">
                R$ {stats.receitaMes.toFixed(2)}
              </p>
            </Card>
            <Card title="Receita prevista (ativos)">
              <p className="text-3xl font-bold text-emerald-400">
                R$ {stats.prevista.toFixed(2)}
              </p>
            </Card>
          </div>

          <Card title="Crescimento de clientes">
            <div className="h-72">
              {chartData.labels.length === 0 ? (
                <p className="text-sm text-gray-500">Sem dados ainda.</p>
              ) : (
                <Line data={chartData} options={chartOptions} />
              )}
            </div>
          </Card>
        </>
      )}
    </>
  )
}

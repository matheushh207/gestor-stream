import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Header from '../../components/Header'
import Card from '../../components/Card'

export default function Financeiro() {
  const { navigate, revendaId } = useOutletContext()
  const [clientes, setClientes] = useState([])
  const [pagamentos, setPagamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [form, setForm] = useState({
    cliente_id: '',
    valor: '',
    metodo: 'pix',
    pago_em: new Date().toISOString().slice(0, 16),
  })
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!revendaId) return
    const { data: cRows } = await supabase
      .from('clientes')
      .select('id, nome')
      .eq('revenda_id', revendaId)
      .order('nome')
    setClientes(cRows ?? [])
    const ids = (cRows ?? []).map((c) => c.id)
    if (ids.length === 0) {
      setPagamentos([])
      setLoading(false)
      return
    }
    const { data: pRows } = await supabase
      .from('pagamentos')
      .select('*')
      .in('cliente_id', ids)
      .order('pago_em', { ascending: false })
    setPagamentos(pRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [revendaId])

  const nomeById = useMemo(() => {
    const m = {}
    for (const c of clientes) m[c.id] = c.nome
    return m
  }, [clientes])

  const filtered = useMemo(() => {
    if (!filtroCliente) return pagamentos
    return pagamentos.filter((p) => p.cliente_id === filtroCliente)
  }, [pagamentos, filtroCliente])

  const totalRecebido = useMemo(() => {
    return filtered.reduce((s, p) => s + Number(p.valor || 0), 0)
  }, [filtered])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.cliente_id) {
      alert('Selecione um cliente.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('pagamentos').insert({
      cliente_id: form.cliente_id,
      valor: Number(form.valor),
      metodo: form.metodo,
      pago_em: new Date(form.pago_em).toISOString(),
    })
    setSaving(false)
    if (error) alert(error.message)
    else {
      setForm({
        cliente_id: '',
        valor: '',
        metodo: 'pix',
        pago_em: new Date().toISOString().slice(0, 16),
      })
      load()
    }
  }

  return (
    <>
      <Header
        title="Financeiro"
        subtitle="Pagamentos e totais"
        onSignOut={() => navigate('/login', { replace: true })}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card title="Total recebido (filtro atual)">
          <p className="text-3xl font-bold text-emerald-400">
            R$ {totalRecebido.toFixed(2)}
          </p>
        </Card>
        <div className="lg:col-span-2">
          <Card title="Registrar pagamento">
            <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
              <select
                required
                value={form.cliente_id}
                onChange={(e) =>
                  setForm({ ...form, cliente_id: e.target.value })
                }
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white sm:col-span-2"
              >
                <option value="">Cliente…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                step="0.01"
                placeholder="Valor"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              />
              <select
                value={form.metodo}
                onChange={(e) => setForm({ ...form, metodo: e.target.value })}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              >
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao">Cartão</option>
              </select>
              <input
                type="datetime-local"
                value={form.pago_em}
                onChange={(e) => setForm({ ...form, pago_em: e.target.value })}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white sm:col-span-2"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 sm:col-span-2"
              >
                {saving ? 'Salvando…' : 'Registrar'}
              </button>
            </form>
          </Card>
        </div>
      </div>

      <Card title="Pagamentos">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <label className="text-sm text-gray-400">Filtrar por cliente</label>
          <select
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          >
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="text-gray-400">Carregando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4">Valor</th>
                  <th className="pb-2 pr-4">Método</th>
                  <th className="pb-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-gray-800">
                    <td className="py-2 pr-4 text-white">
                      {nomeById[p.cliente_id] || '—'}
                    </td>
                    <td className="py-2 pr-4 text-emerald-300">
                      R$ {Number(p.valor).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-gray-300">{p.metodo}</td>
                    <td className="py-2 text-gray-400">
                      {new Date(p.pago_em).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="mt-4 text-sm text-gray-500">Nenhum pagamento.</p>
            )}
          </div>
        )}
      </Card>
    </>
  )
}

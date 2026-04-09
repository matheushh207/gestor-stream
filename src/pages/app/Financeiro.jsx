import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Header from '../../components/Header'
import Card from '../../components/Card'
import { calcularNovaDataVencimento, statusFromVencimento } from '../../lib/clientes'

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
    duracao: '1',
    pago_em: new Date().toISOString().slice(0, 16),
  })
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!revendaId) return
    const { data: cRows } = await supabase
      .from('clientes')
      .select('id, nome, valor, vencimento, status')
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

  function handleSelectCliente(id) {
    const cliente = clientes.find(c => c.id === id)
    setForm({
      ...form,
      cliente_id: id,
      valor: cliente ? String(cliente.valor || '') : '',
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.cliente_id) {
      alert('Selecione um cliente.')
      return
    }
    
    const cliente = clientes.find(c => c.id === form.cliente_id)
    if (!cliente) return

    setSaving(true)
    
    const vencimentoAnterior = cliente.vencimento
    const meses = parseInt(form.duracao)
    const vencimentoNovo = calcularNovaDataVencimento(vencimentoAnterior, meses)

    // 1. Registrar pagamento
    const { data: paymentData, error: paymentError } = await supabase.from('pagamentos').insert({
      cliente_id: form.cliente_id,
      valor: Number(form.valor),
      metodo: form.metodo,
      pago_em: new Date(form.pago_em).toISOString(),
      vencimento_anterior: vencimentoAnterior,
      vencimento_novo: vencimentoNovo
    }).select().single()

    if (paymentError) {
      alert(paymentError.message)
      setSaving(false)
      return
    }

    // 2. Atualizar cliente (vencimento e status)
    const novoStatus = statusFromVencimento(vencimentoNovo, cliente.status)
    const { error: clientError } = await supabase
      .from('clientes')
      .update({ 
        vencimento: vencimentoNovo,
        status: novoStatus
      })
      .eq('id', form.cliente_id)

    setSaving(false)
    
    if (clientError) {
      alert('Pagamento registrado, mas erro ao atualizar cliente: ' + clientError.message)
    } else {
      setForm({
        cliente_id: '',
        valor: '',
        metodo: 'pix',
        duracao: '1',
        pago_em: new Date().toISOString().slice(0, 16),
      })
      load()
    }
  }

  async function handleDelete(p) {
    if (!confirm('Deseja excluir este pagamento? A renovação do cliente será desfeita.')) return
    
    setLoading(true)
    
    // 1. Restaurar vencimento do cliente
    const { error: clientError } = await supabase
      .from('clientes')
      .update({ 
        vencimento: p.vencimento_anterior,
        status: statusFromVencimento(p.vencimento_anterior, 'ativo') // Simplificado
      })
      .eq('id', p.cliente_id)
    
    if (clientError) {
      alert('Erro ao restaurar cliente: ' + clientError.message)
      setLoading(false)
      return
    }

    // 2. Deletar pagamento
    const { error: deleteError } = await supabase
      .from('pagamentos')
      .delete()
      .eq('id', p.id)
    
    if (deleteError) {
      alert('Erro ao deletar pagamento: ' + deleteError.message)
    }
    
    load()
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
          <Card title="Registrar pagamento e Renovação">
            <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
              <select
                required
                value={form.cliente_id}
                onChange={(e) => handleSelectCliente(e.target.value)}
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
                value={form.duracao}
                onChange={(e) => setForm({ ...form, duracao: e.target.value })}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              >
                <option value="1">Renovar 1 Mês</option>
                <option value="3">Renovar 3 Meses</option>
                <option value="12">Renovar 1 Ano</option>
              </select>
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
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 sm:col-span-2"
              >
                {saving ? 'Registrando…' : 'Registrar Pago e Renovar'}
              </button>
            </form>
          </Card>
        </div>
      </div>

      <Card title="Histórico de Pagamentos">
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
                  <th className="pb-2 pr-4">Data Registro</th>
                  <th className="pb-2">Ações</th>
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
                    <td className="py-2 pr-4 text-gray-300 uppercase">{p.metodo}</td>
                    <td className="py-2 pr-4 text-gray-400">
                      {new Date(p.pago_em).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => handleDelete(p)}
                        className="text-red-400 hover:text-red-300 text-xs font-semibold"
                      >
                        Excluir / Desfazer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="mt-4 text-sm text-gray-500">Nenhum pagamento encontrado.</p>
            )}
          </div>
        )}
      </Card>
    </>
  )
}

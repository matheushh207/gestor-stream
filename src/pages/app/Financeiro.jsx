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
  
  // Estado do WhatsApp
  const [zapStatus, setZapStatus] = useState('LOADING') // LOADING, OFFLINE_API, NOT_FOUND, STARTING, QR_READY, CONNECTED, DISCONNECTED
  const [zapQr, setZapQr] = useState(null)
  const [zapDestino, setZapDestino] = useState('')
  const [zapTexto, setZapTexto] = useState('Olá! Passando para avisar do seu vencimento em breve.')

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

  const API_URL = 'http://localhost:3001/api'

  async function checkZap() {
    if (!revendaId) return
    try {
      const res = await fetch(`${API_URL}/status/${revendaId}`)
      const data = await res.json()
      setZapStatus(data.status || 'NOT_FOUND')
      setZapQr(data.qr || null)
    } catch(e) {
      setZapStatus('OFFLINE_API')
    }
  }

  useEffect(() => {
    let interval;
    if (zapStatus === 'STARTING' || zapStatus === 'QR_READY') {
      interval = setInterval(checkZap, 3000)
    }
    return () => clearInterval(interval)
  }, [zapStatus, revendaId])

  useEffect(() => {
    load()
    checkZap()
  }, [revendaId])

  async function ligarZap() {
    setZapStatus('STARTING')
    try {
      await fetch(`${API_URL}/start/${revendaId}`, { method: 'POST' })
    } catch(e) {
      alert("Erro ao contatar API WhatsApp. O servidor Node está rodando na porta 3001?")
      setZapStatus('OFFLINE_API')
    }
  }

  async function desligarZap() {
    if(!confirm("Desconectar o WhatsApp de todas as sessões?")) return
    setZapStatus('LOADING')
    try {
      await fetch(`${API_URL}/logout/${revendaId}`, { method: 'DELETE' })
      setZapStatus('DISCONNECTED')
      setZapQr(null)
    } catch(e) {}
  }

  async function enviarAvisoZap(numero) {
    const destinoReal = numero || zapDestino;
    if(!destinoReal) return alert("Houve um erro com o número de destino.")
    try {
      const res = await fetch(`${API_URL}/send/${revendaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: destinoReal, texto: zapTexto })
      })
      const data = await res.json()
      if(data.success) alert("Aviso enviado via WhatsApp com sucesso!")
      else alert("Erro do WhatsApp: " + (data.error || "Desconhecido"))
    } catch(e) {
      alert("Erro de conexão com o painel do WhatsApp")
    }
  }

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
        subtitle="Pagamentos, totais e Avisos"
        onSignOut={() => navigate('/login', { replace: true })}
      />

      {/* WHATSAPP CONTAINER (SaaS API) */}
      <div className="mb-6">
        <Card title="Integração Oficial: Gestor Bot / WhatsApp">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4 border-b border-gray-800 pb-4">
              <span className={`px-3 py-1 rounded text-sm font-semibold ${
                zapStatus === 'CONNECTED' ? 'bg-emerald-900/50 text-emerald-400' : 
                zapStatus === 'OFFLINE_API' ? 'bg-red-900/50 text-red-400' :
                'bg-gray-800 text-gray-300'
              }`}>
                Status: {
                  zapStatus === 'CONNECTED' ? '✅ Conectado e Pronto' :
                  zapStatus === 'QR_READY' ? '📷 Aguardando leitura de QR Code...' :
                  zapStatus === 'STARTING' ? '⏳ Iniciando servidor Chrome...' :
                  zapStatus === 'OFFLINE_API' ? '❌ API Desligada' : '⚠️ Desconectado'
                }
              </span>
              
              {zapStatus !== 'CONNECTED' && zapStatus !== 'STARTING' && zapStatus !== 'QR_READY' && (
                <button onClick={ligarZap} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                  Ligar WhatsApp Web
                </button>
              )}
              
              {zapStatus === 'CONNECTED' && (
                <button onClick={desligarZap} className="rounded-lg bg-red-600/20 px-4 py-2 text-sm font-semibold text-red-400 border border-red-500 hover:bg-red-500 hover:text-white">
                  Deslogar Dispositivo
                </button>
              )}
            </div>

            {zapStatus === 'QR_READY' && zapQr && (
              <div className="bg-white p-2 rounded w-fit">
                <img src={zapQr} alt="QR Code WhatsApp" className="w-[200px] h-[200px]" />
              </div>
            )}

            {zapStatus === 'CONNECTED' && (
              <div className="grid gap-3 sm:grid-cols-2 mt-2">
                <input
                  type="text"
                  placeholder="Selecione um cliente lá embaixo ou digite o número (DDD) aqui"
                  value={zapDestino}
                  onChange={e => setZapDestino(e.target.value)}
                  className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
                <select
                  value={zapTexto}
                  onChange={e => setZapTexto(e.target.value)}
                  className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                >
                  <option value="Olá! Passando para avisar do seu vencimento em breve.">Alerta: Vence em Breve</option>
                  <option value="Aviso: Seu plano venceu hoje. Podemos renovar?">Alerta: Venceu Hoje</option>
                  <option value="Confirmação: Pagamento Recebido!">Pagamento Confirmado</option>
                </select>
                <div className="sm:col-span-2">
                  <button onClick={() => enviarAvisoZap()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                    Testar Disparo Rápido (Selecione Acima)
                  </button>
                </div>
              </div>
            )}
            
            {zapStatus === 'OFFLINE_API' && (
              <p className="text-sm text-red-400">
                Acesse a sua pasta local ChatBotIPTV, abra o terminal e rode: <code className="bg-black px-1 rounded">node api.js</code> para ligar o servidor MVP da revenda localmente.
              </p>
            )}
          </div>
        </Card>
      </div>

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
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => {
                            if(zapStatus !== 'CONNECTED') return alert("Conecte o Whatsapp no topo da página primeiro.")
                            // Procurando pelo numero do cliente na base local, mas como talvez nao tenha no supabase,
                            // vamos só avisar ao admin que ele precisa do campo telefone preenchido
                            const cliente = clientes.find(c => c.id === p.cliente_id)
                            setZapDestino(cliente?.telefone || '') // se o db possuir
                            alert(`Pronto para Enviar! O número do cliente ${nomeById[p.cliente_id]} ficava no preenchimento do Disparo Rápido. Se não carregou, digite manualmente. (É necessário um campo Telefone na Tabela Clientes)`)
                          }}
                          className={`${zapStatus === 'CONNECTED' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-800 text-gray-500 cursor-not-allowed'} px-2 py-1 rounded text-xs font-semibold whitespace-nowrap mb-1`}
                        >
                          Lembrar
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="text-red-400 hover:text-red-300 text-xs font-semibold whitespace-nowrap"
                        >
                          Desfazer Pago
                        </button>
                      </div>
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

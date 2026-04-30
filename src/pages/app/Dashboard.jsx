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

  // ESTADOS DO WHATSAPP
  const [zapStatus, setZapStatus] = useState('LOADING')
  const [zapQr, setZapQr] = useState(null)

  const API_URL = import.meta.env.VITE_WHATSAPP_API_URL || 'http://localhost:3001/api'

  async function checkZap() {
    if (!revendaId) return
    try {
      const res = await fetch(`${API_URL}/status/${revendaId}`)
      if (!res.ok) throw new Error("Server error");
      const data = await res.json()
      setZapStatus(data.status || 'NOT_FOUND')
      setZapQr(data.qr || null)
    } catch (e) {
      // Se estivermos no meio de um STARTING ou AUTHENTICATED, ignoramos erros de rede temporários
      // pois o Render pode estar sob alta carga de CPU durante a sincronização
      if (zapStatus !== 'STARTING' && zapStatus !== 'AUTHENTICATED') {
        setZapStatus('OFFLINE_API')
      }
    }
  }

  useEffect(() => {
    let interval;
    if (zapStatus === 'STARTING' || zapStatus === 'QR_READY' || zapStatus === 'AUTHENTICATED') {
      interval = setInterval(checkZap, 3000)
    }
    return () => clearInterval(interval)
  }, [zapStatus, revendaId])

  useEffect(() => {
    // Keep-alive: ping o servidor a cada 10 minutos para evitar que o Render durma enquanto o dashboard estiver aberto
    const keepAlive = setInterval(() => {
      fetch(`${API_URL}/ping`).catch(() => {});
    }, 10 * 60 * 1000); 
    return () => clearInterval(keepAlive);
  }, []);

  useEffect(() => {
    if (revendaId) {
      // Tenta acordar o servidor assim que o dashboard carrega
      fetch(`${API_URL}/ping`).catch(() => {});
      loadZapAndClients()
    }
  }, [revendaId])

  async function loadZapAndClients() {
    checkZap()
    load()
  }

  async function ligarZap() {
    setZapStatus('STARTING')
    try {
      await fetch(`${API_URL}/start/${revendaId}`, { method: 'POST' })
    } catch (e) {
      alert("Não foi possível alcançar o motor no Render. Ele pode estar iniciando ou o endereço está incorreto.")
      setZapStatus('OFFLINE_API')
    }
  }

  async function desligarZap() {
    if (!confirm("Desconectar o WhatsApp de todas as sessões?")) return
    setZapStatus('LOADING')
    try {
      await fetch(`${API_URL}/logout/${revendaId}`, { method: 'DELETE' })
      setZapStatus('DISCONNECTED')
      setZapQr(null)
    } catch (e) { }
  }

  function getMensagemHumanizada(nome, diasAte, tipo) {
    const pNome = (nome || '').split(' ')[0];
    
    if (tipo === 'vencido') {
      return `Oi ${pNome}, tudo bem? 😕\n\nPassando aqui para te avisar que o seu acesso acabou vencendo. Na correria do dia a dia a gente acaba esquecendo, né? Se quiser renovar agora para não ficar sem o sinal, é só me dar um alô aqui que eu já libero para você! Um abraço!`;
    }

    if (diasAte === 3) {
      return `Oi ${pNome}, tudo bem? 👋\n\nPassando rapidinho só para te avisar que o seu acesso vence daqui a 3 dias, tá bom? Se quiser já garantir a renovação e não correr o risco de esquecer, é só me chamar aqui! Tamo junto!`;
    } else if (diasAte === 2) {
      return `Oi ${pNome}, tudo bem? 🚀\n\nOlha, passando para te dar um toque que faltam apenas 2 dias para o vencimento do seu acesso. Se quiser já adiantar o PIX para deixar tudo certinho, é só mandar mensagem! Grande abraço!`;
    } else if (diasAte === 1) {
      return `Oi ${pNome}, tudo certo? ⏰\n\nAparecendo aqui para te avisar que o seu acesso vence AMANHÃ! Se puder já ir agilizando a renovação, eu já deixo tudo pronto para você não ficar sem sinal no meio de algum filme ou jogo. Valeu!`;
    } else if (diasAte === 0) {
      return `Oi ${pNome}, como você está? 🙌\n\nEstou passando para te avisar que sua assinatura vence HOJE! Assim que fizer a renovação, me envia o comprovante aqui para eu já validar no sistema e você continuar com o acesso liberado, fechou?`;
    }

    // Default fallback
    return `Olá ${pNome}! Tudo bem? Gostaria de falar sobre sua assinatura. Quando puder, me chama aqui!`;
  }

  async function notificarAutomatico(clienteAlert) {
    if (zapStatus !== 'CONNECTED') return alert("O WhatsApp de envios não está conectado!")
    if (!clienteAlert.telefone) return alert("Esse cliente não tem número de telefone cadastrado no sistema!")

    if (!confirm(`Deseja enviar uma notificação para o WhatsApp de ${clienteAlert.cliente}?`)) return;

    const textoFormatado = getMensagemHumanizada(clienteAlert.cliente, clienteAlert.dias, clienteAlert.tipo);

    try {
      const res = await fetch(`${API_URL}/send/${revendaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: clienteAlert.telefone, texto: textoFormatado })
      })
      const data = await res.json()
      if (data.success) alert(`🚀 Aviso enviado 100% no automático para o WhatsApp de ${clienteAlert.cliente}!`)
      else alert("Erro do WhatsApp: " + (data.error || "Desconhecido"))
    } catch (e) {
      alert("Erro de conexão. O servidor api.js está rodando no terminal?")
    }
  }

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
        warn.push({ cliente: c.nome, tipo: 'vencido', dias: -1, id: c.id, telefone: c.whatsapp })
      if (a === 'proximo')
        warn.push({
          cliente: c.nome,
          tipo: 'proximo',
          dias: diasAteVencimento(c.vencimento),
          id: c.id,
          telefone: c.whatsapp
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

      {/* NOVO: CARDBOX DE WHATSAPP API */}
      <div className="mb-6">
        <Card title="Motor Automático do WhatsApp (SaaS)">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4 border-b border-gray-800 pb-4">
              <span className={`px-3 py-1 rounded text-sm font-semibold ${zapStatus === 'CONNECTED' ? 'bg-emerald-900/50 text-emerald-400' :
                zapStatus === 'OFFLINE_API' ? 'bg-red-900/50 text-red-400' :
                  'bg-gray-800 text-gray-300'
                }`}>
                Status ZAP: {
                  zapStatus === 'CONNECTED' ? '✅ Conectado - Pronto para Automatizar!' :
                    zapStatus === 'QR_READY' ? '📷 Leia o QR Code abaixo com seu WhatsApp...' :
                      zapStatus === 'STARTING' ? '⏳ Iniciando servidor (pode levar até 1 minuto no Render)...' :
                        zapStatus === 'AUTHENTICATED' ? '⌛ Autenticado! Sincronizando mensagens (aguarde)...' :
                          zapStatus === 'OFFLINE_API' ? '❌ API Desligada no Servidor.' : '⚠️ Desconectado'
                }
              </span>

              {zapStatus !== 'CONNECTED' && zapStatus !== 'STARTING' && zapStatus !== 'QR_READY' && (
                <button onClick={ligarZap} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                  Ligar Automática (WhatsApp Web)
                </button>
              )}

              {zapStatus === 'CONNECTED' && (
                <button onClick={desligarZap} className="rounded-lg bg-red-600/20 px-4 py-2 text-sm font-semibold text-red-400 border border-red-500 hover:bg-red-500 hover:text-white">
                  Deslogar Dispositivo Central
                </button>
              )}
            </div>

            {zapStatus === 'QR_READY' && zapQr && (
              <div className="bg-white p-2 rounded w-fit">
                <img src={zapQr} alt="QR Code WhatsApp" className="w-[200px] h-[200px]" />
              </div>
            )}

            {zapStatus === 'OFFLINE_API' && (
              <div className="text-sm text-red-400 bg-red-900/20 p-3 rounded-lg border border-red-900/50">
                <p className="font-bold mb-1">📡 Sem conexão com o Motor (Render)</p>
                <p>O motor de mensagens no Render parece estar offline ou "dormindo".</p>
                <ul className="list-disc list-inside mt-2 text-xs opacity-80">
                  <li>Clique no botão "Ligar Automática" para tentar acordar o servidor.</li>
                  <li>Aguarde até 1 minuto para o Render iniciar o serviço gratuito.</li>
                  <li>Se persistir, verifique o status no painel do Render.</li>
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>

      {alerts.length > 0 && (
        <div className="mb-6 space-y-2 rounded-xl border border-amber-900/50 bg-amber-950/30 p-4 shadow-lg shadow-amber-900/10">
          <p className="text-sm font-semibold text-amber-200">Alertas de Vencimento</p>
          <ul className="flex flex-col gap-2">
            {alerts.map((a, i) => (
              <li key={`${a.id}-${i}`} className="flex items-center justify-between border-b border-amber-900/30 pb-2 last:border-0 last:pb-0">

                {/* LADO ESQUERDO DA NOTIFICAÇÃO */}
                <div className="text-sm text-amber-100/90 flex flex-col sm:flex-row sm:items-center sm:gap-2">
                  <strong className="text-white text-base">{a.cliente}</strong>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${a.tipo === 'vencido' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
                    {a.tipo === 'vencido' ? 'Já Vencido' : a.dias === 0 ? 'Vence Hoje' : `Vence em ${a.dias} dias`}
                  </span>
                  <span className="text-xs text-gray-500">Telefone: {a.telefone || 'Falta Cadastro'}</span>
                </div>

                {/* LADO DIREITO (BOTAO AUTOMATICO) */}
                <button
                  onClick={() => notificarAutomatico(a)}
                  disabled={!a.telefone}
                  className="bg-green-600/90 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <svg style={{ width: '15px' }} fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.471-1.761-1.643-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></svg>
                  Alertar {a.cliente}
                </button>
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

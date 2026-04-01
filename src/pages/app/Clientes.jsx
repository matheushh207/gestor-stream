import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Header from '../../components/Header'
import Card from '../../components/Card'
import {
  statusFromVencimento,
  diasAteVencimento,
  alertaVencimento,
} from '../../lib/clientes'

const statusColors = {
  ativo: 'bg-emerald-500/20 text-emerald-300',
  vencido: 'bg-red-500/20 text-red-300',
  teste: 'bg-blue-500/20 text-blue-300',
  suspenso: 'bg-gray-500/20 text-gray-300',
}

function rowAlertClass(vencimento) {
  const a = alertaVencimento(vencimento)
  if (a === 'vencido') return 'border-l-4 border-red-500'
  if (a === 'proximo') return 'border-l-4 border-amber-500'
  return ''
}

export default function Clientes() {
  const { navigate, revendaId } = useOutletContext()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    nome: '',
    whatsapp: '',
    usuario: '',
    senha: '',
    plano: '',
    valor: '',
    vencimento: '',
    status: 'ativo',
  })

  async function load() {
    if (!revendaId) return
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('revenda_id', revendaId)
      .order('nome')
    const rows = data ?? []
    for (const c of rows) {
      const derived = statusFromVencimento(c.vencimento, c.status)
      if (derived !== c.status) {
        await supabase.from('clientes').update({ status: derived }).eq('id', c.id)
        c.status = derived
      }
    }
    setList(rows)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [revendaId])

  const filtered = useMemo(() => {
    return list.filter((c) => {
      const derived = statusFromVencimento(c.vencimento, c.status)
      const matchQ =
        !q.trim() ||
        c.nome.toLowerCase().includes(q.toLowerCase()) ||
        (c.usuario || '').toLowerCase().includes(q.toLowerCase()) ||
        (c.whatsapp || '').includes(q)
      const matchS =
        filtroStatus === 'todos' || derived === filtroStatus
      return matchQ && matchS
    })
  }, [list, q, filtroStatus])

  function openNew() {
    setEditing(null)
    setForm({
      nome: '',
      whatsapp: '',
      usuario: '',
      senha: '',
      plano: '',
      valor: '',
      vencimento: '',
      status: 'ativo',
    })
  }

  function openEdit(c) {
    setEditing(c.id)
    setForm({
      nome: c.nome,
      whatsapp: c.whatsapp || '',
      usuario: c.usuario || '',
      senha: c.senha || '',
      plano: c.plano || '',
      valor: String(c.valor ?? ''),
      vencimento: c.vencimento || '',
      status: c.status,
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!revendaId) return
    setSaving(true)
    const payload = {
      revenda_id: revendaId,
      nome: form.nome.trim(),
      whatsapp: form.whatsapp.trim() || null,
      usuario: form.usuario.trim() || null,
      senha: form.senha || null,
      plano: form.plano.trim() || null,
      valor: form.valor === '' ? 0 : Number(form.valor),
      vencimento: form.vencimento || null,
      status: statusFromVencimento(
        form.vencimento || null,
        form.status,
      ),
    }
    if (editing) {
      const { error } = await supabase.from('clientes').update(payload).eq('id', editing)
      if (error) alert(error.message)
    } else {
      const { error } = await supabase.from('clientes').insert(payload)
      if (error) alert(error.message)
    }
    setSaving(false)
    if (editing) setEditing(null)
    setForm({
      nome: '',
      whatsapp: '',
      usuario: '',
      senha: '',
      plano: '',
      valor: '',
      vencimento: '',
      status: 'ativo',
    })
    load()
  }

  async function remove(id) {
    if (!confirm('Excluir este cliente?')) return
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  const alerts = useMemo(() => {
    const out = []
    for (const c of list) {
      const a = alertaVencimento(c.vencimento)
      if (a === 'vencido')
        out.push({ id: c.id, nome: c.nome, tipo: 'vencido' })
      if (a === 'proximo')
        out.push({
          id: c.id,
          nome: c.nome,
          tipo: 'proximo',
          dias: diasAteVencimento(c.vencimento),
        })
    }
    return out
  }, [list])

  function renderVencimento(c) {
    if (!c.vencimento) return <span className="text-gray-500">—</span>;
    const dias = diasAteVencimento(c.vencimento);
    const dateStr = new Date(c.vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    if (dias === null) return <span className="text-gray-500">{dateStr}</span>;
    
    let badge = null;
    if (dias < 0) {
      badge = <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-400">Vencido</span>;
    } else if (dias === 0) {
      badge = <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400">Hj</span>;
    } else if (dias <= 3) {
      badge = <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400">{dias} dias</span>;
    } else {
      badge = <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400">{dias} dias</span>;
    }
    
    return (
      <div className="flex items-center">
        <span>{dateStr}</span>
        {badge}
      </div>
    );
  }

  return (
    <>
      <Header
        title="Clientes"
        subtitle="Gerencie seus clientes IPTV"
        onSignOut={() => navigate('/login', { replace: true })}
      />

      {alerts.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-900/50 bg-amber-950/30 p-4">
          <p className="text-sm font-semibold text-amber-200">Alertas de vencimento</p>
          <ul className="mt-2 list-inside list-disc text-sm text-amber-100/90">
            {alerts.map((a, i) => (
              <li key={`${a.id}-${i}`}>
                {a.tipo === 'vencido' && (
                  <span>
                    <strong>{a.nome}</strong> — vencido
                  </span>
                )}
                {a.tipo === 'proximo' && (
                  <span>
                    <strong>{a.nome}</strong> — vence em {a.dias} dia(s)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-gray-500">Buscar</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, usuário ou WhatsApp"
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Status</label>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          >
            <option value="todos">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="vencido">Vencido</option>
            <option value="teste">Teste</option>
            <option value="suspenso">Suspenso</option>
          </select>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Novo cliente
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={editing ? 'Editar cliente' : 'Novo cliente'}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              required
              placeholder="Nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <input
              placeholder="WhatsApp"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <input
              placeholder="Usuário IPTV"
              value={form.usuario}
              onChange={(e) => setForm({ ...form, usuario: e.target.value })}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <input
              placeholder="Senha IPTV"
              type="password"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <input
              placeholder="Plano"
              value={form.plano}
              onChange={(e) => setForm({ ...form, plano: e.target.value })}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <input
              placeholder="Valor"
              type="number"
              step="0.01"
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <label className="text-xs text-gray-500">Data de Vencimento</label>
            <input
              type="date"
              value={form.vencimento}
              onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            >
              <option value="ativo">Ativo</option>
              <option value="vencido">Vencido</option>
              <option value="teste">Teste</option>
              <option value="suspenso">Suspenso</option>
            </select>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {editing ? 'Salvar' : 'Criar'}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={openNew}
                  className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300"
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </form>
        </Card>

        <Card title="Lista">
          {loading ? (
            <p className="text-gray-400">Carregando…</p>
          ) : (
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="pb-2 pr-2">Nome</th>
                    <th className="pb-2 pr-2">Venc.</th>
                    <th className="pb-2 pr-2">Status</th>
                    <th className="pb-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const derived = statusFromVencimento(c.vencimento, c.status)
                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-gray-800 transition-colors hover:bg-gray-800/40 ${rowAlertClass(c.vencimento)}`}
                      >
                        <td className="py-3 pr-2 font-medium text-white">{c.nome}</td>
                        <td className="py-3 pr-2 text-gray-400 whitespace-nowrap">
                          {renderVencimento(c)}
                        </td>
                        <td className="py-3 pr-2">
                          <span
                            className={`rounded px-2 flex w-max py-0.5 text-xs font-semibold uppercase ${statusColors[derived] || statusColors.ativo}`}
                          >
                            {derived}
                          </span>
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="mr-2 text-indigo-400 hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(c.id)}
                            className="text-red-400 hover:underline"
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

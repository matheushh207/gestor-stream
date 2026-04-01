import { useEffect, useState, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { createClient } from '@supabase/supabase-js'
import Header from '../../components/Header'
import Card from '../../components/Card'
import { diasAteVencimento, alertaVencimento } from '../../lib/clientes'

export default function AdminRevendas() {
  const { navigate } = useOutletContext()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [status, setStatus] = useState('ativo')
  const [saving, setSaving] = useState(false)
  const [linkRevendaId, setLinkRevendaId] = useState('')
  const [linkEmail, setLinkEmail] = useState('')
  const [linkMsg, setLinkMsg] = useState('')

  async function load() {
    const { data, error } = await supabase
      .from('revendas')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setList(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!senha || senha.length < 6) {
      alert('A senha deve ter no mínimo 6 caracteres.')
      return
    }
    setSaving(true)

    // 1. Criar usuário no Auth (sem deslogar o Admin)
    const url = import.meta.env.VITE_SUPABASE_URL || 'https://qghdhewbssfatxmhnwng.supabase.co'
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_sAzqFHv2ZeeLZNVjc0BGAQ_-X-kDWn3'
    const adminAuthClient = createClient(url, key, { 
      auth: { autoRefreshToken: false, persistSession: false } 
    })

    const { data: authData, error: authErr } = await adminAuthClient.auth.signUp({
      email: email.trim(),
      password: senha
    })

    if (authErr) {
      setSaving(false)
      alert('Erro ao criar login: ' + authErr.message)
      return
    }

    // 2. Salvar Revenda no Banco
    const { data: revendaData, error: revendaErr } = await supabase.from('revendas').insert({
      nome: nome.trim(),
      email: email.trim(),
      vencimento: vencimento || null,
      status,
    }).select().single()

    if (revendaErr) {
      setSaving(false)
      alert(revendaErr.message)
      return
    }

    // 3. Vincular usuário recém-criado à revenda
    const { error: linkErr } = await supabase.rpc('admin_link_revenda_user', {
      p_revenda_id: revendaData.id,
      p_email: email.trim(),
    })
    
    setSaving(false)
    if (linkErr) {
      alert('Erro ao vincular permissões: ' + linkErr.message)
      return
    }

    setNome('')
    setEmail('')
    setSenha('')
    setVencimento('')
    setStatus('ativo')
    alert('Revenda criada e login gerado com sucesso!')
    load()
  }

  async function toggleStatus(row, next) {
    const { error } = await supabase
      .from('revendas')
      .update({ status: next })
      .eq('id', row.id)
    if (error) alert(error.message)
    else load()
  }

  async function remove(id) {
    if (!confirm('Deseja realmente excluir esta revenda? Esta ação apagará todos os clientes vinculados a ela!')) return
    const { error } = await supabase.from('revendas').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  async function handleLinkUser(e) {
    e.preventDefault()
    setLinkMsg('')
    if (!linkRevendaId || !linkEmail.trim()) {
      setLinkMsg('Selecione a revenda e informe o e-mail.')
      return
    }
    const { error } = await supabase.rpc('admin_link_revenda_user', {
      p_revenda_id: linkRevendaId,
      p_email: linkEmail.trim(),
    })
    if (error) setLinkMsg(error.message)
    else {
      setLinkMsg('Usuário vinculado com sucesso.')
      setLinkEmail('')
    }
  }

  const alerts = useMemo(() => {
    const out = []
    for (const r of list) {
      if (r.status !== 'ativo') continue
      const a = alertaVencimento(r.vencimento)
      if (a === 'vencido') {
        out.push({ id: r.id, nome: r.nome, tipo: 'vencido' })
      }
      if (a === 'proximo') {
        out.push({
          id: r.id,
          nome: r.nome,
          tipo: 'proximo',
          dias: diasAteVencimento(r.vencimento),
        })
      }
    }
    return out
  }, [list])

  return (
    <>
      <Header
        title="Revendas"
        subtitle="Criar, bloquear e vincular usuários"
        onSignOut={() => navigate('/login', { replace: true })}
      />

      {alerts.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-900/50 bg-amber-950/30 p-4">
          <p className="text-sm font-semibold text-amber-200">Alertas de vencimento (Revendas Ativas)</p>
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

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card title="Nova revenda">
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              placeholder="Nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <input
              type="email"
              placeholder="E-mail de contato"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <input
              type="text"
              placeholder="Senha para a revenda acessar"
              required
              minLength={6}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <label className="text-xs text-gray-500">Data de Vencimento</label>
            <input
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <label className="text-xs text-gray-500 mt-2 block">Status Inicial</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            >
              <option value="ativo">Ativo</option>
              <option value="bloqueado">Bloqueado</option>
            </select>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Criar revenda'}
            </button>
          </form>
        </Card>

        <Card title="Vincular usuário à revenda">
          <p className="mb-3 text-xs text-gray-500">
            Crie o usuário em Supabase → Authentication → Users (e-mail/senha). Depois
            vincule o e-mail aqui.
          </p>
          <form onSubmit={handleLinkUser} className="space-y-3">
            <select
              value={linkRevendaId}
              onChange={(e) => setLinkRevendaId(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              required
            >
              <option value="">Revenda…</option>
              {list.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
            <input
              type="email"
              placeholder="E-mail do usuário (já cadastrado no Auth)"
              value={linkEmail}
              onChange={(e) => setLinkEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Vincular
            </button>
            {linkMsg && <p className="text-sm text-gray-400">{linkMsg}</p>}
          </form>
        </Card>
      </div>

      <Card title="Lista de revendas">
        {loading ? (
          <p className="text-gray-400">Carregando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="pb-2 pr-4">Nome</th>
                  <th className="pb-2 pr-4">E-mail</th>
                  <th className="pb-2 pr-4">Vencimento</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-gray-800">
                    <td className="py-3 pr-4 text-white">{r.nome}</td>
                    <td className="py-3 pr-4 text-gray-300">{r.email}</td>
                    <td className="py-3 pr-4 text-gray-400">{r.vencimento ? new Date(r.vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          r.status === 'ativo'
                            ? 'text-emerald-400'
                            : 'text-red-400'
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3">
                      {r.status === 'ativo' ? (
                        <button
                          type="button"
                          onClick={() => toggleStatus(r, 'bloqueado')}
                          className="text-sm text-amber-400 hover:underline mr-4"
                        >
                          Bloquear
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleStatus(r, 'ativo')}
                          className="text-sm text-emerald-400 hover:underline mr-4"
                        >
                          Ativar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        className="text-sm text-red-500 hover:underline"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getUserRole } from '../lib/auth'

function parseHashErrors() {
  const raw = window.location.hash?.replace(/^#/, '') ?? ''
  if (!raw.includes('error=')) return null
  const params = new URLSearchParams(raw)
  const code = params.get('error_code')
  const desc = params.get('error_description')
  let msg = desc
    ? decodeURIComponent(desc.replace(/\+/g, ' '))
    : 'Erro ao confirmar o e-mail.'
  if (code === 'otp_expired') {
    msg =
      'O link de confirmação expirou ou já foi usado. Desative “Confirm email” no Supabase (dev) ou peça novo e-mail em Authentication → Users.'
  }
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search,
  )
  return msg
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const hashErr = parseHashErrors()
    if (hashErr) setError(hashErr)
  }, [])
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (err) throw err
      const { error: bootErr } = await supabase.rpc('bootstrap_platform_admin')
      if (bootErr) {
        setError(bootErr.message || 'Não foi possível preparar o acesso.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }
      const ctx = await getUserRole()
      if (!ctx) {
        setError(
          'Usuário sem perfil. Revendas precisam ser vinculadas pelo admin.',
        )
        await supabase.auth.signOut()
        setLoading(false)
        return
      }
      if (ctx.role === 'revenda' && ctx.revendaId) {
        const { data: rev } = await supabase
          .from('revendas')
          .select('status')
          .eq('id', ctx.revendaId)
          .maybeSingle()
        if (rev?.status === 'bloqueado') {
          setError('Sua revenda está bloqueada.')
          await supabase.auth.signOut()
          setLoading(false)
          return
        }
      }
      if (ctx.role === 'admin') {
        navigate(from && from.startsWith('/admin') ? from : '/admin/dashboard', {
          replace: true,
        })
      } else {
        navigate(from && from.startsWith('/app') ? from : '/app/dashboard', {
          replace: true,
        })
      }
    } catch (err) {
      setError(err.message || 'Falha no login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-800/40 p-8 shadow-xl">
        <h1 className="text-center text-2xl font-bold text-white">Gestor IPTV</h1>
        <p className="mt-2 text-center text-sm text-gray-400">Entre com sua conta</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-400">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Header from '../../components/Header'
import Card from '../../components/Card'

export default function Configuracoes() {
  const { navigate } = useOutletContext()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ text: '', type: '' })

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg({ text: '', type: '' })

    if (senha.length < 6) {
      setMsg({ text: 'A senha deve ter pelo menos 6 caracteres.', type: 'error' })
      return
    }

    if (senha !== confirmar) {
      setMsg({ text: 'As senhas não coincidem.', type: 'error' })
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSaving(false)

    if (error) {
      setMsg({ text: error.message, type: 'error' })
    } else {
      setMsg({ text: 'Senha atualizada com sucesso!', type: 'success' })
      setSenha('')
      setConfirmar('')
    }
  }

  return (
    <>
      <Header
        title="Configurações"
        subtitle="Gerencie as configurações da sua conta de revenda"
        onSignOut={() => navigate('/login', { replace: true })}
      />

      <div className="max-w-md">
        <Card title="Alterar Senha">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-400">Nova Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                placeholder="No mínimo 6 caracteres"
              />
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-400">Confirmar Nova Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                placeholder="Repita a nova senha"
              />
            </div>

            {msg.text && (
              <div className={`rounded p-3 text-sm ${msg.type === 'error' ? 'bg-red-900/50 text-red-200' : 'bg-emerald-900/50 text-emerald-200'}`}>
                {msg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? 'Atualizando...' : 'Atualizar Senha'}
            </button>
          </form>
        </Card>
      </div>
    </>
  )
}

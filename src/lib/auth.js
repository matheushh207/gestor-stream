import { supabase } from './supabase'

export async function getSessionUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

export async function getUserRole() {
  const user = await getSessionUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('user_revenda')
    .select('role, revenda_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error || !data) return null
  return { role: data.role, revendaId: data.revenda_id }
}

export async function getRevendaId() {
  const ctx = await getUserRole()
  if (!ctx || ctx.role !== 'revenda') return null
  return ctx.revendaId
}

export async function signOut() {
  await supabase.auth.signOut()
}

/** Status derivado do vencimento (UI + persistência opcional). */
export function statusFromVencimento(vencimento, statusManual) {
  if (!vencimento) return statusManual || 'teste'
  
  // Parse manually to avoid UTC shift
  const [year, month, day] = vencimento.split('-').map(Number)
  const v = new Date(year, month - 1, day)
  if (Number.isNaN(v.getTime())) return statusManual || 'teste'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  v.setHours(0, 0, 0, 0)

  if (statusManual === 'suspenso') return 'suspenso'
  if (v < today) return 'vencido'
  return statusManual || 'ativo'
}

export function diasAteVencimento(vencimento) {
  if (!vencimento) return null
  
  const [year, month, day] = vencimento.split('-').map(Number)
  const v = new Date(year, month - 1, day)
  if (Number.isNaN(v.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  v.setHours(0, 0, 0, 0)

  const diffTime = v - today
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

export function alertaVencimento(vencimento) {
  const dias = diasAteVencimento(vencimento)
  if (dias === null) return null
  if (dias < 0) return 'vencido'
  if (dias <= 3) return 'proximo'
  return null
}

export function calcularNovaDataVencimento(dataAtual, meses) {
  let base = new Date()
  if (dataAtual) {
    const [year, month, day] = dataAtual.split('-').map(Number)
    const d = new Date(year, month - 1, day)
    if (!Number.isNaN(d.getTime())) {
      base = d
    }
  }

  const nova = new Date(base)
  // Adiciona os meses
  nova.setMonth(nova.getMonth() + meses)

  // Retorna formato YYYY-MM-DD local
  const y = nova.getFullYear()
  const m = String(nova.getMonth() + 1).padStart(2, '0')
  const d = String(nova.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

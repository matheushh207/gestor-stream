/** Status derivado do vencimento (UI + persistência opcional). */
export function statusFromVencimento(vencimento, statusManual) {
  if (!vencimento) return statusManual || 'teste'
  const d = new Date(vencimento)
  if (Number.isNaN(d.getTime())) return statusManual || 'teste'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const v = new Date(d)
  v.setHours(0, 0, 0, 0)
  if (v < today) return 'vencido'
  if (statusManual === 'suspenso' || statusManual === 'teste') return statusManual
  return 'ativo'
}

export function diasAteVencimento(vencimento) {
  if (!vencimento) return null
  const d = new Date(vencimento)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const v = new Date(d)
  v.setHours(0, 0, 0, 0)
  return Math.ceil((v - today) / (1000 * 60 * 60 * 24))
}

export function alertaVencimento(vencimento) {
  const dias = diasAteVencimento(vencimento)
  if (dias === null) return null
  if (dias < 0) return 'vencido'
  if (dias <= 3) return 'proximo'
  return null
}

import type { Relation } from '../types'

// Inclusive calendar duration of the recorded interval; this is not credited contribution time.
export function relationDuration(relation: Relation): string {
  const start = relation.start
  const end = relation.end || relation.lastRemuneration
  if (!start || !end) return 'Sem datas suficientes'
  const parse = (value: string) => {
    const parts = value.split('/').map(Number)
    const [day, month, year] = parts.length === 3 ? parts : [1, ...parts]
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : undefined
  }
  const from = parse(start); const to = parse(end)
  if (!from || !to) return 'Período inválido'
  if (start.split('/').length !== 3 || end.split('/').length !== 3) {
    const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1
    if (months <= 0) return 'Período inválido'
    const years = Math.floor(months / 12); const rest = months % 12
    return [years ? `${years} ${years === 1 ? 'ano' : 'anos'}` : '', rest ? `${rest} ${rest === 1 ? 'mês' : 'meses'}` : ''].filter(Boolean).join(' e ') + ' (por competências)'
  }
  if (to < from) return 'Período inválido'
  const exclusiveEnd = new Date(to.getTime() + 86400000)
  const atMonth = (months: number) => {
    const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1))
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(from.getUTCDate(), lastDay))
    return date
  }
  let months = (exclusiveEnd.getUTCFullYear() - from.getUTCFullYear()) * 12 + exclusiveEnd.getUTCMonth() - from.getUTCMonth()
  if (atMonth(months) > exclusiveEnd) months--
  const days = Math.round((exclusiveEnd.getTime() - atMonth(months).getTime()) / 86400000)
  const years = Math.floor(months / 12); const rest = months % 12
  return [years ? `${years} ${years === 1 ? 'ano' : 'anos'}` : '', rest ? `${rest} ${rest === 1 ? 'mês' : 'meses'}` : '', days ? `${days} ${days === 1 ? 'dia' : 'dias'}` : ''].filter(Boolean).join(' e ') || '0 dias'
}

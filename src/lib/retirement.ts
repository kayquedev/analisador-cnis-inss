import type { CnisAnalysis, Relation } from '../types'

export type RetirementSex = 'female' | 'male'

export interface RetirementRuleResult {
  id: 'points' | 'progressive-age' | 'age' | 'contribution-time'
  title: string
  current: string
  required: string
  progress: number
  status: 'eligible' | 'pending' | 'review'
  statusText: string
  detail: string
}

export interface RetirementSnapshot {
  ageMonths: number
  contributionMonths: number
  contributionAtReformMonths: number
  points: number
  rules: RetirementRuleResult[]
  referenceDate: Date
}

const toMonthIndex = (value: string) => {
  const parts = value.split('/').map(Number)
  return parts.length === 3 ? parts[2] * 12 + parts[1] - 1 : parts[1] * 12 + parts[0] - 1
}

export const calculateAgeMonths = (birthDate: string | undefined, referenceDate = new Date()) => {
  if (!birthDate) return 0
  const [day, month, year] = birthDate.split('/').map(Number)
  let months = (referenceDate.getFullYear() - year) * 12 + referenceDate.getMonth() - (month - 1)
  if (referenceDate.getDate() < day) months -= 1
  return Math.max(0, months)
}

const countUnionMonthsUntil = (relations: Relation[], cutoff: string) => {
  const cutoffIndex = toMonthIndex(cutoff)
  const months = new Set<number>()
  for (const relation of relations.filter(item => item.kind !== 'benefit')) {
    if (!relation.start) continue
    const start = toMonthIndex(relation.start)
    const end = Math.min(toMonthIndex(relation.end ?? relation.lastRemuneration ?? relation.start), cutoffIndex)
    for (let month = start; month <= end; month++) months.add(month)
  }
  return months.size
}

export const formatDuration = (months: number) => {
  const safeMonths = Math.max(0, Math.round(months))
  const years = Math.floor(safeMonths / 12)
  const rest = safeMonths % 12
  if (!years) return `${rest} ${rest === 1 ? 'mês' : 'meses'}`
  return `${years} ${years === 1 ? 'ano' : 'anos'}${rest ? ` e ${rest} ${rest === 1 ? 'mês' : 'meses'}` : ''}`
}

const progress = (current: number, required: number) => Math.min(100, Math.max(0, (current / required) * 100))
const formatPoints = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const calculateRetirement = (
  analysis: CnisAnalysis,
  sex: RetirementSex,
  referenceDate = new Date(),
): RetirementSnapshot => {
  const ageMonths = calculateAgeMonths(analysis.person.birthDate, referenceDate)
  const contributionMonths = analysis.validPotentialMonths
  const contributionAtReformMonths = countUnionMonthsUntil(analysis.relations, '11/2019')
  const year = referenceDate.getFullYear()
  const isFemale = sex === 'female'
  const requiredContributionMonths = (isFemale ? 30 : 35) * 12
  const requiredPoints = Math.min(isFemale ? 100 : 105, (isFemale ? 86 : 96) + Math.max(0, year - 2019))
  const points = Number(((ageMonths + contributionMonths) / 12).toFixed(1))
  const progressiveAgeMonths = Math.min((isFemale ? 62 : 65) * 12, (isFemale ? 56 : 61) * 12 + Math.max(0, year - 2019) * 6)
  const permanentAgeMonths = (isFemale ? 62 : 65) * 12
  const firstAffiliation = analysis.relations.filter(item => item.kind !== 'benefit' && item.start).map(item => toMonthIndex(item.start!)).sort((a, b) => a - b)[0]
  const preReformAffiliate = firstAffiliation !== undefined && firstAffiliation <= toMonthIndex('11/2019')
  const ageRuleContributionMonths = (isFemale || preReformAffiliate ? 15 : 20) * 12

  const timeMet = contributionMonths >= requiredContributionMonths
  const pointsMet = points >= requiredPoints
  const progressiveAgeMet = ageMonths >= progressiveAgeMonths
  const permanentAgeMet = ageMonths >= permanentAgeMonths
  const ageContributionMet = contributionMonths >= ageRuleContributionMonths
  const acquiredRight = contributionAtReformMonths >= requiredContributionMonths
  const remainingRequirements = (requiredAge: number, requiredTime: number) => {
    const missing = [ageMonths < requiredAge ? `${formatDuration(requiredAge - ageMonths)} de idade` : '', contributionMonths < requiredTime ? `${formatDuration(requiredTime - contributionMonths)} de contribuição` : ''].filter(Boolean)
    return missing.length ? `Faltam ${missing.join(' e ')}` : 'Requisitos calculados atingidos; conferir carência'
  }
  const pointsStatusText = pointsMet && timeMet
    ? 'Requisitos potenciais atingidos'
    : !pointsMet && !timeMet
      ? `Faltam ${formatPoints(requiredPoints - points)} pontos e ${formatDuration(requiredContributionMonths - contributionMonths)} de contribuição`
      : !pointsMet
        ? `Faltam ${formatPoints(requiredPoints - points)} pontos`
        : `Faltam ${formatDuration(requiredContributionMonths - contributionMonths)} de contribuição`

  const rules: RetirementRuleResult[] = [
    {
      id: 'points', title: 'Regra dos pontos', current: `${formatPoints(points)} pontos`, required: `${requiredPoints} pontos + ${isFemale ? 30 : 35} anos`,
      progress: progress(points, requiredPoints), status: pointsMet && timeMet ? 'eligible' : 'pending',
      statusText: pointsStatusText,
      detail: `Pontuação estimada pela soma da idade e do tempo calculado em ${year}. A apuração oficial é feita em dias.`,
    },
    {
      id: 'progressive-age', title: 'Idade mínima progressiva', current: formatDuration(ageMonths), required: `${formatDuration(progressiveAgeMonths)} + ${isFemale ? 30 : 35} anos`,
      progress: progress(Math.min(ageMonths / progressiveAgeMonths, contributionMonths / requiredContributionMonths), 1),
      status: progressiveAgeMet && timeMet ? 'eligible' : 'pending',
      statusText: remainingRequirements(progressiveAgeMonths, requiredContributionMonths),
      detail: `Regra de transição com idade crescente em seis meses por ano, limitada a 62/65 anos.`,
    },
    {
      id: 'age', title: 'Aposentadoria por idade', current: formatDuration(ageMonths), required: `${formatDuration(permanentAgeMonths)} + ${formatDuration(ageRuleContributionMonths)}`,
      progress: progress(Math.min(ageMonths / permanentAgeMonths, contributionMonths / ageRuleContributionMonths), 1),
      status: permanentAgeMet && ageContributionMet ? 'eligible' : 'pending',
      statusText: remainingRequirements(permanentAgeMonths, ageRuleContributionMonths),
      detail: preReformAffiliate ? 'Cenário para pessoa filiada antes da EC 103/2019: carência/tempo mínimo estimado em 15 anos.' : `Filiação posterior à reforma: cenário de ${isFemale ? 15 : 20} anos de contribuição.`,
    },
    {
      id: 'contribution-time', title: 'Tempo de contribuição', current: formatDuration(contributionMonths), required: `${isFemale ? 30 : 35} anos`,
      progress: progress(contributionMonths, requiredContributionMonths), status: acquiredRight ? 'review' : timeMet ? 'eligible' : 'pending',
      statusText: acquiredRight ? 'Possível direito adquirido até a reforma' : timeMet ? 'Tempo-base potencial atingido' : `Faltam ${formatDuration(requiredContributionMonths - contributionMonths)}`,
      detail: `Até 13/11/2019 foram estimados ${formatDuration(contributionAtReformMonths)}. Após a reforma, o tempo isolado não basta: ele integra regras de transição.`,
    },
  ]

  return { ageMonths, contributionMonths, contributionAtReformMonths, points, rules, referenceDate }
}

import type { CnisAnalysis, Competency, Finding, Gap, Person, Relation, Severity } from '../types'

const INDICATOR_INFO: Record<string, { severity: Severity; title: string; description: string; action: string }> = {
  'PSC-MEN-SM-EC103': { severity: 'critical', title: 'Remuneração consolidada abaixo do mínimo', description: 'A competência possui soma inferior ao salário mínimo após a EC 103/2019 e pode não contar para carência e tempo até ser ajustada.', action: 'Verificar no Meu INSS as opções de complementação, utilização de excedente ou agrupamento dentro do mesmo ano civil.' },
  'PREC-MENOR-MIN': { severity: 'critical', title: 'Recolhimento inferior ao mínimo', description: 'O CNIS sinaliza contribuição abaixo do piso exigido para a categoria.', action: 'Calcular e recolher a complementação aplicável antes do requerimento do benefício.' },
  'IREM-INDPEND': { severity: 'attention', title: 'Remunerações com pendência', description: 'Há remunerações marcadas pelo INSS para validação ou tratamento.', action: 'Conferir contracheques, CTPS, rescisão, FGTS e declarações do empregador para o período.' },
  'IREC-INDPEND': { severity: 'attention', title: 'Recolhimentos com pendência', description: 'Um ou mais recolhimentos possuem indicador que merece conferência.', action: 'Conferir GPS/DAS, comprovantes bancários e a categoria utilizada no recolhimento.' },
  PEXT: { severity: 'critical', title: 'Vínculo extemporâneo pendente', description: 'O vínculo foi informado fora do prazo e pode depender de comprovação.', action: 'Separar documentos contemporâneos ao trabalho e solicitar acerto do CNIS.' },
  'AEXT-VT': { severity: 'info', title: 'Vínculo extemporâneo confirmado', description: 'O extrato indica que o INSS já confirmou o vínculo extemporâneo.', action: 'Guardar os documentos do vínculo e conferir se datas e remunerações estão completas.' },
  'IVIN-JORN-DIFERENCIADA': { severity: 'info', title: 'Jornada diferenciada', description: 'O vínculo possui regime de jornada diferenciada; remunerações menores podem refletir trabalho parcial.', action: 'Conferir contrato e jornada, principalmente nas competências abaixo do mínimo.' },
  'IREC-MEI': { severity: 'info', title: 'Contribuição como MEI', description: 'Recolhimento efetuado na modalidade MEI.', action: 'Para aposentadoria por tempo ou CTC, avaliar se há necessidade de complementação do plano.' },
  'IREC-LC123': { severity: 'info', title: 'Plano simplificado', description: 'Recolhimento efetuado no plano simplificado previsto na LC 123/2006.', action: 'Confirmar se a modalidade atende ao benefício pretendido.' },
}

const minimumWage = (month: string): number => {
  const [m, y] = month.split('/').map(Number)
  if (y === 2019) return 998
  if (y === 2020) return m === 1 ? 1039 : 1045
  if (y === 2021) return 1100
  if (y === 2022) return 1212
  if (y === 2023) return m < 5 ? 1302 : 1320
  if (y === 2024) return 1412
  if (y === 2025) return 1518
  if (y === 2026) return 1621
  return 0
}

const money = (value: string) => Number(value.replace(/\./g, '').replace(',', '.'))
const unique = <T,>(items: T[]) => [...new Set(items)]
const normalize = (text: string) => text.normalize('NFC').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim()
const toMonthIndex = (value: string) => { const parts = value.split('/').map(Number); return parts.length === 3 ? parts[2] * 12 + parts[1] - 1 : parts[1] * 12 + parts[0] - 1 }
const fromMonthIndex = (value: number) => `${String((value % 12) + 1).padStart(2, '0')}/${Math.floor(value / 12)}`
const monthStart = (value?: string) => value ? toMonthIndex(value) : undefined

const extractIndicators = (text: string) => unique([...text.matchAll(/\b(?:AEXT|I(?:REC|REM|VIN)|P(?:REC|SC|EXT))[A-Z0-9-]*\b/g)].map(match => match[0]).filter(code => code.length > 3))

const extractPerson = (text: string): Person => ({
  nit: text.match(/NIT:\s*([\d.-]+)/i)?.[1], cpf: text.match(/CPF:\s*([\d.-]+)/i)?.[1],
  name: text.match(/Nome:\s*(.+?)(?=\s+Data de nascimento:|\n)/i)?.[1]?.trim(),
  birthDate: text.match(/Data de nascimento:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1],
  generatedAt: text.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/)?.slice(1).join(' '),
})

const relationFromLine = (line: string): Relation | null => {
  const match = line.match(/^(\d+)\s+(.+)$/)
  if (!match) return null
  const id = Number(match[1]); const rest = match[2]
  const nit = rest.match(/\d{3}\.\d{5}\.\d{2}-\d/)?.[0]
  const body = rest.replace(/^\d{3}\.\d{5}\.\d{2}-\d\s+/, '')
  const categoryMatch = body.match(/(Empregado ou Agente(?:\s+Público)?|Contribuinte Individual|Empregado Doméstico|Segurado Especial|Trabalhador Avulso|Facultativo)/i)
  if (!categoryMatch) return null
  const category = categoryMatch[1]
  const fullDates = [...rest.matchAll(/\d{2}\/\d{2}\/\d{4}/g)].map(x => x[0])
  const monthDate = rest.match(/(?<!\/)\b\d{2}\/\d{4}\b/)?.[0]
  const employerCode = body.match(/^\d{2}\.\d{3}\.\d{3}(?:\/\d{4}-\d{2})?/)?.[0]
  let origin = 'Vínculo não identificado'
  if (/\bRECOLHIMENTO\b/i.test(rest)) origin = 'RECOLHIMENTO'
  else if (categoryMatch.index !== undefined) origin = body.slice(employerCode?.length ?? 0, categoryMatch.index).trim().replace(/\s+[A-Z0-9]*\d[A-Z0-9]*$/, '').trim()
  return { id, kind: origin === 'RECOLHIMENTO' ? 'contribution' : 'employment', nit, employerCode, origin, category, start: fullDates[0], end: fullDates[1], lastRemuneration: monthDate, indicators: extractIndicators(rest), competencies: [] }
}

const benefitFromLine = (line: string): Relation | null => {
  const match = line.match(/^(\d+)\s+(\d{10})\s+(.+)$/)
  if (!match || !/\bBenef[ií]cio\b/i.test(line)) return null
  const dates = [...line.matchAll(/\d{2}\/\d{2}\/\d{4}/g)]
  if (dates.length < 2) return null
  const firstDateIndex = dates[0].index ?? 0
  const secondDateEnd = (dates[1].index ?? 0) + dates[1][0].length
  const nit = line.match(/\d{3}\.\d{5}\.\d{2}-\d/)?.[0]
  const statusEnd = nit ? line.lastIndexOf(nit) : line.toLowerCase().lastIndexOf('benefício')
  return {
    id: Number(match[1]), kind: 'benefit', nit, origin: 'Benefício', category: 'Benefício previdenciário',
    start: dates[0][0], end: dates[1][0], benefitNumber: match[2],
    benefitSpecies: line.slice(line.indexOf(match[2]) + match[2].length, firstDateIndex).trim(),
    status: line.slice(secondDateEnd, statusEnd).trim(), indicators: [], competencies: [],
  }
}

const parseDocument = (rawText: string) => {
  const relevant = rawText.split(/Valores Consolidados por Ano Civil/i)[0]
  const lines = relevant.split('\n').map(normalize).filter(Boolean)
  const relations: Relation[] = []; let current: Relation | undefined; let mode: 'remuneration' | 'contribution' = 'remuneration'
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    let candidate = line
    let consumed = 0
    if (/^\d+\s+(?:\d{2}\.\d{3}\.\d{3}|(?:Empregado|Contribuinte|Facultativo|Segurado|Trabalhador))/i.test(line)) {
      while (consumed < 4 && (!/(?:Empregado ou Agente|Contribuinte Individual|Empregado Doméstico|Segurado Especial|Trabalhador Avulso|Facultativo)/i.test(candidate) || !/\d{2}\/\d{2}\/\d{4}/.test(candidate))) {
        consumed += 1
        candidate += ` ${lines[index + consumed] ?? ''}`
      }
    }
    const relation = benefitFromLine(candidate) ?? relationFromLine(candidate)
    if (relation) { relations.push(relation); current = relation; mode = relation.origin === 'RECOLHIMENTO' ? 'contribution' : 'remuneration'; index += consumed; continue }
    if (!current) continue
    if (/^Contribui[cç][oõ]es$/i.test(line)) mode = 'contribution'
    if (/^Remunera[cç][oõ]es$/i.test(line)) mode = 'remuneration'
    if (/^Indicadores:/i.test(line)) { current.indicators = unique([...current.indicators, ...extractIndicators(line)]); continue }
    if (mode === 'contribution') {
      for (const match of line.matchAll(/(\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+,\d{2})/g)) current.competencies.push({ month: match[1], paymentDate: match[2], amount: money(match[3]), indicators: extractIndicators(line), relationId: current.id, kind: 'contribution' })
    } else {
      for (const match of line.matchAll(/(\d{2}\/\d{4})\s+([\d.]+,\d{2})/g)) current.competencies.push({ month: match[1], amount: money(match[2]), indicators: extractIndicators(line), relationId: current.id, kind: 'remuneration' })
    }
  }
  return relations
}

const buildGaps = (relations: Relation[]): Gap[] => {
  const intervals = relations.filter(relation => relation.kind !== 'benefit').map(relation => { const start = monthStart(relation.start); const end = monthStart(relation.end ?? relation.lastRemuneration ?? relation.start); return start !== undefined && end !== undefined ? [start, end] as const : null }).filter((item): item is readonly [number, number] => item !== null).sort((a, b) => a[0] - b[0])
  if (!intervals.length) return []
  const merged: [number, number][] = [[intervals[0][0], intervals[0][1]]]
  for (const [start, end] of intervals.slice(1)) { const last = merged[merged.length - 1]; if (start <= last[1] + 1) last[1] = Math.max(last[1], end); else merged.push([start, end]) }
  return merged.slice(1).map((interval, index) => ({ start: fromMonthIndex(merged[index][1] + 1), end: fromMonthIndex(interval[0] - 1), months: interval[0] - merged[index][1] - 1 }))
}

const countPotentialMonths = (relations: Relation[]) => { const months = new Set<number>(); for (const relation of relations.filter(item => item.kind !== 'benefit')) { const start = monthStart(relation.start); const end = monthStart(relation.end ?? relation.lastRemuneration ?? relation.start); if (start === undefined || end === undefined) continue; for (let month = start; month <= end; month++) months.add(month) } return months.size }

const buildFindings = (relations: Relation[], competencies: Competency[], gaps: Gap[]) => {
  const findings: Finding[] = []
  const benefitMonths = new Set<number>()
  for (const benefit of relations.filter(item => item.kind === 'benefit')) {
    const start = monthStart(benefit.start); const end = monthStart(benefit.end)
    if (start === undefined || end === undefined) continue
    for (let month = start; month <= end; month++) benefitMonths.add(month)
  }
  const allIndicators = unique(relations.flatMap(r => [...r.indicators, ...r.competencies.flatMap(c => c.indicators)]))
  for (const code of allIndicators) { const info = INDICATOR_INFO[code]; if (info) findings.push({ id: `indicator-${code}`, category: 'indicador', evidence: code, ...info }) }
  const totals = new Map<string, number>(); for (const competency of competencies) totals.set(competency.month, (totals.get(competency.month) ?? 0) + competency.amount)
  for (const [month, amount] of totals) { const threshold = minimumWage(month); if (toMonthIndex(month) >= toMonthIndex('11/2019') && threshold && amount < threshold) findings.push({ id: `minimum-${month}`, severity: 'critical', category: 'contribuicao', period: month, title: `Competência ${month} abaixo do mínimo`, description: `Total identificado de ${formatCurrency(amount)}, abaixo do mínimo de ${formatCurrency(threshold)} da competência.`, action: 'Confirmar o valor consolidado no Meu INSS e avaliar ajuste antes de contar esta competência.', evidence: `${formatCurrency(amount)} / ${formatCurrency(threshold)}` }) }
  for (const gap of gaps) findings.push({ id: `gap-${gap.start}`, severity: gap.months >= 6 ? 'attention' : 'info', category: 'lacuna', title: `Intervalo sem vínculo de ${gap.months} ${gap.months === 1 ? 'mês' : 'meses'}`, description: `Nenhum vínculo foi identificado entre ${gap.start} e ${gap.end}. Isso não significa automaticamente débito ou erro.`, action: 'Verificar se houve trabalho, atividade autônoma, benefício ou contribuição não lançada nesse intervalo.', period: `${gap.start} a ${gap.end}` })
  for (const relation of relations) {
    if (relation.kind === 'benefit') {
      findings.push({ id: `benefit-${relation.id}`, severity: 'info', category: 'documento', relationId: relation.id, title: 'Benefício previdenciário identificado', description: `${relation.benefitSpecies ?? 'Benefício'} entre ${relation.start} e ${relation.end}${relation.status ? `, situação: ${relation.status}` : ''}.`, action: 'Conferir a carta de concessão e avaliar, conforme o caso, se o período é intercalado e computável para o benefício pretendido.', period: `${relation.start} a ${relation.end}`, evidence: relation.benefitNumber ? `NB ${relation.benefitNumber}` : undefined })
      continue
    }
    const start = monthStart(relation.start); const end = monthStart(relation.end ?? relation.lastRemuneration)
    if (start === undefined || end === undefined || relation.competencies.length === 0) continue
    const recorded = new Set(relation.competencies.map(item => toMonthIndex(item.month))); const missing: string[] = []
    for (let index = start; index <= end; index++) if (!recorded.has(index) && !benefitMonths.has(index)) missing.push(fromMonthIndex(index))
    if (missing.length) findings.push({ id: `missing-${relation.id}`, severity: 'attention', category: 'vinculo', relationId: relation.id, title: `${missing.length} ${missing.length === 1 ? 'competência ausente' : 'competências ausentes'} no vínculo ${relation.id}`, description: `Há meses dentro do vínculo sem remuneração/contribuição listada: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}.`, action: 'Conferir holerites, CTPS, GFIP/eSocial e solicitar inclusão ou acerto se houve atividade.', period: `${relation.start} a ${relation.end ?? relation.lastRemuneration}` })
  }

  const employmentGroups = new Map<string, Relation[]>()
  for (const relation of relations.filter(item => item.kind === 'employment')) {
    const key = relation.origin.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
    employmentGroups.set(key, [...(employmentGroups.get(key) ?? []), relation])
  }
  for (const group of employmentGroups.values()) {
    if (group.length < 2) continue
    const ordered = [...group].sort((a, b) => (monthStart(a.start) ?? 0) - (monthStart(b.start) ?? 0))
    findings.push({ id: `rehire-${ordered.map(item => item.id).join('-')}`, severity: 'info', category: 'vinculo', title: 'Mais de um vínculo com o mesmo empregador', description: `${ordered.length} vínculos distintos foram encontrados para ${ordered[0].origin}.`, action: 'Conferir se as rescisões e readmissões estão corretas e se não há competências faltantes entre os contratos.', period: ordered.map(item => `${item.start} a ${item.end ?? item.lastRemuneration ?? 'em aberto'}`).join(' · ') })
  }
  const order: Record<Severity, number> = { critical: 0, attention: 1, info: 2 }
  return findings.sort((a, b) => order[a.severity] - order[b.severity])
}

export const analyzeCnisText = (rawText: string, fileName: string, pages: number): CnisAnalysis => {
  if (!/CNIS|Cadastro Nacional de Informa[cç][oõ]es Sociais/i.test(rawText)) throw new Error('Este PDF não parece ser um Extrato Previdenciário CNIS.')
  const relations = parseDocument(rawText); if (!relations.length) throw new Error('Não foi possível identificar vínculos no layout deste CNIS. Tente gerar o extrato “Relações Previdenciárias e Remunerações”.')
  const competencies = relations.flatMap(relation => relation.competencies); const gaps = buildGaps(relations); const findings = buildFindings(relations, competencies, gaps)
  const lowMonths = unique(findings.filter(item => item.id.startsWith('minimum-')).map(item => item.period)).length; const totalPotentialMonths = countPotentialMonths(relations)
  const sequenceIds = relations.map(item => item.id).sort((a, b) => a - b)
  const continuousIds = sequenceIds.every((id, index) => index === 0 || id === sequenceIds[index - 1] + 1)
  const extractionConfidence = Math.max(0, Math.min(100, 70 + (relations.length ? 15 : 0) + (competencies.length ? 10 : 0) + (continuousIds ? 5 : 0)))
  return { fileName, analyzedAt: new Date().toISOString(), pages, person: extractPerson(rawText), relations, competencies, findings, gaps, indicators: unique(relations.flatMap(r => [...r.indicators, ...r.competencies.flatMap(c => c.indicators)])), totalPotentialMonths, validPotentialMonths: Math.max(0, totalPotentialMonths - lowMonths), excludedLowMonths: lowMonths, extractionConfidence, rawText }
}

export const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
export const formatMonths = (months: number) => { const years = Math.floor(months / 12); const rest = months % 12; if (!years) return `${rest} ${rest === 1 ? 'mês' : 'meses'}`; return `${years} ${years === 1 ? 'ano' : 'anos'}${rest ? ` e ${rest} ${rest === 1 ? 'mês' : 'meses'}` : ''}` }
export const maskCpf = (cpf?: string) => cpf ? `***.${cpf.slice(4, 7)}.${cpf.slice(8, 11)}-**` : 'Não identificado'
export const indicatorLabel = (code: string) => INDICATOR_INFO[code]?.title ?? 'Indicador presente no CNIS'

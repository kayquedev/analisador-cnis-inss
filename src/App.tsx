import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Award, BriefcaseBusiness, CalendarRange, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, Download, FileCheck2, HeartPulse, Info, LockKeyhole, Printer, Search, ShieldCheck, SlidersHorizontal, Sparkles, UploadCloud, WalletCards, X } from 'lucide-react'
import './App.css'
import { analyzeCnisText, formatCurrency, formatMonths, indicatorLabel, maskCpf } from './lib/cnis'
import { extractPdfText } from './lib/pdf'
import { calculateAgeMonths, calculateRetirement, type RetirementSex } from './lib/retirement'
import type { CnisAnalysis, Finding, Relation, Severity } from './types'

const severityMeta: Record<Severity, { label: string; icon: typeof AlertCircle }> = {
  critical: { label: 'Prioridade alta', icon: CircleAlert }, attention: { label: 'Requer atenção', icon: AlertCircle }, info: { label: 'Informativo', icon: Info },
}

const relationKindLabel = (kind: Relation['kind']) => kind === 'benefit' ? 'Benefício' : kind === 'contribution' ? 'Recolhimento' : 'Vínculo empregatício'

const dateToMonthIndex = (value?: string) => {
  if (!value) return undefined
  const parts = value.split('/')
  const month = Number(parts.length === 3 ? parts[1] : parts[0])
  const year = Number(parts.length === 3 ? parts[2] : parts[1])
  return Number.isFinite(month) && Number.isFinite(year) ? year * 12 + month - 1 : undefined
}

const inputToMonthIndex = (value: string) => {
  if (!value) return undefined
  const [year, month] = value.split('-').map(Number)
  return Number.isFinite(month) && Number.isFinite(year) ? year * 12 + month - 1 : undefined
}

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const start = total ? (page - 1) * pageSize + 1 : 0
  const end = Math.min(page * pageSize, total)
  return <div className="pagination"><span>Exibindo <b>{start}–{end}</b> de <b>{total}</b></span><div><button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Página anterior"><ChevronLeft/></button><span>Página <b>{page}</b> de <b>{pages}</b></span><button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Próxima página"><ChevronRight/></button></div></div>
}

function RelationsView({ analysis }: { analysis: CnisAnalysis }) {
  const [kind, setKind] = useState('all'); const [company, setCompany] = useState('all'); const [indicator, setIndicator] = useState('all'); const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [page, setPage] = useState(1)
  const companies = useMemo(() => [...new Set(analysis.relations.map(item => item.origin).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [analysis.relations])
  const indicators = useMemo(() => [...new Set(analysis.relations.flatMap(item => [...item.indicators, ...item.competencies.flatMap(comp => comp.indicators)]))].sort(), [analysis.relations])
  const filtered = useMemo(() => analysis.relations.filter(relation => {
    const relationIndicators = [...relation.indicators, ...relation.competencies.flatMap(item => item.indicators)]
    const relationStart = dateToMonthIndex(relation.start)
    const relationEnd = dateToMonthIndex(relation.end ?? relation.lastRemuneration ?? relation.start)
    const from = inputToMonthIndex(start); const to = inputToMonthIndex(end)
    return (kind === 'all' || relation.kind === kind)
      && (company === 'all' || relation.origin === company)
      && (indicator === 'all' || (indicator === 'with' ? relationIndicators.length > 0 : indicator === 'without' ? relationIndicators.length === 0 : relationIndicators.includes(indicator)))
      && (from === undefined || relationEnd === undefined || relationEnd >= from)
      && (to === undefined || relationStart === undefined || relationStart <= to)
  }), [analysis.relations, kind, company, indicator, start, end])
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10)); const safePage = Math.min(page, pageCount); const displayed = filtered.slice((safePage - 1) * 10, safePage * 10)
  const update = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1) }
  const clear = () => { setKind('all'); setCompany('all'); setIndicator('all'); setStart(''); setEnd(''); setPage(1) }
  const active = kind !== 'all' || company !== 'all' || indicator !== 'all' || !!start || !!end
  return <section className="content-section"><div className="section-heading"><div><span>Linha do tempo</span><h2>Vínculos, recolhimentos e benefícios</h2></div><span className="result-count">{filtered.length} {filtered.length === 1 ? 'relação encontrada' : 'relações encontradas'}</span></div>
    <div className="filter-panel"><div className="filter-panel-title"><SlidersHorizontal/><div><strong>Filtrar vínculos</strong><span>Combine os parâmetros para refinar a linha do tempo.</span></div>{active && <button type="button" onClick={clear}><X/>Limpar filtros</button>}</div><div className="filter-fields relation-filters">
      <label><span>Relação</span><select value={kind} onChange={event => update(setKind)(event.target.value)}><option value="all">Todas as relações</option><option value="employment">Vínculo empregatício</option><option value="contribution">Recolhimento</option><option value="benefit">Benefício</option></select></label>
      <label><span>Empresa / origem</span><select value={company} onChange={event => update(setCompany)(event.target.value)}><option value="all">Todas as empresas</option>{companies.map(item => <option value={item} key={item}>{item}</option>)}</select></label>
      <label><span>Indicadores</span><select value={indicator} onChange={event => update(setIndicator)(event.target.value)}><option value="all">Todos</option><option value="with">Com indicador</option><option value="without">Sem indicador</option>{indicators.map(item => <option value={item} key={item}>{item} — {indicatorLabel(item)}</option>)}</select></label>
      <label><span>Início do período</span><input type="month" value={start} onChange={event => update(setStart)(event.target.value)}/></label>
      <label><span>Fim do período</span><input type="month" value={end} onChange={event => update(setEnd)(event.target.value)}/></label>
    </div></div>
    {displayed.length ? <div className="timeline">{displayed.map((relation, index) => <article className={`relation-card ${relation.kind}`} key={relation.id}><div className="timeline-marker"><span>{(safePage - 1) * 10 + index + 1}</span></div><div className="relation-content"><div className="relation-top"><div><small>Relação {relation.id} · {relationKindLabel(relation.kind)}</small><h3>{relation.kind === 'benefit' ? relation.benefitSpecies || relation.origin : relation.origin}</h3><p>{relation.kind === 'benefit' ? relation.status || relation.category : relation.category}</p></div><span className="period">{relation.start || 'Início não lido'} <b>→</b> {relation.end || relation.lastRemuneration || 'Em aberto'}</span></div><div className="relation-stats">{relation.kind === 'benefit' ? <><span><b>NB</b> {relation.benefitNumber || 'não identificado'}</span><span><b>Período de benefício</b> não somado automaticamente ao tempo</span></> : <><span><b>{relation.competencies.length}</b> competências listadas</span><span><b>{relation.indicators.length}</b> indicadores no vínculo</span></>}</div>{relation.indicators.length > 0 && <div className="chips">{relation.indicators.map(code => <span title={indicatorLabel(code)} key={code}>{code}</span>)}</div>}</div></article>)}</div> : <div className="empty-filter"><Search/><strong>Nenhuma relação encontrada</strong><span>Altere ou limpe os filtros para visualizar outros registros.</span></div>}
    <Pagination page={safePage} total={filtered.length} pageSize={10} onChange={setPage}/>
  </section>
}

function CompetenciesView({ analysis }: { analysis: CnisAnalysis }) {
  const [indicator, setIndicator] = useState('all'); const [origin, setOrigin] = useState('all'); const [kind, setKind] = useState('all'); const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [minAmount, setMinAmount] = useState(''); const [maxAmount, setMaxAmount] = useState(''); const [page, setPage] = useState(1)
  const relationById = useMemo(() => new Map(analysis.relations.map(item => [item.id, item])), [analysis.relations])
  const origins = useMemo(() => [...new Set(analysis.competencies.map(item => relationById.get(item.relationId)?.origin).filter((item): item is string => !!item))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [analysis.competencies, relationById])
  const indicators = useMemo(() => [...new Set(analysis.competencies.flatMap(item => item.indicators))].sort(), [analysis.competencies])
  const amounts = useMemo(() => [...new Set(analysis.competencies.map(item => item.amount))].sort((a, b) => a - b), [analysis.competencies])
  const filtered = useMemo(() => analysis.competencies.filter(item => {
    const month = dateToMonthIndex(item.month); const from = inputToMonthIndex(start); const to = inputToMonthIndex(end); const itemOrigin = relationById.get(item.relationId)?.origin
    return (indicator === 'all' || (indicator === 'with' ? item.indicators.length > 0 : indicator === 'without' ? item.indicators.length === 0 : item.indicators.includes(indicator)))
      && (origin === 'all' || itemOrigin === origin) && (kind === 'all' || item.kind === kind)
      && (from === undefined || month === undefined || month >= from) && (to === undefined || month === undefined || month <= to)
      && (!minAmount || item.amount >= Number(minAmount)) && (!maxAmount || item.amount <= Number(maxAmount))
  }), [analysis.competencies, relationById, indicator, origin, kind, start, end, minAmount, maxAmount])
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20)); const safePage = Math.min(page, pageCount); const displayed = filtered.slice((safePage - 1) * 20, safePage * 20)
  const update = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1) }
  const clear = () => { setIndicator('all'); setOrigin('all'); setKind('all'); setStart(''); setEnd(''); setMinAmount(''); setMaxAmount(''); setPage(1) }
  const active = indicator !== 'all' || origin !== 'all' || kind !== 'all' || !!start || !!end || !!minAmount || !!maxAmount
  return <section className="content-section"><div className="section-heading"><div><span>Dados extraídos</span><h2>Competências e valores</h2></div><span className="result-count">{filtered.length} {filtered.length === 1 ? 'competência encontrada' : 'competências encontradas'}</span></div>
    <div className="filter-panel"><div className="filter-panel-title"><SlidersHorizontal/><div><strong>Filtrar competências</strong><span>Selecione os parâmetros desejados para consultar os registros.</span></div>{active && <button type="button" onClick={clear}><X/>Limpar filtros</button>}</div><div className="filter-fields competency-filters">
      <label><span>Indicadores</span><select value={indicator} onChange={event => update(setIndicator)(event.target.value)}><option value="all">Todos</option><option value="with">Com indicador</option><option value="without">Sem indicador</option>{indicators.map(item => <option value={item} key={item}>{item} — {indicatorLabel(item)}</option>)}</select></label>
      <label><span>Origem</span><select value={origin} onChange={event => update(setOrigin)(event.target.value)}><option value="all">Todas as origens</option>{origins.map(item => <option value={item} key={item}>{item}</option>)}</select></label>
      <label><span>Tipo</span><select value={kind} onChange={event => update(setKind)(event.target.value)}><option value="all">Todos os tipos</option><option value="remuneration">Remuneração</option><option value="contribution">Contribuição</option></select></label>
      <label><span>Competência inicial</span><input type="month" value={start} onChange={event => update(setStart)(event.target.value)}/></label>
      <label><span>Competência final</span><input type="month" value={end} onChange={event => update(setEnd)(event.target.value)}/></label>
      <label><span>Valor-base mínimo</span><select value={minAmount} onChange={event => update(setMinAmount)(event.target.value)}><option value="">Sem mínimo</option>{amounts.map(item => <option value={item} key={item}>{formatCurrency(item)}</option>)}</select></label>
      <label><span>Valor-base máximo</span><select value={maxAmount} onChange={event => update(setMaxAmount)(event.target.value)}><option value="">Sem máximo</option>{amounts.map(item => <option value={item} key={item}>{formatCurrency(item)}</option>)}</select></label>
    </div></div>
    {displayed.length ? <div className="table-wrap"><table><thead><tr><th>Competência</th><th>Origem</th><th>Tipo</th><th>Valor-base</th><th>Indicadores</th></tr></thead><tbody>{displayed.map((item, index) => { const relation = relationById.get(item.relationId); return <tr key={`${item.relationId}-${item.month}-${(safePage - 1) * 20 + index}`}><td><b>{item.month}</b></td><td>{relation?.origin}</td><td>{item.kind === 'contribution' ? 'Contribuição' : 'Remuneração'}</td><td>{formatCurrency(item.amount)}</td><td><div className="chips compact">{item.indicators.length ? item.indicators.map(code => <span title={indicatorLabel(code)} key={code}>{code}</span>) : <em>Sem indicador lido</em>}</div></td></tr>})}</tbody></table></div> : <div className="empty-filter"><Search/><strong>Nenhuma competência encontrada</strong><span>Altere ou limpe os filtros para visualizar outros registros.</span></div>}
    <Pagination page={safePage} total={filtered.length} pageSize={20} onChange={setPage}/>
  </section>
}

function UploadScreen({ onAnalyze, loading, progress, error }: { onAnalyze: (file: File) => void; loading: boolean; progress: number; error?: string }) {
  const input = useRef<HTMLInputElement>(null); const [dragging, setDragging] = useState(false)
  const accept = (files: FileList | null) => files?.[0] && onAnalyze(files[0])
  return <main className="upload-page">
    <header className="topbar"><div className="brand"><img src="/kode-cnis.png" alt="KODE CNIS" className="kode-logo"/></div><div className="privacy-pill"><LockKeyhole size={15} /> Análise local e privada</div></header>
    <section className="hero">
      <div className="eyebrow"><Sparkles size={16} /> Leitura inteligente do extrato previdenciário</div>
      <h1>Entenda seu CNIS<br/><span>sem se perder nos códigos.</span></h1>
      <p>Envie o extrato completo e receba uma leitura organizada de vínculos, contribuições, lacunas e indicadores que merecem conferência.</p>
      <div className={`dropzone ${dragging ? 'dragging' : ''} ${loading ? 'loading' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); accept(event.dataTransfer.files) }} onClick={() => !loading && input.current?.click()}>
        <input ref={input} type="file" accept="application/pdf,.pdf" onChange={event => accept(event.target.files)} hidden />
        {loading ? <><div className="progress-ring"><span>{progress}%</span></div><h2>Lendo o seu extrato…</h2><p>Identificando vínculos, competências e indicadores.</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></> : <>
          <div className="upload-icon"><UploadCloud size={30} /></div><h2>Arraste o PDF do CNIS aqui</h2><p>ou clique para escolher o arquivo</p><button type="button" className="primary">Selecionar extrato PDF</button><small>PDF de até 25 MB · prefira “Relações Previdenciárias e Remunerações”</small>
        </>}
      </div>
      {error && <div className="error-message"><AlertCircle size={18} />{error}</div>}
      <div className="trust-grid">
        <div><ShieldCheck/><strong>Seus dados ficam no dispositivo</strong><span>O arquivo não é enviado a nenhum servidor.</span></div>
        <div><FileCheck2/><strong>Leitura do documento oficial</strong><span>Compatível com o extrato emitido no Meu INSS.</span></div>
        <div><Search/><strong>Alertas explicados</strong><span>Cada achado mostra evidência e próximo passo.</span></div>
      </div>
    </section>
    <footer>Ferramenta de apoio à conferência. Não substitui análise do INSS ou orientação jurídica individual.</footer>
  </main>
}

function SummaryCard({ icon: Icon, label, value, detail, tone = 'blue' }: { icon: typeof Clock3; label: string; value: string | number; detail: string; tone?: string }) {
  return <div className={`summary-card ${tone}`}><div className="summary-icon"><Icon/></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>
}

function RetirementPanel({ analysis }: { analysis: CnisAnalysis }) {
  const [sex, setSex] = useState<RetirementSex>('female')
  const snapshot = useMemo(() => calculateRetirement(analysis, sex), [analysis, sex])
  const reference = snapshot.referenceDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return <section className="retirement-panel">
    <div className="retirement-heading">
      <div className="retirement-title"><span className="feature-icon"><Award/></span><div><span>Simulação previdenciária</span><h2>Caminhos para aposentadoria</h2><p>Estimativa em {reference}, baseada apenas no CNIS enviado.</p></div></div>
      <div className="sex-selector" aria-label="Cenário da simulação"><span>Simular como</span><div><button className={sex === 'female' ? 'active' : ''} onClick={() => setSex('female')}>Mulher</button><button className={sex === 'male' ? 'active' : ''} onClick={() => setSex('male')}>Homem</button></div><small>O sistema não infere gênero pelo nome.</small></div>
    </div>
    <div className="retirement-grid">{snapshot.rules.map(rule => <article className={`retirement-rule ${rule.status}`} key={rule.id}>
      <div className="rule-top"><span>{rule.title}</span>{rule.status === 'eligible' ? <CheckCircle2/> : rule.status === 'review' ? <Search/> : <Clock3/>}</div>
      <strong>{rule.current}</strong><small>Exigência: {rule.required}</small>
      <div className="rule-progress"><span style={{ width: `${rule.progress}%` }}/></div>
      <b>{rule.statusText}</b><p>{rule.detail}</p>
    </article>)}</div>
    <div className="simulation-warning"><Info/><span>Simulação orientativa: não avalia pedágios de 50%/100%, atividade especial, rural, professor, RPPS, carência, tempo reconhecido judicialmente ou documentos fora do CNIS.</span></div>
  </section>
}

function BenefitsPanel({ analysis }: { analysis: CnisAnalysis }) {
  const benefits = analysis.relations.filter(item => item.kind === 'benefit')
  return <section className={`benefits-panel ${benefits.length ? 'has-benefits' : 'empty-benefits'}`}>
    <div className="benefits-heading"><span className="feature-icon"><HeartPulse/></span><div><span>Benefícios encontrados</span><h2>{benefits.length ? `${benefits.length} ${benefits.length === 1 ? 'benefício identificado' : 'benefícios identificados'}` : 'Nenhum benefício identificado no extrato'}</h2><p>{benefits.length ? 'Períodos de benefício são exibidos separadamente e não entram automaticamente no tempo estimado.' : 'O PDF não apresentou relações classificadas como benefício previdenciário.'}</p></div></div>
    {benefits.length > 0 && <div className="benefit-list">{benefits.map(benefit => <article key={benefit.id}><div><small>{benefit.status || 'Situação não identificada'}</small><strong>{benefit.benefitSpecies || 'Benefício previdenciário'}</strong><span>{benefit.start} <b>→</b> {benefit.end}</span></div><code>NB {benefit.benefitNumber || 'não identificado'}</code></article>)}</div>}
  </section>
}

function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(finding.severity === 'critical'); const meta = severityMeta[finding.severity]; const Icon = meta.icon
  return <article className={`finding ${finding.severity}`}><button type="button" onClick={() => setOpen(value => !value)}><span className="finding-icon"><Icon size={20}/></span><span className="finding-main"><small>{meta.label}{finding.period ? ` · ${finding.period}` : ''}</small><strong>{finding.title}</strong><span>{finding.description}</span></span><ChevronDown className={open ? 'rotated' : ''}/></button>{open && <div className="finding-detail"><div><b>Próximo passo sugerido</b><p>{finding.action}</p></div>{finding.evidence && <code>{finding.evidence}</code>}</div>}</article>
}

function Dashboard({ analysis, onReset }: { analysis: CnisAnalysis; onReset: () => void }) {
  const [tab, setTab] = useState<'overview' | 'relations' | 'competencies'>('overview'); const [filter, setFilter] = useState<'all' | Severity>('all')
  const displayedFindings = useMemo(() => analysis.findings.filter(item => filter === 'all' || item.severity === filter), [analysis.findings, filter])
  const high = analysis.findings.filter(item => item.severity === 'critical').length; const attention = analysis.findings.filter(item => item.severity === 'attention').length
  const benefitCount = analysis.relations.filter(item => item.kind === 'benefit').length
  const workRelationCount = analysis.relations.length - benefitCount
  const ageYears = analysis.person.birthDate ? Math.floor(calculateAgeMonths(analysis.person.birthDate) / 12) : undefined
  const downloadJson = () => { const safe = { ...analysis, rawText: undefined }; const url = URL.createObjectURL(new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `analise-cnis-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url) }

  return <div className="app-shell">
    <aside><div className="brand"><img src="/kode-cnis.png" alt="KODE CNIS" className="kode-logo"/></div><nav>
      <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><Sparkles/>Visão geral</button>
      <button className={tab === 'relations' ? 'active' : ''} onClick={() => setTab('relations')}><BriefcaseBusiness/>Vínculos</button>
      <button className={tab === 'competencies' ? 'active' : ''} onClick={() => setTab('competencies')}><WalletCards/>Competências</button>
    </nav><div className="aside-note"><LockKeyhole/><div><strong>Processamento local</strong><span>O PDF não saiu deste dispositivo.</span></div></div><button className="new-analysis" onClick={onReset}><ArrowLeft/>Analisar outro PDF</button></aside>
    <main className="dashboard">
      <header className="dashboard-header"><div><span>Extrato analisado</span><h1>{analysis.person.name || 'Segurado(a)'}{ageYears !== undefined && <small className="age-badge">{ageYears} anos</small>}</h1><p>CPF {maskCpf(analysis.person.cpf)} · {analysis.pages} páginas · {analysis.relations.length} relações · leitura {analysis.extractionConfidence}%</p></div><div className="header-actions"><button onClick={downloadJson}><Download/>Exportar dados</button><button onClick={() => window.print()}><Printer/>Imprimir relatório</button></div></header>
      {tab === 'overview' && <>
        <section className="status-banner"><div className="status-score">{high ? <CircleAlert/> : <CheckCircle2/>}</div><div><small>Resultado da conferência automática</small><h2>{high ? `${high} ${high === 1 ? 'ponto prioritário' : 'pontos prioritários'} encontrado${high === 1 ? '' : 's'}` : 'Nenhuma pendência crítica detectada'}</h2><p>{attention} alertas adicionais merecem conferência documental. Os números abaixo são estimativas e não constituem reconhecimento de direito.</p></div></section>
        <section className="summary-grid"><SummaryCard icon={Clock3} label="Tempo potencial" value={formatMonths(analysis.validPotentialMonths)} detail={`${analysis.excludedLowMonths} competências abaixo do mínimo excluídas da estimativa`} /><SummaryCard icon={BriefcaseBusiness} label="Relações previdenciárias" value={analysis.relations.length} detail={`${workRelationCount} vínculos/recolhimentos · ${benefitCount} benefícios`} tone="green" /><SummaryCard icon={CalendarRange} label="Intervalos sem vínculo" value={analysis.gaps.length} detail={`${analysis.gaps.reduce((sum, gap) => sum + gap.months, 0)} meses entre períodos`} tone="amber" /><SummaryCard icon={AlertCircle} label="Pontos para revisar" value={high + attention} detail={`${analysis.indicators.length} indicadores distintos no documento`} tone="red" /></section>
        <RetirementPanel analysis={analysis}/>
        <BenefitsPanel analysis={analysis}/>
        <section className="content-section findings-section"><div className="section-heading"><div><span>Leitura orientada</span><h2>O que merece sua atenção</h2></div><div className="filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button><button className={filter === 'critical' ? 'active' : ''} onClick={() => setFilter('critical')}>Prioridade</button><button className={filter === 'attention' ? 'active' : ''} onClick={() => setFilter('attention')}>Atenção</button></div></div><div className="findings-list">{displayedFindings.length ? displayedFindings.map(item => <FindingCard finding={item} key={item.id}/>) : <div className="empty"><CheckCircle2/><strong>Nenhum item neste filtro</strong></div>}</div></section>
      </>}
      {tab === 'relations' && <RelationsView analysis={analysis}/>} 
      {tab === 'competencies' && <CompetenciesView analysis={analysis}/>} 
      <section className="legal-note"><ShieldCheck/><div><strong>Como interpretar este relatório</strong><p>A ferramenta organiza o conteúdo do PDF e aplica verificações automáticas. O tempo é potencial, calculado por competências e períodos do extrato, sem avaliar atividade especial, rural, RPPS, carência específica, regras de transição ou documentos externos. A decisão final pertence ao INSS.</p></div></section>
    </main>
  </div>
}

export default function App() {
  const [analysis, setAnalysis] = useState<CnisAnalysis>(); const [loading, setLoading] = useState(false); const [progress, setProgress] = useState(0); const [error, setError] = useState<string>()
  const analyze = useCallback(async (file: File) => { setLoading(true); setError(undefined); setProgress(3); try { const result = await extractPdfText(file, value => setProgress(value)); setAnalysis(analyzeCnisText(result.text, file.name, result.pages)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível analisar o arquivo.') } finally { setLoading(false) } }, [])
  if (analysis) return <Dashboard analysis={analysis} onReset={() => { setAnalysis(undefined); setProgress(0) }}/>
  return <UploadScreen onAnalyze={analyze} loading={loading} progress={progress} error={error}/>
}

export type Severity = 'critical' | 'attention' | 'info'

export interface Person { name?: string; cpf?: string; nit?: string; birthDate?: string; generatedAt?: string }
export interface Competency { month: string; amount: number; contribution?: number; paymentDate?: string; indicators: string[]; relationId: number; kind: 'remuneration' | 'contribution' }
export type RelationKind = 'employment' | 'contribution' | 'benefit'
export interface Relation { id: number; kind: RelationKind; nit?: string; employerCode?: string; origin: string; category: string; start?: string; end?: string; lastRemuneration?: string; benefitNumber?: string; benefitSpecies?: string; status?: string; indicators: string[]; competencies: Competency[] }
export interface Finding { id: string; severity: Severity; category: 'indicador' | 'contribuicao' | 'lacuna' | 'vinculo' | 'documento'; title: string; description: string; action: string; period?: string; relationId?: number; evidence?: string }
export interface Gap { start: string; end: string; months: number }
export interface CnisAnalysis { fileName: string; analyzedAt: string; pages: number; person: Person; relations: Relation[]; competencies: Competency[]; findings: Finding[]; gaps: Gap[]; indicators: string[]; totalPotentialMonths: number; validPotentialMonths: number; excludedLowMonths: number; extractionConfidence: number; rawText: string }

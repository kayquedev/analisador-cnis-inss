import { describe, expect, it } from 'vitest'
import { calculateRetirement } from './retirement'
import type { CnisAnalysis } from '../types'

const analysis = {
  person: { birthDate: '19/05/1972' }, validPotentialMonths: 419,
  relations: [{ id: 1, kind: 'employment', origin: 'EMPRESA', category: 'Empregado', start: '13/08/1990', end: '07/2026', indicators: [], competencies: [] }],
} as unknown as CnisAnalysis

describe('retirement scenarios', () => {
  const referenceDate = new Date(2026, 10, 23)
  it('lists both age and contribution deficits when both are missing', () => {
    const shortHistory = { ...analysis, validPotentialMonths: 12 }
    const result = calculateRetirement(shortHistory, 'male', referenceDate)
    const ageRule = result.rules.find(rule => rule.id === 'age')!
    expect(ageRule.statusText).toContain('de idade e')
    expect(ageRule.statusText).toContain('de contribuição')
  })

  it('uses the official 2026 progressive requirements for women', () => {
    const result = calculateRetirement(analysis, 'female', referenceDate)
    expect(result.points).toBe(89.4)
    expect(result.rules.find(rule => rule.id === 'points')?.required).toContain('93 pontos')
    expect(result.rules.find(rule => rule.id === 'progressive-age')?.required).toContain('59 anos e 6 meses')
  })

  it('uses the official 2026 progressive requirements for men', () => {
    const result = calculateRetirement(analysis, 'male', referenceDate)
    expect(result.rules.find(rule => rule.id === 'points')?.required).toContain('103 pontos')
    expect(result.rules.find(rule => rule.id === 'progressive-age')?.required).toContain('64 anos e 6 meses')
  })
})

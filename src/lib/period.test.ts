import { describe, it, expect } from 'vitest'
import { relationDuration } from './period'
import type { Relation } from '../types'
const period = (start?: string, end?: string, lastRemuneration?: string) => relationDuration({ start, end, lastRemuneration } as Relation)
describe('recorded interval duration', () => {
  it('includes first and last days and handles leap years', () => {
    expect(period('01/01/2020', '31/12/2020')).toBe('1 ano')
    expect(period('28/02/2024', '29/02/2024')).toBe('2 dias')
    expect(period('05/03/2020', '05/03/2020')).toBe('1 dia')
  })
  it('marks monthly precision and uses last remuneration only when available', () => {
    expect(period('15/01/2020', undefined, '01/2020')).toBe('1 mês (por competências)')
    expect(period('01/2020', '12/2020')).toBe('1 ano (por competências)')
    expect(period('01/01/2020')).toBe('Sem datas suficientes')
  })
  it('rejects invalid and inverted intervals', () => {
    expect(period('31/02/2020', '01/03/2020')).toBe('Período inválido')
    expect(period('02/03/2020', '01/03/2020')).toBe('Período inválido')
  })
})

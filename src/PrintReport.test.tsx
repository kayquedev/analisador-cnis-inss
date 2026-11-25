import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { PrintReport } from './PrintReport'
import type { CnisAnalysis } from './types'

const analysis = { person: { name: 'PESSOA TESTE', cpf: '123.456.789-00', birthDate: '01/01/1970' }, validPotentialMonths: 180, excludedLowMonths: 0, relations: [], findings: [], gaps: [], fileName: 'exemplo.pdf' } as unknown as CnisAnalysis

describe('print report', () => {
  it('prints full identity and requirements for the selected sex without dashboard elements', () => {
    const male = renderToStaticMarkup(<PrintReport analysis={analysis} sex="male"/>)
    const female = renderToStaticMarkup(<PrintReport analysis={analysis} sex="female"/>)
    expect(male).toContain('123.456.789-00')
    expect(male).toContain('Tempo calculado')
    expect(male).toContain('35 anos')
    expect(female).toContain('30 anos')
    expect(male).not.toContain('leitura 100%')
    expect(male).not.toContain('Resultado da conferência automática')
    expect(male).not.toContain('summary-grid')
  })
})

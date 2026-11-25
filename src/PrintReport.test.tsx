import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { BrandingProvider } from './Branding'
import { PrintReport } from './PrintReport'
import type { CnisAnalysis } from './types'

const analysis = { person: { name: 'PESSOA TESTE', cpf: '123.456.789-00', birthDate: '01/01/1970' }, validPotentialMonths: 180, excludedLowMonths: 0, relations: [], findings: [], gaps: [], fileName: 'exemplo.pdf' } as unknown as CnisAnalysis

describe('print report', () => {
  it('uses saved branding and displays each recorded interval duration', () => {
    const branding = { name: 'Escritório Exemplo', logo: 'data:image/png;base64,AAAA', document: '12.345.678/0001-90', role: 'Assistente social', council: 'CRESS', councilNumber: '12345 - MG' }
      const intervals = { ...analysis, relations: [
        { id: 1, kind: 'employment', origin: 'EMPRESA EXEMPLO', start: '01/01/2020', end: '31/12/2020' },
        { id: 2, kind: 'benefit', origin: 'Benefício', start: '28/02/2024', end: '29/02/2024' },
      ] } as CnisAnalysis
      const html = renderToStaticMarkup(<BrandingProvider initialBranding={branding}><PrintReport analysis={intervals} sex="male"/></BrandingProvider>)
      expect(html).toContain('Escritório Exemplo')
      expect(html).toContain('RELATÓRIO PREVIDENCIÁRIO')
      expect(html).toContain('CPF/CNPJ: 12.345.678/0001-90')
      expect(html).toContain('Assistente social — CRESS — 12345 - MG')
      expect(html).toContain('data:image/png;base64,AAAA')
      expect(html).toContain('Duração do período')
      expect(html).toContain('1 ano')
      expect(html).toContain('2 dias')
  })
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

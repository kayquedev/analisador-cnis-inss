import { describe, expect, it } from 'vitest'
import { analyzeCnisText, formatMonths } from './cnis'

const fixture = `
CNIS - Cadastro Nacional de Informações Sociais
Extrato Previdenciário 21/11/2026 12:00:00
NIT: 123.45678.90-1 CPF: 123.456.789-00 Nome: PESSOA TESTE Data de nascimento: 01/01/1990
Relações Previdenciárias
1 123.45678.90-1 12.345.678 EMPRESA EXEMPLO 000001 Empregado ou Agente Público 01/01/2020 31/03/2020 03/2020
Indicadores: IREM-INDPEND
Remunerações
01/2020 1.039,00 02/2020 500,00 PSC-MEN-SM-EC103 03/2020 1.045,00
2 123.45678.90-1 RECOLHIMENTO Contribuinte Individual 01/05/2020 31/05/2020 IREC-INDPEND
Contribuições
05/2020 10/06/2020 52,25 1.045,00 IREC-MEI IREC-LC123
Valores Consolidados por Ano Civil
`

describe('CNIS parser', () => {
  it('extracts identity, relations and competencies', () => {
    const result = analyzeCnisText(fixture, 'teste.pdf', 1)
    expect(result.person.name).toBe('PESSOA TESTE')
    expect(result.relations).toHaveLength(2)
    expect(result.competencies).toHaveLength(4)
    expect(result.findings.some(item => item.id === 'minimum-02/2020')).toBe(true)
    expect(result.gaps).toEqual([{ start: '04/2020', end: '04/2020', months: 1 }])
  })
  it('formats potential time without pretending day precision', () => expect(formatMonths(26)).toBe('2 anos e 2 meses'))

  it('learns full CNPJ, benefits and rehiring without adding benefit time automatically', () => {
    const extendedFixture = `
CNIS - Cadastro Nacional de Informações Sociais
Extrato Previdenciário 27/08/2026 19:25:42
NIT: 123.45678.90-1 CPF: 123.456.789-00 Nome: PESSOA EXEMPLO Data de nascimento: 01/01/1970
1 12.345.678/0001-90 EMPRESA HISTORICA LTDA Empregado ou Agente
Público 13/08/1990 09/10/1997 10/1997 123.45678.90-1
Remunerações
10/1997 59,31
2 98.765.432 EMPRESA ATUAL LTDA Empregado ou Agente
Público 02/04/1998 13/04/2020 04/2020 123.45678.90-1 6
Indicadores: IREM-INDPEND
Remunerações
04/2020 964,37 PSC-MEN-SM- EC103
3 1111111111 31 - AUXILIO DOENCA PREVIDENCIARIO 02/10/2015 16/12/2015 2 - CESSADO 123.45678.90-1 Benefício
4 2222222222 31 - AUXILIO DOENCA PREVIDENCIARIO 21/09/2019 23/09/2019 2 - CESSADO 123.45678.90-1 Benefício
5 98.765.432 EMPRESA ATUAL LTDA Empregado ou Agente
Público 17/09/2020 07/2026 123.45678.90-1 498
Indicadores: IVIN-JORN-DIFERENCIADA, IREM-INDPEND
Remunerações
09/2020 743,87 PSC-MEN-SM- EC103 10/2020 1.594,00
Valores Consolidados por Ano Civil
`
    const result = analyzeCnisText(extendedFixture, 'anonimo.pdf', 10)
    expect(result.relations).toHaveLength(5)
    expect(result.relations[0].employerCode).toBe('12.345.678/0001-90')
    expect(result.relations.filter(item => item.kind === 'benefit')).toHaveLength(2)
    expect(result.relations.find(item => item.id === 3)?.benefitNumber).toBe('1111111111')
    expect(result.findings.some(item => item.id === 'rehire-2-5')).toBe(true)
    expect(result.findings.find(item => item.id === 'missing-2')?.description).not.toContain('11/2015')
    expect(result.excludedLowMonths).toBe(2)
    expect(result.extractionConfidence).toBe(100)
  })
})

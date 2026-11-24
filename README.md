# KODE CNIS

Aplicativo web para leitura local de Extratos Previdenciários CNIS em PDF. Organiza vínculos, remunerações, contribuições, indicadores e lacunas e produz alertas explicados.

## Privacidade

O PDF é processado no navegador com PDF.js. O projeto não possui backend e não envia o documento para terceiros. Não adicione extratos reais ao repositório.

## Executar

```bash
pnpm install
pnpm dev
```

## Verificar

```bash
pnpm test
pnpm lint
pnpm build
```

## Escopo

- vínculos e recolhimentos;
- benefícios previdenciários, NB, espécie e situação;
- competências e valores;
- indicadores conhecidos do CNIS;
- valores abaixo do salário mínimo a partir de novembro de 2019;
- lacunas entre vínculos e competências ausentes;
- estimativa de tempo potencial por competências.

## Aprendizado seguro do parser

Novos layouts são incorporados como regras generalizáveis e testes sintéticos anonimizados. Extratos reais são usados somente na validação local e não são incluídos no repositório nem usados para treinar um modelo com dados pessoais.

O resultado é apoio de conferência, não parecer jurídico nem reconhecimento oficial de tempo pelo INSS.

## Fontes normativas

- EC 103/2019, art. 29;
- orientações do INSS sobre ajustes para alcance do salário mínimo;
- Portaria DIRBEN/INSS 990/2022 e Anexo V de indicadores;
- Lei 8.213/1991, art. 29-A.

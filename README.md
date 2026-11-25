# KODE CNIS

Aplicativo web para leitura local de Extratos Previdenciários CNIS em PDF. Organiza vínculos, remunerações, contribuições, indicadores e lacunas e produz alertas explicados.

## Privacidade

O PDF é processado no navegador com PDF.js e não é enviado ao servidor. A API armazena contas, sessões e a identidade visual de cada usuário. Não adicione extratos reais, bancos de dados ou credenciais ao repositório.

## Executar

```bash
pnpm install
pnpm dev
```

A API usa Python 3.10+ e SQLite, sem dependências externas. Em outro terminal, defina `CNIS_DATABASE` para um arquivo local, `CNIS_ORIGIN=http://127.0.0.1:5173` e `CNIS_SECURE_COOKIE=0`, e execute `python server/app.py`. Em produção o cookie é Secure e o banco fica fora do diretório público.

Para criar o primeiro administrador, execute `python server/app.py --bootstrap` e forneça por entrada padrão um JSON com `cpf`, `name` e `password`. O comando recusa criar outro administrador se já existir um. Não salve a entrada no repositório. As senhas exigem no mínimo seis caracteres, uma letra e um número, e são armazenadas com PBKDF2-HMAC-SHA256 e salt individual.

O administrador cadastra acessos, desativa contas e redefine senhas na Administração. Cada conta edita apenas a própria identidade e pode alterar sua senha. A identidade antiga salva no navegador não é importada automaticamente para evitar associação à conta errada.

## Verificar

```bash
pnpm test
python -m unittest discover -s server -v
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

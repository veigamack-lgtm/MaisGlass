# MaisGlass — Briefing para revisão nº 4 (Codex): aba "Custo de operação" (rateio por m²)

Pedido do Gabriel (30/10/2026): uma aba onde ele cadastra os **custos fixos
mensais da fábrica** (aluguel do galpão, folha, energia, overhead, custo de
produção…) e a **produção média mensal em m²**, para que o custo de operação
possa ser **incorporado ou não** em cada simulação e em cada orçamento e
apareça no resultado (DRE). Regra central, nas palavras dele: o R$/m² é o custo
de **um mês de operação** dividido pela **produção média do mês** (ex.: 3.500
m²) — nunca pelos m² do orçamento em questão; a produção média é configurável
junto com os custos e ele a revisa antes de simular/orçar.

Decisões tomadas com ele antes de implementar: rateio **por m²** (não por %
do faturamento); padrão **ligado nos orçamentos novos e desligado nas
calculadoras** (as calculadoras continuam espelhando a planilha; liga-se para
simular). O custo **não muda o preço** (o preço ao cliente é digitado): entra
só no lucro/DRE.

Este documento diz o que foi feito, onde está, os números de referência e o
que pedimos que você confira antes de publicar. **Nada foi publicado ainda.**
Pacote: `index.html`, `app.js`, `calc.js`, `defaults.js`, `orcamento.js`,
`README.md`, `package.json` (2.1.1 → 2.2.0), `test/test.js`, `test/api.js`,
`test/ui.js` e este briefing. `termos.js`, `nuvem.js`, `api/` e `test/browser/`
não mudaram.

## 1. O que está intacto

- `calc.js → calcular()` (fórmulas da planilha): byte a byte igual — o teste
  `calcular() byte a byte igual ao aprovado` (hash SHA-256) continua passando.
  `calcularImportacao`, `dreImportacao`, `calcularRevenda`, `aliquotaPresumido`:
  **nenhuma linha alterada**. As 565 verificações anteriores de
  `test/test.js` continuam iguais (agora 644).
- Resultado de cada **item** de orçamento: idêntico. O custo de operação é
  decidido e somado na **consolidação** (como os custos internos), nunca no
  item — `validarResultadoItem` e as identidades da DRE do item não mudam, e
  um item adicionado pela calculadora com a caixa ligada **não** carrega o
  custo (teste "resultado do item não carrega custo de operação").
- `VERSAO_MOTOR` ('1.0') e `VERSAO_FORMATO` (1) **não** foram alterados: os
  motores dos itens são os mesmos e a consolidação só ganha uma linha
  **opcional**; subir a versão faria todo orçamento existente pedir
  "recalcule" sem necessidade. Se você entender que a mudança merece 1.1,
  dizer — é uma troca de duas constantes.
- API (`api/`): nenhuma mudança de código. O servidor valida configuração e
  orçamentos com os mesmos motores (`validar.js` → `validarConfig`,
  `migrarOrcamento`, `validarOrcamento`, `consolidar`), então o bloco novo
  passa a ser validado no servidor automaticamente (testes em `test/api.js`).
- Proposta impressa, termos, numeração, emissão/congelamento, sincronização:
  inalterados. O custo de operação **não sai na proposta**.

## 2. Modelo de dados

| Onde | Campo | Regra |
|---|---|---|
| `config.operacao` (`defaults.js`) | `producaoMensalM2` (número ≥ 0, padrão 0) | Produção média mensal da fábrica em m² — **base do rateio**. |
| | `itens[]` `{ id, categoria, descricao, valorMensal }` | Lançamentos mensais em R$. `categoria` ∈ `calc.js → CATEGORIAS_OPERACAO` (aluguel, pessoal, energia, manutencao, producao, administrativo, financeiro, outros); id único; valor ≥ 0; descrição texto. |
| | `padraoOrcamentos` (bool, padrão `true`) | Orçamento novo nasce com o custo aplicado. |
| | `padraoCalculadoras` (bool, padrão `false`) | Estado inicial da caixa nas três calculadoras ao abrir o app. |
| `orcamento.custoOperacao` (`orcamento.js`) | `{ aplicar: bool }` | Liga/desliga por orçamento. `novoOrcamento`: ligado quando `padraoOrcamentos` **e** `resumoOperacao(config).taxaM2 > 0` (com a aba ainda vazia nasce desligado — sem linha de R$ 0 nem aviso; foi o que os scripts Playwright antigos pegaram na 1ª rodada). `migrarOrcamento` completa **`{ aplicar: false }`** quando o campo não existe (orçamento anterior à aba): nenhum número muda sozinho. Objeto que não é objeto → "malformado"; `aplicar` não booleano → inválido. |
| `premissas.custoOperacaoDedutivel: true` | premissa declarada | Despesa dedutível no lucro real, sem crédito de PIS/COFINS — a mesma dos custos internos. |

`migrarConfig` completa o bloco pelo `merge` com o padrão (sem subir
`versao`, que só marca correções de valor); configurações congeladas em
orçamentos antigos **não têm o bloco** e continuam válidas (`validarConfig`
trata `operacao` como opcional).

## 3. Motor (`calc.js`, funções novas, puras)

```
resumoOperacao(config)   → { configurado, totalMensal, lancamentos, producaoMensalM2, taxaM2, avisos }
                            taxaM2 = Σ valorMensal (> 0) ÷ producaoMensalM2 ; 0 se não houver produção ou lançamentos (com aviso)
custoOperacaoDe(config, m2) → taxaM2 × m²  (0 se m² inválido/≤ 0)
dreComOperacao(config, dre, custo) → cópia de { real, presumido } com:
    lucroOperacional −= custo
    real:      irpjCsll = irpjCsllReal × max(0, lucroOperacional novo)
    presumido: irpjCsll inalterado (base é a receita)
    lucroLiquido, margemLiquida, margemSobreValorPago refeitos; tributosTotais = antes − IRPJ antigo + IRPJ novo
    receita, deduções, CMV, frete, cartão intocados; marca custoOperacaoAplicado = true (a interface mostra a linha)
```

Convenção: o custo entra **abaixo do lucro bruto**, ao lado de frete, cartão
e custos internos (despesa operacional), e não no CMV — não altera receita
líquida nem lucro bruto; no presumido não altera o imposto. `dreComOperacao`
recusa custo negativo e DRE sem `real`/`presumido`.

## 4. Orçamentos (`orcamento.js → consolidar`)

- `custoOperacao = aplicar ? resumoOperacao(configSnapshot).taxaM2 × Σ quantidade dos itens CALCULADOS : 0`
  — taxa **congelada** no `configSnapshot` (mudar a aba depois não altera o
  orçamento; "Recalcular com a configuração atual" substitui o snapshot e traz
  a taxa nova, como já faz com dólar e alíquotas). Item sem resultado não entra
  no rateio (não tem receita).
- Por regime: `t.custoOperacao`, `t.custoOperacaoAplicado`,
  `lucroOperacional = lucroBruto − frete − cartao − custosInternos − custoOperacao`;
  IRPJ/CSLL real sobre o lucro já reduzido; presumido = soma dos itens
  (inalterado). `totais.custoOperacao`; `totais.custoTotalReal` passa a incluir;
  nova fatia `operacao` na `composicao` (a composição continua fechando na
  receita bruta); bloco `consolidar().operacao` para a interface.
- Avisos (só quando ligado e há itens): sem lançamentos, sem produção média,
  ou snapshot anterior à aba ("use Recalcular…"). Desligado: nenhum aviso e
  números idênticos aos de antes desta rodada (teste "desligado: lucro
  operacional volta a subir exatamente 38.720").

## 5. Interface (`index.html`, `app.js`)

- **Aba "Custo de operação"** (entre Orçamentos e Configurações): tabela de
  lançamentos (categoria, descrição, R$/mês, R$/m² da linha, remover), total,
  "+ Adicionar custo mensal"; cartão "Base de rateio" com a **produção média
  mensal (m²)** e os dois padrões; à direita o R$/m² em destaque, a conta
  (total ÷ produção = R$/m²), um exemplo com 1.336 m² e os avisos. A aba edita
  o **mesmo `draft`** da aba Configurações (`ABAS_CONFIG = ['config',
  'operacao']`): mesmo autosave de 500 ms, mesmo `validarDraft`, mesma
  sincronização e mesmo `aplicarConfigRecebida`; `status()` escreve nas duas
  abas. Campos simples usam `data-cfg` (já lidos por `lerCamposSimples`); a
  tabela usa o padrão de `renderProdutos`. Não administrador: somente leitura
  (`aplicarPermissoes`), como Configurações.
- **Calculadoras**: caixa `in-/r-/n-custoOperacao` acima da DRE
  (`custoOperacaoCalc`): com a caixa ligada a DRE e os dois cartões de lucro
  líquido vêm de `dreComOperacao` e aparece a linha "(−) Custo de operação da
  fábrica"; o texto ao lado mostra `R$/m² × m² = R$ (total ÷ produção)` ou o
  que falta cadastrar. O quadro de composição do custo, o "Lucro" da planilha
  e o gráfico **não mudam** (teste "Lucro da planilha não muda"). Estado
  inicial = `padraoCalculadoras`.
- **Editor do orçamento**: cartão "Custo de operação da fábrica" com a caixa
  "Incorporar…" (travada após a emissão, como custos internos) e o detalhe da
  taxa congelada × m² (e, quando a taxa atual difere, a frase "a configuração
  atual está em R$ X/m² — Recalcular atualiza"); linha própria na DRE
  consolidada (só quando ligado), fatia própria no gráfico "Para onde vai o
  valor pago", menção no resumo do total e na nota de premissas.
- **Aviso "configuração diferente da congelada"** (`configCalculo`): o bloco
  `operacao` só entra na comparação **quando o orçamento aplica** o custo —
  orçamentos antigos (snapshot sem o bloco) e orçamentos desligados não
  acendem o aviso por causa dele (teste em `test/ui.js`).

## 6. Números de referência

Custos: 15.000 aluguel + 42.000 pessoal + 6.500 energia + 6.500 administrativo
= **R$ 70.000/mês**; produção média **3.500 m²/mês** → **R$ 20,00/m²**.

| Cenário | Antes | Depois (ligado) |
|---|---|---|
| Planilha (Laminado 4+4, 1.336 m², RJ, à vista) — custo de operação | — | **26.720,00** |
| Lucro operacional real | 84.765,33 (= "Lucro" da planilha, inalterado) | 58.045,33 |
| IRPJ/CSLL real (34%) | 28.820,21 | 19.735,41 |
| Lucro líquido real | 55.945,12 | **38.309,92** (= 55.945,12 − 26.720 × 66%) |
| IRPJ/CSLL presumido | 6.797,78 | 6.797,78 (inalterado) |
| Lucro líquido presumido | 82.364,69 | 55.644,69 |
| Revenda §4 (600 m²): custo 12.000 → lucro operacional | 12.362,37 | 362,37 (IRPJ real 123,21); presumido −2.416,60 |
| Orçamento: importação 1.336 m² + revenda 600 m² (+ item sem resultado 999 m²) | — | 20 × 1.936 = **38.720,00** |
| Mesmo orçamento com snapshot a 7.000 m²/mês | — | 19.360,00 (vale a taxa congelada) |

## 7. Testes

- `node test/test.js` → **645** verificações (eram 565): bloco "Custo de
  operação" — configuração (padrão, validação de cada campo, migração sem subir
  versão, cópia não compartilhada), resumo/rateio (taxa, m² em texto, sem
  produção, sem lançamentos, sem bloco, lançamento zerado), `dreComOperacao`
  (identidades nos dois regimes, DRE de origem intacta, prejuízo → IRPJ 0,
  custo negativo recusado, revenda §4), orçamentos (nasce ligado/desligado
  conforme padrão e configuração, rateio só dos calculados, IRPJ sobre o lucro
  reduzido, composição fecha, desligado = números antigos, taxa congelada,
  avisos, validação, migração, `aplicaCustoOperacao`, item sem custo).
- `node test/api.js` → **79** (eram 73): PUT de configuração com o bloco
  (gravado e lido íntegro), valor negativo e categoria desconhecida → 400,
  configuração antiga aceita e migrada. (A expectativa "config versão 2" da
  carga completa virou 4 por causa das duas gravações novas.)
- `node test/ui.js` (jsdom) → **251** (eram 223): aba (taxa antes do
  autosave, salvamento, servidor), calculadora (desligada por padrão, ligar
  muda só a DRE em 17.635,20 e o "Lucro" da planilha não muda), orçamento
  (nasce ligado, snapshot com a taxa, item sem custo, servidor aceita,
  desligar grava e some a linha, aviso de configuração só quando ligado,
  Recalcular traz a taxa nova, emissão trava a caixa).
- `node test/termos.js` → 52 (inalterado). Playwright (`test/browser/
  todos.js`, Chromium): os **13 scripts existentes, sem alteração, 318
  verificações, todos OK** — na 1ª rodada o `orc.js` pegou 2 falhas (orçamento
  novo com a aba vazia mostrava linha de R$ 0 e aviso), corrigidas pela regra
  "nasce ligado só quando há taxa cadastrada" (§2).
- Conferência visual em Chromium (servidor local): aba preenchida, calculadora
  com a caixa ligada e orçamento com a fatia nova — capturas enviadas junto
  com este pacote (fora do repositório).

## 8. O que pedimos que você confira

1. **Convenção da DRE**: custo de operação como despesa operacional abaixo do
   lucro bruto, dedutível no real e neutro no presumido — está coerente com o
   tratamento dos custos internos e com a estimativa gerencial declarada?
2. **Base do rateio**: m² vendidos dos itens calculados (`inputs.quantidade`),
   não os m² com perda (`qtdComPerda`). A produção média da aba é "m² vendidos
   /beneficiados por mês". Faz sentido manter as duas na mesma medida?
3. **Migração silenciosa**: orçamentos anteriores nascem desligados; o padrão
   "ligado" vale só para orçamentos novos criados depois de a aba ter taxa.
   Alternativa seria aplicar o padrão também aos rascunhos antigos — preferimos
   não mudar número salvo.
4. **Aviso de configuração**: `operacao` entra na comparação só quando o
   orçamento aplica o custo. Algum caso em que isso esconde uma divergência
   relevante?
5. **`VERSAO_MOTOR`** mantida (item 1).
6. Qualquer coisa na aba nova (acessibilidade, leitura para não administrador,
   autosave compartilhado com Configurações) que mereça ajuste.

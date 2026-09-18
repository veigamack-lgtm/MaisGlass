# MaisGlass — Briefing para revisão nº 3 (Codex): módulo Orçamentos implementado

Implementação do `PROJETO-ORCAMENTO.md` v2 (aprovado em 18/09/2026 após o seu
parecer e a `RESPOSTA-PARECER-ORCAMENTO.md`). Este documento diz o que foi
feito, onde está, os números de referência e o que pedimos que você confira
antes de subirmos para o GitHub. Pacote: `index.html`, `app.js`, `calc.js`,
`defaults.js`, **`orcamento.js` (novo)**, `test/test.js` (`node test/test.js`
→ **433 verificações**, eram 313), `README.md`, este briefing, e os documentos
do projeto. Nada foi publicado ainda.

## 1. O que está intacto

- `calc.js → calcular()` (importação direta, fórmulas da planilha): **byte a
  byte igual** ao aprovado na rodada 2 — o teste `calcular() byte a byte igual
  ao aprovado` compara o SHA-256 de `calcular.toString()` com o hash gravado
  (`7ea1056b…91ed1`). As 313 verificações anteriores continuam iguais, exceto
  três referências do presumido atualizadas pela decisão D-B (abaixo).
- `calcularRevenda()`: uma linha mudou — o IRPJ/CSLL presumido passou a usar
  `aliquotaPresumido(tb)` (mesma fórmula, com o fator da LC 224). Lucro real,
  ICMS, DIFAL, FCP, IPI, PIS/COFINS: idênticos.
- Interface das três abas: só rótulos (destinatário), FCP na aba de importação
  direta, botão "Adicionar ao orçamento" e rodapés de premissa.

## 2. Fase 1a — mudanças nas calculadoras (§3 do projeto)

| Item | Onde | Regra |
|---|---|---|
| FCP na importação direta (D-A) | `calc.js → calcularImportacao(config, inputs)` | Envelope sobre `calcular()`. Consumidor final fora de MG: FCP% = `config.revenda.fcp[uf]`; `null` → 0% + aviso (não bloqueia — a planilha nunca bloqueou e 25 UFs estão sem FCP). FCP = B15 × FCP% (mesma base do DIFAL); preço final = B18 + FCP; FCP na base do PIS/COFINS (SC Cosit 61/2024): pis += FCP×1,65%, cofins += FCP×7,6%; custo total += FCP + ΔPIS + ΔCOFINS; lucro = preço final − custo total. Saída = campos de `calcular()` + `fcpPct, fcp, fcpConfirmado, quantidade, avisos`. |
| DRE da importação com FCP | `calc.js → dreImportacao` | Lê `r.fcp`; linha `difalFcp`; `ipi: 0` (uniformidade); base do PIS/COFINS presumido inclui o FCP. Continua funcionando com o resultado de `calcular()` puro (fcp ausente = 0). |
| Presumido com adicional (D-B) | `defaults.js → tributos.irpj` 0,15 → **0,25**; `migrarConfig` v4 | Só troca se o valor salvo for 0,15; ajuste manual preservado; idempotente. IRPJ/CSLL presumido = 3,08% da receita sem IPI (era 2,28%). |
| LC 224/2025 (D-C) | `tributos.lc224` (padrão `false`); `calc.js → aliquotaPresumido(tb)` | Fator 1,1 nos percentuais de presunção (8,8% / 13,2%) quando `true`. Configurações → "Receita anual acima de R$ 5 milhões?". |
| Rótulos de destinatário (§3.3) | `index.html`, `AJUDA` | "Consumidor final não contribuinte (construtora, PF, sem IE)" / "Contribuinte que revende/industrializa (com IE)"; nota "contribuinte comprando para uso próprio/ativo não é coberto". |
| Marca IPI não destacado (§3.4) | `calcularImportacao` (nota) e itens do orçamento | "IPI não destacado na venda (regime da planilha) — pendente de confirmação com a contadoria (RIPI art. 9º, I)". |
| Dados da empresa / padrões da proposta | `defaults.js → empresa, proposta`; `validarConfig` | Texto; `proposta.validadeDias` inteiro 0–365. |

**Números de referência (cenário da planilha: Laminado 4+4, 1.336 m², R$ 140,
RJ consumidor final, à vista):** B15 187.040,00 · DIFAL 29.926,40 · preço final
da planilha 216.966,40 · lucro da planilha 85.111,36 (inalterados em
`calcular()`). Com FCP: FCP 3.740,80 · preço final **220.707,20** · PIS 2.006,11
· COFINS 9.252,12 · custo total 135.941,87 · lucro **84.765,33** (= 85.111,36 −
3.740,80 × 9,25%). DRE: real líquido 55.945,12 (IRPJ/CSLL 28.820,21); presumido
líquido 82.364,69 (IRPJ/CSLL 6.797,78 = 3,08% × 220.707,20).

Presumido v4 nos cenários antigos: revenda §4 (600 m², 69,70 → 125, RJ) lucro
líquido presumido **9.583,40** (era 10.146,78; IRPJ/CSLL 2.169,01); nacional
interno MG 350 mil: **65.227,03** (era 67.856,13 com 15%). Lucro real inalterado
(8.159,16 e 50.937,64).

## 3. Fase 1b — `orcamento.js` (§5–§6 do projeto)

`GM_ORC = { novoOrcamento, premissasDe, cabecalhoDe, aplicarCabecalho,
divergenciasCabecalho, calcularItem, adaptarDre, consolidar, validarOrcamento,
conferirResultados, migrarOrcamento, gerarId, VERSAO_MOTOR '1.0',
VERSAO_FORMATO 1 }`. Puro; em Node faz `require('./calc.js')`.

- `novoOrcamento(config, dados)`: premissas (`irpjCsllReal, irpj, csll,
  presumidoBase*, pis/cofinsCumulativo, lc224, custosInternosDedutiveis: true,
  creditoFreteContratado: false, arredondamento: 'exibicao', versaoMotor`),
  `configSnapshot` (cópia integral), `empresa` (cópia), condições vindas de
  `config.proposta`.
- `calcularItem(config, cabecalho, item)`: `aplicarCabecalho` sobrescreve
  `uf`/`clienteUF`, `contribuinte` (= destinatário `contribuinteRevenda`),
  `pagamento`, `bandeira`, `parcelas`; despacha: importação →
  `calcularImportacao` + `dreImportacao` (avisos = FCP não confirmado);
  revenda/nacional → `calcularRevenda` (erro do motor propaga, ex.: FCP null).
- `adaptarDre(origem, resultado)`: convenção única. Importação direta (real):
  `créditos = qtd × (creditoPisM2 + creditoCofinsM2)`; `pisCofins += créditos`;
  `deducoes += créditos`; `cmv −= créditos`; receita líquida e lucro bruto
  refeitos; lucro operacional inalterado (teste). Presumido da importação não
  muda (não há créditos). Calcs 2/3: cópia.
- `consolidar(orcamento)`: linhas aditivas `receitaBruta, ipi, icms, difalFcp,
  pisCofins, deducoes, cmv, frete, cartao`; `custosInternos = Σ fixos + Σ
  percentual × receitaBruta`; `lucroOperacional = lucroBruto − frete − cartao −
  custosInternos`; **real: irpjCsll = max(0, lucroOp) × premissas.irpjCsllReal**;
  **presumido: Σ irpjCsll dos itens**; margens dos totais (`null` = n/a);
  `tributosTotais = Σ(item − irpj_item) + irpj_consolidado`; `custoTotalReal =
  Σ custoTotal dos itens + custos internos`; `reducaoPotencial` (informativa,
  só com prejuízo); `composicao` (deduções + IRPJ | CMV | frete + cartão |
  internos | lucro líquido — fecha no total pago); avisos (item sem resultado,
  FCP não confirmado, frete cobrado + custo interno de transporte).
- `validarOrcamento`: estrutura, UF, destinatário, pagamento/parcelas,
  premissas e snapshot presentes, origem, `inputs` coerentes com o cabeçalho
  (via `divergenciasCabecalho`), resultado finito com DRE, custos (tipo; valor
  **ou** percentual; 0 ≤ % ≤ 1), ids únicos, status, formato futuro.
- `conferirResultados`: recalcula cada item com `configSnapshot` e compara
  `precoFinal/custoTotal/lucro` (tolerância 0,005) — usado na importação de
  JSON (itens divergentes ganham aviso).

**Orçamento de referência (3 itens, RJ consumidor final, à vista, config
padrão):** importação (planilha, 1.336 m²), revenda §4 (600 m²), nacional
2.000 m² a 175 fechado para RJ. Lucros dos itens 84.765,33 · 12.362,37 ·
63.825,74. Consolidado: total ao cliente **645.707,20**; DRE real: IPI
25.938,97 · ICMS 47.805,60 · DIFAL+FCP 82.167,20 · PIS/COFINS 46.438,35 ·
receita líquida 443.357,08 · CMV 282.403,64 · lucro bruto = lucro operacional
**160.953,44** (= Σ lucros) · IRPJ/CSLL real 54.724,17 (34%) · líquido real
**106.229,27** · IRPJ/CSLL presumido 19.088,86 (soma) · líquido presumido
143.430,61 · tributos totais 188.169,49. Com custos internos frete contratado
6.000 + comissão 2% (12.914,14): internos 18.914,14 · lucro operacional
142.039,30 · IRPJ real 48.293,36 · líquido real 93.745,94 · líquido presumido
124.516,47 (IRPJ presumido inalterado).

## 4. Fase 2/3 — interface (`index.html`, `app.js`)

- Aba **Orçamentos** (nav + card 4 na Home): lista (cliente, revisão,
  atualizado, itens, total, lucro líquido real, status) e editor.
- Editor: cabeçalho (cliente, contato, UF de destino, destinatário,
  pagamento/bandeira/parcelas, validade, prazo, data prevista, inclusos,
  observações, status), custos internos (tipo, descrição, fixo ou % do total,
  valor calculado), hero (total ao cliente; custo total antes de IRPJ/CSLL —
  cenário real; lucro operacional), lucro líquido real × presumido, barra de
  composição, avisos, tabela de itens (origem, descrição editável, m², R$/m²,
  total, custo, lucro, margem; ▲▼ / Carregar / Duplicar / Remover), DRE
  consolidada com rodapé de premissas, proposta (pré-visualização).
- **Botão "Adicionar ao orçamento: ‹cliente›"** nas três abas: desabilitado
  sem orçamento aberto ou com orçamento travado; se a calculadora diverge do
  cabeçalho, `confirm` listando as diferenças; calcula com o `configSnapshot`
  do orçamento e avisa quando a configuração viva é outra. "Carregar" abre a
  aba de origem com as entradas do item; o botão vira "Substituir item …"
  (com "Adicionar como novo item").
- Mudar UF/destinatário/pagamento com itens: recalcula todos com o
  `configSnapshot`, mostra total/lucro antes → depois, `confirm`; falha em
  qualquer item **desfaz** (verificado: UF SP com item de revenda → "FCP de SP
  não confirmado", UF volta a RJ).
- **Recalcular com a configuração atual**: mesma mecânica com a config viva;
  substitui itens, premissas, snapshot e versão do motor só após confirmar;
  cancelar ou falhar → nada muda.
- Status enviado/aprovado: trava cabeçalho (menos status), itens, custos e
  botões de adicionar; fixa `empresa` na emissão; de enviado só avança
  (aprovado/perdido). **Nova revisão** duplica como rascunho rev. n+1
  (`revisaoDe`); a anterior fica na lista.
- Persistência: `localStorage glassmais.orcamentos.v1`; autosave 500 ms;
  gravação mescla com o disco por id; conflito entre abas (`atualizadoEm` do
  disco mais novo que o conhecido) → `confirm` antes de sobrescrever; falha ao
  gravar → status "não salvo — exporte"; aviso acima de 4 MB; orçamento atual
  lembrado por `sessionStorage`.
- Exportar/Importar JSON: importação migra, valida, `conferirResultados`,
  gera id novo se colidir, marca itens divergentes.
- **Proposta impressa**: `@media print` esconde tudo menos `.card-proposta`
  (verificado no PDF: 1 página; dados da empresa, nº/rev., data, validade,
  cliente, tabela com unitário arredondado, total, pagamento, entrega,
  inclusos, observações + nota fixa de impostos inclusos / não cobre
  obrigações do destinatário).
- Ajuda "?" nos 14 campos do cabeçalho (`AJUDA.orc`).

## 5. Testes

`node test/test.js` → 433 OK. Novos blocos: "Fase 1a: calcularImportacao
(FCP)" (24), "Fase 1a: presumido v4 e LC 224/2025" (13), "Fase 1b:
novoOrcamento / calcularItem / adaptarDre" (21), "três itens juntos" (12),
"custos internos, comissão %, prejuízo" (17), "cabeçalho manda / recalcular /
congelamento" (10), "validação e migração" (23). Cobrem: item sozinho =
consolidado (lucro e líquido; linhas adaptadas), linhas aditivas somam, IRPJ
real recalculado × presumido somado, margens dos totais, consistência receita −
custo = lucro, composição fecha, tributos totais, reordenar, dividir item em
dois, custos internos (−3.400 de IRPJ; presumido igual), comissão %, prejuízo
(imposto 0, redução potencial 1.700), compensação entre itens, sem itens com
custos, cabeçalho sobrescreve (UF, destinatário, pagamento, bandeira,
parcelas), divergências, config viva não altera o consolidado, recalcular só
afeta importação com o dólar, snapshot intacto até aplicar, premissa nova
após aplicar, `conferirResultados` (coerente / adulterado), 17 validações
negativas, migração, erros do motor propagados, hash de `calcular()`.

Playwright (fora da suíte Node): fluxo completo — novo → adicionar das três
abas → custos (fixo e %) → UF SP bloqueada e revertida → contribuinte
recalcula (DIFAL+FCP 0) → config muda (aviso) → Recalcular (aviso some) →
Carregar/Substituir → impressão isola a proposta → exportar → importar
adulterado (aviso) → enviado trava → nova revisão → reload restaura → duas
abas detectam conflito → mobile sem overflow. Migração v3 → v4 no navegador.

## 6. O que pedimos que você confira

1. `adaptarDre` da importação direta (§3): a reapresentação preserva o lucro e
   os créditos aparecem uma vez só; o ICMS efetivo em linha única é a
   simplificação declarada.
2. `consolidar`: IRPJ real sobre `max(0, lucroOp)` consolidado, presumido
   somado, `tributosTotais`, composição, `custoTotalReal`.
3. `calcularImportacao`: FCP na base do PIS/COFINS e fora da base do ICMS
   efetivo (como o DIFAL na planilha); política de não bloquear UF sem FCP na
   calc 1 (calcs 2/3 seguem bloqueando).
4. `aliquotaPresumido` e migração v4; os números de referência do presumido.
5. Atomicidade (mudança de cabeçalho, recálculo, importação) e a detecção de
   duas abas em `app.js → gravarOrcamentos`.
6. Proposta: arredondamento do unitário (total ÷ m², 2 casas) e nota de
   diferença de centavos; nada interno vaza na impressão.
7. Qualquer cenário fiscal que os motores não representem e que o módulo
   devesse sinalizar e não sinaliza.

Pendências com a contadora continuam as do projeto §10 (crédito do frete
contratado, IPI na saída da importação direta, FCP das demais UFs,
enquadramento de venda com instalação, custo real do frete ≠ cobrado).

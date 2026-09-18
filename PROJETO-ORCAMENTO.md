# MaisGlass — Projeto do módulo "Orçamentos" — versão 2 (após o parecer do Codex)

Plano da quarta tela do app **MaisGlass Calculadora**: compor um orçamento
para um cliente com vários itens vindos das três calculadoras (importação
direta, revenda de importado, indústria nacional), custos internos, DRE
consolidada real × presumido e proposta impressa.

**Histórico.** v1 em 17/09/2026; parecer do Codex no mesmo dia; resposta
item a item em `RESPOSTA-PARECER-ORCAMENTO.md`; decisões do dono em 18/09.
Esta v2 incorpora tudo. O §12 lista o que mudou. **Implementada em 18/09/2026**
(fases 1a, 1b, 2 e 3) — ver `BRIEFING-REVISAO-3.md` para o que foi feito e os
números de referência; aguarda a validação do Codex antes de subir. Estado atual do app: `index.html`,
`app.js`, `calc.js`, `defaults.js`, `test/test.js` (313 verificações).

---

## 1. Objetivo

Cada calculadora precifica um item por vez. Um orçamento real para uma
construtora tem vários itens, de origens diferentes. O dono precisa de: (1)
cadastrar o cliente e ir adicionando itens de qualquer calculadora, sem limite
de quantidade nem de combinação de origens, cada item com as próprias
entradas; (2) o consolidado — quanto o cliente paga, quanto custa, quanto
sobra, por item e no total; (3) a DRE do orçamento (real × presumido) com os
custos internos descontados; (4) uma proposta imprimível sem custo, lucro ou
impostos internos.

## 2. Decisões tomadas com o dono

| # | Decisão | Consequência |
|---|---|---|
| D1 | Frete e custos adicionais do orçamento são **custo interno**: não vão para a NF, não entram em receita nem em base de imposto. | Seção "Custos internos". O "frete cobrado na NF" continua por item (já existe nos motores), com a regra anti-dupla-contagem do §8. |
| D2 | Itens **congelados** no momento em que são adicionados; botão **Recalcular** refaz tudo com a configuração atual e mostra o que mudou antes de aplicar. | Snapshot de entradas + resultado por item; **premissas e configuração congeladas por orçamento** (§5). |
| D3 | **Proposta para o cliente** imprimível (itens, quantidades, preços, condições). | Vista de impressão; dados da empresa em Configurações, copiados para o orçamento na emissão. |
| D4 | Salvar no **navegador + exportar/importar JSON**. Sem servidor. | Chave `glassmais.orcamentos.v1`; JSON autocontido, com validação e recálculo na importação. |
| D5 | `calcular()` da importação direta **não muda**; empresa fixa em MG. | O módulo consome os motores; o que precisa mudar nas calculadoras entra por **wrapper** (§3). Motor do orçamento em `orcamento.js`. |
| D-A | **FCP também na importação direta** — o regime especial da MaisGlass não afasta o FCP. | Wrapper `calcularImportacao()` acrescenta o FCP sem tocar `calcular()` (§3.1). |
| D-B | **Adicional de IRPJ incluído nas duas colunas** da DRE (real e presumido). | `tributos.irpj` 0,15 → 0,25 no padrão, migração v4 (§3.2). |
| D-C | MaisGlass **abaixo de R$ 5 mi/ano**: LC 224/2025 desligada por padrão. | Parâmetro em Configurações, padrão "não"; congelado nas premissas do orçamento (§3.2). |
| D-D | Comissão pode ser **percentual** do total ao cliente. | Custo interno com `valor` fixo **ou** `percentual` (calculado no consolidado). |
| D-E | Orçamento **enviado/aprovado trava a edição**; "Nova revisão" duplica com número de revisão. | Status + `revisao` no modelo (§5, §8). |

## 3. Pré-requisitos nas calculadoras (Fase 1a — antes do orçamento)

São mudanças pequenas nas abas existentes, necessárias para o consolidado
somar coisas comparáveis. Todas validadas pelo Codex junto com o resto.

### 3.1 FCP na importação direta — `calc.js → calcularImportacao(config, inputs)`

A tabela DIFAL da planilha é `interna − 4%` e não soma o FCP do destino; a
calc 2 cobra (memorial da contadora), a calc 1 não. Wrapper, sem alterar
`calcular()`:

```
r = calcular(config, inputs)                         // intacto (313 testes + hash)
fcpPct = (!contribuinte && uf ≠ MG) ? config.revenda.fcp[uf] : 0
  · número → aplica;  · null → fcpPct = 0 e nota "FCP de <UF> não confirmado — verifique com a contadoria"
    (a calc 1 NÃO bloqueia como a calc 2: a planilha nunca bloqueou e 25 UFs ainda estão sem FCP cadastrado;
     o orçamento repete a nota no item)
fcp        = r.precoComTaxa × fcpPct                 // mesma base do DIFAL da planilha (B15)
precoFinal = r.precoComTaxa + r.difal + fcp          // FCP cobrado a mais do cliente, como o DIFAL
PIS/COFINS: base + fcp (FCP fica na base — SC Cosit 61/2024, mesma regra da calc 2):
  pis += fcp × pis%;  cofins += fcp × cofins%
custoTotal += fcp + Δpis + Δcofins;  lucro = precoFinal − custoTotal;  markup e precoVendaM2 recalculados
saída: os mesmos campos de calcular() + fcpPct, fcp, mais notas
```

Efeito: DIFAL neutro (repasse) continua; o lucro cai só pelo PIS/COFINS sobre
o FCP (RJ: 2% × 9,25% ≈ 0,19% do preço). `dreImportacao()` passa a ler
`r.fcp` (linha "DIFAL + FCP"). A aba passa a exibir "FCP (%)" e "Valor do
FCP" e a chamar o wrapper; **testes**: cliente em MG ou contribuinte →
resultado idêntico a `calcular()`; RJ não contribuinte → fcp = 2% × B15,
precoFinal = B18 + fcp, pis/cofins com Δ; UF com FCP null → igual a
`calcular()` + nota. `calcular()` continua byte a byte igual (hash no teste).

### 3.2 Presumido com adicional de IRPJ e LC 224/2025

Hoje o real usa 34% (com adicional de 10%) e o presumido usa IRPJ 15% sem
adicional — premissas contrárias. Unificar: `defaults.tributos.irpj` 0,15 →
**0,25**; `migrarConfig` v4 troca só se o valor salvo for 0,15. IRPJ/CSLL
presumido passa de 2,28% para 3,08% da receita sem IPI, nas três abas. Não
toca `calcular()` (a DRE da importação é `dreImportacao`).

LC 224/2025 (publicada 26/12/2025; +10% nos percentuais de presunção sobre a
receita anual acima de R$ 5 mi; liminares em discussão): parâmetro
`tributos.lc224` (booleano, padrão **false**). Quando true, `presumidoBaseIRPJ`
e `presumidoBaseCSLL` efetivos são × 1,1 (8,8% / 13,2%) — premissa marginal
(orçamento inteiro na parcela excedente). Congelado nas premissas do orçamento.

Rótulos: "IRPJ/CSLL — estimativa gerencial (alíquota marginal; premissa:
empresa acima da faixa do adicional)" e "se fosse lucro presumido —
simulação". Rodapé da DRE nas três abas e no orçamento.

### 3.3 Rótulos de destinatário (só texto, três abas + orçamento)

Opções: **"Consumidor final não contribuinte (construtora, pessoa física,
empresa sem IE)"** e **"Contribuinte do ICMS que revende ou industrializa
(com IE)"**. "?" avisa: contribuinte comprando para uso próprio ou ativo não é
coberto (o DIFAL é dele; o IPI entra na base do ICMS) — falar com a
contadoria. Nenhuma mudança de motor.

### 3.4 Marca "IPI não destacado" na importação direta

Importador é equiparado a industrial (RIPI art. 9º, I); a planilha trata o
IPI da importação como custo e não destaca na venda. Pendência com a
contadora; até lá a aba e o orçamento marcam os itens de importação direta
com "IPI não destacado na saída (regime da planilha — pendente confirmação)".
Se a contadora mandar destacar, é rodada própria na calc 1.

## 4. Fluxo de uso

1. **Aba "Orçamentos"** (entre "Indústria nacional" e "Configurações"; card
   na Home): lista (cliente, data, revisão, nº de itens, total ao cliente,
   lucro líquido real, status) + "Novo orçamento".
2. **Cabeçalho**: cliente, contato, **UF de destino (entrega = faturamento)**,
   **destinatário** (§3.3), **condição de pagamento** (à vista | parcelado +
   bandeira + parcelas), validade (dias), prazo de entrega, data prevista da
   operação (informativa), "o que está incluso" (frete / instalação / texto
   livre — alimenta a proposta), observações. Autosave 500 ms. O orçamento
   aberto vira o **"orçamento atual"** (um por vez).
3. Nas três calculadoras: botão **"Adicionar ao orçamento: ‹cliente›"**. Ao
   clicar, o app lê as entradas da aba, **substitui os campos do cliente pelos
   do cabeçalho** (UF, destinatário, pagamento, bandeira, parcelas), roda o
   motor com a **configuração congelada do orçamento** e guarda o item. Se a
   aba estava com cliente diferente, pergunta antes ("a calculadora está em SP
   contribuinte; o orçamento é RJ consumidor final — adicionar recalculando
   para o orçamento?"). Se a configuração viva difere da congelada (dólar
   mudou), avisa: "este orçamento está congelado com dólar 5,30; o item será
   calculado com 5,30 — use Recalcular para atualizar tudo".
4. **Tela do orçamento**: itens (tabela: nº, origem, descrição editável, m²,
   R$/m², total ao cliente, custo, lucro, margem; carregar na calculadora /
   substituir / duplicar / remover / reordenar); custos internos; resumo
   (hero); DRE consolidada; composição; botões Recalcular, Imprimir
   proposta, Nova revisão, Duplicar, Exportar, Importar, Excluir.
5. **Recalcular** (D2): roda todos os itens com a configuração **atual** e os
   campos do cabeçalho; mostra diferença por item e total; só aplica após
   confirmar, e aplica tudo ou nada (snapshot da config e premissas também).
6. **Status** (D-E): rascunho → enviado → aprovado/perdido. Enviado e
   aprovado **travam** cabeçalho, itens e custos (botões desabilitados, com o
   motivo). "Nova revisão" duplica como rascunho com `revisao + 1` e mantém a
   anterior intacta; a lista mostra "rev. 2 (de rev. 1 enviada em …)".

## 5. Modelo de dados

```js
{
  id: 'orc_20260917_1a2b', versaoFormato: 1, versaoMotor: '1.0',
  revisao: 1, revisaoDe: null,             // id da revisão anterior, se houver
  criadoEm, atualizadoEm, enviadoEm: null, status: 'rascunho',   // rascunho | enviado | aprovado | perdido
  cliente: { nome, contato, uf: 'RJ', destinatario: 'consumidorFinal' },   // consumidorFinal | contribuinteRevenda
  condicoes: { pagamento: 'À vista', bandeira: 'Visa', parcelas: 1, validadeDias: 15, prazoEntrega: '',
               dataPrevista: null, inclusos: { frete: false, instalacao: false, texto: '' }, observacoes: '' },
  empresa: { razaoSocial, cnpj, endereco, telefone, email },     // copiado de Configurações na emissão
  premissas: { irpjCsllReal: 0.34, irpj: 0.25, csll: 0.09, presumidoBaseIRPJ: 0.08, presumidoBaseCSLL: 0.12,
               pisCumulativo: 0.0065, cofinsCumulativo: 0.03, lc224: false,
               custosInternosDedutiveis: true, creditoFreteContratado: false, arredondamento: 'exibicao' },
  configSnapshot: { … cópia integral da config usada (≈10 KB) … },
  itens: [ { id, origem: 'importacao' | 'revenda' | 'nacional', descricao,
             inputs: { … objeto que a aba passa ao motor, já com os campos do cabeçalho … },
             calculadoEm, resultado: { … retorno do motor + dre … }, avisos: [ 'FCP de PE não confirmado', … ] } ],
  custosInternos: [ { id, tipo: 'transporteProprio' | 'freteContratado' | 'instalacao' | 'comissao' | 'outros',
                      descricao, valor: 3500, percentual: null } ]        // ou valor: null, percentual: 0.02 (do total ao cliente)
}
```

- Totais **não** são salvos; `consolidar(orcamento)` recalcula ao abrir, só
  com o que está no orçamento (premissas + snapshots) — nada da config viva.
- `versaoFormato` (JSON) e `versaoMotor` (`orcamento.js`) são separadas.
  Importar recusa formato futuro; motor diferente gera aviso "calculado com
  1.0; recalcule para 1.1", não bloqueio.
- Tamanho: item 3–6 KB + config 10 KB por orçamento; aviso acima de 4 MB.

## 6. Motor de consolidação — `orcamento.js` (puro, sem DOM, sem estado global)

`GM_ORC = { calcularItem, adaptarDre, consolidar, validarOrcamento, migrarOrcamento, VERSAO_MOTOR }`.

**`calcularItem(config, cabecalho, item)`** — copia `item.inputs`, sobrescreve
`uf`/`clienteUF`, `contribuinte`, `pagamento`, `bandeira`, `parcelas` a partir
de `cabecalho`, despacha pela origem (`calcularImportacao` + `dreImportacao`
| `calcularRevenda`) e devolve `{ inputs, resultado, avisos }`. Lança erro com
mensagem quando o motor lança (FCP null na calc 2/3 etc.).

**`adaptarDre(origem, resultado)`** — reapresenta a DRE de cada item numa
**convenção única**: deduções = débitos cheios; CMV = custo líquido dos
créditos. Calcs 2/3 já estão nessa convenção. Importação direta:

```
pisCofins (dedução) = pis + cofins + qtd × (importacao.creditoPisM2 + importacao.creditoCofinsM2)
cmv                 = custoSemImposto − qtd × (creditoPisM2 + creditoCofinsM2)
ipi = 0 (com marca §3.4);  icms = efetivo do regime especial (linha rotulada);  difalFcp = difal + fcp
lucroOperacional = inalterado (teste)
```

O ICMS da importação direta não decompõe em débito/crédito (14% e 1,5% são
efetivos); a linha consolidada é rotulada "ICMS próprio — débito (revenda e
nacional) / efetivo do regime especial (importação direta)". Simplificação
declarada; a tabela de itens dá o detalhe por origem.

**`consolidar(orcamento)`** — para cada regime:

```
linhas aditivas (soma das DREs adaptadas): receitaBruta, ipi, icms, difalFcp, pisCofins, deducoes, cmv, frete, cartao
receitaLiquida = receitaBruta − deducoes;  lucroBruto = receitaLiquida − cmv
custosInternos = Σ valor fixo + Σ percentual × receitaBruta
lucroOperacional = lucroBruto − frete − cartao − custosInternos
irpjCsll: real      = max(0, lucroOperacional) × premissas.irpjCsllReal        ← recalculado no consolidado
          presumido = Σ item.dre.presumido.irpjCsll                             ← base é a receita; soma exata sob premissa única
lucroLiquido = lucroOperacional − irpjCsll
margemLiquida = receitaLiquida > 0 ? lucroLiquido / receitaLiquida : null ("n/a");  margemSobreValorPago idem
tributosTotais = Σ (item.tributosTotais − item.irpjCsll) + irpjCsll consolidado
custoTotalReal = Σ item.custoTotal + custosInternos   (rótulo: "custo total antes de IRPJ/CSLL — cenário lucro real")
reducaoPotencial (só informativa, se lucroOperacional < 0) = −lucroOperacional × irpjCsllReal
```

Por que o IRPJ real não é a soma dos itens: cada item aplica `max(0, lucro)`
isolado; no orçamento prejuízo de um item compensa outro e custos internos
são dedutíveis (premissa). No presumido a base é a receita — soma exata.

Barra "para onde vai o valor pago" (cenário real): deduções + IRPJ/CSLL |
CMV líquido | frete e cartão | custos internos | lucro líquido — fecha no
total pago; prejuízo mostrado como estouro (como `viz-prejuizo`).

**`validarOrcamento(o, padrao)`** — estrutura; UF válida; `destinatario`
válido; itens com origem conhecida e `inputs` coerentes com o cabeçalho
(UF, destinatário, pagamento, bandeira, parcelas); custos ≥ 0 (fixo ou
percentual entre 0 e 1, não os dois); ids únicos; `versaoFormato` ≤ atual;
números finitos; tamanho. Na importação, **recalcula cada item com o
`configSnapshot` do próprio arquivo** e compara com `resultado` (tolerância
0,005): divergência marca o item "resultado divergente — recalcule".

**`migrarOrcamento(o)`** — v1 só valida; mesma disciplina de `migrarConfig`.

## 7. Interface (app.js / index.html)

- `index.html`: `<section id="tab-orcamentos">` (lista + editor); card na
  Home; bloco "Dados da empresa" e "Proposta" (validade padrão, texto padrão,
  LC 224) em Configurações; `@media print` que mostra só `#proposta`.
- `app.js`: `orcamentos[]`, `orcAtualId`; `carregarOrcamentos()` /
  `salvarOrcamentos()` (autosave; grava só se `atualizadoEm` do storage não
  for mais novo que o carregado — senão avisa "outra aba alterou"); falha ao
  gravar → status "não salvo — exporte o JSON", dados em memória;
  `renderListaOrcamentos()`, `renderOrcamento()`, `renderDre()` reutilizado
  com `DRE_LINHAS_ORCAMENTO`; botões "Adicionar ao orçamento" nas três abas
  (`adicionarItem(origem)` usa `lerEntradas()` / `lerEntradasRevenda(op)`);
  `carregarNaCalculadora(item)` preenche a aba de origem.
- Nada muda em `lerEntradas*`, `recalcular*`, `sugerirAliquotas`,
  `migrarConfig` (além da v4) ou `calcular()`.
- "?" de ajuda: entradas novas para cabeçalho, custos internos, status.
- **Proposta impressa** (D3): dados da empresa (do orçamento), cliente, data,
  validade, nº e revisão, tabela (descrição, m², R$/m², total), total,
  condição de pagamento, prazo, "incluso" conforme o cabeçalho, observações,
  nota "preços com impostos inclusos (IPI/ICMS/DIFAL/FCP conforme o
  destino); não cobre obrigações do destinatário". Item "valor dos produtos"
  (por fora) mostra o **total** com IPI/DIFAL/FCP. Arredondamento: preço
  unitário exibido = total ÷ m² arredondado a 2 casas; o total impresso é o
  do motor; a soma dos totais impressos é conferida contra o total da
  proposta (teste). Nada de custo, crédito, lucro ou DRE — e a verificação é
  por **componentes** (ids ausentes na impressão), não por palavras.

## 8. Casos de borda e regras

| Caso | Regra |
|---|---|
| Sem itens, com custos | Receita 0, resultado negativo exibido; Imprimir desabilitado. |
| Cliente em MG | Calc 1: ICMS efetivo 14%, sem DIFAL/FCP; calcs 2/3: interna 18%, sem DIFAL — comportamento atual dos motores. |
| Contribuinte que revende/industrializa | DIFAL/FCP zero; IPI fora da base nas calcs 2/3. Contribuinte consumidor final: não coberto (aviso §3.3). |
| UF sem FCP cadastrado, consumidor final | Calcs 2/3: motor lança → item não entra, mensagem. Calc 1: entra com FCP 0 + aviso no item e no consolidado ("1 item com FCP não confirmado"). |
| Mudar UF/destinatário/pagamento com itens | Confirmação; recalcula todos com a **config congelada** e premissas do orçamento; mostra diferenças; aplica tudo ou nada. |
| Recalcular (config atual) | Idem, mas com config viva; substitui `configSnapshot` e `premissas` junto. Cancelar ou falhar um item → nada muda. |
| Frete cobrado na NF (item) × transporte em custos internos | O motor trata o frete cobrado como **despesa de igual valor** (repasse). Aviso quando há frete > 0 em item **e** custo interno de transporte. "Cobra 1.000, gasta 800" não é suportado na v1 (limitação declarada). |
| Comissão percentual | `percentual × receitaBruta` do consolidado; exibido "2% → R$ 4.980,00". |
| Custos fixos de importação em vários itens | Não multiplicam: a calc 1 rateia o container pela capacidade e cobra por m² — dois itens do mesmo produto pagam a mesma parcela por m². |
| Item com prejuízo | Vermelho; entra na soma; IRPJ real consolidado trata. |
| Divisão por zero | Margem "n/a" com receita líquida ≤ 0; quantidade > 0 já é exigida pelos motores. |
| UF de entrega ≠ faturamento | **Restrição v1**: um campo só ("UF de destino — entrega e faturamento"); aviso de que DIFAL/FCP são da UF de entrega. |
| Enviado/aprovado | Travado; "Nova revisão" (D-E). Dados da empresa e premissas ficam os da emissão. |
| Duas abas do navegador | Comparação de `atualizadoEm` antes de gravar; avisa e não sobrescreve sem confirmar. |
| Excluir | Confirmação; sem lixeira (JSON é o backup). |
| localStorage cheio / falha | Aviso; não mostra "salvo"; exportar disponível. |
| IBS/CBS 2026 | Sem cálculo (dispensa condicionada às obrigações acessórias em 2026); nota no rodapé; `dataPrevista` só informativa. |

## 9. Testes (acrescentar a `test/test.js`)

**Fase 1a (calculadoras):**
1. `calcularImportacao`: MG ou contribuinte → idêntico a `calcular()`; RJ
   consumidor final → `fcp = 2% × B15`, `precoFinal = B18 + fcp`, Δpis/Δcofins
   = fcp × 1,65% / 7,6%, lucro = precoFinal − custoTotal; UF com FCP null →
   idêntico a `calcular()` + aviso. `calcular()` com hash inalterado; 313
   verificações intactas.
2. `dreImportacao` lê `r.fcp`: linha DIFAL+FCP = difal + fcp; lucro
   operacional = lucro do wrapper.
3. Presumido: `irpj` 0,25 → IRPJ/CSLL presumido = 3,08% da receita sem IPI nos
   cenários de referência (revenda RJ 600 m²; nacional MG 350 mil — números
   novos a registrar); migração v4 (0,15 → 0,25; ajuste manual preservado;
   idempotente). `lc224 = true` → bases 8,8%/13,2%.

**Fase 1b (`orcamento.js`):**
4. Item sozinho de cada origem: lucro operacional e lucro líquido iguais ao
   item; linhas adaptadas da calc 1 batem com a fórmula do `adaptarDre`.
5. Três itens (RJ consumidor final): linhas aditivas somam; IRPJ real =
   34% × max(0, Σ lucro − custos); presumido = Σ; margens dos totais.
6. Custos internos: 10 mil com lucro suficiente → −3.400 no IRPJ real,
   presumido igual; lucro 5 mil e custo 10 mil → −5 mil, imposto 0,
   `reducaoPotencial` 1.700.
7. Prejuízo compensa lucro: +30 mil e −10 mil → IRPJ real 6.800 (não 10.200).
8. Comissão 2% sobre 249 mil = 4.980; muda com a receita.
9. Cabeçalho manda: UF, destinatário, pagamento, bandeira, parcelas
   sobrescritos; `inputs` gravados já coerentes.
10. Dividir um item em dois de metade → mesmo consolidado (tolerância
    0,005); reordenar → nada muda.
11. Config viva alterada sem Recalcular → `consolidar(orcamento)` não muda
    (nem IRPJ, nem proposta). Recalcular: dólar afeta só importação direta
    (confirmado: `calcularRevenda` não lê `dolar`).
12. Falha no último item do recálculo / cancelar → nenhuma alteração parcial.
13. Frete cobrado 1.000 num item + custo interno de transporte → aviso.
14. Validação/importação: UF inválida, destinatário inválido, `clienteUF` ≠
    cabeçalho, custo negativo, fixo e percentual juntos, `versaoFormato`
    futura, ids duplicados, número não finito, `resultado` adulterado
    (recalculado com o `configSnapshot` e comparado) → erros/marcas com mensagem.
15. Consistência: receita bruta − custo total (real) = lucro operacional.
16. Regressão: 313 + hash de `calcular()`.

**Playwright:** adicionar item de cada aba (com e sem divergência de
cabeçalho); editar cabeçalho com itens; recalcular (aceitar e cancelar);
enviado trava + nova revisão; imprimir (componentes internos ausentes por id;
várias páginas; soma dos totais impressos = total); exportar/importar/reabrir
(mesmos resultados e premissas); duas abas; recarregar e ver o orçamento.

## 10. Premissas declaradas da v1 e pendências com a contadoria (Mariana)

Premissas (aparecem no rodapé da DRE e no "?"): IRPJ/CSLL estimativa
marginal (34% real; 25%+9% sobre 8%/12% no presumido; LC 224 conforme
parâmetro); custos internos dedutíveis e sem crédito de PIS/COFINS; frete
cobrado = despesa de igual valor; ICMS da importação direta em alíquota
efetiva (regime especial); destinatário contribuinte só "revende ou
industrializa"; UF de entrega = faturamento; IPI não destacado na importação
direta; IBS/CBS sem cálculo em 2026; orçamento deficitário sem benefício
fiscal computado.

Pendências: crédito de PIS/COFINS sobre frete contratado na venda (Lei
10.833 art. 3º IX; SC Cosit 46/2023); IPI na saída da importação direta
(RIPI art. 9º I); FCP das demais UFs (tabela só tem RJ 2%); enquadramento de
venda com instalação; custo real do frete ≠ cobrado (mudança de motor);
alíquotas 2026 já registradas no briefing nº 2.

## 11. Fases

| Fase | Entrega | Validação |
|---|---|---|
| 0 | Esta v2 | Codex + dono |
| 1a | `calcularImportacao` (FCP), `irpj` 0,25 + migração v4, `lc224`, rótulos §3.3, marca §3.4, testes 1–3 | `node test/test.js`; Codex confere que `calcular()` não mudou e que os números de referência do presumido foram atualizados |
| 1b | `orcamento.js` + testes 4–16, sem UI | Codex confere somas, adaptador e validação |
| 2 | Aba Orçamentos (lista, cabeçalho, itens, custos, DRE, composição, botões nas abas, autosave/JSON, status/revisão) | Playwright + Codex |
| 3 | Proposta impressa + dados da empresa + "?" dos campos novos | PDF conferido pelo dono |
| 4 | README/briefing; upload no GitHub | Site publicado |

## 12. O que mudou da v1 para a v2

1. FCP na importação direta por wrapper (D-A) — §3.1.
2. Premissa única do adicional de IRPJ (D-B) e parâmetro LC 224/2025 (D-C) — §3.2.
3. Rótulos de destinatário e cenário não coberto (§3.3); marca "IPI não destacado" (§3.4).
4. Premissas e `configSnapshot` congelados por orçamento; `consolidar(orcamento)` sem config viva; `calcularItem(config, cabecalho, item)`; versões de formato e motor separadas — §5, §6.
5. Adaptador de DRE (convenção única; ICMS em linha rotulada) — §6.
6. Regra anti-dupla-contagem do frete; tipos de custo interno separados; comissão percentual (D-D); "incluso" na proposta vindo do cabeçalho — §5, §8.
7. Status enviado/aprovado travando + nova revisão (D-E); dados da empresa e premissas copiados na emissão — §4, §8.
8. Casos de borda do parecer (12) e testes reescritos (16 + Playwright) — §8, §9.
9. Premissas declaradas e pendências consolidadas — §10.

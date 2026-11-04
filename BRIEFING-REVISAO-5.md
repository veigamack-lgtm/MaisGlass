# MaisGlass — Briefing para revisão nº 5 (Codex): preço por m² editável na tabela de itens do orçamento

Pedido do Gabriel (03/11/2026): poder **alterar o preço por m² de cada item
direto no orçamento**, com totais, DRE e proposta recalculando sem risco de
inconsistência. Hoje isso exige "Carregar" o item na calculadora, mudar o
preço lá e "Substituir item". A mudança é pequena e opcional; nada do que já
existe muda de comportamento. **Nada foi publicado** — a produção está na
rodada anterior (v2.2.0 + pareceres 7 e 8, merge do PR #1).

Pacote: `orcamento.js` (função nova), `app.js` (tabela de itens),
`index.html` (CSS de 1 linha + texto de ajuda), `test/test.js`, `test/ui.js`,
`README.md`, este briefing. `calc.js`, `defaults.js`, `nuvem.js`, `termos.js`
e `api/` **não mudaram** (hash de `calcular()` inalterado).

## 1. O que o usuário vê

Na aba Orçamentos, a coluna **R$/m²** da tabela de itens vira um campo
editável com o preço final ao cliente por m² (total ÷ m² — o mesmo "VLR
UNITÁRIO" da proposta). Embaixo, em cinza, o preço equivalente na
calculadora ("base R$ 140,00" na importação; "venda R$ …" na revenda/
nacional). Ao digitar, por exemplo, 170 e sair do campo:

- o item é **recalculado pelo mesmo motor e com a mesma configuração
  congelada** do orçamento (`calcularItem`, cabeçalho manda), exatamente como
  "Carregar → mudar o preço → Substituir item" faria;
- totais, DRE consolidada (real e presumido), custo de operação, gráfico e
  proposta impressa acompanham; o orçamento é gravado (autosave) e vai ao
  servidor, que o valida como sempre (`validarOrcamento` + `consolidar`);
- o status diz "R$/m² ao cliente R$ 165,20 → R$ 170,00 (preço base na
  calculadora R$ 144,07) — totais, DRE e proposta recalculados";
- "Carregar" depois disso abre a calculadora já com o preço novo.

Valor inválido (zero, vazio, texto) ou abaixo do mínimo do item (frete e
acréscimos por m²) → nada muda, a tabela volta ao valor anterior e o status
explica. Orçamento emitido → campo travado, como os demais.

## 2. Motor — `orcamento.js → precoParaM2(config, cabecalho, item, alvoM2)`

Puro, sem DOM. Acha o preço de calculadora (`CAMPO_PRECO`: `precoBase` na
importação direta; `precoVenda` na revenda e na nacional) que faz
`resultado.precoFinal ÷ quantidade` = alvo, e devolve
`{ campo, preco, precoM2, inputs, resultado, avisos }` — o item recalculado
por `calcularItem` com a configuração e o cabeçalho recebidos. O item
recebido não é alterado.

Por que converge: nas três calculadoras o preço final é **linear** no preço
de calculadora — `(preço × m² + frete) × (1 + taxa do cartão) × (1 + DIFAL% +
FCP%)` na importação; `(preço × m² + frete) ÷ (1 − taxa)` no preço fechado;
gross-up proporcional ao subtotal no preço por fora. Então duas avaliações
resolvem; ainda assim o código **confere** e refina por secante (até 10
passos), exige |obtido − alvo| ≤ 0,005 e lança se não convergir ou se a
inclinação não for positiva.

Arredondamento: o preço de calculadora é gravado com o **menor número de
casas (2 a 10)** que mantém, no resultado recalculado, `|R$/m² − alvo| ≤
0,0005` **e** `|total − alvo × m²| ≤ 0,004` — o cliente vê exatamente o que
foi digitado (R$/m² e total nos centavos: 170,00 × 1.336 = 227.120,00) e o
preço na calculadora fica legível (144,067797 no cenário da planilha). Antes
dessa regra, 4 casas davam total 227.120,01.

Erros (mensagens em português): alvo ≤ 0 ou não numérico; quantidade
inválida; item sem entradas/origem; preço necessário negativo ("abaixo do
mínimo deste item: só frete e acréscimos já somam R$ X por m²").

## 3. Interface — `app.js`

- `renderItensOrc`: célula R$/m² com `input.preco` (valor = `precoM2`
  arredondado a 2 casas; desabilitado se travado ou item sem resultado) e
  `small` com o preço de calculadora; `change` → `alterarPrecoItem`.
- `alterarPrecoItem(it, valor)`: `precoParaM2(orc.configSnapshot,
  cabecalhoDe(orc), it, valor)`; sucesso → substitui `inputs/resultado/
  avisos/calculadoEm` do item, limpa `itemEmEdicao` se era esse item (a cópia
  carregada na calculadora ficou velha), `renderOrc()` (totais, DRE, gráfico,
  custo de operação, proposta) + `salvarOrcAtual()`; erro → `orcStatus` e
  `renderOrc()` (tabela volta ao valor anterior). Não toca em
  `configSnapshot`, `premissas` nem nos outros itens.
- Não é usado `snapshotParaItem` (o material do item já está no snapshot —
  foi calculado com ele); material renomeado/removido em Configurações não
  interfere (a configuração usada é a congelada).

## 4. Testes

- `node test/test.js` → **664** (eram 645), bloco "Preço por m² editável":
  importação com FCP (165,20 → 170: `precoBase` ≈ 144,0678; total exato
  227.120,00; resultado idêntico a `calcularItem` com esse preço em todos os
  campos da consolidação; demais entradas preservadas; item original intacto;
  orçamento válido; alvo menor também resolve); revenda fechado à vista
  (`precoVenda` = 160 exato); nacional por fora (gross-up: converge em 200,00
  com `precoVenda` < 200; idêntico a `calcularItem`); parcelado 6x Amex
  (180,00); 12.345,67 m² a 149,99 → total 1.851.727,04 exato; erros (zero,
  texto, piso com o valor na mensagem, item inválido, quantidade zero).
- `node test/ui.js` → **309** (eram 294): tabela mostra 165,2 e "base R$
  140,00"; digitar 170 → `precoBase` ≈ 144,0678, total 227.120,00, lucro
  líquido sobe, status explica, proposta mostra 170,00, tabela mostra "base
  R$ 144,07", orçamento válido, configuração/premissas intactas, servidor
  aceita; zero → recusado e tabela volta; "Carregar" abre a calculadora com o
  preço novo; emitido → campo travado.
- `test/api.js` 79 · `test/termos.js` 52 · Playwright 13 scripts (sem
  alteração) — resultado no README/commit.

## 5. O que pedimos que você confira

1. A premissa de **linearidade** nas três calculadoras (há algum caminho —
   parcelado, por fora, FCP não confirmado, contribuinte — em que o preço
   final não seja afim no preço de calculadora? O código tolera não
   linearidade via secante, mas a mensagem de erro seria o único sinal).
2. A **política de arredondamento** (menor nº de casas que preserva os
   centavos do R$/m² e do total) e o teto de 10 casas.
3. Se substituir `inputs/resultado/avisos` do item direto no editor (sem
   passar por "Adicionar/Substituir") deixa escapar alguma validação que
   aquele fluxo fazia (ex.: `divergenciasCabecalho`, materiais, flag
   `icmsSaidaManual` — `aplicarCabecalho` continua sendo aplicado dentro de
   `calcularItem`).
4. Qualquer efeito sobre proposta emitida, revisões, importação de JSON e
   sincronização (o campo novo não existe no formato do orçamento — nada
   muda no JSON além dos valores recalculados).

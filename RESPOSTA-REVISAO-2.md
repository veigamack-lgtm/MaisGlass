# MaisGlass — Resposta ao parecer nº 2 (para validação do Codex)

Todos os dez itens do parecer foram avaliados com o dono da operação. Abaixo, o
que foi decidido e implementado em cada um, com o arquivo/função e o teste que
cobre. `node test/test.js`: **313 verificações**. A função `calcular()` da
importação direta continua sem alteração (só `taxaCartao()`, helper compartilhado,
ganhou a validação do item 8, que não muda nenhum resultado válido).

Pedimos que a validação confirme, item a item, se a correção resolve o
apontamento, e aponte qualquer efeito colateral.

## Alta gravidade

**1. UF da empresa × regime especial da importação direta — resolvido fixando a
empresa em MG.** Decisão do dono: a MaisGlass é de Minas e o regime especial
(14% interno / 1,5% fora) é de Minas; a UF da empresa não deve ser
configurável. `calc.js → EMPRESA_UF = 'MG'`; `validarConfig()` rejeita
`revenda.empresaUF` diferente de MG; `migrarConfig()` força MG em configs
antigas; `derivarDifal()` usa MG; o campo em Configurações virou texto fixo. Se um
dia a empresa mudar de UF, a calc 1 precisará de um wrapper que normalize
interna/interestadual, como o parecer descreve. Testes: `empresa fora de MG é
rejeitada`, `empresa forçada para MG`.

**2. Preço "por fora" com cartão — resolvido com gross-up simultâneo.**
`calcularRevenda()`: no modo por fora, `total = combinado × (1 + IPI) ÷ [(1 −
DIFAL − FCP) − taxa × (1 + IPI)]`, `produtos = combinado + total × taxa`,
`taxa do cartão = total × taxa`. Reproduz o total coerente do parecer
(R$ 283.345,10 no cenário 200 mil / IPI 6,5% / RJ / Amex 3x) e mantém
`total × (1 − DIFAL − FCP) = produtos × (1 + IPI)`. O modo fechado não mudou
(a taxa já era `total × taxa`). Testes: bloco `preço por fora com cartão`.

**3. Autosave re-sugeria alíquotas — resolvido.** `recalcularOperacoes()`
só recalcula; `sugerirAliquotas()` roda apenas ao carregar os padrões e ao
trocar a UF do fornecedor ou do cliente (a UF da empresa deixou de existir como
variável). Verificado no navegador: saída editada para 12% sobrevive à edição
do dólar em Configurações; trocar a UF do cliente volta a sugerir.

**4. Natureza da operação ignorada pelo motor — resolvido.**
`calcularRevenda()` valida `inputs.modo` (`beneficiamento` | `revenda`;
ausente = compatibilidade, não força nada; outro valor lança erro). Em
`revenda`, força `ipiCredito = false` e `ipiVenda = 0`. Testes: bloco
`natureza da operação`.

## Média gravidade

**5. DIFAL derivado dependia de `config.interestadual` — resolvido.**
`derivarDifal()` usa 4% fixo (Res. SF 13/2012). Teste: `derivarDifal ignora
config.interestadual (4% fixo)`.

**6. Configurações de IPI × tela — resolvido.** `aplicarEntradasPadraoRevenda()`:
`revenda.ipiCredito` e `revenda.ipiCompra` só inicializam a aba de revenda de
importado (`imp && rv.x !== undefined ? rv.x : d.x`); a indústria nacional usa
os próprios padrões. Verificado no navegador com `ipiCredito=false`.

**7. Importar JSON aplicava pelo autosave — resolvido.** O agendador de
autosave ignora eventos vindos de `#cfgArquivo`; a mensagem passou a "Clique em
'Salvar agora' para aplicar". Verificado no navegador: após importar, o dólar
ativo não muda até clicar em Salvar.

**8. Cartão ≥ 100% — resolvido.** `taxaCartao()` lança erro quando
MDR + antecipação + parcelas × por parcela ≥ 1. Testes: bloco `cartão ≥ 100%`.

## Baixa gravidade e testes

**9. Diferença de um centavo — sem mudança de código, por decisão.** O motor
mantém precisão cheia (política: arredondar só na exibição). O briefing foi
corrigido para os números do motor (tributos 54.262,46 · lucro operacional
77.178,24 · líquido 50.937,64) e o cenário ganhou teste com tolerância de meio
centavo.

**10. Testes — ampliados.** Acrescentados: tabela literal independente das 27
UFs (interna 2026 → DIFAL), cenário nacional interno completo (350 mil, 16
linhas), modo revenda × IPI, por fora combinado com cartão, empresa fora de MG,
migração v1 → v3 em função pura (`calc.js → migrarConfig`, testada para
correções, preservação de ajustes manuais, FCP, idempotência e não mutação do
original), cartão ≥ 100%. A integração de `sugerirAliquotas()` e o import JSON
foram verificados em Playwright (não fazem parte da suíte Node por dependerem
do DOM). Tolerâncias monetárias dos cenários de referência passaram para
0,005.

**Login (observação não fiscal):** ciente; já documentado no README como
barreira visual. Sem mudança.

## Pedido de validação

1. Confirmar que os itens 1–8 estão resolvidos como descrito e que nada vazou
   para `calcular()`.
2. Re-executar a matriz de 1.458 combinações de alíquotas e os probes de
   migração com `migrarConfig()`.
3. Conferir a fórmula do item 2 contra o exemplo do parecer (283.345,10) e o
   caso contribuinte (DIFAL = FCP = 0 → `total = combinado × (1 + IPI) ÷ (1 −
   taxa × (1 + IPI))`).
4. Apontar qualquer teste ainda ausente que julgue necessário antes de publicar.

## Resíduos apontados na validação (segunda passada) — todos aplicados

- **JSON importado ainda podia ser salvo por autosave pendente** — o evento de
  `#cfgArquivo` agora cancela o timer (`clearTimeout(autoTimer); autoTimer =
  null`) antes de sair. Verificado no navegador: editar o dólar e importar antes
  dos 500 ms não grava nada; só "Salvar agora" (ou uma edição posterior) aplica.
- **MG não estava fixa dentro do motor** — `calcularRevenda()` usa `EMPRESA_UF`
  diretamente; `config.revenda.empresaUF` é apenas validado. O rótulo em
  `recalcularRevenda()` também usa `CALC.EMPRESA_UF`. Teste: chamada direta com
  `empresaUF: 'PE'` continua tratando PE como interestadual.
- **Natureza "revenda" mostrava IPI ignorado** — em "revenda sem industrializar"
  os controles de crédito de IPI e IPI na saída ficam desabilitados; ao voltar
  para "beneficiamento" restauram os padrões da operação (crédito conforme
  configuração da revenda, IPI 6,5%). Verificado no navegador.
- **Trocar o fornecedor apagava a saída manual** — `sugerirAliquotas(op, qual)`
  recebe `'entrada'` ou `'saida'`; o listener do fornecedor só mexe na entrada e
  o do cliente só na saída; a inicialização preenche as duas. Verificado no
  navegador (saída manual 12% sobrevive à troca de fornecedor).
- **`config.interestadual` oculto** — `migrarConfig()` normaliza para 0,04 e
  `validarConfig()` rejeita qualquer outro valor (Res. SF 13/2012). Testes:
  `interestadual ≠ 4% é rejeitado`, `migração normaliza interestadual`.
- **Versão futura** — `migrarConfig()` lança erro quando `versao` salva é maior
  que a do app. Teste: `versão futura é rejeitada`.
- **Adicionar/remover produto sem autosave** — os dois botões disparam um
  `change` sintético em `#tab-config`, que agenda o autosave. Verificado.
- **Cartão a 105% passava na configuração** — `validarConfig()` calcula o pior
  caso por bandeira (faixa 6–12x + antecipação + 12 × por parcela) e rejeita
  ≥ 100%. Teste: `cartão 105% em 12x é rejeitado na configuração`.
- **Aba nacional herdava textos de importado** — `montarAbaNacional()` reescreve
  no glossário: "12% ou 7% na interestadual de mercadoria nacional (Res. SF
  22/1989)" e "Vidro nacional não exige FCI". Verificado.

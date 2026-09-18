# MaisGlass — Resposta ao parecer nº 3 (Codex) — rodada 4 do módulo Orçamentos

Todos os oito achados foram aceitos e corrigidos. Abaixo, item a item: o que
mudou, onde, e o teste que cobre. `node test/test.js` → **467 verificações**
(eram 433); `calcular()` continua com o hash `7ea1056b…91ed1`. Os cenários do
parecer foram reproduzidos em Playwright antes e depois da correção (script
`p3.js`, descrito em §9). Decisões do dono (18/09): preço unitário da proposta
é aproximado e vale o total do item; FCP não cadastrado sai na proposta com
ressalva, sem bloquear a impressão.

## 1. P1 — Alíquota de saída acompanha a UF do cabeçalho — corrigido

`orcamento.js → aplicarCabecalho(origem, inputs, cab)` agora devolve
`{ inputs, avisos }` e resolve a alíquota interestadual de saída das calcs 2/3:

- calcula `aliquotaSaidaAuto(origem, uf) = aliquotaInterestadual('MG', uf,
  origem === 'revenda')` para a UF **de origem do item** e para a **UF nova**;
- se o valor do item era o automático da UF de origem (ou não havia valor),
  passa a ser o automático da nova UF (`null` = venda interna: o campo não é
  tocado, o motor usa a interna);
- se o valor tinha sido ajustado à mão (≠ automático da UF de origem), é
  **mantido** e o item recebe o aviso "ICMS de saída X% mantido do ajuste
  manual (a regra geral para BA seria 7%) — confira", que aparece na tabela de
  itens e no consolidado.

Reproduzido: item nacional preparado para RJ (12%) → orçamento BA contribuinte
→ 7% e lucro **113.473,98** (o valor do parecer; antes 98.562,01 com 12%
retido). Testes: bloco "Parecer 3 — achado 1" (RJ→BA automático = calculadora
preparada para BA; ajuste manual 10% mantido com aviso citando 7%; BA→RJ
volta a 12%; destino MG não sobrescreve; revenda de importado 4% em qualquer
UF; mudança de cabeçalho num orçamento existente → 7% e DIFAL 20,5 − 7).
`divergenciasCabecalho` não mudou (a alíquota não é campo do cabeçalho).

## 2. P1 — Gravação entre abas — corrigido

`app.js → gravarOrcamentos(oAlterado, excluirId)` reescrita: relê o disco,
substitui **só** o orçamento alterado (ou remove só o id excluído) e grava a
lista do disco assim modificada — as cópias em memória dos demais orçamentos
nunca vão para o disco. Depois de gravar, `sincronizarListaOrc(lista)`
reconstrói a lista em memória a partir do disco, preservando o objeto do
orçamento aberto (e o `atualizadoEm` que esta aba conhece para ele — é isso
que detecta o conflito). O evento `storage` ressincroniza a lista quando outra
aba grava e avisa se o orçamento aberto foi alterado ou excluído lá. O mapa
`orcExcluidos` foi removido (não é mais necessário).

Reproduzido: aba 1 altera A; aba 2 altera B e salva → A preservado no disco.
Exclusão na aba 1 seguida de gravação na aba 2 → o excluído não ressuscita.
Mesmo orçamento nas duas abas, conflito recusado → "Não salvo — outra aba
alterou…", disco mantém a versão da aba 2. Limite declarado: a
leitura-modificação-gravação é síncrona e dura microssegundos, mas não há lock
entre abas — duas gravações no mesmo instante ainda podem colidir (o
`localStorage` não oferece transação; um lock via `navigator.locks` exigiria
tornar todo o fluxo assíncrono e fica como evolução futura).

## 3. P1 — JSON com DRE alterada — corrigido em três camadas

1. **Validação estrutural** (`validarResultadoItem`): todos os campos que a
   consolidação usa precisam ser números finitos (topo, `dre.real`,
   `dre.presumido`, créditos e quantidade da importação), e as **identidades
   contábeis** são conferidas por regime: deduções = IPI + ICMS + DIFAL/FCP +
   PIS/COFINS; receita líquida = bruta − deduções; lucro bruto = líquida − CMV;
   lucro operacional = bruto − frete − cartão; líquido = operacional − IRPJ/CSLL;
   lucro operacional real = `lucro` do item; receita bruta = `precoFinal`.
   Premissas validadas (0–1, `lc224` booleano) e **conferidas contra o
   `configSnapshot`**, que por sua vez passa por `validarConfig`.
2. **Comparação completa** (`compararResultados`): topo + as duas DREs campo a
   campo + créditos/custo por m²/quantidade da importação, tolerância 0,005.
3. **Política da importação** (`app.js → importarOrc`): cada item é recalculado
   com o `configSnapshot` do arquivo e o resultado recalculado **substitui** o
   importado — nada que veio de fora entra na conta. Divergência vira aviso no
   item ("Resultado do arquivo diferia do recálculo e foi substituído
   (campos…)"). Item não recalculável → arquivo recusado.
4. `migrarOrcamento` recusa estruturas malformadas (`itens`/`custosInternos`
   com tipo errado, `condicoes`/`empresa`/`cliente` não-objeto) em vez de
   trocá-las por vazias; campo **ausente** continua sendo completado.

Reproduzido: CMV +10.000 isolado → recusado ("lucro bruto ≠ receita líquida −
CMV"); CMV +10.000 com lucro bruto/operacional/líquido/custo total ajustados
coerentemente → aceito, **substituído** pelo recálculo (lucro líquido volta ao
original) e item avisado; `dre.real = {}` → recusado; `itens: "abc"` →
recusado. Testes: bloco "Parecer 3 — achado 3" (13 adulterações isoladas —
CMV, deduções, receita, IRPJ presumido, crédito da importação, DRE vazia, campo
removido, string, null, premissa ≠ snapshot, snapshot inválido, premissa fora
de 0–1, presumido trocado por real — todas rejeitadas ou divergentes; migração
malformada; `emitidoEm` na migração).

## 4. P2 — Salvamento pendente ao sair — corrigido

Autosave amarrado ao objeto: `agendarSalvarOrc` guarda `orcPendente = orc` e
o temporizador salva **aquele** objeto; `concluirSalvarPendente()` é chamado
em Voltar, ao abrir outro orçamento, ao trocar de aba, antes de nova
revisão/duplicar/exportar/imprimir e em `pagehide`/`beforeunload`.
Reproduzido: editar o nome e voltar imediatamente → gravado; editar A e abrir B
antes dos 500 ms → A gravado com o nome novo, B intacto.

## 5. P2 — Preservação da proposta emitida — corrigido

Novo marco `emitidoEm` (modelo v1 do orçamento, completado pela migração):
definido na **primeira** saída do rascunho (enviado, aprovado ou perdido);
nesse momento os dados da empresa são copiados **uma vez** e nunca mais
sobrescritos; a data da proposta é `emitidoEm`. `orcTravado()` = emitido —
vale também para "perdido". Transições: rascunho → qualquer; enviado →
aprovado/perdido; aprovado → perdido; perdido é final; nenhuma volta a
rascunho (só "Nova revisão", que zera `emitidoEm`). Reproduzido: enviado →
aprovado após mudar a empresa em Configurações → proposta mantém "Empresa
original"; enviado → perdido continua travado (só "Perdido" habilitado);
aprovado direto do rascunho define `emitidoEm` e a proposta usa essa data.

## 6. P2 — Mensagens de gravação honestas — corrigido

`gravarOrcamentos`/`salvarOrc` devolvem `false` com a mensagem de erro já
escrita; `novoOrc`, `novaRevisaoOrc`, `duplicarOrc`, `importarOrc`,
`recalcularOrc`, `excluirOrc` e o recálculo sem itens só escrevem sucesso se a
gravação devolveu `true`; senão a mensagem de erro fica e, no recálculo e na
importação, diz que o resultado está só nesta tela. Reproduzido com
`setItem` lançando quota: novo → "Não foi possível salvar…"; importar → idem.

## 7. P2 — Unitário arredondado — corrigido (decisão do dono: vale o total)

Coluna passa a "R$/m² (aprox.)"; a proposta detecta linha em que unitário ×
m² ≠ total do item (≥ 1 centavo) e imprime "O preço por m² é aproximado (duas
casas); vale o total de cada item, calculado com precisão integral"; a nota da
soma dos itens passa a citar o valor da diferença. Reproduzido com o item da
importação a R$ 140,01 (diferença de R$ 2,40).

## 8. P2 — FCP não confirmado na proposta — corrigido (decisão do dono: ressalva)

`orcamento.js → fcpPendente(o)` lista as UFs de itens de importação direta com
`fcpConfirmado === false`. A proposta troca a frase incondicional por "Preços
com impostos inclusos (IPI, ICMS e DIFAL conforme o destino). O adicional
estadual do Fundo de Combate à Pobreza (FCP) de SP será confirmado na emissão
da nota fiscal e poderá ser acrescido ao valor." O editor avisa que a ressalva
vai sair e como removê-la (cadastrar o FCP; 0 se o estado não cobra).
Reproduzido: SP sem FCP → ressalva; SP com FCP 0 cadastrado + Recalcular →
frase normal. Estados distintos: null (ressalva), 0 confirmado (sem ressalva,
FCP zero), positivo (sem ressalva, FCP no preço).

## Outros pontos do parecer

- Rótulo da LC 224 (§4 do parecer): "Ao ligar, a simulação assume que TODA a
  receita simulada está na parcela excedente…; a apuração real proporcionaliza
  por período".
- Rótulo do status: "Sair do rascunho emite a proposta: data e dados da
  empresa congelam e a edição trava (também em 'perdido')".
- Data prevista fora da vigência: continua informativa (não implementado —
  não há regra de vigência codificada no motor além das alíquotas de 2026).
- Aprovação visual: PDF gerado de novo (1 página) e o fluxo completo de
  Playwright repetido sem erros de console.

## 9. Verificação desta rodada

- `node test/test.js`: 467 OK. Novos blocos: "Parecer 3 — achado 1" (11) e
  "Parecer 3 — achado 3" (23).
- Playwright `p3.js` (reprodução dos achados): 1 — RJ→BA 113.473,98, manual
  mantido com aviso; 2 — abas com orçamentos diferentes, exclusão + gravação,
  conflito recusado; 4 — voltar/trocar antes dos 500 ms; 5 — enviado →
  aprovado/perdido, aprovado direto; 6 — quota estourada em novo e importar;
  3 — CMV isolado recusado, CMV coerente substituído, `itens: "abc"`, DRE
  vazia; 7 — 140,01 gera nota; 8 — SP sem/com FCP.
- Playwright anteriores (`orc.js`, `help.js`, `f1a.js`, `resid.js`, `mig4.js`,
  `pdf.js`): sem erros; impressão isola a proposta; mobile sem overflow.

## 10. O que pedimos que você confira

1. `aplicarCabecalho`: critério "era automático" (comparação com a alíquota
   automática da UF de origem do item) e o tratamento de venda interna.
2. `validarResultadoItem` / `compararResultados`: se falta algum campo usado
   pela consolidação; a tolerância de 0,005 nas identidades.
3. Política de importação (substituir pelo recálculo) versus a alternativa de
   manter o importado com aviso — adotamos substituir.
4. `gravarOrcamentos` + `sincronizarListaOrc` + evento `storage`: o limite
   declarado sem lock.
5. Transições de status e o marco `emitidoEm` na migração de orçamentos
   antigos (enviado/aprovado/perdido sem o campo recebem `enviadoEm` ou
   `atualizadoEm`).

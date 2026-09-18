# MaisGlass — Resposta ao parecer nº 6 (Codex) — rodada 7 do módulo Orçamentos

Os dois achados foram aceitos e corrigidos; os dois estavam no caminho de
confirmação introduzido na rodada anterior. Mudou **só `app.js`** (mais testes
e documentação). `calc.js`, `defaults.js`, `index.html` e `orcamento.js` são
idênticos aos da rodada 6 (SHA-256 iguais; hash de `calcular()` inalterado).
`node test/test.js` → 565 OK (inalterado); `node test/ui.js` → **122**
verificações (eram 88); Playwright → 10 scripts, **232** verificações (novo
`p6.js`).

## 1. P1 — Aceitar a recriação de A grava uma lista antiga — corrigido

Confirmado: a pergunta "foi excluído em outra aba… gravar mesmo assim?" era
feita depois da releitura, e aceitar continuava com a `disco` lida antes do
diálogo. Reproduzido em jsdom e em Chromium (`A local` + `B original`, com a
edição de B perdida).

`app.js → gravarOrcamentos`: a confirmação de recriação entrou no **mesmo
protocolo adiado** da confirmação de sobrescrita. O parâmetro `confirmadoPara`
passa a representar o **estado do disco que o usuário viu**: uma versão de
`atualizadoEm`, ou o sentinela `AUSENTE`. Nenhuma decisão grava na hora:

- conflito de versão → `confirm` → aceitar agenda a gravação adiada com
  `visto = versão`; recusar cancela a pendente e marca não salvo;
- orçamento ausente do disco quando a decisão anterior valia para uma versão →
  `confirm` de recriação → aceitar agenda a gravação adiada com
  `confirmadoPara = AUSENTE`; recusar cancela e marca não salvo;
- na execução adiada, o disco é relido: **A continua ausente → grava sobre a
  lista relida** (os demais ids vêm dela, com as alterações e exclusões que
  outra aba fez durante a pergunta); **A reapareceu → cai no conflito de
  versão** (nova pergunta "alterado em outra aba"), nunca sobrescreve a versão
  recriada pela outra aba sem reavaliar; ausência igual à confirmada → uma
  gravação, sem repetir a pergunta.
- O salvar normal (sem decisão pendente) com o orçamento ausente do disco
  continua recriando sem perguntar — é o comportamento já documentado ("este
  orçamento foi excluído em outra aba… salvar vai recriá-lo"); a pergunta só
  existe quando havia uma decisão tomada para outro estado.
- Mensagem de sucesso distingue "(recriado após a exclusão em outra aba)".

Testes (`test/ui.js`, bloco "Parecer 6 — achado 1"; `test/browser/p6.js`,
cenários 1a–1d em Chromium com duas abas e o timer de 60 ms capturado):

| Durante a pergunta de recriação, a outra aba… | Resultado |
|---|---|
| altera B | A recriado **e** "B changed during recreation confirm" preservado; 1 gravação; 2 perguntas no total; nada pendente |
| exclui B | B continua ausente; A recriado |
| recria A (versão nova) | releitura vê A de volta → 3ª pergunta (conflito); recusar mantém a versão da outra aba; aceitar grava a desta aba |
| nada | 1 gravação, nenhuma pergunta a mais, nada pendente; status "recriado após a exclusão em outra aba" |
| (recusar a recriação) | nada pendente, disco sem A, A na lista "não salvo" |

Contra o pacote da rodada 6, `ui.js` e `p6.js` acusam exatamente o resultado
do parecer (`["A local","B original"]`).

## 2. P2 — Recusa posterior não cancela a gravação confirmada — corrigido

Confirmado: a recusa só marcava não salvo; o registro da confirmação anterior
continuava vigente e gravava o objeto (já com a edição v2). Reproduzido em
jsdom e em Chromium (`A local v2` no disco após o "não").

`app.js`: o registro `gravacoesAdiadas[id]` passa a representar a **validade
da decisão mais recente** sobre aquele id, não só a criação de outro timer.
Além de "nova confirmação" e "exclusão", agora cancelam a pendente:

- **recusa** em qualquer diálogo posterior do mesmo id (sobrescrita ou
  recriação) → `cancelarGravacaoAdiada` + `marcarNaoSalvo`; o disco fica com
  a versão da outra aba e o orçamento continua nesta aba marcado "não salvo";
- **gravação concluída** do mesmo id (o caso "salvar normal recria porque A
  sumiu do disco" enquanto uma confirmação anterior ainda estava pendente) —
  a gravação feita supera a decisão anterior.

Testes (`ui.js`, bloco "Parecer 6 — achado 2"; `p6.js`, cenário "achado 2"):
aceitar a 1ª sobrescrita (v1) → editar v2 → Voltar conclui o autosave → 2ª
pergunta recusada → nenhum callback de 60 ms pendente; disparar todos os
timers → zero `setItem`; **callback da 1ª confirmação capturado antes e
executado à força após a recusa → zero `setItem`**, disco mantém "A da outra
aba", A na lista "não salvo" com a edição v2; variante com recriação direta;
regressão "aceitar duas tentativas — só a última grava" preservada (ui.js,
p5.js e p6.js).

## 3. Ressalva sobre comparação textual de datas — acatada

A detecção de "outra aba alterou" (em `gravarOrcamentos` e no evento
`storage`) passou de `atualizadoEm > conhecido` para **`atualizadoEm !==
conhecido`**: detecção de mudança como identidade de versão, sem presumir
ordenação cronológica textual. Como toda gravação escreve `toISOString()` da
hora atual e a importação substitui `atualizadoEm`, o comportamento nos
cenários existentes é o mesmo (ui.js, p3–p6 passam sem alteração de
expectativa).

## Verificação desta rodada

- `node test/test.js`: 565 OK (motor intacto).
- `node test/ui.js`: 122 OK (34 novas, blocos "Parecer 6 — achado 1/2").
- `node test/browser/todos.js`: 10 scripts, 232 OK, sem erro de página
  (`p6.js` novo, 32 verificações, incluindo a regressão das duas
  confirmações aceitas).
- Contra a rodada 6: `ui.js` 18 falhas e `p6.js` 14 falhas, todas nos dois
  achados.

## O que pedimos que você confira

1. O sentinela `AUSENTE` como estado confirmado e a regra "ausência igual à
   confirmada → grava; A de volta → conflito de versão" (achado 1).
2. Os três eventos que agora cancelam/superam a gravação pendente — recusa,
   exclusão, gravação concluída — além da nova confirmação (achado 2).
3. A troca de `>` por `!==` na detecção de mudança de versão.

# MaisGlass — Resposta ao parecer nº 7 (Codex) — aba "Custo de operação", rodada 2

Os três achados foram **aceitos e corrigidos**. Dois deles (1 e 2) não eram
específicos da aba nova: a mesma causa já atingia as tabelas da aba
Configurações (produtos, classes, cartão, FCP, termos) desde rodadas
anteriores — a aba Custo de operação apenas tornou o cenário mais fácil de
reproduzir. Mudaram **`app.js`**, **`nuvem.js`** (uma condição) e
`test/ui.js`; `calc.js`, `defaults.js`, `orcamento.js`, `index.html`,
`termos.js` e `api/` são idênticos aos da rodada anterior (hash de
`calcular()` inalterado). Nada foi publicado.

Cada achado ganhou uma reprodução em `test/ui.js` (jsdom, app real, API
local em memória, timers controlados) que **falha no código anterior e passa
no novo** — conferido rodando a suíte nova contra o `app.js`/`nuvem.js`
antigos: 14 falhas, exatamente as dos três cenários. `node test/ui.js` →
**278** verificações (eram 256).

## 1. P1 — Edição ignorada após "Salvar agora" — corrigido

Confirmado, e a causa é a apontada: `salvar()` fazia `config = clone(draft);
draft = clone(config);` — trocava a **identidade** do rascunho. As linhas das
tabelas já renderizadas (lançamentos do custo de operação e, igualmente,
produtos/classes/MDR/DIFAL/FCP de Configurações) guardam referências aos
objetos do rascunho antigo nos seus handlers; a edição seguinte caía neles e o
autosave gravava o rascunho novo, intacto, dizendo "Salvo automaticamente".

`app.js → salvar()`: o rascunho **não é mais substituído** (`config =
clone(draft)` basta — a cópia é profunda, nada fica compartilhado). Nenhum
re-render é necessário, então o foco e o cursor de quem está digitando não
são perdidos. Os demais caminhos que legitimamente trocam o rascunho
(`restaurar`, `importar`, `aplicarConfigRecebida`) já chamam `renderConfig()`
e continuam como estavam.

Teste ("achado 1"): 70.000 + 3.500 → Salvar agora → 105.000 → autosave →
localStorage **105.000**, taxa R$ 30/m², servidor **105.000**; Configurações →
Produtos após Salvar agora → custo gravado; remover lançamento após Salvar
agora → gravado.

## 2. P2 — Sincronização descartando edição em andamento — corrigido

Confirmado. O recebimento só se protegia da fila de envio; a janela entre o
primeiro `input` e o autosave (500 ms), e o caso do rascunho inválido que o
autosave recusa, ficavam descobertos: `aplicarConfigRecebida` trocava o
rascunho e recriava a tela por cima do que estava sendo digitado.

Solução, coerente com a regra já usada nos orçamentos (decisão explícita,
nunca sobrescrita silenciosa):

- `app.js → configEmEdicao()`: verdadeiro quando a aba ativa é Configurações
  ou Custo de operação **e** há autosave agendado **ou** o rascunho ainda
  difere da configuração salva (cobre o rascunho inválido). O timer do
  autosave passou a estado do módulo para isso.
- `nuvem.js → aplicarPull`: a configuração remota **não é aplicada** enquanto
  `configEmEdicao()` for verdadeiro (nova condição ao lado de `cfgPendente`;
  callback registrado em `iniciar`, como `orcAberto`). A versão local segue:
  o autosave grava, `enviarConfig` manda com a `versaoBase` antiga, o servidor
  responde **409** e a pergunta já existente decide — *OK = sobrescrever com
  as deste computador / Cancelar = usar as do servidor*. Edição abandonada
  (usuário sai da aba) → o próximo recebimento aplica a remota normalmente.

Limite declarado: a decisão é pela configuração inteira (um único documento
com versão), como já era no 409 — não há mesclagem campo a campo. É a mesma
granularidade dos orçamentos.

Teste ("achado 2", duas máquinas): B edita para 140.000 sem disparar o
autosave; A grava produção 5.000 e sincroniza; B recebe → tela, taxa (R$
40/m²) e rascunho de B **preservados**; autosave de B → 409 → pergunta →
OK → servidor com 140.000 e produção 3.500; A (sem edição) recebe a de B.
Variante com **Cancelar** → B fica com a do servidor (140.000 / 7.000), tela
atualizada.

## 3. P2 — Padrão das calculadoras ignorado em navegador novo — corrigido

Confirmado: o padrão era aplicado uma vez em `iniciarApp`, com a configuração
local (num navegador novo, a padrão), antes de a configuração da empresa
chegar do servidor; o recebimento recalculava sem tocar nas caixas.

`app.js`: `aplicarPadraoCalculadoras()` aplica
`operacao.padraoCalculadoras` às três caixas **se o usuário ainda não mexeu
em nenhuma** (`custoOpManual`, marcado no `change` das caixas). É chamada na
inicialização (cobre o navegador com cache) e **uma única vez** em
`aplicarConfigRecebida`, na primeira configuração vinda do servidor
(`padraoCalcDoServidor`) — sincronizações seguintes não redefinem as caixas,
como você recomendou.

Teste ("achado 3"): A liga "Calculadoras já incorporam?" e sincroniza; sessão
nova sem armazenamento → as três caixas **ligadas** e a DRE da importação já
com o rateio (R$ 26.720); usuário desliga uma; A muda o dólar e sincroniza →
`[false, true, true]` (manual preservada); sessão com cache → padrão na
abertura.

## 4. Demais pontos do parecer

- Versão do motor mantida, orçamentos antigos desligados e comparação de
  configuração condicionada ao uso do custo: de acordo, nada mudou.
- Counts: o ZIP/branch revisados tinham `test/ui.js` em 251; a rodada
  anterior já incluía a fatia do custo de operação no gráfico das
  calculadoras (256) — esse ajuste ainda não tinha sido subido à branch na
  hora da revisão; sobe junto com esta resposta.
- Suítes: `node test/test.js` 645 · `test/termos.js` 52 · `test/api.js` 79 ·
  `test/ui.js` **278** · Playwright (`test/browser/todos.js`, 13 scripts,
  sem alteração) — resultado registrado no README e no commit.

# MaisGlass — Resposta ao parecer nº 8 (Codex) — aba "Custo de operação", rodada 3

Os dois achados foram **aceitos e corrigidos**. Os dois têm a mesma raiz: a
proteção da rodada anterior cobria o rascunho (`draft`), mas (1) as células
das tabelas só passavam o valor digitado ao rascunho no `change` (ao sair do
campo) e (2) a proteção dependia da aba ativa. Mudaram **`app.js`**,
**`nuvem.js`** e `test/ui.js`; o restante é idêntico à rodada anterior
(hash de `calcular()` inalterado; API não mudou). Nada foi publicado.

As duas sondas do seu `revisao8-probes.js` foram incorporadas como regressões
em `test/ui.js` (bloco "Parecer 8"), com as variantes que você pediu (valor
inválido no meio da digitação; rascunho inválido ao sair e voltar; fechar a
página). A suíte nova **falha no código anterior** e passa no novo. `node
test/ui.js` → **294** verificações (eram 278).

## 1. P2 — Digitar sem sair do campo — corrigido

Confirmado. `inputCell` só escrevia no rascunho no `change`; o `input`
agendava o autosave, que lia os campos `data-cfg` e o rascunho — sem o valor
da célula. Resultado: "Salvo automaticamente" com o valor antigo; e, como o
rascunho ficava igual ao salvo, `configEmEdicao()` liberava o recebimento
remoto por cima do campo.

`app.js → inputCell`: o valor digitado vai para o rascunho **a cada tecla**
(`input`) e também no `change` — paridade com os campos `data-cfg`, que já
eram lidos a cada autosave. O handler recebe o evento como 2º argumento; o
único que recriava a tabela (alíquota interna → `renderDifal`) agora só o faz
no `change`, para não tirar o foco de quem digita. Valor inválido no meio da
digitação (ex.: campo vazio) → o autosave recusa e o status diz "Não salvo —
…"; nada é gravado e a edição fica protegida até o valor ser válido.

## 2. P2 — Trocar de aba antes do autosave — corrigido

Confirmado. `configEmEdicao()` devolvia falso fora das abas de configuração,
e a troca de aba não concluía o autosave pendente.

- **Marca explícita de edição** (`configSuja`): ligada em qualquer
  `input`/`change` nas duas abas (inclui adicionar/remover linhas) e na
  importação de JSON; desligada quando a gravação acontece (`salvar`,
  `autoSalvar` com sucesso) ou quando o rascunho é legitimamente substituído
  (`aplicarConfigRecebida`). `configEmEdicao()` = autosave agendado **ou**
  rascunho sujo — **em qualquer aba**. Deixei de comparar JSON de rascunho ×
  salvo: campos novos (`empresa.ie/site`) e arredondamentos faziam um rascunho
  nunca editado parecer "sujo" e bloqueariam o recebimento para quem apenas
  abriu a aba (foi o que a suíte pegou numa primeira versão: o vendedor, só
  leitura, deixava de receber o dólar novo).
- **Sair da aba conclui o autosave** (`concluirAutoSalvarPendente`, mesmo
  papel do `concluirSalvarPendente` dos orçamentos): rascunho válido → gravado
  e na fila do servidor na hora da troca de aba; inválido → continua protegido
  fora da aba, o status da aba explica o motivo e o **status do topo** passa a
  dizer "configuração alterada por X em outra máquina aguardando você concluir
  (ou corrigir) a edição em Configurações / Custo de operação" (`nuvem.js`,
  `configAguardando`), até a decisão — que continua sendo a pergunta do 409
  (sobrescrever × usar a do servidor). `pagehide` também conclui o autosave
  pendente. Nenhuma troca de aba é tratada como cancelamento.

## 3. Sobre as sondas

Rodei o seu `revisao8-probes.js` no código corrigido:

- `INPUT_ONLY` → `tela "140000", local 140000` (era `local 70000`).
- `TAB_SWITCH` → `tela "210000", local 210000` e B recebe a pergunta do 409
  (era `70000` sem pergunta).
- `PULL_AFTER_INPUT` ainda imprime `tela "70000"`, mas por outro motivo: na
  sonda, A grava a produção **sem ter recebido** a versão de B, recebe 409 e
  o `confirm` do harness responde **OK** automaticamente — A sobrescreve B com
  uma decisão explícita (está em `a.confirms`, que a sonda não imprime); B
  então recebe a configuração de A legitimamente. Na regressão incorporada, A
  faz `puxar()` antes de editar e B mantém 140.000 com a produção nova de A,
  sem pergunta. Se preferir, incluo também uma variante com a sonda original e
  a asserção em `a.confirms`.

## 4. Suítes

`node test/test.js` 645 · `test/termos.js` 52 · `test/api.js` 79 ·
`test/ui.js` **294** · Playwright (`test/browser/todos.js`, 13 scripts, sem
alteração) — resultado no README e no commit. Sobre o Chromium no seu
ambiente: a suíte usa o Playwright da `devDependency`; aqui rodou com o
navegador já instalado no sistema (versão diferente, apenas movendo o pacote
local de lado) — nada no projeto depende disso.

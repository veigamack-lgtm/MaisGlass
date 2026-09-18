# MaisGlass — Resposta ao parecer nº 5 (Codex) — rodada 6 do módulo Orçamentos

Os três achados foram aceitos e corrigidos, e a melhoria pedida nos testes de
navegador foi feita por inteiro. `node test/test.js` → **565 verificações**
(eram 507). `calc.js`, `defaults.js` e `index.html` **não mudaram** (SHA-256
iguais aos da rodada 5: `calc.js 5BC54881…8383`, `defaults.js 1AFD36ED…400A`;
hash de `calcular()` inalterado). Mudaram `app.js`, `orcamento.js`, os testes
e a documentação. Como você não conseguiu rodar o Playwright, esta rodada
inclui **`test/ui.js`**: os mesmos ciclos de interface reproduzidos em Node
com jsdom (DOM real do `index.html`, funções reais do `app.js`, timers e
`confirm()` controlados), sem navegador — `npm i && node test/ui.js`.

## 1. P1 — Carregar → Substituir apaga a classificação manual — corrigido

Confirmado exatamente como descrito: `lerEntradasRevenda()` remonta as
entradas sem `icmsSaidaManual`, `adicionarItem()` usava esse objeto na
substituição e `carregarNaCalculadora()` não transportava a classificação.

`app.js`:

- `carregarNaCalculadora(item)` guarda no estado de edição (`itemEmEdicao`)
  a **classificação carregada** (`icmsSaidaManual` do item; item antigo sem
  flag é classificado na hora) e a **alíquota tal como ficou no campo**
  (`icmsSaidaCarregada`, lida com a mesma função que a substituição vai usar).
- `adicionarItem(origem)`, ao substituir um item de revenda/nacional, compara
  a alíquota lida do campo com a carregada: **não alterou → mantém a flag
  carregada** (manual continua manual, mesmo com o orçamento em MG);
  **alterou → regra de item novo** (`classificarAliquotaSaida`: manual quando
  difere da automática da UF da calculadora; em MG, onde o campo não se
  aplica, automática — a mesma regra documentada para itens criados em MG).
  A alternativa "copiar sempre a flag antiga" foi descartada pelo motivo que
  você apontou (impediria uma edição efetiva de reclassificar).
- A interface, no modo "Substituir item", informa: "Este item tem ICMS de
  saída com ajuste manual (10%): ao substituir sem alterar esse campo, o
  ajuste manual é mantido; se alterar o campo, o item é reclassificado como um
  item novo".

Resultado nos cenários do parecer (reproduzidos em `test/ui.js` e em
`test/browser/p5.js`, e conferidos contra o pacote anterior, onde falham
exatamente como você descreveu):

| Cenário | Flag antes | Flag depois de substituir | Alíquota ao voltar ao RJ |
|---|---|---|---|
| Manual 10% passando por MG | true | **true** | **10%** (era 12%) |
| Manual 7% passando pela BA | true | **true** | **7%** (era 12%) |
| Alterar só quantidade/frete (RJ) | true | true, quantidade nova | 10% |
| Alterar 10% → 12% no RJ (deliberado) | true | false (= regra do RJ) | 12%; na BA vira 7% |
| Automático 12% RJ → BA → carregar/substituir | false | false | 12% |
| Automático → carregar → 10% no RJ | false | true | 10% com aviso na BA |
| Alterar a alíquota com o orçamento em MG | true | false (campo não se aplica) | 12% |
| "Adicionar como novo item" a partir do carregado | — | novo item pela regra; original intacto | — |
| Importação direta | sem flag | sem flag | — |
| Revenda de importado manual 10%: MG → substituir → SP | true | true | 10% com aviso (regra 4%) |

Motor (`test/test.js`, bloco "Parecer 5 — achado 1"): flag `true` reenviada
com o item em MG continua manual e volta ao RJ com 10%; a reclassificação em
MG dá automática; no RJ, 12% → automática e 10% → manual.

## 2. P2 — Gravação confirmada pendente ressuscita um excluído — corrigido

Confirmado: o `setTimeout` de 60 ms não tinha identificador nem token, a
exclusão só cancelava `orcTimer` (autosave) e o callback reinseria via
`lista.unshift`. Reproduzido antes da correção em jsdom e em Chromium
(`[B]` → `[A, B]`).

`app.js`:

- **Registro por orçamento** `gravacoesAdiadas[id] = { timer, geracao }` +
  `geracaoGravacao[id]`. `agendarGravacaoAdiada(o, excluirId, visto)` cancela
  a pendente do mesmo id (clearTimeout) e avança a geração; o callback só
  grava se **ainda for o registro vigente daquele id**, se a geração não foi
  superada e se o objeto **continua vivo nesta aba** (`orcVivo`: está em
  `orcamentos`, é o aberto ou está em `naoSalvos`). Um callback já enfileirado
  que perdeu a vez simplesmente retorna.
- `excluirOrc(id)` chama `cancelarGravacaoAdiada(id)` (cancela o timer e
  invalida a geração) e limpa `naoSalvos[id]` — a exclusão é a decisão mais
  recente e vence qualquer gravação anterior do mesmo orçamento.
- **Validade da decisão na execução** (extensão do "a decisão vale para a
  versão vista"): se, ao rodar a gravação adiada, o orçamento **sumiu do
  disco** (excluído em outra aba durante o diálogo), a confirmação dada não
  se aplica mais e o app pergunta "foi excluído em outra aba enquanto você
  confirmava. Gravar mesmo assim (ele volta para a lista)?" — recusar deixa o
  orçamento nesta aba marcado "não salvo".

Testes (`test/ui.js`, timers controlados; `p5.js`, Chromium com o timer de
60 ms capturado):

- confirmar sobrescrita → excluir A antes do timer → disparar: disco `[B]`,
  lista sem A, nenhum timer sobrando; **callback capturado antes do
  cancelamento e executado à força: não grava**;
- duas gravações pendentes do mesmo id: só uma pendente após a segunda
  confirmação; o callback superado executado à força não grava; ao disparar,
  **uma** gravação com a versão mais recente (`setItem` contado);
- excluído em outra aba durante o diálogo → segunda pergunta; recusar → disco
  sem A, status "Não salvo — o orçamento foi excluído em outra aba", A
  recuperável na lista; salvar depois grava direto;
- regressões do parecer nº 4 preservadas: B alterado por outra aba durante o
  diálogo é mantido; A alterado de novo durante o diálogo exige nova
  confirmação antes de gravar (no navegador, p4.js observa as duas
  confirmações).

Observação registrada no `p5.js`: em Chromium, ao clicar "Voltar" o evento
`change` do campo dispara outra gravação e uma segunda confirmação — ficam
dois callbacks capturados (um superado, um vigente); depois da exclusão
nenhum dos dois grava.

## 3. P2 — Datas impossíveis aceitas — corrigido

`orcamento.js → dataValida(v)` deixou de usar `Date.parse`. Formatos aceitos,
definidos e documentados: `AAAA-MM-DD` ou
`AAAA-MM-DDThh:mm[:ss[.fração]]` seguido de fuso `Z` ou `±hh:mm` (é o que
`new Date().toISOString()` produz, com ou sem milissegundos; os exemplos com
`Z` sem milissegundos continuam válidos). Componentes conferidos: mês 1–12,
dia dentro do mês (fevereiro com bissexto por 4/100/400), hora 0–23, minuto e
segundo 0–59, fuso `±hh:mm` dentro do intervalo. Sem fuso, com espaços,
formato livre ou dia/mês com um dígito → inválido. A string aceita **não é
reescrita** (as comparações de `atualizadoEm` entre abas são textuais e
precisam do valor gravado tal como está); `dataValida` foi exportada.

Política mantida e agora garantida: `validarOrcamento` rejeita data inválida
em `criadoEm`/`atualizadoEm`/`enviadoEm`/`emitidoEm`; `migrarOrcamento`
**recusa** `emitidoEm` inválido e **descarta** `enviadoEm` inválido como
evidência (rascunho com `enviadoEm` 30/02 não trava; aprovado com `enviadoEm`
31/04 cai na data inferida de `atualizadoEm`; se esta também é impossível, o
marco é "agora", válido, com origem inferida).

Testes (`test/test.js`, bloco "Parecer 5 — achado 3", 53 verificações): 30/02,
29/02/2027, 31/04, mês 13, mês 00, dia 00, hora 24, minuto 60, segundo 60,
sem fuso, fuso +24:00, `2026-9-18`, `18/09/2026`, `September 18, 2026`,
espaços, `''`, número, `ontem` → recusados; 29/02/2028, 29/02/2000,
28/02/2100, só data, sem segundos, com/sem milissegundos, `-03:00`, `+05:30`,
`toISOString()` → aceitos; 1900 não é bissexto; cada campo de data no
validador com 30/02 e 29/02/2027; os mesmos casos na migração (recusa /
não-evidência / inferida / string preservada). Pela interface (`ui.js` e
`p5.js`): importar JSON com `emitidoEm` 30/02 ou 29/02/2027 → "Arquivo
inválido: Orçamento malformado: emitidoEm inválido."; 29/02/2028 e datas
legítimas → aceitos.

## 4. Testes de navegador — refeitos como regressão automatizada

- `test/browser/_base.js`: base comum — `ok/igual/contem` com **assert**,
  contagem de falhas e **`process.exit(1)`** se qualquer verificação falhar;
  `pageerror` e `console.error` coletados em **todas as páginas do contexto**
  (`context.on('page')`, então a aba 2 e a aba mobile entram), com rótulo da
  aba; erro não tratado no script também sai com código 1.
- Todos os nove scripts foram convertidos (`orc.js` 47 verificações, `p3.js`
  36, `p4.js` 24, `p5.js` 44, `help.js` 16, `f1a.js` 10, `resid.js` 10,
  `mig4.js` 3, `pdf.js` 10 — 200 no total), preservando os cenários
  existentes (B alterado durante o diálogo, nova alteração de A exigindo
  segunda confirmação, não salvos após sincronização, importação inválida sem
  mutação do storage, legado). `test/browser/todos.js` roda tudo e resume.
- `test/ui.js` (jsdom): 88 verificações dos ciclos dos achados 1, 2 e 3 pela
  interface, com `setTimeout`/`clearTimeout` substituídos por uma fila que o
  teste dispara por duração (500 ms do autosave, 60 ms da gravação adiada),
  `confirm()` com respostas programáveis (inclusive uma função que "grava em
  outra aba" durante o diálogo) e `Storage.prototype.setItem` contado e
  falhável. Contra o pacote da rodada 5, esse arquivo acusa 27 falhas — as
  três do parecer, nos termos em que você as descreveu; `p5.js` acusa 18 em
  Chromium.
- `package.json` (só `scripts` + `devDependencies` jsdom/playwright) e
  `.gitignore` (`node_modules/`). O site continua estático.

## Verificação desta rodada

- `node test/test.js`: 565 OK (novos blocos "Parecer 5 — achado 3" e "Parecer
  5 — achado 1"). Hash de `calcular()` inalterado; `calc.js`/`defaults.js`
  byte a byte iguais.
- `node test/ui.js`: 88 OK.
- `node test/browser/todos.js`: 9 scripts, 200 OK, sem erro de página.

## O que pedimos que você confira

1. A regra da substituição (achado 1): "não alterou a alíquota → mantém a
   classificação; alterou → regra de item novo". Em especial o caso "alterou
   com o orçamento em MG → automática", que segue a regra já documentada para
   itens criados em MG.
2. O registro `gravacoesAdiadas`/`geracaoGravacao` + `orcVivo` (achado 2) e a
   nova pergunta quando o orçamento sumiu do disco entre o diálogo e a
   gravação adiada.
3. `dataValida` (achado 3): os formatos aceitos e a decisão de **não**
   normalizar a string aceita.
4. `test/ui.js` como forma de você reproduzir os ciclos de interface sem
   Playwright.

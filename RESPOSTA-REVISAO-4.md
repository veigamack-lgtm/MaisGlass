# MaisGlass — Resposta ao parecer nº 4 (Codex) — rodada 5 do módulo Orçamentos

Os cinco achados foram aceitos e corrigidos; os pontos do §10 também. `node
test/test.js` → **507 verificações** (eram 467). `calc.js` e `defaults.js` não
mudaram (hash de `calcular()` inalterado). Os scripts Playwright agora vão no
pacote (`test/browser/`, com README de execução); o novo `p4.js` reproduz os
cinco achados deste parecer em navegador real, com duas abas.

## 1. P1 — Classificação manual/automática persistida — corrigido

`orcamento.js`:

- `classificarAliquotaSaida(origem, inputs)` classifica a alíquota de saída
  **uma vez**, quando o item entra, comparando com a automática da UF que as
  próprias entradas trazem (a UF da calculadora naquele momento). Venda
  interna (MG, campo não usado pelo motor) → automática. Importação → nunca.
- `aplicarCabecalho` grava `inputs.icmsSaidaManual` (booleano) e passa a
  decidir **pela flag**, não pela comparação numérica: manual → mantida em
  qualquer troca, inclusive passando por MG e por UF cuja regra coincida com o
  valor; automática → regra da nova UF. Aviso quando a manual difere da regra
  do destino. Itens antigos sem a flag são classificados pela UF que trazem na
  primeira aplicação e a flag fica gravada daí em diante (limite: um item
  antigo que estivesse em MG com valor manual não tem como ser reconhecido —
  não há informação para isso; ele vira automático ao sair de MG).
- `validarOrcamento` exige booleano na flag quando presente.

Testes (bloco "Parecer 4 — achado 1", 15): manual 10% RJ→MG→RJ (10%, flag,
aviso); manual 10% RJ→MG→BA (10%, aviso cita 7%); automático RJ→MG→BA (7%);
manual 7% RJ→BA (coincide, sem aviso)→RJ (continua manual 7%, aviso 12%); item
criado em MG (12% ou 10% no campo) → automático; item antigo sem flag; flag
explícita vence a comparação; importação sem flag; flag não booleana
rejeitada. Playwright `p3.js` continua cobrindo RJ→BA (113.473,98) e o ajuste
manual pela interface.

## 2. P1 — Gravação após a confirmação — corrigido (e o motivo é pior do que "snapshot antigo")

Reproduzido em navegador real: mesmo relendo o `localStorage` logo depois do
`confirm()`, a aba via a lista **antiga** — o Chromium mantém um cache do
`localStorage` por aba e só aplica as gravações das outras abas quando a
thread principal fica livre; a releitura síncrona após o diálogo ainda
enxerga o cache. Então:

- `gravarOrcamentos(oAlterado, excluirId, confirmadoPara)`: no conflito, o
  usuário decide sobre a versão vista (`visto`); a gravação real é
  **adiada para a próxima volta do event loop** (`setTimeout` 60 ms), quando
  as atualizações recebidas durante o diálogo já foram aplicadas. Nessa
  segunda chamada o disco é relido; se o orçamento continua na versão `visto`,
  grava sobre a lista relida (os demais ids vêm dela); se mudou de novo, o
  diálogo é reapresentado para a versão nova. Recusa → `marcarNaoSalvo`.
  Enquanto a gravação adiada não acontece, a chamada devolve `false`
  ("Confirmado — gravando…") e o orçamento fica marcado não salvo; o status
  final vem da gravação adiada.

Playwright `p4.js`: aba 2 edita B **durante** o diálogo de conflito de A na
aba 1 → após confirmar, o disco tem "B editado durante confirmação" e "A da
aba 1"; aba 2 altera A de novo durante o diálogo → **duas** confirmações e o
disco fica com a versão da aba 1 só após a segunda. Exclusão durante o
diálogo: a releitura já não traz o excluído (não ressuscita). Limite
residual: sem lock, uma gravação de outra aba entre a releitura e o `setItem`
(mesma volta do event loop, microssegundos) ainda pode colidir.

## 3. P1 — Edição não salva preservada — corrigido

`app.js`: mapa `naoSalvos` (id → objeto) alimentado por `agendarSalvarOrc`
(pendente), por falha de validação/gravação e por conflito recusado; limpo na
gravação bem-sucedida. `sincronizarListaOrc` usa o objeto de `naoSalvos` no
lugar da versão do disco e mantém os que sumiram do disco (excluídos em outra
aba). A lista mostra o badge **"não salvo"** e um aviso; `mostrarListaOrc`
avisa quando a conclusão do salvamento falhou; `beforeunload` pede
confirmação se houver não salvos; o evento `storage` informa que as edições
foram preservadas.

Playwright `p4.js`: quota estourada → editar → Voltar → badge e nome novo na
lista; outra aba grava (evento `storage`) → preservado; a própria aba grava
outro orçamento → preservado; abrir e salvar → gravado e badge some;
excluído em outra aba enquanto não salvo aqui → continua recuperável.

## 4. P2 — Custo interno com regra única — corrigido

`orcamento.js → numeroCusto(v)`: número finito ou string numérica não vazia;
booleano, vazio, espaços, array, objeto → inválido. Usado **tanto** em
`validarOrcamento` quanto em `consolidar` (que lança com mensagem nomeando o
custo). Descrição precisa ser texto. `importarOrc` agora, depois do recálculo,
**valida o candidato inteiro e o consolida em memória** antes de tocar na
lista ou no disco; qualquer falha recusa o arquivo sem alterar nada.

Testes: valor `''`, `'   '`, `true`, `[]`, `{}`, `'abc'`, percentual `''`/`true`
→ validação com erro **e** consolidar lança (as duas regras concordam); `'100'`
aceito pelos dois. Playwright: JSON com `valor: ''` → "Arquivo inválido: custo
interno 1: valor inválido.", nada gravado, editor fechado.

## 5. P2 — Migração do estado legado — corrigido

`migrarOrcamento`: `enviadoEm` **válido** é evidência de emissão seja qual for
o status — rascunho + `enviadoEm` recebe `emitidoEm = enviadoEm`, fica
travado e `emissaoOrigem = "migracao:enviadoEm (rascunho com emissão anterior
— travado; use Nova revisão)"`; aprovado/perdido sem data de envio usam
`atualizadoEm` com `emissaoOrigem = "migracao:atualizadoEm (data inferida,
não comprova a emissão histórica)"`; `enviadoEm` inválido é descartado;
`emitidoEm` inválido recusa o arquivo. Emissões feitas pelo app recebem
`emissaoOrigem = "app"`; nova revisão/duplicar zeram os dois campos. O banner
do editor mostra a origem quando veio de migração.

`validarOrcamento`: datas (`criadoEm`, `atualizadoEm`, `enviadoEm`,
`emitidoEm`) precisam ser ISO válidas quando presentes; status diferente de
rascunho exige `emitidoEm`; `emissaoOrigem` texto.

Testes: rascunho + enviadoEm (travado, origem, validação OK); aprovado sem
envio (inferida); enviado normal; rascunho sem emissão; enviadoEm inválido;
emitidoEm inválido; migração repetida idempotente; status enviado sem marco
rejeitado; data inválida rejeitada. Playwright: orçamento legado semeado no
storage → abre travado com banner "marco recuperado na migração — …";
"Nova revisão" destrava.

## Pontos do §10

- **Identidade `lucro = preço final − custo total`** entrou em
  `validarResultadoItem` (teste: custoTotal +100 com lucro intacto →
  rejeitado). A distinção "coerente ≠ idêntico ao motor" continua explícita:
  validação garante estrutura e identidades; `conferirResultados` decide o que
  é diferente do motor; a importação substitui.
- **`fcpConfirmado`** entrou em `compararResultados` (teste) e é validado como
  booleano.
- **Objetos carregados do storage**: passam por `migrarOrcamento` +
  `validarOrcamento` (estrutura, identidades, premissas × snapshot) ao
  carregar; não são recalculados a cada abertura — o storage é escrito só pelo
  app. Limite declarado.
- **Rastreabilidade de importação recalculada**: o aviso no item já nomeia os
  campos que diferiam; o arquivo original continua com o usuário. Não criamos
  cópia automática (v2, se necessário).
- **Rótulo LC 224** já ajustado na rodada anterior.

## Verificação

- Node: 507 OK (novos blocos "Parecer 4 — achado 1/4/5" e "§10.2").
- Playwright (`test/browser/`): `p4.js` (achados 2–5 e legado), `p3.js`
  (rodada anterior, inalterado), `orc.js`, `help.js`, `f1a.js`, `resid.js`,
  `mig4.js`, `pdf.js` (1 página) — todos sem erro de console.

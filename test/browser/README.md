# Testes de navegador (Playwright)

Scripts usados na validação do módulo Orçamentos e da nuvem. Não fazem parte
da suíte Node; exigem Chromium via Playwright. Cada script **sobe o próprio
servidor local** (`test/servidor-local.js`: arquivos + a mesma API com banco em
memória, admin `admin@maisglass.local` / `admin12345`) em uma porta livre e
entra por e-mail — não precisa de Vercel nem de Neon. `GM_URL` aponta para
outro servidor (ex.: uma prévia da Vercel com banco de teste; `GM_EMAIL` e
`GM_SENHA` para o login).

Todos são **assert-based** (base comum em `_base.js`): cada verificação imprime
`OK`/`FALHA`, os erros de página (`pageerror` e `console.error`) são coletados
em **todas** as abas abertas pelo script, e o processo termina com **código 1**
se qualquer verificação falhar ou se houver erro de página. Um script que
termina normalmente é uma regressão aprovada; não é preciso ler a saída.

```
npm i && npx playwright install chromium
node test/browser/todos.js         # roda todos em sequência (código 1 se algum falhar)

node test/browser/orc.js           # fluxo completo do orçamento (47 verificações)
node test/browser/p3.js            # reprodução dos 8 achados do parecer nº 3 (36)
node test/browser/p4.js            # reprodução dos achados 2–5 do parecer nº 4 (duas abas, quota, legado) (24)
node test/browser/p5.js            # reprodução dos 3 achados do parecer nº 5 (carregar/substituir, gravação adiada × exclusão, datas) (44)
node test/browser/p6.js            # reprodução dos 2 achados do parecer nº 6 (recriação confirmada adiada, recusa cancela a pendente) (32)
node test/browser/nuvem.js         # DUAS MÁQUINAS (dois contextos): login, troca de senha, usuário comum, lista compartilhada, 409, 410, config, offline, migração (34)
node test/browser/help.js          # botões "?" das três abas (16)
node test/browser/f1a.js           # FCP na importação direta / presumido v4 / LC 224 (10)
node test/browser/resid.js         # resíduos da rodada 2 (10)
node test/browser/mig4.js          # migração de configuração v3 → v4 (3)
node test/browser/pdf.js           # proposta impressa → proposta.pdf na pasta temporária (10)
```

Alguns scripts simulam falha de armazenamento sobrescrevendo
`Storage.prototype.setItem`, conflitos entre duas abas do mesmo contexto e, no
`p5.js`/`p6.js`, capturam o timer de 60 ms da gravação confirmada
(`window.setTimeout`) para sequenciar as ações da outra aba "antes" dele de
forma determinística.

Respostas HTTP 401/409/410 aparecem no console do Chromium como "Failed to
load resource"; são tratadas pelo app de propósito e não contam como erro de
página. Os mesmos ciclos (pareceres nº 5 e 6 e nuvem) também estão em
`test/ui.js` (jsdom, sem navegador, timers e `confirm()` controlados).

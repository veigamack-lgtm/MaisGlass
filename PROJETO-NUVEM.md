# MaisGlass — Projeto "Nuvem": login por pessoa e dados compartilhados (Vercel + Neon)

Data: 24/09/2026. **Implementado em 24/09/2026** (decisão do dono: sem rodada
de revisão do Codex; planos pagos da Vercel e do Neon). Motor de cálculo
(`calc.js`, `defaults.js`, `orcamento.js`) e as três calculadoras **não
mudaram** (byte a byte iguais à versão aprovada; hash de `calcular()`
inalterado). As diferenças entre o projeto e o que foi implementado estão no
§16.

## 1. Problema e objetivo

Hoje o app é um site estático no GitHub Pages: configurações e orçamentos
ficam no `localStorage` do navegador de cada máquina. Outro computador (ou
outro navegador) abre o site com a lista vazia; limpar dados de navegação
apaga tudo; a "senha" é uma trava local única, não identifica ninguém.

Objetivo: um lugar central para os dados, login por pessoa e a mesma lista de
orçamentos em qualquer computador, mantendo o app como está (mesmos arquivos,
mesmo fluxo de publicação pelo GitHub) e sem servidor próprio para manter.

## 2. Decisões tomadas com o dono (24/09/2026)

1. **Login por e-mail + senha**, usuários cadastrados pelo administrador
   (sem Google/OAuth nesta versão).
2. **Todos veem e editam todos os orçamentos** (lista única da empresa), com
   registro de quem criou e quem alterou cada um.
3. **Configurações (dólar, produtos, alíquotas, DIFAL) só por
   administradores**; os demais usam, não editam.
4. **GitHub Pages é desligado** depois da transição; o endereço passa a ser o
   da Vercel (`….vercel.app`; domínio próprio depois, quando houver).
5. Infra: **Vercel** (site + funções de servidor) e **Neon** (Postgres), contas
   que o dono já tem.

## 3. Arquitetura

```
GitHub (código) ──publica sozinho──▶ Vercel
                                     ├── arquivos estáticos: index.html, app.js, calc.js, defaults.js, orcamento.js, nuvem.js (novo)
                                     └── funções (pasta api/, Node): login, sessão, sync, orçamentos, config, usuários
                                                    │
                                                    ▼
                                              Neon (Postgres): usuarios, sessoes, orcamentos, orcamentos_hist, config
Navegador de cada pessoa: localStorage vira CACHE + FILA de envio; o servidor é a verdade.
```

- Um repositório só. A Vercel se conecta ao `veigamack-lgtm/MaisGlass` e
  publica a cada commit — o fluxo "subir arquivos no GitHub" continua igual.
- Sem framework, sem build: os arquivos estáticos são servidos como estão e a
  pasta `api/` vira funções de servidor automaticamente (Vercel Functions,
  runtime Node). Uma dependência nova no `package.json`:
  `@neondatabase/serverless` (driver do Neon feito para funções).
- Os motores `calc.js` e `orcamento.js` já rodam em Node (a suíte de testes
  prova isso): o **servidor valida cada orçamento com os mesmos
  `migrarOrcamento` + `validarOrcamento`** do app antes de gravar.

## 4. O que muda para quem usa

- Tela de login com **e-mail e senha**. A senha única "glassmais" e o
  `SENHA_HASH` deixam de existir.
- Aba nova **Usuários** (só administradores): cadastrar, desativar, redefinir
  senha, definir papel. Menu do usuário: **Trocar senha**, **Sair**.
- Orçamentos e configuração vêm do servidor. O navegador guarda uma cópia
  local para abrir rápido e para não perder nada se a internet cair;
  alterações vão para o servidor em segundos. Status na tela: "Salvo neste
  computador · enviando…" → "Sincronizado às HH:MM"; se estiver sem conexão,
  "Sem conexão — N alterações aguardando envio".
- O aviso de conflito "alterado em **outra aba**" ganha a versão "alterado
  por **Fulano** às HH:MM em **outra máquina**" — mesma mecânica de decisão
  (a confirmação vale para a versão vista; se mudou de novo, pergunta de
  novo), agora com o servidor como árbitro.
- Cada orçamento mostra "criado por / alterado por" e o histórico de versões
  fica guardado no servidor (recuperação de uma versão sobrescrita é v2).
- Botão **"Enviar os orçamentos deste computador para a nuvem"** aparece uma
  vez em cada máquina que tinha orçamentos locais antes da mudança.
- Tudo o que é cálculo, proposta impressa, exportar/importar JSON continua
  igual.

## 5. O que o dono faz (uma vez, uns 20 minutos)

1. **Neon**: criar projeto `maisglass`, região São Paulo. Não criar tabelas
   (o app cria).
2. **Vercel**: Add New Project → importar `veigamack-lgtm/MaisGlass` →
   Framework "Other", sem build → Deploy. O site atual já funciona no
   `….vercel.app` (Fase 0).
3. **Vercel → Storage/Integrations → Neon**: conectar ao projeto; isso
   define `DATABASE_URL`. Se não houver o botão: copiar a connection string
   no Neon e colar em Settings → Environment Variables (`DATABASE_URL`).
   **Nunca colar a string nem senhas em chat/e-mail.**
4. Environment Variables: `ADMIN_EMAIL` (e-mail do dono) e
   `ADMIN_SENHA_INICIAL` (provisória; trocada no primeiro login). Não há
   outro segredo: as sessões são tokens aleatórios guardados no banco, não
   precisam de chave de assinatura.
5. Plano da Vercel: ver §12 (uso comercial exige o plano Pro).
6. Passar ao desenvolvimento só o endereço `….vercel.app`.

## 6. Modelo de dados (Postgres, criado por `CREATE TABLE IF NOT EXISTS` na primeira chamada)

```sql
usuarios        (id serial PK, email text UNIQUE NOT NULL (minúsculo), nome text, senha_hash text NOT NULL,
                 papel text CHECK (papel IN ('admin','usuario')), ativo boolean DEFAULT true,
                 senha_trocada_em timestamptz NULL, criado_em timestamptz, criado_por int NULL)
sessoes         (token_hash text PK, usuario_id int FK, criado_em, expira_em, ultimo_uso, agente text)
tentativas_login(email text, ip text, quando timestamptz)                       -- limite de tentativas
orcamentos      (id text PK, dados jsonb NOT NULL, versao int NOT NULL,
                 criado_por int, criado_em timestamptz, atualizado_por int, atualizado_em timestamptz,
                 excluido_em timestamptz NULL, excluido_por int NULL)
orcamentos_hist (orc_id text, versao int, dados jsonb, atualizado_por int, atualizado_em timestamptz, PRIMARY KEY (orc_id, versao))
config          (id int PK CHECK (id = 1), dados jsonb NOT NULL, versao int NOT NULL, atualizado_por int, atualizado_em timestamptz)
```

- `dados` é o **mesmo JSON do orçamento** que o app já usa e exporta (com
  `configSnapshot`, `premissas`, itens e resultados). Nada é reprojetado em
  colunas; o servidor valida a estrutura com o motor e guarda inteiro.
- `versao` é o contador de concorrência: toda gravação exige a `versaoBase`
  que o cliente conhece; diferente → conflito (409). Substitui a comparação
  de `atualizadoEm` entre abas por uma comparação de versão inteira.
- Exclusão é **lógica** (`excluido_em`): o outro computador fica sabendo na
  sincronização; o histórico e a auditoria continuam; restaurar é v2.
- `orcamentos_hist` guarda cada versão gravada (custo: ~10–30 KB por
  gravação; centenas de orçamentos ficam em dezenas de MB — dentro do plano
  gratuito do Neon, ver §12).
- `config` é única (id = 1): a configuração da empresa.

## 7. Autenticação, sessão e permissões

- **Senha**: `scrypt` do Node (`crypto.scryptSync`, salt aleatório por
  usuário, N = 16384), comparação em tempo constante. Mínimo 8 caracteres.
- **Login** `POST /api/login {email, senha}`: mensagem genérica "E-mail ou
  senha incorretos"; após 10 falhas do mesmo e-mail ou IP em 15 minutos,
  bloqueio de 15 minutos (tabela `tentativas_login`). Usuário inativo não
  entra.
- **Sessão**: token aleatório de 32 bytes; no banco só o SHA-256 dele;
  cookie `gm_sessao` **HttpOnly, Secure, SameSite=Lax, Path=/**, 30 dias com
  renovação a cada uso. `GET /api/sessao` diz quem está logado; 401 mostra a
  tela de login. **Sair** apaga a sessão. Trocar a senha ou desativar o
  usuário apaga as demais sessões dele.
- **CSRF**: cookie SameSite=Lax + toda mutação exige `Content-Type:
  application/json` e o cabeçalho `X-Requested-With: MaisGlass` (o navegador
  não manda isso em formulários de terceiros).
- **Bootstrap**: na primeira chamada, se `usuarios` está vazia, cria o
  administrador com `ADMIN_EMAIL`/`ADMIN_SENHA_INICIAL` e
  `senha_trocada_em = NULL` → o app obriga a trocar a senha no primeiro
  login (vale para toda senha inicial/redefinida).
- **Papéis**: `admin` — tudo (usuários, configuração, orçamentos);
  `usuario` — orçamentos (criar, editar, excluir qualquer um), configuração
  só leitura, trocar a própria senha. O servidor impõe (403); o cliente só
  esconde botões. Regras: não desativar a si mesmo; não desativar/rebaixar o
  último administrador.
- **Transporte**: HTTPS pela Vercel. Nenhum segredo no front-end; a string
  do Neon só existe nas variáveis de ambiente da Vercel.

## 8. API (JSON; todas exigem sessão, salvo login)

| Rota | Quem | Faz |
|---|---|---|
| `POST /api/login` · `POST /api/logout` · `GET /api/sessao` · `POST /api/senha {atual, nova}` | todos | sessão e senha |
| `GET /api/sync?desde=<iso>` | todos | tudo que mudou desde `desde` (orçamentos, inclusive excluídos, e a config com versão); sem `desde` = carga completa. Devolve também `agora` do servidor para o próximo `desde` |
| `GET /api/orcamentos/:id` | todos | um orçamento (com versão, quem/quando) |
| `PUT /api/orcamentos/:id {dados, versaoBase}` | todos | grava. `versaoBase` = versão conhecida (null = novo). Diferente da atual → **409** com `{versao, atualizadoEm, atualizadoPor, dados}`; id excluído → **410** com quem/quando; inválido pelo motor → 400 |
| `PUT /api/orcamentos/:id {dados, recriar: true}` | todos | recria um excluído (limpa `excluido_em`, versão + 1) — só após 410 |
| `DELETE /api/orcamentos/:id?versaoBase=n` | todos | exclusão lógica; 409 se a versão não é a conhecida |
| `POST /api/orcamentos/importar-local {orcamentos: [...]}` | todos | migração inicial: para cada um, valida; id inexistente → cria; id existente com conteúdo idêntico → ignora; id existente com conteúdo diferente → cria com id novo (`_migrado`) e avisa. Devolve relatório |
| `PUT /api/config {dados, versaoBase}` | admin | grava a configuração (validada por `validarConfig`); 409 em conflito |
| `GET /api/usuarios` · `POST /api/usuarios {email, nome, papel}` · `PATCH /api/usuarios/:id {nome, papel, ativo, redefinirSenha}` | admin | gestão; criar/redefinir devolve a senha inicial **uma vez** |

Limites: corpo até 2 MB; `dados.id` tem que bater com o id da rota; datas e
estrutura pelo motor (`migrarOrcamento` + `validarOrcamento`); `versao` e
`atualizadoEm` do servidor vencem os do arquivo.

## 9. Cliente — camada de sincronização (`nuvem.js`, novo; `app.js` só troca as pontas)

Princípio: **o código de persistência já revisado (rodadas 3–7) continua
intacto**: `gravarOrcamentos` segue gravando no `localStorage` e tratando
conflito entre abas da mesma máquina. `nuvem.js` entra **por cima**, como um
segundo estágio: "gravou localmente → enfileira envio → envia → confirma".

Estado local (`localStorage`):

- `glassmais.orcamentos.v1` — cache (igual a hoje);
- `glassmais.config.v1` — cache da configuração;
- `glassmais.sync.v1` — `{ versoes: {id → versao}, configVersao, fila: [{id, tipo: 'put'|'del', versaoBase, quando}], ultimaSync }`.

Fluxo de envio (**push**):

1. Toda gravação local bem-sucedida enfileira `{id, 'put', versoes[id]}`;
   exclusão enfileira `'del'`. Um `sincronizar()` com debounce de 300 ms
   processa a fila em série (uma requisição por vez; `navigator.locks`
   quando disponível para não competir com outra aba da mesma máquina —
   sem ele, a segunda aba recebe 409/200 e reconcilia, sem dano).
2. `200` → `versoes[id] = versão nova`, item sai da fila, status
   "Sincronizado às HH:MM".
3. `409` (outra máquina gravou antes) → diálogo: **"«Cliente X» foi alterado
   por Fulano às HH:MM em outra máquina. Sobrescrever com a versão deste
   computador?"** — OK: reenvia com `versaoBase` = a versão vista (a decisão
   vale para aquela versão; se mudou de novo, 409 de novo e nova pergunta —
   o protocolo já aprovado nas rodadas 4–7); Cancelar: a cópia local fica
   marcada **"não sincronizado"**, sai da fila, e a versão do servidor é
   mostrada ao lado na lista (abrir e salvar de novo repete a pergunta;
   exportar JSON guarda a sua). Mesmo comportamento da recusa de hoje.
4. `410` (excluído em outra máquina) → diálogo "excluído por Fulano às HH:MM.
   Recriar?" — OK: `recriar: true`; Cancelar: como acima.
5. `400/403` → mensagem e item marcado; `401` → sessão expirou → tela de
   login (fila preservada, continua depois).
6. Sem rede/5xx → item fica na fila, nova tentativa em 5 s, 15 s, 60 s, e a
   cada volta de foco; `beforeunload` avisa se há fila.

Fluxo de recebimento (**pull**): `GET /api/sync?desde=ultimaSync` a cada
30 s, ao ganhar foco/visibilidade, ao entrar e após cada push. Para cada
orçamento recebido: id com envio pendente na fila → ignora (o push resolve);
orçamento **aberto** nesta aba → avisa "alterado por Fulano em outra máquina;
a próxima gravação vai pedir confirmação" e **não** atualiza `versoes[id]`
(é isso que garante o 409 depois — o mesmo papel do `orcGravadoEm` de hoje);
demais → substitui a cópia local e `versoes[id]`; excluído → remove da
lista (aberto → aviso, como hoje). `ultimaSync` recebe o `agora` do
servidor (com 2 s de sobreposição para não perder nada por relógio).

Carga inicial após login: `sync` sem `desde` substitui o cache, preservando
ids com fila pendente e os `naoSalvos`. Se sobrarem orçamentos locais que
o servidor não conhece (`versoes[id]` ausente), aparece o botão de migração
(§4), que chama `importar-local` e mostra o relatório.

Configuração: mesmo padrão (`PUT /api/config` com `configVersao`), só para
admin; para os demais, a aba Configurações fica em leitura e a configuração
chega pelo pull. Mudança de configuração não recalcula orçamentos (eles são
congelados — regra já existente).

Duas abas na mesma máquina: nada muda (localStorage + evento `storage` +
protocolo já revisado); a fila é compartilhada via `localStorage`.

## 10. Interface

- Login: e-mail, senha, "Entrar"; erro genérico; aviso de bloqueio
  temporário; tela "Defina uma nova senha" quando `senha_trocada_em` é nulo.
- Cabeçalho: nome do usuário, "Trocar senha", "Sair"; indicador de
  sincronização (ok / enviando / sem conexão / N pendentes).
- Aba Usuários (admin): tabela (nome, e-mail, papel, ativo, último acesso),
  "Novo usuário" (mostra a senha inicial uma vez, com botão copiar),
  "Redefinir senha", "Desativar/Reativar", papel.
- Lista de orçamentos: colunas "alterado por" e badge **"não sincronizado"**
  (além do "não salvo" de hoje, que continua significando "nem localmente").
- Editor: linha "criado por … em … · alterado por … em …".
- Configurações para `usuario`: campos desabilitados e aviso "só
  administradores alteram; peça ao administrador".
- Botão de migração (§4) na lista, com relatório do que subiu.

## 11. Testes

- **Node, sem banco** (`test/api.js`): os handlers da `api/` acessam o banco
  por um módulo `repositorio` com duas implementações — Neon (produção) e
  **memória** (testes). Cobre: bootstrap do admin; login/senha/bloqueio;
  sessão e expiração; CSRF; permissões por papel; `PUT` com `versaoBase`
  certa/errada/nula; 409/410/recriar; `DELETE` com versão; `sync` com
  `desde`; `importar-local` (novo, idêntico, divergente); validação pelo
  motor (JSON adulterado recusado com a mesma mensagem da rodada 4);
  histórico gravado; regras de último admin. Roda com `node test/api.js`,
  sem segredos.
- **jsdom** (`test/ui.js`, ampliado): `fetch` falso apontando para os
  handlers em memória → **duas "máquinas" (duas janelas jsdom) contra o
  mesmo servidor falso**: conflito 409 (aceitar/recusar), 410 (recriar),
  fila sem rede e reenvio, pull atualizando a lista, aberto alterado em
  outra máquina, migração inicial, usuário sem permissão na configuração.
- **Playwright** (`test/browser/`): `test/servidor-local.js` (Node puro)
  monta os mesmos handlers em memória junto com os arquivos estáticos, para
  rodar os cenários com dois contextos de navegador (duas máquinas de
  verdade) e para desenvolvimento local sem Vercel/Neon.
- **Fumaça contra o Neon** (`test/api-real.js`, opcional, precisa de
  `DATABASE_URL` de um branch de teste do Neon): cria tabelas, um usuário, um
  orçamento, conflito e limpa.
- A suíte do motor (`test/test.js`, 565) não muda; `calcular()` continua
  com o hash guardado.

## 12. Custos e limites dos planos (confirmados em 24/09/2026)

- **Vercel**: o plano gratuito (Hobby) é para uso pessoal e **não comercial**
  ("the Hobby plan restricts users to non-commercial, personal use only");
  para a MaisGlass o correto é o **Pro** — cobrado por assento de
  desenvolvedor, **US$ 20 por usuário/mês**; só quem publica precisa de
  assento (o dono); quem usa o app não é usuário da Vercel. As cotas do Pro
  cobrem com folga um app interno (as do Hobby já seriam 1 milhão de
  invocações e 100 GB de transferência/mês). Há período de teste do Pro.
  Fonte: [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby) e
  [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines).
- **Neon**: plano Free com **0,5 GB por projeto**, **100 CU-horas/mês**,
  **suspensão automática após 5 minutos** sem uso (não desligável no Free →
  a primeira chamada depois de um intervalo demora 1–3 s; o app mostra
  "Conectando…") e **6 horas** de janela de restauração. Para o volume
  esperado (poucos usuários, centenas de orçamentos, KB por gravação) cabe
  no Free; se quiser sem suspensão e restauração mais longa, o plano Launch
  é por uso (US$ 0,106/CU-hora e US$ 0,35/GB-mês), poucos dólares por mês.
  Fonte: [Neon plans](https://neon.com/docs/introduction/plans).
- Recomendação: **Vercel Pro (1 assento) + Neon Free** para começar.

## 13. Riscos, limites e privacidade

- **Suspensão do Neon Free**: atraso de segundos na primeira chamada após
  inatividade — aceitável para ferramenta interna; mitigável com o plano
  pago.
- **Trabalho sem internet**: dá para calcular e editar; o envio espera a
  conexão (fila). Não é um modo offline completo: conflitos só são
  descobertos ao enviar.
- **Cache local**: continua por máquina, mas agora é descartável — limpar o
  navegador só obriga a baixar de novo. Nada é perdido se estiver
  sincronizado (indicador na tela).
- **Concorrência**: dois computadores editando o mesmo orçamento ao mesmo
  tempo → o segundo a gravar vê o conflito e decide. Sem edição simultânea
  colaborativa (não é o objetivo).
- **Dados pessoais de clientes** (nome, contato) passam a ficar no Neon
  (região São Paulo), acessíveis só com login; histórico de versões guarda
  versões antigas — exclusão definitiva por administrador é v2.
- **GitHub Pages** deve ser desligado após a migração (Settings → Pages →
  None), senão uma versão que grava só no navegador continua no ar; o código
  em `api/` não tem segredo, mas não deve ser servido como estático.
- **Uma configuração para a empresa**: a configuração local de cada máquina
  deixa de valer; a do administrador sobe na migração.

## 14. Fases

- **Fase 0 — hoje mesmo**: dono cria o projeto na Vercel a partir do GitHub
  (o site atual passa a existir também no `….vercel.app`), conecta o Neon e
  define as variáveis (§5).
- **Fase 1 — servidor**: `api/` (login, sessão, usuários, config,
  orçamentos, sync, importação), `repositorio` memória/Neon, `test/api.js`.
- **Fase 2 — cliente**: login por e-mail, `nuvem.js`, aba Usuários,
  indicadores, botão de migração; `test/ui.js` e Playwright com duas
  máquinas.
- **Fase 3 — revisão**: rodadas com o Codex (mesmo fluxo de sempre);
  publicação pelo GitHub; a Vercel publica sozinha.
- **Fase 4 — transição**: dono entra, troca a senha, cadastra os usuários;
  cada máquina faz "Enviar para a nuvem"; GitHub Pages desligado.
- **v2 (fora deste projeto)**: restaurar excluídos/versões antigas, filtros
  por vendedor, guardar o PDF da proposta enviada, domínio próprio,
  login Google.

## 15. O que pedimos que o Codex avalie

1. Modelo de concorrência: `versao` inteira + `versaoBase` no `PUT`, 409/410
   e a regra "a decisão vale para a versão vista" — equivalência com o
   protocolo entre abas já aprovado, e a interação entre os dois (mesma
   máquina × outra máquina).
2. A camada `nuvem.js` como segundo estágio sobre `gravarOrcamentos` sem
   alterar o código revisado; a regra de não atualizar `versoes[id]` do
   orçamento aberto no pull.
3. Sessão (token aleatório com hash no banco, cookie HttpOnly/Lax, sem
   segredo de assinatura), CSRF pelo cabeçalho, limite de tentativas,
   `scrypt`.
4. Validação no servidor com o próprio motor e a política de
   `importar-local` (idêntico ignora; divergente vira id novo).
5. Estratégia de testes sem banco (repositório em memória) e com duas
   máquinas.
6. Exclusão lógica + histórico: custo de armazenamento × valor.

## 16. Implementação (24/09/2026) — o que ficou diferente do projeto

- **Infra do dono**: projeto Vercel `mais-glass` (time Pro) →
  `https://mais-glass.vercel.app`; projeto Neon `maisglass` (São Paulo),
  conectado por `DATABASE_URL` colada em Environment Variables (a integração
  "Storage" da Vercel só lista bancos criados pela própria Vercel). Planos
  pagos nos dois, então a restrição comercial do Hobby (§12) não se aplica.
- **`vercel.json`**: funções fixadas em **`gru1` (São Paulo)**, ao lado do
  banco (o padrão da Vercel é Washington, ~120 ms por consulta a mais);
  `installCommand` só com dependências de produção; cabeçalhos
  `nosniff`/`DENY`/`same-origin`. `.vercelignore` tira testes e documentos do
  deploy.
- **Rotas**: um arquivo fino por rota em `api/` chamando
  `api/_lib/app.js → handlerVercel(rota)`; toda a lógica em `_lib`
  (independente da Vercel, testável com `test/servidor-local.js`).
- **Esquema**: criado na primeira chamada; nova tentativa se duas funções
  frias colidirem no `CREATE … IF NOT EXISTS`.
- **Carga inicial com cópia local divergente** (não previsto no §9): se um id
  que o servidor já tem existe no navegador com conteúdo diferente e sem
  versão conhecida, a cópia local **ganha um id novo** ("(cópia deste
  computador)") e vai para "Enviar para a nuvem"; o id original recebe a do
  servidor. Se for o orçamento aberto, a versão não é adotada e a próxima
  gravação recebe 409 e pergunta.
- **Decisão entre abas levada ao servidor**: quando o protocolo entre abas
  (rodadas 4–7) já confirmou recriar um orçamento excluído em outra aba, o
  envio leva `recriarConfirmado` e, num 410, recria sem perguntar de novo.
- **Lock entre abas**: `navigator.locks` ("glassmais-sync", `ifAvailable`),
  como previsto; sem ele o envio segue e o conteúdo igual é reconciliado.
- **Proteções**: estado de sincronização em memória quando o navegador
  recusa gravar (evita reenvio infinito); no máximo 5 reenvios seguidos da
  mesma entrada, depois vira "não aceito pelo servidor" no orçamento.
- **Conflito recusado** vira estado "conflito" com banner no editor ("Enviar a
  minha versão" / "Usar a versão do servidor"); 410 recusado vira "excluído em
  outra máquina" ("Recriar" / "Remover deste computador").
- **Endereço antigo sem servidor** (GitHub Pages com o código novo): a tela
  de entrada oferece **"Baixar cópia de segurança deste navegador"** — arquivo
  `maisglass-backup-AAAA-MM-DD.json` com os orçamentos e a configuração dessa
  origem (o `localStorage` é por endereço: o que está no github.io não aparece
  na Vercel). Orçamentos → Importar aceita esse arquivo (vários de uma vez);
  Configurações → Importar também.
- **Testes**: `test/api.js` (69; também contra Postgres real via
  `PG_TESTE_URL`, usado para validar o SQL do repositório Neon),
  `test/ui.js` (197; inclui duas máquinas jsdom contra o servidor local),
  Playwright `test/browser/nuvem.js` (34; dois contextos = duas máquinas) e os
  scripts anteriores adaptados ao login por e-mail (232 no total com os 10
  anteriores). Suíte do motor intacta (565).

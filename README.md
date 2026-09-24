# MaisGlass — Calculadora

Calculadora de precificação de vidro (importação direta, revenda de importado,
indústria nacional) com módulo de **Orçamentos**, portada da planilha
**"MaxiBuild Vidro Automatica Corte atualizado.xlsx"**. Front-end sem build
(HTML + JS) com um back-end pequeno em **funções da Vercel** e banco
**Postgres no Neon**: login por pessoa, configuração única da empresa e lista
de orçamentos compartilhada entre os computadores.

Endereço: **https://mais-glass.vercel.app** (domínio próprio pode ser apontado
depois em Vercel → Domains).

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Interface (login, Início, três calculadoras, Orçamentos, Configurações, Usuários). CSS embutido, inclusive o de impressão da proposta. |
| `calc.js` | Motor de cálculo puro (sem DOM). Cada fórmula cita a célula da planilha de origem. |
| `defaults.js` | Valores padrão: produtos, classes fiscais + NCM, despesas nacionais, entreposto, cartão, DIFAL. É o "Restaurar padrão". |
| `orcamento.js` | Motor do módulo Orçamentos (puro): consolida itens das três calculadoras, custos internos, DRE real × presumido. Usado também pelo servidor para validar. |
| `app.js` | Liga interface ↔ motores; login; cache local; exportar/importar JSON; aba Orçamentos, proposta impressa, aba Usuários. |
| `nuvem.js` | Sincronização com o servidor: fila de envio, recebimento periódico, conflito por versão (409/410), migração de orçamentos locais. |
| `api/` | Funções da Vercel (Node). `api/_lib/app.js` tem todas as rotas e regras; `repositorio.js` fala com o Neon (e tem uma versão em memória para testes); `auth.js` senhas/sessões; `validar.js` usa os motores. |
| `vercel.json` | Região das funções em São Paulo (`gru1`, ao lado do banco), instalação só das dependências de produção, cabeçalhos de segurança. |
| `package.json` | Dependência de produção: `@neondatabase/serverless`. Dependências de teste: jsdom, pg, playwright. |
| `test/test.js` | Motor (planilha, memorial da contadora, orçamentos): `node test/test.js` — 565 verificações, sem dependências. |
| `test/api.js` | API contra o servidor local em memória: `node test/api.js` — 69 verificações. Com `PG_TESTE_URL=postgres://…` roda o mesmo contra um Postgres de verdade (usa `pg`; **nunca** aponte para o banco de produção — ele apaga as tabelas). |
| `test/ui.js` | Interface em jsdom com o servidor local: duas "máquinas", conflitos, exclusão, fila sem rede, migração, usuários, cópia de segurança — 197 verificações. |
| `test/browser/` | Playwright (Chromium) assert-based, cada script sobe o próprio servidor local — `node test/browser/todos.js`; ver `test/browser/README.md`. |
| `test/servidor-local.js` | Servidor local: arquivos + a mesma API com banco em memória. `node test/servidor-local.js` → http://localhost:8765 (admin@maisglass.local / admin12345). |

## Publicação (Vercel + Neon)

O código fica no GitHub (`veigamack-lgtm/MaisGlass`); a Vercel publica
sozinha a cada commit na branch `main`. Configuração feita uma vez no
projeto `mais-glass` da Vercel → **Settings → Environment Variables**:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | Connection string do projeto `maisglass` no Neon (Connect → Connection string, pooled). Só na Vercel — nunca em arquivo, chat ou e-mail. |
| `ADMIN_EMAIL` | E-mail do primeiro administrador. |
| `ADMIN_SENHA_INICIAL` | Senha provisória do primeiro administrador; trocada obrigatoriamente no primeiro login. |

Na primeira chamada o servidor cria as tabelas (se não existirem) e, se não
houver nenhum usuário, cria o administrador com essas duas variáveis. Depois
disso as variáveis `ADMIN_*` não são mais usadas (podem ficar). Conferência:
`https://mais-glass.vercel.app/api/saude` deve responder `{"ok":true,…}`.

O endereço antigo do GitHub Pages deve ser desligado depois da transição
(GitHub → Settings → Pages → Source: None). Enquanto estiver no ar com o
código novo, ele não tem servidor: a tela de entrada mostra "Servidor
indisponível" e oferece **"Baixar cópia de segurança deste navegador"** — um
arquivo com os orçamentos e a configuração que estavam guardados naquele
endereço, para importar no novo (Orçamentos → Importar JSON; Configurações →
Importar JSON).

## Acesso e usuários

- Cada pessoa entra com **e-mail e senha**. Senhas guardadas com `scrypt`
  (sal por usuário); sessão em cookie `HttpOnly`/`Secure`/`SameSite=Lax` de
  30 dias, renovado com o uso; no banco só o hash do token. Toda alteração
  exige o cabeçalho `X-Requested-With: MaisGlass` (proteção contra CSRF).
  Após 10 senhas erradas em 15 minutos (por e-mail ou IP), bloqueio de 15
  minutos.
- **Administrador**: tudo — aba **Usuários** (criar, redefinir senha,
  desativar/reativar, tornar admin), Configurações e orçamentos. Não é
  possível desativar a si mesmo nem remover o último administrador.
- **Usuário**: cria, edita e exclui orçamentos (a lista é de todos);
  Configurações só leitura.
- Senha inicial (novo usuário ou redefinida) é gerada pelo sistema, mostrada
  uma vez ao administrador e **trocada obrigatoriamente** no primeiro login.
  Trocar a senha ou desativar o usuário encerra as sessões dele nas outras
  máquinas. Botão **Senha** no topo para trocar a própria senha.

## Onde ficam os dados

- **Configuração** (dólar, produtos, alíquotas, DIFAL, dados da empresa): uma
  só para a empresa, no servidor, com versão. Administradores editam (salva
  automaticamente meio segundo depois de digitar, se for válida); a mudança
  chega aos outros computadores em até 30 segundos (ou ao voltar para a
  janela). Orçamentos já feitos não mudam (são congelados).
- **Orçamentos**: lista única no servidor, com versão, autor e histórico de
  cada gravação (`orcamentos_hist`). Excluir é lógico (fica registrado quem e
  quando).
- **Navegador**: guarda uma cópia (cache) e a fila do que ainda não foi
  enviado — trabalhar sem internet é possível; ao voltar a conexão tudo é
  enviado. Limpar os dados do navegador só obriga a baixar de novo.
- **Exportar/Importar (JSON)** continuam valendo para backup e troca de
  arquivos; Importar aceita também o arquivo de cópia de segurança com vários
  orçamentos.

### Sincronização e conflitos entre computadores

- Cada gravação local entra numa fila e é enviada em série com a versão que
  este computador conhece (`versaoBase`). Entre abas do mesmo navegador a
  fila é compartilhada e um lock (`navigator.locks`) evita envios em paralelo.
- **409 — alterado em outra máquina**: o app pergunta "alterado por Fulano às
  HH:MM em outra máquina — sobrescrever?". OK sobrescreve (a decisão vale para
  a versão vista; se mudar de novo, pergunta de novo). Cancelar deixa o
  orçamento marcado **"conflito"**; ao abri-lo, um aviso oferece "Enviar a
  minha versão" ou "Usar a versão do servidor".
- **410 — excluído em outra máquina**: pergunta se recria; cancelar deixa
  marcado e o aviso oferece recriar ou remover deste computador.
- **Recebimento**: a cada 30 s, ao voltar para a janela e ao reconectar. O
  orçamento **aberto** nunca é trocado por baixo: aparece o aviso e a próxima
  gravação pergunta.
- **Migração**: no primeiro login de um computador que tinha orçamentos só no
  navegador, aparece o quadro **"Enviar para a nuvem"**. Se um id já existir
  no servidor com conteúdo diferente, a cópia local ganha um id novo ("(cópia
  deste computador)") — nada é descartado.
- Proteções: se o navegador recusar gravar (armazenamento cheio), o estado de
  sincronização segue em memória; uma mesma alteração não é reenviada mais
  de 5 vezes seguidas (vira "não aceito pelo servidor", visível no
  orçamento).

## Ajuda nos campos ("?")

Todo campo editável das três calculadoras tem um botão **?** ao lado do
rótulo. Ao clicar, abre uma caixa embaixo do campo com três partes: **O que
é** (o significado do campo), **O que muda** (o efeito no cálculo ao
alterar) e **Sugestão** (o que preencher na prática). Os textos ficam em
`app.js → AJUDA` (chave = id do campo sem o prefixo `in-`/`r-`/`n-`); a aba
Indústria nacional herda os textos da revenda e sobrescreve os que citam
alíquotas (`AJUDA.nac`). Uma caixa aberta por vez; fecha clicando de novo,
no ×, com Esc ou ao trocar de aba. Só texto — não altera valores nem
recalcula.

## Lógica (resumo — detalhes nos comentários de `calc.js`)

**Custo de importação (aba VL 4+4)** — sempre calculado para 1 container
cheio do produto (capacidade em m² vem do cadastro):

```
VMCV  = FOB × capacidade × %por dentro × dólar
VMLD  = VMCV + frete internacional + seguro (0,5% de VMCV+frete)
II    = VMLD × II%          IPI = (VMLD + II) × IPI%
PIS   = VMLD × PIS%         COFINS = VMLD × COFINS%
Custo chão de fábrica = VMLD + II + IPI + PIS + COFINS + valor por fora
                        + despesas nacionais + entreposto aduaneiro
Custo/m² = custo chão de fábrica ÷ capacidade
```
O ICMS da importação não entra (diferimento via entreposto; incide só na venda).

**Venda (aba Calculadora Chapa)**:

```
taxa cartão   = 0 (à vista) | MDR(bandeira, faixa) + 1,5% + 0,75% × parcelas
B15 preço+taxa = (preço base × m² + frete) × (1 + taxa)
B16 DIFAL %   = tabela por UF se NÃO contribuinte; 0 se contribuinte
B17 DIFAL     = B15 × DIFAL%
B18 PREÇO FINAL = B15 + B17

custo s/ imposto = m² × (1 + perda) × custo/m²
ICMS   = (B15 − frete) × 14% (MG) | 1,5% (outros)
PIS    = (B15 − frete − ICMS) × 1,65% − m² × crédito PIS/m²
COFINS = (B15 − frete − ICMS) × 7,6%  − m² × crédito COFINS/m²
custo total = DIFAL + ICMS + PIS + COFINS + custo s/ imposto + frete + taxa cartão
lucro = B18 − custo total      markup = lucro ÷ custo s/ imposto
```

**DRE da importação direta (estimativa gerencial)** — montada em
`calc.js → dreImportacao(config, resultado)` a partir do resultado acima, sem
alterar nenhuma fórmula da calc 1: receita bruta (preço final) − DIFAL − ICMS
efetivo − PIS/COFINS = receita líquida; − custo do vidro = lucro bruto; − frete
− cartão = lucro operacional (idêntico ao "Lucro" da planilha); − IRPJ/CSLL =
lucro líquido. Lucro real: PIS/COFINS líquidos dos créditos da importação e
34% sobre o lucro; presumido: 3,65% sem crédito (os PIS/COFINS pagos na
importação ficam no custo) e IRPJ/CSLL sobre 8%/12% da receita.

**NCM e II** vêm da classe fiscal do produto: LG 7007.29.00 (II 25%) · CF 7005.29.00 (II 25%) · MI 7005.21.00 (II 9%) — conforme `VL 4+4!C17` → `Produtos!O2/O9/O14`.

## Calculadora 2 — Revenda de importado comprado no Brasil

Tela inicial escolhe a operação: (1) importação direta, (2) revenda de
importado, (3) indústria nacional. A calculadora 2 segue
o memorial da contadora, para empresa **lucro real** e **indústria
(beneficiamento de vidro)**, comprando de fornecedor com IE e vendendo a
cliente (normalmente não contribuinte) em outra UF:

```
Compra (NF do fornecedor, ICMS por dentro, IPI por fora)
  produtos        = preço/m² × m² × (1 + perda)
  IPI compra      = produtos × IPI%              (crédito só se "IPI gera crédito" — industrialização)
  crédito ICMS    = produtos × ICMS da compra   (4% = importado interestadual)
  crédito PIS/COFINS = (produtos − ICMS) × 9,25%   (IPI não recuperável fica fora — Lei 14.592/2023)
  CMV             = produtos + IPI − créditos

Venda
  subtotal        = preço/m² × m² + frete cobrado na NF (CIF integra a operação)
  preço FECHADO   : valor da operação V = subtotal ÷ (1 − taxa cartão); IPI por dentro = V − V ÷ (1 + IPI%)
  preço POR FORA  : V = subtotal × (1 + IPI%) ÷ [(1 − DIFAL% − FCP%) − taxa × (1 + IPI%)]   ← gross-up simultâneo
                    produtos = subtotal + V × taxa;  IPI = produtos × IPI%
  taxa do cartão  = V × taxa (a operadora cobra sobre o total pago)
  natureza        : "revenda sem industrializar" força crédito de IPI = 0 e IPI na saída = 0
  base do ICMS    = valor da operação (IPI incluso) p/ não contribuinte | produtos (IPI fora) p/ contribuinte
  débito ICMS     = base × alíquota da saída (4% editável; interna da empresa se venda interna)
  apuração ICMS   = débito − crédito → "a recolher" (≥ 0) e "saldo credor" (crédito a transportar) em linhas separadas
  DIFAL           = base × (interna da UF do cliente − alíquota da saída)   se NÃO contribuinte e interestadual
  FCP             = base × FCP da UF do cliente  (só RJ 2% confirmado; UF sem FCP cadastrado BLOQUEIA o cálculo)
  IPI venda       : débito − crédito de IPI = a recolher (ou saldo credor)
  PIS/COFINS      = (operação − IPI − ICMS próprio − DIFAL) × 9,25% − crédito   (FCP fica na base — SC Cosit 61/2024)
  custo total     = NF compra + IPI apurado + ICMS apurado + DIFAL + FCP + PIS/COFINS apurados + frete + taxa
  lucro operacional = valor da operação − custo total;  markup = lucro ÷ CMV
```

**DRE da operação (estimativa gerencial, lucro real × lucro presumido)** — a
tela mostra o efeito incremental desta venda nos dois regimes: receita bruta
(valor da operação) − IPI − ICMS − DIFAL/FCP − PIS/COFINS = receita líquida;
− CMV = lucro bruto; − frete − cartão = lucro operacional; − IRPJ/CSLL = lucro
líquido. Lucro real: IRPJ/CSLL = 34% do lucro (aproximação; o adicional
depende do lucro anual) e PIS/COFINS 9,25% com créditos; presumido: IRPJ/CSLL
sobre 8%/12% da receita sem IPI e PIS/COFINS 3,65% sem créditos (parâmetros em
Configurações → Tributos sobre o resultado). A margem líquida é sobre a receita
líquida; a tela também mostra o lucro sobre o valor pago. A coluna do presumido
é simulação — a opção é anual e vale para a empresa inteira.

Exemplo do memorial (compra 100 mil a 4%, venda de 200 mil fechado MG→RJ não contribuinte):
crédito 4.000, débito 8.000, a recolher 4.000 (MG), DIFAL 32.000 + FCP 4.000 (RJ) = ICMS total 40.000.

Simulação de referência (600 m², 69,70 → 125 fechado, RJ não contribuinte, IPI 6,5%):
total 75.000 · PIS/COFINS débito 5.126,58 · custo 62.637,63 · lucro operacional
12.362,37 · líquido real 8.159,16 · líquido presumido 10.146,78 (conferido com
parecer técnico externo, set/2026; teste `Simulação §4` em `test/test.js`).

Pendências com a contadoria: FCP das demais UFs; alíquotas internas 2026 (PR,
RS, MT); exclusão do DIFAL da base de PIS/COFINS (adotada, conforme STJ Tema
1.372) e do FCP (não adotada); FCI e conteúdo de importação do produto beneficiado.

## Calculadora 3 — Indústria nacional

Mesma operação e mesmo motor da calculadora 2 (`calcularRevenda`), só que o
vidro é fabricado no Brasil: compra de indústria com IE em SP, beneficiamento
em MG e venda para cliente não contribuinte (construtora) no RJ. O que muda é a
alíquota interestadual, que é a cheia: **12%** na entrada (SP → MG, crédito) e
**12%** na saída (MG → RJ), logo DIFAL RJ = 20% − 12% = **8%** (+ FCP 2%). Não
depende da Resolução 13/2012 nem de FCI. Para fornecedor ou cliente no
N/NE/CO/ES a interestadual é 7% — ajuste nos campos "ICMS destacado na entrada"
e "ICMS interestadual da saída". IPI do fornecedor nacional conforme a TIPI do
NCM (padrão 6,5%, confirmar na NF).

A aba é montada em `app.js` (`montarAbaNacional`) clonando a aba de revenda
com ids `n-`/`no-`/`nviz`; os padrões estão em `defaults.js →
DEFAULT_INPUTS_NACIONAL`. Exemplo: compra 100 mil (12%) → crédito 12.000;
venda 200 mil fechado → débito 24.000, a recolher 12.000 (MG), DIFAL 16.000 +
FCP 4.000 (RJ) = carga total 32.000 (contra 40.000 no importado a 4%).

## Alíquota interestadual automática e migração da configuração

`calc.js → aliquotaInterestadual(origem, destino, importado)` devolve 7%
(origem Sul/Sudeste exceto ES → destino N/NE/CO/ES), 12% (demais), 4%
(importado) ou `null` (operação interna). Nas calculadoras 2 e 3, ao trocar a
UF do fornecedor ou do cliente, `app.js → sugerirAliquotas()` preenche os
campos "ICMS destacado na entrada" e "ICMS interestadual da saída" e escreve o
motivo abaixo do campo; o valor continua editável. A UF da empresa vem de
Configurações e aparece no topo de cada aba.

A coluna "DIFAL %" da tabela (usada só pela importação direta, B16 da
planilha) é derivada da alíquota interna por `calc.js → derivarDifal()`:
interna − 4%, e 0 na UF da empresa. Editar a alíquota interna de um estado
atualiza as três calculadoras. Alíquotas internas 2026: PR 19,5%, RS 17%, MT
17% (a planilha trazia 19/18/19).

Configurações salvas com a tabela antiga são migradas ao carregar
(`calc.js → migrarConfig`, `versao` 4): MG 11% → 18%, PR 19 → 19,5, RS 18 → 17,
MT 19 → 17 (v2/v3) e IRPJ do presumido 15% → 25% (v4) — só quando o valor
salvo ainda é o antigo; um ajuste manual é preservado. A UF da empresa é fixa
em MG (`EMPRESA_UF`), porque o regime especial da importação direta é de Minas.

## FCP na importação direta, presumido com adicional, LC 224/2025 (set/2026)

- **FCP na importação direta** — a tabela DIFAL da planilha é `interna − 4%` e
  não soma o FCP do destino. `calc.js → calcularImportacao(config, inputs)` é
  um envelope sobre `calcular()` (intacta, com hash conferido no teste) que
  acrescenta o FCP para consumidor final fora de MG: FCP = B15 × FCP% (mesma
  base do DIFAL), cobrado a mais do cliente; fica na base do PIS/COFINS (SC
  Cosit 61/2024); custo total sobe FCP + ΔPIS/COFINS. UF sem FCP cadastrado
  calcula com 0% e avisa (não bloqueia, ao contrário das calcs 2/3). A aba
  mostra "FCP (%)" e "Valor do FCP"; `dreImportacao()` lê `r.fcp`.
- **Presumido com adicional de IRPJ** — `tributos.irpj` passou de 15% para 25%
  (15% + adicional de 10%), mesma premissa do lucro real (34%); IRPJ/CSLL
  presumido = 8%×25% + 12%×9% = 3,08% da receita sem IPI. Coluna "se fosse
  presumido" nas três abas e nos orçamentos.
- **LC 224/2025** — `tributos.lc224` (padrão `false`): quando verdadeiro, os
  percentuais de presunção sobem 10% (8,8% / 13,2%) — receita anual acima de
  R$ 5 mi. `calc.js → aliquotaPresumido(tb)`.
- Rótulos de destinatário: "Consumidor final não contribuinte" / "Contribuinte
  que revende/industrializa"; contribuinte comprando para uso próprio não é
  coberto. Importação direta marca "IPI não destacado (regime da planilha —
  pendente)".

## Orçamentos (`orcamento.js` + aba Orçamentos)

Compõe um orçamento para um cliente com itens das três calculadoras. Regras
(ver `PROJETO-ORCAMENTO.md` v2 e `RESPOSTA-PARECER-ORCAMENTO.md`):

- **Cabeçalho manda**: UF de destino, destinatário, pagamento/bandeira/parcelas
  valem para todos os itens. "Adicionar ao orçamento" (botão nas três abas)
  lê as entradas da calculadora, substitui os campos do cliente pelos do
  cabeçalho (perguntando se divergirem) e roda o motor com a **configuração
  congelada** do orçamento. A alíquota interestadual de saída (revenda/nacional)
  é classificada quando o item entra (`inputs.icmsSaidaManual`): automática
  acompanha a UF do cabeçalho; manual é mantida em qualquer troca (inclusive
  passando por MG) com aviso. "Carregar" abre o item na calculadora de origem
  e "Substituir item" o devolve: se a alíquota de saída **não foi alterada**, a
  classificação carregada é mantida (manual continua manual, mesmo com o
  orçamento em MG); se foi alterada, vale a regra de um item novo (manual
  quando difere da automática da UF da calculadora; em MG, automática). Mudar o
  cabeçalho com itens recalcula todos (mostra a diferença; tudo ou nada).
- **Congelamento**: cada orçamento guarda `premissas` (IRPJ/CSLL, presunção,
  LC 224, dedutibilidade), `configSnapshot` (cópia da configuração), o motor
  usado e, por item, entradas + resultado. `consolidar(orcamento)` só usa o
  que está no orçamento — mudar Configurações não altera orçamentos salvos;
  "Recalcular com a configuração atual" mostra a diferença antes de aplicar.
- **Consolidação** (`GM_ORC.consolidar`): `adaptarDre` põe a DRE de cada item
  numa convenção única (deduções = débitos cheios; CMV líquido dos créditos —
  a importação direta é reapresentada somando os créditos de PIS/COFINS da
  importação às deduções e tirando do CMV; o lucro não muda). Linhas aditivas
  somam; IRPJ/CSLL **real = 34% × max(0, lucro consolidado)** (prejuízo de um
  item compensa outro; custos internos dedutíveis — premissa); **presumido =
  soma dos itens** (base é a receita). Margens dos totais ("n/a" sem receita).
- **Custos internos** (frete contratado, transporte próprio, instalação,
  comissão fixa ou % do total, outros): só na DRE, sem crédito. Aviso quando há
  frete cobrado na NF de um item e custo interno de transporte (o motor já
  trata o frete cobrado como despesa de igual valor).
- **Status**: a primeira saída do rascunho (enviado, aprovado ou perdido) é a
  emissão (`emitidoEm`, `emissaoOrigem: "app"`): congela data e dados da
  empresa uma única vez e trava cabeçalho, itens e custos; nunca volta a
  rascunho. "Nova revisão" duplica como rascunho (rev. n+1) preservando a
  anterior. Orçamentos anteriores ao marco são migrados: `enviadoEm` válido
  vale como emissão (mesmo em rascunho); aprovado/perdido sem data usam
  `atualizadoEm` como data inferida — `emissaoOrigem` registra a procedência.
  Datas (`criadoEm`, `atualizadoEm`, `enviadoEm`, `emitidoEm`) são validadas
  como ISO 8601 estrito (`AAAA-MM-DD` ou `AAAA-MM-DDThh:mm[:ss[.fração]]` +
  `Z`/`±hh:mm`, com calendário e relógio conferidos — 30/02 não passa);
  `emitidoEm` inválido recusa o arquivo, `enviadoEm` inválido não é evidência.
- **Proposta impressa**: só `#proposta` sai na impressão (`@media print`):
  dados da empresa (Configurações até a emissão; depois os congelados),
  cliente, itens (m², R$/m² aproximado, total), total, pagamento, entrega,
  inclusões, observações. Vale o total de cada item (nota quando unitário × m²
  difere); FCP não cadastrado em item de importação direta gera ressalva
  "adicional estadual será confirmado na emissão da nota fiscal".
- **Persistência local** (1º estágio; o envio ao servidor é o 2º estágio,
  `nuvem.js`, ver "Onde ficam os dados"): `localStorage`
  `glassmais.orcamentos.v1` (cache da lista), autosave
  500 ms concluído ao sair do editor/trocar de orçamento/fechar a página; cada
  gravação relê o disco e substitui só o orçamento alterado; conflito com outra
  aba pede confirmação e **nenhuma decisão grava na hora**: toda confirmação
  (sobrescrever a versão da outra aba, ou recriar um orçamento que outra aba
  excluiu durante o diálogo) agenda a gravação para a volta seguinte do event
  loop, que relê o disco e confere se o estado confirmado (a versão vista, ou
  "ausente") continua o mesmo — se sim, grava sobre a lista relida (o que
  outra aba gravou durante o diálogo é preservado); se mudou, pergunta de
  novo. A detecção de "outra aba alterou" compara a versão gravada
  (`atualizadoEm` diferente da conhecida), não ordem cronológica de texto.
  Gravações confirmadas pendentes são controladas por orçamento
  (`gravacoesAdiadas`, com geração) e representam a decisão mais recente:
  excluir o orçamento, recusar um diálogo posterior, concluir uma gravação ou
  confirmar de novo cancela/supera a pendente — um callback cancelado ou
  superado nunca grava. Edições
  não gravadas (falha, conflito recusado, pendente) ficam em `naoSalvos`,
  sobrevivem à sincronização e aparecem com o badge "não salvo". Exportar/
  importar JSON: a importação valida estrutura e identidades contábeis,
  recalcula cada item com o `configSnapshot` do arquivo, **usa o resultado
  recalculado**, valida e consolida o candidato inteiro antes de gravar. Aviso
  acima de 4 MB. Limite: não há lock entre abas.
- Testes: bloco "Fase 1a/1b" em `test/test.js` (item sozinho = consolidado;
  três itens; custos internos; comissão %; prejuízo compensando; cabeçalho
  manda; recalcular; congelamento; validação/importação; hash de `calcular()`)
  e blocos "Parecer 3/4/5"; ciclos de interface (carregar/substituir, gravação
  adiada × exclusão/recusa/recriação, importação com data impossível) em
  `test/ui.js` (jsdom) e `test/browser/p5.js`/`p6.js` (Chromium).

## Validação

- `calc.js` é estrito: quantidade e capacidade devem ser > 0, dólar > 0,
  preço/frete/custos/perda não negativos, parcelas inteiras de 1 a 12,
  produto/classe/bandeira/UF precisam existir na configuração (checagem com
  `hasOwnProperty`, então chaves como `constructor` não passam). Qualquer
  resultado não finito lança erro. A interface mostra "—" e a mensagem.
- `validarConfig()` confere a estrutura inteira da configuração e roda ao
  carregar do navegador, importar JSON, salvar e exportar. Configuração
  salva inválida é descartada e o padrão volta.

## Diferenças em relação à planilha

- O crédito de PIS na venda usa `m² × crédito PIS/m²` (correção já feita na planilha revisada).
- O NCM varia por produto (na planilha era texto fixo).
- As quatro simulações antigas à direita da aba VL 4+4 não foram portadas (não alimentam o resultado).
- `Config!Preco_Base_Padrao` não é usado; o preço base padrão da tela é o da planilha (R$ 140).

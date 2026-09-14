# MaisGlass — Briefing para revisão nº 2 (Codex)

Revisão independente do app **MaisGlass Calculadora** (GitHub Pages, arquivos
na raiz do repositório `veigamack-lgtm/MaisGlass`). Este documento descreve a
operação completa da empresa, o que cada calculadora faz, o que mudou nesta
rodada e os números esperados. Código: `index.html`, `app.js`, `calc.js`,
`defaults.js`, `test/test.js` (`node test/test.js`, 313 testes). A resposta ao
parecer nº 2 está em `RESPOSTA-REVISAO-2.md`.

## 1. A empresa e as três operações

**MaisGlass** — Juiz de Fora, MG. Regime **lucro real**. Enquadrada como
**indústria** (beneficiamento de vidro: corte, lapidação, furação, têmpera,
laminação — RIPI art. 4º, II). Compra a chapa, beneficia e vende o produto,
normalmente para **construtoras (não contribuintes do ICMS)**. A UF da empresa
é **fixa em MG** (`calc.js → EMPRESA_UF`): o regime especial da importação
direta é de Minas, então outra UF deixaria a calc 1 incoerente.

O app tem uma tela inicial com três calculadoras, uma por origem do vidro:

| # | Operação | Entrada | Saída interestadual | Observação |
|---|---|---|---|---|
| 1 | **Importação direta** | MaisGlass importa o container (custo FOB + frete + II/IPI/PIS/COFINS + despesas + entreposto) | Regime especial de MG: ICMS **efetivo** 14% na venda dentro de MG (18% − 4% de crédito) e **1,5%** na venda para fora de MG | Porta fiel da planilha original. **Não deve ser alterada.** |
| 2 | **Revenda de importado** | Compra de importadora/distribuidor com IE no Brasil: NF com ICMS **4%** (Res. SF 13/2012) e IPI 6,5% | **4%** (produto beneficiado mantém conteúdo de importação > 40% → FCI); DIFAL = interna do destino − 4% | Regime especial de 1,5% **não** se aplica |
| 3 | **Indústria nacional** | Compra de indústria nacional com IE: ICMS interestadual **12% ou 7%** (Res. SF 22/1989) e IPI conforme TIPI | **12% ou 7%**; DIFAL = interna do destino − interestadual | Sem FCI |

As calculadoras 2 e 3 usam o **mesmo motor** (`calc.js → calcularRevenda`);
mudam só as alíquotas de entrada/saída e a origem da mercadoria.

## 2. Regras fiscais adotadas (calcs 2 e 3)

**Entrada (NF do fornecedor):** valor dos produtos com ICMS por dentro; IPI por
fora. Crédito de ICMS = produtos × alíquota destacada. Crédito de IPI = IPI
destacado (só no modo "industrialização" — vidro é insumo; na "revenda sem
industrializar" não há crédito nem débito de IPI). Crédito de PIS/COFINS
(9,25% não cumulativo) sobre (produtos − ICMS); IPI não recuperável fica fora
da base (Lei 14.592/2023). CMV = total da NF − créditos.

**Saída (NF da MaisGlass):**
- Preço **fechado**: o valor combinado é o total da NF; IPI por dentro
  (total − total ÷ 1,065). Preço **por fora**: o combinado é o valor dos
  produtos; total = produtos × (1 + IPI) ÷ (1 − DIFAL − FCP) (gross-up).
- Taxa de cartão: cobrada sobre o total pago. Fechado: total = combinado ÷
  (1 − taxa). Por fora: gross-up simultâneo com IPI/DIFAL/FCP —
  total = combinado × (1 + IPI) ÷ [(1 − DIFAL − FCP) − taxa × (1 + IPI)].
- Frete cobrado na NF (CIF) integra o valor da operação e as bases.
- Base do ICMS: para **não contribuinte** (consumidor final) o IPI integra a
  base (LC 87/96 art. 13 §2º); para contribuinte que revende/industrializa fica
  fora.
- ICMS próprio: alíquota interestadual (4% / 12% / 7%) ou **interna da UF da
  empresa** quando o cliente está na mesma UF (MG 18%). Apuração = débito −
  crédito; "a recolher" e "saldo credor" em linhas separadas.
- DIFAL (só não contribuinte, interestadual) = base × (interna do destino −
  interestadual), base única. FCP = base × FCP da UF do destino; UF sem FCP
  confirmado **bloqueia** o cálculo (só RJ 2% cadastrado).
- IPI na saída: indústria destaca sempre, independentemente de o cliente ser
  contribuinte; débito − crédito = a recolher.
- PIS/COFINS na saída: 9,25% × (valor da operação − IPI − ICMS próprio −
  DIFAL); FCP fica na base (SC Cosit 61/2024). A recolher = débito − crédito.
- Custo total = NF de entrada + IPI apurado + ICMS apurado + DIFAL + FCP +
  PIS/COFINS apurados + frete + cartão. Lucro operacional = total pago − custo.
- DRE (estimativa gerencial) real × presumido: real = IRPJ/CSLL 34% sobre o
  lucro; presumido = PIS/COFINS 3,65% sem crédito e IRPJ/CSLL sobre 8%/12% da
  receita sem IPI. Margem líquida sobre a receita líquida e sobre o valor pago.

**Importação direta (calc 1):** fórmulas da planilha; DRE adicionada em
`dreImportacao()` a partir do resultado, sem tocar nas fórmulas (lucro
operacional da DRE = "Lucro" da planilha).

## 3. O que mudou nesta rodada

1. **Alíquota interestadual automática** (`calc.js → aliquotaInterestadual(origem, destino, importado)`):
   7% quando a origem é Sul/Sudeste (exceto ES) e o destino é N/NE/CO/ES; 12%
   nos demais casos; 4% para importado; `null` na operação interna. `app.js →
   sugerirAliquotas()` preenche "ICMS destacado na entrada" (fornecedor →
   empresa) e "ICMS interestadual da saída" (empresa → cliente) ao trocar a UF,
   com o motivo escrito embaixo do campo; o valor continua editável.
2. **Migração v2 da configuração salva**: a planilha trazia MG com alíquota
   interna 11%; o padrão é 18% desde a rodada anterior, mas configs já salvas
   no navegador mantinham 11% (a migração só completava chaves ausentes). Agora
   `migrar()` troca 0,11 → 0,18 em `difal.MG` quando `versao < 2` (ajuste
   manual diferente de 11% é preservado) e a config migrada é gravada no load.
3. **Coluna DIFAL da importação direta derivada da alíquota interna**
   (`calc.js → derivarDifal(config)`): DIFAL% = interna − 4% (interestadual do
   importado), 0 na UF da empresa. Roda no load (migração), ao editar a tabela
   e ao salvar. A fórmula da calc 1 (`calcular`) não mudou — ela continua
   lendo `config.difal[uf][1]`; o que mudou é que essa coluna agora acompanha a
   interna em vez de ser digitada. Com a tabela da planilha os valores derivados
   eram idênticos aos digitados em todas as 27 UFs (teste `derivarDifal`).
4. **Alíquotas internas 2026** em `defaults.js`: PR 19,5% (planilha 19), RS 17%
   (18), MT 17% (19); migração v3 aplica só se o valor salvo ainda for o da
   planilha. Efeito na calc 1: DIFAL para cliente não contribuinte em PR 15,5%,
   RS 13%, MT 13% (antes 15/14/15). As demais UFs não mudam.
5. Configurações: a tabela "DIFAL por UF" passou a "Alíquotas internas por UF
   (e DIFAL da importação direta)"; a coluna DIFAL virou somente leitura
   (calculada) e a UF da empresa aparece marcada.
6. Cada aba de operação mostra "Empresa em MG (fixo)".
7. Calculadora 3 (indústria nacional) e DRE da importação direta foram
   incluídas na rodada anterior; estão descritas em §1 e §2.

## 4. Números de referência (devem bater)

**Indústria nacional, venda interna em MG** (SP → MG → construtora em MG):
2.000 m² a R$ 102,61 (ICMS 12%, IPI 6,5%); venda R$ 175/m² fechado = R$ 350.000.

| Linha | Valor |
|---|---|
| Produtos 205.220,00 · IPI entrada 13.339,30 · total NF 218.559,30 | |
| Créditos: ICMS 24.626,40 · IPI 13.339,30 · PIS/COFINS 16.704,91 (base 180.593,60) | CMV 163.888,69 |
| IPI saída (por dentro) 21.361,50 → a recolher | 8.022,20 |
| ICMS 18% × 350.000 (IPI na base) = 63.000 → a recolher MG | 38.373,60 |
| PIS/COFINS base 265.638,50 → débito 24.571,56 → a recolher | 7.866,65 |
| Tributos líquidos da operação | 54.262,46 |
| **Lucro operacional** | **77.178,24** |
| IRPJ/CSLL real 34% → lucro líquido real | 26.240,60 → 50.937,64 |

(Valores do motor com precisão cheia; somar rubricas já arredondadas dá 1
centavo de diferença. Teste `Codex nº 2: cenário nacional interno completo`.)

**Revenda de importado, RJ não contribuinte** (600 m², 69,70 → 125 fechado):
PIS/COFINS débito 5.126,58 · custo 62.637,63 · lucro operacional 12.362,37 ·
líquido real 8.159,16 · presumido 10.146,78 (conferido na revisão nº 1).

**Memorial da contadora** (compra 100 mil a 4%, venda 200 mil fechado MG → RJ):
crédito 4.000 · débito 8.000 · a recolher 4.000 · DIFAL 32.000 + FCP 4.000 =
carga 40.000. Nacional (12%/12%): 12.000 · 24.000 · 12.000 · DIFAL 16.000 +
FCP 4.000 = 32.000.

## 5. O que pedimos que seja revisado

1. `aliquotaInterestadual`: mapa de regiões, exceção do ES, tratamento de
   importado e de operação interna; interação com `empresaUF` configurável.
2. `migrar()`: idempotência, preservação de ajustes do usuário, gravação no
   load, `versao` 3; `derivarDifal()` após a migração e ao editar a tabela.
3. Regime especial da importação direta (14% interno / 1,5% fora) continua
   restrito à calc 1 — confirmar que nada dele vaza para as calcs 2/3.
4. Casos de borda: fornecedor na mesma UF da empresa (entrada com alíquota
   interna), cliente contribuinte (IPI fora da base, sem DIFAL), UF sem FCP
   (bloqueio), preço por fora com gross-up.
5. Testes que faltam; consistência entre `lucro` e `dre.real.lucroOperacional`.
6. Calc 1: a função `calcular()` não deve ser alterada. Conferir que o DIFAL
   derivado reproduz a planilha para todas as UFs com a tabela original e que
   as três alíquotas de 2026 (PR/RS/MT) estão corretas.

## 6. Pendências com a contadoria (Mariana)

- FCP das demais UFs (tabela só tem RJ 2%; as outras bloqueiam).
- Alíquotas internas 2026 já atualizadas para PR 19,5%, RS 17%, MT 17% (fontes:
  tabelas Focus NFe e Barbieri Advogados, set/2026) — confirmar; AL e SE têm FCP
  de 1% (tabela do app só tem RJ 2%).
- IPI do vidro nacional pelo NCM na TIPI; fornecedor Simples × regime normal.
- Exclusão do DIFAL da base de PIS/COFINS (STJ Tema 1.372) adotada; FCP mantido.
- Importação direta: importador é equiparado a industrial (RIPI art. 9º, I) —
  a planilha trata o IPI da importação como custo e não destaca IPI na venda;
  avaliar se a saída deveria ter IPI com crédito do desembaraço.
- Vidros planos (7003–7009) saíram da ST em MG pelo Decreto 49.233 (21/05/2026).

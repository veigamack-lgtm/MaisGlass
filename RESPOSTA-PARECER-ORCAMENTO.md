# MaisGlass — Resposta ao parecer do Codex sobre o módulo Orçamentos

Revisão independente do parecer de 17/09/2026, feita com acesso ao código
atual (`calc.js`, `app.js`, `defaults.js`, `test/test.js`) — coisa que o
parecer não teve. Para cada achado: **concordo / parcial / discordo**, por quê,
o que muda na especificação. No fim: decisões que dependem do dono, lista de
alterações concretas no `PROJETO-ORCAMENTO.md` e o que bloqueia ou não a
aprovação.

Nota geral: o parecer é bom. A maior parte dos apontamentos é de **rotulagem
e delimitação** (dizer claramente que a DRE é estimativa gerencial, quais
cenários o motor cobre) e de **robustez** (premissas congeladas, snapshots
completos, atomicidade). Dois pontos que ele levantou sem poder confirmar eu
confirmei no código e são mais sérios do que o parecer supõe: o **presumido
ignora o adicional de IRPJ enquanto o real inclui** (§1.2) e a **importação
direta não cobra FCP** (§1.4). Nenhum deles é do módulo Orçamentos — vêm das
calculadoras — mas o orçamento vai somar tudo, então precisam de decisão.

---

## 1. Regras fiscais

### 1.1 IRPJ/CSLL no lucro real — **concordo**

34% é a alíquota marginal (15% + adicional 10% + CSLL 9%), correta para
empresa acima da faixa do adicional (R$ 20 mil/mês) — que é a premissa do app
desde a calc 2. Não é apuração; é o efeito marginal desta venda. Mudanças na
especificação:

- Rotular: "IRPJ/CSLL — estimativa gerencial (34% marginal, premissa: empresa
  acima da faixa do adicional)". Mesma frase no "?" e no rodapé da DRE.
- Congelar a premissa no orçamento (ver §4): `premissas.irpjCsllReal = 0.34`
  gravado ao criar; `consolidar()` lê do orçamento, não da config viva.
- Orçamento deficitário: imposto zero e uma linha informativa "prejuízo de
  R$ X reduziria IRPJ/CSLL de outros resultados em até R$ 0,34·X (não
  computado)". Só texto; não entra no lucro líquido.
- Custos internos: premissa declarada "despesas necessárias e comprovadas,
  dedutíveis integralmente". Vai no "?" dos custos internos e no rodapé.

### 1.2 Presumido não é soma dos itens — **parcial, e o problema é maior**

O exemplo do parecer (duas parcelas de R$ 40 mil que juntas passam do limite
do adicional) só vale se o motor aplicasse o limite por item. Confirmei em
`defaults.js`: o motor **não aplica limite nenhum** — usa `irpj: 0.15` com o
comentário "adicional de 10% ignorado: base < R$ 60 mil/trimestre". Ou seja,
no presumido o app assume empresa **abaixo** da faixa do adicional; no real
assume empresa **acima** (34%). As duas colunas usam premissas contrárias, e
a comparação "real × presumido" fica enviesada a favor do presumido em
0,8% da receita (8% × 10%).

Sob uma premissa única a soma por item é exata (o presumido é linear na
receita), então "somar" não é o erro; o erro é a premissa desigual.

- **Decisão do dono (D-B):** unificar a premissa. Proposta: `tributos.irpj`
  passa de 0,15 para **0,25** (15% + adicional) no padrão, com migração v4 da
  config (só troca se o valor salvo ainda for 0,15). Efeito: IRPJ/CSLL
  presumido = 8%×25% + 12%×9% = **3,08%** da receita sem IPI (hoje 2,28%).
  Muda a coluna "se fosse presumido" nas três abas; **não toca `calcular()`**
  (a DRE da importação direta é `dreImportacao`, separada).
- **LC 224/2025** (confirmada: publicada em 26/12/2025, vigente em 2026, com
  liminares e discussão de constitucionalidade em curso): +10% nos
  percentuais de presunção (8% → 8,8%; 12% → 13,2%) sobre a receita anual que
  exceder R$ 5 milhões. Depende da receita da empresa, não do orçamento.
  Proposta: parâmetro em Configurações "Receita anual acima de R$ 5 mi (LC
  224/2025)?" — padrão **não**; quando sim, os percentuais de presunção sobem
  10% para todos os itens (premissa marginal: o orçamento inteiro está na
  parcela excedente). Congelado nas premissas do orçamento. **Decisão D-C.**
- Rotular a coluna: "se fosse lucro presumido — simulação, premissas: …".

### 1.3 Contribuinte ≠ finalidade da compra — **concordo (delimitar, não corrigir motor)**

Certo: pela LC 87/96 (art. 13 §2º) o IPI só fica fora da base do ICMS quando a
operação é entre contribuintes **e** o produto se destina a industrialização
ou comercialização; e contribuinte que compra para uso/consumo/ativo paga
DIFAL por conta própria. O motor das calcs 2/3 modela exatamente "contribuinte
que revende ou industrializa" (está nos comentários do `calc.js`); o cenário
"contribuinte consumidor final" não é suportado. A calc 1 idem (DIFAL zero
para contribuinte).

Especificação: as opções do cabeçalho passam a ser **"Consumidor final não
contribuinte (construtora, pessoa física, empresa sem IE)"** e
**"Contribuinte do ICMS que revende ou industrializa (com IE)"**, com nota no
"?" de que "contribuinte comprando para uso próprio/ativo não é coberto — o
DIFAL é dele, mas o IPI entra na base do ICMS; fale com a contadoria". Mesmo
rótulo nas três abas (só texto em `index.html`/`AJUDA`). Sem mudança de
motor. Para a MaisGlass isso é marginal: o cliente típico é construtora.

### 1.4 IPI zero na importação direta; ICMS 14%/1,5%; FCP — **concordo, e o FCP é um achado real**

- **IPI na saída da importação direta**: o importador é equiparado a industrial
  (RIPI art. 9º, I) e em regra destaca IPI na venda, creditando o IPI do
  desembaraço. A planilha trata o IPI da importação como custo e não destaca
  na venda. Já está na lista de pendências com a contadora desde o briefing
  nº 2; a decisão vigente do dono é não alterar `calcular()`. No orçamento:
  itens de importação direta ganham a marca "IPI não destacado (regime da
  planilha — pendente confirmação)" e a linha IPI da DRE traz nota. Se a
  contadora confirmar que deve destacar, isso é uma mudança na calc 1 (fora
  deste módulo) e o orçamento absorve pelo Recalcular.
- **14% / 1,5%**: é o regime especial de MG do dono (efetivo 14% = 18% − 4%
  de crédito na venda interna; 1,5% efetivo na saída interestadual). O
  fundamento é o TTS/regime da empresa — documento dela, não do app. Fica
  registrado como premissa: "alíquotas efetivas conforme regime especial
  vigente; se o regime mudar, alterar em Configurações".
- **FCP na calc 1**: a tabela DIFAL da planilha é `interna − 4%` e **não soma
  o FCP** da UF de destino. Para RJ (FCP 2%) a venda a não contribuinte pela
  importação direta está subestimando o custo em 2% do preço — a calc 2 cobra
  esse FCP (memorial da contadora), a calc 1 não. O motor não exigir FCP não
  dispensa o imposto; o parecer está certo. **Decisão do dono (D-A)** — três
  caminhos: (a) manter a calc 1 como está e o orçamento **avisar** em cada
  item de importação direta para UF com FCP ("FCP de 2% não incluído —
  R$ X"); (b) o orçamento **acrescentar** o FCP como custo do item só na
  consolidação (o item no orçamento ficaria diferente do que a aba mostra —
  confuso); (c) corrigir a calc 1 — contraria a decisão de não mexer em
  `calcular()`. Recomendo **(a) agora + confirmar com a Mariana** se o regime
  especial dele afasta o FCP; se não afastar, (c) numa rodada própria.

## 2. Consolidação e significado das linhas da DRE

### 2.0 Linhas heterogêneas — **concordo; há solução melhor que o rodapé**

O exemplo do parecer está certo: crédito abatido das deduções ou do CMV dá o
mesmo lucro e receita líquida/lucro bruto/margem diferentes. É exatamente o
que acontece entre a calc 1 (PIS/COFINS **líquidos** dos créditos da
importação nas deduções; CMV **bruto**, com II/IPI/PIS/COFINS da importação
dentro) e as calcs 2/3 (deduções = débitos cheios; CMV líquido dos créditos).

Confirmei que o resultado da calc 1 traz o que falta para normalizar:
`resultado.importacao.creditoPisM2` e `creditoCofinsM2` (crédito por m²) e
`quantidade`. Então o adaptador em `orcamento.js` reapresenta a calc 1 na
convenção das calcs 2/3, **sem mexer no lucro**:

```
PIS/COFINS (dedução) = pis + cofins + qtd × (creditoPisM2 + creditoCofinsM2)   ← débito cheio
CMV                  = custoSemImposto − qtd × (creditoPisM2 + creditoCofinsM2) ← líquido do crédito
lucro operacional    = inalterado (teste)
```

O ICMS não dá para decompor na calc 1 (14% e 1,5% são efetivos do regime
especial, não "débito − crédito" simples). Fica uma linha só, rotulada
"ICMS próprio — débito (calcs 2/3) / efetivo do regime especial (importação
direta)", e o parecer tem razão de que isso ainda é uma mistura. Aceitável
como simplificação declarada da v1: o que interessa ao dono (lucro, margem
sobre o valor pago, imposto total) fica correto; só a receita líquida e o
lucro bruto carregam essa convenção mista no ICMS. Além disso a tabela de
itens já dá **subtotais por origem** (custo/lucro por item), que é a
alternativa que o parecer sugere.

Margens: sempre recalculadas dos totais (nunca somadas/médias). Já era assim
na proposta; fica explícito.

### 2.1 Frete cobrado × despesa de transporte — **concordo; ponto importante**

Nos motores das calcs 2/3 (e na calc 1) o campo "frete cobrado na NF" entra
como **receita e como custo do mesmo valor** — premissa de repasse ao custo.
Com D1, se o usuário cobrar frete no item **e** lançar a transportadora em
custos internos, o transporte é contado duas vezes. Regra da v1:

- O "?" e o rodapé dizem: "frete cobrado na NF já é tratado como despesa de
  igual valor no item; não repita em custos internos".
- Aviso automático quando existe frete > 0 em algum item **e** custo interno
  do tipo transporte no mesmo orçamento.
- Caso "cobra 1.000, gasta 800": não suportado pelos motores na v1 (o item
  assume 1.000 = 1.000). Registrado como limitação; o teste 8 do parecer vira
  "cenário sinalizado", não "cenário calculado". Se for frequente, a solução
  é um campo "custo real do frete" no motor das calcs 2/3 — rodada própria.

### 2.2 Custo total, margens, bases — **concordo**

Rótulo "Custo total antes de IRPJ/CSLL — cenário lucro real"; custo no
presumido calculado à parte (créditos de PIS/COFINS não existem lá). Bases
tributárias: cada item já calcula as suas no motor; o consolidado só soma
valores e recalcula IRPJ real — não recalcula base nenhuma. O tratamento do
ICMS que o parecer cita já está coerente por item: ICMS destacado fora da base
do PIS/COFINS (Lei 14.592/2023) e **dentro** da base do IRPJ/CSLL presumido
(STJ Tema 1008 — o motor usa `receitaSemIPI`, que inclui ICMS).

### 2.3 `tributosTotais` e barra de composição — **concordo**

`tributosTotais` por item = deduções − créditos + IRPJ/CSLL (confirmado em
`calc.js`). A fórmula do parecer é a mesma que estava no projeto, escrita
melhor: `Σ(tributosTotais_item − irpjCsll_item) + irpjCsll_consolidado`.
Barra "para onde vai o valor pago": com a convenção única (deduções cheias,
CMV líquido) os segmentos são deduções + IRPJ/CSLL | CMV líquido | frete e
cartão | custos internos | lucro líquido, e fecham no total pago sem dupla
contagem. Prejuízo: barra mostra o "estouro" como a `viz-prejuizo` já faz.

## 3. Custos internos — **concordo**

- Tipos passam a: *Transporte próprio (frota)*, *Frete contratado de
  terceiros*, *Instalação*, *Comissão*, *Outros*. Sem crédito de PIS/COFINS na
  v1 (premissa declarada); retirada a frase "uma linha de código". Se a
  contadora confirmar o crédito do frete contratado na venda (Lei 10.833 art.
  3º IX; SC Cosit 46/2023), entra como tipo com crédito na v2.
- Instalação: premissa "venda de mercadoria com instalação tratada como custo
  interno; enquadramento (ISS/industrialização por encomenda) com a
  contadoria". Só texto.
- Comissão: **decisão do dono (D-D)** — valor fixo (parecer) ou permitir "% do
  total ao cliente", calculado no consolidado. Prefiro permitir o percentual:
  evita o "Representante 2%" com valor velho que o parecer critica.
- Proposta impressa: "frete e instalação inclusos" deixa de ser texto fixo;
  vira opção do cabeçalho ("o que está incluso": checkboxes frete/instalação,
  ou texto livre).

## 4. Snapshots e arquitetura — **concordo integralmente**

- **Conflito D2 × `consolidar(config, …)`**: real. O orçamento passa a
  guardar `premissas` (irpjCsllReal, presunção e alíquotas do presumido,
  LC 224 sim/não, política de arredondamento, versão do motor) e um
  **snapshot completo da configuração** usada (`configSnapshot`, ~10 KB, uma
  cópia por orçamento — não por item). `consolidar(orcamento)` usa só o que
  está no orçamento. Recalcular substitui snapshot e premissas de uma vez.
- **Assinatura**: `calcularItem(config, cabecalho, item)`; nada de estado
  global. `consolidar(orcamento)`; `validarOrcamento(orcamento, padrao)`.
- **Versões**: `versaoFormato` (do JSON) e `versaoMotor` (de `orcamento.js`)
  separadas; import recusa formato futuro; motor diferente só gera aviso
  "calculado com motor 1.0; recalcule para 1.1".

## 5. Casos de borda — **concordo com os 12; dois viram restrição da v1**

| # | Caso | Resposta |
|---|---|---|
| 1 | Sem itens, com custos | Receita 0, resultado negativo, exibido; não zera. |
| 2 | Mudar UF/pagamento | Recalcula todos os itens com a config **do orçamento** (premissas antigas), mostra diferenças, aplica atomicamente. Atualizar config só pelo Recalcular. |
| 3 | Falha em item | Nada muda; mensagem diz qual item e por quê. |
| 4 | UF de entrega ≠ faturamento | **Restrição v1**: um campo só, "UF de destino (entrega/faturamento)". Texto: "se entregar em UF diferente, o DIFAL é da UF de entrega — não suportado". |
| 5 | Divisão por zero | Margem "n/a" quando receita líquida ≤ 0. |
| 6 | Comissão % | Ver D-D. |
| 7 | Custos fixos de importação | Não há multiplicação: a calc 1 rateia o container inteiro pela capacidade e cobra por m²; dois itens do mesmo produto pagam a mesma parcela por m². Documentar. |
| 8 | Enviado/aprovado | **Decisão D-E**: v1 com status "enviado" travando edição e botão "Nova revisão" (duplica com nº de revisão), ou deixar para v2. |
| 9 | Dados da empresa | Copiados para o orçamento no momento da emissão. |
| 10 | Duas abas | Gravação compara `atualizadoEm`; se outra aba gravou depois, avisa e não sobrescreve sem confirmar. |
| 11 | Falha ao salvar | Status "não salvo — exporte o JSON"; dados ficam em memória. |
| 12 | JSON importado | Valida estrutura, números finitos, ids únicos, tamanho; **recalcula cada item com o `configSnapshot` do próprio arquivo** e compara com o `resultado` importado (tolerância 0,005) — se divergir, marca "resultado adulterado ou de outra versão; recalcule". |

IBS/CBS 2026: sem cálculo (dispensa condicionada às obrigações acessórias);
nota no rodapé. Campo opcional "data prevista da operação" (informativo).

## 6. Sete pontos do §9 — conforme o parecer, com os ajustes acima

1 fora da v1 (tipos separados) · 2 sim, congelado · 3 unificar premissa
(D-B) e parâmetro LC 224 (D-C) · 4 adaptador (§2.0) · 5 um atual, com
proteção entre abas · 6 nota de inclusões/exclusões editável · 7 aprovado.

## 7. Testes — correções aceitas; §8 do projeto reescrito assim

1. Item sozinho: **lucro** e **lucro líquido** iguais ao item; linhas
   normalizadas (calc 1) iguais ao adaptador.
2. Três itens: linhas aditivas somam; IRPJ real = 34% × max(0, Σ lucro −
   custos); presumido = Σ; margens dos totais.
3. Custos internos 10 mil com lucro suficiente: −3.400 no IRPJ real; presumido
   igual. Com lucro 5 mil: resultado −5 mil, imposto 0, nota de "redução
   potencial 1.700".
4. Prejuízo compensa lucro: 30 mil − 10 mil → IRPJ real 6.800.
5. Cabeçalho manda: UF, contribuinte, pagamento, bandeira e parcelas.
6. Validação: os do projeto + JSON adulterado, ids duplicados, versões.
7. Recalcular: dólar só afeta importação direta (confirmado: `calcularRevenda`
   não lê `dolar`); config viva alterada sem Recalcular → orçamento não muda.
8. Consistência: receita − custo total = lucro operacional (real).
9. Regressão: 313 iguais; hash de `calcular()`.
10. Playwright: impressão verifica **ids** dos componentes internos ausentes
    (não palavras); várias páginas; exportar/importar/reabrir.
11. Adicionais do parecer: dividir item em dois (mesmo total), reordenar,
    cancelar recálculo, frete cobrado + custo interno de transporte → aviso.

## 8. Decisões que dependem do dono

| Código | Pergunta | Recomendação |
|---|---|---|
| **D-A** | FCP na importação direta (RJ 2% não cobrado pela calc 1) | (a) manter calc 1 e **avisar** no orçamento; confirmar com a Mariana se o regime especial afasta o FCP; se não, corrigir a calc 1 em rodada própria |
| **D-B** | Presumido ignora o adicional de IRPJ (real inclui) | Unificar: `irpj` 0,15 → 0,25 (migração v4); afeta só a coluna "se fosse presumido" |
| **D-C** | LC 224/2025 (+10% na presunção acima de R$ 5 mi/ano) | Parâmetro em Configurações, padrão "não"; ligar se a receita anual da MaisGlass passar de R$ 5 mi |
| **D-D** | Comissão: valor fixo ou % do total | Permitir % (calculado no consolidado) |
| **D-E** | Status enviado/aprovado travar edição + "Nova revisão" | Incluir na v1 (é pequeno e evita perder a versão enviada) |

## 9. O que bloqueia, o que é simplificação declarada, o que fica para depois

**Bloqueia (resolver na especificação antes de codar — todos resolvidos acima,
faltam só as decisões D-A a D-E):** natureza gerencial da estimativa e
premissas congeladas (§1.1, §4); delimitação de destinatário/finalidade (§1.3);
adaptador da DRE e regra do frete (§2.0, §2.1); snapshot completo e assinatura
com cabeçalho (§4).

**Simplificação declarada da v1:** 34% marginal e presumido linear; ICMS em
linha única mista; custos internos sem crédito e dedutíveis; frete cobrado =
despesa; UF de entrega = UF de faturamento; contribuinte só "revende ou
industrializa"; IPI não destacado na importação direta (pendente); IBS/CBS sem
cálculo.

**Depois (v2 ou rodada própria):** crédito de PIS/COFINS do frete contratado;
custo real do frete ≠ cobrado; IPI na saída da importação direta e FCP na calc
1 (dependem da contadora e de mexer na calc 1); adicional/limites reais de
apuração (não cabem num orçamento).

## 10. Fontes conferidas nesta revisão

- LC 224/2025 e IN RFB 2.305/2025: [Domingues e Pinho — ajustes no lucro presumido](https://www.dpc.com.br/lei-complementar-no-224-2025-ajustes-no-lucro-presumido/); discussão de constitucionalidade e liminares: [ConJur, jul/2026](https://conjur.com.br/2026-jul-15/majoracao-de-10-no-lucro-presumido-pela-lc-224-2025-uma-inconstitucionalidade-em-curso-2/), [Barbieri Advogados](https://www.barbieriadvogados.com/lucro-presumido-liminar/).
- Código: `defaults.js → tributos` (irpj 0,15 com adicional ignorado; irpjCsllReal 0,34); `calc.js → custoImportacao` (creditoPisM2/creditoCofinsM2 no resultado), `calcularRevenda` (frete como receita e despesa; `tributosTotais`), `dreImportacao`.
- Demais fontes do parecer (LC 87/96, RIPI, Lei 10.833, Tema 1008, Lei 14.592) conferem com o que o motor já faz por item.

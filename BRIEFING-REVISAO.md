# MaisGlass — Briefing para revisão: calculadora "Revenda de importado"

Documento para revisão independente (Codex) do raciocínio fiscal e do código da
calculadora 2 do app MaisGlass. O código vai junto (pasta `maisglass/`); o
motor está em `calc.js` (função `calcularRevenda`), os padrões em
`defaults.js`, os testes em `test/test.js` (`node test/test.js`).

## 1. A empresa e a operação

- **MaisGlass** — Juiz de Fora, MG. Regime **lucro real**. Enquadrada como
  **indústria** (beneficiamento de vidro: corte, lapidação etc.). Compra a
  chapa, beneficia e vende o produto.
- **Entrada:** compra de vidro **importado** de importadora/distribuidor
  **com inscrição estadual em SP**. NF de entrada com **ICMS 4%** por dentro
  (mercadoria importada em operação interestadual — Resolução do Senado
  13/2012) e **IPI 6,5%** destacado por fora (importadora é equiparada a
  industrial).
- **Saída:** venda para cliente em outra UF (caso base: **RJ**),
  normalmente **não contribuinte do ICMS** (sem IE). Também existe o caso de
  cliente contribuinte.
- O produto beneficiado mantém **conteúdo de importação acima de 40%**, logo
  a saída interestadual continua a **4%** (com obrigação de emitir a FCI —
  Ficha de Conteúdo de Importação).
- A MaisGlass tem regime especial em MG com ICMS efetivo de 1,5% na saída,
  **válido só para importação própria** — não se aplica a esta operação.

## 2. Tratamento tributário adotado

### Entrada (compra)
| Item | Regra adotada |
|---|---|
| Valor dos produtos | `preço/m² × m² × (1 + perda)`; ICMS por dentro |
| IPI na entrada | `produtos × 6,5%`, destacado por fora; total da NF = produtos + IPI |
| Crédito de ICMS | `produtos × 4%` |
| Crédito de IPI | = IPI destacado, **só no modo "industrialização"** (vidro é insumo). No modo "revenda sem industrializar" não há crédito e o IPI integra o custo |
| Crédito de PIS/COFINS (não cumulativo) | `9,25% × (produtos − ICMS)`; quando o IPI não é recuperável ele entra na base (integra o custo de aquisição) |
| CMV (custo líquido) | total da NF − créditos recuperáveis (ICMS, IPI, PIS/COFINS) |

### Saída (venda)
| Item | Regra adotada |
|---|---|
| Base | `(preço × m² + frete) × (1 + taxa cartão) − frete` (frete na NF fica fora da base — premissa herdada da planilha; **ponto a revisar**, ver §5) |
| ICMS débito | `base × 4%` interestadual; se cliente na mesma UF da empresa, alíquota interna (MG 18%) |
| ICMS a recolher (MG) | débito − crédito da entrada (negativo = saldo credor) |
| DIFAL | `base × (alíquota interna da UF do cliente − 4%)`, **só se não contribuinte e interestadual**. RJ: 20% − 4% = 16%. Base única |
| FCP | `base × FCP da UF do cliente`, mesma condição. RJ: 2%. Outras UFs estão em 0 na tabela (pendente) |
| IPI na saída | modo industrialização: 6,5%. "Por fora": `base × 6,5%` somado ao preço. "Preço fechado": IPI por dentro, `base − base/1,065` |
| IPI a recolher | IPI saída − crédito IPI entrada |
| PIS/COFINS débito | `9,25% × (base − ICMS débito)`; a recolher = débito − crédito da entrada |
| Preço final ao cliente | "por fora": preço + IPI + DIFAL + FCP. "fechado": o preço combinado é o total; DIFAL/FCP saem da margem |
| Custo total | NF de entrada + IPI a recolher + ICMS a recolher + DIFAL + FCP + PIS/COFINS a recolher + frete + taxa de cartão |
| Lucro operacional | preço final − custo total (= lucro operacional da DRE) |

### DRE e regimes
- **Lucro real (atual):** IRPJ+CSLL = 34% × lucro operacional (se positivo).
- **Lucro presumido (simulação):** IRPJ 15% × (8% × receita) + CSLL 9% × (12% × receita);
  PIS/COFINS cumulativo 3,65% × receita, sem créditos (CMV sem crédito de
  PIS/COFINS). Receita = valor sem IPI. Adicional de IRPJ ignorado
  (base presumida < R$ 60 mil/trimestre no exemplo).

## 3. Memorial da contadora (referência que o motor reproduz)
Compra R$ 100.000 (ICMS 4%), venda R$ 200.000 MG → RJ, cliente não contribuinte:
- Crédito ICMS 4.000 · Débito ICMS 8.000 · ICMS interno devido a MG **4.000**
- DIFAL 200.000 × 16% = **32.000** · FCP 200.000 × 2% = **4.000** (ambos ao RJ)
- **Custo total de ICMS: 40.000** — teste `Revenda de importado (memorial Mariana)` em `test/test.js`.

## 4. Simulação de referência (valores esperados no app)
Entradas: SP → MG → RJ não contribuinte; 69,70 R$/m² (= 74,23 ÷ 1,065, ICMS 4% por dentro);
600 m²; perda 0; IPI entrada 6,5% com crédito (industrialização); venda 125 R$/m² **fechado**;
IPI saída 6,5%; frete 0; à vista.

| Linha | Valor |
|---|---|
| Valor dos produtos (NF entrada) | 41.820,00 |
| IPI entrada | 2.718,30 → total NF 44.538,30 (= 74,23 × 600) |
| Créditos: ICMS 1.672,80 · IPI 2.718,30 · PIS 662,43 · COFINS 3.051,19 | CMV 36.433,58 (60,72/m²) |
| Total pago pelo cliente | 75.000,00 |
| IPI saída (por dentro) 4.577,46 → IPI a recolher | 1.859,16 |
| ICMS débito 3.000 → ICMS a recolher MG | 1.327,20 |
| DIFAL 12.000 + FCP 1.500 (RJ) | 13.500,00 |
| PIS/COFINS débito 6.660 → a recolher | 2.946,38 |
| Custo total | 64.171,05 |
| **Lucro operacional** | **10.828,95** |
| IRPJ/CSLL real 34% | 3.681,84 → **lucro líquido real 7.147,11** (9,5%) |
| Presumido: PIS/COFINS 2.570,42 · IRPJ/CSLL 1.605,63 | **lucro líquido presumido 9.599,28** |

Variantes calculadas pelo motor (mesmos dados): cliente **contribuinte**,
fechado → lucro operacional 24.329 / líquido 16.057; não contribuinte com
DIFAL/IPI **por fora** (total 93.375) → 28.906 / 19.078.

## 5. O que pedimos que seja revisado
1. **Raciocínio fiscal** de cada linha do §2: alíquotas, bases, ordem de
   cálculo, condições (contribuinte × não contribuinte, interna × interestadual,
   industrialização × revenda). Apontar erro com fundamento legal.
2. **Frete fora da base do ICMS/DIFAL/IPI.** A planilha original tratava assim;
   na legislação o frete cobrado na própria NF integra a base. Confirmar e
   dizer se o correto é incluir quando o frete é CIF.
3. **IPI na saída para não contribuinte** e base do ICMS: para consumidor final
   o IPI integra a base do ICMS/DIFAL. Hoje o motor usa a base sem IPI
   (baseVenda) para ICMS/DIFAL/FCP. Avaliar impacto e forma correta.
4. **DIFAL base única × base dupla** para o RJ e para os demais estados da
   tabela (`defaults.js → difal`, `revenda.fcp`).
5. **PIS/COFINS**: exclusão do ICMS da base do crédito (Lei 14.592/2023) e da
   base do débito; IPI não recuperável na base do crédito.
6. **Presumido**: bases de 8%/12% para indústria, adicional de IRPJ, PIS/COFINS
   cumulativo sobre receita sem IPI, perda dos créditos.
7. **Conteúdo de importação/FCI**: condições para manter os 4% após beneficiamento.
8. **Código**: `calcularRevenda` e a DRE em `calc.js`; consistência entre
   `lucro` do motor e `dre.real.lucroOperacional`; casos de borda; testes que faltam.
9. Sugestões de **eficiência tributária** dentro da lei (regime, tipo de
   cliente, estrutura da NF, frete FOB, forma de pagamento).

Restrições: não reescrever o projeto; apontar problemas por gravidade, com
arquivo/linha e patch mínimo; a calculadora 1 (importação direta) está fora
do escopo e não deve ser alterada.

## 6. Pendências já conhecidas
- FCP dos demais estados (tabela só tem RJ 2%).
- Alíquotas internas 2026: tabelas de mercado apontam PR 19,5% e RS 17% (a
  planilha traz 19%/18%); MG interna foi corrigida para 18%.
- Decisão lucro real × presumido é anual, para a empresa inteira — a coluna
  do presumido é simulação.

# MaisGlass — Calculadora

Calculadora de precificação de vidro importado, portada da planilha
**"MaxiBuild Vidro Automatica Corte atualizado.xlsx"**. Página única, sem
build, sem servidor: abre direto no navegador ou publica no GitHub Pages.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Interface (login, aba Calculadora, aba Configurações). CSS embutido. |
| `calc.js` | Motor de cálculo puro (sem DOM). Cada fórmula cita a célula da planilha de origem. |
| `defaults.js` | Valores padrão: produtos, classes fiscais + NCM, despesas nacionais, entreposto, cartão, DIFAL. É o "Restaurar padrão". |
| `app.js` | Liga interface ↔ motor; login; localStorage; exportar/importar JSON. |
| `test/test.js` | Testes de regressão contra os valores da planilha. `node test/test.js` |

## Como publicar (GitHub Pages)

1. Crie um repositório e envie estes arquivos para a raiz (ou pasta `docs/`).
2. Settings → Pages → Source: branch `main`, pasta `/` (ou `/docs`).
3. O link fica `https://<usuario>.github.io/<repositorio>/`.

Também funciona abrindo `index.html` direto do computador ou em qualquer
hospedagem estática (Netlify, Vercel, Cloudflare Pages).

## Senha (bloqueio local, não é autenticação)

Senha padrão: **`glassmais`** — troque antes de divulgar o link:

1. Aba Configurações → "Senha de administrador" → digite a nova senha → "Gerar hash".
2. Copie o hash e substitua a constante `SENHA_HASH` no início de `app.js`.
3. Publique de novo.

O que isso é: um bloqueio contra acesso casual. A verificação acontece no
navegador (SHA-256, com Web Crypto ou implementação local quando o contexto
não é seguro). Quem abrir o código vê o hash e pode tentar senhas offline;
quem souber mexer no console consegue pular a tela. Portanto, **preços e
configurações publicados aqui não devem ser tratados como confidenciais**.
Login de verdade e configurações compartilhadas exigem um backend simples
(ex.: Supabase).

## Onde ficam as configurações

Na aba Configurações tudo é editável e **salva automaticamente** (meio
segundo depois de digitar, se a configuração for válida; o status no topo
confirma a hora). Fica em `localStorage` do navegador (chave
`glassmais.config.v1`), ou seja, **por aparelho**: o dólar mudado no
computador não aparece sozinho no celular. Para levar para outro computador
ou outra pessoa: **Exportar (JSON)** → **Importar (JSON)** → Salvar.
"Restaurar padrão" volta aos valores de `defaults.js`.

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

**NCM e II** vêm da classe fiscal do produto: LG 7007.29.00 (II 25%) · CF 7005.29.00 (II 25%) · MI 7005.21.00 (II 9%) — conforme `VL 4+4!C17` → `Produtos!O2/O9/O14`.

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

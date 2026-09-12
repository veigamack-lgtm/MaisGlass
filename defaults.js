/* =====================================================================
 * defaults.js — Configuração padrão da Calculadora MaisGlass
 * Espelha a planilha "MaxiBuild Vidro Automatica Corte atualizado.xlsx"
 * (abas Produtos, Config, DIFAL, VL 4+4). Tudo aqui pode ser alterado
 * na aba "Configurações" do programa; este arquivo é o "restaurar padrão".
 * ===================================================================== */
(function (root) {
  'use strict';

  var DEFAULT_CONFIG = {
    versao: 1,

    /* --- Parâmetros gerais (Calculadora Chapa!F1 e VL 4+4!D7:D10) --- */
    dolar: 5.30,              // USD/BRL
    dentro: 1.0,              // fração do valor faturada "por dentro" (VL 4+4!D7). Por fora = 1 - dentro
    freteInternacionalUSD: 2500, // VL 4+4!D10
    seguroPct: 0.005,         // VL 4+4!G17 = 0,5% de (VMCV + frete)

    /* --- Classes fiscais (Produtos!N:O; VL 4+4!C17 aponta LG→O2 25%, CF→O9 25%, MI→O14 9%) + NCM informado por Gabriel --- */
    classes: {
      LG: { nome: 'Laminado',            ncm: '7007.29.00', ii: 0.25, ipi: 0.065, pis: 0.021, cofins: 0.0965 },
      CF: { nome: 'Float incolor',       ncm: '7005.29.00', ii: 0.25, ipi: 0.065, pis: 0.021, cofins: 0.0965 },
      MI: { nome: 'Monolítico colorido/refletivo', ncm: '7005.21.00', ii: 0.09, ipi: 0.065, pis: 0.021, cofins: 0.0965 }
    },

    /* --- Produtos (Produtos!A5:D30): custo FOB US$/m², m² por container, classe --- */
    produtos: [
      { nome: 'Vidro Laminado Incolor 4+4',                   custo: 5.46, capacidade: 1336.5, classe: 'LG' },
      { nome: 'Vidro Laminado Incolor 3+3',                   custo: 4.70, capacidade: 1782,   classe: 'LG' },
      { nome: 'Vidro Laminado Incolor 5+5',                   custo: 6.47, capacidade: 1331,   classe: 'LG' },
      { nome: 'Vidro Laminado Incolor 4+5',                   custo: 6.13, capacidade: 1723,   classe: 'LG' },
      { nome: 'Vidro Laminado Verde 4+4',                     custo: 6.10, capacidade: 1336.5, classe: 'LG' },
      { nome: 'Vidro Laminado Fumê 4+4',                      custo: 6.10, capacidade: 1336.5, classe: 'LG' },
      { nome: 'Vidro Laminado Refletivo N14 4+4',             custo: 7.00, capacidade: 1336.5, classe: 'LG' },
      { nome: 'Vidro Laminado Refletivo N30 Champanhe 4+4',   custo: 7.10, capacidade: 1336.5, classe: 'LG' },
      { nome: 'Vidro Float Incolor 3mm',                      custo: 1.72, capacidade: 3446,   classe: 'CF' },
      { nome: 'Vidro Float Incolor 4mm',                      custo: 2.10, capacidade: 2584,   classe: 'CF' },
      { nome: 'Vidro Float Incolor 5mm',                      custo: 2.63, capacidade: 2067,   classe: 'CF' },
      { nome: 'Vidro Float Incolor 6mm',                      custo: 3.15, capacidade: 1723,   classe: 'CF' },
      { nome: 'Vidro Float Incolor 8mm',                      custo: 4.10, capacidade: 1292,   classe: 'CF' },
      { nome: 'Vidro Float Incolor 10mm',                     custo: 5.20, capacidade: 1033,   classe: 'CF' },
      { nome: 'Vidro Float Incolor 12mm',                     custo: 6.31, capacidade: 851,    classe: 'CF' },
      { nome: 'Vidro Monolítico Reflecta Prata 4mm',          custo: 3.50, capacidade: 2584,   classe: 'MI' },
      { nome: 'Vidro Monolítico Reflecta Prata 6mm',          custo: 4.50, capacidade: 1723,   classe: 'MI' },
      { nome: 'Vidro Monolítico Reflecta Prata 8mm',          custo: 6.00, capacidade: 1292,   classe: 'MI' },
      { nome: 'Vidro Monolítico Reflecta Champanhe 4mm',      custo: 3.50, capacidade: 2584,   classe: 'MI' },
      { nome: 'Vidro Monolítico Reflecta Champanhe 6mm',      custo: 4.50, capacidade: 1723,   classe: 'MI' },
      { nome: 'Vidro Monolítico Reflecta Champanhe 8mm',      custo: 6.00, capacidade: 1292,   classe: 'MI' },
      { nome: 'Vidro Monolítico Verde 4mm',                   custo: 2.67, capacidade: 2663,   classe: 'MI' },
      { nome: 'Vidro Monolítico Verde 6mm',                   custo: 3.99, capacidade: 1801,   classe: 'MI' },
      { nome: 'Vidro Monolítico Verde 8mm',                   custo: 5.53, capacidade: 1331,   classe: 'MI' },
      { nome: 'Vidro Monolítico Verde 10mm',                  custo: 7.54, capacidade: 1096,   classe: 'MI' },
      { nome: 'Vidro Mini Boreal 4mm',                        custo: 2.71, capacidade: 2679,   classe: 'MI' }
    ],

    /* --- Despesas nacionais (VL 4+4!F3:G8), em R$ por container --- */
    despesasNacionais: {
      afrmmFatorUSD: 200,          // AFRMM = 800 × 0,25 = 200 × dólar (VL 4+4!G3)
      transporteNacional: 4200,    // G4
      armazenagemDestino: 4800,    // G5
      armazenagemZonaSecundaria: 0,// G6
      despachante: 700,            // G7
      despesasExtras: 400          // G8
    },

    /* --- Entreposto aduaneiro (VL 4+4!I3:J9) --- */
    entreposto: {
      dias: 30,                    // J3
      taxaArmazenagemPor10Dias: 0.003, // J4 = CEILING(dias,10)/10 × 0,3% × VMLD (R$)
      movimentacao: 234,           // J5 = 9,36 × 25
      pesagem: 219.56,             // J6
      desunitizacao: 420,          // J7 (container 20')
      certificados: 82.33,         // J8
      reportagemFotografica: 54.89 // J9
    },

    /* --- Impostos de saída (Calculadora Chapa!F13:F16) --- */
    saida: {
      pis: 0.0165,
      cofins: 0.076,
      icmsEfetivoMG: 0.14,         // 18% saída − 4% crédito (default sem regime)
      icmsEfetivoForaMG: 0.015,    // 1,5% efetivo (regime especial) — lógica da planilha
      icmsNominalMG: 0.18,         // informativo (F16)
      icmsNominalForaMG: 0.04      // informativo (F16)
    },

    /* --- Cartão (Config!A2:D11) --- */
    cartao: {
      antecipacaoBase: 0.015,      // 1,50% no parcelado
      porParcela: 0.0075,          // 0,75% × nº de parcelas
      mdr: {                       // [1x, 2–5x, 6–12x]
        'MasterCard': [0.0120, 0.0195, 0.0210],
        'Visa':       [0.0120, 0.0195, 0.0210],
        'Elo':        [0.0185, 0.0235, 0.0250],
        'Amex':       [0.0261, 0.0266, 0.0305],
        'Hipercard':  [0.0165, 0.0266, 0.0305]
      }
    },

    /* --- Calculadora 2: revenda de importado comprado no Brasil --- */
    revenda: {
      empresaUF: 'MG',             // UF da MaisGlass (lucro real)
      icmsCompraImportado: 0.04,   // ICMS destacado na NF do fornecedor (importado, interestadual)
      ipiCompra: 0.065,            // IPI destacado pelo importador (equiparado a industrial)
      ipiCredito: true,            // MaisGlass compra, beneficia e revende: toma crédito do IPI e destaca IPI na saída
      /* FCP (Fundo de Combate à Pobreza) cobrado no DIFAL para NÃO contribuinte, por UF do cliente.
       * Só RJ preenchido (2%) conforme memorial da contadora; demais em 0 — confirmar antes de usar. */
      fcp: {
        AC: 0, AL: 0, AM: 0, AP: 0, BA: 0, CE: 0, DF: 0, ES: 0, GO: 0, MA: 0, MS: 0, MT: 0, MG: 0,
        PA: 0, PB: 0, PE: 0, PI: 0, PR: 0, RJ: 0.02, RN: 0, RO: 0, RR: 0, RS: 0, SC: 0, SE: 0, SP: 0, TO: 0
      }
    },

    /* --- Tributos sobre o resultado, para a DRE da revenda (calc 2) --- */
    tributos: {
      irpjCsllReal: 0.34,          // IRPJ 15% + adicional 10% + CSLL 9% sobre o lucro (empresa acima da faixa do adicional)
      presumidoBaseIRPJ: 0.08,     // indústria/comércio: 8% da receita bruta
      presumidoBaseCSLL: 0.12,     // 12% da receita bruta
      irpj: 0.15,                  // alíquota IRPJ sobre a base presumida (adicional de 10% ignorado: base < R$ 60 mil/trimestre)
      csll: 0.09,                  // alíquota CSLL
      pisCumulativo: 0.0065,       // presumido: PIS 0,65% sem crédito
      cofinsCumulativo: 0.03       // presumido: COFINS 3% sem crédito
    },

    /* --- DIFAL por UF (aba DIFAL da planilha, mantida como está): [alíquota interna, DIFAL %].
     * DIFAL = interna − 4% (interestadual de importado); MG = 0 (venda interna).
     * Única correção: MG interna 18% (a planilha trazia 11%; a calc 1 não usa esse número, a calc 2 usa na venda interna).
     * Obs.: tabelas 2026 apontam PR 19,5% e RS 17% — ajustar em Configurações se a contadora confirmar. --- */
    interestadual: 0.04,
    difal: {
      AC: [0.19, 0.15],  AL: [0.19, 0.15],  AM: [0.20, 0.16],  AP: [0.18, 0.14],
      BA: [0.205, 0.165], CE: [0.20, 0.16], DF: [0.20, 0.16],  ES: [0.17, 0.13],
      GO: [0.19, 0.15],  MA: [0.23, 0.19],  MS: [0.17, 0.13],  MT: [0.19, 0.15],
      MG: [0.18, 0],     PA: [0.19, 0.15],  PB: [0.20, 0.16],  PE: [0.205, 0.165],
      PI: [0.225, 0.185], PR: [0.19, 0.15], RJ: [0.20, 0.16],  RN: [0.20, 0.16],
      RO: [0.195, 0.155], RR: [0.20, 0.16], RS: [0.18, 0.14],  SC: [0.17, 0.13],
      SE: [0.19, 0.15],  SP: [0.18, 0.14],  TO: [0.20, 0.16]
    }
  };

  /* Entradas padrão da tela principal (Calculadora Chapa!B4:B13) */
  var DEFAULT_INPUTS = {
    contribuinte: false,
    produto: 'Vidro Laminado Incolor 4+4',
    perda: 0,
    precoBase: 140,
    quantidade: 1336,
    frete: 0,
    pagamento: 'À vista',   // 'À vista' | 'Parcelado'
    bandeira: 'Amex',
    parcelas: 3,
    uf: 'RJ'
  };

  /* Entradas padrão da calculadora de revenda */
  var DEFAULT_INPUTS_REVENDA = {
    fornecedorUF: 'SP',
    precoCompra: 75,        // R$/m² na NF do fornecedor (ICMS por dentro)
    quantidade: 1336,
    perda: 0,
    icmsCompra: 0.04,
    ipi: 0.065,
    ipiCredito: true,
    ipiVenda: 0.065,        // MaisGlass beneficia e revende: IPI destacado na saída
    modo: 'beneficiamento', // 'revenda' (sem beneficiar: IPI da compra é custo, sem IPI na saída) | 'beneficiamento' (crédito de IPI e IPI na saída)
    difalIncluso: false,    // false = DIFAL/FCP somados ao preço; true = preço fechado, DIFAL/FCP saem da margem
    contribuinte: false,
    clienteUF: 'RJ',
    precoVenda: 150,        // R$/m²
    frete: 0,
    pagamento: 'À vista',
    bandeira: 'Amex',
    parcelas: 3
  };

  root.GM_DEFAULTS = { config: DEFAULT_CONFIG, inputs: DEFAULT_INPUTS, inputsRevenda: DEFAULT_INPUTS_REVENDA };
})(typeof module !== 'undefined' ? module.exports : window);

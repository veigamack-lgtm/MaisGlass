/* =====================================================================
 * calc.js — Motor de cálculo da Calculadora Glass Mais
 * Porta fiel das fórmulas da planilha. Cada função cita a célula de
 * origem para facilitar a conferência. Sem dependências, sem DOM.
 *
 *   custoImportacao(config, produto)  → aba "VL 4+4"
 *   calcular(config, inputs)          → aba "Calculadora Chapa"
 * ===================================================================== */
(function (root) {
  'use strict';

  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }

  function findProduto(config, nome) {
    for (var i = 0; i < config.produtos.length; i++) {
      if (config.produtos[i].nome === nome) return config.produtos[i];
    }
    return null;
  }

  /* -------------------------------------------------------------------
   * Aba "VL 4+4": custo de importação de UM CONTAINER do produto.
   * Devolve custo chão de fábrica por m² e créditos de PIS/COFINS por m².
   * ----------------------------------------------------------------- */
  function custoImportacao(config, produto) {
    var cls = config.classes[produto.classe];
    if (!cls) throw new Error('Classe fiscal desconhecida: ' + produto.classe);

    var dolar = num(config.dolar);
    var qtd = num(produto.capacidade);              // D5 / C14 — m² por container
    var fob = num(produto.custo);                   // D6 / C15 — US$/m²
    var dentro = Math.min(1, Math.max(0, num(config.dentro, 1)));  // D7
    var fora = 1 - dentro;                          // D8

    var valorTotalUSD = fob * qtd;                  // G13 = C15*C14
    var vmcvUSD = valorTotalUSD * dentro;           // G15 = G13*C25
    var freteUSD = num(config.freteInternacionalUSD);          // G16 = D10
    var seguroUSD = num(config.seguroPct, 0.005) * (vmcvUSD + freteUSD); // G17
    var vmldUSD = vmcvUSD + freteUSD + seguroUSD;   // G18

    var vmcv = vmcvUSD * dolar;                     // H15
    var frete = freteUSD * dolar;                   // H16
    var seguro = seguroUSD * dolar;                 // H17
    var vmld = vmcv + frete + seguro;               // H18

    var ii = vmld * num(cls.ii);                    // H19
    var ipi = (vmld + ii) * num(cls.ipi);           // H20
    var pis = vmld * num(cls.pis);                  // H21
    var cofins = vmld * num(cls.cofins);            // H22
    var subtotal = vmld + ii + ipi + pis + cofins;  // H23 / H25

    var porFora = valorTotalUSD * fora * dolar;     // H26 = G13*C26*C16

    // Despesas nacionais (F3:G8)
    var dn = config.despesasNacionais;
    var afrmm = num(dn.afrmmFatorUSD) * dolar;      // G3 = 800*0.25*C16
    var despesasNacionais = afrmm + num(dn.transporteNacional) + num(dn.armazenagemDestino)
      + num(dn.armazenagemZonaSecundaria) + num(dn.despachante) + num(dn.despesasExtras); // G9

    // Entreposto aduaneiro (I3:J10)
    var ep = config.entreposto;
    var periodos = Math.ceil(num(ep.dias) / 10);    // CEILING(J3,10)/10
    var armazenagemEntreposto = periodos * num(ep.taxaArmazenagemPor10Dias) * vmld; // J4
    var entreposto = armazenagemEntreposto + num(ep.movimentacao) + num(ep.pesagem)
      + num(ep.desunitizacao) + num(ep.certificados) + num(ep.reportagemFotografica); // J10

    var custoChaoFabrica = subtotal + porFora + despesasNacionais + entreposto; // C29
    var custoM2 = qtd > 0 ? custoChaoFabrica / qtd : 0;   // C30
    var creditoPisM2 = qtd > 0 ? pis / qtd : 0;           // C31
    var creditoCofinsM2 = qtd > 0 ? cofins / qtd : 0;     // C32

    return {
      ncm: cls.ncm,
      classe: produto.classe,
      capacidade: qtd,
      valorTotalUSD: valorTotalUSD,
      vmcv: vmcv, frete: frete, seguro: seguro, vmld: vmld,
      ii: ii, ipi: ipi, pis: pis, cofins: cofins,
      subtotalImpostos: subtotal,
      porFora: porFora,
      afrmm: afrmm,
      despesasNacionais: despesasNacionais,
      armazenagemEntreposto: armazenagemEntreposto,
      entreposto: entreposto,
      custoChaoFabrica: custoChaoFabrica,
      custoM2: custoM2,
      creditoPisM2: creditoPisM2,
      creditoCofinsM2: creditoCofinsM2
    };
  }

  /* -------------------------------------------------------------------
   * Calculadora Chapa!B14 — taxa do cartão
   * ----------------------------------------------------------------- */
  function taxaCartao(config, inputs) {
    if (inputs.pagamento !== 'Parcelado') return 0;
    var parcelas = Math.max(1, Math.round(num(inputs.parcelas, 1)));
    var faixas = config.cartao.mdr[inputs.bandeira];
    if (!faixas) throw new Error('Bandeira desconhecida: ' + inputs.bandeira);
    var idx = parcelas === 1 ? 0 : (parcelas <= 5 ? 1 : 2);
    return num(faixas[idx]) + num(config.cartao.antecipacaoBase) + num(config.cartao.porParcela) * parcelas;
  }

  /* -------------------------------------------------------------------
   * Aba "Calculadora Chapa"
   * ----------------------------------------------------------------- */
  function calcular(config, inputs) {
    var produto = findProduto(config, inputs.produto);
    if (!produto) throw new Error('Produto não encontrado: ' + inputs.produto);
    var imp = custoImportacao(config, produto);

    var precoBase = num(inputs.precoBase);          // B7
    var qtd = num(inputs.quantidade);               // B8
    var perda = num(inputs.perda);                  // B6 (fração)
    var frete = num(inputs.frete);                  // B9
    var uf = inputs.uf;
    var contribuinte = !!inputs.contribuinte;       // B4
    var isMG = uf === 'MG';

    var qtdComPerda = qtd * (1 + perda);            // E2
    var taxa = taxaCartao(config, inputs);          // B14
    var precoComTaxa = (precoBase * qtd + frete) * (1 + taxa); // B15

    var ufInfo = config.difal[uf];
    if (!ufInfo) throw new Error('UF desconhecida: ' + uf);
    var difalPct = contribuinte ? 0 : num(ufInfo[1]);   // B16
    var difal = precoComTaxa * difalPct;            // B17
    var precoFinal = precoComTaxa + difal;          // B18

    var s = config.saida;
    var custoSemImposto = qtdComPerda * imp.custoM2;              // F11
    var icmsAliq = isMG ? num(s.icmsEfetivoMG) : num(s.icmsEfetivoForaMG);
    var icms = (precoComTaxa - frete) * icmsAliq;                 // F15
    var basePisCofins = precoComTaxa - frete - icms;
    var pis = basePisCofins * num(s.pis) - qtd * imp.creditoPisM2;         // F13 (corrigido)
    var cofins = basePisCofins * num(s.cofins) - qtd * imp.creditoCofinsM2; // F14
    var valorTaxaCartao = precoComTaxa - precoBase * qtd - frete; // F19
    var custoTotal = difal + icms + cofins + pis + custoSemImposto + frete + valorTaxaCartao; // F20
    var lucro = precoFinal - custoTotal;                          // F21
    var markup = custoSemImposto > 0 ? lucro / custoSemImposto : 0; // F7

    return {
      produto: produto,
      importacao: imp,
      ncm: imp.ncm,
      // Bloco B14:B18 (saídas principais)
      taxaCartao: taxa,
      precoComTaxa: precoComTaxa,
      difalPct: difalPct,
      difal: difal,
      precoFinal: precoFinal,
      // Bloco E5:F7
      custoMateriaPrimaM2: qtd > 0 ? custoSemImposto / qtd : 0, // F5
      precoVendaM2: qtd > 0 ? precoFinal / qtd : 0,             // F6
      markup: markup,
      // Bloco E11:F21
      qtdComPerda: qtdComPerda,
      custoSemImposto: custoSemImposto,
      pis: pis,
      cofins: cofins,
      icmsAliqEfetiva: icmsAliq,
      icmsAliqNominal: isMG ? num(s.icmsNominalMG) : num(s.icmsNominalForaMG), // F16
      icms: icms,
      frete: frete,
      valorTaxaCartao: valorTaxaCartao,
      custoTotal: custoTotal,
      lucro: lucro,
      // Notas (E24:E27)
      notas: notas({ contribuinte: contribuinte, isMG: isMG, precoVendaM2: qtd > 0 ? precoFinal / qtd : 0,
        temPerda: perda > 0, temFrete: frete > 0, difal: difal,
        icmsNominal: isMG ? num(s.icmsNominalMG) : num(s.icmsNominalForaMG) })
    };
  }

  function fmtBRL(v) {
    return 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function notas(o) {
    var out = [];
    out.push('Cliente ' + (o.contribuinte ? 'contribuinte' : 'NÃO contribuinte') + ' do ICMS, ' +
      (o.isMG ? 'Estado de Minas Gerais' : 'fora de Minas Gerais') + '.');
    out.push('Preço final por m²: ' + fmtBRL(o.precoVendaM2) +
      (o.temPerda ? ' (já considerando perdas de aproveitamento)' : ' (sem perdas de aproveitamento)') +
      (o.temFrete ? ' + frete incluso' : ' + frete não incluso') +
      (o.difal > 0 ? ' + com DIFAL incluso.' : '.'));
    out.push('A alíquota de ICMS aplicada é de ' + Math.round(o.icmsNominal * 100) + '%.');
    if (o.difal > 0) out.push('Valor de DIFAL a recolher: ' + fmtBRL(o.difal));
    return out;
  }

  root.GM_CALC = { calcular: calcular, custoImportacao: custoImportacao, taxaCartao: taxaCartao, findProduto: findProduto, fmtBRL: fmtBRL };
})(typeof module !== 'undefined' ? module.exports : window);

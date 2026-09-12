/* =====================================================================
 * calc.js — Motor de cálculo da Calculadora MaisGlass
 * Porta fiel das fórmulas da planilha. Cada função cita a célula de
 * origem para facilitar a conferência. Sem dependências, sem DOM.
 *
 *   validarConfig(config)             → lista de erros (vazia = OK)
 *   custoImportacao(config, produto)  → aba "VL 4+4"
 *   calcular(config, inputs)          → aba "Calculadora Chapa"
 *
 * O motor é estrito: entradas inválidas lançam Error em vez de virar zero.
 * ===================================================================== */
(function (root) {
  'use strict';

  var UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MS','MT','MG','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

  function has(obj, key) { return obj != null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isFin(v) { return typeof v === 'number' && isFinite(v); }

  /* Conversão estrita: aceita número finito ou string numérica; senão lança. */
  function num(v, nome) {
    if (typeof v === 'string' && v.trim() !== '') v = Number(v);
    if (!isFin(v)) throw new Error('Valor inválido em "' + nome + '".');
    return v;
  }
  function nonNeg(v, nome) { v = num(v, nome); if (v < 0) throw new Error('"' + nome + '" não pode ser negativo.'); return v; }
  function positivo(v, nome) { v = num(v, nome); if (v <= 0) throw new Error('"' + nome + '" deve ser maior que zero.'); return v; }
  function fracao(v, nome) { v = nonNeg(v, nome); if (v > 1) throw new Error('"' + nome + '" deve estar entre 0% e 100%.'); return v; }
  function inteiro(v, nome, min, max) {
    if (typeof v === 'string' && v.trim() !== '') v = Number(v);
    if (!isFin(v) || Math.floor(v) !== v || v < min || v > max) throw new Error('"' + nome + '" deve ser um inteiro entre ' + min + ' e ' + max + '.');
    return v;
  }
  function checarFinito(obj) {
    Object.keys(obj).forEach(function (k) {
      if (typeof obj[k] === 'number' && !isFinite(obj[k])) throw new Error('Resultado não finito em "' + k + '" — confira as entradas.');
    });
    return obj;
  }

  /* -------------------------------------------------------------------
   * Validação estrutural da configuração (usada ao carregar, importar,
   * salvar e exportar). Devolve array de mensagens; vazio = válida.
   * ----------------------------------------------------------------- */
  function validarConfig(cfg) {
    var erros = [];
    function tenta(fn) { try { fn(); } catch (e) { erros.push(e.message); } }
    if (!isObj(cfg)) return ['Configuração deve ser um objeto.'];

    tenta(function () { positivo(cfg.dolar, 'dólar'); });
    tenta(function () { fracao(cfg.dentro, 'preço por dentro'); });
    tenta(function () { nonNeg(cfg.freteInternacionalUSD, 'frete internacional'); });
    tenta(function () { fracao(cfg.seguroPct, 'seguro'); });

    if (!isObj(cfg.classes) || Object.keys(cfg.classes).length === 0) erros.push('Classes fiscais ausentes.');
    else Object.keys(cfg.classes).forEach(function (k) {
      var c = cfg.classes[k];
      if (!isObj(c)) { erros.push('Classe "' + k + '" inválida.'); return; }
      if (typeof c.ncm !== 'string' || !c.ncm.trim()) erros.push('Classe "' + k + '" sem NCM.');
      ['ii', 'ipi', 'pis', 'cofins'].forEach(function (f) { tenta(function () { fracao(c[f], k + '.' + f); }); });
    });

    if (!Array.isArray(cfg.produtos) || cfg.produtos.length === 0) erros.push('Cadastre pelo menos um produto.');
    else {
      var nomes = {};
      cfg.produtos.forEach(function (p, i) {
        var rot = 'produto ' + (i + 1);
        if (!isObj(p)) { erros.push(rot + ' inválido.'); return; }
        if (typeof p.nome !== 'string' || !p.nome.trim()) erros.push(rot + ' sem nome.');
        else if (has(nomes, p.nome)) erros.push('Produto duplicado: ' + p.nome);
        else nomes[p.nome] = true;
        tenta(function () { nonNeg(p.custo, rot + ' custo'); });
        tenta(function () { positivo(p.capacidade, rot + ' capacidade'); });
        if (!isObj(cfg.classes) || !has(cfg.classes, p.classe)) erros.push(rot + ' com classe inválida.');
      });
    }

    var dn = cfg.despesasNacionais;
    if (!isObj(dn)) erros.push('Despesas nacionais ausentes.');
    else ['afrmmFatorUSD', 'transporteNacional', 'armazenagemDestino', 'armazenagemZonaSecundaria', 'despachante', 'despesasExtras']
      .forEach(function (f) { tenta(function () { nonNeg(dn[f], 'despesas.' + f); }); });

    var ep = cfg.entreposto;
    if (!isObj(ep)) erros.push('Entreposto ausente.');
    else {
      tenta(function () { nonNeg(ep.dias, 'entreposto.dias'); });
      tenta(function () { fracao(ep.taxaArmazenagemPor10Dias, 'entreposto.taxa'); });
      ['movimentacao', 'pesagem', 'desunitizacao', 'certificados', 'reportagemFotografica']
        .forEach(function (f) { tenta(function () { nonNeg(ep[f], 'entreposto.' + f); }); });
    }

    var s = cfg.saida;
    if (!isObj(s)) erros.push('Impostos de saída ausentes.');
    else ['pis', 'cofins', 'icmsEfetivoMG', 'icmsEfetivoForaMG', 'icmsNominalMG', 'icmsNominalForaMG']
      .forEach(function (f) { tenta(function () { fracao(s[f], 'saida.' + f); }); });

    var ct = cfg.cartao;
    if (!isObj(ct) || !isObj(ct.mdr) || Object.keys(ct.mdr).length === 0) erros.push('Tabela de cartão ausente.');
    else {
      tenta(function () { fracao(ct.antecipacaoBase, 'cartao.antecipacaoBase'); });
      tenta(function () { fracao(ct.porParcela, 'cartao.porParcela'); });
      Object.keys(ct.mdr).forEach(function (b) {
        var f = ct.mdr[b];
        if (!Array.isArray(f) || f.length !== 3) { erros.push('MDR de "' + b + '" deve ter 3 faixas.'); return; }
        f.forEach(function (v, i) { tenta(function () { fracao(v, 'MDR ' + b + '[' + i + ']'); }); });
      });
    }

    var rv = cfg.revenda;
    if (!isObj(rv)) erros.push('Configuração de revenda ausente.');
    else {
      if (UFS.indexOf(rv.empresaUF) < 0) erros.push('UF da empresa inválida.');
      tenta(function () { fracao(rv.icmsCompraImportado, 'revenda.icmsCompraImportado'); });
      tenta(function () { fracao(rv.ipiCompra, 'revenda.ipiCompra'); });
      if (!isObj(rv.fcp)) erros.push('Tabela FCP ausente.');
      else Object.keys(rv.fcp).forEach(function (uf) {
        if (UFS.indexOf(uf) < 0) { erros.push('UF desconhecida na tabela FCP: ' + uf); return; }
        tenta(function () { fracao(rv.fcp[uf], 'FCP ' + uf); });
      });
    }

    var tb = cfg.tributos;
    if (!isObj(tb)) erros.push('Tributos sobre o lucro ausentes.');
    else ['irpjCsllReal', 'presumidoBaseIRPJ', 'presumidoBaseCSLL', 'irpj', 'csll', 'pisCumulativo', 'cofinsCumulativo']
      .forEach(function (f) { tenta(function () { fracao(tb[f], 'tributos.' + f); }); });

    if (!isObj(cfg.difal) || Object.keys(cfg.difal).length === 0) erros.push('Tabela DIFAL ausente.');
    else Object.keys(cfg.difal).forEach(function (uf) {
      if (UFS.indexOf(uf) < 0) { erros.push('UF desconhecida na tabela DIFAL: ' + uf); return; }
      var d = cfg.difal[uf];
      if (!Array.isArray(d) || d.length !== 2) { erros.push('DIFAL de ' + uf + ' deve ter [interna, difal].'); return; }
      tenta(function () { fracao(d[0], 'DIFAL ' + uf + ' interna'); });
      tenta(function () { fracao(d[1], 'DIFAL ' + uf + ' difal'); });
    });
    return erros;
  }

  function findProduto(config, nome) {
    if (!Array.isArray(config.produtos)) return null;
    for (var i = 0; i < config.produtos.length; i++) {
      if (config.produtos[i] && config.produtos[i].nome === nome) return config.produtos[i];
    }
    return null;
  }

  /* -------------------------------------------------------------------
   * Aba "VL 4+4": custo de importação de UM CONTAINER do produto.
   * Devolve custo chão de fábrica por m² e créditos de PIS/COFINS por m².
   * ----------------------------------------------------------------- */
  function custoImportacao(config, produto) {
    if (!isObj(produto)) throw new Error('Produto inválido.');
    if (!has(config.classes, produto.classe)) throw new Error('Classe fiscal desconhecida: ' + produto.classe);
    var cls = config.classes[produto.classe];

    var dolar = positivo(config.dolar, 'dólar');
    var qtd = positivo(produto.capacidade, 'capacidade do container');   // D5 / C14 — m² por container
    var fob = nonNeg(produto.custo, 'custo FOB');                         // D6 / C15 — US$/m²
    var dentro = fracao(config.dentro, 'preço por dentro');              // D7
    var fora = 1 - dentro;                                               // D8

    var valorTotalUSD = fob * qtd;                  // G13 = C15*C14
    var vmcvUSD = valorTotalUSD * dentro;           // G15 = G13*C25
    var freteUSD = nonNeg(config.freteInternacionalUSD, 'frete internacional'); // G16 = D10
    var seguroUSD = fracao(config.seguroPct, 'seguro') * (vmcvUSD + freteUSD);  // G17
    var vmldUSD = vmcvUSD + freteUSD + seguroUSD;   // G18

    var vmcv = vmcvUSD * dolar;                     // H15
    var frete = freteUSD * dolar;                   // H16
    var seguro = seguroUSD * dolar;                 // H17
    var vmld = vmcv + frete + seguro;               // H18

    var ii = vmld * fracao(cls.ii, 'II');           // H19
    var ipi = (vmld + ii) * fracao(cls.ipi, 'IPI'); // H20
    var pis = vmld * fracao(cls.pis, 'PIS');        // H21
    var cofins = vmld * fracao(cls.cofins, 'COFINS'); // H22
    var subtotal = vmld + ii + ipi + pis + cofins;  // H23 / H25

    var porFora = valorTotalUSD * fora * dolar;     // H26 = G13*C26*C16

    // Despesas nacionais (F3:G8)
    var dn = config.despesasNacionais || {};
    var afrmm = nonNeg(dn.afrmmFatorUSD, 'AFRMM') * dolar;   // G3 = 800*0.25*C16
    var despesasNacionais = afrmm + nonNeg(dn.transporteNacional, 'transporte nacional')
      + nonNeg(dn.armazenagemDestino, 'armazenagem destino') + nonNeg(dn.armazenagemZonaSecundaria, 'armazenagem zona secundária')
      + nonNeg(dn.despachante, 'despachante') + nonNeg(dn.despesasExtras, 'despesas extras'); // G9

    // Entreposto aduaneiro (I3:J10)
    var ep = config.entreposto || {};
    var periodos = Math.ceil(nonNeg(ep.dias, 'dias de entreposto') / 10);            // CEILING(J3,10)/10
    var armazenagemEntreposto = periodos * fracao(ep.taxaArmazenagemPor10Dias, 'taxa de armazenagem') * vmld; // J4
    var entreposto = armazenagemEntreposto + nonNeg(ep.movimentacao, 'movimentação') + nonNeg(ep.pesagem, 'pesagem')
      + nonNeg(ep.desunitizacao, 'desunitização') + nonNeg(ep.certificados, 'certificados')
      + nonNeg(ep.reportagemFotografica, 'reportagem fotográfica'); // J10

    var custoChaoFabrica = subtotal + porFora + despesasNacionais + entreposto; // C29

    return checarFinito({
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
      custoM2: custoChaoFabrica / qtd,     // C30
      creditoPisM2: pis / qtd,             // C31
      creditoCofinsM2: cofins / qtd        // C32
    });
  }

  /* -------------------------------------------------------------------
   * Calculadora Chapa!B14 — taxa do cartão
   * ----------------------------------------------------------------- */
  function taxaCartao(config, inputs) {
    if (inputs.pagamento !== 'Parcelado') return 0;
    var parcelas = inteiro(inputs.parcelas, 'número de parcelas', 1, 12);
    var mdr = config.cartao && config.cartao.mdr;
    if (!has(mdr, inputs.bandeira)) throw new Error('Bandeira desconhecida: ' + inputs.bandeira);
    var faixas = mdr[inputs.bandeira];
    if (!Array.isArray(faixas) || faixas.length !== 3) throw new Error('Tabela MDR inválida para ' + inputs.bandeira);
    var idx = parcelas === 1 ? 0 : (parcelas <= 5 ? 1 : 2);
    return fracao(faixas[idx], 'MDR') + fracao(config.cartao.antecipacaoBase, 'antecipação') + fracao(config.cartao.porParcela, 'por parcela') * parcelas;
  }

  /* -------------------------------------------------------------------
   * Aba "Calculadora Chapa"
   * ----------------------------------------------------------------- */
  function calcular(config, inputs) {
    if (!isObj(config)) throw new Error('Configuração inválida.');
    if (!isObj(inputs)) throw new Error('Entradas inválidas.');
    var produto = findProduto(config, inputs.produto);
    if (!produto) throw new Error('Produto não encontrado: ' + inputs.produto);
    var imp = custoImportacao(config, produto);

    var precoBase = nonNeg(inputs.precoBase, 'preço base');   // B7
    var qtd = positivo(inputs.quantidade, 'quantidade');      // B8
    var perda = nonNeg(inputs.perda, 'perda');                // B6 (fração)
    var frete = nonNeg(inputs.frete, 'frete');                // B9
    var uf = inputs.uf;
    var contribuinte = !!inputs.contribuinte;                 // B4
    var isMG = uf === 'MG';

    var qtdComPerda = qtd * (1 + perda);            // E2
    var taxa = taxaCartao(config, inputs);          // B14
    var precoComTaxa = (precoBase * qtd + frete) * (1 + taxa); // B15

    if (!has(config.difal, uf)) throw new Error('UF desconhecida: ' + uf);
    var ufInfo = config.difal[uf];
    if (!Array.isArray(ufInfo) || ufInfo.length !== 2) throw new Error('Tabela DIFAL inválida para ' + uf);
    var difalPct = contribuinte ? 0 : fracao(ufInfo[1], 'DIFAL ' + uf);   // B16
    var difal = precoComTaxa * difalPct;            // B17
    var precoFinal = precoComTaxa + difal;          // B18

    var s = config.saida || {};
    var custoSemImposto = qtdComPerda * imp.custoM2;              // F11
    var icmsAliq = isMG ? fracao(s.icmsEfetivoMG, 'ICMS MG') : fracao(s.icmsEfetivoForaMG, 'ICMS fora MG');
    var icmsNominal = isMG ? fracao(s.icmsNominalMG, 'ICMS nominal MG') : fracao(s.icmsNominalForaMG, 'ICMS nominal fora MG');
    var icms = (precoComTaxa - frete) * icmsAliq;                 // F15
    var basePisCofins = precoComTaxa - frete - icms;
    var pis = basePisCofins * fracao(s.pis, 'PIS') - qtd * imp.creditoPisM2;         // F13 (corrigido)
    var cofins = basePisCofins * fracao(s.cofins, 'COFINS') - qtd * imp.creditoCofinsM2; // F14
    var valorTaxaCartao = precoComTaxa - precoBase * qtd - frete; // F19
    var custoTotal = difal + icms + cofins + pis + custoSemImposto + frete + valorTaxaCartao; // F20
    var lucro = precoFinal - custoTotal;                          // F21
    var markup = custoSemImposto > 0 ? lucro / custoSemImposto : 0; // F7

    var precoVendaM2 = precoFinal / qtd;                          // F6

    return checarFinito({
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
      custoMateriaPrimaM2: custoSemImposto / qtd,   // F5
      precoVendaM2: precoVendaM2,                   // F6
      markup: markup,
      // Bloco E11:F21
      qtdComPerda: qtdComPerda,
      custoSemImposto: custoSemImposto,
      pis: pis,
      cofins: cofins,
      icmsAliqEfetiva: icmsAliq,
      icmsAliqNominal: icmsNominal,                 // F16
      icms: icms,
      frete: frete,
      valorTaxaCartao: valorTaxaCartao,
      custoTotal: custoTotal,
      lucro: lucro,
      // Notas (E24:E27)
      notas: notas({ contribuinte: contribuinte, isMG: isMG, precoVendaM2: precoVendaM2,
        temPerda: perda > 0, temFrete: frete > 0, difal: difal, icmsNominal: icmsNominal })
    });
  }

  /* -------------------------------------------------------------------
   * Calculadora 2 — REVENDA DE IMPORTADO comprado no Brasil
   * Empresa (lucro real, em config.revenda.empresaUF) compra de fornecedor
   * com IE (NF com ICMS por dentro + IPI destacado) e vende para cliente,
   * normalmente NÃO contribuinte em outra UF.
   * Segue o memorial da contadora:
   *   crédito ICMS na compra = valor produtos × alíquota da compra (4% importado)
   *   débito ICMS na venda   = base venda × interestadual (4%)  [interna se mesma UF]
   *   ICMS interno devido    = débito − crédito            (à UF da empresa)
   *   DIFAL                  = base venda × (interna UF cliente − interestadual)
   *   FCP                    = base venda × FCP da UF cliente   (à UF do cliente)
   *   PIS/COFINS não cumulativo: crédito na compra (base sem ICMS), débito na venda (base sem ICMS)
   * ----------------------------------------------------------------- */
  function calcularRevenda(config, inputs) {
    if (!isObj(config)) throw new Error('Configuração inválida.');
    if (!isObj(inputs)) throw new Error('Entradas inválidas.');
    var rv = config.revenda || {};
    var s = config.saida || {};
    var empresaUF = rv.empresaUF || 'MG';

    // --- Compra ---
    var fornecedorUF = inputs.fornecedorUF;
    if (!has(config.difal, fornecedorUF)) throw new Error('UF do fornecedor desconhecida: ' + fornecedorUF);
    var precoCompra = nonNeg(inputs.precoCompra, 'preço de compra');       // R$/m², valor dos produtos na NF (ICMS por dentro)
    var qtd = positivo(inputs.quantidade, 'quantidade');
    var perda = nonNeg(inputs.perda, 'perda');
    var qtdComPerda = qtd * (1 + perda);
    var icmsCompraAliq = fracao(inputs.icmsCompra, 'ICMS da compra');
    var ipiAliq = fracao(inputs.ipi, 'IPI');
    var ipiCredito = inputs.ipiCredito === undefined ? !!rv.ipiCredito : !!inputs.ipiCredito;

    var compraProdutos = precoCompra * qtdComPerda;          // valor dos produtos (ICMS incluso)
    var ipiCompra = compraProdutos * ipiAliq;                 // IPI destacado por fora
    var totalNFCompra = compraProdutos + ipiCompra;           // desembolso ao fornecedor
    var creditoICMS = compraProdutos * icmsCompraAliq;
    var creditoIPI = ipiCredito ? ipiCompra : 0;
    // PIS/COFINS: base = produtos − ICMS; IPI não recuperável integra o custo e entra na base
    var basePisCofinsCompra = compraProdutos - creditoICMS + (ipiCredito ? 0 : ipiCompra);
    var creditoPIS = basePisCofinsCompra * fracao(s.pis, 'PIS');
    var creditoCOFINS = basePisCofinsCompra * fracao(s.cofins, 'COFINS');
    var custoLiquidoCompra = totalNFCompra - creditoICMS - creditoIPI - creditoPIS - creditoCOFINS;

    // --- Venda ---
    var clienteUF = inputs.clienteUF;
    if (!has(config.difal, clienteUF)) throw new Error('UF do cliente desconhecida: ' + clienteUF);
    var ufInfo = config.difal[clienteUF];
    if (!Array.isArray(ufInfo) || ufInfo.length !== 2) throw new Error('Tabela DIFAL inválida para ' + clienteUF);
    var contribuinte = !!inputs.contribuinte;
    var precoVenda = nonNeg(inputs.precoVenda, 'preço de venda');
    var frete = nonNeg(inputs.frete, 'frete');
    var taxa = taxaCartao(config, inputs);
    var precoComTaxa = (precoVenda * qtd + frete) * (1 + taxa);
    var baseVenda = precoComTaxa - frete;                      // frete fora da base, como na calc 1
    var valorTaxaCartao = precoComTaxa - precoVenda * qtd - frete;

    var vendaInterna = clienteUF === empresaUF;
    var interestadual = fracao(config.interestadual, 'interestadual');
    var icmsVendaAliq = vendaInterna ? fracao(config.difal[empresaUF][0], 'ICMS interna ' + empresaUF) : interestadual;
    var icmsDebito = baseVenda * icmsVendaAliq;
    var icmsInternoDevido = icmsDebito - creditoICMS;          // pode ficar negativo (saldo credor)

    var difalPct = (!contribuinte && !vendaInterna) ? Math.max(0, fracao(ufInfo[0], 'interna ' + clienteUF) - interestadual) : 0;
    var difal = baseVenda * difalPct;
    var fcpPct = (!contribuinte && !vendaInterna && rv.fcp && has(rv.fcp, clienteUF)) ? fracao(rv.fcp[clienteUF], 'FCP ' + clienteUF) : 0;
    var fcp = baseVenda * fcpPct;
    var icmsTotal = icmsInternoDevido + difal + fcp;

    var basePisCofinsVenda = baseVenda - icmsDebito;
    var pisVenda = basePisCofinsVenda * fracao(s.pis, 'PIS');
    var cofinsVenda = basePisCofinsVenda * fracao(s.cofins, 'COFINS');
    var pisDevido = pisVenda - creditoPIS;
    var cofinsDevido = cofinsVenda - creditoCOFINS;

    // IPI na venda (indústria): destacado por fora e repassado ao cliente; débito abate o crédito da compra
    var ipiVendaAliq = fracao(inputs.ipiVenda === undefined ? 0 : inputs.ipiVenda, 'IPI na venda');
    var ipiVenda = baseVenda * ipiVendaAliq;
    var ipiDevido = ipiVenda - creditoIPI;                     // negativo = saldo credor de IPI

    // Preço "por fora": IPI/DIFAL/FCP somados ao preço. Preço "fechado": o valor combinado já é o final e o DIFAL/FCP saem da margem.
    var difalIncluso = !!inputs.difalIncluso;
    var precoFinal = difalIncluso ? precoComTaxa + ipiVenda : precoComTaxa + ipiVenda + difal + fcp;
    var custoTotal = totalNFCompra + ipiDevido + icmsInternoDevido + difal + fcp + pisDevido + cofinsDevido + frete + valorTaxaCartao;
    var lucro = precoFinal - custoTotal;
    var markup = custoLiquidoCompra > 0 ? lucro / custoLiquidoCompra : 0;

    /* ---- DRE da operação: lucro real (regime atual) × lucro presumido ----
     * Receita bruta = tudo que o cliente paga (preço + IPI + DIFAL/FCP quando por fora).
     * Deduções = tributos sobre a venda. CMV = compra líquida dos tributos recuperáveis.
     * Despesas = frete e taxa de cartão. IRPJ/CSLL conforme o regime. */
    var tb = config.tributos || {};
    var receitaBruta = precoFinal;
    var receitaSemIPI = precoComTaxa;                          // base de PIS/COFINS presumido e da presunção de IRPJ/CSLL
    function dre(regime) {
      var presumido = regime === 'presumido';
      var pisCof = presumido ? receitaSemIPI * (fracao(tb.pisCumulativo, 'PIS cumulativo') + fracao(tb.cofinsCumulativo, 'COFINS cumulativo'))
                             : pisVenda + cofinsVenda;
      var deducoes = ipiVenda + icmsDebito + difal + fcp + pisCof;
      var receitaLiquida = receitaBruta - deducoes;
      var cmv = totalNFCompra - creditoICMS - creditoIPI - (presumido ? 0 : creditoPIS + creditoCOFINS);
      var lucroBruto = receitaLiquida - cmv;
      var despesas = frete + valorTaxaCartao;
      var lucroOperacional = lucroBruto - despesas;
      var irpjCsll = presumido
        ? receitaSemIPI * (fracao(tb.presumidoBaseIRPJ, 'base IRPJ') * fracao(tb.irpj, 'IRPJ') + fracao(tb.presumidoBaseCSLL, 'base CSLL') * fracao(tb.csll, 'CSLL'))
        : Math.max(0, lucroOperacional) * fracao(tb.irpjCsllReal, 'IRPJ/CSLL real');
      var lucroLiquido = lucroOperacional - irpjCsll;
      return { regime: regime, receitaBruta: receitaBruta, ipi: ipiVenda, icms: icmsDebito, difalFcp: difal + fcp, pisCofins: pisCof,
        deducoes: deducoes, receitaLiquida: receitaLiquida, cmv: cmv, lucroBruto: lucroBruto, frete: frete, cartao: valorTaxaCartao,
        lucroOperacional: lucroOperacional, irpjCsll: irpjCsll, lucroLiquido: lucroLiquido,
        margemLiquida: receitaBruta > 0 ? lucroLiquido / receitaBruta : 0, tributosTotais: deducoes - (creditoICMS + creditoIPI + (presumido ? 0 : creditoPIS + creditoCOFINS)) + irpjCsll };
    }
    var dreReal = dre('real'), drePresumido = dre('presumido');

    var notasR = [];
    notasR.push('Compra de ' + fornecedorUF + ' (fornecedor com IE) → venda de ' + empresaUF + ' para cliente ' +
      (contribuinte ? 'contribuinte' : 'NÃO contribuinte') + ' em ' + clienteUF + (vendaInterna ? ' (venda interna).' : '.'));
    notasR.push('Preço final por m²: ' + fmtBRL(precoFinal / qtd) + (frete > 0 ? ' + frete incluso' : ' + frete não incluso') +
      (ipiVenda > 0 ? ' + IPI incluso' : '') + (difal + fcp > 0 ? (difalIncluso ? ' (DIFAL/FCP saem da margem — preço fechado).' : ' + DIFAL/FCP somados ao preço.') : '.'));
    notasR.push('IPI: crédito ' + fmtBRL(creditoIPI) + ' na compra' + (ipiVenda > 0 ? '; débito ' + fmtBRL(ipiVenda) + ' na venda' : '') + ' → ' +
      (ipiDevido >= 0 ? fmtBRL(ipiDevido) + ' a recolher.' : 'saldo credor de ' + fmtBRL(-ipiDevido) + '.'));
    notasR.push('ICMS: crédito ' + fmtBRL(creditoICMS) + ' na compra; débito ' + fmtBRL(icmsDebito) + ' (' + Math.round(icmsVendaAliq * 1000) / 10 + '%) na venda → ' +
      (icmsInternoDevido >= 0 ? fmtBRL(icmsInternoDevido) + ' devidos a ' + empresaUF : 'saldo credor de ' + fmtBRL(-icmsInternoDevido) + ' em ' + empresaUF) + '.');
    if (difal + fcp > 0) notasR.push('DIFAL ' + fmtBRL(difal) + ' + FCP ' + fmtBRL(fcp) + ' devidos a ' + clienteUF + '.');

    return checarFinito({
      qtdComPerda: qtdComPerda,
      // compra
      compraProdutos: compraProdutos, ipiCompra: ipiCompra, totalNFCompra: totalNFCompra,
      creditoICMS: creditoICMS, creditoIPI: creditoIPI, creditoPIS: creditoPIS, creditoCOFINS: creditoCOFINS,
      custoLiquidoCompra: custoLiquidoCompra, custoLiquidoM2: custoLiquidoCompra / qtd,
      // venda
      taxaCartao: taxa, precoComTaxa: precoComTaxa, baseVenda: baseVenda, valorTaxaCartao: valorTaxaCartao,
      ipiVendaAliq: ipiVendaAliq, ipiVenda: ipiVenda, ipiDevido: ipiDevido,
      icmsVendaAliq: icmsVendaAliq, icmsDebito: icmsDebito, icmsInternoDevido: icmsInternoDevido,
      difalPct: difalPct, difal: difal, fcpPct: fcpPct, fcp: fcp, icmsTotal: icmsTotal, difalIncluso: difalIncluso,
      pisVenda: pisVenda, cofinsVenda: cofinsVenda, pisDevido: pisDevido, cofinsDevido: cofinsDevido,
      frete: frete,
      precoFinal: precoFinal, precoVendaM2: precoFinal / qtd,
      custoTotal: custoTotal, lucro: lucro, markup: markup,
      dre: { real: dreReal, presumido: drePresumido },
      notas: notasR
    });
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

  root.GM_CALC = { calcular: calcular, calcularRevenda: calcularRevenda, custoImportacao: custoImportacao, taxaCartao: taxaCartao,
    findProduto: findProduto, validarConfig: validarConfig, fmtBRL: fmtBRL, UFS: UFS };
})(typeof module !== 'undefined' ? module.exports : window);

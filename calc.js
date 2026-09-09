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

  root.GM_CALC = { calcular: calcular, custoImportacao: custoImportacao, taxaCartao: taxaCartao,
    findProduto: findProduto, validarConfig: validarConfig, fmtBRL: fmtBRL, UFS: UFS };
})(typeof module !== 'undefined' ? module.exports : window);

/* =====================================================================
 * app.js — Interface da Calculadora MaisGlass
 * - Login por senha (hash SHA-256; ver SENHA_HASH)
 * - Aba Calculadora: entradas B4:B13 → saídas B14:B18 + detalhamento
 * - Aba Configurações: tudo que na planilha fica em VL 4+4 / Produtos /
 *   Config / DIFAL, salvo em localStorage, com exportar/importar/restaurar
 * ===================================================================== */
(function () {
  'use strict';

  /* Senha padrão: "glassmais". Para trocar: aba Configurações → Senha → Gerar hash → colar aqui. */
  var SENHA_HASH = '530075e3e59e8421492e95e8e114809d8ea642dd2d1de914199df232e48c420a';
  var STORAGE_KEY = 'glassmais.config.v1';
  var SESSION_KEY = 'glassmais.auth';

  var DEF = window.GM_DEFAULTS;
  var CALC = window.GM_CALC;
  var config;   // configuração ativa (usada pela calculadora)
  var draft;    // cópia em edição na aba Configurações

  /* ---------------- utilitários ---------------- */
  function $(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function brl(v) { return CALC.fmtBRL(v); }
  function pct(v, dec) { return (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: dec === undefined ? 2 : dec, maximumFractionDigits: dec === undefined ? 2 : dec }) + '%'; }
  function numFmt(v, dec) { return v.toLocaleString('pt-BR', { minimumFractionDigits: dec === undefined ? 2 : dec, maximumFractionDigits: dec === undefined ? 2 : dec }); }
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function setPath(obj, path, val) {
    var parts = path.split('.'); var o = obj;
    for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = val;
  }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  /* SHA-256: usa Web Crypto quando disponível (contexto seguro); senão, implementação local. */
  function sha256(text) {
    var bytes = utf8Bytes(text);
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
      try {
        return crypto.subtle.digest('SHA-256', bytes).then(function (buf) { return hex(new Uint8Array(buf)); })
          .catch(function () { return hex(sha256Puro(bytes)); });
      } catch (e) { /* cai no fallback */ }
    }
    return Promise.resolve(hex(sha256Puro(bytes)));
  }
  function hex(arr) { return Array.prototype.map.call(arr, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var u = unescape(encodeURIComponent(str)), out = new Uint8Array(u.length);
    for (var i = 0; i < u.length; i++) out[i] = u.charCodeAt(i);
    return out;
  }
  function sha256Puro(msg) {
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var l = msg.length, padLen = ((l + 9 + 63) >> 6) << 6, p = new Uint8Array(padLen);
    p.set(msg); p[l] = 0x80;
    var bits = l * 8; p[padLen - 4] = (bits >>> 24) & 255; p[padLen - 3] = (bits >>> 16) & 255; p[padLen - 2] = (bits >>> 8) & 255; p[padLen - 1] = bits & 255;
    var w = new Uint32Array(64);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < padLen; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = (p[off + i*4] << 24) | (p[off + i*4+1] << 16) | (p[off + i*4+2] << 8) | p[off + i*4+3];
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
        var s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0]+a)>>>0; H[1] = (H[1]+b)>>>0; H[2] = (H[2]+c)>>>0; H[3] = (H[3]+d)>>>0; H[4] = (H[4]+e)>>>0; H[5] = (H[5]+f)>>>0; H[6] = (H[6]+g)>>>0; H[7] = (H[7]+h)>>>0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) { out[i*4] = H[i] >>> 24; out[i*4+1] = (H[i] >>> 16) & 255; out[i*4+2] = (H[i] >>> 8) & 255; out[i*4+3] = H[i] & 255; }
    return out;
  }

  /* ---------------- persistência ---------------- */
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  /* Completa chaves ausentes com o padrão (só onde o tipo bate) e devolve uma cópia. */
  function migrar(cfg) {
    if (!isObj(cfg)) throw new Error('Configuração deve ser um objeto JSON.');
    var out = clone(cfg);
    function merge(dst, src) {
      Object.keys(src).forEach(function (k) {
        if (dst[k] === undefined) dst[k] = clone(src[k]);
        else if (isObj(src[k]) && isObj(dst[k])) merge(dst[k], src[k]);
      });
    }
    merge(out, DEF.config);
    return out;
  }
  /* Migra + valida; lança Error com a lista de problemas. */
  function normalizarConfig(cfg) {
    var c = migrar(cfg);
    var erros = CALC.validarConfig(c);
    if (erros.length) throw new Error(erros.slice(0, 5).join(' ') + (erros.length > 5 ? ' (+' + (erros.length - 5) + ')' : ''));
    return c;
  }
  function carregarConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizarConfig(JSON.parse(raw));
    } catch (e) { console.warn('Config salva inválida; usando padrão.', e); }
    return clone(DEF.config);
  }
  function salvarConfig(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); return true; }
    catch (e) { console.warn('Não foi possível salvar', e); return false; }
  }

  /* ---------------- login ---------------- */
  function autenticado() { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; } }
  function entrar() {
    var senha = $('loginSenha').value;
    sha256(senha).then(function (h) {
      if (h === SENHA_HASH) {
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* ignore */ }
        mostrarApp();
      } else {
        $('loginErro').textContent = 'Senha incorreta.';
        $('loginErro').classList.remove('hidden');
      }
    }).catch(function (e) {
      $('loginErro').textContent = 'Não foi possível verificar a senha: ' + e.message;
      $('loginErro').classList.remove('hidden');
    });
  }
  function sair() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } location.reload(); }
  function mostrarApp() {
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    iniciarApp();
  }

  /* ---------------- abas ---------------- */
  var ABAS = ['home', 'calc', 'revenda', 'nacional', 'config'];
  var abaAtual = 'home';
  function mostrarAba(nome) {
    if (ABAS.indexOf(nome) < 0) nome = 'home';
    if (abaAtual === 'config' && nome !== 'config' && draft) lerCamposSimples(); // guarda o que foi digitado
    abaAtual = nome;
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === nome); });
    ABAS.forEach(function (a) { $('tab-' + a).classList.toggle('hidden', a !== nome); });
    try { sessionStorage.setItem('glassmais.aba', nome); } catch (e) { /* ignore */ }
    if (nome === 'revenda') recalcularRevenda();
    if (nome === 'config') { if (!draft) draft = clone(config); renderConfig(); }
  }

  /* ---------------- aba calculadora ---------------- */
  function preencherListas() {
    var selP = $('in-produto'); var atual = selP.value; selP.innerHTML = '';
    config.produtos.forEach(function (p) { selP.appendChild(el('option', { value: p.nome, text: p.nome })); });
    if (atual && config.produtos.some(function (p) { return p.nome === atual; })) selP.value = atual;

    var selB = $('in-bandeira'); var atualB = selB.value; selB.innerHTML = '';
    Object.keys(config.cartao.mdr).forEach(function (b) { selB.appendChild(el('option', { value: b, text: b })); });
    if (atualB && config.cartao.mdr[atualB]) selB.value = atualB;

    var selU = $('in-uf'); var atualU = selU.value; selU.innerHTML = '';
    Object.keys(config.difal).sort().forEach(function (uf) { selU.appendChild(el('option', { value: uf, text: uf })); });
    if (atualU && config.difal[atualU]) selU.value = atualU;

    // revenda
    ['r-fornecedorUF', 'r-clienteUF'].forEach(function (id) {
      var sel = $(id); var atual = sel.value; sel.innerHTML = '';
      Object.keys(config.difal).sort().forEach(function (uf) { sel.appendChild(el('option', { value: uf, text: uf })); });
      if (atual && config.difal[atual]) sel.value = atual;
    });
    var selRB = $('r-bandeira'); var atualRB = selRB.value; selRB.innerHTML = '';
    Object.keys(config.cartao.mdr).forEach(function (b) { selRB.appendChild(el('option', { value: b, text: b })); });
    if (atualRB && config.cartao.mdr[atualRB]) selRB.value = atualRB;
  }

  /* ---------------- calculadora 2: revenda ---------------- */
  function lerEntradasRevenda() {
    var pctOrZero = function (id) { return $(id).value === '' ? 0 : Number($(id).value) / 100; };
    return {
      fornecedorUF: $('r-fornecedorUF').value,
      precoCompra: $('r-precoCompra').value,
      quantidade: $('r-quantidade').value,
      perda: pctOrZero('r-perda'),
      icmsCompra: pctOrZero('r-icmsCompra'),
      ipi: pctOrZero('r-ipi'),
      ipiCredito: $('r-ipiCredito').value === 'sim',
      contribuinte: $('r-contribuinte').value === 'sim',
      clienteUF: $('r-clienteUF').value,
      precoVenda: $('r-precoVenda').value,
      ipiVenda: pctOrZero('r-ipiVenda'),
      frete: $('r-frete').value === '' ? 0 : $('r-frete').value,
      pagamento: $('r-pagamento').value,
      bandeira: $('r-bandeira').value,
      parcelas: $('r-parcelas').value
    };
  }

  function aplicarEntradasPadraoRevenda() {
    var d = DEF.inputsRevenda, rv = config.revenda || {};
    $('r-fornecedorUF').value = d.fornecedorUF;
    $('r-precoCompra').value = d.precoCompra;
    $('r-quantidade').value = d.quantidade;
    $('r-perda').value = d.perda * 100;
    $('r-icmsCompra').value = Math.round((rv.icmsCompraImportado !== undefined ? rv.icmsCompraImportado : d.icmsCompra) * 1e4) / 100;
    $('r-ipi').value = Math.round((rv.ipiCompra !== undefined ? rv.ipiCompra : d.ipi) * 1e4) / 100;
    $('r-ipiCredito').value = (rv.ipiCredito !== undefined ? rv.ipiCredito : d.ipiCredito) ? 'sim' : 'nao';
    $('r-contribuinte').value = d.contribuinte ? 'sim' : 'nao';
    $('r-clienteUF').value = d.clienteUF;
    $('r-precoVenda').value = d.precoVenda;
    $('r-ipiVenda').value = d.ipiVenda * 100;
    $('r-frete').value = d.frete;
    $('r-pagamento').value = d.pagamento;
    $('r-bandeira').value = d.bandeira;
    $('r-parcelas').value = d.parcelas;
  }

  function recalcularRevenda() {
    var inp = lerEntradasRevenda();
    var parcelado = inp.pagamento === 'Parcelado';
    $('r-bandeira').disabled = !parcelado;
    $('r-parcelas').disabled = !parcelado;
    var r;
    try { r = CALC.calcularRevenda(config, inp); }
    catch (e) { limparResultadosRevenda(e.message); return; }
    var empresaUF = (config.revenda && config.revenda.empresaUF) || 'MG';

    $('ro-precoFinal').textContent = brl(r.precoFinal);
    $('ro-precoM2').textContent = brl(r.precoVendaM2) + ' por m² · ' + numFmt(Number(inp.quantidade), 2) + ' m²';
    $('ro-creditoICMS').textContent = brl(r.creditoICMS);
    $('ro-icmsDebitoLabel').textContent = 'Débito na venda (' + pct(r.icmsVendaAliq, 1) + ')';
    $('ro-icmsDebito').textContent = brl(r.icmsDebito);
    $('ro-icmsInternoLabel').textContent = r.icmsInternoDevido >= 0 ? 'ICMS interno devido a ' + empresaUF : 'Saldo credor de ICMS em ' + empresaUF;
    $('ro-icmsInterno').textContent = brl(Math.abs(r.icmsInternoDevido));
    $('ro-difalLabel').textContent = 'DIFAL ' + (r.difalPct > 0 ? pct(r.difalPct, 1) + ' — devido a ' + inp.clienteUF : '(não se aplica)');
    $('ro-difal').textContent = brl(r.difal);
    $('ro-fcpLabel').textContent = 'FCP ' + (r.fcpPct > 0 ? pct(r.fcpPct, 1) + ' — devido a ' + inp.clienteUF : '(não se aplica)');
    $('ro-fcp').textContent = brl(r.fcp);
    $('ro-icmsTotal').textContent = brl(r.icmsTotal);

    $('ro-credPisCofins').textContent = brl(r.creditoPIS + r.creditoCOFINS);
    $('ro-debPisCofins').textContent = brl(r.pisVenda + r.cofinsVenda);
    $('ro-pisCofinsDevido').textContent = brl(r.pisDevido + r.cofinsDevido);

    $('ro-compraProdutos').textContent = brl(r.compraProdutos);
    $('ro-ipiCompra').textContent = brl(r.ipiCompra);
    $('ro-totalNF').textContent = brl(r.totalNFCompra);
    $('ro-creditos').textContent = '− ' + brl(r.creditoICMS + r.creditoIPI + r.creditoPIS + r.creditoCOFINS);
    $('ro-custoLiquido').textContent = brl(r.custoLiquidoCompra);
    $('ro-custoLiquidoM2').textContent = brl(r.custoLiquidoM2);

    $('ro-taxaCartao').textContent = pct(r.taxaCartao) + ' · ' + brl(r.valorTaxaCartao);
    $('ro-precoComTaxa').textContent = brl(r.precoComTaxa);
    $('ro-ipiVenda').textContent = brl(r.ipiVenda);
    $('ro-ipiDevidoLabel').textContent = r.ipiDevido >= 0 ? 'IPI a recolher (débito − crédito)' : 'Saldo credor de IPI';
    $('ro-ipiDevido').textContent = brl(Math.abs(r.ipiDevido));
    $('ro-difalFcp').textContent = brl(r.difal + r.fcp);
    $('ro-frete').textContent = brl(r.frete);
    $('ro-custoTotal').textContent = brl(r.custoTotal);
    $('ro-lucro').textContent = brl(r.lucro);
    $('ro-row-lucro').classList.toggle('neg', r.lucro < 0);
    $('ro-markup').textContent = pct(r.markup, 1);

    $('ro-notas').innerHTML = '';
    r.notas.forEach(function (n) { $('ro-notas').appendChild(el('p', { text: n })); });

    var impostos = r.icmsInternoDevido + r.pisDevido + r.cofinsDevido + r.ipiDevido;
    renderGraficoGenerico('rviz', r.precoFinal, r.custoTotal, r.lucro, [
      { nome: 'Mercadoria (NF do fornecedor)', sub: 'produtos + IPI, antes dos créditos', valor: r.totalNFCompra },
      { nome: 'Impostos líquidos', sub: 'ICMS ' + brl(r.icmsInternoDevido) + ' · PIS/COFINS ' + brl(r.pisDevido + r.cofinsDevido) + ' · IPI ' + brl(r.ipiDevido) + ' (já descontados os créditos)', valor: impostos },
      { nome: 'DIFAL + FCP', sub: r.difalPct + r.fcpPct > 0 ? pct(r.difalPct + r.fcpPct, 1) + ' (não contribuinte)' : 'não se aplica', valor: r.difal + r.fcp },
      { nome: 'Frete', sub: '', valor: r.frete },
      { nome: 'Taxa do cartão', sub: r.taxaCartao > 0 ? pct(r.taxaCartao) : 'à vista', valor: r.valorTaxaCartao },
      { nome: 'Lucro', sub: 'markup ' + pct(r.markup, 1) + ' sobre o custo líquido', valor: r.lucro }
    ]);
  }

  function limparResultadosRevenda(msg) {
    document.querySelectorAll('#tab-revenda .kv .v, #tab-revenda .result-hero .value').forEach(function (n) { n.textContent = '—'; });
    $('ro-precoM2').textContent = '';
    $('ro-row-lucro').classList.remove('neg');
    $('ro-notas').innerHTML = '';
    $('ro-notas').appendChild(el('p', { class: 'warn', text: 'Não foi possível calcular: ' + msg }));
    $('rviz-bar').innerHTML = ''; $('rviz-legend').innerHTML = '';
    $('rviz-sub').textContent = 'Corrija as entradas para ver a composição.';
    $('rviz-prejuizo').classList.add('hidden');
  }

  function lerEntradas() {
    return {
      contribuinte: $('in-contribuinte').value === 'sim',
      produto: $('in-produto').value,
      perda: $('in-perda').value === '' ? 0 : Number($('in-perda').value) / 100,
      precoBase: $('in-precoBase').value,
      quantidade: $('in-quantidade').value,
      frete: $('in-frete').value === '' ? 0 : $('in-frete').value,
      pagamento: $('in-pagamento').value,
      bandeira: $('in-bandeira').value,
      parcelas: $('in-parcelas').value,
      uf: $('in-uf').value
    };
  }

  function aplicarEntradasPadrao() {
    var d = DEF.inputs;
    $('in-contribuinte').value = d.contribuinte ? 'sim' : 'nao';
    $('in-produto').value = d.produto;
    $('in-perda').value = d.perda * 100;
    $('in-precoBase').value = d.precoBase;
    $('in-quantidade').value = d.quantidade;
    $('in-frete').value = d.frete;
    $('in-pagamento').value = d.pagamento;
    $('in-bandeira').value = d.bandeira;
    $('in-parcelas').value = d.parcelas;
    $('in-uf').value = d.uf;
  }

  function recalcular() {
    var inp = lerEntradas();
    var parcelado = inp.pagamento === 'Parcelado';
    $('in-bandeira').disabled = !parcelado;
    $('in-parcelas').disabled = !parcelado;
    var r;
    try { r = CALC.calcular(config, inp); }
    catch (e) { limparResultados(e.message); return; }

    $('hdrDolar').textContent = 'Dólar ' + numFmt(config.dolar, 2);
    $('out-precoFinal').textContent = brl(r.precoFinal);
    $('out-precoFinal2').textContent = brl(r.precoFinal);
    $('out-precoM2').textContent = brl(r.precoVendaM2) + ' por m² · ' + numFmt(Number(inp.quantidade), 2) + ' m²';
    $('out-produto').textContent = r.produto.nome;
    $('out-ncm').textContent = r.ncm;
    $('out-taxaCartao').textContent = pct(r.taxaCartao);
    $('out-precoComTaxa').textContent = brl(r.precoComTaxa);
    $('out-difalPct').textContent = pct(r.difalPct, 1);
    $('out-difal').textContent = brl(r.difal);
    $('out-difal2').textContent = brl(r.difal);

    $('out-custoM2').textContent = brl(r.custoMateriaPrimaM2);
    $('out-vendaM2').textContent = brl(r.precoVendaM2);
    $('out-markup').textContent = pct(r.markup, 1);
    $('out-qtdPerda').textContent = numFmt(r.qtdComPerda, 2) + ' m²';

    $('out-custoSemImposto').textContent = brl(r.custoSemImposto);
    $('out-pis').textContent = brl(r.pis);
    $('out-cofins').textContent = brl(r.cofins);
    $('out-icmsLabel').textContent = 'ICMS ' + pct(r.icmsAliqEfetiva, 1) + ' (alíquota ' + pct(r.icmsAliqNominal, 0) + ')';
    $('out-icms').textContent = brl(r.icms);
    $('out-frete').textContent = brl(r.frete);
    $('out-taxaCartaoValor').textContent = brl(r.valorTaxaCartao);
    $('out-custoTotal').textContent = brl(r.custoTotal);
    $('out-lucro').textContent = brl(r.lucro);
    $('row-lucro').classList.toggle('neg', r.lucro < 0);

    $('out-notas').innerHTML = '';
    r.notas.forEach(function (n) { $('out-notas').appendChild(el('p', { text: n })); });

    renderImportacao(r.importacao);
    renderGrafico(r);
  }

  /* Gráfico: composição do preço final (barra empilhada 100%) */
  var VIZ_CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
  function renderGrafico(r) {
    var impostos = r.pis + r.cofins + r.icms;
    renderGraficoGenerico('viz', r.precoFinal, r.custoTotal, r.lucro, [
      { nome: 'Custo do vidro', sub: 'importação + despesas, sem imposto', valor: r.custoSemImposto },
      { nome: 'Impostos', sub: 'PIS ' + brl(r.pis) + ' · COFINS ' + brl(r.cofins) + ' · ICMS ' + brl(r.icms), valor: impostos },
      { nome: 'DIFAL', sub: r.difalPct > 0 ? pct(r.difalPct, 1) + ' (não contribuinte)' : 'não se aplica', valor: r.difal },
      { nome: 'Frete', sub: '', valor: r.frete },
      { nome: 'Taxa do cartão', sub: r.taxaCartao > 0 ? pct(r.taxaCartao) : 'à vista', valor: r.valorTaxaCartao },
      { nome: 'Lucro', sub: 'markup ' + pct(r.markup, 1), valor: r.lucro }
    ]);
  }
  function renderGraficoGenerico(prefix, total, custoTotal, lucro, partes) {
    var bar = $(prefix + '-bar'), leg = $(prefix + '-legend');
    bar.innerHTML = ''; leg.innerHTML = '';
    $(prefix + '-sub').textContent = total > 0 ? 'Preço final ' + brl(total) + ' — cada faixa é a parte que cada item representa.' : 'Informe preço e quantidade para ver a composição.';
    var prejuizo = lucro < 0;
    $(prefix + '-prejuizo').classList.toggle('hidden', !prejuizo);
    if (prejuizo) $(prefix + '-prejuizo').textContent = 'Atenção: o custo total (' + brl(custoTotal) + ') supera o preço final. Prejuízo de ' + brl(-lucro) + '.';

    partes.forEach(function (p, i) {
      var frac = total > 0 && p.valor > 0 ? p.valor / total : 0;
      if (frac > 0) {
        var seg = el('div', { class: 'viz-seg', style: 'flex:' + frac + ' 1 0; background:' + VIZ_CORES[i] });
        if (frac >= 0.08) seg.textContent = Math.round(frac * 100) + '%';
        seg.addEventListener('mousemove', function (ev) { mostrarTip(ev, p.nome + ': ' + brl(p.valor) + ' (' + pct(frac, 1) + ')'); });
        seg.addEventListener('mouseleave', esconderTip);
        bar.appendChild(seg);
      }
      leg.appendChild(el('div', { class: 'item' }, [
        el('span', { class: 'sw', style: 'background:' + VIZ_CORES[i] }),
        el('span', { class: 'nm' }, [p.nome, el('small', { text: p.sub })]),
        el('span', { class: 'vl', text: brl(p.valor) }),
        el('span', { class: 'pc', text: total > 0 ? pct(p.valor / total, 1) : '—' })
      ]));
    });
  }
  var tipEl;
  function mostrarTip(ev, texto) {
    if (!tipEl) { tipEl = el('div', { class: 'viz-tip' }); document.body.appendChild(tipEl); }
    tipEl.textContent = texto; tipEl.style.left = (ev.clientX + 12) + 'px'; tipEl.style.top = (ev.clientY - 30) + 'px'; tipEl.style.display = 'block';
  }
  function esconderTip() { if (tipEl) tipEl.style.display = 'none'; }

  function limparResultados(msg) {
    document.querySelectorAll('#tab-calc .kv .v, #tab-calc .result-hero .value').forEach(function (n) {
      if (n.querySelector('#out-ncm')) { $('out-ncm').textContent = '—'; } else { n.textContent = '—'; }
    });
    $('out-precoM2').textContent = '';
    $('out-icmsLabel').textContent = 'ICMS';
    $('row-lucro').classList.remove('neg');
    $('out-notas').innerHTML = '';
    $('out-notas').appendChild(el('p', { class: 'warn', text: 'Não foi possível calcular: ' + msg }));
    $('out-importacao').innerHTML = '';
    $('viz-bar').innerHTML = ''; $('viz-legend').innerHTML = '';
    $('viz-sub').textContent = 'Corrija as entradas para ver a composição.';
    $('viz-prejuizo').classList.add('hidden');
  }

  function renderImportacao(i) {
    var linhas = [
      ['Capacidade do container', numFmt(i.capacidade, 2) + ' m²'],
      ['Valor FOB total', 'US$ ' + numFmt(i.valorTotalUSD)],
      ['VMCV (por dentro)', brl(i.vmcv)],
      ['Frete internacional', brl(i.frete)],
      ['Seguro', brl(i.seguro)],
      ['VMLD', brl(i.vmld)],
      ['II', brl(i.ii)], ['IPI', brl(i.ipi)], ['PIS', brl(i.pis)], ['COFINS', brl(i.cofins)],
      ['Subtotal (VMLD + impostos)', brl(i.subtotalImpostos)],
      ['Valor por fora', brl(i.porFora)],
      ['Despesas nacionais (inclui AFRMM ' + brl(i.afrmm) + ')', brl(i.despesasNacionais)],
      ['Entreposto aduaneiro', brl(i.entreposto)],
      ['Custo chão de fábrica (container)', brl(i.custoChaoFabrica)],
      ['Custo por m²', brl(i.custoM2)],
      ['Crédito PIS por m²', brl(i.creditoPisM2)],
      ['Crédito COFINS por m²', brl(i.creditoCofinsM2)]
    ];
    var t = el('table', {}, [el('tbody', {}, linhas.map(function (l) {
      return el('tr', {}, [el('td', { text: l[0] }), el('td', { text: l[1], style: 'text-align:right;font-weight:600' })]);
    }))]);
    $('out-importacao').innerHTML = ''; $('out-importacao').appendChild(t);
  }

  /* ---------------- aba configurações ---------------- */
  function renderConfig() {
    // campos simples data-cfg
    var selUF = $('cfg-empresaUF'); if (!selUF.options.length) CALC.UFS.forEach(function (uf) { selUF.appendChild(el('option', { value: uf, text: uf })); });
    document.querySelectorAll('[data-cfg]').forEach(function (inp) {
      var v = getPath(draft, inp.getAttribute('data-cfg'));
      var t = inp.getAttribute('data-type');
      if (t === 'pct') inp.value = Math.round(v * 1e6) / 1e4; // fração → %
      else if (t === 'bool') inp.value = v ? '1' : '0';
      else inp.value = v;
    });
    atualizarFora();
    renderClasses();
    renderProdutos();
    renderMdr();
    renderDifal();
    renderFcp();
  }
  function renderFcp() {
    var fcp = draft.revenda.fcp;
    var tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, ['UF', 'FCP %'].map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', {}, Object.keys(fcp).sort().map(function (uf) {
        return el('tr', {}, [el('td', { text: uf }),
          inputCell(Math.round(fcp[uf] * 1e6) / 1e4, function (v) { fcp[uf] = (v === '' ? NaN : Number(v)) / 100; }, { step: '0.5' })]);
      }))
    ]);
    $('cfg-fcp').innerHTML = ''; $('cfg-fcp').appendChild(tbl);
  }
  function atualizarFora() { $('cfg-fora').value = Math.round((1 - draft.dentro) * 1e4) / 100; }

  function lerCamposSimples() {
    document.querySelectorAll('[data-cfg]').forEach(function (inp) {
      var t = inp.getAttribute('data-type'), v;
      if (t === 'text') v = inp.value;
      else if (t === 'bool') v = inp.value === '1';
      else { v = inp.value === '' ? NaN : Number(inp.value); if (t === 'pct') v = v / 100; }
      setPath(draft, inp.getAttribute('data-cfg'), v);
    });
  }

  function inputCell(value, onChange, opts) {
    opts = opts || {};
    var i = el('input', { type: opts.type || 'number', step: opts.step || 'any', value: value });
    i.addEventListener('change', function () { onChange(i.value); });
    return el('td', { class: opts.type === 'text' ? ('txt' + (opts.wide ? ' wide' : '')) : 'num' }, [i]);
  }

  function renderClasses() {
    var tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, ['Classe', 'Descrição', 'NCM', 'II %', 'IPI %', 'PIS %', 'COFINS %'].map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', {}, Object.keys(draft.classes).map(function (k) {
        var c = draft.classes[k];
        return el('tr', {}, [
          el('td', {}, [el('strong', { text: k })]),
          inputCell(c.nome, function (v) { c.nome = v; }, { type: 'text' }),
          inputCell(c.ncm, function (v) { c.ncm = v.trim(); }, { type: 'text' }),
          inputCell(c.ii * 100, function (v) { c.ii = (v === '' ? NaN : Number(v)) / 100; }),
          inputCell(c.ipi * 100, function (v) { c.ipi = (v === '' ? NaN : Number(v)) / 100; }),
          inputCell(c.pis * 100, function (v) { c.pis = (v === '' ? NaN : Number(v)) / 100; }),
          inputCell(c.cofins * 100, function (v) { c.cofins = (v === '' ? NaN : Number(v)) / 100; })
        ]);
      }))
    ]);
    $('cfg-classes').innerHTML = ''; $('cfg-classes').appendChild(tbl);
  }

  function renderProdutos() {
    var classes = Object.keys(draft.classes);
    var tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, ['Produto', 'Custo US$/m²', 'm²/container', 'Classe', ''].map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', {}, draft.produtos.map(function (p, idx) {
        var sel = el('select', {}, classes.map(function (k) { return el('option', { value: k, text: k }); }));
        sel.value = p.classe;
        sel.addEventListener('change', function () { p.classe = sel.value; });
        var rm = el('button', { class: 'btn small danger', text: 'Remover', onclick: function () { draft.produtos.splice(idx, 1); renderProdutos(); } });
        return el('tr', {}, [
          inputCell(p.nome, function (v) { p.nome = v.trim(); }, { type: 'text', wide: true }),
          inputCell(p.custo, function (v) { p.custo = v === '' ? NaN : Number(v); }, { step: '0.01' }),
          inputCell(p.capacidade, function (v) { p.capacidade = v === '' ? NaN : Number(v); }, { step: '0.5' }),
          el('td', {}, [sel]),
          el('td', {}, [rm])
        ]);
      }))
    ]);
    $('cfg-produtos').innerHTML = ''; $('cfg-produtos').appendChild(tbl);
  }

  function renderMdr() {
    var tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, ['Bandeira', 'MDR 1x %', 'MDR 2–5x %', 'MDR 6–12x %'].map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', {}, Object.keys(draft.cartao.mdr).map(function (b) {
        var f = draft.cartao.mdr[b];
        return el('tr', {}, [el('td', { text: b })].concat([0, 1, 2].map(function (i) {
          return inputCell(Math.round(f[i] * 1e6) / 1e4, function (v) { f[i] = (v === '' ? NaN : Number(v)) / 100; }, { step: '0.01' });
        })));
      }))
    ]);
    $('cfg-mdr').innerHTML = ''; $('cfg-mdr').appendChild(tbl);
  }

  function renderDifal() {
    var tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, ['UF', 'Alíquota interna %', 'DIFAL %'].map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', {}, Object.keys(draft.difal).sort().map(function (uf) {
        var d = draft.difal[uf];
        return el('tr', {}, [
          el('td', { text: uf }),
          inputCell(Math.round(d[0] * 1e6) / 1e4, function (v) { d[0] = (v === '' ? NaN : Number(v)) / 100; }, { step: '0.5' }),
          inputCell(Math.round(d[1] * 1e6) / 1e4, function (v) { d[1] = (v === '' ? NaN : Number(v)) / 100; }, { step: '0.5' })
        ]);
      }))
    ]);
    $('cfg-difal').innerHTML = ''; $('cfg-difal').appendChild(tbl);
  }

  function validarDraft() {
    var erros = CALC.validarConfig(draft);
    return erros.length ? erros.slice(0, 4).join(' ') + (erros.length > 4 ? ' (+' + (erros.length - 4) + ' problemas)' : '') : null;
  }

  function status(msg, cls) { var s = $('cfgStatus'); s.textContent = msg; s.className = 'status ' + (cls || ''); }

  function salvar() {
    lerCamposSimples();
    var erro = validarDraft();
    if (erro) { status(erro, 'err'); return; }
    config = clone(draft);
    draft = clone(config);
    status(salvarConfig(config) ? 'Configurações salvas.' : 'Salvo só nesta sessão (navegador sem armazenamento).', 'ok');
    preencherListas();
    recalcular();
    recalcularRevenda();
  }

  function autoSalvar() {
    if (!draft) return;
    lerCamposSimples();
    var erro = validarDraft();
    if (erro) { status('Não salvo — ' + erro, 'err'); return; }
    config = clone(draft);
    var ok = salvarConfig(config);
    preencherListas();
    recalcular();
    recalcularRevenda();
    var hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    status(ok ? 'Salvo automaticamente às ' + hora + '.' : 'Aplicado só nesta sessão (navegador sem armazenamento).', 'ok');
  }

  function exportar() {
    lerCamposSimples();
    var erro = validarDraft();
    if (erro) { status('Corrija antes de exportar: ' + erro, 'err'); return; }
    var blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'maisglass-config.json' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function importar(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var candidato;
      try { candidato = normalizarConfig(JSON.parse(fr.result)); }
      catch (e) { status('Arquivo inválido: ' + e.message, 'err'); return; }
      draft = candidato;
      renderConfig();
      status('Arquivo carregado. Clique em "Salvar configurações" para aplicar.', 'ok');
    };
    fr.readAsText(file);
  }

  function restaurar() {
    if (!confirm('Restaurar todos os valores padrão da planilha? As alterações salvas serão perdidas.')) return;
    draft = clone(DEF.config);
    renderConfig();
    salvar();
    status('Padrão restaurado.', 'ok');
  }

  /* ---------------- inicialização ---------------- */
  var iniciado = false;
  function iniciarApp() {
    if (iniciado) return; iniciado = true;
    config = carregarConfig();
    preencherListas();
    aplicarEntradasPadrao();
    recalcular();

    aplicarEntradasPadraoRevenda();
    recalcularRevenda();
    document.querySelectorAll('#tab-calc input, #tab-calc select').forEach(function (i) {
      i.addEventListener('input', recalcular); i.addEventListener('change', recalcular);
    });
    document.querySelectorAll('#tab-revenda input, #tab-revenda select').forEach(function (i) {
      i.addEventListener('input', recalcularRevenda); i.addEventListener('change', recalcularRevenda);
    });
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.addEventListener('click', function () { mostrarAba(b.getAttribute('data-tab')); }); });
    document.querySelectorAll('.home-card').forEach(function (c) { c.addEventListener('click', function () { mostrarAba(c.getAttribute('data-go')); }); });
    var abaSalva = null; try { abaSalva = sessionStorage.getItem('glassmais.aba'); } catch (e) { /* ignore */ }
    mostrarAba(abaSalva || 'home');
    $('logoutBtn').addEventListener('click', sair);

    $('cfgSalvar').addEventListener('click', salvar);
    // Salvamento automático: qualquer alteração na aba Configurações valida e salva sozinha.
    var autoTimer = null;
    function agendarAutoSalvar() { clearTimeout(autoTimer); autoTimer = setTimeout(autoSalvar, 500); }
    $('tab-config').addEventListener('input', agendarAutoSalvar);
    $('tab-config').addEventListener('change', agendarAutoSalvar);
    $('cfgExportar').addEventListener('click', exportar);
    $('cfgImportar').addEventListener('click', function () { $('cfgArquivo').click(); });
    $('cfgArquivo').addEventListener('change', function () { if (this.files[0]) importar(this.files[0]); this.value = ''; });
    $('cfgRestaurar').addEventListener('click', restaurar);
    $('cfgAddProduto').addEventListener('click', function () {
      lerCamposSimples();
      draft.produtos.push({ nome: 'Novo produto', custo: 0, capacidade: 1000, classe: Object.keys(draft.classes)[0] });
      renderProdutos();
    });
    document.querySelector('[data-cfg="dentro"]').addEventListener('input', function () {
      draft.dentro = Math.min(1, Math.max(0, (parseFloat(this.value) || 0) / 100)); atualizarFora();
    });
    $('gerarHash').addEventListener('click', function () {
      sha256($('novaSenha').value).then(function (h) { $('hashSaida').textContent = 'SENHA_HASH = \'' + h + '\''; })
        .catch(function (e) { $('hashSaida').textContent = 'Erro ao gerar hash: ' + e.message; });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('loginBtn').addEventListener('click', entrar);
    $('loginSenha').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
    if (autenticado()) mostrarApp(); else $('loginSenha').focus();
  });
})();

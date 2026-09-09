/* =====================================================================
 * app.js — Interface da Calculadora Glass Mais
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
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function sha256(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  /* ---------------- persistência ---------------- */
  function migrar(cfg) {
    // Garante que chaves novas do padrão existam em configs antigas salvas.
    var base = clone(DEF.config);
    function merge(dst, src) {
      Object.keys(src).forEach(function (k) {
        if (dst[k] === undefined) dst[k] = src[k];
        else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') merge(dst[k], src[k]);
      });
    }
    merge(cfg, base);
    return cfg;
  }
  function carregarConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return migrar(JSON.parse(raw));
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
        $('loginErro').classList.remove('hidden');
      }
    });
  }
  function sair() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } location.reload(); }
  function mostrarApp() {
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    iniciarApp();
  }

  /* ---------------- abas ---------------- */
  function mostrarAba(nome) {
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === nome); });
    $('tab-calc').classList.toggle('hidden', nome !== 'calc');
    $('tab-config').classList.toggle('hidden', nome !== 'config');
    if (nome === 'config') { draft = clone(config); renderConfig(); }
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
  }

  function lerEntradas() {
    return {
      contribuinte: $('in-contribuinte').value === 'sim',
      produto: $('in-produto').value,
      perda: (parseFloat($('in-perda').value) || 0) / 100,
      precoBase: parseFloat($('in-precoBase').value) || 0,
      quantidade: parseFloat($('in-quantidade').value) || 0,
      frete: parseFloat($('in-frete').value) || 0,
      pagamento: $('in-pagamento').value,
      bandeira: $('in-bandeira').value,
      parcelas: parseInt($('in-parcelas').value, 10) || 1
      , uf: $('in-uf').value
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
    catch (e) { $('out-precoFinal').textContent = 'Erro'; $('out-notas').textContent = e.message; return; }

    $('hdrDolar').textContent = 'Dólar ' + numFmt(config.dolar, 2);
    $('out-precoFinal').textContent = brl(r.precoFinal);
    $('out-precoFinal2').textContent = brl(r.precoFinal);
    $('out-precoM2').textContent = brl(r.precoVendaM2) + ' por m² · ' + numFmt(inp.quantidade, 2) + ' m²';
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
    var partes = [
      { nome: 'Custo do vidro', sub: 'importação + despesas, sem imposto', valor: r.custoSemImposto },
      { nome: 'Impostos', sub: 'PIS ' + brl(r.pis) + ' · COFINS ' + brl(r.cofins) + ' · ICMS ' + brl(r.icms), valor: impostos },
      { nome: 'DIFAL', sub: r.difalPct > 0 ? pct(r.difalPct, 1) + ' (não contribuinte)' : 'não se aplica', valor: r.difal },
      { nome: 'Frete', sub: '', valor: r.frete },
      { nome: 'Taxa do cartão', sub: r.taxaCartao > 0 ? pct(r.taxaCartao) : 'à vista', valor: r.valorTaxaCartao },
      { nome: 'Lucro', sub: 'markup ' + pct(r.markup, 1), valor: r.lucro }
    ];
    var total = r.precoFinal;
    var bar = $('viz-bar'), leg = $('viz-legend');
    bar.innerHTML = ''; leg.innerHTML = '';
    $('viz-sub').textContent = total > 0 ? 'Preço final ' + brl(total) + ' — cada faixa é a parte que cada item representa.' : 'Informe preço e quantidade para ver a composição.';
    var prejuizo = r.lucro < 0;
    $('viz-prejuizo').classList.toggle('hidden', !prejuizo);
    if (prejuizo) $('viz-prejuizo').textContent = 'Atenção: o custo total (' + brl(r.custoTotal) + ') supera o preço final. Prejuízo de ' + brl(-r.lucro) + '.';

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
    document.querySelectorAll('[data-cfg]').forEach(function (inp) {
      var v = getPath(draft, inp.getAttribute('data-cfg'));
      if (inp.getAttribute('data-type') === 'pct') inp.value = Math.round(v * 1e6) / 1e4; // fração → %
      else inp.value = v;
    });
    atualizarFora();
    renderClasses();
    renderProdutos();
    renderMdr();
    renderDifal();
  }
  function atualizarFora() { $('cfg-fora').value = Math.round((1 - draft.dentro) * 1e4) / 100; }

  function lerCamposSimples() {
    document.querySelectorAll('[data-cfg]').forEach(function (inp) {
      var v = parseFloat(inp.value); if (!isFinite(v)) v = 0;
      if (inp.getAttribute('data-type') === 'pct') v = v / 100;
      setPath(draft, inp.getAttribute('data-cfg'), v);
    });
    draft.dentro = Math.min(1, Math.max(0, draft.dentro));
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
          inputCell(c.ii * 100, function (v) { c.ii = (parseFloat(v) || 0) / 100; }),
          inputCell(c.ipi * 100, function (v) { c.ipi = (parseFloat(v) || 0) / 100; }),
          inputCell(c.pis * 100, function (v) { c.pis = (parseFloat(v) || 0) / 100; }),
          inputCell(c.cofins * 100, function (v) { c.cofins = (parseFloat(v) || 0) / 100; })
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
          inputCell(p.custo, function (v) { p.custo = parseFloat(v) || 0; }, { step: '0.01' }),
          inputCell(p.capacidade, function (v) { p.capacidade = parseFloat(v) || 0; }, { step: '0.5' }),
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
          return inputCell(Math.round(f[i] * 1e6) / 1e4, function (v) { f[i] = (parseFloat(v) || 0) / 100; }, { step: '0.01' });
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
          inputCell(Math.round(d[0] * 1e6) / 1e4, function (v) { d[0] = (parseFloat(v) || 0) / 100; }, { step: '0.5' }),
          inputCell(Math.round(d[1] * 1e6) / 1e4, function (v) { d[1] = (parseFloat(v) || 0) / 100; }, { step: '0.5' })
        ]);
      }))
    ]);
    $('cfg-difal').innerHTML = ''; $('cfg-difal').appendChild(tbl);
  }

  function validarDraft() {
    var nomes = {};
    for (var i = 0; i < draft.produtos.length; i++) {
      var p = draft.produtos[i];
      if (!p.nome) return 'Produto sem nome na linha ' + (i + 1) + '.';
      if (nomes[p.nome]) return 'Produto duplicado: ' + p.nome;
      nomes[p.nome] = true;
      if (!(p.capacidade > 0)) return 'Capacidade inválida em "' + p.nome + '".';
      if (!draft.classes[p.classe]) return 'Classe inválida em "' + p.nome + '".';
    }
    if (!(draft.dolar > 0)) return 'Dólar deve ser maior que zero.';
    if (draft.produtos.length === 0) return 'Cadastre pelo menos um produto.';
    return null;
  }

  function status(msg, cls) { var s = $('cfgStatus'); s.textContent = msg; s.className = 'status ' + (cls || ''); }

  function salvar() {
    lerCamposSimples();
    var erro = validarDraft();
    if (erro) { status(erro, 'err'); return; }
    config = clone(draft);
    status(salvarConfig(config) ? 'Configurações salvas.' : 'Salvo só nesta sessão (navegador sem armazenamento).', 'ok');
    preencherListas();
    recalcular();
  }

  function exportar() {
    lerCamposSimples();
    var blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'glassmais-config.json' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function importar(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        draft = migrar(JSON.parse(fr.result));
        renderConfig();
        status('Arquivo carregado. Clique em "Salvar configurações" para aplicar.', 'ok');
      } catch (e) { status('Arquivo inválido: ' + e.message, 'err'); }
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

    document.querySelectorAll('#tab-calc input, #tab-calc select').forEach(function (i) {
      i.addEventListener('input', recalcular); i.addEventListener('change', recalcular);
    });
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.addEventListener('click', function () { mostrarAba(b.getAttribute('data-tab')); }); });
    $('logoutBtn').addEventListener('click', sair);

    $('cfgSalvar').addEventListener('click', salvar);
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
      sha256($('novaSenha').value).then(function (h) { $('hashSaida').textContent = 'SENHA_HASH = \'' + h + '\''; });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('loginBtn').addEventListener('click', entrar);
    $('loginSenha').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
    if (autenticado()) mostrarApp(); else $('loginSenha').focus();
  });
})();

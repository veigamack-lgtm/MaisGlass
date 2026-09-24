/* =====================================================================
 * test/ui.js — testes da INTERFACE do módulo Orçamentos em Node, com jsdom
 * (sem navegador). Carrega index.html e os scripts reais (defaults, calc,
 * orcamento, app), com timers controlados e confirm() programável, e
 * reproduz os ciclos dos achados 1 e 2 do parecer nº 5 (e regressões dos
 * pareceres 3/4 que dependem de timer).
 *
 * Requisito: jsdom (npm i jsdom  — ou  npm i -g jsdom).
 * Execução:  node test/ui.js     → sai com código 1 se qualquer verificação falhar.
 * ===================================================================== */
'use strict';
var fs = require('fs'), path = require('path');
var JSDOM, VirtualConsole;
try { var j = require('jsdom'); JSDOM = j.JSDOM; VirtualConsole = j.VirtualConsole; }
catch (e) { console.error('jsdom não encontrado: instale com "npm i jsdom" (ou "npm i -g jsdom") e rode de novo.'); process.exit(2); }

var RAIZ = path.join(__dirname, '..');
var HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
var SCRIPTS = ['defaults.js', 'calc.js', 'orcamento.js', 'termos.js', 'nuvem.js', 'app.js'].map(function (f) { return fs.readFileSync(path.join(RAIZ, f), 'utf8'); });
var ORC_KEY = 'glassmais.orcamentos.v1';
var servidorLocal = require('./servidor-local');
var O = require(path.join(RAIZ, 'orcamento.js')).GM_ORC;
var D = require(path.join(RAIZ, 'defaults.js')).GM_DEFAULTS;
var esperar = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
/* um "ambiente" = um servidor local (API em memória) compartilhado pelas máquinas de um cenário */
async function ambiente(opts) { return servidorLocal.iniciar(Object.assign({ env: { ADMIN_SENHA_TROCADA: '1' } }, opts || {})); }

var total = 0, falhas = [];
function ok(cond, msg, extra) { total++; if (cond) console.log('OK    ' + msg); else { falhas.push(msg); console.log('FALHA ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } }
function igual(msg, a, b) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ': ' + JSON.stringify(a) + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' ≠ esperado ' + JSON.stringify(b))); }
function aprox(msg, a, b, tol) { ok(typeof a === 'number' && Math.abs(a - b) <= (tol || 1e-9), msg + ': ' + a + (Math.abs(a - b) <= (tol || 1e-9) ? '' : ' ≠ esperado ' + b)); }

/* ---------- uma "aba": jsdom + app real + timers e diálogos controlados ---------- */
async function novaAba(amb, opts) {
  opts = opts || {};
  var vc = new VirtualConsole();
  var errosPagina = [];
  vc.on('jsdomError', function (e) { errosPagina.push(String(e && e.message || e).slice(0, 200)); });
  vc.on('error', function (m) { errosPagina.push('console.error: ' + String(m).slice(0, 200)); });
  var dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true, virtualConsole: vc });
  var w = dom.window;
  var aba = { w: w, doc: w.document, errosPagina: errosPagina, timers: [], seq: 0, confirms: [], respostas: [], setItems: 0, nuvemTimers: [], cookie: '', amb: amb, rede: true };
  // fetch "real" contra o servidor local, com cookie de sessão próprio desta máquina; aba.rede = false simula queda de conexão
  w.fetch = function (url, init) {
    init = init || {};
    if (!aba.rede) return Promise.reject(new TypeError('Failed to fetch'));
    var h = Object.assign({}, init.headers || {}); if (aba.cookie) h.Cookie = aba.cookie;
    return fetch(amb.url + url, { method: init.method || 'GET', headers: h, body: init.body }).then(function (r) {
      var sc = r.headers.get('set-cookie'); if (sc) aba.cookie = /Max-Age=0/.test(sc) ? '' : sc.split(';')[0];
      return r;
    });
  };
  // timers controlados: nada dispara sozinho; o teste chama aba.disparar(ms)
  w.setTimeout = function (fn, ms) { var id = ++aba.seq; aba.timers.push({ id: id, fn: fn, ms: ms }); return id; };
  w.clearTimeout = function (id) { aba.timers = aba.timers.filter(function (t) { return t.id !== id; }); };
  aba.pendentes = function (ms) { return aba.timers.filter(function (t) { return ms === undefined || t.ms === ms; }); };
  aba.disparar = function (ms) {
    var lote = aba.pendentes(ms);
    aba.timers = aba.timers.filter(function (t) { return lote.indexOf(t) < 0; });
    lote.forEach(function (t) { t.fn(); });
    return lote.length;
  };
  // confirm(): respostas enfileiradas (função ou booleano); padrão true
  w.confirm = function (msg) { aba.confirms.push(msg); var r = aba.respostas.length ? aba.respostas.shift() : true; return typeof r === 'function' ? r(msg) : r; };
  w.alert = function () {}; w.print = function () {}; w.scrollTo = function () {};
  var setItem = w.Storage.prototype.setItem;
  w.Storage.prototype.setItem = function (k, v) { if (k === ORC_KEY) aba.setItems++; if (aba.falharSetItem && k === ORC_KEY) throw new Error('QuotaExceededError'); return setItem.call(this, k, v); };
  if (opts.disco) w.localStorage.setItem(ORC_KEY, JSON.stringify(opts.disco));
  if (opts.sync) w.localStorage.setItem('glassmais.sync.v1', JSON.stringify(opts.sync));
  if (opts.config) w.localStorage.setItem('glassmais.config.v1', JSON.stringify(opts.config));
  // login prévio (a não ser que o teste queira ver a tela de login)
  var login = opts.login === undefined ? { email: amb.ctx.env.ADMIN_EMAIL, senha: amb.ctx.env.ADMIN_SENHA_INICIAL } : opts.login;
  if (login) { var rl = await w.fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'MaisGlass' }, body: JSON.stringify(login) }); if (rl.status !== 200) throw new Error('login de teste falhou: ' + rl.status); }
  SCRIPTS.forEach(function (src) { w.eval(src); });
  // timers da nuvem (envio com debounce, reenvio) ficam numa fila própria, disparada por aba.sync()
  w.GM_NUVEM._timers.set = function (fn, ms) { var id = ++aba.seq; aba.nuvemTimers.push({ id: id, fn: fn, ms: ms }); return id; };
  w.GM_NUVEM._timers.clear = function (id) { aba.nuvemTimers = aba.nuvemTimers.filter(function (t) { return t.id !== id; }); };
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  if (login) {   // espera o app abrir e a carga inicial da nuvem terminar
    for (var i = 0; i < 200 && !(w.GM_NUVEM.carregou() && !w.document.getElementById('app').classList.contains('hidden')); i++) await esperar(10);
    if (!w.GM_NUVEM.carregou()) throw new Error('app não carregou da nuvem (login ' + login.email + ')');
  } else { for (var j = 0; j < 100 && w.document.getElementById('loginInfo').textContent === 'Conectando…'; j++) await esperar(10); }
  /* aba.sync(): dispara os timers da nuvem e espera o envio/recebimento terminar (rede real, assíncrona) */
  aba.sync = async function () {
    for (var k = 0; k < 40; k++) {
      var lote = aba.nuvemTimers.splice(0); lote.forEach(function (t) { t.fn(); });
      await esperar(25);
      if (!aba.nuvemTimers.length && w.GM_NUVEM.pendentes() === 0) { await esperar(25); if (!aba.nuvemTimers.length) break; }
      if (!aba.rede) break;
    }
    await esperar(25);
  };
  aba.puxar = async function () { await w.GM_NUVEM.sincronizarAgora(); await esperar(25); };
  aba.syncEstado = function () { return w.GM_NUVEM._lerSync(); };
  aba.servidor = async function () { var r = await w.fetch('/api/sync', { headers: { 'X-Requested-With': 'MaisGlass' } }); return (await r.json()).orcamentos.filter(function (o) { return !o.excluidoEm; }); };
  aba.$ = function (id) { var e = w.document.getElementById(id); if (!e) throw new Error('elemento #' + id + ' não existe'); return e; };
  aba.set = function (id, valor, evento) { var e = aba.$(id); e.value = valor; e.dispatchEvent(new w.Event(evento || 'input', { bubbles: true })); if (!evento) e.dispatchEvent(new w.Event('change', { bubbles: true })); };
  aba.click = function (id) { aba.$(id).click(); };
  aba.aba = function (nome) { w.document.querySelector('nav.tabs button[data-tab="' + nome + '"]').click(); };
  aba.disco = function () { return JSON.parse(w.localStorage.getItem(ORC_KEY) || '[]'); };
  aba.escreverDisco = function (lista) { setItem.call(w.localStorage, ORC_KEY, JSON.stringify(lista)); };   // "outra aba" gravou (sem contar em setItems)
  aba.texto = function (id) { return aba.$(id).textContent; };
  aba.linhaLista = function (nome) { return Array.prototype.filter.call(w.document.querySelectorAll('#orc-tabela tbody tr'), function (tr) { return tr.textContent.indexOf(nome) >= 0; })[0] || null; };
  aba.botaoLinha = function (tr, texto) { return Array.prototype.filter.call(tr.querySelectorAll('button'), function (b) { return b.textContent === texto; })[0]; };
  aba.abrir = function (nome) { var tr = aba.linhaLista(nome); if (!tr) throw new Error('orçamento "' + nome + '" não está na lista'); aba.botaoLinha(tr, 'Abrir').click(); };
  aba.excluirDaLista = function (nome) { var tr = aba.linhaLista(nome); if (!tr) throw new Error('orçamento "' + nome + '" não está na lista'); aba.botaoLinha(tr, 'Excluir').click(); };
  aba.botaoItem = function (idx, texto) { var tr = w.document.querySelectorAll('#orc-itens table.itens tbody tr')[idx]; return aba.botaoLinha(tr, texto); };
  aba.novoOrc = function (nome, uf, destinatario) {
    aba.aba('orcamentos'); aba.click('orcNovo');
    aba.set('o-nome', nome);
    if (uf) aba.set('o-uf', uf, 'change');
    if (destinatario) aba.set('o-destinatario', destinatario, 'change');
    aba.disparar(500);
  };
  aba.orcAberto = function () { var id = w.sessionStorage.getItem('glassmais.orcAtual'); return aba.disco().filter(function (o) { return o.id === id; })[0] || null; };
  return aba;
}
function itemNacional(o, idx) { var it = o.itens[idx === undefined ? 0 : idx]; return { uf: it.inputs.clienteUF, icms: it.inputs.icmsSaida, manual: it.inputs.icmsSaidaManual, avisos: it.avisos, qtd: Number(it.inputs.quantidade) }; }

/* =====================================================================
 * Achado 1 — Carregar na calculadora → Substituir item preserva a classificação manual
 * ===================================================================== */
(async function principal() {
console.log('\n--- Parecer 5 — achado 1: carregar/substituir e a flag icmsSaidaManual');
await (async function () {
  var a = await novaAba(await ambiente());
  a.novoOrc('Cliente RJ', 'RJ', 'contribuinteRevenda');
  // item nacional com alíquota MANUAL de 10% preparado para o RJ (automática seria 12%)
  a.aba('nacional');
  a.set('n-clienteUF', 'RJ', 'change'); igual('calculadora sugere 12% para RJ', a.$('n-icmsSaida').value, '12');
  a.set('n-contribuinte', 'sim', 'change');
  a.set('n-icmsSaida', '10');
  a.click('n-addOrc');
  var o = a.orcAberto();
  igual('item entra manual 10% no RJ', itemNacional(o), { uf: 'RJ', icms: 0.1, manual: true, avisos: ['ICMS de saída 10% mantido do ajuste manual (a regra geral para RJ seria 12%) — confira.'], qtd: 1336 });

  // cabeçalho → MG: manual continua 10%, flag true (em MG o campo não se aplica; sem aviso)
  a.aba('orcamentos'); a.set('o-uf', 'MG', 'change');
  o = a.orcAberto();
  igual('orçamento em MG: 10% manual mantido', [itemNacional(o).icms, itemNacional(o).manual, itemNacional(o).avisos.length], [0.1, true, 0]);

  // Carregar → Substituir SEM alterar nada (o cenário do parecer)
  a.botaoItem(0, 'Carregar').click();
  igual('carregar: campo da alíquota mostra 10', a.$('n-icmsSaida').value, '10');
  ok(a.texto('n-addOrcInfo').indexOf('ajuste manual (10%)') >= 0, 'aviso da interface informa que o ajuste manual será mantido: ' + a.texto('n-addOrcInfo').slice(0, 90));
  ok(a.$('n-addOrc').textContent.indexOf('Substituir item') === 0, 'botão vira "Substituir item": ' + a.$('n-addOrc').textContent);
  a.click('n-addOrc');
  o = a.orcAberto();
  igual('substituir sem alterar em MG: flag continua true e 10%', [itemNacional(o).icms, itemNacional(o).manual, o.itens.length], [0.1, true, 1]);
  ok(a.texto('n-addOrcInfo').indexOf('Item substituído') === 0, 'mensagem "Item substituído"');

  // volta para o RJ: 10% manual, com aviso citando 12% (antes da correção: 12%)
  a.aba('orcamentos'); a.set('o-uf', 'RJ', 'change');
  o = a.orcAberto();
  igual('RJ de novo: 10% manual preservado (era 12% antes da correção)', [itemNacional(o).icms, itemNacional(o).manual], [0.1, true]);
  ok(itemNacional(o).avisos.some(function (x) { return x.indexOf('seria 12%') > 0; }), 'aviso cita a regra geral 12%');

  // a calculadora ficou em MG (UF do item carregado) com 10 no campo: adicionar de novo cria um item NOVO (o modo
  // "substituir" encerrou na 1ª substituição) e, criado em MG, ele é automático → 12% no RJ (regra documentada)
  a.aba('nacional'); igual('calculadora ficou na UF do item carregado (MG)', a.$('n-clienteUF').value, 'MG');
  a.click('n-addOrc');
  o = a.orcAberto(); igual('adicionar de novo cria 2º item; criado em MG → automático 12% no RJ', [o.itens.length, itemNacional(o, 1).icms, itemNacional(o, 1).manual], [2, 0.12, false]);
  // --- coincidência intermediária: manual 7% no RJ → BA (regra da BA também é 7%) → carregar/substituir → RJ
  a.set('n-clienteUF', 'RJ', 'change'); a.set('n-icmsSaida', '7'); a.click('n-addOrc');
  o = a.orcAberto(); igual('3º item manual 7% no RJ', [o.itens.length, itemNacional(o, 2).icms, itemNacional(o, 2).manual], [3, 0.07, true]);
  a.aba('orcamentos'); a.set('o-uf', 'BA', 'change');
  o = a.orcAberto(); igual('BA: 7% coincide com a regra, flag continua true, sem aviso', [itemNacional(o, 2).icms, itemNacional(o, 2).manual, itemNacional(o, 2).avisos.length], [0.07, true, 0]);
  a.botaoItem(2, 'Carregar').click(); a.click('n-addOrc');
  o = a.orcAberto(); igual('BA: carregar/substituir sem alterar mantém manual 7%', [itemNacional(o, 2).icms, itemNacional(o, 2).manual], [0.07, true]);
  a.aba('orcamentos'); a.set('o-uf', 'RJ', 'change');
  o = a.orcAberto(); igual('RJ: 7% manual preservado (era 12% antes da correção)', [itemNacional(o, 2).icms, itemNacional(o, 2).manual], [0.07, true]);
  igual('item 1 (10% manual) também preservado na mesma troca', [itemNacional(o, 0).icms, itemNacional(o, 0).manual], [0.1, true]);
  igual('item 2 (automático) segue a regra do RJ', [itemNacional(o, 1).icms, itemNacional(o, 1).manual], [0.12, false]);

  // --- alterar SÓ quantidade e frete: classificação mantida, campos novos aplicados
  a.botaoItem(0, 'Carregar').click();
  a.set('n-quantidade', '250'); a.set('n-frete', '1234');
  a.click('n-addOrc');
  o = a.orcAberto(); igual('alterar só quantidade/frete: manual 10% mantido, quantidade 250', [itemNacional(o, 0).icms, itemNacional(o, 0).manual, itemNacional(o, 0).qtd, Number(o.itens[0].inputs.frete)], [0.1, true, 250, 1234]);

  // --- mudança DELIBERADA da alíquota: 10% → 12% (igual à automática do RJ) → vira automático → BA dá 7%
  a.botaoItem(0, 'Carregar').click();
  a.set('n-icmsSaida', '12'); a.click('n-addOrc');
  o = a.orcAberto(); igual('alterou para 12% (= regra do RJ): reclassificado automático', [itemNacional(o, 0).icms, itemNacional(o, 0).manual], [0.12, false]);
  a.aba('orcamentos'); a.set('o-uf', 'BA', 'change');
  o = a.orcAberto(); igual('BA: item automático segue a regra (7%)', [itemNacional(o, 0).icms, itemNacional(o, 0).manual], [0.07, false]);
  // automático: carregar/substituir sem alterar continua automático
  a.botaoItem(0, 'Carregar').click(); a.click('n-addOrc');
  o = a.orcAberto(); igual('automático: carregar/substituir sem alterar continua automático 7%', [itemNacional(o, 0).icms, itemNacional(o, 0).manual], [0.07, false]);
  a.aba('orcamentos'); a.set('o-uf', 'RJ', 'change');
  o = a.orcAberto(); igual('RJ: automático volta a 12%', [itemNacional(o, 0).icms, itemNacional(o, 0).manual], [0.12, false]);
  // automático → carregar → alterar para 10 → vira manual
  a.botaoItem(0, 'Carregar').click(); a.set('n-icmsSaida', '10'); a.click('n-addOrc');
  o = a.orcAberto(); igual('automático alterado para 10% no RJ: vira manual', [itemNacional(o, 0).icms, itemNacional(o, 0).manual], [0.1, true]);
  a.aba('orcamentos'); a.set('o-uf', 'BA', 'change');
  o = a.orcAberto(); igual('BA: manual 10% mantido com aviso', [itemNacional(o, 0).icms, itemNacional(o, 0).manual, itemNacional(o, 0).avisos.length > 0], [0.1, true, true]);

  // --- em MG, alterar a alíquota ao substituir → automático (regra documentada: o campo não se aplica na venda interna)
  a.set('o-uf', 'MG', 'change');
  a.botaoItem(0, 'Carregar').click(); a.set('n-icmsSaida', '8'); a.click('n-addOrc');
  o = a.orcAberto(); igual('MG: alíquota alterada ao substituir → automático (campo não se aplica)', itemNacional(o, 0).manual, false);
  a.aba('orcamentos'); a.set('o-uf', 'RJ', 'change');
  o = a.orcAberto(); igual('RJ: item que virou automático em MG segue a regra (12%)', [itemNacional(o, 0).icms, itemNacional(o, 0).manual], [0.12, false]);

  // --- "Adicionar como novo item" durante a edição: item novo pela regra; o original não muda
  a.botaoItem(2, 'Carregar').click();                              // item 3: manual 7%
  var btnNovo = Array.prototype.filter.call(a.$('n-addOrcInfo').querySelectorAll('button'), function (b) { return b.textContent === 'Adicionar como novo item'; })[0];
  ok(!!btnNovo, 'botão "Adicionar como novo item" disponível'); btnNovo.click();
  a.click('n-addOrc');
  o = a.orcAberto(); igual('novo item a partir do carregado: 4 itens; novo é manual 7% pela regra (≠ 12%)', [o.itens.length, itemNacional(o, 3).icms, itemNacional(o, 3).manual], [4, 0.07, true]);
  igual('original (item 3) intacto', [itemNacional(o, 2).icms, itemNacional(o, 2).manual], [0.07, true]);

  // --- item de importação direta: nunca tem a flag
  a.aba('calc'); a.click('in-addOrc');
  o = a.orcAberto(); var imp = o.itens[4];
  igual('item de importação: sem flag', [imp.origem, imp.inputs.icmsSaidaManual], ['importacao', undefined]);
  a.aba('orcamentos'); a.botaoItem(4, 'Carregar').click(); a.click('in-addOrc');
  o = a.orcAberto(); igual('importação carregar/substituir: continua sem flag, 5 itens', [o.itens.length, o.itens[4].inputs.icmsSaidaManual], [5, undefined]);

  // --- revenda de importado: 4% em qualquer UF; manual 10% preservado no ciclo
  a.aba('revenda'); a.set('r-clienteUF', 'RJ', 'change'); igual('revenda sugere 4% para RJ', a.$('r-icmsSaida').value, '4');
  a.set('r-contribuinte', 'sim', 'change'); a.set('r-icmsSaida', '10'); a.click('r-addOrc');
  o = a.orcAberto(); igual('revenda manual 10%', [o.itens[5].inputs.icmsSaida, o.itens[5].inputs.icmsSaidaManual], [0.1, true]);
  a.aba('orcamentos'); a.set('o-uf', 'MG', 'change'); a.botaoItem(5, 'Carregar').click(); a.click('r-addOrc');
  a.aba('orcamentos'); a.set('o-uf', 'SP', 'change');
  o = a.orcAberto(); igual('revenda: MG → carregar/substituir → SP mantém 10% manual (regra 4%)', [o.itens[5].inputs.icmsSaida, o.itens[5].inputs.icmsSaidaManual, o.itens[5].avisos.some(function (x) { return x.indexOf('seria 4%') > 0; })], [0.1, true, true]);

  igual('achado 1: sem erros de página', a.errosPagina, []);
})();

/* =====================================================================
 * Achado 2 — gravação confirmada pendente × exclusão / gravações superadas
 * ===================================================================== */
console.log('\n--- Parecer 5 — achado 2: gravação adiada não ressuscita excluído nem grava superada');
async function abaComConflito() {
  // aba com A e B gravados; depois "outra aba" altera A no disco (mais novo que a versão desta aba)
  var a = await novaAba(await ambiente());
  a.novoOrc('A original', 'RJ'); a.click('orcVoltar');
  a.novoOrc('B original', 'RJ'); a.click('orcVoltar');
  var d = a.disco(); var idA = d.filter(function (o) { return o.cliente.nome === 'A original'; })[0].id;
  var futuro = new Date(Date.now() + 60000).toISOString();
  a.escreverDisco(d.map(function (o) { if (o.id === idA) { o.cliente.nome = 'A da outra aba'; o.atualizadoEm = futuro; } return o; }));
  return { a: a, idA: idA };
}
await (async function () {
  var s = await abaComConflito(), a = s.a, idA = s.idA;
  a.abrir('A original');                                             // lista em memória ainda mostra o nome que esta aba conhece
  a.set('o-nome', 'A desta aba');
  igual('autosave agendado (500 ms)', a.pendentes(500).length, 1);
  a.disparar(500);
  igual('conflito detectado: 1 confirm', a.confirms.length, 1);
  ok(/foi alterado em outra aba/.test(a.confirms[0]), 'texto do confirm: ' + a.confirms[0].slice(0, 60));
  igual('status "Confirmado — gravando…"', a.texto('orcStatus'), 'Confirmado — gravando…');
  igual('gravação adiada pendente (60 ms), disco ainda com a versão da outra aba', [a.pendentes(60).length, a.disco().filter(function (o) { return o.id === idA; })[0].cliente.nome], [1, 'A da outra aba']);
  // ANTES do timer: voltar à lista e excluir A (confirm → true)
  a.click('orcVoltar');
  igual('lista mostra A não salvo', !!a.linhaLista('A desta aba') && a.linhaLista('A desta aba').textContent.indexOf('não salvo') > 0, true);
  a.excluirDaLista('A desta aba');
  igual('após excluir: disco só com B', a.disco().map(function (o) { return o.cliente.nome; }), ['B original']);
  igual('exclusão cancelou o timer adiado', a.pendentes(60).length, 0);
  igual('lista sem A', [a.linhaLista('A desta aba'), a.linhaLista('A original'), a.linhaLista('A da outra aba')], [null, null, null]);
  ok(a.texto('orcListaStatus') === 'Orçamento excluído.', 'status da lista: ' + a.texto('orcListaStatus'));
  // por garantia: disparar qualquer timer que sobrou
  var n = a.disparar();
  igual('nenhum timer sobrou para disparar', n, 0);
  igual('disco continua só com B (A não ressuscitou)', a.disco().map(function (o) { return o.cliente.nome; }), ['B original']);
  igual('lista continua sem A', a.doc.querySelectorAll('#orc-tabela tbody tr').length, 1);
  igual('sem erros de página', a.errosPagina, []);
})();

await (async function () {
  // callback JÁ enfileirado (capturado antes do cancelamento) não pode gravar
  var s = await abaComConflito(), a = s.a, idA = s.idA;
  a.abrir('A original'); a.set('o-nome', 'A desta aba'); a.disparar(500);
  var cb = a.pendentes(60)[0].fn;                                    // simula o callback já na fila do event loop
  a.click('orcVoltar'); a.excluirDaLista('A desta aba');
  igual('excluído: disco só com B', a.disco().map(function (o) { return o.cliente.nome; }), ['B original']);
  var antes = a.setItems; cb();
  igual('callback superado executado à força: não gravou nada', [a.setItems - antes, a.disco().map(function (o) { return o.cliente.nome; })], [0, ['B original']]);
  igual('sem erros de página', a.errosPagina, []);
})();

await (async function () {
  // duas gravações pendentes do mesmo id: só a última vale, e a superada não grava mesmo se executada
  var s = await abaComConflito(), a = s.a, idA = s.idA;
  a.abrir('A original'); a.set('o-nome', 'A v1'); a.disparar(500);
  igual('1ª confirmação', a.confirms.length, 1);
  var cb1 = a.pendentes(60)[0].fn;
  a.set('o-nome', 'A v2'); a.disparar(500);
  igual('2ª confirmação (o conflito ainda não foi resolvido no disco)', a.confirms.length, 2);
  igual('só UMA gravação adiada pendente (a anterior foi cancelada)', a.pendentes(60).length, 1);
  var antes = a.setItems; cb1();
  igual('callback da 1ª (superada) executado à força: não grava', a.setItems - antes, 0);
  a.disparar(60);
  var A = a.disco().filter(function (o) { return o.id === idA; })[0];
  igual('após disparar: disco tem a versão mais recente (A v2), uma gravação', [A.cliente.nome, a.setItems - antes], ['A v2', 1]);
  ok(/^Salvo às .*sobrescreveu a versão da outra aba/.test(a.texto('orcStatus')), 'status final: ' + a.texto('orcStatus'));
  igual('nenhum "não salvo" na lista', (function () { a.click('orcVoltar'); return a.doc.querySelectorAll('#orc-tabela .tag').length && a.texto('orc-tabela').indexOf('não salvo'); })(), -1);
  igual('sem erros de página', a.errosPagina, []);
})();

await (async function () {
  // excluído em OUTRA aba enquanto o diálogo estava aberto: a decisão valia para a versão vista → pergunta de novo
  var s = await abaComConflito(), a = s.a, idA = s.idA;
  a.abrir('A original'); a.set('o-nome', 'A desta aba'); a.disparar(500);
  a.escreverDisco(a.disco().filter(function (o) { return o.id !== idA; }));      // outra aba excluiu A
  a.respostas.push(false);
  a.disparar(60);
  igual('2º confirm pergunta sobre a exclusão em outra aba', [a.confirms.length, /excluído em outra aba enquanto você confirmava/.test(a.confirms[1])], [2, true]);
  igual('recusou: disco continua sem A', a.disco().some(function (o) { return o.id === idA; }), false);
  ok(/^Não salvo — o orçamento foi excluído em outra aba/.test(a.texto('orcStatus')), 'status: ' + a.texto('orcStatus'));
  a.click('orcVoltar');
  ok(!!a.linhaLista('A desta aba') && a.linhaLista('A desta aba').textContent.indexOf('não salvo') > 0, 'A continua recuperável na lista, marcado "não salvo"');
  // aceitar: volta para a lista/disco
  a.abrir('A desta aba'); a.set('o-contato', 'x'); a.disparar(500);
  igual('salvar de novo (sem conflito: o orçamento não está no disco) grava direto', a.disco().filter(function (o) { return o.id === idA; }).map(function (o) { return o.cliente.contato; }), ['x']);
  igual('sem erros de página', a.errosPagina, []);
})();

await (async function () {
  // regressão do parecer nº 4: B alterado por outra aba DURANTE o diálogo é preservado; A desta aba gravado
  var s = await abaComConflito(), a = s.a, idA = s.idA;
  a.abrir('A original');
  a.respostas.push(function () { a.escreverDisco(a.disco().map(function (o) { if (o.id !== idA) { o.cliente.nome = 'B editado durante confirmação'; o.atualizadoEm = new Date(Date.now() + 90000).toISOString(); } return o; })); return true; });
  a.set('o-nome', 'A desta aba'); a.disparar(500); a.disparar(60);
  igual('disco: B editado durante a confirmação preservado + A desta aba', a.disco().map(function (o) { return o.cliente.nome; }).sort(), ['A desta aba', 'B editado durante confirmação']);
  // outra aba altera A de novo (novo conflito) e altera MAIS UMA VEZ durante o diálogo → segunda confirmação antes de gravar
  function outraAbaAlteraA(nome, seg) { a.escreverDisco(a.disco().map(function (o) { if (o.id === idA) { o.cliente.nome = nome; o.atualizadoEm = new Date(Date.now() + seg * 1000).toISOString(); } return o; })); }
  outraAbaAlteraA('A outra aba v2', 120);
  a.respostas.push(function () { outraAbaAlteraA('A outra aba v3', 150); return true; });
  a.set('o-contato', 'c1'); a.disparar(500);
  igual('conflito de novo: confirm nº 2', a.confirms.length, 2);
  a.disparar(60);
  igual('releitura viu versão nova → confirm nº 3 antes de gravar', a.confirms.length, 3);
  igual('ainda pendente (60 ms) após a 3ª confirmação', a.pendentes(60).length, 1);
  igual('disco ainda com a v3 da outra aba', a.disco().filter(function (o) { return o.id === idA; })[0].cliente.nome, 'A outra aba v3');
  a.disparar(60);
  igual('gravado após a 3ª confirmação: versão desta aba', a.disco().filter(function (o) { return o.id === idA; }).map(function (o) { return [o.cliente.nome, o.cliente.contato]; }), [['A desta aba', 'c1']]);
  igual('nenhuma gravação pendente e nenhum confirm a mais', [a.pendentes().length, a.confirms.length], [0, 3]);
  igual('sem erros de página', a.errosPagina, []);
})();

/* =====================================================================
 * Parecer 6 — achado 1: a confirmação de recriação (A excluído em outra aba durante o diálogo) participa do
 * protocolo adiado: aceitar → volta ao event loop → relê o disco → grava sobre a lista NOVA (ou reavalia se A voltou)
 * ===================================================================== */
console.log('\n--- Parecer 6 — achado 1: recriação confirmada usa a lista relida, não a antiga');
async function abaComAExcluidoNoDialogo() {
  // A em conflito; 1ª confirmação aceita; antes do callback de 60 ms, a outra aba exclui A
  var s = await abaComConflito(), a = s.a, idA = s.idA;
  a.abrir('A original'); a.set('o-nome', 'A local'); a.disparar(500);
  igual('1ª confirmação (sobrescrever) → gravação adiada pendente', [a.confirms.length, a.pendentes(60).length], [1, 1]);
  a.escreverDisco(a.disco().filter(function (o) { return o.id !== idA; }));      // outra aba excluiu A
  return s;
}
function outraAbaAltera(a, filtro, mut, seg) { a.escreverDisco(a.disco().map(function (o) { if (filtro(o)) mut(o); o.atualizadoEm = filtro(o) ? new Date(Date.now() + seg * 1000).toISOString() : o.atualizadoEm; return o; })); }
await (async function () {
  // (a) durante a pergunta de recriação, a outra aba altera B → aceitar → B alterado preservado e A recriado
  var s = await abaComAExcluidoNoDialogo(), a = s.a, idA = s.idA;
  a.respostas.push(function (msg) { outraAbaAltera(a, function (o) { return o.id !== idA; }, function (o) { o.cliente.nome = 'B changed during recreation confirm'; }, 200); return true; });
  a.disparar(60);
  igual('2ª pergunta é a de recriação', [a.confirms.length, /excluído em outra aba enquanto você confirmava/.test(a.confirms[1])], [2, true]);
  igual('aceitar NÃO grava na hora: agenda outra gravação adiada (estado "ausente")', [a.pendentes(60).length, a.texto('orcStatus')], [1, 'Confirmado — gravando…']);
  var antes = a.setItems;
  a.disparar(60);
  igual('após a gravação adiada: A recriado E a edição de B feita durante a pergunta preservada', a.disco().map(function (o) { return o.cliente.nome; }).sort(), ['A local', 'B changed during recreation confirm']);
  igual('exatamente uma gravação, sem pergunta repetida', [a.setItems - antes, a.confirms.length, a.pendentes().length], [1, 2, 0]);
  ok(/^Salvo às .*recriado após a exclusão em outra aba/.test(a.texto('orcStatus')), 'status: ' + a.texto('orcStatus'));
  a.click('orcVoltar'); igual('nada marcado "não salvo"', a.texto('orc-tabela').indexOf('não salvo'), -1);
  igual('sem erros de página', a.errosPagina, []);
})();
await (async function () {
  // (b) durante a pergunta de recriação, a outra aba exclui B → aceitar → B continua ausente
  var s = await abaComAExcluidoNoDialogo(), a = s.a, idA = s.idA;
  a.respostas.push(function () { a.escreverDisco([]); return true; });                 // outra aba excluiu B também
  a.disparar(60); a.disparar(60);
  igual('B excluído durante a pergunta continua ausente; A recriado', a.disco().map(function (o) { return o.cliente.nome; }), ['A local']);
  igual('sem erros de página', a.errosPagina, []);
})();
await (async function () {
  // (c) durante a pergunta de recriação, a outra aba RECRIA A (versão nova) → reavaliação antes de sobrescrever
  var s = await abaComAExcluidoNoDialogo(), a = s.a, idA = s.idA;
  var recriadoPelaOutra = JSON.parse(JSON.stringify(a.disco()[0])); recriadoPelaOutra.id = idA; recriadoPelaOutra.cliente.nome = 'A recriado pela outra aba'; recriadoPelaOutra.atualizadoEm = new Date(Date.now() + 300000).toISOString();
  a.respostas.push(function () { a.escreverDisco(a.disco().concat([recriadoPelaOutra])); return true; });   // aceita a recriação; outra aba recriou A antes
  a.disparar(60);
  igual('2ª pergunta: recriação aceita → adiada', [a.confirms.length, a.pendentes(60).length], [2, 1]);
  a.respostas.push(false);
  a.disparar(60);
  igual('releitura viu A de volta com versão nova → 3ª pergunta (conflito), recusada', [a.confirms.length, /foi alterado em outra aba/.test(a.confirms[2])], [3, true]);
  igual('recusou: disco mantém o A recriado pela outra aba; nada pendente', [a.disco().filter(function (o) { return o.id === idA; })[0].cliente.nome, a.pendentes().length], ['A recriado pela outra aba', 0]);
  ok(/^Não salvo — outra aba alterou/.test(a.texto('orcStatus')), 'status: ' + a.texto('orcStatus'));
  // aceitar a 3ª pergunta em vez de recusar: sobrescreve com a versão desta aba
  a.set('o-contato', 'c'); a.disparar(500);                                               // nova tentativa → conflito (4ª pergunta, aceita) → adiada
  a.disparar(60);
  igual('aceitar o conflito: versão desta aba gravada', [a.confirms.length, a.disco().filter(function (o) { return o.id === idA; })[0].cliente.nome], [4, 'A local']);
  igual('sem erros de página', a.errosPagina, []);
})();
await (async function () {
  // (d) sem nenhuma alteração durante a pergunta: aceitar → UMA gravação, sem repetir a pergunta
  var s = await abaComAExcluidoNoDialogo(), a = s.a;
  a.disparar(60);
  var antes = a.setItems, conf = a.confirms.length;
  a.disparar(60);
  igual('uma gravação, nenhuma pergunta a mais, nada pendente', [a.setItems - antes, a.confirms.length - conf, a.pendentes().length, a.disco().map(function (o) { return o.cliente.nome; }).sort()], [1, 0, 0, ['A local', 'B original']]);
  // recusar a recriação cancela tudo (nada fica pendente)
  var s2 = await abaComAExcluidoNoDialogo(), a2 = s2.a;
  a2.respostas.push(false); a2.disparar(60);
  igual('recusar a recriação: nada pendente, disco sem A', [a2.pendentes().length, a2.disco().some(function (o) { return o.id === s2.idA; })], [0, false]);
  igual('sem erros de página', a.errosPagina.concat(a2.errosPagina), []);
})();

/* =====================================================================
 * Parecer 6 — achado 2: recusar um diálogo posterior cancela a gravação confirmada anterior do mesmo orçamento
 * ===================================================================== */
console.log('\n--- Parecer 6 — achado 2: recusa posterior cancela a gravação confirmada pendente');
await (async function () {
  var s = await abaComConflito(), a = s.a, idA = s.idA;
  a.abrir('A original'); a.set('o-nome', 'A local v1'); a.disparar(500);
  igual('1ª sobrescrita aceita → pendente', [a.confirms.length, a.pendentes(60).length], [1, 1]);
  var cb1 = a.pendentes(60)[0].fn;
  a.set('o-nome', 'A local v2');
  a.respostas.push(false);
  a.click('orcVoltar');                                                                    // conclui o autosave na hora → 2ª pergunta → recusada
  igual('2ª sobrescrita recusada', [a.confirms.length, /^Não salvo — outra aba alterou/.test(a.texto('orcStatus'))], [2, true]);
  igual('a recusa cancelou a gravação confirmada anterior (nenhum callback de 60 ms pendente)', a.pendentes(60).length, 0);
  var antes = a.setItems;
  igual('disparar todos os timers: nada grava', [a.disparar(), a.setItems - antes], [0, 0]);
  igual('disco mantém a versão da outra aba', a.disco().filter(function (o) { return o.id === idA; })[0].cliente.nome, 'A da outra aba');
  cb1();
  igual('callback da 1ª confirmação executado à força após a recusa: zero setItem, disco intacto', [a.setItems - antes, a.disco().filter(function (o) { return o.id === idA; })[0].cliente.nome], [0, 'A da outra aba']);
  ok(!!a.linhaLista('A local v2') && a.linhaLista('A local v2').textContent.indexOf('não salvo') > 0, 'A continua na lista marcado "não salvo" com a edição v2');
  igual('sem erros de página', a.errosPagina, []);
})();
await (async function () {
  // variante: a recusa acontece em outra pergunta de recriação (A sumiu) — também cancela
  var s = await abaComConflito(), a = s.a, idA = s.idA;
  a.abrir('A original'); a.set('o-nome', 'A local v1'); a.disparar(500);
  var cb1 = a.pendentes(60)[0].fn;
  a.escreverDisco(a.disco().filter(function (o) { return o.id !== idA; }));             // outra aba excluiu A
  a.set('o-nome', 'A local v2'); a.respostas.push(true); a.click('orcVoltar');           // nova tentativa: sem conflito de versão (A ausente, sem confirmadoPara) → grava direto? não: base existe e A ausente → recria (comportamento do salvar normal)
  igual('salvar normal com A ausente do disco recria sem perguntar (comportamento documentado)', [a.confirms.length, a.disco().filter(function (o) { return o.id === idA; })[0].cliente.nome], [1, 'A local v2']);
  var antes = a.setItems; cb1();
  igual('callback da 1ª confirmação (superado pela gravação direta) não grava de novo', a.setItems - antes, 0);
  igual('sem erros de página', a.errosPagina, []);
})();

/* =====================================================================
 * Achado 3 pela interface — importar JSON com data impossível é recusado
 * ===================================================================== */
console.log('\n--- Parecer 5 — achado 3 pela interface: importação com emitidoEm impossível');
await (async function () {
  var a = await novaAba(await ambiente());
  a.novoOrc('Base', 'RJ'); a.click('orcVoltar');
  var o = a.disco()[0];
  function importar(obj) {
    var f = new a.w.File([JSON.stringify(obj)], 'x.json', { type: 'application/json' });
    var input = a.$('orcArquivo');
    Object.defineProperty(input, 'files', { value: [f], configurable: true });
    input.dispatchEvent(new a.w.Event('change'));
    return new Promise(function (res) { setTimeout(res, 30); });   // FileReader do jsdom é assíncrono (timer real do Node)
  }
  var casos = [
    ['2026-02-30T12:00:00Z', false], ['2027-02-29T12:00:00Z', false], ['2028-02-29T12:00:00Z', true], ['2026-13-01T00:00:00Z', false],
    ['18/09/2026', false], ['2026-09-01T12:00:00Z', true], ['2026-09-01T12:00:00.000Z', true], ['2026-09-01T12:00:00-03:00', true]
  ];
  for (var i = 0; i < casos.length; i++) {
    var c = casos[i]; var antes = a.disco().length;
    var obj = JSON.parse(JSON.stringify(o)); obj.id = 'imp_' + (i + 1); obj.status = 'enviado'; obj.emitidoEm = c[0]; obj.enviadoEm = c[0]; obj.cliente.nome = 'Import ' + (i + 1);
    await importar(obj);
    var gravou = a.disco().length === antes + 1;
    igual('importar emitidoEm ' + c[0] + ' → ' + (c[1] ? 'aceito' : 'recusado'), gravou, c[1]);
    if (!c[1]) ok(/Arquivo inválido: Orçamento malformado: emitidoEm inválido/.test(a.texto('orcListaStatus')), 'mensagem: ' + a.texto('orcListaStatus').slice(0, 70));
    else { a.click('orcVoltar'); }
  }
  igual('sem erros de página', a.errosPagina, []);
})();

/* =====================================================================
 * Nuvem — duas "máquinas" (janelas jsdom com cookies próprios) contra o MESMO servidor local (API em memória)
 * ===================================================================== */
console.log('\n--- Nuvem: criar numa máquina, aparecer na outra');
await (async function () {
  var amb = await ambiente();
  var A = await novaAba(amb), B = await novaAba(amb);
  ok(/^Sincronizado/.test(A.texto('hdrSync')), 'cabeçalho mostra sincronizado: ' + A.texto('hdrSync'));
  igual('nome do usuário no cabeçalho', A.texto('hdrUsuario'), 'Administrador · admin');
  A.novoOrc('Cliente 1', 'RJ');
  igual('antes de enviar: 1 pendente', A.w.GM_NUVEM.pendentes(), 1);
  await A.sync();
  igual('após sync: nada pendente, versão 1 no servidor', [A.w.GM_NUVEM.pendentes(), (await A.servidor()).map(function (o) { return [o.dados.cliente.nome, o.versao]; })], [0, [['Cliente 1', 1]]]);
  igual('estado do orçamento nesta máquina: ok', A.w.GM_NUVEM.estadoDe(A.orcAberto().id), 'ok');
  ok(/Criado por Administrador/.test(A.texto('orc-autoria')) && /versão 1/.test(A.texto('orc-autoria')), 'linha de autoria: ' + A.texto('orc-autoria'));
  await B.puxar(); B.aba('orcamentos');
  ok(!!B.linhaLista('Cliente 1'), 'máquina B vê "Cliente 1" na lista após o pull');
  ok(B.linhaLista('Cliente 1').textContent.indexOf('por Administrador') > 0, 'lista da B mostra quem gravou');
  // B edita → A (na lista) recebe
  B.abrir('Cliente 1'); B.set('o-nome', 'Cliente 1 (B)'); B.disparar(500); await B.sync();
  igual('servidor: versão 2 pela B', (await A.servidor())[0].versao, 2);
  A.click('orcVoltar'); await A.puxar();
  ok(!!A.linhaLista('Cliente 1 (B)'), 'A recebeu a edição da B na lista');
  igual('versão conhecida pela A = 2', A.syncEstado().versoes[B.orcAberto().id], 2);
  // A abre; B edita de novo → A é avisada e a versão local NÃO é sobrescrita enquanto aberto
  A.abrir('Cliente 1 (B)');
  B.set('o-contato', 'contato B'); B.disparar(500); await B.sync();
  await A.puxar();
  ok(/alterado por Administrador .* em outra máquina/.test(A.texto('orcStatus')), 'A avisada: ' + A.texto('orcStatus'));
  igual('A ainda tem a versão 2 localmente (aberto não é sobrescrito)', [A.syncEstado().versoes[A.orcAberto().id], A.orcAberto().cliente.contato], [2, '']);
  igual('sem erros de página', A.errosPagina.concat(B.errosPagina), []);
  await amb.fechar();
})();

console.log('\n--- Nuvem: conflito 409 — sobrescrever, e recusar → banner com decisão');
await (async function () {
  var amb = await ambiente();
  var A = await novaAba(amb), B = await novaAba(amb);
  A.novoOrc('Conflito', 'RJ'); await A.sync();
  await B.puxar(); B.aba('orcamentos'); B.abrir('Conflito'); B.set('o-nome', 'Conflito (B)'); B.disparar(500); await B.sync();
  // A (versão velha aberta) edita → 409 → aceita sobrescrever
  A.set('o-nome', 'Conflito (A)'); A.disparar(500);
  A.respostas.push(true);
  await A.sync();
  igual('diálogo de conflito citou quem e "outra máquina"', [A.confirms.length, /alterado por Administrador .*outra máquina/.test(A.confirms[0])], [1, true]);
  igual('A sobrescreveu: servidor v3 = versão da A', (await A.servidor()).map(function (o) { return [o.dados.cliente.nome, o.versao]; }), [['Conflito (A)', 3]]);
  await B.puxar();
  ok(/alterado por Administrador/.test(B.texto('orcStatus')), 'B (com o orçamento aberto) foi avisada');
  // B agora edita → conflito → RECUSA → vira estado "conflito" visível
  B.set('o-contato', 'x'); B.disparar(500);
  B.respostas.push(false);
  await B.sync();
  igual('recusou: estado conflito, nada pendente', [B.w.GM_NUVEM.estadoDe(B.orcAberto().id), B.w.GM_NUVEM.pendentes()], ['conflito', 0]);
  ok(!B.$('orc-conflito').classList.contains('hidden') && /Conflito:/.test(B.texto('orc-conflito')), 'banner de conflito no editor: ' + B.texto('orc-conflito').slice(0, 80));
  ok(/conflito/.test(B.texto('hdrSync')), 'cabeçalho avisa conflito: ' + B.texto('hdrSync'));
  B.click('orcVoltar');
  ok(/conflito/.test(B.linhaLista('Conflito').textContent), 'badge "conflito" na lista');
  // decide: usar a versão do servidor
  B.abrir('Conflito');
  var btn = Array.prototype.filter.call(B.$('orc-conflito').querySelectorAll('button'), function (b) { return /Usar a versão do servidor/.test(b.textContent); })[0];
  btn.click(); await esperar(50);
  igual('versão do servidor carregada: nome da A, contato vazio, versão 3', [B.orcAberto().cliente.nome, B.orcAberto().cliente.contato, B.syncEstado().versoes[B.orcAberto().id]], ['Conflito (A)', '', 3]);
  igual('banner sumiu', B.$('orc-conflito').classList.contains('hidden'), true);
  // e agora a variante "enviar a minha versão"
  B.set('o-contato', 'de novo'); B.disparar(500); await B.sync();
  igual('sem conflito (versão base certa): servidor v4', (await B.servidor())[0].versao, 4);
  A.set('o-contato', 'A2'); A.disparar(500); A.respostas.push(false); await A.sync();
  igual('A em conflito', A.w.GM_NUVEM.estadoDe(A.orcAberto().id), 'conflito');
  var btn2 = Array.prototype.filter.call(A.$('orc-conflito').querySelectorAll('button'), function (b) { return /Enviar a minha versão/.test(b.textContent); })[0];
  btn2.click(); await A.sync();
  igual('A enviou a sua versão: v5 com contato A2', (await A.servidor()).map(function (o) { return [o.versao, o.dados.cliente.contato]; }), [[5, 'A2']]);
  igual('sem erros de página', A.errosPagina.concat(B.errosPagina), []);
  await amb.fechar();
})();

console.log('\n--- Nuvem: exclusão em outra máquina e recriação (410)');
await (async function () {
  var amb = await ambiente();
  var A = await novaAba(amb), B = await novaAba(amb);
  A.novoOrc('Some', 'RJ'); A.click('orcVoltar'); A.novoOrc('Fica', 'RJ'); A.click('orcVoltar'); await A.sync();
  await B.puxar(); B.aba('orcamentos');
  B.excluirDaLista('Some'); await B.sync();
  igual('servidor: só "Fica" vivo', (await A.servidor()).map(function (o) { return o.dados.cliente.nome; }), ['Fica']);
  await A.puxar();
  igual('A (na lista) perdeu "Some"', [A.linhaLista('Some'), !!A.linhaLista('Fica')], [null, true]);
  // A abre "Fica"; B exclui; A é avisada; A salva → 410 → aceita recriar
  A.abrir('Fica');
  B.excluirDaLista('Fica'); await B.sync();
  await A.puxar();
  ok(/excluído por Administrador .* em outra máquina/.test(A.texto('orcStatus')), 'A avisada da exclusão: ' + A.texto('orcStatus'));
  A.set('o-contato', 'recriado'); A.disparar(500); A.respostas.push(true); await A.sync();
  igual('diálogo de recriação', /foi excluído por Administrador .*OK = recriar/.test(A.confirms[A.confirms.length - 1].replace(/\n/g, ' ')), true);
  igual('servidor: "Fica" recriado com o contato', (await A.servidor()).map(function (o) { return [o.dados.cliente.nome, o.dados.cliente.contato]; }), [['Fica', 'recriado']]);
  await B.puxar();
  ok(!!B.linhaLista('Fica'), 'B vê "Fica" de volta');
  // variante: recusar recriar → estado "excluído em outra máquina" → remover deste computador
  B.excluirDaLista('Fica'); await B.sync();
  A.set('o-contato', 'de novo'); A.disparar(500); A.respostas.push(false); await A.sync();
  igual('estado excluido-remoto', A.w.GM_NUVEM.estadoDe(A.orcAberto().id), 'excluido-remoto');
  var btn = Array.prototype.filter.call(A.$('orc-conflito').querySelectorAll('button'), function (b) { return /Remover deste computador/.test(b.textContent); })[0];
  btn.click(); await esperar(50);
  igual('removido: lista da A vazia, editor fechado', [A.disco().length, A.$('orc-editor').classList.contains('hidden')], [0, true]);
  igual('sem erros de página', A.errosPagina.concat(B.errosPagina), []);
  await amb.fechar();
})();

console.log('\n--- Nuvem: sem conexão (fila) e sessão perdida');
await (async function () {
  var amb = await ambiente();
  var A = await novaAba(amb);
  A.rede = false;
  A.novoOrc('Offline', 'RJ'); await A.sync();
  ok(/Sem conexão/.test(A.texto('hdrSync')) && /1 alteração/.test(A.texto('hdrSync')), 'status sem conexão: ' + A.texto('hdrSync'));
  igual('fila com 1, servidor vazio', [A.w.GM_NUVEM.pendentes(), (await (async function () { A.rede = true; var r = await A.servidor(); A.rede = false; return r; })()).length], [1, 0]);
  A.set('o-contato', 'ainda offline'); A.disparar(500); await A.sync();
  igual('duas edições viram um único envio pendente', A.w.GM_NUVEM.pendentes(), 1);
  A.rede = true; await A.sync();
  igual('voltou a conexão: enviado com a última versão', (await A.servidor()).map(function (o) { return [o.dados.cliente.nome, o.dados.cliente.contato, o.versao]; }), [['Offline', 'ainda offline', 1]]);
  ok(/^Sincronizado/.test(A.texto('hdrSync')), 'status: ' + A.texto('hdrSync'));
  // sessão encerrada no servidor (ex.: senha redefinida) → tela de login com aviso; nada perdido
  await amb.ctx.repo.apagarSessoesDoUsuario(1, null);
  A.set('o-contato', 'depois'); A.disparar(500); await A.sync();
  igual('tela de login reaparece com aviso', [A.$('login').classList.contains('hidden'), /sessão expirou/.test(A.texto('loginErro'))], [false, true]);
  igual('alteração continua na fila local', A.w.GM_NUVEM.pendentes(), 1);
  igual('sem erros de página', A.errosPagina, []);
  await amb.fechar();
})();

console.log('\n--- Nuvem: migração dos orçamentos que estavam só no navegador');
await (async function () {
  var amb = await ambiente();
  var base = O.novoOrcamento(D.config, { nome: 'Antigo 1', uf: 'RJ' }); var base2 = O.novoOrcamento(D.config, { nome: 'Antigo 2', uf: 'SP' });
  var A = await novaAba(amb);
  A.novoOrc('Já na nuvem', 'RJ'); A.click('orcVoltar'); await A.sync();
  var C = await novaAba(amb, { disco: [base, base2] });          // máquina antiga: 2 orçamentos locais, sem estado de sync
  C.aba('orcamentos');
  igual('carga inicial: locais marcados "só neste computador" e o da nuvem chegou', [C.w.GM_NUVEM.locaisNaoEnviados().map(function (o) { return o.cliente.nome; }).sort(), !!C.linhaLista('Já na nuvem')], [['Antigo 1', 'Antigo 2'], true]);
  igual('badge e card de migração', [/só neste computador/.test(C.linhaLista('Antigo 1').textContent), C.$('orc-migracao').classList.contains('hidden')], [true, false]);
  C.click('orcMigrar'); await esperar(200);
  ok(/Enviados: 2 novo/.test(C.texto('orcMigracaoStatus')), 'relatório: ' + C.texto('orcMigracaoStatus'));
  igual('servidor com os 3', (await A.servidor()).map(function (o) { return o.dados.cliente.nome; }).sort(), ['Antigo 1', 'Antigo 2', 'Já na nuvem']);
  igual('card de migração some; estados ok', [C.$('orc-migracao').classList.contains('hidden'), C.w.GM_NUVEM.estadoDe(base.id)], [true, 'ok']);
  await A.puxar(); ok(!!A.linhaLista('Antigo 2'), 'A recebeu os migrados');
  // migrar de novo com um id já existente e conteúdo diferente → cópia
  var base1b = JSON.parse(JSON.stringify(base)); base1b.cliente.nome = 'Antigo 1 alterado noutro pc';
  var Dm = await novaAba(amb, { disco: [base1b] }); Dm.aba('orcamentos');
  igual('id já existente com conteúdo diferente: a cópia local ganha id novo e fica "só neste computador"; o id original recebe a do servidor',
    [Dm.w.GM_NUVEM.locaisNaoEnviados().map(function (o) { return o.cliente.nome; }), Dm.disco().filter(function (o) { return o.id === base.id; })[0].cliente.nome],
    [['Antigo 1 alterado noutro pc (cópia deste computador)'], 'Antigo 1']);
  Dm.click('orcMigrar'); await esperar(200);
  ok(/Enviados: 1 novo/.test(Dm.texto('orcMigracaoStatus')), 'relatório: ' + Dm.texto('orcMigracaoStatus'));
  igual('servidor com 4 (nada perdido)', (await A.servidor()).length, 4);
  igual('sem erros de página', A.errosPagina.concat(C.errosPagina, Dm.errosPagina), []);
  await amb.fechar();
})();

console.log('\n--- Nuvem: usuários, permissões e configuração compartilhada');
await (async function () {
  var amb = await ambiente();
  var A = await novaAba(amb);
  A.aba('usuarios');
  igual('aba Usuários visível para admin', A.doc.querySelector('nav.tabs button[data-tab="usuarios"]').classList.contains('hidden'), false);
  A.set('u-nome', 'Vendedor'); A.set('u-email', 'vend@maisglass.local'); A.click('uCriar'); await esperar(150);
  var senhaInicial = A.texto('uSenha');
  igual('usuário criado com senha inicial mostrada', [A.texto('uStatus'), senhaInicial.length], ['Usuário criado.', 12]);
  await esperar(100);
  ok(A.texto('u-tabela').indexOf('vend@maisglass.local') >= 0 && /senha inicial pendente/.test(A.texto('u-tabela')), 'tabela lista o vendedor com senha pendente');
  // vendedor entra: tela de login → troca de senha obrigatória → app
  var V = await novaAba(amb, { login: null });
  igual('tela de login', V.$('login').classList.contains('hidden'), false);
  V.set('loginEmail', 'vend@maisglass.local'); V.set('loginSenha', 'errada'); V.click('loginBtn'); await esperar(150);
  igual('senha errada: mensagem genérica', V.texto('loginErro'), 'E-mail ou senha incorretos.');
  V.set('loginSenha', senhaInicial); V.click('loginBtn'); await esperar(200);
  igual('senha inicial: pede nova senha', V.$('trocaSenhaForm').classList.contains('hidden'), false);
  V.set('novaSenha1', 'vendedor123'); V.set('novaSenha2', 'vendedor123'); V.click('trocaSenhaBtn');
  for (var i = 0; i < 100 && !V.w.GM_NUVEM.carregou(); i++) await esperar(20);
  igual('app aberto como vendedor', [V.$('app').classList.contains('hidden'), V.texto('hdrUsuario')], [false, 'Vendedor']);
  igual('aba Usuários escondida; configuração só leitura', [V.doc.querySelector('nav.tabs button[data-tab="usuarios"]').classList.contains('hidden'), V.$('cfgSomenteLeitura').classList.contains('hidden'), V.$('cfgSalvar').classList.contains('hidden'), V.doc.querySelector('[data-cfg="dolar"]').disabled], [true, false, true, true]);
  V.aba('config');
  igual('vendedor: termos da proposta e tabelas da configuração também só leitura (depois de abrir a aba)', [V.doc.querySelectorAll('#cfg-termos textarea').length, Array.prototype.every.call(V.doc.querySelectorAll('#cfg-termos textarea, #cfg-produtos input, #cfg-fcp input'), function (i) { return i.disabled; })], [18, true]);
  V.aba('home');
  // admin muda o dólar → vendedor recebe
  A.aba('config');
  var dolar = A.doc.querySelector('[data-cfg="dolar"]'); dolar.value = '6.10'; dolar.dispatchEvent(new A.w.Event('input', { bubbles: true })); A.disparar(500); await A.sync();
  igual('config no servidor com dólar 6,10', (await (async function () { var r = await A.w.fetch('/api/config', { headers: { 'X-Requested-With': 'MaisGlass' } }); return (await r.json()).dados.dolar; })()), 6.1);
  await V.puxar();
  igual('vendedor recebeu o dólar novo no cabeçalho', V.texto('hdrDolar'), 'Dólar 6,10');
  // vendedor cria orçamento (permitido) e o admin vê quem criou
  V.novoOrc('Do vendedor', 'RJ'); await V.sync();
  await A.puxar(); A.aba('orcamentos');
  ok(A.linhaLista('Do vendedor') && /por Vendedor/.test(A.linhaLista('Do vendedor').textContent), 'admin vê "por Vendedor"');
  igual('sem erros de página', A.errosPagina.concat(V.errosPagina), []);
  await amb.fechar();
})();


console.log('\n--- Nuvem: endereço antigo sem servidor → cópia de segurança → importar no novo');
await (async function () {
  var amb = await ambiente();
  var o1 = O.novoOrcamento(D.config, { nome: 'Do GitHub Pages 1', uf: 'RJ' }), o2 = O.novoOrcamento(D.config, { nome: 'Do GitHub Pages 2', uf: 'MG' });
  var cfgAntiga = JSON.parse(JSON.stringify(D.config)); cfgAntiga.dolar = 5.99;
  // "GitHub Pages": sem API (404 em HTML)
  var G = await novaAba(amb, { login: null, disco: [o1, o2], config: cfgAntiga });
  var baixado = null;
  G.w.URL.createObjectURL = function (blob) { baixado = blob; return 'blob:x'; };
  G.w.fetch = function () { return Promise.resolve(new Response('<html>404</html>', { status: 404, headers: { 'Content-Type': 'text/html' } })); };
  G.w.GM_NUVEM.sessao().catch(function () {});
  // recarrega a lógica da tela de entrada com o fetch "sem servidor"
  G.w.document.dispatchEvent(new G.w.Event('DOMContentLoaded')); await esperar(100);
  ok(/Servidor indisponível/.test(G.texto('loginErro')), 'mensagem: ' + G.texto('loginErro'));
  igual('caixa de cópia de segurança aparece', G.$('loginBackup').classList.contains('hidden'), false);
  ok(/2 orçamento\(s\) e uma configuração/.test(G.texto('loginBackupTexto')), 'texto: ' + G.texto('loginBackupTexto'));
  G.click('loginBackupBtn');
  var conteudo = JSON.parse(await baixado.text());
  igual('arquivo com os 2 orçamentos e a configuração', [conteudo.tipo, conteudo.orcamentos.length, conteudo.config.dolar], ['maisglass-backup', 2, 5.99]);
  // app novo (Vercel): importa o arquivo em Orçamentos
  var A = await novaAba(amb);
  A.aba('orcamentos');
  var f = new A.w.File([JSON.stringify(conteudo)], 'backup.json', { type: 'application/json' });
  var input = A.$('orcArquivo'); Object.defineProperty(input, 'files', { value: [f], configurable: true }); input.dispatchEvent(new A.w.Event('change'));
  await esperar(80);
  ok(/Cópia de segurança importada: 2 orçamento/.test(A.texto('orcListaStatus')), 'status: ' + A.texto('orcListaStatus'));
  await A.sync();
  igual('os dois foram para o servidor', (await A.servidor()).map(function (o) { return o.dados.cliente.nome; }).sort(), ['Do GitHub Pages 1', 'Do GitHub Pages 2']);
  // configuração do arquivo na aba Configurações (admin)
  A.aba('config');
  var fc = new A.w.File([JSON.stringify(conteudo)], 'backup.json', { type: 'application/json' });
  var ic = A.$('cfgArquivo'); Object.defineProperty(ic, 'files', { value: [fc], configurable: true }); ic.dispatchEvent(new A.w.Event('change'));
  await esperar(80);
  ok(/Arquivo carregado/.test(A.texto('cfgStatus')), 'config do backup carregada: ' + A.texto('cfgStatus'));
  A.click('cfgSalvar'); await A.sync();
  igual('dólar da configuração antiga no servidor', (await (async function () { var r = await A.w.fetch('/api/config', { headers: { 'X-Requested-With': 'MaisGlass' } }); return (await r.json()).dados.dolar; })()), 5.99);
  igual('sem erros de página', A.errosPagina, []);
  await amb.fechar();
})();

console.log('\n--- Proposta: emissão congela número, consultor e termos; emitida antes dos termos sai como foi enviada');
await (async function () {
  var amb = await ambiente();
  var a = await novaAba(amb);
  a.novoOrc('Legado RJ', 'RJ'); a.aba('calc'); a.click('in-addOrc'); a.aba('orcamentos');
  a.set('o-status', 'enviado', 'change'); a.disparar(500);
  var o = a.orcAberto();
  igual('emissão congela número (1ª revisão = id), consultor e textos', [o.numero, o.consultor.email, Array.isArray(o.textosProposta.clausulas), o.textosProposta.clausulas.length], [o.id.slice(-6).toUpperCase(), amb.ctx.env.ADMIN_EMAIL, true, 14]);
  // orçamento emitido pela versão anterior (sem textos, consultor e número), rev. 2
  var leg = JSON.parse(JSON.stringify(o)); delete leg.textosProposta; delete leg.consultor; delete leg.numero; leg.revisao = 2; leg.id = 'orc_legado00ab12';
  var amb2 = await ambiente();
  var b = await novaAba(amb2, { disco: [leg] }); b.aba('orcamentos'); b.abrir('Legado RJ');
  var t = b.texto('proposta');
  ok(t.indexOf('Proposta Comercial Nº: 00AB12-r2') >= 0, 'número no formato antigo (como foi enviado)');
  ok(t.indexOf('1) IMPOSTOS') < 0 && t.indexOf('De acordo,') < 0, 'sem cláusulas nem assinaturas (não foram enviadas)');
  ok(t.indexOf('Pagamento: à vista') >= 0 && t.indexOf('Preços com impostos inclusos') >= 0, 'condições e nota de impostos do formato antigo');
  ok(t.indexOf('antes dos termos e condições') >= 0, 'aviso na tela (some na impressão)');
  ok(b.linhaLista('Legado RJ').textContent.indexOf('00AB12-r2') >= 0, 'lista mostra o número antigo');
  b.click('orcRevisao'); b.disparar(500);
  t = b.texto('proposta');
  ok(t.indexOf('1) IMPOSTOS') >= 0 && t.indexOf('antes dos termos') < 0, 'nova revisão sai com os termos e condições');
  ok(t.indexOf('Proposta Comercial Nº: 00AB12') >= 0 && t.indexOf('Revisão: 03') >= 0, 'nova revisão mantém o número (sem o sufixo antigo) e numera a revisão');
  // importação: campos da proposta com tipo errado são recusados (o servidor faz a mesma checagem)
  var ruim = JSON.parse(JSON.stringify(o)); ruim.id = 'orc_ruim'; ruim.cliente.enderecoEntrega = 123;
  var f = new b.w.File([JSON.stringify(ruim)], 'ruim.json', { type: 'application/json' });
  b.click('orcVoltar');
  var inp = b.$('orcArquivo'); Object.defineProperty(inp, 'files', { value: [f], configurable: true }); inp.dispatchEvent(new b.w.Event('change'));
  await esperar(80);
  ok(/cliente\.enderecoEntrega deve ser texto/.test(b.texto('orcListaStatus')), 'importação recusa campo da proposta com tipo errado: ' + b.texto('orcListaStatus'));
  igual('sem erros de página', a.errosPagina.concat(b.errosPagina), []);
  await amb.fechar(); await amb2.fechar();
})();

console.log('\n--- Material cadastrado depois do orçamento (Configurações → Produtos)');
await (async function () {
  var amb = await ambiente();
  var a = await novaAba(amb);
  a.novoOrc('Material novo', 'RJ'); a.aba('calc'); a.click('in-addOrc'); a.aba('orcamentos');
  var o0 = a.orcAberto(), prod0 = o0.itens[0].inputs.produto, res0 = JSON.stringify(o0.itens[0].resultado), dolar0 = o0.configSnapshot.dolar;
  // admin cadastra um material novo e muda o dólar (o orçamento continua com o dólar congelado)
  a.aba('config'); a.click('cfgAddProduto');
  var linhas = a.doc.querySelectorAll('#cfg-produtos tbody tr'), ult = linhas[linhas.length - 1], ins = ult.querySelectorAll('input');
  function muda(inp, v) { inp.value = v; inp.dispatchEvent(new a.w.Event('change', { bubbles: true })); }
  muda(ins[0], 'Vidro Teste 10mm'); muda(ins[1], '9.5');
  var dol = a.doc.querySelector('[data-cfg="dolar"]'); dol.value = '5.9'; dol.dispatchEvent(new a.w.Event('input', { bubbles: true }));
  a.disparar(500);
  var cfgSalva = JSON.parse(a.w.localStorage.getItem('glassmais.config.v1'));
  igual('material novo e dólar novo na configuração', [cfgSalva.produtos.slice(-1)[0].nome, cfgSalva.dolar], ['Vidro Teste 10mm', 5.9]);
  igual('percentuais sem ruído de ponto flutuante ao salvar Configurações', [cfgSalva.tributos.pisCumulativo, cfgSalva.saida.pis], [0.0065, D.config.saida.pis]);
  // adicionar item com o material novo: antes dava "Produto não encontrado"
  a.aba('calc'); a.set('in-produto', 'Vidro Teste 10mm', 'change'); a.click('in-addOrc');
  var info = a.texto('in-addOrcInfo');
  ok(/Item adicionado/.test(info) && /foi incluído na configuração congelada/.test(info), 'item com material novo entra no orçamento: ' + info.slice(0, 120));
  var o1 = a.orcAberto();
  igual('snapshot ganhou só o material; dólar continua congelado', [o1.itens.length, o1.itens[1].inputs.produto, !!o1.configSnapshot.produtos.find(function (p) { return p.nome === 'Vidro Teste 10mm'; }), o1.configSnapshot.dolar], [2, 'Vidro Teste 10mm', true, dolar0]);
  igual('item existente não muda', JSON.stringify(o1.itens[0].resultado) === res0, true);
  // substituir o 1º item pelo material novo também funciona
  a.aba('orcamentos'); a.botaoItem(0, 'Carregar').click(); a.set('in-produto', 'Vidro Teste 10mm', 'change'); a.click('in-addOrc');
  ok(/Item substituído/.test(a.texto('in-addOrcInfo')), 'substituir por material novo: ' + a.texto('in-addOrcInfo').slice(0, 80));
  a.aba('orcamentos'); a.botaoItem(0, 'Carregar').click(); a.set('in-produto', prod0, 'change'); a.click('in-addOrc');   // volta ao material original
  // aviso "configuração diferente": só pelo dólar (material novo não conta)
  a.aba('orcamentos');
  ok(/diferente da congelada/.test(a.texto('oo-avisos')), 'aviso de configuração diferente por causa do dólar');
  a.aba('config'); dol = a.doc.querySelector('[data-cfg="dolar"]'); dol.value = String(dolar0); dol.dispatchEvent(new a.w.Event('input', { bubbles: true })); a.disparar(500);
  a.aba('orcamentos');
  ok(!/diferente da congelada/.test(a.texto('oo-avisos')), 'dólar igual de novo: material novo cadastrado não acende o aviso');
  // servidor aceita o orçamento com o material incluído no snapshot
  await a.sync();
  var srv = (await a.servidor()).find(function (x) { return x.dados.cliente.nome === 'Material novo'; });
  igual('servidor aceitou (2 itens, material no snapshot)', [srv.dados.itens.length, !!srv.dados.configSnapshot.produtos.find(function (p) { return p.nome === 'Vidro Teste 10mm'; }), a.w.GM_NUVEM.pendentes()], [2, true, 0]);
  // material RENOMEADO em Configurações: Recalcular não trava; mantém o cadastro congelado e avisa
  a.aba('config');
  linhas = a.doc.querySelectorAll('#cfg-produtos tbody tr');
  var alvo = Array.prototype.find.call(linhas, function (tr) { return tr.querySelector('input').value === 'Vidro Teste 10mm'; });
  muda(alvo.querySelector('input'), 'Vidro Teste 10mm (novo nome)'); a.disparar(500);
  a.aba('orcamentos'); a.confirms.length = 0; a.click('orcRecalcular');
  ok(a.confirms.length === 1 && /não existe mais em Configurações.*Vidro Teste 10mm — mantido com o cadastro congelado/.test(a.confirms[0].replace(/\n/g, ' ')), 'recalcular lista o material mantido: ' + (a.confirms[0] || '').slice(-200));
  ok(/Itens recalculados/.test(a.texto('orcStatus')) && /Material mantido/.test(a.texto('orcStatus')), 'recalcular conclui: ' + a.texto('orcStatus'));
  var o2 = a.orcAberto();
  igual('snapshot novo = configuração atual + material antigo mantido', [!!o2.configSnapshot.produtos.find(function (p) { return p.nome === 'Vidro Teste 10mm'; }), !!o2.configSnapshot.produtos.find(function (p) { return p.nome === 'Vidro Teste 10mm (novo nome)'; })], [true, true]);
  ok(!/diferente da congelada/.test(a.texto('oo-avisos')), 'depois de recalcular não fica pedindo "Recalcular" por causa do material antigo');
  // carregar o item do material renomeado avisa para escolher o material
  a.botaoItem(1, 'Carregar').click();
  ok(/não existe mais em Configurações/.test(a.texto('in-addOrcInfo')), 'carregar item com material renomeado avisa');
  igual('sem erros de página', a.errosPagina, []);
  await amb.fechar();
})();

fim();
})().catch(function (e) { console.error('ERRO NO SCRIPT:', e && e.stack || e); process.exit(1); });

function fim() {
  console.log('\n' + (falhas.length ? 'FALHAS: ' + falhas.length + ' de ' + total : 'Todos os testes de interface passaram (' + total + ' verificações).'));
  if (falhas.length) { falhas.forEach(function (f) { console.log('  - ' + f); }); process.exit(1); }
  process.exit(0);
}

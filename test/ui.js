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
var SCRIPTS = ['defaults.js', 'calc.js', 'orcamento.js', 'app.js'].map(function (f) { return fs.readFileSync(path.join(RAIZ, f), 'utf8'); });
var ORC_KEY = 'glassmais.orcamentos.v1';

var total = 0, falhas = [];
function ok(cond, msg, extra) { total++; if (cond) console.log('OK    ' + msg); else { falhas.push(msg); console.log('FALHA ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } }
function igual(msg, a, b) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ': ' + JSON.stringify(a) + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' ≠ esperado ' + JSON.stringify(b))); }
function aprox(msg, a, b, tol) { ok(typeof a === 'number' && Math.abs(a - b) <= (tol || 1e-9), msg + ': ' + a + (Math.abs(a - b) <= (tol || 1e-9) ? '' : ' ≠ esperado ' + b)); }

/* ---------- uma "aba": jsdom + app real + timers e diálogos controlados ---------- */
function novaAba(opts) {
  opts = opts || {};
  var vc = new VirtualConsole();
  var errosPagina = [];
  vc.on('jsdomError', function (e) { errosPagina.push(String(e && e.message || e).slice(0, 200)); });
  vc.on('error', function (m) { errosPagina.push('console.error: ' + String(m).slice(0, 200)); });
  var dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true, virtualConsole: vc });
  var w = dom.window;
  var aba = { w: w, doc: w.document, errosPagina: errosPagina, timers: [], seq: 0, confirms: [], respostas: [], setItems: 0 };
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
  w.sessionStorage.setItem('glassmais.auth', '1');
  if (opts.disco) w.localStorage.setItem(ORC_KEY, JSON.stringify(opts.disco));
  SCRIPTS.forEach(function (src) { w.eval(src); });
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
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
console.log('\n--- Parecer 5 — achado 1: carregar/substituir e a flag icmsSaidaManual');
(function () {
  var a = novaAba();
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
function abaComConflito() {
  // aba com A e B gravados; depois "outra aba" altera A no disco (mais novo que a versão desta aba)
  var a = novaAba();
  a.novoOrc('A original', 'RJ'); a.click('orcVoltar');
  a.novoOrc('B original', 'RJ'); a.click('orcVoltar');
  var d = a.disco(); var idA = d.filter(function (o) { return o.cliente.nome === 'A original'; })[0].id;
  var futuro = new Date(Date.now() + 60000).toISOString();
  a.escreverDisco(d.map(function (o) { if (o.id === idA) { o.cliente.nome = 'A da outra aba'; o.atualizadoEm = futuro; } return o; }));
  return { a: a, idA: idA };
}
(function () {
  var s = abaComConflito(), a = s.a, idA = s.idA;
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

(function () {
  // callback JÁ enfileirado (capturado antes do cancelamento) não pode gravar
  var s = abaComConflito(), a = s.a, idA = s.idA;
  a.abrir('A original'); a.set('o-nome', 'A desta aba'); a.disparar(500);
  var cb = a.pendentes(60)[0].fn;                                    // simula o callback já na fila do event loop
  a.click('orcVoltar'); a.excluirDaLista('A desta aba');
  igual('excluído: disco só com B', a.disco().map(function (o) { return o.cliente.nome; }), ['B original']);
  var antes = a.setItems; cb();
  igual('callback superado executado à força: não gravou nada', [a.setItems - antes, a.disco().map(function (o) { return o.cliente.nome; })], [0, ['B original']]);
  igual('sem erros de página', a.errosPagina, []);
})();

(function () {
  // duas gravações pendentes do mesmo id: só a última vale, e a superada não grava mesmo se executada
  var s = abaComConflito(), a = s.a, idA = s.idA;
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

(function () {
  // excluído em OUTRA aba enquanto o diálogo estava aberto: a decisão valia para a versão vista → pergunta de novo
  var s = abaComConflito(), a = s.a, idA = s.idA;
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

(function () {
  // regressão do parecer nº 4: B alterado por outra aba DURANTE o diálogo é preservado; A desta aba gravado
  var s = abaComConflito(), a = s.a, idA = s.idA;
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
function abaComAExcluidoNoDialogo() {
  // A em conflito; 1ª confirmação aceita; antes do callback de 60 ms, a outra aba exclui A
  var s = abaComConflito(), a = s.a, idA = s.idA;
  a.abrir('A original'); a.set('o-nome', 'A local'); a.disparar(500);
  igual('1ª confirmação (sobrescrever) → gravação adiada pendente', [a.confirms.length, a.pendentes(60).length], [1, 1]);
  a.escreverDisco(a.disco().filter(function (o) { return o.id !== idA; }));      // outra aba excluiu A
  return s;
}
function outraAbaAltera(a, filtro, mut, seg) { a.escreverDisco(a.disco().map(function (o) { if (filtro(o)) mut(o); o.atualizadoEm = filtro(o) ? new Date(Date.now() + seg * 1000).toISOString() : o.atualizadoEm; return o; })); }
(function () {
  // (a) durante a pergunta de recriação, a outra aba altera B → aceitar → B alterado preservado e A recriado
  var s = abaComAExcluidoNoDialogo(), a = s.a, idA = s.idA;
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
(function () {
  // (b) durante a pergunta de recriação, a outra aba exclui B → aceitar → B continua ausente
  var s = abaComAExcluidoNoDialogo(), a = s.a, idA = s.idA;
  a.respostas.push(function () { a.escreverDisco([]); return true; });                 // outra aba excluiu B também
  a.disparar(60); a.disparar(60);
  igual('B excluído durante a pergunta continua ausente; A recriado', a.disco().map(function (o) { return o.cliente.nome; }), ['A local']);
  igual('sem erros de página', a.errosPagina, []);
})();
(function () {
  // (c) durante a pergunta de recriação, a outra aba RECRIA A (versão nova) → reavaliação antes de sobrescrever
  var s = abaComAExcluidoNoDialogo(), a = s.a, idA = s.idA;
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
(function () {
  // (d) sem nenhuma alteração durante a pergunta: aceitar → UMA gravação, sem repetir a pergunta
  var s = abaComAExcluidoNoDialogo(), a = s.a;
  a.disparar(60);
  var antes = a.setItems, conf = a.confirms.length;
  a.disparar(60);
  igual('uma gravação, nenhuma pergunta a mais, nada pendente', [a.setItems - antes, a.confirms.length - conf, a.pendentes().length, a.disco().map(function (o) { return o.cliente.nome; }).sort()], [1, 0, 0, ['A local', 'B original']]);
  // recusar a recriação cancela tudo (nada fica pendente)
  var s2 = abaComAExcluidoNoDialogo(), a2 = s2.a;
  a2.respostas.push(false); a2.disparar(60);
  igual('recusar a recriação: nada pendente, disco sem A', [a2.pendentes().length, a2.disco().some(function (o) { return o.id === s2.idA; })], [0, false]);
  igual('sem erros de página', a.errosPagina.concat(a2.errosPagina), []);
})();

/* =====================================================================
 * Parecer 6 — achado 2: recusar um diálogo posterior cancela a gravação confirmada anterior do mesmo orçamento
 * ===================================================================== */
console.log('\n--- Parecer 6 — achado 2: recusa posterior cancela a gravação confirmada pendente');
(function () {
  var s = abaComConflito(), a = s.a, idA = s.idA;
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
(function () {
  // variante: a recusa acontece em outra pergunta de recriação (A sumiu) — também cancela
  var s = abaComConflito(), a = s.a, idA = s.idA;
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
(function () {
  var a = novaAba();
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
  var i = 0;
  (function prox() {
    if (i >= casos.length) { igual('sem erros de página', a.errosPagina, []); fim(); return; }
    var c = casos[i++]; var antes = a.disco().length;
    var obj = JSON.parse(JSON.stringify(o)); obj.id = 'imp_' + i; obj.status = 'enviado'; obj.emitidoEm = c[0]; obj.enviadoEm = c[0]; obj.cliente.nome = 'Import ' + i;
    importar(obj).then(function () {
      var gravou = a.disco().length === antes + 1;
      igual('importar emitidoEm ' + c[0] + ' → ' + (c[1] ? 'aceito' : 'recusado'), gravou, c[1]);
      if (!c[1]) ok(/Arquivo inválido: Orçamento malformado: emitidoEm inválido/.test(a.texto('orcListaStatus')), 'mensagem: ' + a.texto('orcListaStatus').slice(0, 70));
      else { a.click('orcVoltar'); }
      prox();
    });
  })();
})();

function fim() {
  console.log('\n' + (falhas.length ? 'FALHAS: ' + falhas.length + ' de ' + total : 'Todos os testes de interface passaram (' + total + ' verificações).'));
  if (falhas.length) { falhas.forEach(function (f) { console.log('  - ' + f); }); process.exit(1); }
}

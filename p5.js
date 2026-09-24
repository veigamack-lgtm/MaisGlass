/* Parecer nº 5 — reprodução em navegador real dos achados 1 (carregar/substituir × flag manual) e 2 (gravação
 * adiada × exclusão / gravações superadas), mais a importação com data impossível (achado 3).
 * Assert-based: sai com código 1 se qualquer verificação falhar ou se houver erro de página em qualquer aba.
 * O timer de 60 ms da gravação confirmada é capturado (window.setTimeout) para que a exclusão possa acontecer
 * "antes" dele de forma determinística; o restante do fluxo é o app real, com diálogos reais. */
const fs = require('fs');
const { iniciar, executar, ok, igual, contem } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p, t, disco, aba, abrir, novaPagina } = B;
  let dialogos = []; p.on('dialog', d => { dialogos.push(d.message().split('\n')[0]); d.accept(); });   // todo confirm da aba 1 é aceito (recalcular itens, conflito, exclusão)
  const nomesLista = pg => pg.evaluate(() => Array.from(document.querySelectorAll('#orc-tabela tbody tr td:first-child strong')).map(e => e.textContent).sort());
  const item = async (pg, i) => (await disco(pg)).map(o => o.itens).flat()[i];
  const itens = async pg => { const d = await disco(pg); const o = d.find(x => x.cliente.nome === 'Cliente RJ'); return o.itens.map(it => [it.inputs.clienteUF, it.inputs.icmsSaida, it.inputs.icmsSaidaManual]); };
  const setUF = async (pg, uf) => { await aba(pg, 'orcamentos'); await pg.selectOption('#o-uf', uf); await pg.waitForTimeout(400); };
  const carregar = async (pg, idx) => { await aba(pg, 'orcamentos'); await pg.locator('#orc-itens tbody tr').nth(idx).locator('button:has-text("Carregar")').click(); await pg.waitForTimeout(250); };
  const digitar = async (pg, sel, v) => { await pg.fill(sel, v); await pg.locator(sel).dispatchEvent('input'); await pg.waitForTimeout(80); };

  console.log('--- achado 1: carregar → substituir preserva a classificação manual');
  await aba(p, 'orcamentos'); await p.click('#orcNovo'); await p.waitForTimeout(150);
  await p.fill('#o-nome', 'Cliente RJ'); await p.selectOption('#o-destinatario', 'contribuinteRevenda'); await p.waitForTimeout(700);
  await aba(p, 'nacional');
  await p.selectOption('#n-clienteUF', 'RJ'); await p.waitForTimeout(150);
  igual('calculadora sugere 12% para RJ', await p.inputValue('#n-icmsSaida'), '12');
  await p.selectOption('#n-contribuinte', 'sim'); await digitar(p, '#n-icmsSaida', '10');
  await p.click('#n-addOrc'); await p.waitForTimeout(250);
  igual('item entra manual 10% no RJ', await itens(p), [['RJ', 0.1, true]]);
  await setUF(p, 'MG');
  igual('MG: 10% manual mantido', await itens(p), [['MG', 0.1, true]]);
  await carregar(p, 0);
  igual('carregar: campo mostra 10', await p.inputValue('#n-icmsSaida'), '10');
  contem('interface avisa que o ajuste manual será mantido', await t(p, 'n-addOrcInfo'), 'ajuste manual (10%)');
  contem('botão "Substituir item"', await p.textContent('#n-addOrc'), 'Substituir item');
  await p.click('#n-addOrc'); await p.waitForTimeout(250);
  contem('mensagem "Item substituído"', await t(p, 'n-addOrcInfo'), 'Item substituído');
  igual('substituir sem alterar em MG: flag continua true', await itens(p), [['MG', 0.1, true]]);
  await setUF(p, 'RJ');
  igual('RJ de novo: 10% manual preservado (antes da correção: 12%)', await itens(p), [['RJ', 0.1, true]]);
  contem('aviso no item cita a regra de 12%', await t(p, 'orc-itens'), 'a regra geral para RJ seria 12%');
  // coincidência intermediária: manual 7% no RJ → BA → carregar/substituir → RJ
  await aba(p, 'nacional'); await p.selectOption('#n-clienteUF', 'RJ'); await p.waitForTimeout(150); await digitar(p, '#n-icmsSaida', '7');
  await p.click('#n-addOrc'); await p.waitForTimeout(250);
  igual('2º item manual 7% no RJ', await itens(p), [['RJ', 0.1, true], ['RJ', 0.07, true]]);
  await setUF(p, 'BA');
  igual('BA: 7% coincide com a regra, flag continua true', await itens(p), [['BA', 0.1, true], ['BA', 0.07, true]]);
  await carregar(p, 1); await p.click('#n-addOrc'); await p.waitForTimeout(250);
  await setUF(p, 'RJ');
  igual('RJ: 7% manual preservado após carregar/substituir na BA (antes: 12%)', await itens(p), [['RJ', 0.1, true], ['RJ', 0.07, true]]);
  // alterar só quantidade: classificação mantida
  await carregar(p, 0); await digitar(p, '#n-quantidade', '250'); await p.click('#n-addOrc'); await p.waitForTimeout(250);
  igual('alterar só a quantidade: manual 10% mantido', (await itens(p))[0], ['RJ', 0.1, true]);
  igual('quantidade nova gravada', Number((await disco(p)).find(x => x.cliente.nome === 'Cliente RJ').itens[0].inputs.quantidade), 250);
  // mudança deliberada da alíquota: 10% → 12% (regra do RJ) → automático → BA dá 7%
  await carregar(p, 0); await digitar(p, '#n-icmsSaida', '12'); await p.click('#n-addOrc'); await p.waitForTimeout(250);
  igual('alterou para 12%: reclassificado automático', (await itens(p))[0], ['RJ', 0.12, false]);
  await setUF(p, 'BA');
  igual('BA: automático segue a regra (7%); manual 7% continua manual', await itens(p), [['BA', 0.07, false], ['BA', 0.07, true]]);
  // automático: carregar/substituir sem alterar continua automático
  await carregar(p, 0); await p.click('#n-addOrc'); await p.waitForTimeout(250);
  await setUF(p, 'RJ');
  igual('RJ: automático volta a 12%, manual 7% fica', await itens(p), [['RJ', 0.12, false], ['RJ', 0.07, true]]);
  await p.click('#orcVoltar'); await p.waitForTimeout(150);

  console.log('--- achado 2: gravação confirmada pendente × exclusão (mesma aba)');
  for (const n of ['A original', 'B original']) { await p.click('#orcNovo'); await p.waitForTimeout(100); await p.fill('#o-nome', n); await p.waitForTimeout(700); await p.click('#orcVoltar'); await p.waitForTimeout(100); }
  // captura o timer de 60 ms (gravação adiada) para controlar QUANDO ele dispara; os demais timers seguem reais
  const capturar = pg => pg.evaluate(() => { window.__cb = []; const st = window.setTimeout; window.__st = st; window.setTimeout = function (fn, ms) { if (ms === 60) { window.__cb.push(fn); return -1000 - window.__cb.length; } return st.apply(window, arguments); }; });
  const pendentes = pg => pg.evaluate(() => window.__cb.length);
  const dispararTodos = pg => pg.evaluate(() => { const l = window.__cb.splice(0); l.forEach(f => f()); return l.length; });
  await capturar(p);
  const p2 = await novaPagina('aba 2'); await aba(p2, 'orcamentos');
  await abrir(p, 'A original');
  await abrir(p2, 'A original'); await p2.fill('#o-nome', 'A da aba 2'); await p2.waitForTimeout(700); await p2.click('#orcVoltar'); await p2.waitForTimeout(100);
  dialogos = [];
  await p.fill('#o-nome', 'A desta aba'); await p.waitForTimeout(900);
  igual('conflito: 1 diálogo aceito', dialogos.length, 1);
  igual('status "Confirmado — gravando…"', await t(p, 'orcStatus'), 'Confirmado — gravando…');
  igual('gravação adiada capturada (1 timer de 60 ms)', await pendentes(p), 1);
  igual('disco ainda com a versão da aba 2', (await disco(p)).find(o => o.cliente.nome.startsWith('A')).cliente.nome, 'A da aba 2');
  await p.click('#orcVoltar'); await p.waitForTimeout(150);
  // ao sair do campo, o evento change agenda outra gravação e "Voltar" a conclui: novo conflito → 2ª confirmação → 2º callback
  // (o 1º fica superado). Os dois serão disparados depois da exclusão e nenhum pode gravar.
  igual('voltar: 2ª confirmação (change ao sair do campo) e 2 callbacks capturados', [dialogos.length, await pendentes(p)], [2, 2]);
  igual('lista mostra A não salvo', await p.locator('#orc-tabela tbody tr', { hasText: 'A desta aba' }).locator('.tag:has-text("não salvo")').count(), 1);
  await p.locator('#orc-tabela tbody tr', { hasText: 'A desta aba' }).locator('button:has-text("Excluir")').click(); await p.waitForTimeout(300);
  contem('diálogo da exclusão', dialogos[2], 'Excluir o orçamento');
  igual('após excluir: disco só com B e Cliente RJ', (await disco(p)).map(o => o.cliente.nome).sort(), ['B original', 'Cliente RJ']);
  igual('callbacks adiados (superado e vigente) disparados à força após a exclusão', await dispararTodos(p), 2);
  await p.waitForTimeout(200);
  igual('A NÃO ressuscitou no disco', (await disco(p)).map(o => o.cliente.nome).sort(), ['B original', 'Cliente RJ']);
  igual('lista da aba 1 sem A', await nomesLista(p), ['B original', 'Cliente RJ']);
  igual('aba 2 (evento storage) também sem A', await nomesLista(p2), ['B original', 'Cliente RJ']);

  console.log('--- achado 2: duas gravações pendentes do mesmo id — só a última vale');
  await abrir(p, 'B original');                            // aba 1 abre B ANTES de a aba 2 alterá-lo (cópia que vai ficar velha)
  await abrir(p2, 'B original'); await p2.fill('#o-nome', 'B da aba 2'); await p2.waitForTimeout(700); await p2.click('#orcVoltar'); await p2.waitForTimeout(100);
  dialogos = [];
  await p.fill('#o-nome', 'B v1'); await p.waitForTimeout(900);
  igual('1ª confirmação → 1ª gravação adiada capturada', [dialogos.length, await pendentes(p)], [1, 1]);
  await p.fill('#o-nome', 'B v2'); await p.waitForTimeout(900);
  igual('2ª confirmação (conflito ainda não resolvido no disco)', dialogos.length, 2);
  igual('2ª confirmação capturou outro callback (o 1º foi cancelado pelo app: clearTimeout)', await pendentes(p), 2);
  const gravacoes = await p.evaluate(() => { window.__n = 0; const si = Storage.prototype.setItem; window.__si = si; Storage.prototype.setItem = function (k, v) { if (k === 'glassmais.orcamentos.v1') window.__n++; return si.call(this, k, v); }; return true; });
  igual('disparar os dois callbacks (o superado primeiro)', await dispararTodos(p), 2);
  await p.waitForTimeout(200);
  igual('apenas UMA gravação aconteceu', await p.evaluate(() => window.__n), 1);
  igual('disco tem a versão mais recente (B v2)', (await disco(p)).find(o => o.cliente.nome.startsWith('B')).cliente.nome, 'B v2');
  contem('status final', await t(p, 'orcStatus'), 'sobrescreveu a versão da outra aba');
  await p.evaluate(() => { Storage.prototype.setItem = window.__si; window.setTimeout = window.__st; });
  await p2.close();

  console.log('--- achado 3: importar JSON com emitidoEm impossível');
  await p.click('#orcVoltar'); await p.waitForTimeout(100);
  await abrir(p, 'Cliente RJ');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#orcExportar')]);
  const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  await p.click('#orcVoltar'); await p.waitForTimeout(100);
  const tmp = require('os').tmpdir();
  for (const [data, aceito] of [['2026-02-30T12:00:00Z', false], ['2027-02-29T12:00:00Z', false], ['2028-02-29T12:00:00Z', true], ['2026-09-01T12:00:00Z', true]]) {
    const o = JSON.parse(JSON.stringify(j)); o.id = 'imp_' + data.replace(/\D/g, ''); o.status = 'enviado'; o.emitidoEm = data; o.enviadoEm = data; o.cliente.nome = 'Import ' + data;
    const arq = tmp + '/orc-data.json'; fs.writeFileSync(arq, JSON.stringify(o));
    const antes = (await disco(p)).length;
    await p.setInputFiles('#orcArquivo', arq); await p.waitForTimeout(500);
    igual('importar emitidoEm ' + data + ' → ' + (aceito ? 'aceito' : 'recusado'), (await disco(p)).length === antes + 1, aceito);
    if (!aceito) contem('mensagem', await t(p, 'orcListaStatus'), 'emitidoEm inválido');
    else { await p.click('#orcVoltar'); await p.waitForTimeout(100); }
  }
  await B.fim();
});

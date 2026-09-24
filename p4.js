/* Parecer nº 4 — reprodução em navegador real (duas abas do mesmo contexto) dos achados 2–5 e do legado.
 * Assert-based: sai com código 1 se qualquer verificação falhar ou se houver erro de página em qualquer aba. */
const fs = require('fs');
const { iniciar, executar, ok, igual, contem } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p, t, disco, aba, abrir, novaPagina } = B;
  await aba(p, 'orcamentos');
  for (const n of ['A original', 'B original']) { await p.click('#orcNovo'); await p.waitForTimeout(100); await p.fill('#o-nome', n); await p.waitForTimeout(700); await p.click('#orcVoltar'); await p.waitForTimeout(100); }
  const p2 = await novaPagina('aba 2'); await aba(p2, 'orcamentos');

  console.log('--- achado 2: outra aba grava DURANTE o diálogo de conflito');
  await abrir(p, 'A original');
  await abrir(p2, 'A original'); await p2.fill('#o-nome', 'A da aba 2'); await p2.waitForTimeout(700); await p2.click('#orcVoltar'); await p2.waitForTimeout(100);
  let dialogos = 0;
  p.once('dialog', async d => {
    dialogos++;
    await abrir(p2, 'B original'); await p2.fill('#o-nome', 'B editado durante confirmação'); await p2.waitForTimeout(700); await p2.click('#orcVoltar'); await p2.waitForTimeout(100);
    await d.accept();
  });
  await p.fill('#o-nome', 'A da aba 1'); await p.waitForTimeout(3000);
  let d1 = await disco(p);
  igual('um diálogo de conflito', dialogos, 1);
  igual('disco após confirmar: B editado durante o diálogo preservado e A da aba 1 gravado', d1.map(o => o.cliente.nome).sort(), ['A da aba 1', 'B editado durante confirmação']);
  contem('status final da aba 1', await t(p, 'orcStatus'), 'sobrescreveu a versão da outra aba');
  // A alterado de novo durante o diálogo → segunda confirmação
  await aba(p2, 'orcamentos');
  await abrir(p2, 'A da aba 1'); await p2.fill('#o-nome', 'A da aba 2 (v2)'); await p2.waitForTimeout(700);
  let n2 = 0;
  const h2 = async d => { n2++; if (n2 === 1) { await p2.fill('#o-nome', 'A da aba 2 (v3)'); await p2.waitForTimeout(700); } await d.accept(); if (n2 < 3) p.once('dialog', h2); };
  p.once('dialog', h2);
  await p.fill('#o-contato', 'c1'); await p.waitForTimeout(2500);
  d1 = await disco(p);
  igual('A mudou de novo durante o diálogo: duas confirmações', n2, 2);
  igual('A no disco é a versão da aba 1 após a 2ª confirmação', d1.filter(o => o.cliente.contato === 'c1').map(o => o.cliente.nome), ['A da aba 1']);
  await p2.click('#orcVoltar'); await p2.waitForTimeout(100);

  console.log('--- achado 3: edição não salva preservada na sincronização');
  await p.click('#orcVoltar'); await p.waitForTimeout(100);
  await abrir(p, 'B editado');
  await p.evaluate(() => { window.__set = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); }; });
  await p.fill('#o-nome', 'B ainda não salvo'); await p.waitForTimeout(700);
  contem('quota estourada: status', await t(p, 'orcStatus'), 'Não foi possível salvar');
  await p.click('#orcVoltar'); await p.waitForTimeout(200);
  igual('voltar: badge "não salvo" na lista', await p.locator('#orc-tabela .tag:has-text("não salvo")').count(), 1);
  contem('voltar: nome novo na lista', await t(p, 'orc-tabela'), 'B ainda não salvo');
  contem('voltar: aviso da lista', await t(p, 'orcListaStatus'), 'NÃO foi gravada');
  await abrir(p2, 'A da aba'); await p2.fill('#o-contato', 'sync'); await p2.waitForTimeout(700); await p2.click('#orcVoltar'); await p2.waitForTimeout(300);
  contem('após storage de outra aba: edição preservada na aba 1', await t(p, 'orc-tabela'), 'B ainda não salvo');
  await abrir(p, 'A da aba'); await p.evaluate(() => { Storage.prototype.setItem = window.__set; });
  await p.fill('#o-contato', 'aba1 ok'); await p.waitForTimeout(700); await p.click('#orcVoltar'); await p.waitForTimeout(200);
  contem('após gravar outro orçamento nesta aba: B não salvo continua', await t(p, 'orc-tabela'), 'B ainda não salvo');
  igual('badge continua', await p.locator('#orc-tabela .tag:has-text("não salvo")').count(), 1);
  await abrir(p, 'B ainda'); await p.fill('#o-contato', 'agora salva'); await p.waitForTimeout(700);
  d1 = await disco(p);
  igual('abrir e salvar: disco tem B ainda não salvo', d1.some(o => o.cliente.nome === 'B ainda não salvo'), true);
  contem('status', await t(p, 'orcStatus'), 'Salvo automaticamente');
  await p.click('#orcVoltar'); await p.waitForTimeout(100);
  igual('badge sumiu', await p.locator('#orc-tabela .tag:has-text("não salvo")').count(), 0);
  await abrir(p, 'B ainda'); await p.evaluate(() => { Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); }; });
  await p.fill('#o-nome', 'B não salvo 2'); await p.waitForTimeout(700); await p.click('#orcVoltar'); await p.waitForTimeout(100);
  p2.once('dialog', d => d.accept());
  await p2.locator('#orc-tabela tbody tr', { hasText: 'B ainda' }).first().locator('button:has-text("Excluir")').click(); await p2.waitForTimeout(400);
  contem('excluído em outra aba: continua recuperável na aba 1', await t(p, 'orc-tabela'), 'B não salvo 2');
  await p.evaluate(() => { Storage.prototype.setItem = window.__set; });
  await p2.close();

  console.log('--- achado 4: JSON com custo interno inválido');
  await abrir(p, 'A da aba');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#orcExportar')]);
  const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  j.custosInternos = [{ id: 'bad', tipo: 'outros', descricao: 'x', valor: '', percentual: null }];
  const arq = require('os').tmpdir() + '/orc-custo.json'; fs.writeFileSync(arq, JSON.stringify(j));
  await p.click('#orcVoltar'); await p.waitForTimeout(100);
  const antes = await disco(p);
  await p.setInputFiles('#orcArquivo', arq); await p.waitForTimeout(400);
  contem('custo valor "" recusado', await t(p, 'orcListaStatus'), 'Arquivo inválido: custo interno 1: valor inválido.');
  igual('nada gravado (storage idêntico)', JSON.stringify(await disco(p)) === JSON.stringify(antes), true);
  igual('editor fechado', await p.locator('#orc-editor').evaluate(e => e.classList.contains('hidden')), true);

  console.log('--- achado 5: legado rascunho + enviadoEm');
  await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('glassmais.orcamentos.v1')); const o = JSON.parse(JSON.stringify(l[0])); o.id = 'orc_legado'; o.cliente.nome = 'Legado'; o.status = 'rascunho'; o.enviadoEm = '2026-09-01T12:00:00Z'; delete o.emitidoEm; delete o.emissaoOrigem; l.push(o); localStorage.setItem('glassmais.orcamentos.v1', JSON.stringify(l)); });
  await p.reload(); await B.login(p); await aba(p, 'orcamentos');
  await abrir(p, 'Legado');
  igual('legado: travado', await p.locator('#orc-travado').evaluate(e => !e.classList.contains('hidden')), true);
  contem('banner cita a migração', await t(p, 'orc-travado'), 'marco recuperado na migração');
  igual('legado: nome desabilitado', await p.locator('#o-nome').isDisabled(), true);
  await p.click('#orcRevisao'); await p.waitForTimeout(200);
  igual('nova revisão destrava', await p.locator('#o-nome').isDisabled(), false);
  await B.fim();
});

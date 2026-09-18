/* Botões "?" das três calculadoras: todo campo editável tem botão, cada caixa tem as três partes, toggle/Esc/X/troca de
 * aba fecham, a aba nacional tem texto próprio, e a caixa cabe na tela no celular. Assert-based. */
const os = require('os');
const { iniciar, executar, ok, igual, contem } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p, aba, ctx, login } = B;
  for (const tab of ['calc', 'revenda', 'nacional']) {
    await aba(p, tab);
    const info = await p.evaluate((tab) => {
      const sec = document.getElementById('tab-' + tab);
      const fields = [...sec.querySelectorAll('.field')].filter(f => f.querySelector('input[id], select[id]'));
      const semBotao = fields.filter(f => !f.querySelector('button.help')).map(f => f.querySelector('input[id],select[id]').id);
      return { campos: fields.length, botoes: sec.querySelectorAll('button.help').length, semBotao };
    }, tab);
    igual(tab + ': todo campo editável tem botão "?"', [info.campos === info.botoes && info.campos > 0, info.semBotao], [true, []]);
    const vazios = [];
    for (let i = 0; i < info.botoes; i++) {
      const btn = p.locator(`#tab-${tab} button.help`).nth(i);
      await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForTimeout(40);
      const pop = await p.evaluate(() => { const e = document.querySelector('div.help-box'); return e ? { t: e.querySelector('h4').textContent, ps: [...e.querySelectorAll('p')].map(x => x.textContent.slice(0, 12)), dentro: !!e.closest('.field') } : null; });
      if (!pop || pop.ps.length !== 3 || !pop.dentro || !/^O que é/.test(pop.ps[0]) || !/^O que muda/.test(pop.ps[1]) || !/^Sugestão/.test(pop.ps[2])) vazios.push(await btn.getAttribute('data-help'));
    }
    igual(tab + ': todas as caixas têm "O que é / O que muda / Sugestão" dentro do campo', vazios, []);
  }
  await aba(p, 'revenda');
  const first = p.locator('#tab-revenda button.help').first();
  await first.click(); igual('abre', await p.locator('div.help-box').count(), 1);
  await first.click(); igual('toggle fecha', await p.locator('div.help-box').count(), 0);
  await first.click(); await p.keyboard.press('Escape'); igual('Esc fecha', await p.locator('div.help-box').count(), 0);
  await first.click(); await p.click('div.help-box .x'); igual('X fecha', await p.locator('div.help-box').count(), 0);
  await first.click(); await aba(p, 'calc'); igual('troca de aba fecha', await p.locator('div.help-box').count(), 0);
  await aba(p, 'nacional');
  await p.locator('#tab-nacional button.help[data-help="icmsSaida"]').click();
  contem('nacional icmsSaida: texto próprio (12%/7%)', await p.textContent('div.help-box p:nth-of-type(2)'), '12%, ou 7% quando o destino');
  await p.locator('#tab-nacional button.help[data-help="precoVenda"]').click();
  igual('nacional precoVenda (herdado)', (await p.textContent('div.help-box h4')).trim(), 'Preço de venda (R$/m²)');
  const antes = await p.textContent('#no-lucro');
  await p.locator('#tab-nacional button.help[data-help="precoCompra"]').click(); await p.waitForTimeout(100);
  igual('clicar no "?" não altera o cálculo', await p.textContent('#no-lucro'), antes);
  await p.screenshot({ path: os.tmpdir() + '/help.png' });
  const m = await ctx.newPage(); m.__rotulo = 'mobile'; await m.setViewportSize({ width: 390, height: 800 }); await login(m);
  await aba(m, 'revenda');
  await m.locator('#tab-revenda button.help[data-help="difalIncluso"]').click(); await m.waitForTimeout(100);
  const mb = await m.evaluate(() => { const r = document.querySelector('div.help-box').getBoundingClientRect(); return { x: r.x, right: r.right, vw: innerWidth }; });
  igual('mobile: caixa cabe na tela', mb.x >= 0 && mb.right <= mb.vw, true, mb);
  await m.screenshot({ path: os.tmpdir() + '/helpm.png' });
  await B.fim();
});

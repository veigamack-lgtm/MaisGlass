/* Material cadastrado em Configurações DEPOIS de criar o orçamento (relato do Gabriel, set/2026): adicionar ou substituir
 * um item com esse material dava "Produto não encontrado", porque o orçamento calcula com a configuração congelada dele.
 * Agora o cadastro do material é incluído na configuração congelada (dólar e alíquotas continuam congelados); material
 * renomeado/removido não trava o "Recalcular". Assert-based. */
const { iniciar, executar, ok, igual } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p, t, aba, disco } = B;
  const dialogos = []; p.on('dialog', d => { dialogos.push(d.message()); d.accept(); });
  await aba(p, 'orcamentos'); await p.click('#orcNovo'); await p.fill('#o-nome', 'Teste material'); await p.waitForTimeout(600);
  await aba(p, 'calc'); await p.click('#in-addOrc'); await p.waitForTimeout(200);
  const res0 = JSON.stringify((await disco(p))[0].itens[0].resultado);

  console.log('--- cadastra material novo em Configurações');
  await aba(p, 'config'); await p.click('#cfgAddProduto'); await p.waitForTimeout(200);
  const ult = p.locator('#cfg-produtos tbody tr').last();
  await ult.locator('input').nth(0).fill('Vidro Teste 10mm'); await ult.locator('input').nth(0).press('Tab');
  await ult.locator('input').nth(1).fill('9.5'); await ult.locator('input').nth(1).press('Tab');
  await p.waitForTimeout(900);

  console.log('--- adicionar e substituir com o material novo');
  await aba(p, 'calc'); await p.selectOption('#in-produto', 'Vidro Teste 10mm'); await p.click('#in-addOrc'); await p.waitForTimeout(300);
  let info = await t(p, 'in-addOrcInfo');
  ok(/Item adicionado/.test(info) && info.indexOf('Produto não encontrado') < 0, 'adicionar com material novo funciona: ' + info.slice(0, 90));
  let o = (await disco(p))[0];
  igual('item novo com o material; snapshot com o material; item antigo intacto', [o.itens.length, o.itens[1].inputs.produto, o.configSnapshot.produtos.some(x => x.nome === 'Vidro Teste 10mm'), JSON.stringify(o.itens[0].resultado) === res0], [2, 'Vidro Teste 10mm', true, true]);
  await aba(p, 'orcamentos');
  await p.locator('#orc-itens table.itens tbody tr').first().locator('button:has-text("Carregar")').click(); await p.waitForTimeout(300);
  await p.selectOption('#in-produto', 'Vidro Teste 10mm'); await p.click('#in-addOrc'); await p.waitForTimeout(300);
  ok(/Item substituído/.test(await t(p, 'in-addOrcInfo')), 'substituir pelo material novo funciona');
  await aba(p, 'orcamentos');
  ok(!/diferente da congelada/.test(await t(p, 'oo-avisos')), 'material novo não acende o aviso de configuração diferente');

  console.log('--- material renomeado: Recalcular não trava');
  await aba(p, 'config');
  const alvo = p.locator('#cfg-produtos tbody tr').last().locator('input').nth(0);
  await alvo.fill('Vidro Teste 10mm v2'); await alvo.press('Tab'); await p.waitForTimeout(900);
  await aba(p, 'orcamentos'); dialogos.length = 0; await p.click('#orcRecalcular'); await p.waitForTimeout(300);
  ok(dialogos.length === 1 && dialogos[0].indexOf('mantido com o cadastro congelado') > 0, 'confirmação explica o material mantido');
  ok(/Itens recalculados/.test(await t(p, 'orcStatus')), 'recalcular conclui: ' + (await t(p, 'orcStatus')).slice(0, 90));
  await p.waitForTimeout(1200);
  igual('servidor sem pendências', await p.evaluate(() => GM_NUVEM.pendentes()), 0);
  await B.fim();
});

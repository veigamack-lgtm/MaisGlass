/* Fluxo completo do módulo Orçamentos em navegador real (lista → novo → itens das três calculadoras → custos →
 * cabeçalho → recalcular → carregar/substituir → impressão → exportar/importar → status/revisão → reload → duas abas
 * → mobile). Assert-based: sai com código 1 se qualquer verificação falhar ou se houver erro de página. */
const fs = require('fs');
const os = require('os');
const { iniciar, executar, ok, igual, contem } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p, t, disco, aba, abrir, novaPagina, login, ctx } = B;
  const dialogs = []; p.on('dialog', d => { dialogs.push(d.message().split('\n')[0]); d.accept(); });

  // 1. lista vazia → novo
  await aba(p, 'orcamentos');
  contem('lista vazia', await t(p, 'orc-tabela'), 'Nenhum orçamento ainda');
  await p.click('#orcNovo'); await p.waitForTimeout(150);
  igual('editor aberto: UF RJ, rascunho', [await p.locator('#orc-editor').evaluate(e => !e.classList.contains('hidden')), await p.inputValue('#o-uf'), await p.inputValue('#o-status')], [true, 'RJ', 'rascunho']);
  await p.fill('#o-nome', 'Construtora Teste'); await p.waitForTimeout(700);
  contem('status após nome', await t(p, 'orcStatus'), 'Salvo automaticamente');

  // 2-3. adicionar itens das três abas
  const totais = ['R$ 220.707,20', 'R$ 421.107,20', 'R$ 621.507,20'];
  let i = 0;
  for (const [tab, btn] of [['calc', 'in-addOrc'], ['revenda', 'r-addOrc'], ['nacional', 'n-addOrc']]) {
    await aba(p, tab);
    igual(tab + ': botão habilitado com o nome do orçamento', [await t(p, btn), await p.locator('#' + btn).isDisabled()], ['+ Adicionar ao orçamento: Construtora Teste', false]);
    await p.click('#' + btn); await p.waitForTimeout(200);
    contem(tab + ': item adicionado', await t(p, btn + 'Info'), '(' + (i + 1) + ' item(ns) · total ' + totais[i] + ')');
    i++;
  }
  await aba(p, 'orcamentos');
  igual('itens na tabela (3 + total)', await p.locator('#orc-itens table.itens tbody tr').count(), 4);
  igual('totais do orçamento', [await t(p, 'oo-total'), await t(p, 'oo-liqReal'), await t(p, 'oo-liqPres')], ['R$ 621.507,20', 'R$ 121.144,04', 'R$ 169.635,41']);
  igual('DRE e proposta renderizadas', [await p.locator('#oo-dre tbody tr').count(), await p.locator('#proposta tbody tr').count()], [17, 4]);
  contem('avisos', await t(p, 'oo-avisos'), 'nada pendente');
  // 5. custo interno fixo
  await p.click('#orcAddCusto'); await p.waitForTimeout(100);
  await p.fill('#orc-custos input[type="number"]', '1000'); await p.locator('#orc-custos input[type="number"]').dispatchEvent('change'); await p.waitForTimeout(200);
  igual('custo 1000 → líquido real cai 660 (34%)', await t(p, 'oo-liqReal'), 'R$ 120.484,04');
  contem('custos mostram 1.000,00', await t(p, 'orc-custos'), '1.000,00');
  // comissão %
  await p.click('#orcAddCusto'); await p.waitForTimeout(100);
  await p.locator('#orc-custos tbody tr:nth-child(2) select').nth(0).selectOption('comissao'); await p.waitForTimeout(100);
  await p.locator('#orc-custos tbody tr:nth-child(2) select').nth(1).selectOption('percentual'); await p.waitForTimeout(100);
  await p.fill('#orc-custos tbody tr:nth-child(2) input[type="number"]', '2'); await p.locator('#orc-custos tbody tr:nth-child(2) input[type="number"]').dispatchEvent('change'); await p.waitForTimeout(200);
  igual('comissão 2% do total', (await p.textContent('#orc-custos tbody tr:nth-child(2) td:nth-child(5)')).trim(), 'R$ 12.430,14');
  igual('total ao cliente não muda com custo interno', await t(p, 'oo-total'), 'R$ 621.507,20');

  // 6. UF SP → falha (FCP null na revenda/nacional) → reverte
  await p.selectOption('#o-uf', 'SP'); await p.waitForTimeout(300);
  contem('UF SP: alteração desfeita (FCP não confirmado)', await t(p, 'orcStatus'), 'Alteração desfeita');
  igual('UF continua RJ', await p.inputValue('#o-uf'), 'RJ');
  // 7. contribuinte → recalcula (confirm aceito)
  const nd = dialogs.length;
  await p.selectOption('#o-destinatario', 'contribuinteRevenda'); await p.waitForTimeout(400);
  igual('contribuinte: um diálogo de recálculo', dialogs.length - nd, 1);
  igual('contribuinte: linha DIFAL + FCP zerada', await p.evaluate(() => [...document.querySelectorAll('#oo-dre tbody tr')].find(r => r.textContent.includes('DIFAL + FCP')).children[1].textContent), 'R$ 0,00');
  await p.selectOption('#o-destinatario', 'consumidorFinal'); await p.waitForTimeout(400);
  igual('volta consumidor final: total', await t(p, 'oo-total'), 'R$ 621.507,20');

  // 8. config muda → aviso → recalcular
  await aba(p, 'config'); await p.fill('[data-cfg="dolar"]', '6'); await p.waitForTimeout(900);
  await aba(p, 'orcamentos');
  contem('aviso de configuração diferente', await t(p, 'oo-avisos'), 'diferente');
  igual('total ainda o congelado', await t(p, 'oo-total'), 'R$ 621.507,20');
  const nDialogs = dialogs.length;
  await p.click('#orcRecalcular'); await p.waitForTimeout(400);
  contem('recalcular: diálogo', dialogs[nDialogs], 'Recalcular com a configuração atual (dólar 6,00)');
  igual('aviso sumiu após recalcular', (await t(p, 'oo-avisos')).includes('diferente'), false);
  await aba(p, 'config'); await p.fill('[data-cfg="dolar"]', '5.3'); await p.waitForTimeout(900); await aba(p, 'orcamentos');

  // 13. carregar na calculadora → substituir
  await p.locator('#orc-itens tbody tr').nth(1).locator('button:has-text("Carregar")').click(); await p.waitForTimeout(300);
  igual('carregar: aba revenda visível', await p.locator('#tab-revenda').evaluate(e => !e.classList.contains('hidden')), true);
  contem('botão vira "Substituir item"', await t(p, 'r-addOrc'), 'Substituir item "Vidro importado — revenda"');
  await p.fill('#r-precoVenda', '150'); await p.locator('#r-precoVenda').dispatchEvent('input'); await p.waitForTimeout(100);
  await p.click('#r-addOrc'); await p.waitForTimeout(200);
  contem('item substituído', await t(p, 'r-addOrcInfo'), 'Item substituído');
  await aba(p, 'orcamentos');
  igual('itens após substituir (3 + total)', await p.locator('#orc-itens table.itens tbody tr').count(), 4);
  igual('R$/m² do item 2 = 150', (await p.textContent('#orc-itens tbody tr:nth-child(2) td:nth-child(5)')).trim(), 'R$ 150,00');

  // 10. impressão isola a proposta
  await p.emulateMedia({ media: 'print' });
  const vis = await p.evaluate(() => { const shown = id => { let e = document.getElementById(id); while (e) { if (getComputedStyle(e).display === 'none') return false; e = e.parentElement; } return true; }; return { dre: shown('oo-dre'), proposta: shown('proposta'), itens: shown('orc-itens'), hero: shown('oo-total'), custos: shown('orc-custos'), cabecalho: shown('orc-cabecalho'), header: shown('hdrDolar') }; });
  igual('print: só a proposta visível', vis, { dre: false, proposta: true, itens: false, hero: false, custos: false, cabecalho: false, header: false });
  await p.emulateMedia({ media: 'screen' });

  // 11. exportar / importar
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#orcExportar')]);
  const json = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  igual('export: nome do arquivo, itens, premissas, snapshot', [dl.suggestedFilename(), json.itens.length, json.premissas.irpjCsllReal, json.configSnapshot.dolar], ['orcamento-construtora-teste-rev1.json', 3, 0.34, 6]);
  (function (it) { it.resultado.lucro += 50; it.resultado.custoTotal -= 50; var d = it.resultado.dre.real; d.cmv -= 50; d.lucroBruto += 50; d.lucroOperacional += 50; d.lucroLiquido += 50; })(json.itens[0]);   // adulterado de forma coerente
  const arq = os.tmpdir() + '/orc-import.json'; fs.writeFileSync(arq, JSON.stringify(json));
  await p.click('#orcVoltar'); await p.waitForTimeout(150);
  await p.setInputFiles('#orcArquivo', arq); await p.waitForTimeout(400);
  contem('import: substituído pelo recálculo', await t(p, 'orcStatus'), 'resultado diferente do recálculo (substituído');
  igual('import: nome', await p.inputValue('#o-nome'), 'Construtora Teste');
  contem('aviso divergente no item', await t(p, 'orc-itens'), 'diferia do recálculo');
  await p.click('#orcVoltar'); await p.waitForTimeout(150);
  igual('lista com 2 orçamentos', await p.locator('#orc-tabela tbody tr').count(), 2);
  await p.locator('#orc-tabela tbody tr').nth(1).locator('button:has-text("Abrir")').click(); await p.waitForTimeout(200);

  // 9. enviado → travado → nova revisão
  await p.selectOption('#o-status', 'enviado'); await p.waitForTimeout(300);
  igual('enviado: banner, nome e custos travados', [await p.locator('#orc-travado').evaluate(e => !e.classList.contains('hidden')), await p.locator('#o-nome').isDisabled(), await p.locator('#orcAddCusto').isDisabled()], [true, true, true]);
  await aba(p, 'calc');
  igual('botão da calculadora desabilitado', await p.locator('#in-addOrc').isDisabled(), true);
  contem('explicação', await t(p, 'in-addOrcInfo'), 'está enviado — crie uma nova revisão');
  await aba(p, 'orcamentos'); await p.click('#orcRevisao'); await p.waitForTimeout(300);
  contem('nova revisão', await t(p, 'orcStatus'), 'Revisão 2 criada como rascunho; a revisão 1 fica preservada');
  igual('revisão 2: rascunho editável', [await p.inputValue('#o-status'), await p.locator('#o-nome').isDisabled()], ['rascunho', false]);
  await p.click('#orcVoltar'); await p.waitForTimeout(150);
  igual('lista com 3 orçamentos (r2 no topo)', [await p.locator('#orc-tabela tbody tr').count(), (await p.locator('#orc-tabela tbody tr').nth(0).textContent()).includes('-r2')], [3, true]);

  // 12. reload → persistência + restaura o atual
  await p.locator('#orc-tabela tbody tr').nth(0).locator('button:has-text("Abrir")').click(); await p.waitForTimeout(100);
  await p.reload(); await p.waitForTimeout(500); await aba(p, 'orcamentos');
  igual('após reload: editor aberto no mesmo orçamento com 3 itens', [await p.locator('#orc-editor').evaluate(e => !e.classList.contains('hidden')), await p.inputValue('#o-nome'), await p.locator('#orc-itens table.itens tbody tr').count() - 1], [true, 'Construtora Teste', 3]);
  await p.screenshot({ path: os.tmpdir() + '/orc.png', fullPage: true });

  // duas abas: segunda aba altera o mesmo orçamento; primeira tenta salvar → conflito
  const p2 = await novaPagina('aba 2'); await aba(p2, 'orcamentos');
  await p2.locator('#orc-tabela tbody tr').nth(0).locator('button:has-text("Abrir")').click(); await p2.waitForTimeout(200);
  await p2.fill('#o-nome', (await p2.inputValue('#o-nome')) + ' (aba 2)'); await p2.waitForTimeout(800);
  const nd2 = dialogs.length;
  await p.fill('#o-contato', 'aba 1'); await p.waitForTimeout(800);
  contem('duas abas: diálogo de conflito', dialogs[nd2] || '', 'foi alterado em outra aba');

  // mobile
  const m = await ctx.newPage(); m.__rotulo = 'mobile'; await m.setViewportSize({ width: 390, height: 800 }); await login(m);
  await aba(m, 'orcamentos'); await m.waitForTimeout(300); await m.screenshot({ path: os.tmpdir() + '/orcm.png', fullPage: true });
  igual('mobile sem overflow horizontal', await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
  await B.fim();
});

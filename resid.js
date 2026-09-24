/* Resíduos da rodada 2: sugestão de alíquotas por UF (entrada × saída independentes), modo revenda trava IPI,
 * importar JSON de configuração cancela o autosave pendente, adicionar produto salva, glossário da aba nacional.
 * Assert-based. */
const fs = require('fs');
const os = require('os');
const { iniciar, executar, ok, igual, contem } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p, t, aba } = B;
  await p.click('.home-card[data-go="revenda"]'); await p.waitForTimeout(300);
  await p.fill('#r-icmsSaida', '12'); await p.selectOption('#r-fornecedorUF', 'MG'); await p.waitForTimeout(200);
  igual('trocar fornecedor: entrada re-sugerida (interna 18), saída manual mantida', [await p.inputValue('#r-icmsCompra'), await p.inputValue('#r-icmsSaida')], ['18', '12']);
  await p.selectOption('#r-clienteUF', 'SP'); await p.waitForTimeout(200);
  igual('trocar cliente: saída re-sugerida (4), entrada mantida', [await p.inputValue('#r-icmsSaida'), await p.inputValue('#r-icmsCompra')], ['4', '18']);
  await p.selectOption('#r-modo', 'revenda'); await p.waitForTimeout(200);
  igual('modo revenda: crédito e IPI de saída travados, IPI 0', [await p.isDisabled('#r-ipiCredito'), await p.isDisabled('#r-ipiVenda'), await p.inputValue('#r-ipiVenda')], [true, true, '0']);
  await p.selectOption('#r-modo', 'beneficiamento'); await p.waitForTimeout(200);
  igual('volta beneficiamento: crédito sim, IPI 6,5 editável', [await p.inputValue('#r-ipiCredito'), await p.inputValue('#r-ipiVenda'), await p.isDisabled('#r-ipiVenda')], ['sim', '6.5', false]);
  await aba(p, 'config');
  const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem('glassmais.config.v1')) || GM_DEFAULTS.config);
  const json = JSON.parse(JSON.stringify(cfg)); json.dolar = 9.99; const arq = os.tmpdir() + '/imp.json'; fs.writeFileSync(arq, JSON.stringify(json));
  await p.fill('[data-cfg="dolar"]', '5.4');           // agenda autosave
  await p.setInputFiles('#cfgArquivo', arq);           // importa antes dos 500 ms
  await p.waitForTimeout(1200);
  contem('importar cancela o autosave pendente: pede "Salvar agora"', await t(p, 'cfgStatus'), 'Arquivo carregado. Clique em "Salvar agora"');
  igual('dólar ativo continua 5,30 e nada foi salvo', [await t(p, 'hdrDolar'), await p.evaluate(() => (JSON.parse(localStorage.getItem('glassmais.config.v1')) || { dolar: 'nada salvo' }).dolar)], ['Dólar 5,30', 'nada salvo']);
  await p.click('#cfgAddProduto'); await p.waitForTimeout(900);
  contem('adicionar produto dispara autosave', await t(p, 'cfgStatus'), 'Salvo automaticamente');
  igual('27 produtos salvos', await p.evaluate(() => (JSON.parse(localStorage.getItem('glassmais.config.v1')) || { produtos: [] }).produtos.length), 27);
  await aba(p, 'nacional');
  const gl = await p.textContent('#tab-nacional .gloss');
  igual('glossário nacional: 12% ou 7%, sem 4% nem FCI', [/4% na interestadual/.test(gl), /Ficha de Conteúdo/.test(gl), /12% ou 7%/.test(gl)], [false, false, true]);
  await B.fim();
});

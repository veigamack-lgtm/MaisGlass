/* Migração da configuração v3 → v4 (IRPJ 15% → 25%, lc224, empresa e proposta completados, dólar preservado). Assert-based. */
const { iniciar, executar, ok, igual } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p, login } = B;
  await p.evaluate(() => { const c = JSON.parse(JSON.stringify(GM_DEFAULTS.config)); c.versao = 3; c.tributos.irpj = 0.15; delete c.tributos.lc224; delete c.empresa; delete c.proposta; c.dolar = 5.25; localStorage.setItem('glassmais.config.v1', JSON.stringify(c)); });
  await p.reload(); await login(p);
  const c = await p.evaluate(() => JSON.parse(localStorage.getItem('glassmais.config.v1')));
  igual('v3 → v4: versão, irpj, lc224, empresa, dólar preservado', [c.versao, c.tributos.irpj, c.tributos.lc224, c.empresa && c.empresa.razaoSocial, c.dolar], [4, 0.25, false, 'MaisGlass', 5.25]);
  igual('proposta completada', typeof c.proposta.validadeDias, 'number');
  await B.fim();
});

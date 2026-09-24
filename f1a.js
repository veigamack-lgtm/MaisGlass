/* Fase 1a: FCP na importação direta (RJ 2%, SP não confirmado, MG 0), presumido v4 (IRPJ 25%), LC 224 e rótulos do
 * destinatário. Assert-based. */
const { iniciar, executar, ok, igual, contem } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p, t, aba } = B;
  await aba(p, 'calc');
  igual('RJ: DIFAL, FCP 2% e preço final', [await t(p, 'out-difal'), await t(p, 'out-fcpPct'), await t(p, 'out-fcp'), await t(p, 'out-precoFinal'), await t(p, 'out-lucro')], ['R$ 29.926,40', '2,0%', 'R$ 3.740,80', 'R$ 220.707,20', 'R$ 84.765,33']);
  igual('RJ: sem aviso, uma nota sobre o FCP', [await p.locator('#out-notas .warn').count(), await p.locator('#out-notas p:has-text("FCP")').count()], [0, 1]);
  await p.selectOption('#in-uf', 'SP'); await p.waitForTimeout(100);
  igual('SP: FCP não confirmado com aviso', [await t(p, 'out-fcpPct'), await p.locator('#out-notas .warn').count()], ['0,0% (não confirmado)', 1]);
  await p.selectOption('#in-uf', 'MG'); await p.waitForTimeout(100);
  igual('MG: FCP 0 e DIFAL zero', [await t(p, 'out-fcpPct'), await t(p, 'out-difal')], ['0,0%', 'R$ 0,00']);
  contem('DRE tem a linha DIFAL + FCP', await p.textContent('#out-dre'), 'DIFAL + FCP');
  await aba(p, 'config');
  igual('config: IRPJ 25%, LC 224 desligada, empresa', [await p.inputValue('[data-cfg="tributos.irpj"]'), await p.inputValue('[data-cfg="tributos.lc224"]'), await p.inputValue('[data-cfg="empresa.razaoSocial"]')], ['25', '0', 'MaisGlass']);
  await p.selectOption('[data-cfg="tributos.lc224"]', '1'); await p.waitForTimeout(800);
  contem('LC 224 ligada salva automaticamente', await t(p, 'cfgStatus'), 'Salvo automaticamente');
  await aba(p, 'revenda');
  igual('revenda: presumido com LC 224 (×1,1)', await t(p, 'ro-liqPresSub'), '+ R$ 7.670,16 em relação ao lucro real · IRPJ/CSLL R$ 6.375,17');
  igual('rótulos do destinatário', await p.locator('#r-contribuinte option').allTextContents(), ['Consumidor final não contribuinte (construtora, PF, sem IE)', 'Contribuinte que revende/industrializa (com IE)']);
  await B.fim();
});

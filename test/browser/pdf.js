/* Proposta impressa: orçamento com dados da empresa, cliente, prazo, inclusos e itens das três origens → proposta.pdf
 * (A4, itens + termos e condições) na pasta temporária do sistema. Assert-based. */
const fs = require('fs');
const os = require('os');
const { iniciar, executar, ok, igual, contem } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p, t, aba } = B;
  p.on('dialog', d => d.accept());
  await aba(p, 'config');
  await p.fill('[data-cfg="empresa.cnpj"]', '12.345.678/0001-90'); await p.fill('[data-cfg="empresa.telefone"]', '(32) 99999-0000'); await p.fill('[data-cfg="empresa.email"]', 'contato@maisglass.com.br'); await p.waitForTimeout(900);
  await aba(p, 'orcamentos'); await p.click('#orcNovo'); await p.waitForTimeout(150);
  await p.fill('#o-nome', 'Construtora Horizonte'); await p.fill('#o-contato', 'Eng. Paulo · (21) 98888-0000'); await p.fill('#o-prazo', '20 dias úteis após aprovação');
  await p.check('#o-inclusoFrete'); await p.fill('#o-inclusoTexto', 'içamento'); await p.waitForTimeout(700);
  for (const [tab, btn] of [['calc', 'in-addOrc'], ['revenda', 'r-addOrc'], ['nacional', 'n-addOrc']]) { await aba(p, tab); await p.click('#' + btn); await p.waitForTimeout(150); }
  await aba(p, 'orcamentos');
  igual('botões "?" na aba Orçamentos', await p.locator('#tab-orcamentos button.help').count(), 17);
  await p.locator('#tab-orcamentos button.help[data-help="uf"]').click(); await p.waitForTimeout(50);
  igual('caixa de ajuda da UF', (await p.textContent('div.help-box h4')).trim(), 'UF de destino (entrega e faturamento)');
  await p.keyboard.press('Escape');
  const prop = await t(p, 'proposta');
  ['Construtora Horizonte', '12.345.678/0001-90', 'Eng. Paulo', '20 dias úteis', 'içamento'].forEach(x => contem('proposta mostra', prop, x));
  igual('proposta com 3 itens', await p.locator('#proposta table.p-itens tbody tr').count(), 4);
  await p.emulateMedia({ media: 'print' });
  const arq = os.tmpdir() + '/proposta.pdf';
  await p.pdf({ path: arq, format: 'A4', printBackground: true });
  const pdf = fs.readFileSync(arq);
  const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  igual('PDF gerado com itens + termos e condições em 2 a 4 páginas A4', [pdf.length > 10000, paginas >= 2 && paginas <= 4], [true, true]);
  console.log('pdf em', arq);
  await B.fim();
});

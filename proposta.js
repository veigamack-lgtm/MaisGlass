/* Proposta comercial no formato das propostas do mercado: logo, identificação, consultor, dados do cliente, quadro de
 * itens, normas, termos e condições 1–13, assinaturas e rodapé; textos editáveis pelo administrador e CONGELADOS na
 * emissão (mudar Configurações depois não altera a proposta enviada; a nova revisão volta a acompanhar). Assert-based. */
const { iniciar, executar, ok, igual, contem } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p, t, aba, disco } = B;
  p.on('dialog', d => d.accept());
  const prop = () => t(p, 'proposta');
  const termo = id => p.locator('#cfg-termos textarea[data-termo="' + id + '"]');

  console.log('--- dados da empresa e orçamento com cliente completo');
  await aba(p, 'config');
  await p.fill('[data-cfg="empresa.razaoSocial"]', 'MAISGLASS COMÉRCIO DE VIDROS LTDA');
  await p.fill('[data-cfg="empresa.cnpj"]', '12.345.678/0001-90'); await p.fill('[data-cfg="empresa.ie"]', '001.234.567.0089');
  await p.fill('[data-cfg="empresa.endereco"]', 'Rua Exemplo, 100 - Centro - Juiz de Fora - MG'); await p.fill('[data-cfg="empresa.telefone"]', '(32) 3000-0000');
  await p.fill('[data-cfg="empresa.email"]', 'comercial@maisglass.com.br'); await p.fill('[data-cfg="empresa.site"]', 'www.maisglass.com.br');
  await p.waitForTimeout(900);
  igual('site e IE gravados na configuração', await p.evaluate(() => [JSON.parse(localStorage.getItem('glassmais.config.v1')).empresa.site, JSON.parse(localStorage.getItem('glassmais.config.v1')).empresa.ie]), ['www.maisglass.com.br', '001.234.567.0089']);
  await aba(p, 'orcamentos'); await p.click('#orcNovo'); await p.waitForTimeout(150);
  const campos = { '#o-nome': 'Esquadrias Modelo Ltda', '#o-contato': 'Fulano de Tal', '#o-email': 'compras@exemplo.com.br', '#o-telefone': '(32) 99916-0000',
    '#o-documento': '11.222.333/0001-81', '#o-ie': '000.111.222.0033', '#o-endereco': 'Av. Principal, 74 - Juiz de Fora - MG',
    '#o-enderecoEntrega': 'Rua da Obra, 10 - Rio de Janeiro - RJ', '#o-obra': 'Edifício Modelo', '#o-projeto': 'Fachada norte', '#o-prazo': '20 dias úteis' };
  for (const [sel, v] of Object.entries(campos)) await p.fill(sel, v);
  await p.check('#o-inclusoFrete'); await p.fill('#o-observacoes', 'Não inclui instalação.'); await p.waitForTimeout(700);
  for (const [tab, btn] of [['calc', 'in-addOrc'], ['revenda', 'r-addOrc']]) { await aba(p, tab); await p.click('#' + btn); await p.waitForTimeout(150); }
  await aba(p, 'orcamentos');
  let d = (await disco(p))[0];
  igual('campos do cliente gravados no orçamento', ['email', 'telefone', 'documento', 'ie', 'endereco', 'enderecoEntrega', 'obra', 'projeto'].map(k => d.cliente[k]),
    ['compras@exemplo.com.br', '(32) 99916-0000', '11.222.333/0001-81', '000.111.222.0033', 'Av. Principal, 74 - Juiz de Fora - MG', 'Rua da Obra, 10 - Rio de Janeiro - RJ', 'Edifício Modelo', 'Fachada norte']);

  console.log('--- conteúdo da proposta');
  let txt = await prop();
  igual('logo da MaisGlass carregado', await p.locator('#proposta img.p-logo').evaluate(i => i.complete && i.naturalWidth > 0 && /logo-horizontal-metal\.png$/.test(i.src)), true);
  ['Proposta Comercial Nº:', 'Revisão: 01', 'Consultor técnico comercial: Administrador', 'E-mail: admin@maisglass.local', 'À: Esquadrias Modelo Ltda', 'A/C: Fulano de Tal',
    'CNPJ/CPF: 11.222.333/0001-81', 'Endereço da entrega: Rua da Obra, 10', 'Obra: Edifício Modelo', 'Projeto: Fachada norte', 'UF de entrega: RJ',
    'REF.: Proposta comercial para fornecimento de vidros', 'DE ACORDO COM NORMAS ABNT', 'OBSERVAÇÕES: Não inclui instalação.',
    '3.2. O item 001 (vidro importado) foi precificado com o dólar a R$', 'Frete incluso nos preços acima, com entrega em Rua da Obra, 10',
    'Prazo de entrega: 20 dias úteis.', 'garantia de 5 (cinco) anos', '15 dias, contados da data de emissão', 'MAISGLASS COMÉRCIO DE VIDROS LTDA',
    'CNPJ 12.345.678/0001-90 · IE 001.234.567.0089', 'Contratante: Esquadrias Modelo Ltda', 'www.maisglass.com.br'].forEach(x => contem('proposta', txt, x));
  igual('cláusulas 1 a 13 na ordem', await p.$$eval('#proposta .p-termos h4', hs => hs.map(h => h.textContent.split(')')[0])),
    ['OBJETO:', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']);
  ok(!/brazil|brasil ?glass/i.test(txt), 'nenhuma menção à empresa da proposta de referência');
  igual('quadro: ITEM 001/002, UM M2 e TOTAL', await p.$$eval('#proposta table.p-itens tbody tr', rs => rs.map(r => r.cells[0].textContent + '|' + (r.cells[2] ? r.cells[2].textContent : ''))), ['001|M2', '002|M2', 'TOTAL|']);

  console.log('--- impressão: rodapé fixo em cada página e só a proposta visível');
  await p.emulateMedia({ media: 'print' });
  igual('rodapé fixo + espaço reservado no pé de cada página', await p.evaluate(() => [getComputedStyle(document.querySelector('#proposta .p-rodape')).position, getComputedStyle(document.querySelector('#proposta .p-pagina > tfoot')).display]), ['fixed', 'table-footer-group']);
  await p.emulateMedia({ media: 'screen' });

  console.log('--- textos do administrador: rascunho acompanha Configurações');
  await aba(p, 'config'); await p.click('#cfg-termos-box summary');
  igual('14 cláusulas + 4 linhas editáveis', await p.locator('#cfg-termos textarea').count(), 18);
  await termo('garantia').fill('Garantia de 2 (dois) anos contra defeitos de fabricação.'); await p.waitForTimeout(900);
  igual('texto personalizado gravado em config.proposta.termos', await p.evaluate(() => JSON.parse(localStorage.getItem('glassmais.config.v1')).proposta.termos), { garantia: 'Garantia de 2 (dois) anos contra defeitos de fabricação.' });
  await aba(p, 'orcamentos');
  txt = await prop();
  contem('rascunho mostra o texto novo', txt, 'Garantia de 2 (dois) anos'); ok(txt.indexOf('5 (cinco) anos') < 0, 'e não o padrão');

  console.log('--- emissão congela consultor e termos');
  await p.selectOption('#o-status', 'enviado'); await p.waitForTimeout(400);
  d = (await disco(p))[0];
  igual('consultor e textos congelados no orçamento', [d.consultor, d.textosProposta.clausulas.find(c => c.id === 'garantia').paragrafos], [{ nome: 'Administrador', email: 'admin@maisglass.local' }, ['Garantia de 2 (dois) anos contra defeitos de fabricação.']]);
  await aba(p, 'config');
  await p.locator('#cfg-termos .termo', { has: p.locator('textarea[data-termo="garantia"]') }).locator('button:has-text("Restaurar padrão")').click(); await p.waitForTimeout(900);
  igual('restaurar padrão remove o texto personalizado', await p.evaluate(() => JSON.parse(localStorage.getItem('glassmais.config.v1')).proposta.termos === undefined), true);
  await aba(p, 'orcamentos');
  txt = await prop();
  contem('proposta enviada mantém o texto da emissão', txt, 'Garantia de 2 (dois) anos');
  ok(txt.indexOf('5 (cinco) anos') < 0, 'e não muda com Configurações');
  await p.click('#orcRevisao'); await p.waitForTimeout(300);
  txt = await prop();
  contem('nova revisão (rascunho) volta a acompanhar Configurações', txt, 'garantia de 5 (cinco) anos');
  contem('revisão 02 com o MESMO número da proposta', txt, 'Revisão: 02');
  const nums = (await disco(p)).map(o => [o.revisao, o.numero || null]);
  const n1 = await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('glassmais.orcamentos.v1')); const r1 = l.find(o => o.revisao === 1); return r1.id.slice(-6).toUpperCase(); });
  igual('rev. 2 grava o número da rev. 1', nums.find(x => x[0] === 2)[1], n1);
  contem('número da rev. 1 no cabeçalho da rev. 2', txt, 'Proposta Comercial Nº: ' + n1);

  console.log('--- pagamento parcelado na cláusula 4');
  await p.selectOption('#o-pagamento', 'Parcelado'); await p.waitForTimeout(300);
  await p.fill('#o-parcelas', '6'); await p.press('#o-parcelas', 'Tab'); await p.waitForTimeout(400);
  contem('cláusula 4 parcelada', await prop(), 'Parcelado em 6x no cartão de crédito');

  await B.fim();
});

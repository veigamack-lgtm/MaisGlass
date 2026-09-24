/* Nuvem — duas MÁQUINAS de verdade (dois contextos de navegador: cookies e localStorage separados) contra o mesmo
 * servidor local (API em memória). Login por e-mail, troca de senha obrigatória, usuário comum, lista compartilhada,
 * conflito 409 com diálogo, exclusão/recriação 410, configuração do administrador propagando, fila sem conexão e
 * migração de orçamentos que estavam só num navegador. Assert-based. */
const { chromium } = require('playwright');
const path = require('path');
const { iniciar, executar, ok, igual, contem } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p: A, t, disco, aba, abrir, login, srv, URL, ADMIN } = B;
  const esperar = ms => A.waitForTimeout(ms);
  const puxar = async pg => { await pg.evaluate(() => window.GM_NUVEM.sincronizarAgora()); await pg.waitForTimeout(500); };
  const nomesServidor = () => [...srv.ctx.repo._estado.orcamentos.values()].filter(o => !o.excluidoEm).map(o => o.dados.cliente.nome).sort();
  let dialogosA = [], respostaA = () => true;
  A.on('dialog', async d => { dialogosA.push(d.message().replace(/\n/g, ' ')); (await respostaA(d.message())) ? d.accept() : d.dismiss(); });

  // segunda máquina: outro contexto (sessão e armazenamento próprios)
  const ctx2 = await B.browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errosM2 = [];
  const M2 = await ctx2.newPage(); M2.on('pageerror', e => errosM2.push(String(e.message)));
  M2.on('console', m => { if (m.type() === 'error' && !/status of (401|409|410)|ERR_INTERNET_DISCONNECTED/.test(m.text())) errosM2.push(m.text()); });   // a queda de conexão (ERR_INTERNET_DISCONNECTED) é provocada pelo teste
  let dialogosM2 = [], respostaM2 = () => true;
  M2.on('dialog', async d => { dialogosM2.push(d.message().replace(/\n/g, ' ')); (await respostaM2(d.message())) ? d.accept() : d.dismiss(); });

  console.log('--- login e usuários');
  contem('cabeçalho mostra o administrador', await t(A, 'hdrUsuario'), 'Administrador · admin');
  contem('indicador de sincronização', await t(A, 'hdrSync'), 'Sincronizado');
  await aba(A, 'usuarios');
  await A.fill('#u-nome', 'Vendedor'); await A.fill('#u-email', 'vendedor@maisglass.local'); await A.click('#uCriar'); await esperar(400);
  const senhaInicial = await t(A, 'uSenha');
  igual('senha inicial mostrada uma vez (12 caracteres)', senhaInicial.length, 12);
  await M2.goto(URL);
  await M2.waitForFunction(() => document.getElementById('loginInfo').textContent !== 'Conectando…');
  igual('máquina 2 sem sessão: tela de login', await M2.locator('#login').isVisible(), true);
  await M2.fill('#loginEmail', 'vendedor@maisglass.local'); await M2.fill('#loginSenha', 'errada'); await M2.click('#loginBtn'); await M2.waitForTimeout(400);
  igual('senha errada → mensagem genérica', await t(M2, 'loginErro'), 'E-mail ou senha incorretos.');
  await M2.fill('#loginSenha', senhaInicial); await M2.click('#loginBtn'); await M2.waitForTimeout(500);
  igual('senha inicial → pede nova senha', await M2.locator('#trocaSenhaForm').isVisible(), true);
  await M2.fill('#novaSenha1', 'vendedor123'); await M2.fill('#novaSenha2', 'vendedor123'); await M2.click('#trocaSenhaBtn');
  await M2.waitForFunction(() => !document.getElementById('app').classList.contains('hidden') && window.GM_NUVEM.carregou(), null, { timeout: 10000 });
  igual('vendedor dentro, sem aba Usuários, configuração só leitura', [await t(M2, 'hdrUsuario'), await M2.locator('nav.tabs button[data-tab="usuarios"]').isVisible(), await M2.locator('[data-cfg="dolar"]').isDisabled()], ['Vendedor', false, true]);
  await M2.reload();
  await M2.waitForFunction(() => !document.getElementById('app').classList.contains('hidden') && window.GM_NUVEM.carregou(), null, { timeout: 10000 });
  ok(true, 'recarregar a página mantém a sessão (cookie)');

  console.log('--- lista compartilhada');
  await aba(A, 'orcamentos'); await A.click('#orcNovo'); await esperar(150);
  await A.fill('#o-nome', 'Construtora Norte'); await esperar(700);
  await aba(A, 'calc'); await A.click('#in-addOrc'); await esperar(300); await aba(A, 'orcamentos');
  await esperar(1200);
  igual('servidor recebeu o orçamento da máquina 1', nomesServidor(), ['Construtora Norte']);
  await puxar(M2); await aba(M2, 'orcamentos');
  igual('máquina 2 vê o orçamento, com autor', [await M2.locator('#orc-tabela tbody tr', { hasText: 'Construtora Norte' }).count(), (await M2.locator('#orc-tabela tbody tr', { hasText: 'Construtora Norte' }).textContent()).includes('por Administrador')], [1, true]);
  await abrir(M2, 'Construtora Norte');
  igual('máquina 2 abre com os itens e o total', [await M2.locator('#orc-itens table.itens tbody tr').count(), await t(M2, 'oo-total')], [2, await t(A, 'oo-total')]);
  contem('linha de autoria', await t(M2, 'orc-autoria'), 'Criado por Administrador');

  console.log('--- conflito entre máquinas (409)');
  await M2.fill('#o-contato', 'contato do vendedor'); await M2.waitForTimeout(1500);
  igual('servidor com a versão do vendedor (v3)', srv.ctx.repo._estado.orcamentos.values().next().value.dados.cliente.contato, 'contato do vendedor');
  dialogosA = []; respostaA = msg => /outra máquina/.test(msg);
  await A.fill('#o-prazo', '15 dias'); await A.waitForTimeout(1500);
  contem('máquina 1 perguntou (alterado por Vendedor em outra máquina)', dialogosA.join(' | '), 'alterado por Vendedor');
  const noServ = srv.ctx.repo._estado.orcamentos.values().next().value.dados;
  igual('sobrescreveu com a versão da máquina 1 (prazo 15 dias, contato perdido)', [noServ.condicoes.prazoEntrega, noServ.cliente.contato], ['15 dias', '']);
  await puxar(M2);
  contem('máquina 2 (com o orçamento aberto) foi avisada', await t(M2, 'orcStatus'), 'alterado por Administrador');
  dialogosM2 = []; respostaM2 = msg => !/outra máquina/.test(msg);   // recusa → decide depois pelo banner
  await M2.fill('#o-observacoes', 'obs do vendedor'); await M2.waitForTimeout(1500);
  igual('máquina 2 recusou: banner de conflito', await M2.locator('#orc-conflito').isVisible(), true);
  await M2.locator('#orc-conflito button', { hasText: 'Usar a versão do servidor' }).click(); await M2.waitForTimeout(400);
  igual('máquina 2 carregou a versão do servidor', [await M2.inputValue('#o-prazo'), await M2.locator('#orc-conflito').isVisible()], ['15 dias', false]);

  console.log('--- exclusão em outra máquina (410)');
  await M2.click('#orcVoltar'); await M2.waitForTimeout(200);
  await M2.locator('#orc-tabela tbody tr', { hasText: 'Construtora Norte' }).locator('button:has-text("Excluir")').click(); await M2.waitForTimeout(1200);
  igual('servidor sem o orçamento', nomesServidor(), []);
  await puxar(A);
  contem('máquina 1 (aberto) avisada da exclusão', await t(A, 'orcStatus'), 'excluído por Vendedor');
  dialogosA = []; respostaA = () => true;
  await A.fill('#o-contato', 'recriado'); await A.waitForTimeout(1500);
  contem('máquina 1 perguntou se recria', dialogosA.join(' | '), 'excluído por Vendedor');
  igual('recriado no servidor', nomesServidor(), ['Construtora Norte']);

  console.log('--- configuração do administrador chega na outra máquina');
  await aba(A, 'config'); await A.fill('[data-cfg="dolar"]', '5.77'); await A.waitForTimeout(1500);
  await puxar(M2);
  igual('dólar novo no cabeçalho da máquina 2', await t(M2, 'hdrDolar'), 'Dólar 5,77');

  console.log('--- sem conexão: fila e reenvio');
  await ctx2.setOffline(true);
  await aba(M2, 'orcamentos'); await M2.click('#orcNovo'); await M2.waitForTimeout(150); await M2.fill('#o-nome', 'Feito offline'); await M2.waitForTimeout(1500);
  contem('indicador: sem conexão, 1 aguardando', await t(M2, 'hdrSync'), 'Sem conexão');
  igual('servidor ainda sem ele', nomesServidor().includes('Feito offline'), false);
  await ctx2.setOffline(false);
  await M2.evaluate(() => window.dispatchEvent(new Event('online'))); await M2.waitForTimeout(1500);
  igual('voltou a conexão: enviado', nomesServidor().includes('Feito offline'), true);
  contem('indicador: sincronizado', await t(M2, 'hdrSync'), 'Sincronizado');

  console.log('--- migração: orçamentos que estavam só neste navegador');
  const ctx3 = await B.browser.newContext(); const M3 = await ctx3.newPage();
  await M3.goto(URL);
  await M3.evaluate(() => { const O = window.GM_ORC, D = window.GM_DEFAULTS; const o = O.novoOrcamento(D.config, { nome: 'Antigo do notebook', uf: 'SP' }); localStorage.setItem('glassmais.orcamentos.v1', JSON.stringify([o])); });
  await M3.reload(); await M3.waitForFunction(() => document.getElementById('loginInfo').textContent !== 'Conectando…');
  await M3.fill('#loginEmail', ADMIN.email); await M3.fill('#loginSenha', ADMIN.senha); await M3.click('#loginBtn');
  await M3.waitForFunction(() => window.GM_NUVEM && window.GM_NUVEM.carregou(), null, { timeout: 10000 });
  await M3.click('nav.tabs button[data-tab="orcamentos"]'); await M3.waitForTimeout(200);
  igual('card de migração e badge "só neste computador"', [await M3.locator('#orc-migracao').isVisible(), await M3.locator('#orc-tabela .tag:has-text("só neste computador")').count()], [true, 1]);
  await M3.click('#orcMigrar'); await M3.waitForTimeout(800);
  contem('relatório', await t(M3, 'orcMigracaoStatus'), 'Enviados: 1 novo');
  igual('servidor com o antigo', nomesServidor().includes('Antigo do notebook'), true);
  await puxar(A); await aba(A, 'orcamentos');
  if (await A.locator('#orcVoltar').isVisible()) { await A.click('#orcVoltar'); await A.waitForTimeout(200); }
  igual('máquina 1 recebe o migrado', await A.locator('#orc-tabela tbody tr', { hasText: 'Antigo do notebook' }).count(), 1);
  await ctx3.close();

  console.log('--- sair');
  await M2.click('#logoutBtn'); await M2.waitForTimeout(600);
  igual('saiu: tela de login', await M2.locator('#login').isVisible(), true);
  igual('erros de página na máquina 2', errosM2, []);
  await ctx2.close();
  await B.fim();
});

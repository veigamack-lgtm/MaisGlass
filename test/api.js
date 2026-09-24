/* =====================================================================
 * test/api.js — testes da API (api/) contra o servidor local com repositório em memória.
 * Sem banco, sem segredos. `node test/api.js` → sai com código 1 se algo falhar.
 * Cobre: bootstrap do admin, login/bloqueio/sessão/senha, CSRF, permissões, PUT com versaoBase
 * (200/409/410/recriar), DELETE, sync incremental, importar-local, validação pelo motor, usuários.
 * ===================================================================== */
'use strict';
const path = require('path');
const { iniciar } = require('./servidor-local');
const O = require(path.join(__dirname, '..', 'orcamento.js')).GM_ORC;
const D = require(path.join(__dirname, '..', 'defaults.js')).GM_DEFAULTS;

let total = 0; const falhas = [];
function ok(c, msg, extra) { total++; if (c) console.log('OK    ' + msg); else { falhas.push(msg); console.log('FALHA ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); } }
function igual(msg, a, b) { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, msg + ': ' + (x || '').slice(0, 160) + (x === y ? '' : ' ≠ esperado ' + y)); }

/* "máquina": um cliente HTTP com o próprio cookie de sessão */
function maquina(base) {
  let cookie = '';
  async function chamar(metodo, caminho, corpo, opts) {
    opts = opts || {};
    const h = { 'X-Requested-With': opts.semCsrf ? '' : 'MaisGlass' };
    if (cookie) h.Cookie = cookie;
    if (corpo !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(base + caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = /Max-Age=0/.test(sc) ? '' : sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch (e) { /* vazio */ }
    return { status: r.status, corpo: j };
  }
  return { chamar, login: (email, senha) => chamar('POST', '/api/login', { email, senha }), get: (c) => chamar('GET', c), put: (c, b) => chamar('PUT', c, b), post: (c, b) => chamar('POST', c, b), del: (c) => chamar('DELETE', c), patch: (c, b) => chamar('PATCH', c, b), cookie: () => cookie, setCookie: (c) => { cookie = c; } };
}
function orcamentoValido(id, nome) {
  const o = O.novoOrcamento(D.config, { nome: nome || 'Cliente', uf: 'RJ', destinatario: 'consumidorFinal' });
  if (id) o.id = id;
  return o;
}

(async () => {
  const S = await iniciar();
  const base = S.url;
  if (S.ctx.repo.tipo === 'neon') {   // PG_TESTE_URL: limpa o banco de teste antes (NUNCA aponte para o banco de produção)
    console.log('(testando o repositório Neon/Postgres em ' + process.env.PG_TESTE_URL + ')');
    for (const t of ['sessoes', 'tentativas_login', 'orcamentos_hist', 'orcamentos', 'config', 'usuarios']) await S.ctx.repo._sql.query('DROP TABLE IF EXISTS ' + t + ' CASCADE');
  }
  const A = maquina(base), B = maquina(base), X = maquina(base);

  console.log('--- saúde, bootstrap e login');
  igual('saúde', (await A.get('/api/saude')).corpo.ok, true);
  igual('sessão sem cookie → 401', (await A.get('/api/sessao')).status, 401);
  igual('login sem CSRF → 403', (await A.chamar('POST', '/api/login', { email: 'admin@maisglass.local', senha: 'admin12345' }, { semCsrf: true })).status, 403);
  igual('login com senha errada → 401 mensagem genérica', (await A.login('admin@maisglass.local', 'errada')).corpo.erro, 'E-mail ou senha incorretos.');
  igual('login com e-mail inexistente → 401 mesma mensagem', (await A.login('ninguem@x.com', 'admin12345')).corpo.erro, 'E-mail ou senha incorretos.');
  let r = await A.login('ADMIN@maisglass.local', 'admin12345');
  igual('login do admin criado pelo bootstrap (e-mail normalizado) → precisa trocar senha', [r.status, r.corpo.usuario.papel, r.corpo.precisaTrocarSenha], [200, 'admin', true]);
  ok(/gm_sessao=/.test(A.cookie()), 'cookie de sessão definido');
  igual('sessão válida', (await A.get('/api/sessao')).corpo.usuario.email, 'admin@maisglass.local');
  igual('trocar senha: atual errada → 400', (await A.post('/api/senha', { atual: 'x', nova: 'novaSenha123' })).status, 400);
  igual('trocar senha: curta → 400', (await A.post('/api/senha', { atual: 'admin12345', nova: 'curta' })).status, 400);
  igual('trocar senha OK', (await A.post('/api/senha', { atual: 'admin12345', nova: 'novaSenha123' })).status, 200);
  igual('sessão continua após trocar a senha (esta máquina)', (await A.get('/api/sessao')).corpo.precisaTrocarSenha, false);
  igual('senha antiga não entra mais', (await B.login('admin@maisglass.local', 'admin12345')).status, 401);
  igual('senha nova entra na máquina B', (await B.login('admin@maisglass.local', 'novaSenha123')).status, 200);

  console.log('--- limite de tentativas');
  const Z = maquina(base);
  for (let i = 0; i < 10; i++) await Z.login('alvo@x.com', 'errada');
  igual('11ª tentativa em 15 min → 429', (await Z.login('alvo@x.com', 'errada')).status, 429);
  S.ctx.avancarRelogio(16 * 60 * 1000);
  igual('após 16 min a janela reabre (401 normal)', (await Z.login('alvo@x.com', 'errada')).status, 401);

  console.log('--- usuários (admin)');
  r = await A.post('/api/usuarios', { email: 'vendedor@maisglass.local', nome: 'Vendedor', papel: 'usuario' });
  igual('criar usuário devolve senha inicial', [r.status, r.corpo.usuario.papel, typeof r.corpo.senhaInicial, r.corpo.senhaInicial.length], [200, 'usuario', 'string', 12]);
  const senhaVend = r.corpo.senhaInicial, idVend = r.corpo.usuario.id;
  igual('e-mail duplicado → 409', (await A.post('/api/usuarios', { email: 'vendedor@maisglass.local', nome: 'x' })).status, 409);
  igual('e-mail inválido → 400', (await A.post('/api/usuarios', { email: 'sem-arroba', nome: 'x' })).status, 400);
  r = await X.login('vendedor@maisglass.local', senhaVend);
  igual('vendedor entra com a senha inicial e precisa trocar', [r.status, r.corpo.precisaTrocarSenha], [200, true]);
  igual('vendedor não lista usuários → 403', (await X.get('/api/usuarios')).status, 403);
  igual('vendedor não altera config → 403', (await X.put('/api/config', { dados: D.config, versaoBase: null })).status, 403);
  igual('admin não pode se desativar', (await A.patch('/api/usuarios/' + (await A.get('/api/sessao')).corpo.usuario.id, { ativo: false })).status, 400);
  igual('admin não pode deixar de ser o último admin', (await A.patch('/api/usuarios/' + (await A.get('/api/sessao')).corpo.usuario.id, { papel: 'usuario' })).status, 400);
  r = await A.patch('/api/usuarios/' + idVend, { redefinirSenha: true });
  igual('redefinir senha devolve nova senha inicial e derruba a sessão do vendedor', [r.status, typeof r.corpo.senhaInicial, (await X.get('/api/sessao')).status], [200, 'string', 401]);
  const senhaVend2 = r.corpo.senhaInicial;
  igual('vendedor entra com a senha redefinida', (await X.login('vendedor@maisglass.local', senhaVend2)).status, 200);
  await X.post('/api/senha', { atual: senhaVend2, nova: 'vendedor123' });
  igual('desativar vendedor derruba a sessão', [(await A.patch('/api/usuarios/' + idVend, { ativo: false })).status, (await X.get('/api/sessao')).status], [200, 401]);
  igual('desativado não entra', (await X.login('vendedor@maisglass.local', 'vendedor123')).status, 401);
  igual('reativar', (await A.patch('/api/usuarios/' + idVend, { ativo: true })).status, 200);
  igual('vendedor entra de novo', (await X.login('vendedor@maisglass.local', 'vendedor123')).status, 200);
  igual('lista de usuários sem hash', Object.keys((await A.get('/api/usuarios')).corpo.usuarios[0]).indexOf('senhaHash'), -1);

  console.log('--- configuração');
  igual('config vazia no início', (await A.get('/api/config')).corpo, null);
  igual('config inválida → 400', (await A.put('/api/config', { dados: { dolar: -1 }, versaoBase: null })).status, 400);
  r = await A.put('/api/config', { dados: D.config, versaoBase: null });
  igual('admin grava a config inicial (versão 1)', [r.status, r.corpo.versao], [200, 1]);
  igual('gravar de novo com versaoBase null → 409', (await A.put('/api/config', { dados: D.config, versaoBase: null })).status, 409);
  const cfg2 = JSON.parse(JSON.stringify(D.config)); cfg2.dolar = 5.5;
  igual('gravar com versaoBase 1 → versão 2', (await A.put('/api/config', { dados: cfg2, versaoBase: 1 })).corpo.versao, 2);
  r = await B.put('/api/config', { dados: D.config, versaoBase: 1 });
  igual('outra máquina com versaoBase velha → 409 com a atual', [r.status, r.corpo.atual.versao, r.corpo.atual.dados.dolar], [409, 2, 5.5]);
  igual('vendedor lê a config', (await X.get('/api/config')).corpo.versao, 2);

  console.log('--- orçamentos: PUT/GET/versões');
  const o1 = orcamentoValido('orc_a', 'Cliente A');
  igual('PUT sem CSRF → 403', (await A.chamar('PUT', '/api/orcamentos/orc_a', { dados: o1, versaoBase: null }, { semCsrf: true })).status, 403);
  igual('PUT com id divergente → 400', (await A.put('/api/orcamentos/outro', { dados: o1, versaoBase: null })).status, 400);
  const ruim = JSON.parse(JSON.stringify(o1)); ruim.cliente.uf = 'XX';
  igual('PUT inválido pelo motor → 400', (await A.put('/api/orcamentos/orc_a', { dados: ruim, versaoBase: null })).status, 400);
  r = await A.put('/api/orcamentos/orc_a', { dados: o1, versaoBase: null });
  igual('criar → versão 1 com autor', [r.status, r.corpo.versao, r.corpo.atualizadoPor], [200, 1, 'Administrador']);
  r = await A.get('/api/orcamentos/orc_a');
  igual('GET devolve dados e metadados', [r.corpo.versao, r.corpo.criadoPor, r.corpo.dados.cliente.nome], [1, 'Administrador', 'Cliente A']);
  const o1b = JSON.parse(JSON.stringify(o1)); o1b.cliente.nome = 'Cliente A (B)';
  r = await B.put('/api/orcamentos/orc_a', { dados: o1b, versaoBase: 1 });
  igual('máquina B grava com versaoBase 1 → versão 2', [r.status, r.corpo.versao], [200, 2]);
  const o1a = JSON.parse(JSON.stringify(o1)); o1a.cliente.nome = 'Cliente A (A)';
  r = await A.put('/api/orcamentos/orc_a', { dados: o1a, versaoBase: 1 });
  igual('máquina A com versaoBase velha → 409 com a versão atual (de B)', [r.status, r.corpo.atual.versao, r.corpo.atual.dados.cliente.nome, r.corpo.atual.atualizadoPor], [409, 2, 'Cliente A (B)', 'Administrador']);
  r = await A.put('/api/orcamentos/orc_a', { dados: o1a, versaoBase: 2 });
  igual('A sobrescreve com a versão vista (2) → 3', [r.status, r.corpo.versao], [200, 3]);
  igual('PUT de novo com versaoBase null num id existente → 409', (await A.put('/api/orcamentos/orc_a', { dados: o1a, versaoBase: null })).status, 409);
  igual('histórico tem 3 versões', (await S.ctx.repo.historico('orc_a')).length, 3);

  console.log('--- exclusão, 410 e recriar');
  igual('DELETE sem versaoBase → 400', (await A.del('/api/orcamentos/orc_a')).status, 400);
  igual('DELETE com versão velha → 409', (await A.del('/api/orcamentos/orc_a?versaoBase=2')).status, 409);
  r = await A.del('/api/orcamentos/orc_a?versaoBase=3');
  igual('DELETE OK → versão 4 e excluidoEm', [r.status, r.corpo.versao, !!r.corpo.excluidoEm], [200, 4, true]);
  igual('DELETE repetido é idempotente', (await A.del('/api/orcamentos/orc_a?versaoBase=4')).status, 200);
  r = await B.put('/api/orcamentos/orc_a', { dados: o1b, versaoBase: 2 });
  igual('B grava um excluído → 410 com quem excluiu', [r.status, r.corpo.excluidoPor, r.corpo.versao], [410, 'Administrador', 4]);
  r = await B.put('/api/orcamentos/orc_a', { dados: o1b, recriar: true });
  igual('B recria → versão 5, sem exclusão', [r.status, r.corpo.versao, (await B.get('/api/orcamentos/orc_a')).corpo.excluidoEm], [200, 5, null]);
  igual('recriar um não excluído → 409 (não é atalho para sobrescrever)', (await A.put('/api/orcamentos/orc_a', { dados: o1a, recriar: true })).status, 409);
  igual('GET inexistente → 404', (await A.get('/api/orcamentos/nao_existe')).status, 404);
  igual('DELETE inexistente → 200 inexistente', (await A.del('/api/orcamentos/nao_existe?versaoBase=1')).corpo.inexistente, true);

  console.log('--- sync incremental');
  S.ctx.avancarRelogio(5000);                                            // fora da sobreposição de 2 s do sync
  r = await A.get('/api/sync');
  igual('carga completa: 1 orçamento, config versão 2, agora do servidor', [r.corpo.orcamentos.length, r.corpo.config.versao, typeof r.corpo.agora], [1, 2, 'string']);
  const marca = r.corpo.agora;
  S.ctx.avancarRelogio(5000);
  await B.put('/api/orcamentos/orc_b', { dados: orcamentoValido('orc_b', 'Cliente B'), versaoBase: null });
  r = await A.get('/api/sync?desde=' + encodeURIComponent(marca));
  igual('desde a marca: só o novo orc_b', r.corpo.orcamentos.map(o => o.id), ['orc_b']);
  S.ctx.avancarRelogio(5000);
  const marca2 = (await A.get('/api/sync')).corpo.agora;
  S.ctx.avancarRelogio(5000);
  await B.del('/api/orcamentos/orc_b?versaoBase=1');
  r = await A.get('/api/sync?desde=' + encodeURIComponent(marca2));
  igual('exclusão aparece no sync com dados null', r.corpo.orcamentos.map(o => [o.id, o.excluidoEm !== null, o.dados]), [['orc_b', true, null]]);
  igual('desde inválido → 400', (await A.get('/api/sync?desde=ontem')).status, 400);

  console.log('--- importar-local (migração)');
  const loc1 = orcamentoValido('orc_local1', 'Local 1'), loc2 = orcamentoValido('orc_a', 'Cópia divergente de A'), loc3 = JSON.parse(JSON.stringify(o1b));
  const inv = orcamentoValido('orc_inv'); inv.itens = 'abc';
  r = await X.post('/api/orcamentos/importar-local', { orcamentos: [loc1, loc2, loc3, inv] });
  igual('relatório: criado / renomeado (divergente) / igual / inválido', r.corpo.resultado.map(x => x.status), ['criado', 'renomeado', 'igual', 'invalido']);
  ok(/^orc_a_m/.test(r.corpo.resultado[1].novoId), 'divergente ganhou id novo: ' + r.corpo.resultado[1].novoId);
  igual('lista agora tem 4 vivos (a, b excluído não conta)', (await A.get('/api/sync')).corpo.orcamentos.filter(o => !o.excluidoEm).length, 3);
  igual('lista > 500 → 400', (await X.post('/api/orcamentos/importar-local', { orcamentos: new Array(501).fill({}) })).status, 400);

  console.log('--- sessão: expiração e logout');
  S.ctx.avancarRelogio(31 * 86400000);
  igual('após 31 dias sem uso a sessão expira → 401', (await X.get('/api/sessao')).status, 401);
  igual('A também expirou (31 dias sem uso)', (await A.get('/api/sessao')).status, 401);
  await A.login('admin@maisglass.local', 'novaSenha123');
  igual('logout limpa o cookie e invalida', [(await A.post('/api/logout')).status, A.cookie(), (await A.get('/api/sessao')).status], [200, '', 401]);
  igual('rota inexistente → 404', (await A.get('/api/nada')).status, 404);

  await S.fechar();
  if (S.ctx.repo._sql && S.ctx.repo._sql.fechar) await S.ctx.repo._sql.fechar();
  console.log('\n' + (falhas.length ? 'FALHAS: ' + falhas.length + ' de ' + total : 'Todos os testes da API passaram (' + total + ' verificações).'));
  if (falhas.length) { falhas.forEach(f => console.log('  - ' + f)); process.exit(1); }
})().catch(e => { console.error('ERRO NO SCRIPT:', e); process.exit(1); });

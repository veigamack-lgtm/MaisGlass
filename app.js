/* =====================================================================
 * app.js (servidor) — rotas da API e regras de negócio. Independente de onde roda:
 *   - na Vercel, cada arquivo em api/ chama handlerVercel(rota);
 *   - nos testes e no servidor local, o roteador recebe (método, caminho, req, res) com o repositório em memória.
 * Contrato completo em PROJETO-NUVEM.md §8.
 * ===================================================================== */
'use strict';
const auth = require('./auth');
const validar = require('./validar');
const repositorio = require('./repositorio');

const VERSAO_API = '1.0';

class ErroHttp extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra || {}; } }

/* ---------- utilitários HTTP ---------- */
function json(res, status, corpo, cabecalhos) {
  const texto = JSON.stringify(corpo === undefined ? {} : corpo);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (cabecalhos) Object.keys(cabecalhos).forEach(k => res.setHeader(k, cabecalhos[k]));
  res.end(texto);
}
async function lerCorpo(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') return req.body;   // Vercel já analisa JSON
  if (typeof req.body === 'string') { if (!req.body.trim()) return {}; try { return JSON.parse(req.body); } catch (e) { throw new ErroHttp(400, 'JSON inválido.'); } }
  if (Buffer.isBuffer(req.body)) { const t = req.body.toString('utf8'); if (!t.trim()) return {}; try { return JSON.parse(t); } catch (e) { throw new ErroHttp(400, 'JSON inválido.'); } }
  const partes = []; let total = 0;
  for await (const p of req) { total += p.length; if (total > validar.LIMITE_BYTES + 1024) throw new ErroHttp(413, 'Corpo grande demais.'); partes.push(p); }
  const s = Buffer.concat(partes).toString('utf8');
  if (!s) return {};
  try { return JSON.parse(s); } catch (e) { throw new ErroHttp(400, 'JSON inválido.'); }
}
function seguro(req) { return !!process.env.VERCEL || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'; }
function publico(u) { return u && { id: u.id, email: u.email, nome: u.nome, papel: u.papel, ativo: u.ativo, ultimoAcesso: u.ultimoAcesso || null, criadoEm: u.criadoEm, senhaPendente: !u.senhaTrocadaEm }; }

/* ---------- contexto ---------- */
function contextoPadrao() {
  return { repo: repositorio.doAmbiente(), agora: () => new Date().toISOString(), env: process.env };
}
async function preparar(ctx) {
  await ctx.repo.garantirEsquema();
  if (!ctx._bootstrap) {
    ctx._bootstrap = (async () => {
      const n = await ctx.repo.contarUsuarios();
      const email = ctx.env.ADMIN_EMAIL, senha = ctx.env.ADMIN_SENHA_INICIAL;
      if (n === 0 && email && senha) {
        try { await ctx.repo.criarUsuario({ email: validar.email(email), nome: 'Administrador', senhaHash: auth.hashSenha(senha), papel: 'admin', senhaTrocadaEm: ctx.env.ADMIN_SENHA_TROCADA ? ctx.agora() : null, criadoEm: ctx.agora() }); }
        catch (e) { if (e.codigo !== 'duplicado') throw e; }
      }
      return true;
    })().catch(e => { ctx._bootstrap = null; throw e; });
  }
  await ctx._bootstrap;
}

/* ---------- autenticação nas rotas ---------- */
async function exigirSessao(ctx, req) {
  const s = await auth.sessaoDe(ctx, req);
  if (!s) throw new ErroHttp(401, 'Sessão inválida ou expirada. Entre de novo.');
  return s;
}
function exigirAdmin(s) { if (s.usuario.papel !== 'admin') throw new ErroHttp(403, 'Só administradores podem fazer isso.'); }
function exigirCsrf(req) { if (!auth.csrfOk(req)) throw new ErroHttp(403, 'Requisição não permitida (cabeçalho X-Requested-With ausente).'); }

/* ---------- rotas ---------- */
const rotas = {
  async saude(ctx, req, res) {
    let banco = 'ok';
    try { await ctx.repo.saude(); } catch (e) { banco = 'erro: ' + e.message; }
    json(res, banco === 'ok' ? 200 : 503, { ok: banco === 'ok', banco, versaoApi: VERSAO_API, motor: validar.ORC.VERSAO_MOTOR });
  },

  async login(ctx, req, res) {
    if (req.method !== 'POST') throw new ErroHttp(405, 'Método não permitido.');
    exigirCsrf(req);
    const corpo = await lerCorpo(req);
    let email; try { email = validar.email(corpo.email); } catch (e) { throw new ErroHttp(400, 'E-mail ou senha incorretos.'); }
    const senha = String(corpo.senha || '');
    const ip = auth.ipDe(req), agora = ctx.agora();
    const desde = new Date(new Date(agora).getTime() - auth.TENTATIVAS_JANELA_MIN * 60000).toISOString();
    if (await ctx.repo.contarTentativas(email, ip, desde) >= auth.TENTATIVAS_MAX) throw new ErroHttp(429, 'Muitas tentativas. Aguarde ' + auth.TENTATIVAS_JANELA_MIN + ' minutos e tente de novo.');
    const u = await ctx.repo.usuarioPorEmail(email);
    const ok = !!u && u.ativo && auth.verificarSenha(senha, u.senhaHash);
    if (!ok) { await ctx.repo.registrarTentativa(email, ip, agora); throw new ErroHttp(401, 'E-mail ou senha incorretos.'); }
    await ctx.repo.limparTentativas(email);
    const token = auth.gerarToken();
    await ctx.repo.criarSessao({ tokenHash: auth.hashToken(token), usuarioId: u.id, criadoEm: agora, expiraEm: auth.expiraEmDias(agora, auth.SESSAO_DIAS), ultimoUso: agora, agente: String(req.headers['user-agent'] || '').slice(0, 200) });
    await ctx.repo.atualizarUsuario(u.id, { ultimoAcesso: agora });
    json(res, 200, { usuario: publico(u), precisaTrocarSenha: !u.senhaTrocadaEm }, { 'Set-Cookie': auth.cookieSessao(token, seguro(req), auth.SESSAO_DIAS * 86400) });
  },

  async logout(ctx, req, res) {
    if (req.method !== 'POST') throw new ErroHttp(405, 'Método não permitido.');
    const token = auth.lerCookies(req)[auth.COOKIE];
    if (token) await ctx.repo.apagarSessao(auth.hashToken(token));
    json(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieLimpar(seguro(req)) });
  },

  async sessao(ctx, req, res) {
    const s = await exigirSessao(ctx, req);
    json(res, 200, { usuario: publico(s.usuario), precisaTrocarSenha: !s.usuario.senhaTrocadaEm, versaoApi: VERSAO_API });
  },

  async senha(ctx, req, res) {
    if (req.method !== 'POST') throw new ErroHttp(405, 'Método não permitido.');
    exigirCsrf(req);
    const s = await exigirSessao(ctx, req);
    const corpo = await lerCorpo(req);
    if (!auth.verificarSenha(String(corpo.atual || ''), s.usuario.senhaHash)) throw new ErroHttp(400, 'Senha atual incorreta.');
    if (!auth.senhaAceitavel(corpo.nova)) throw new ErroHttp(400, 'A nova senha precisa ter pelo menos ' + auth.SENHA_MIN + ' caracteres.');
    if (corpo.nova === corpo.atual) throw new ErroHttp(400, 'A nova senha precisa ser diferente da atual.');
    await ctx.repo.atualizarUsuario(s.usuario.id, { senhaHash: auth.hashSenha(corpo.nova), senhaTrocadaEm: ctx.agora() });
    await ctx.repo.apagarSessoesDoUsuario(s.usuario.id, s.tokenHash);   // derruba as outras máquinas
    json(res, 200, { ok: true });
  },

  /* tudo que mudou desde `desde` (sem `desde` = carga completa) */
  async sync(ctx, req, res, q) {
    const s = await exigirSessao(ctx, req);
    const desde = q.desde ? String(q.desde) : null;
    if (desde && isNaN(Date.parse(desde))) throw new ErroHttp(400, 'Parâmetro desde inválido.');
    const agora = ctx.agora();
    const sobreposicao = desde ? new Date(new Date(desde).getTime() - 2000).toISOString() : null;
    const lista = await ctx.repo.listarOrcamentos(sobreposicao);
    const nomes = await mapaNomes(ctx);
    const orcamentos = lista.map(o => resumoOrc(o, nomes));
    const cfg = await ctx.repo.lerConfig();
    json(res, 200, { agora, usuario: publico(s.usuario), orcamentos, config: cfg ? { versao: cfg.versao, atualizadoEm: cfg.atualizadoEm, atualizadoPor: nomes[cfg.atualizadoPor] || null, dados: cfg.dados } : null });
  },

  async orcamento(ctx, req, res, q, id) {
    const s = await exigirSessao(ctx, req);
    if (!id || typeof id !== 'string' || id.length > 80) throw new ErroHttp(400, 'Id inválido.');
    const nomes = await mapaNomes(ctx);
    if (req.method === 'GET') {
      const o = await ctx.repo.orcamentoPorId(id);
      if (!o) throw new ErroHttp(404, 'Orçamento não encontrado.');
      return json(res, 200, resumoOrc(o, nomes));
    }
    exigirCsrf(req);
    const agora = ctx.agora();
    if (req.method === 'DELETE') {
      const vb = q.versaoBase === undefined || q.versaoBase === '' ? null : Number(q.versaoBase);
      const atual = await ctx.repo.orcamentoPorId(id);
      if (!atual) return json(res, 200, { ok: true, inexistente: true });
      if (atual.excluidoEm) return json(res, 200, { ok: true, versao: atual.versao, excluidoEm: atual.excluidoEm });
      if (vb === null || !Number.isInteger(vb)) throw new ErroHttp(400, 'versaoBase obrigatória na exclusão.');
      const r = await ctx.repo.excluirOrcamento(id, vb, s.usuario.id, agora);
      if (!r) { const a = await ctx.repo.orcamentoPorId(id); throw new ErroHttp(409, 'Alterado em outra máquina.', { atual: resumoOrc(a, nomes) }); }
      return json(res, 200, { ok: true, versao: r.versao, excluidoEm: r.excluidoEm });
    }
    if (req.method !== 'PUT') throw new ErroHttp(405, 'Método não permitido.');
    const corpo = await lerCorpo(req);
    const dados = validar.orcamento(corpo.dados, id);
    const vb = corpo.versaoBase === undefined || corpo.versaoBase === null ? null : Number(corpo.versaoBase);
    if (vb !== null && !Number.isInteger(vb)) throw new ErroHttp(400, 'versaoBase inválida.');
    const atual = await ctx.repo.orcamentoPorId(id);
    if (!atual) {
      try { const r = await ctx.repo.inserirOrcamento({ id, dados, usuarioId: s.usuario.id, agora }); return json(res, 200, meta(r, nomes, s)); }
      catch (e) { if (e.codigo !== 'duplicado') throw e; }   // corrida: alguém inseriu antes → cai na avaliação abaixo
    }
    const existente = atual || await ctx.repo.orcamentoPorId(id);
    if (existente.excluidoEm) {
      if (!corpo.recriar) throw new ErroHttp(410, 'Excluído em outra máquina.', { excluidoEm: existente.excluidoEm, excluidoPor: nomes[existente.excluidoPor] || null, versao: existente.versao });
      const r = await ctx.repo.atualizarOrcamento(id, { dados, usuarioId: s.usuario.id, agora, recriar: true });
      if (!r) { const a = await ctx.repo.orcamentoPorId(id); throw new ErroHttp(409, 'Alterado em outra máquina.', { atual: resumoOrc(a, nomes) }); }
      return json(res, 200, meta(r, nomes, s));
    }
    if (vb === null || vb !== existente.versao) throw new ErroHttp(409, 'Alterado em outra máquina.', { atual: resumoOrc(existente, nomes) });
    const r = await ctx.repo.atualizarOrcamento(id, { dados, versaoEsperada: vb, usuarioId: s.usuario.id, agora });
    if (!r) { const a = await ctx.repo.orcamentoPorId(id); throw new ErroHttp(a.excluidoEm ? 410 : 409, a.excluidoEm ? 'Excluído em outra máquina.' : 'Alterado em outra máquina.', a.excluidoEm ? { excluidoEm: a.excluidoEm, excluidoPor: nomes[a.excluidoPor] || null, versao: a.versao } : { atual: resumoOrc(a, nomes) }); }
    json(res, 200, meta(r, nomes, s));
  },

  /* migração inicial: os orçamentos que estavam presos no navegador de uma máquina */
  async importarLocal(ctx, req, res) {
    if (req.method !== 'POST') throw new ErroHttp(405, 'Método não permitido.');
    exigirCsrf(req);
    const s = await exigirSessao(ctx, req);
    const corpo = await lerCorpo(req);
    if (!Array.isArray(corpo.orcamentos) || corpo.orcamentos.length > 500) throw new ErroHttp(400, 'Envie uma lista de até 500 orçamentos.');
    const agora = ctx.agora(), resultado = [];
    for (const bruto of corpo.orcamentos) {
      const idOrig = bruto && bruto.id;
      let dados;
      try { dados = validar.orcamento(bruto); } catch (e) { resultado.push({ id: idOrig || null, status: 'invalido', motivo: e.message }); continue; }
      const existente = await ctx.repo.orcamentoPorId(dados.id);
      if (!existente) {
        try { const r = await ctx.repo.inserirOrcamento({ id: dados.id, dados, usuarioId: s.usuario.id, agora }); resultado.push({ id: dados.id, status: 'criado', versao: r.versao }); continue; }
        catch (e) { if (e.codigo !== 'duplicado') throw e; }
      }
      const atual = existente || await ctx.repo.orcamentoPorId(dados.id);
      if (!atual.excluidoEm && canonico(atual.dados) === canonico(dados)) { resultado.push({ id: dados.id, status: 'igual', versao: atual.versao }); continue; }
      const novoId = dados.id + '_m' + Math.random().toString(36).slice(2, 7);
      const copia = Object.assign({}, dados, { id: novoId });
      const r = await ctx.repo.inserirOrcamento({ id: novoId, dados: copia, usuarioId: s.usuario.id, agora });
      resultado.push({ id: dados.id, status: 'renomeado', novoId, versao: r.versao, motivo: atual.excluidoEm ? 'o id já existia no servidor e estava excluído' : 'o id já existia no servidor com conteúdo diferente' });
    }
    json(res, 200, { resultado, agora });
  },

  async config(ctx, req, res) {
    const s = await exigirSessao(ctx, req);
    const nomes = await mapaNomes(ctx);
    if (req.method === 'GET') {
      const c = await ctx.repo.lerConfig();
      return json(res, 200, c ? { versao: c.versao, atualizadoEm: c.atualizadoEm, atualizadoPor: nomes[c.atualizadoPor] || null, dados: c.dados } : null);
    }
    if (req.method !== 'PUT') throw new ErroHttp(405, 'Método não permitido.');
    exigirCsrf(req); exigirAdmin(s);
    const corpo = await lerCorpo(req);
    const dados = validar.config(corpo.dados);
    const vb = corpo.versaoBase === undefined || corpo.versaoBase === null ? null : Number(corpo.versaoBase);
    if (vb !== null && !Number.isInteger(vb)) throw new ErroHttp(400, 'versaoBase inválida.');
    const r = await ctx.repo.gravarConfig({ dados, versaoEsperada: vb, usuarioId: s.usuario.id, agora: ctx.agora() });
    if (!r) { const c = await ctx.repo.lerConfig(); throw new ErroHttp(409, 'A configuração foi alterada em outra máquina.', { atual: c ? { versao: c.versao, atualizadoEm: c.atualizadoEm, atualizadoPor: nomes[c.atualizadoPor] || null, dados: c.dados } : null }); }
    json(res, 200, { versao: r.versao, atualizadoEm: r.atualizadoEm, atualizadoPor: s.usuario.nome });
  },

  async usuarios(ctx, req, res, q, id) {
    const s = await exigirSessao(ctx, req); exigirAdmin(s);
    if (req.method === 'GET') { const l = await ctx.repo.listarUsuarios(); return json(res, 200, { usuarios: l.map(publico) }); }
    exigirCsrf(req);
    const corpo = await lerCorpo(req), agora = ctx.agora();
    if (req.method === 'POST') {
      const email = validar.email(corpo.email), nome = validar.texto(corpo.nome, 'Nome', 120);
      const papel = corpo.papel === 'admin' ? 'admin' : 'usuario';
      const senhaInicial = auth.gerarSenhaInicial();
      let u;
      try { u = await ctx.repo.criarUsuario({ email, nome, senhaHash: auth.hashSenha(senhaInicial), papel, senhaTrocadaEm: null, criadoEm: agora, criadoPor: s.usuario.id }); }
      catch (e) { if (e.codigo === 'duplicado') throw new ErroHttp(409, 'Já existe usuário com esse e-mail.'); throw e; }
      return json(res, 200, { usuario: publico(u), senhaInicial });
    }
    if (req.method !== 'PATCH') throw new ErroHttp(405, 'Método não permitido.');
    const alvoId = Number(id);
    const alvo = await ctx.repo.usuarioPorId(alvoId);
    if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado.');
    const campos = {};
    if (corpo.nome !== undefined) campos.nome = validar.texto(corpo.nome, 'Nome', 120);
    if (corpo.papel !== undefined) { if (['admin', 'usuario'].indexOf(corpo.papel) < 0) throw new ErroHttp(400, 'Papel inválido.'); campos.papel = corpo.papel; }
    if (corpo.ativo !== undefined) { if (typeof corpo.ativo !== 'boolean') throw new ErroHttp(400, 'ativo deve ser verdadeiro/falso.'); campos.ativo = corpo.ativo; }
    const perdeAdmin = alvo.papel === 'admin' && alvo.ativo && ((campos.papel && campos.papel !== 'admin') || campos.ativo === false);
    if (perdeAdmin) {
      if (alvo.id === s.usuario.id) throw new ErroHttp(400, 'Você não pode se desativar nem deixar de ser administrador.');
      const todos = await ctx.repo.listarUsuarios();
      if (todos.filter(u => u.papel === 'admin' && u.ativo && u.id !== alvo.id).length === 0) throw new ErroHttp(400, 'Não é possível remover o último administrador ativo.');
    }
    let senhaInicial = null;
    if (corpo.redefinirSenha === true) { senhaInicial = auth.gerarSenhaInicial(); campos.senhaHash = auth.hashSenha(senhaInicial); campos.senhaTrocadaEm = null; }
    const u = await ctx.repo.atualizarUsuario(alvoId, campos);
    if (campos.ativo === false || senhaInicial) await ctx.repo.apagarSessoesDoUsuario(alvoId, null);
    json(res, 200, { usuario: publico(u), senhaInicial });
  }
};

/* JSON com chaves ordenadas (o jsonb do Postgres reordena chaves; a comparação não pode depender disso) */
function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
async function mapaNomes(ctx) {
  const l = await ctx.repo.listarUsuarios(); const m = {};
  l.forEach(u => { m[u.id] = u.nome || u.email; });
  return m;
}
function resumoOrc(o, nomes) {
  return { id: o.id, versao: o.versao, criadoEm: o.criadoEm, criadoPor: nomes[o.criadoPor] || null, atualizadoEm: o.atualizadoEm, atualizadoPor: nomes[o.atualizadoPor] || null,
    excluidoEm: o.excluidoEm || null, excluidoPor: o.excluidoEm ? (nomes[o.excluidoPor] || null) : null, dados: o.excluidoEm ? null : o.dados };
}
function meta(r, nomes, s) { return { versao: r.versao, atualizadoEm: r.atualizadoEm, atualizadoPor: s.usuario.nome || s.usuario.email, criadoPor: nomes[r.criadoPor] || null, criadoEm: r.criadoEm }; }

/* ---------- roteador: (método, caminho com query) → rota ---------- */
function analisar(url) {
  const u = new URL(url, 'http://x');
  const q = {}; u.searchParams.forEach((v, k) => { q[k] = v; });
  return { caminho: u.pathname.replace(/\/+$/, ''), q };
}
function resolver(caminho) {
  let m;
  if (caminho === '/api/saude') return ['saude'];
  if (caminho === '/api/login') return ['login'];
  if (caminho === '/api/logout') return ['logout'];
  if (caminho === '/api/sessao') return ['sessao'];
  if (caminho === '/api/senha') return ['senha'];
  if (caminho === '/api/sync') return ['sync'];
  if (caminho === '/api/config') return ['config'];
  if (caminho === '/api/orcamentos/importar-local') return ['importarLocal'];
  if ((m = /^\/api\/orcamentos\/([^/]+)$/.exec(caminho))) return ['orcamento', decodeURIComponent(m[1])];
  if (caminho === '/api/usuarios') return ['usuarios', null];
  if ((m = /^\/api\/usuarios\/([^/]+)$/.exec(caminho))) return ['usuarios', decodeURIComponent(m[1])];
  return null;
}
async function despachar(ctx, req, res, nomeRota, id) {
  try {
    const { caminho, q } = analisar(req.url || '/');
    const r = nomeRota ? [nomeRota, id] : resolver(caminho);
    if (!r) throw new ErroHttp(404, 'Rota não encontrada.');
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (r[0] !== 'saude') await preparar(ctx);
    else { try { await preparar(ctx); } catch (e) { return json(res, 503, { ok: false, banco: 'erro: ' + e.message, versaoApi: VERSAO_API }); } }
    await rotas[r[0]](ctx, req, res, q, r[1] !== undefined ? r[1] : id);
  } catch (e) {
    if (e instanceof ErroHttp) return json(res, e.status, Object.assign({ erro: e.message }, e.extra));
    if (e instanceof validar.ErroValidacao) return json(res, 400, { erro: e.message, detalhes: e.detalhes });
    if (e && e.codigo === 'sem_banco') return json(res, 503, { erro: e.message });
    console.error('Erro na API', req.method, req.url, e);
    return json(res, 500, { erro: 'Erro interno no servidor: ' + (e && e.message ? e.message : String(e)) });
  }
}

/* handler de um arquivo da Vercel: api/<rota>.js → module.exports = handlerVercel('rota') */
let ctxVercel = null;
function handlerVercel(nomeRota) {
  return async function (req, res) {
    try { if (!ctxVercel) ctxVercel = contextoPadrao(); }
    catch (e) { return json(res, 503, { erro: e.message }); }
    const id = req.query && req.query.id !== undefined ? String(req.query.id) : undefined;
    return despachar(ctxVercel, req, res, nomeRota, id);
  };
}

module.exports = { rotas, despachar, handlerVercel, contextoPadrao, preparar, resolver, ErroHttp, json, VERSAO_API };

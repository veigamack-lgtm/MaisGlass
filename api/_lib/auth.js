/* =====================================================================
 * auth.js — senhas (scrypt), tokens de sessão, cookie, CSRF e limite de tentativas.
 * Sem segredo de assinatura: a sessão é um token aleatório cujo SHA-256 fica no banco.
 * ===================================================================== */
'use strict';
const crypto = require('crypto');

const COOKIE = 'gm_sessao';
const SESSAO_DIAS = 30;
const RENOVA_MS = 60 * 60 * 1000;          // renova a validade no máximo uma vez por hora
const TENTATIVAS_MAX = 10;
const TENTATIVAS_JANELA_MIN = 15;
const SENHA_MIN = 8;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, 64, SCRYPT);
  return 'scrypt$' + SCRYPT.N + '$' + sal.toString('base64') + '$' + h.toString('base64');
}
function verificarSenha(senha, guardado) {
  try {
    const p = String(guardado || '').split('$');
    if (p.length !== 4 || p[0] !== 'scrypt') return false;
    const sal = Buffer.from(p[2], 'base64'), esperado = Buffer.from(p[3], 'base64');
    const h = crypto.scryptSync(String(senha), sal, esperado.length, Object.assign({}, SCRYPT, { N: Number(p[1]) }));
    return h.length === esperado.length && crypto.timingSafeEqual(h, esperado);
  } catch (e) { return false; }
}
function senhaAceitavel(s) { return typeof s === 'string' && s.length >= SENHA_MIN && s.length <= 200; }
function gerarSenhaInicial() {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; const b = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) s += alfabeto[b[i] % alfabeto.length];
  return s;
}
function gerarToken() { return crypto.randomBytes(32).toString('base64url'); }
function hashToken(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }

function lerCookies(req) {
  const out = {}; const h = req.headers && req.headers.cookie; if (!h) return out;
  String(h).split(';').forEach(par => { const i = par.indexOf('='); if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim()); });
  return out;
}
function cookieSessao(token, seguro, maxAgeSeg) {
  return COOKIE + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax' + (seguro ? '; Secure' : '') + '; Max-Age=' + maxAgeSeg;
}
function cookieLimpar(seguro) { return cookieSessao('', seguro, 0); }

/* CSRF: toda mutação precisa do cabeçalho X-Requested-With: MaisGlass (formulários de terceiros não conseguem enviá-lo) */
function csrfOk(req) { return String(req.headers['x-requested-with'] || '').toLowerCase() === 'maisglass'; }

function ipDe(req) {
  const xf = req.headers['x-forwarded-for']; if (xf) return String(xf).split(',')[0].trim();
  const rip = req.headers['x-real-ip']; if (rip) return String(rip);
  return (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

/* Sessão a partir do cookie; devolve { usuario, sessao } ou null. Renova a validade quando passou mais de uma hora. */
async function sessaoDe(ctx, req) {
  const token = lerCookies(req)[COOKIE]; if (!token) return null;
  const th = hashToken(token);
  const r = await ctx.repo.sessaoPorToken(th); if (!r) return null;
  const agora = ctx.agora();
  if (r.sessao.expiraEm < agora || !r.usuario.ativo) { await ctx.repo.apagarSessao(th); return null; }
  if (new Date(agora) - new Date(r.sessao.ultimoUso) > RENOVA_MS) {
    await ctx.repo.tocarSessao(th, expiraEmDias(agora, SESSAO_DIAS), agora);
    await ctx.repo.atualizarUsuario(r.usuario.id, { ultimoAcesso: agora });
  }
  return { usuario: r.usuario, sessao: r.sessao, tokenHash: th };
}
function expiraEmDias(agoraIso, dias) { return new Date(new Date(agoraIso).getTime() + dias * 86400000).toISOString(); }

module.exports = { COOKIE, SESSAO_DIAS, TENTATIVAS_MAX, TENTATIVAS_JANELA_MIN, SENHA_MIN, hashSenha, verificarSenha, senhaAceitavel, gerarSenhaInicial, gerarToken, hashToken, lerCookies, cookieSessao, cookieLimpar, csrfOk, ipDe, sessaoDe, expiraEmDias };

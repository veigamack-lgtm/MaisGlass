/* =====================================================================
 * servidor-local.js — serve os arquivos estáticos do app + a MESMA API de api/ com o repositório em
 * memória (sem Vercel, sem Neon). Usado pelos testes (api.js, ui.js, Playwright) e para desenvolvimento local.
 *
 *   node test/servidor-local.js            → http://localhost:8765, admin admin@maisglass.local / admin12345
 *   PORTA=9000 ADMIN_EMAIL=... ADMIN_SENHA_INICIAL=... node test/servidor-local.js
 *   DATABASE_URL=postgres://... node test/servidor-local.js   → usa o Neon de verdade (cuidado: dados reais)
 * ===================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { despachar } = require('../api/_lib/app');
const repositorio = require('../api/_lib/repositorio');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };

function criarContexto(opts) {
  opts = opts || {};
  const env = Object.assign({ ADMIN_EMAIL: 'admin@maisglass.local', ADMIN_SENHA_INICIAL: 'admin12345' }, process.env, opts.env || {});
  let repo = opts.repo;
  if (!repo && env.PG_TESTE_URL) repo = repositorio.neon(env.PG_TESTE_URL, { sql: require('./_pg-executor')(env.PG_TESTE_URL) });   // Postgres local via pg (testes do SQL)
  if (!repo) repo = env.DATABASE_URL ? repositorio.neon(env.DATABASE_URL) : repositorio.memoria();
  let deslocamento = 0;
  const ctx = { repo, env, agora: () => new Date(Date.now() + deslocamento).toISOString(), avancarRelogio: (ms) => { deslocamento += ms; } };
  return ctx;
}

function iniciar(opts) {
  opts = opts || {};
  const ctx = opts.ctx || criarContexto(opts);
  const servidor = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/')) return despachar(ctx, req, res);
    let arq = decodeURIComponent(u.pathname); if (arq === '/' || arq === '') arq = '/index.html';
    const abs = path.normalize(path.join(RAIZ, arq));
    if (!abs.startsWith(RAIZ) || arq.startsWith('/api/') || arq.startsWith('/node_modules/')) { res.statusCode = 404; return res.end('não encontrado'); }
    fs.readFile(abs, (err, buf) => {
      if (err) { res.statusCode = 404; return res.end('não encontrado'); }
      res.setHeader('Content-Type', TIPOS[path.extname(abs)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(buf);
    });
  });
  return new Promise((resolve, reject) => {
    servidor.on('error', reject);
    servidor.listen(opts.porta || 0, '127.0.0.1', () => {
      const porta = servidor.address().port;
      resolve({ url: 'http://localhost:' + porta, porta, ctx, servidor, fechar: () => new Promise(r => servidor.close(r)) });
    });
  });
}

module.exports = { iniciar, criarContexto };

if (require.main === module) {
  iniciar({ porta: Number(process.env.PORTA || 8765) }).then(s => {
    console.log('MaisGlass local em ' + s.url + '  (API em memória' + (s.ctx.repo.tipo === 'neon' ? ' NÃO: Neon real via DATABASE_URL' : '') + ')');
    console.log('Login: ' + s.ctx.env.ADMIN_EMAIL + ' / ' + s.ctx.env.ADMIN_SENHA_INICIAL);
  }).catch(e => { console.error(e); process.exit(1); });
}

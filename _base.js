/* Base comum dos scripts Playwright: verificações com assert (o processo sai com código 1 se qualquer uma falhar),
 * erros de página (pageerror) coletados em TODAS as páginas do contexto, login e utilitários de navegação. */
const { chromium } = require('playwright');
const assert = require('assert');

const path = require('path');
const servidorLocal = require(path.join(__dirname, '..', 'servidor-local.js'));
const ADMIN = { email: process.env.GM_EMAIL || 'admin@maisglass.local', senha: process.env.GM_SENHA || 'admin12345' };
const falhas = []; let total = 0;

function ok(cond, msg, extra) { total++; if (cond) console.log('OK    ' + msg); else { falhas.push(msg); console.log('FALHA ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } }
function igual(msg, obtido, esperado) { const a = JSON.stringify(obtido), b = JSON.stringify(esperado); ok(a === b, msg + ': ' + a + (a === b ? '' : ' ≠ esperado ' + b)); }
function contem(msg, texto, trecho) { ok(typeof texto === 'string' && texto.indexOf(trecho) >= 0, msg + ' (contém "' + trecho + '")', typeof texto === 'string' ? texto.slice(0, 120) : texto); }

async function iniciar(opts) {
  opts = opts || {};
  // servidor local próprio (arquivos + API em memória) — ou GM_URL para apontar para outro (ex.: a Vercel de testes)
  const srv = process.env.GM_URL ? null : await servidorLocal.iniciar({ env: { ADMIN_SENHA_TROCADA: '1' } });
  const URL = process.env.GM_URL || (srv.url + '/index.html');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errosPagina = [];
  ctx.on('page', pg => {                                   // toda página do contexto (abas abertas depois inclusive)
    pg.on('pageerror', e => errosPagina.push('[' + (pg.__rotulo || 'página') + '] ' + String(e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
    // respostas HTTP que o app trata de propósito (401 = sem sessão; 409/410 = conflito de versão) não são erro de página
    pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of (401|409|410)/.test(m.text())) errosPagina.push('[' + (pg.__rotulo || 'página') + '] console.error: ' + m.text().slice(0, 160)); });
  });
  const t = async (pg, id) => (await pg.textContent('#' + id)).trim();
  const disco = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('glassmais.orcamentos.v1') || '[]'));
  // entra (se a sessão do contexto ainda não existir) e espera o app abrir e a carga inicial da nuvem terminar
  const login = async (pg, cred) => {
    if (!/^http/.test(pg.url()) || pg.url().indexOf(URL.replace(/\/index\.html$/, '')) !== 0) await pg.goto(URL);
    await pg.waitForFunction(() => !document.getElementById('app').classList.contains('hidden') || (document.getElementById('loginInfo').textContent !== 'Conectando…'), null, { timeout: 15000 });
    if (await pg.locator('#app').evaluate(e => e.classList.contains('hidden'))) {
      const c = cred || ADMIN;
      await pg.fill('#loginEmail', c.email); await pg.fill('#loginSenha', c.senha); await pg.click('#loginBtn');
    }
    await pg.waitForFunction(() => !document.getElementById('app').classList.contains('hidden') && window.GM_NUVEM && window.GM_NUVEM.carregou(), null, { timeout: 15000 });
    await pg.waitForTimeout(150);
  };
  const aba = async (pg, nome) => { await pg.click('nav.tabs button[data-tab="' + nome + '"]'); await pg.waitForTimeout(150); };
  const linha = (pg, nome) => pg.locator('#orc-tabela tbody tr', { hasText: nome }).first();
  const abrir = async (pg, nome) => { await linha(pg, nome).locator('button:has-text("Abrir")').click(); await pg.waitForTimeout(150); };
  const novaPagina = async rotulo => { const pg = await ctx.newPage(); pg.__rotulo = rotulo; await login(pg); return pg; };
  const p = await novaPagina('aba 1');
  if (!opts.manterStorage) { await p.evaluate(() => localStorage.clear()); await p.reload(); await login(p); }
  async function fim() {
    await browser.close();
    if (srv) await srv.fechar();
    igual('erros de página (todas as abas)', errosPagina, []);
    console.log('\n' + (falhas.length ? 'FALHAS: ' + falhas.length + ' de ' + total : 'Todas as verificações passaram (' + total + ').'));
    if (falhas.length) { falhas.forEach(f => console.log('  - ' + f)); process.exit(1); }
  }
  return { browser, ctx, p, errosPagina, t, disco, login, aba, linha, abrir, novaPagina, fim, srv, URL, ADMIN };
}

function executar(fn) {
  fn().catch(e => { console.error('ERRO NO SCRIPT:', e && e.stack || e); process.exit(1); });
}

module.exports = { iniciar, executar, ok, igual, contem, assert };

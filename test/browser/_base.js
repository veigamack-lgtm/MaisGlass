/* Base comum dos scripts Playwright: verificações com assert (o processo sai com código 1 se qualquer uma falhar),
 * erros de página (pageerror) coletados em TODAS as páginas do contexto, login e utilitários de navegação. */
const { chromium } = require('playwright');
const assert = require('assert');

const URL = process.env.GM_URL || 'http://localhost:8765/index.html';
const falhas = []; let total = 0;

function ok(cond, msg, extra) { total++; if (cond) console.log('OK    ' + msg); else { falhas.push(msg); console.log('FALHA ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } }
function igual(msg, obtido, esperado) { const a = JSON.stringify(obtido), b = JSON.stringify(esperado); ok(a === b, msg + ': ' + a + (a === b ? '' : ' ≠ esperado ' + b)); }
function contem(msg, texto, trecho) { ok(typeof texto === 'string' && texto.indexOf(trecho) >= 0, msg + ' (contém "' + trecho + '")', typeof texto === 'string' ? texto.slice(0, 120) : texto); }

async function iniciar(opts) {
  opts = opts || {};
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errosPagina = [];
  ctx.on('page', pg => {                                   // toda página do contexto (abas abertas depois inclusive)
    pg.on('pageerror', e => errosPagina.push('[' + (pg.__rotulo || 'página') + '] ' + String(e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
    pg.on('console', m => { if (m.type() === 'error') errosPagina.push('[' + (pg.__rotulo || 'página') + '] console.error: ' + m.text().slice(0, 160)); });
  });
  const t = async (pg, id) => (await pg.textContent('#' + id)).trim();
  const disco = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('glassmais.orcamentos.v1') || '[]'));
  const login = async pg => { await pg.goto(URL); if (await pg.locator('#loginSenha').isVisible()) { await pg.fill('#loginSenha', 'glassmais'); await pg.click('#loginBtn'); } await pg.waitForTimeout(400); };
  const aba = async (pg, nome) => { await pg.click('nav.tabs button[data-tab="' + nome + '"]'); await pg.waitForTimeout(150); };
  const linha = (pg, nome) => pg.locator('#orc-tabela tbody tr', { hasText: nome }).first();
  const abrir = async (pg, nome) => { await linha(pg, nome).locator('button:has-text("Abrir")').click(); await pg.waitForTimeout(150); };
  const novaPagina = async rotulo => { const pg = await ctx.newPage(); pg.__rotulo = rotulo; await login(pg); return pg; };
  const p = await novaPagina('aba 1');
  if (!opts.manterStorage) { await p.evaluate(() => localStorage.clear()); await login(p); }
  async function fim() {
    await browser.close();
    igual('erros de página (todas as abas)', errosPagina, []);
    console.log('\n' + (falhas.length ? 'FALHAS: ' + falhas.length + ' de ' + total : 'Todas as verificações passaram (' + total + ').'));
    if (falhas.length) { falhas.forEach(f => console.log('  - ' + f)); process.exit(1); }
  }
  return { browser, ctx, p, errosPagina, t, disco, login, aba, linha, abrir, novaPagina, fim };
}

function executar(fn) {
  fn().catch(e => { console.error('ERRO NO SCRIPT:', e && e.stack || e); process.exit(1); });
}

module.exports = { iniciar, executar, ok, igual, contem, assert };

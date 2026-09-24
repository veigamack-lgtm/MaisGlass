/* Roda todos os scripts Playwright em sequência e sai com código 1 se qualquer um falhar.
 * Uso: node test/browser/todos.js   (servidor estático em http://localhost:8765 ou GM_URL) */
const { spawnSync } = require('child_process');
const path = require('path');
const SCRIPTS = ['orc.js', 'p3.js', 'p4.js', 'p5.js', 'p6.js', 'nuvem.js', 'help.js', 'f1a.js', 'resid.js', 'mig4.js', 'pdf.js'];
const resultado = [];
for (const s of SCRIPTS) {
  console.log('\n########## ' + s);
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: 'inherit', env: process.env });
  resultado.push([s, r.status]);
}
console.log('\n========== resumo');
resultado.forEach(([s, c]) => console.log((c === 0 ? 'OK    ' : 'FALHA ') + s + (c === 0 ? '' : ' (código ' + c + ')')));
process.exit(resultado.every(([, c]) => c === 0) ? 0 : 1);

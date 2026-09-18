/* Parecer nº 6 — reprodução em navegador real (duas abas) dos achados 1 (confirmação de recriação no protocolo adiado)
 * e 2 (recusa posterior cancela a gravação confirmada). Assert-based: sai com código 1 se qualquer verificação falhar
 * ou se houver erro de página em qualquer aba. O timer de 60 ms da gravação adiada é capturado na aba 1
 * (window.setTimeout) para sequenciar as ações da aba 2 de forma determinística; diálogos são reais. */
const { iniciar, executar, ok, igual, contem } = require('./_base');

executar(async () => {
  const B = await iniciar(); const { p, t, disco, aba, abrir, novaPagina } = B;
  const nomes = async pg => (await disco(pg)).map(o => o.cliente.nome).sort();
  const capturar = pg => pg.evaluate(() => { window.__cb = []; const st = window.setTimeout; window.__st = st; window.setTimeout = function (fn, ms) { if (ms === 60) { window.__cb.push(fn); return -1000 - window.__cb.length; } return st.apply(window, arguments); }; });
  const pendentes = pg => pg.evaluate(() => window.__cb.length);
  const dispararTodos = pg => pg.evaluate(() => { const l = window.__cb.splice(0); l.forEach(f => f()); return l.length; });
  const contarSetItem = pg => pg.evaluate(() => { window.__n = 0; if (!window.__si) { const si = Storage.prototype.setItem; window.__si = si; Storage.prototype.setItem = function (k, v) { if (k === 'glassmais.orcamentos.v1') window.__n++; return si.call(this, k, v); }; } return true; });
  const gravacoes = pg => pg.evaluate(() => window.__n);
  let dialogos = []; let resposta = () => true;
  p.on('dialog', async d => { dialogos.push(d.message().split('\n')[0]); const r = await resposta(d.message()); r ? await d.accept() : await d.dismiss(); });
  const p2 = await novaPagina('aba 2'); p2.on('dialog', d => d.accept());

  async function prepararConflito(nomeA) {
    // aba 1: A e B; aba 1 abre A; aba 2 altera A (a cópia da aba 1 fica velha)
    // encerra o cenário anterior: tira o foco do campo (o change agenda autosave) e deixa o autosave concluir ANTES de
    // limpar o storage — senão o pagehide do reload conclui esse autosave e recria o orçamento do cenário anterior
    await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); }); await p.waitForTimeout(800);
    await p.evaluate(() => { localStorage.removeItem('glassmais.orcamentos.v1'); sessionStorage.removeItem('glassmais.orcAtual'); });
    await p.reload(); await B.login(p); await aba(p, 'orcamentos');
    igual('cenário começa com o storage vazio', await nomes(p), []);
    for (const n of ['A original', 'B original']) { await p.click('#orcNovo'); await p.waitForTimeout(100); await p.fill('#o-nome', n); await p.waitForTimeout(700); await p.click('#orcVoltar'); await p.waitForTimeout(100); }
    await capturar(p); await contarSetItem(p);
    await p2.reload(); await B.login(p2); await aba(p2, 'orcamentos');
    await abrir(p, 'A original');
    await abrir(p2, 'A original'); await p2.fill('#o-nome', 'A da aba 2'); await p2.waitForTimeout(700); await p2.click('#orcVoltar'); await p2.waitForTimeout(150);
    dialogos = []; resposta = () => true;
    await p.fill('#o-nome', nomeA); await p.waitForTimeout(900);
    igual('conflito: 1ª confirmação aceita, 1 gravação adiada capturada', [dialogos.length, await pendentes(p)], [1, 1]);
  }
  const excluirNaAba2 = async nome => { await p2.locator('#orc-tabela tbody tr', { hasText: nome }).first().locator('button:has-text("Excluir")').click(); await p2.waitForTimeout(300); };

  console.log('--- achado 1(a): outra aba altera B DURANTE a pergunta de recriação de A');
  await prepararConflito('A local');
  await excluirNaAba2('A da aba 2');
  igual('aba 2 excluiu A antes do callback', await nomes(p), ['B original']);
  resposta = async msg => { if (/excluído em outra aba enquanto você confirmava/.test(msg)) { await abrir(p2, 'B original'); await p2.fill('#o-nome', 'B changed during recreation confirm'); await p2.waitForTimeout(700); await p2.click('#orcVoltar'); await p2.waitForTimeout(150); } return true; };
  igual('callback disparado → pergunta de recriação', await dispararTodos(p), 1);
  await p.waitForTimeout(300);
  igual('2ª pergunta foi a de recriação; aceitar agendou nova gravação adiada', [dialogos.length, /excluído em outra aba enquanto você confirmava/.test(dialogos[1]), await pendentes(p)], [2, true, 1]);
  const n0 = await gravacoes(p);
  await dispararTodos(p); await p.waitForTimeout(300);
  igual('A recriado E a edição de B feita durante a pergunta preservada (antes da correção: B original)', await nomes(p), ['A local', 'B changed during recreation confirm']);
  igual('uma gravação; nenhuma pergunta a mais; nada pendente', [(await gravacoes(p)) - n0, dialogos.length, await pendentes(p)], [1, 2, 0]);
  contem('status final', await t(p, 'orcStatus'), 'recriado após a exclusão em outra aba');

  console.log('--- achado 1(b): outra aba exclui B DURANTE a pergunta de recriação');
  await prepararConflito('A local');
  await excluirNaAba2('A da aba 2');
  resposta = async msg => { if (/excluído em outra aba enquanto você confirmava/.test(msg)) await excluirNaAba2('B original'); return true; };
  await dispararTodos(p); await p.waitForTimeout(300);
  await dispararTodos(p); await p.waitForTimeout(300);
  igual('B excluído durante a pergunta continua ausente; A recriado', await nomes(p), ['A local']);

  console.log('--- achado 1(c): outra aba RECRIA A durante a pergunta → reavaliação antes de sobrescrever');
  await prepararConflito('A local');
  await excluirNaAba2('A da aba 2');
  const idA = await p.evaluate(() => sessionStorage.getItem('glassmais.orcAtual'));
  resposta = async msg => {
    if (/excluído em outra aba enquanto você confirmava/.test(msg)) {
      await p2.evaluate(id => { const l = JSON.parse(localStorage.getItem('glassmais.orcamentos.v1')); const o = JSON.parse(JSON.stringify(l[0])); o.id = id; o.cliente.nome = 'A recriado pela aba 2'; o.atualizadoEm = new Date(Date.now() + 300000).toISOString(); l.push(o); localStorage.setItem('glassmais.orcamentos.v1', JSON.stringify(l)); }, idA);
      return true;
    }
    if (/foi alterado em outra aba/.test(msg)) return false;      // reavaliação: recusa
    return true;
  };
  await dispararTodos(p); await p.waitForTimeout(300);
  igual('recriação aceita → adiada', [dialogos.length, await pendentes(p)], [2, 1]);
  await dispararTodos(p); await p.waitForTimeout(300);
  igual('releitura viu A de volta → 3ª pergunta (conflito) → recusada', [dialogos.length, /foi alterado em outra aba/.test(dialogos[2])], [3, true]);
  igual('disco mantém o A recriado pela aba 2; nada pendente', [(await disco(p)).find(o => o.id === idA).cliente.nome, await pendentes(p)], ['A recriado pela aba 2', 0]);
  contem('status', await t(p, 'orcStatus'), 'Não salvo — outra aba alterou');

  console.log('--- achado 1(d): sem alteração durante a pergunta → uma gravação, sem repetir');
  await prepararConflito('A local');
  await excluirNaAba2('A da aba 2');
  resposta = () => true;
  await dispararTodos(p); await p.waitForTimeout(300);
  igual('status enquanto a recriação está adiada', await t(p, 'orcStatus'), 'Confirmado — gravando…');
  const n1 = await gravacoes(p), c1 = dialogos.length;
  await dispararTodos(p); await p.waitForTimeout(300);
  igual('uma gravação, nenhuma pergunta a mais, nada pendente, A recriado', [(await gravacoes(p)) - n1, dialogos.length - c1, await pendentes(p), await nomes(p)], [1, 0, 0, ['A local', 'B original']]);

  console.log('--- achado 2: recusar a 2ª sobrescrita cancela a 1ª confirmada');
  await prepararConflito('A local v1');
  resposta = async msg => !/foi alterado em outra aba/.test(msg);   // a próxima pergunta de conflito será recusada
  await p.fill('#o-nome', 'A local v2'); await p.click('#orcVoltar'); await p.waitForTimeout(900);   // Voltar conclui o autosave → 2ª pergunta → "não"
  igual('2ª sobrescrita recusada', [dialogos.length, /Não salvo — outra aba alterou/.test(await t(p, 'orcStatus'))], [2, true]);
  const n2 = await gravacoes(p);
  igual('callbacks capturados executados à força após a recusa: nenhum grava', [await dispararTodos(p) >= 1, (await gravacoes(p)) - n2], [true, 0]);
  await p.waitForTimeout(300);
  igual('disco mantém a versão da aba 2 (antes da correção: "A local v2")', (await disco(p)).map(o => o.cliente.nome).filter(n => n.startsWith('A')), ['A da aba 2']);
  igual('A continua na lista marcado "não salvo" com a edição v2', await p.locator('#orc-tabela tbody tr', { hasText: 'A local v2' }).locator('.tag:has-text("não salvo")').count(), 1);

  console.log('--- regressão: aceitar duas tentativas — só a última grava');
  await prepararConflito('A v1');
  resposta = () => true;
  await p.fill('#o-nome', 'A v2'); await p.waitForTimeout(900);
  igual('2ª confirmação aceita: 2 callbacks capturados (1º superado)', [dialogos.length, await pendentes(p)], [2, 2]);
  const n3 = await gravacoes(p);
  await dispararTodos(p); await p.waitForTimeout(300);
  igual('uma gravação, com a versão mais recente', [(await gravacoes(p)) - n3, (await disco(p)).map(o => o.cliente.nome).filter(n => n.startsWith('A'))], [1, ['A v2']]);
  await B.fim();
});

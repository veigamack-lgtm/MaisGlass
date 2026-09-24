/* =====================================================================
 * repositorio.js — acesso ao banco com DUAS implementações da mesma interface:
 *   - memoria(): tudo em objetos JS (testes e servidor local, sem banco);
 *   - neon(url):  Postgres no Neon pelo driver HTTP (@neondatabase/serverless).
 * Todas as funções são assíncronas e devolvem objetos "planos" (camelCase, datas em ISO).
 * ===================================================================== */
'use strict';

const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const iso = (v) => (v == null ? null : (v instanceof Date ? v : new Date(v)).toISOString());

/* ---------------------------------------------------------------- memória */
function memoria() {
  const s = { usuarios: [], sessoes: new Map(), tentativas: [], orcamentos: new Map(), hist: [], config: null, seq: 1 };
  const semHash = (u) => { if (!u) return null; const c = clone(u); return c; };
  return {
    tipo: 'memoria',
    async garantirEsquema() { return true; },
    async saude() { return { ok: true, tipo: 'memoria' }; },
    // usuários
    async contarUsuarios() { return s.usuarios.length; },
    async criarUsuario(u) {
      if (s.usuarios.some(x => x.email === u.email)) { const e = new Error('email duplicado'); e.codigo = 'duplicado'; throw e; }
      const novo = { id: s.seq++, email: u.email, nome: u.nome || '', senhaHash: u.senhaHash, papel: u.papel, ativo: true, senhaTrocadaEm: u.senhaTrocadaEm || null, criadoEm: u.criadoEm, criadoPor: u.criadoPor || null, ultimoAcesso: null };
      s.usuarios.push(novo); return clone(novo);
    },
    async usuarioPorEmail(email) { return semHash(s.usuarios.find(x => x.email === email)); },
    async usuarioPorId(id) { return semHash(s.usuarios.find(x => x.id === id)); },
    async listarUsuarios() { return s.usuarios.map(clone).sort((a, b) => a.id - b.id); },
    async atualizarUsuario(id, campos) {
      const u = s.usuarios.find(x => x.id === id); if (!u) return null;
      ['nome', 'papel', 'ativo', 'senhaHash', 'senhaTrocadaEm', 'ultimoAcesso'].forEach(k => { if (campos[k] !== undefined) u[k] = campos[k]; });
      return clone(u);
    },
    // sessões
    async criarSessao(x) { s.sessoes.set(x.tokenHash, clone(x)); },
    async sessaoPorToken(tokenHash) {
      const se = s.sessoes.get(tokenHash); if (!se) return null;
      const u = s.usuarios.find(x => x.id === se.usuarioId); if (!u) return null;
      return { sessao: clone(se), usuario: clone(u) };
    },
    async tocarSessao(tokenHash, expiraEm, ultimoUso) { const se = s.sessoes.get(tokenHash); if (se) { se.expiraEm = expiraEm; se.ultimoUso = ultimoUso; } },
    async apagarSessao(tokenHash) { s.sessoes.delete(tokenHash); },
    async apagarSessoesDoUsuario(usuarioId, exceto) { for (const [k, v] of s.sessoes) if (v.usuarioId === usuarioId && k !== exceto) s.sessoes.delete(k); },
    async apagarSessoesExpiradas(agora) { for (const [k, v] of s.sessoes) if (v.expiraEm < agora) s.sessoes.delete(k); },
    // tentativas de login
    async registrarTentativa(email, ip, quando) { s.tentativas.push({ email, ip, quando }); },
    async contarTentativas(email, ip, desde) { return s.tentativas.filter(t => t.quando >= desde && (t.email === email || t.ip === ip)).length; },
    async limparTentativas(email) { s.tentativas = s.tentativas.filter(t => t.email !== email); },
    // orçamentos
    async orcamentoPorId(id) { return clone(s.orcamentos.get(id)) || null; },
    async listarOrcamentos(desde) {
      const l = [...s.orcamentos.values()].filter(o => !desde || o.atualizadoEm > desde || (o.excluidoEm && o.excluidoEm > desde));
      return clone(l.sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1)));
    },
    async inserirOrcamento(o) {
      if (s.orcamentos.has(o.id)) { const e = new Error('id duplicado'); e.codigo = 'duplicado'; throw e; }
      const row = { id: o.id, dados: clone(o.dados), versao: 1, criadoPor: o.usuarioId, criadoEm: o.agora, atualizadoPor: o.usuarioId, atualizadoEm: o.agora, excluidoEm: null, excluidoPor: null };
      s.orcamentos.set(o.id, row); s.hist.push({ orcId: o.id, versao: 1, dados: clone(o.dados), atualizadoPor: o.usuarioId, atualizadoEm: o.agora });
      return clone(row);
    },
    async atualizarOrcamento(id, x) {   // x = { dados, versaoEsperada, usuarioId, agora, recriar }
      const row = s.orcamentos.get(id); if (!row) return null;
      if (x.recriar) { if (!row.excluidoEm) return null; }
      else if (row.excluidoEm || row.versao !== x.versaoEsperada) return null;
      row.dados = clone(x.dados); row.versao += 1; row.atualizadoPor = x.usuarioId; row.atualizadoEm = x.agora; row.excluidoEm = null; row.excluidoPor = null;
      s.hist.push({ orcId: id, versao: row.versao, dados: clone(x.dados), atualizadoPor: x.usuarioId, atualizadoEm: x.agora });
      return clone(row);
    },
    async excluirOrcamento(id, versaoEsperada, usuarioId, agora) {
      const row = s.orcamentos.get(id); if (!row) return null;
      if (row.excluidoEm) return clone(row);
      if (row.versao !== versaoEsperada) return null;
      row.versao += 1; row.excluidoEm = agora; row.excluidoPor = usuarioId; row.atualizadoEm = agora; row.atualizadoPor = usuarioId;
      return clone(row);
    },
    async historico(id) { return clone(s.hist.filter(h => h.orcId === id)); },
    // config
    async lerConfig() { return clone(s.config); },
    async gravarConfig(x) {   // { dados, versaoEsperada, usuarioId, agora }
      if (!s.config) { if (x.versaoEsperada != null) return null; s.config = { dados: clone(x.dados), versao: 1, atualizadoPor: x.usuarioId, atualizadoEm: x.agora }; return clone(s.config); }
      if (s.config.versao !== x.versaoEsperada) return null;
      s.config = { dados: clone(x.dados), versao: s.config.versao + 1, atualizadoPor: x.usuarioId, atualizadoEm: x.agora };
      return clone(s.config);
    },
    _estado: s
  };
}

/* ---------------------------------------------------------------- Neon (Postgres) */
const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS usuarios (
     id serial PRIMARY KEY, email text UNIQUE NOT NULL, nome text NOT NULL DEFAULT '', senha_hash text NOT NULL,
     papel text NOT NULL CHECK (papel IN ('admin','usuario')), ativo boolean NOT NULL DEFAULT true,
     senha_trocada_em timestamptz NULL, criado_em timestamptz NOT NULL, criado_por int NULL, ultimo_acesso timestamptz NULL)`,
  `CREATE TABLE IF NOT EXISTS sessoes (
     token_hash text PRIMARY KEY, usuario_id int NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     criado_em timestamptz NOT NULL, expira_em timestamptz NOT NULL, ultimo_uso timestamptz NOT NULL, agente text NULL)`,
  `CREATE INDEX IF NOT EXISTS sessoes_usuario ON sessoes (usuario_id)`,
  `CREATE TABLE IF NOT EXISTS tentativas_login (email text NOT NULL, ip text NOT NULL, quando timestamptz NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS tentativas_quando ON tentativas_login (quando)`,
  `CREATE TABLE IF NOT EXISTS orcamentos (
     id text PRIMARY KEY, dados jsonb NOT NULL, versao int NOT NULL,
     criado_por int NULL, criado_em timestamptz NOT NULL, atualizado_por int NULL, atualizado_em timestamptz NOT NULL,
     excluido_em timestamptz NULL, excluido_por int NULL)`,
  `CREATE INDEX IF NOT EXISTS orcamentos_atualizado ON orcamentos (atualizado_em)`,
  `CREATE TABLE IF NOT EXISTS orcamentos_hist (
     orc_id text NOT NULL, versao int NOT NULL, dados jsonb NOT NULL, atualizado_por int NULL, atualizado_em timestamptz NOT NULL,
     PRIMARY KEY (orc_id, versao))`,
  `CREATE TABLE IF NOT EXISTS config (
     id int PRIMARY KEY CHECK (id = 1), dados jsonb NOT NULL, versao int NOT NULL, atualizado_por int NULL, atualizado_em timestamptz NOT NULL)`
];

function neonRepo(url, opts) {
  // opts.sql: executor alternativo com a mesma interface do driver (usado nos testes contra um Postgres local via pg)
  const sql = opts && opts.sql ? opts.sql : require('@neondatabase/serverless').neon(url);
  let pronto = null;
  const U = (r) => r && { id: r.id, email: r.email, nome: r.nome, senhaHash: r.senha_hash, papel: r.papel, ativo: r.ativo, senhaTrocadaEm: iso(r.senha_trocada_em), criadoEm: iso(r.criado_em), criadoPor: r.criado_por, ultimoAcesso: iso(r.ultimo_acesso) };
  const O = (r) => r && { id: r.id, dados: r.dados, versao: r.versao, criadoPor: r.criado_por, criadoEm: iso(r.criado_em), atualizadoPor: r.atualizado_por, atualizadoEm: iso(r.atualizado_em), excluidoEm: iso(r.excluido_em), excluidoPor: r.excluido_por };
  const C = (r) => r && { dados: r.dados, versao: r.versao, atualizadoPor: r.atualizado_por, atualizadoEm: iso(r.atualizado_em) };
  return {
    tipo: 'neon',
    _sql: sql,
    async garantirEsquema() {
      // duas funções frias ao mesmo tempo podem colidir no CREATE ... IF NOT EXISTS ("duplicate key"/"already exists"): tenta de novo
      const criar = async () => { for (const q of ESQUEMA) await sql.query(q); return true; };
      if (!pronto) pronto = criar().catch(async e => {
        if (!/already exists|duplicate key/i.test(String(e && e.message))) throw e;
        await new Promise(r => setTimeout(r, 300)); return criar();
      }).catch(e => { pronto = null; throw e; });
      return pronto;
    },
    async saude() { const r = await sql`SELECT 1 AS ok`; return { ok: r[0].ok === 1, tipo: 'neon' }; },
    async contarUsuarios() { const r = await sql`SELECT count(*)::int AS n FROM usuarios`; return r[0].n; },
    async criarUsuario(u) {
      try {
        const r = await sql`INSERT INTO usuarios (email, nome, senha_hash, papel, senha_trocada_em, criado_em, criado_por)
          VALUES (${u.email}, ${u.nome || ''}, ${u.senhaHash}, ${u.papel}, ${u.senhaTrocadaEm || null}, ${u.criadoEm}, ${u.criadoPor || null}) RETURNING *`;
        return U(r[0]);
      } catch (e) { if (/unique|duplicate/i.test(String(e.message))) { const d = new Error('email duplicado'); d.codigo = 'duplicado'; throw d; } throw e; }
    },
    async usuarioPorEmail(email) { const r = await sql`SELECT * FROM usuarios WHERE email = ${email}`; return U(r[0]) || null; },
    async usuarioPorId(id) { const r = await sql`SELECT * FROM usuarios WHERE id = ${id}`; return U(r[0]) || null; },
    async listarUsuarios() { const r = await sql`SELECT * FROM usuarios ORDER BY id`; return r.map(U); },
    async atualizarUsuario(id, c) {
      const r = await sql`UPDATE usuarios SET
          nome = COALESCE(${c.nome ?? null}, nome), papel = COALESCE(${c.papel ?? null}, papel), ativo = COALESCE(${c.ativo ?? null}, ativo),
          senha_hash = COALESCE(${c.senhaHash ?? null}, senha_hash),
          senha_trocada_em = CASE WHEN ${c.senhaTrocadaEm !== undefined} THEN ${c.senhaTrocadaEm ?? null} ELSE senha_trocada_em END,
          ultimo_acesso = COALESCE(${c.ultimoAcesso ?? null}, ultimo_acesso)
        WHERE id = ${id} RETURNING *`;
      return U(r[0]) || null;
    },
    async criarSessao(x) { await sql`INSERT INTO sessoes (token_hash, usuario_id, criado_em, expira_em, ultimo_uso, agente) VALUES (${x.tokenHash}, ${x.usuarioId}, ${x.criadoEm}, ${x.expiraEm}, ${x.ultimoUso}, ${x.agente || null})`; },
    async sessaoPorToken(tokenHash) {
      const r = await sql`SELECT s.token_hash AS s_token_hash, s.usuario_id AS s_usuario_id, s.criado_em AS s_criado_em, s.expira_em AS s_expira_em, s.ultimo_uso AS s_ultimo_uso, s.agente AS s_agente, u.*
        FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ${tokenHash}`;
      if (!r[0]) return null;
      const x = r[0];
      return { sessao: { tokenHash: x.s_token_hash, usuarioId: x.s_usuario_id, criadoEm: iso(x.s_criado_em), expiraEm: iso(x.s_expira_em), ultimoUso: iso(x.s_ultimo_uso), agente: x.s_agente }, usuario: U(x) };
    },
    async tocarSessao(tokenHash, expiraEm, ultimoUso) { await sql`UPDATE sessoes SET expira_em = ${expiraEm}, ultimo_uso = ${ultimoUso} WHERE token_hash = ${tokenHash}`; },
    async apagarSessao(tokenHash) { await sql`DELETE FROM sessoes WHERE token_hash = ${tokenHash}`; },
    async apagarSessoesDoUsuario(usuarioId, exceto) { await sql`DELETE FROM sessoes WHERE usuario_id = ${usuarioId} AND token_hash <> ${exceto || ''}`; },
    async apagarSessoesExpiradas(agora) { await sql`DELETE FROM sessoes WHERE expira_em < ${agora}`; },
    async registrarTentativa(email, ip, quando) { await sql`INSERT INTO tentativas_login (email, ip, quando) VALUES (${email}, ${ip}, ${quando})`; },
    async contarTentativas(email, ip, desde) { const r = await sql`SELECT count(*)::int AS n FROM tentativas_login WHERE quando >= ${desde} AND (email = ${email} OR ip = ${ip})`; return r[0].n; },
    async limparTentativas(email) { await sql`DELETE FROM tentativas_login WHERE email = ${email} OR quando < now() - interval '1 day'`; },
    async orcamentoPorId(id) { const r = await sql`SELECT * FROM orcamentos WHERE id = ${id}`; return O(r[0]) || null; },
    async listarOrcamentos(desde) {
      const r = desde ? await sql`SELECT * FROM orcamentos WHERE atualizado_em > ${desde} ORDER BY atualizado_em DESC`
        : await sql`SELECT * FROM orcamentos ORDER BY atualizado_em DESC`;
      return r.map(O);
    },
    async inserirOrcamento(o) {
      try {
        const r = await sql`WITH ins AS (
            INSERT INTO orcamentos (id, dados, versao, criado_por, criado_em, atualizado_por, atualizado_em)
            VALUES (${o.id}, ${JSON.stringify(o.dados)}::jsonb, 1, ${o.usuarioId}, ${o.agora}, ${o.usuarioId}, ${o.agora}) RETURNING *),
          h AS (INSERT INTO orcamentos_hist (orc_id, versao, dados, atualizado_por, atualizado_em) SELECT id, versao, dados, atualizado_por, atualizado_em FROM ins)
          SELECT * FROM ins`;
        return O(r[0]);
      } catch (e) { if (/unique|duplicate/i.test(String(e.message))) { const d = new Error('id duplicado'); d.codigo = 'duplicado'; throw d; } throw e; }
    },
    async atualizarOrcamento(id, x) {
      // uma instrução só: UPDATE condicionado à versão (ou à exclusão, no recriar) + histórico; 0 linhas = conflito
      const r = x.recriar
        ? await sql`WITH up AS (UPDATE orcamentos SET dados = ${JSON.stringify(x.dados)}::jsonb, versao = versao + 1, atualizado_por = ${x.usuarioId}, atualizado_em = ${x.agora}, excluido_em = NULL, excluido_por = NULL
              WHERE id = ${id} AND excluido_em IS NOT NULL RETURNING *),
            h AS (INSERT INTO orcamentos_hist (orc_id, versao, dados, atualizado_por, atualizado_em) SELECT id, versao, dados, atualizado_por, atualizado_em FROM up)
            SELECT * FROM up`
        : await sql`WITH up AS (UPDATE orcamentos SET dados = ${JSON.stringify(x.dados)}::jsonb, versao = versao + 1, atualizado_por = ${x.usuarioId}, atualizado_em = ${x.agora}
              WHERE id = ${id} AND excluido_em IS NULL AND versao = ${x.versaoEsperada} RETURNING *),
            h AS (INSERT INTO orcamentos_hist (orc_id, versao, dados, atualizado_por, atualizado_em) SELECT id, versao, dados, atualizado_por, atualizado_em FROM up)
            SELECT * FROM up`;
      return O(r[0]) || null;
    },
    async excluirOrcamento(id, versaoEsperada, usuarioId, agora) {
      const atual = await this.orcamentoPorId(id); if (!atual) return null;
      if (atual.excluidoEm) return atual;
      const r = await sql`UPDATE orcamentos SET versao = versao + 1, excluido_em = ${agora}, excluido_por = ${usuarioId}, atualizado_em = ${agora}, atualizado_por = ${usuarioId}
        WHERE id = ${id} AND excluido_em IS NULL AND versao = ${versaoEsperada} RETURNING *`;
      return O(r[0]) || null;
    },
    async historico(id) { const r = await sql`SELECT * FROM orcamentos_hist WHERE orc_id = ${id} ORDER BY versao`; return r.map(h => ({ orcId: h.orc_id, versao: h.versao, dados: h.dados, atualizadoPor: h.atualizado_por, atualizadoEm: iso(h.atualizado_em) })); },
    async lerConfig() { const r = await sql`SELECT * FROM config WHERE id = 1`; return C(r[0]) || null; },
    async gravarConfig(x) {
      if (x.versaoEsperada == null) {
        try {
          const r = await sql`INSERT INTO config (id, dados, versao, atualizado_por, atualizado_em) VALUES (1, ${JSON.stringify(x.dados)}::jsonb, 1, ${x.usuarioId}, ${x.agora}) RETURNING *`;
          return C(r[0]);
        } catch (e) { if (/unique|duplicate/i.test(String(e.message))) return null; throw e; }
      }
      const r = await sql`UPDATE config SET dados = ${JSON.stringify(x.dados)}::jsonb, versao = versao + 1, atualizado_por = ${x.usuarioId}, atualizado_em = ${x.agora} WHERE id = 1 AND versao = ${x.versaoEsperada} RETURNING *`;
      return C(r[0]) || null;
    }
  };
}

let unico = null;
function doAmbiente() {
  if (unico) return unico;
  const url = process.env.DATABASE_URL;
  if (!url) { const e = new Error('DATABASE_URL não definida — conecte o Neon ao projeto na Vercel (Storage) ou defina a variável.'); e.codigo = 'sem_banco'; throw e; }
  unico = neonRepo(url);
  return unico;
}

module.exports = { memoria, neon: neonRepo, doAmbiente, ESQUEMA };

/* Adaptador: dá a um Pool do `pg` a mesma interface tagged-template do driver do Neon (sql`...` e sql.query(texto)).
 * Só para testar as instruções SQL do repositório Neon contra um Postgres local. */
'use strict';
module.exports = function criar(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url });
  const sql = async function (strings, ...values) {
    let texto = ''; strings.forEach((s, i) => { texto += s; if (i < values.length) texto += '$' + (i + 1); });
    const r = await pool.query(texto, values.map(v => (v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v)));
    return r.rows;
  };
  sql.query = async (texto, params) => (await pool.query(texto, params || [])).rows;
  sql.fechar = () => pool.end();
  return sql;
};

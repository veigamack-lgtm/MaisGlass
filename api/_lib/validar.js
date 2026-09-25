/* =====================================================================
 * validar.js — o servidor valida orçamentos e configuração com os MESMOS motores do app
 * (orcamento.js / calc.js / defaults.js), sem duplicar regras.
 * ===================================================================== */
'use strict';
// requires estáticos (o empacotador da Vercel rastreia só caminhos literais)
const DEF = require('../../defaults.js').GM_DEFAULTS;
const CALC = require('../../calc.js').GM_CALC;
const ORC = require('../../orcamento.js').GM_ORC;
const TERMOS = require('../../termos.js').GM_TERMOS;

const LIMITE_BYTES = 2 * 1024 * 1024;

class ErroValidacao extends Error { constructor(msg, detalhes) { super(msg); this.status = 400; this.detalhes = detalhes || []; } }

/* Orçamento: migra (completa campos opcionais), valida estrutura/identidades e devolve a forma migrada. */
function orcamento(dados, idEsperado) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new ErroValidacao('Orçamento deve ser um objeto.');
  const tamanho = Buffer.byteLength(JSON.stringify(dados));
  if (tamanho > LIMITE_BYTES) throw new ErroValidacao('Orçamento grande demais (' + Math.round(tamanho / 1024) + ' KB; limite 2 MB).');
  let o;
  try { o = ORC.migrarOrcamento(dados); } catch (e) { throw new ErroValidacao(e.message); }
  const erros = ORC.validarOrcamento(o).concat(TERMOS.validarCamposProposta(o));   // + campos só da proposta impressa (cliente completo, número, consultor, textos congelados)
  if (erros.length) throw new ErroValidacao(erros.slice(0, 4).join(' '), erros);
  if (idEsperado !== undefined && o.id !== idEsperado) throw new ErroValidacao('O id do orçamento (' + o.id + ') não confere com a rota (' + idEsperado + ').');
  try { ORC.consolidar(o); } catch (e) { throw new ErroValidacao('Orçamento não consolida: ' + e.message); }
  return o;
}

/* Configuração: migra para a versão atual e valida; devolve a forma migrada. */
function config(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new ErroValidacao('Configuração deve ser um objeto.');
  const tamanho = Buffer.byteLength(JSON.stringify(dados));
  if (tamanho > LIMITE_BYTES) throw new ErroValidacao('Configuração grande demais.');
  const c = CALC.migrarConfig(dados, DEF.config);
  const erros = CALC.validarConfig(c).concat(TERMOS.validarTermos(c.proposta && c.proposta.termos));
  if (erros.length) throw new ErroValidacao('Configuração inválida: ' + erros.slice(0, 4).join(' '), erros);
  return c;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function email(v) {
  const e = String(v || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 200) throw new ErroValidacao('E-mail inválido.');
  return e;
}
function texto(v, nome, max) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new ErroValidacao(nome + ' deve ser texto.');
  if (v.length > (max || 200)) throw new ErroValidacao(nome + ' longo demais.');
  return v.trim();
}

module.exports = { orcamento, config, email, texto, ErroValidacao, ORC, CALC, DEF, TERMOS, LIMITE_BYTES };

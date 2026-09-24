/* =====================================================================
 * test/termos.js — textos da proposta (termos.js): cláusulas, complementos
 * automáticos, textos do administrador e validação. Sem navegador.
 * Execução: node test/termos.js → código 1 se qualquer verificação falhar.
 * ===================================================================== */
'use strict';
const path = require('path');
const T = require(path.join(__dirname, '..', 'termos.js')).GM_TERMOS;
const D = require(path.join(__dirname, '..', 'defaults.js')).GM_DEFAULTS;

let total = 0; const falhas = [];
function ok(c, msg) { total++; if (c) console.log('OK    ' + msg); else { falhas.push(msg); console.log('FALHA ' + msg); } }
function igual(msg, a, b) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ': ' + JSON.stringify(a) + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' ≠ esperado ' + JSON.stringify(b))); }
function contem(msg, texto, trecho) { ok(typeof texto === 'string' && texto.indexOf(trecho) >= 0, msg + ' (contém "' + trecho + '")'); }

const ctxBase = { pagamento: 'À vista', parcelas: 1, bandeira: 'Visa', inclusos: { frete: false, instalacao: false, texto: '' }, prazoEntrega: '', validadeDias: 15,
  uf: 'RJ', destinatario: 'consumidorFinal', enderecoEntrega: '', fcpPendente: [], itensImportacao: [], dolar: 5.3 };
const tudo = r => [r.referencia, r.introducao, r.normas, r.encerramento].concat(r.clausulas.map(c => c.titulo + '\n' + c.paragrafos.join('\n'))).join('\n');

console.log('--- estrutura: 13 cláusulas + objeto, na ordem da proposta de referência');
let r = T.montar(D.config, ctxBase);
igual('títulos', r.clausulas.map(c => c.titulo), ['OBJETO', '1) IMPOSTOS', '2) PREÇOS', '3) REAJUSTES', '4) CONDIÇÃO DE PAGAMENTO', '5) VALOR DO FRETE', '6) ACABAMENTO DE BORDAS',
  '7) MATÉRIA-PRIMA, GERAL', '8) ENTREGA', '9) ARREDONDAMENTO COMERCIAL', '10) GARANTIA', '11) LEI GERAL DE PROTEÇÃO DE DADOS', '12) VALIDADE DA PROPOSTA', '13) AUTORIZAÇÃO DE FORNECIMENTO']);
igual('linhas de cabeçalho', [r.referencia, r.normas, r.encerramento], ['Proposta comercial para fornecimento de vidros', 'DE ACORDO COM NORMAS ABNT - NBR 14697, 14698 E 16015', 'Permanecemos à disposição.']);
const texto = tudo(r);
ok(!/brazil|brasil ?glass|J MARQUES/i.test(texto), 'nenhuma menção à empresa da proposta de referência');
contem('nome da MaisGlass na matéria-prima', texto, 'A MaisGlass encomenda a matéria-prima');
contem('garantia de 5 anos', texto, 'garantia de 5 (cinco) anos');
contem('entrega igual à referência: descarga até 30 m e 100 kg', texto, 'distância máxima de 30 (trinta) metros do caminhão, para peças de no máximo 100 kg');
contem('entrega: armazenagem R$ 120/m²', texto, 'R$ 120,00/m²');
contem('entrega igual à referência, só com o nome trocado', texto, 'estocados na área fabril da MaisGlass e o Cliente recuse a entrega');
contem('entrega: custos adicionais 1 a 5', texto, '5) equipamentos especiais de descarga.');
contem('reajuste: 15 dias', texto, 'irreajustáveis por 15 (quinze) dias');
contem('bordas mantidas', texto, 'bordas aparentes serão lapidados');
contem('arredondamento mantido (múltiplos de 50 mm, áreas mínimas)', texto, 'múltiplos de 50 mm');
contem('impostos: reforma tributária 2027 (IBS/CBS)', texto, 'IBS e CBS');
contem('LGPD', texto, 'Lei nº 13.709/2018');
contem('pagamento à vista', texto, 'À vista.');
contem('frete não incluso', texto, 'Frete não incluso nos preços acima');
contem('validade 15 dias', texto, '15 dias, contados da data de emissão desta proposta.');
contem('destinatário e UF do cálculo', texto, 'entrega em RJ a consumidor final não contribuinte do ICMS');
ok(texto.indexOf('3.2.') < 0, 'sem itens de importação direta: sem cláusula 3.2 (dólar)');
ok(texto.indexOf('será confirmado na emissão') < 0, 'sem FCP pendente: sem ressalva');
ok(texto.indexOf('Prazo de entrega:') < 0, 'sem prazo no orçamento: sem linha de prazo');

console.log('--- complementos automáticos');
r = T.montar(D.config, Object.assign({}, ctxBase, { pagamento: 'Parcelado', parcelas: 6, bandeira: 'Master', inclusos: { frete: true, instalacao: true, texto: 'içamento' },
  prazoEntrega: '20 dias úteis.', validadeDias: 1, destinatario: 'contribuinteRevenda', enderecoEntrega: 'Rua A, 1 - Rio de Janeiro/RJ', fcpPendente: ['SP', 'BA'], itensImportacao: ['001', '003'], dolar: 5.4321 }));
const t2 = tudo(r);
contem('parcelado', t2, 'Parcelado em 6x no cartão de crédito Master (taxa do cartão já incluída nos preços).');
contem('inclusos', t2, 'Incluso: frete, instalação, içamento.');
contem('frete incluso com endereço de entrega', t2, 'Frete incluso nos preços acima, com entrega em Rua A, 1 - Rio de Janeiro/RJ.');
contem('prazo de entrega (sem ponto duplicado)', t2, 'Prazo de entrega: 20 dias úteis.');
contem('validade no singular', t2, '1 dia, contados');
contem('contribuinte', t2, 'contribuinte do ICMS que revende ou industrializa');
contem('ressalva do FCP pendente (explicitamente sobre o item 1.1)', t2, 'Ressalva ao item 1.1: o adicional estadual do Fundo de Combate à Pobreza (FCP) de SP e BA ainda não foi incluído nos preços; será confirmado na emissão da nota fiscal');
contem('3.2 com os itens importados e o dólar', t2, '3.2. Os itens 001 e 003 (vidro importado) foram precificados com o dólar a R$ 5,4321 (cotação usada nesta proposta).');
r = T.montar(D.config, Object.assign({}, ctxBase, { itensImportacao: ['002'], validadeDias: 0 }));
contem('3.2 no singular', tudo(r), 'O item 002 (vidro importado) foi precificado');
contem('validade zero', tudo(r), 'A confirmar no fechamento do pedido.');

console.log('--- perda geométrica (2.2) vem da perda usada no preço de cada item');
const perdaDe = ps => T.montar(D.config, Object.assign({}, ctxBase, { perdas: ps })).clausulas.find(c => c.id === 'precos').paragrafos.slice(1);
igual('sem itens: sem 2.2', perdaDe([]), []);
igual('perda zero', perdaDe([{ item: '001', perda: 0 }]), ['2.2. Os preços não consideram perda geométrica de corte; perdas apuradas na lista de corte serão ajustadas conforme o item 2.1.']);
igual('mesma perda em todos', perdaDe([{ item: '001', perda: 0.15 }, { item: '002', perda: 0.15 }]), ['2.2. Perda geométrica considerada de até 15%.']);
igual('perda com decimal', perdaDe([{ item: '001', perda: 0.125 }]), ['2.2. Perda geométrica considerada de até 12,5%.']);
igual('perdas diferentes por item', perdaDe([{ item: '001', perda: 0.1 }, { item: '002', perda: 0 }]), ['2.2. Perda geométrica considerada por item: 001 – 10%; 002 – 0%.']);

console.log('--- numeração automática continua a do texto');
const cfgN = JSON.parse(JSON.stringify(D.config));
cfgN.proposta.termos = { impostos: T.textoDe(D.config, 'impostos') + '\n1.5. Texto do administrador.', reajustes: '3.1. Um.\n3.2. Dois.' };
let rn = T.montar(cfgN, Object.assign({}, ctxBase, { itensImportacao: ['001'] }));
igual('impostos: automático vira 1.6', rn.clausulas.find(c => c.id === 'impostos').paragrafos.slice(-1)[0].slice(0, 5), '1.6. ');
igual('reajustes: automático vira 3.3', rn.clausulas.find(c => c.id === 'reajustes').paragrafos.slice(-1)[0].slice(0, 5), '3.3. ');

console.log('--- textos do administrador (config.proposta.termos)');
const cfg = JSON.parse(JSON.stringify(D.config));
cfg.proposta.termos = { garantia: 'Garantia de 2 anos.\n\nContra defeitos de fabricação.', pagamento: 'PIX ou boleto.', normas: 'NBR NM 294' };
r = T.montar(cfg, ctxBase);
igual('garantia substituída (linhas vazias ignoradas)', r.clausulas.find(c => c.id === 'garantia').paragrafos, ['Garantia de 2 anos.', 'Contra defeitos de fabricação.']);
igual('pagamento: automático + complemento', r.clausulas.find(c => c.id === 'pagamento').paragrafos, ['À vista.', 'PIX ou boleto.']);
igual('normas', r.normas, 'NBR NM 294');
cfg.proposta.termos = { bordas: '' };
r = T.montar(cfg, ctxBase);
ok(!r.clausulas.some(c => c.id === 'bordas'), 'cláusula esvaziada pelo administrador não sai');
igual('textoDe: padrão quando não há texto do administrador', T.textoDe(D.config, 'lgpd'), T.CLAUSULAS.find(c => c.id === 'lgpd').texto);

console.log('--- validação');
igual('sem termos', T.validarTermos(undefined), []);
igual('válido', T.validarTermos({ garantia: 'x' }), []);
igual('não objeto', T.validarTermos('x').length, 1);
igual('cláusula desconhecida', T.validarTermos({ inventada: 'x' }).length, 1);
igual('não texto', T.validarTermos({ garantia: 5 }).length, 1);
igual('longo demais', T.validarTermos({ garantia: 'x'.repeat(T.LIMITE_TEXTO + 1) }).length, 1);

console.log('--- campos da proposta no orçamento (servidor e importação)');
igual('válidos', T.validarCamposProposta({ cliente: { email: 'a@b.c', obra: 'X' }, numero: 'AB12CD', consultor: { nome: 'N', email: 'e' }, textosProposta: T.montar(D.config, ctxBase) }), []);
igual('ausentes (orçamento antigo)', T.validarCamposProposta({ cliente: { nome: 'x' } }), []);
igual('tipos errados', T.validarCamposProposta({ cliente: { enderecoEntrega: 5 }, numero: 7, consultor: 'x', textosProposta: { clausulas: [{ titulo: 'x', paragrafos: 'y' }] } }).length, 4);

console.log('\n' + (falhas.length ? 'FALHAS: ' + falhas.length + ' de ' + total : 'Todos os testes dos termos da proposta passaram (' + total + ' verificações).'));
if (falhas.length) process.exit(1);

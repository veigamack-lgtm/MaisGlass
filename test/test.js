/* Testes de regressão contra a planilha revisada (valores recalculados pelo Excel).
 * Rodar: node test/test.js
 */
'use strict';
var path = require('path');
var D = require(path.join(__dirname, '..', 'defaults.js')).GM_DEFAULTS;
var C = require(path.join(__dirname, '..', 'calc.js')).GM_CALC;

var falhas = 0;
function aprox(nome, obtido, esperado, tol) {
  tol = tol === undefined ? 0.01 : tol;
  var ok = Math.abs(obtido - esperado) <= tol;
  if (!ok) falhas++;
  console.log((ok ? 'OK   ' : 'FALHA') + ' ' + nome + ': ' + obtido + (ok ? '' : '  (esperado ' + esperado + ')'));
}
function igual(nome, obtido, esperado) {
  var ok = obtido === esperado;
  if (!ok) falhas++;
  console.log((ok ? 'OK   ' : 'FALHA') + ' ' + nome + ': ' + obtido + (ok ? '' : '  (esperado ' + esperado + ')'));
}
function mesmo(nome, obtido, esperado) {   // comparação estrutural (listas/objetos), via JSON
  var a = JSON.stringify(obtido), b = JSON.stringify(esperado), ok = a === b;
  if (!ok) falhas++;
  console.log((ok ? 'OK   ' : 'FALHA') + ' ' + nome + ': ' + a + (ok ? '' : '  (esperado ' + b + ')'));
}

var cfg = JSON.parse(JSON.stringify(D.config));
var inp = JSON.parse(JSON.stringify(D.inputs));

/* ---- Cenário padrão da planilha: Incolor 4+4, 1336 m², R$140, RJ, não contribuinte, à vista ---- */
var r = C.calcular(cfg, inp);
var imp = r.importacao;

console.log('\n== VL 4+4 (container Incolor 4+4) ==');
aprox('H15 VMCV',             imp.vmcv,             38675.637);
aprox('H16 Frete',            imp.frete,            13250);
aprox('H17 Seguro',           imp.seguro,           259.628185);
aprox('H18 VMLD',             imp.vmld,             52185.265185);
aprox('H19 II',               imp.ii,               13046.31629625);
aprox('H20 IPI',              imp.ipi,              4240.05279628125);
aprox('H21 PIS',              imp.pis,              1095.890568885);
aprox('H22 COFINS',           imp.cofins,           5035.878090352499);
aprox('H25 Subtotal',         imp.subtotalImpostos, 75603.40293676875);
aprox('G3 AFRMM',             imp.afrmm,            1060);
aprox('G9 Despesas nacionais',imp.despesasNacionais,11160);
aprox('J4 Armazenagem entreposto', imp.armazenagemEntreposto, 469.667386665);
aprox('J10 Entreposto',       imp.entreposto,       1480.447386665);
aprox('C29 Custo chão fábrica', imp.custoChaoFabrica, 88243.85032343374);
aprox('C30 Custo/m²',         imp.custoM2,          66.02607581252057, 1e-6);
aprox('C31 Crédito PIS/m²',   imp.creditoPisM2,     0.8199704967340067, 1e-6);
aprox('C32 Crédito COFINS/m²',imp.creditoCofinsM2,  3.7679596635634116, 1e-6);
igual('NCM (LG)',             r.ncm,                '7007.29.00');

console.log('\n== Calculadora Chapa ==');
aprox('B14 Taxa cartão',      r.taxaCartao,         0, 1e-9);
aprox('B15 Preço + taxa',     r.precoComTaxa,       187040);
aprox('B16 DIFAL %',          r.difalPct,           0.16, 1e-9);
aprox('B17 DIFAL',            r.difal,              29926.4);
aprox('B18 PREÇO FINAL',      r.precoFinal,         216966.4);
aprox('F5 Custo MP /m²',      r.custoMateriaPrimaM2,66.02607581252057, 1e-6);
aprox('F6 Preço venda /m²',   r.precoVendaM2,       162.4, 1e-6);
aprox('F11 Custo sem imposto',r.custoSemImposto,    88210.8372855275);
aprox('F15 ICMS (RJ 1,5%)',   r.icms,               2805.6);
aprox('F13 PIS (corrigido)',  r.pis,                3039.8676 - 1336 * 0.8199704967340067);
aprox('F14 COFINS',           r.cofins,             8967.820289479281);
aprox('F20 Custo total',      r.custoTotal,         132950.52517500677 - 1336 * 0.8199704967340067);
aprox('F21 Lucro',            r.lucro,              84015.87482499323 + 1336 * 0.8199704967340067);
aprox('F7 Markup',            r.markup,             (84015.87482499323 + 1336 * 0.8199704967340067) / 88210.8372855275, 1e-9);
igual('E25 nota preço', r.notas[1], 'Preço final por m²: R$ 162,40 (sem perdas de aproveitamento) + frete não incluso + com DIFAL incluso.');

/* ---- Cenário parcelado: Amex 3x → MDR 2–5x 2,66% + 1,5% + 0,75%×3 = 6,41% ---- */
console.log('\n== Cartão parcelado ==');
var inp2 = Object.assign({}, inp, { pagamento: 'Parcelado', bandeira: 'Amex', parcelas: 3 });
var r2 = C.calcular(cfg, inp2);
aprox('B14 Amex 3x',          r2.taxaCartao,        0.0266 + 0.015 + 0.0075 * 3, 1e-9);
aprox('B15',                  r2.precoComTaxa,      187040 * (1 + 0.0641));
var inp3 = Object.assign({}, inp, { pagamento: 'Parcelado', bandeira: 'Visa', parcelas: 1 });
aprox('B14 Visa 1x',          C.calcular(cfg, inp3).taxaCartao, 0.012 + 0.015 + 0.0075, 1e-9);
var inp4 = Object.assign({}, inp, { pagamento: 'Parcelado', bandeira: 'Elo', parcelas: 10 });
aprox('B14 Elo 10x',          C.calcular(cfg, inp4).taxaCartao, 0.025 + 0.015 + 0.075, 1e-9);

/* ---- MG contribuinte: sem DIFAL, ICMS 14% ---- */
console.log('\n== MG contribuinte ==');
var inp5 = Object.assign({}, inp, { uf: 'MG', contribuinte: true });
var r5 = C.calcular(cfg, inp5);
aprox('B16 DIFAL %',          r5.difalPct,          0, 1e-9);
aprox('B18 Preço final',      r5.precoFinal,        187040);
aprox('F15 ICMS 14%',         r5.icms,              187040 * 0.14);
igual('E26 nota ICMS',        r5.notas[2],          'A alíquota de ICMS aplicada é de 18%.');

/* ---- Perda 10% e frete: E2 e F11 ---- */
console.log('\n== Perda e frete ==');
var inp6 = Object.assign({}, inp, { perda: 0.10, frete: 1000 });
var r6 = C.calcular(cfg, inp6);
aprox('E2 qtd com perda',     r6.qtdComPerda,       1336 * 1.1, 1e-9);
aprox('F11',                  r6.custoSemImposto,   1336 * 1.1 * 66.02607581252057);
aprox('B15',                  r6.precoComTaxa,      140 * 1336 + 1000);
aprox('F15 ICMS exclui frete',r6.icms,              (140 * 1336) * 0.015);

/* ---- Classes: NCM e II por classe (VL 4+4!C17: LG→O2 25%, CF→O9 25%, MI→O14 9%) ---- */
console.log('\n== Classes CF / MI ==');
igual('NCM CF', C.calcular(cfg, Object.assign({}, inp, { produto: 'Vidro Float Incolor 6mm' })).ncm, '7005.29.00');
igual('NCM MI', C.calcular(cfg, Object.assign({}, inp, { produto: 'Vidro Mini Boreal 4mm' })).ncm, '7005.21.00');
var impCF = C.custoImportacao(cfg, C.findProduto(cfg, 'Vidro Float Incolor 6mm'));
aprox('II CF = 25% VMLD', impCF.ii, impCF.vmld * 0.25);
aprox('CF Float 6mm II (planilha)', impCF.ii, 10556.39, 0.01);
aprox('CF Float 6mm custo/m² (planilha)', impCF.custoM2, 42.79, 0.01);
var impMI = C.custoImportacao(cfg, C.findProduto(cfg, 'Vidro Mini Boreal 4mm'));
aprox('II MI = 9% VMLD', impMI.ii, impMI.vmld * 0.09);

/* ---- Entradas inválidas devem lançar erro (não virar zero) ---- */
console.log('\n== Validação estrita do motor ==');
function lanca(nome, fn, re) {
  var ok = false, msg = ''; try { fn(); } catch (e) { msg = String(e && e.message); ok = re ? re.test(msg) : true; }
  if (!ok) falhas++;
  console.log((ok ? 'OK   ' : 'FALHA') + ' ' + nome + (ok ? '' : (msg ? '  (erro inesperado: ' + msg + ')' : '  (esperava erro)')));
}
function mod(o) { return Object.assign({}, inp, o); }
lanca('quantidade 0',        function () { C.calcular(cfg, mod({ quantidade: 0 })); });
lanca('quantidade negativa', function () { C.calcular(cfg, mod({ quantidade: -5 })); });
lanca('quantidade texto',    function () { C.calcular(cfg, mod({ quantidade: 'abc' })); });
lanca('quantidade vazia',    function () { C.calcular(cfg, mod({ quantidade: '' })); });
lanca('quantidade Infinity', function () { C.calcular(cfg, mod({ quantidade: Infinity })); });
lanca('perda negativa',      function () { C.calcular(cfg, mod({ perda: -1.5 })); });
lanca('preço negativo',      function () { C.calcular(cfg, mod({ precoBase: -1 })); });
lanca('frete negativo',      function () { C.calcular(cfg, mod({ frete: -1 })); });
lanca('produto inexistente', function () { C.calcular(cfg, mod({ produto: 'Nada' })); });
lanca('produto constructor', function () { C.calcular(cfg, mod({ produto: 'constructor' })); });
lanca('UF inexistente',      function () { C.calcular(cfg, mod({ uf: 'ZZ' })); });
lanca('UF constructor',      function () { C.calcular(cfg, mod({ uf: 'constructor' })); });
lanca('UF toString',         function () { C.calcular(cfg, mod({ uf: 'toString' })); });
lanca('bandeira constructor',function () { C.calcular(cfg, mod({ pagamento: 'Parcelado', bandeira: 'constructor', parcelas: 2 })); });
lanca('bandeira inexistente',function () { C.calcular(cfg, mod({ pagamento: 'Parcelado', bandeira: 'Diners', parcelas: 2 })); });
lanca('parcelas 0',          function () { C.calcular(cfg, mod({ pagamento: 'Parcelado', parcelas: 0 })); });
lanca('parcelas 13',         function () { C.calcular(cfg, mod({ pagamento: 'Parcelado', parcelas: 13 })); });
lanca('parcelas 2.6',        function () { C.calcular(cfg, mod({ pagamento: 'Parcelado', parcelas: 2.6 })); });
lanca('parcelas texto',      function () { C.calcular(cfg, mod({ pagamento: 'Parcelado', parcelas: 'x' })); });
lanca('capacidade 0',        function () { C.custoImportacao(cfg, { nome: 'x', custo: 1, capacidade: 0, classe: 'LG' }); });
lanca('classe constructor',  function () { C.custoImportacao(cfg, { nome: 'x', custo: 1, capacidade: 10, classe: 'constructor' }); });
lanca('dólar 0',             function () { C.calcular(Object.assign({}, cfg, { dolar: 0 }), inp); });
lanca('número enorme → Infinity', function () { C.calcular(cfg, mod({ precoBase: 1e308, quantidade: 1e308 })); });
// parcelas nas bordas das faixas e à vista ignora parcelas inválidas
aprox('parcelas 1 (faixa 1x)',  C.calcular(cfg, mod({ pagamento: 'Parcelado', bandeira: 'Visa', parcelas: 1 })).taxaCartao,  0.012 + 0.015 + 0.0075, 1e-9);
aprox('parcelas 5 (faixa 2–5x)',C.calcular(cfg, mod({ pagamento: 'Parcelado', bandeira: 'Visa', parcelas: 5 })).taxaCartao,  0.0195 + 0.015 + 0.0375, 1e-9);
aprox('parcelas 6 (faixa 6–12x)',C.calcular(cfg, mod({ pagamento: 'Parcelado', bandeira: 'Visa', parcelas: 6 })).taxaCartao, 0.021 + 0.015 + 0.045, 1e-9);
aprox('parcelas 12',            C.calcular(cfg, mod({ pagamento: 'Parcelado', bandeira: 'Visa', parcelas: 12 })).taxaCartao, 0.021 + 0.015 + 0.09, 1e-9);
aprox('parcelas "3" string',    C.calcular(cfg, mod({ pagamento: 'Parcelado', bandeira: 'Amex', parcelas: '3' })).taxaCartao, 0.0641, 1e-9);
aprox('à vista ignora parcelas',C.calcular(cfg, mod({ pagamento: 'À vista', parcelas: 99 })).taxaCartao, 0, 1e-9);
// perda 100% dobra quantidade/custo
var r100 = C.calcular(cfg, mod({ perda: 1 }));
aprox('perda 100% → qtd 2x', r100.qtdComPerda, 2 * 1336, 1e-9);
aprox('perda 100% → custo 2x', r100.custoSemImposto, 2 * 88210.8372855275);
// todas as saídas numéricas finitas
var rr = C.calcular(cfg, inp), naoFinito = Object.keys(rr).filter(function (k) { return typeof rr[k] === 'number' && !isFinite(rr[k]); });
igual('saídas finitas', naoFinito.length, 0);

/* ---- Cenários fiscais adicionais ---- */
console.log('\n== MG não contribuinte / fora contribuinte / por dentro ==');
var rMGn = C.calcular(cfg, mod({ uf: 'MG', contribuinte: false }));
aprox('MG não contribuinte: DIFAL 0', rMGn.difal, 0, 1e-9);
aprox('MG não contribuinte: ICMS 14%', rMGn.icms, 187040 * 0.14);
var rSPc = C.calcular(cfg, mod({ uf: 'SP', contribuinte: true }));
aprox('SP contribuinte: DIFAL 0', rSPc.difal, 0, 1e-9);
aprox('SP contribuinte: ICMS 1,5%', rSPc.icms, 187040 * 0.015);
var rSPn = C.calcular(cfg, mod({ uf: 'SP', contribuinte: false }));
aprox('SP não contribuinte: DIFAL 14%', rSPn.difalPct, 0.14, 1e-9);
var cfgFora0 = Object.assign({}, cfg, { dentro: 0 }), impF0 = C.custoImportacao(cfgFora0, C.findProduto(cfg, 'Vidro Laminado Incolor 4+4'));
aprox('por dentro 0%: VMCV 0', impF0.vmcv, 0, 1e-9);
aprox('por dentro 0%: por fora = FOB total', impF0.porFora, 5.46 * 1336.5 * 5.3);
var cfgMeio = Object.assign({}, cfg, { dentro: 0.5 }), impM = C.custoImportacao(cfgMeio, C.findProduto(cfg, 'Vidro Laminado Incolor 4+4'));
aprox('por dentro 50%: VMCV metade', impM.vmcv, 38675.637 / 2);
aprox('por dentro 50%: por fora metade', impM.porFora, 38675.637 / 2);
lanca('por dentro 150%', function () { C.custoImportacao(Object.assign({}, cfg, { dentro: 1.5 }), C.findProduto(cfg, 'Vidro Laminado Incolor 4+4')); });

console.log('\n== Entreposto (CEILING de 10 dias) ==');
function epDias(d) { var c = JSON.parse(JSON.stringify(cfg)); c.entreposto.dias = d; return C.custoImportacao(c, C.findProduto(cfg, 'Vidro Laminado Incolor 4+4')).armazenagemEntreposto; }
var vmld = 52185.265185;
aprox('0 dias',  epDias(0),  0, 1e-9);
aprox('1 dia',   epDias(1),  1 * 0.003 * vmld);
aprox('10 dias', epDias(10), 1 * 0.003 * vmld);
aprox('11 dias', epDias(11), 2 * 0.003 * vmld);
aprox('30 dias', epDias(30), 3 * 0.003 * vmld);

/* ---- validarConfig ---- */
console.log('\n== validarConfig ==');
igual('padrão válido', C.validarConfig(cfg).length, 0);
function invalida(nome, mut) { var c = JSON.parse(JSON.stringify(cfg)); mut(c); var n = C.validarConfig(c).length; if (!n) falhas++; console.log((n ? 'OK   ' : 'FALHA') + ' ' + nome + (n ? '' : '  (esperava erro)')); }
invalida('produtos null',      function (c) { c.produtos = null; });
invalida('produtos vazio',     function (c) { c.produtos = []; });
invalida('cartao array',       function (c) { c.cartao = []; });
invalida('difal null',         function (c) { c.difal = null; });
invalida('dólar 0',            function (c) { c.dolar = 0; });
invalida('dólar string',       function (c) { c.dolar = 'abc'; });
invalida('custo negativo',     function (c) { c.produtos[0].custo = -1; });
invalida('capacidade 0',       function (c) { c.produtos[0].capacidade = 0; });
invalida('classe inexistente', function (c) { c.produtos[0].classe = 'XX'; });
invalida('produto duplicado',  function (c) { c.produtos[1].nome = c.produtos[0].nome; });
invalida('II > 100%',          function (c) { c.classes.LG.ii = 1.5; });
invalida('classe sem NCM',     function (c) { c.classes.LG.ncm = ''; });
invalida('MDR com 2 faixas',   function (c) { c.cartao.mdr.Visa = [0.01, 0.02]; });
invalida('MDR NaN',            function (c) { c.cartao.mdr.Visa = [NaN, 0.02, 0.03]; });
invalida('DIFAL UF inválida',  function (c) { c.difal.ZZ = [0.18, 0.14]; });
invalida('DIFAL 1 número',     function (c) { c.difal.SP = [0.18]; });
invalida('despesa negativa',   function (c) { c.despesasNacionais.despachante = -1; });
invalida('entreposto dias neg',function (c) { c.entreposto.dias = -1; });
igual('não é objeto', C.validarConfig([]).length > 0, true);

/* ---- Calculadora 2: revenda de importado (memorial da contadora) ---- */
console.log('\n== Revenda de importado (memorial Mariana) ==');
var cfgR = JSON.parse(JSON.stringify(cfg)); cfgR.saida.pis = 0; cfgR.saida.cofins = 0;   // memorial só trata ICMS
// Memorial: compra 100 mil (ICMS 4%), venda de R$ 200 mil (valor da operação) MG → RJ não contribuinte → preço fechado
var inR = { fornecedorUF: 'SP', precoCompra: 100, quantidade: 1000, perda: 0, icmsCompra: 0.04, ipi: 0, ipiCredito: true,
  contribuinte: false, difalIncluso: true, clienteUF: 'RJ', precoVenda: 200, ipiVenda: 0, frete: 0, pagamento: 'À vista', bandeira: 'Amex', parcelas: 1 };
var rR = C.calcularRevenda(cfgR, inR);
aprox('crédito ICMS compra 4%',   rR.creditoICMS, 4000);
aprox('débito ICMS venda 4%',     rR.icmsDebito, 8000);
aprox('ICMS a recolher MG',       rR.icmsARecolher, 4000);
aprox('apuração ICMS = 4.000',    rR.icmsInternoDevido, 4000);
aprox('DIFAL RJ (20% − 4%)',      rR.difal, 32000);
aprox('FCP RJ 2%',                rR.fcp, 4000);
aprox('custo total ICMS',         rR.icmsTotal, 40000);
aprox('preço fechado: total = 200k', rR.precoFinal, 200000);
aprox('custo total',              rR.custoTotal, 100000 + 40000);
aprox('lucro',                    rR.lucro, 60000);
// preço "por fora": 200 mil é o valor dos produtos; DIFAL/FCP (18%) cobrados em acréscimo com gross-up → total = 200k ÷ 0,82
var rFora = C.calcularRevenda(cfgR, Object.assign({}, inR, { difalIncluso: false }));
aprox('por fora: total = 200k ÷ 0,82', rFora.precoFinal, 200000 / 0.82);
aprox('por fora: DIFAL 16% do total', rFora.difal, 200000 / 0.82 * 0.16);
aprox('por fora: FCP 2% do total',    rFora.fcp, 200000 / 0.82 * 0.02);
aprox('por fora: ICMS 4% do total',   rFora.icmsDebito, 200000 / 0.82 * 0.04);
aprox('por fora: lucro = 0,78×total − 96k', rFora.lucro, 0.78 * 200000 / 0.82 - 96000);
// PIS/COFINS lucro real: crédito sobre (produtos − ICMS); débito sobre (operação − IPI − ICMS − DIFAL), FCP fica na base
var rP = C.calcularRevenda(cfg, inR);
aprox('crédito PIS+COFINS 9,25% × 96.000', rP.creditoPIS + rP.creditoCOFINS, 96000 * 0.0925);
aprox('base débito PIS/COFINS = 200k − 8k − 32k', rP.basePisCofinsVenda, 160000);
aprox('débito PIS+COFINS 9,25% × 160.000', rP.pisVenda + rP.cofinsVenda, 160000 * 0.0925);
aprox('PIS+COFINS a recolher',    rP.pisDevido + rP.cofinsDevido, 64000 * 0.0925);
// IPI com crédito: destacado 6,5% na compra, sem IPI na venda → saldo credor, não é custo
var rI = C.calcularRevenda(cfgR, Object.assign({}, inR, { ipi: 0.065 }));
aprox('IPI compra 6,5%',          rI.ipiCompra, 6500);
aprox('crédito IPI',              rI.creditoIPI, 6500);
aprox('IPI apuração (saldo credor)', rI.ipiDevido, -6500);
aprox('IPI a recolher 0 / saldo credor 6.500', rI.ipiARecolher + rI.saldoCredorIPI, 6500);
igual('IPI a recolher = 0',       rI.ipiARecolher, 0);
aprox('custo total não muda com IPI creditado', rI.custoTotal, 140000);
// IPI sem crédito vira custo
var rIc = C.calcularRevenda(cfgR, Object.assign({}, inR, { ipi: 0.065, ipiCredito: false }));
aprox('IPI sem crédito → custo +6.500', rIc.custoTotal, 146500);
// IPI na venda 6,5% por fora: débito 13.000 abate o crédito; total com gross-up
var rIv = C.calcularRevenda(cfgR, Object.assign({}, inR, { difalIncluso: false, ipi: 0.065, ipiVenda: 0.065 }));
aprox('IPI venda 13.000 − crédito 6.500', rIv.ipiDevido, 6500);
aprox('por fora c/ IPI: total = 213k ÷ 0,82', rIv.precoFinal, 213000 / 0.82);
aprox('não contribuinte: IPI na base do ICMS', rIv.baseICMS, rIv.precoFinal);
// cliente contribuinte: sem DIFAL/FCP; IPI fora da base do ICMS
var rC = C.calcularRevenda(cfgR, Object.assign({}, inR, { contribuinte: true }));
aprox('contribuinte: DIFAL 0',    rC.difal, 0, 1e-9);
aprox('contribuinte: FCP 0',      rC.fcp, 0, 1e-9);
var rCi = C.calcularRevenda(cfgR, Object.assign({}, inR, { contribuinte: true, ipi: 0.065, ipiVenda: 0.065 }));
aprox('contribuinte fechado: base ICMS = 200k ÷ 1,065', rCi.baseICMS, 200000 / 1.065);
aprox('contribuinte fechado: ICMS 4% sobre base sem IPI', rCi.icmsDebito, 200000 / 1.065 * 0.04);
var rCf = C.calcularRevenda(cfgR, Object.assign({}, inR, { contribuinte: true, difalIncluso: false, ipi: 0.065, ipiVenda: 0.065 }));
aprox('contribuinte por fora: total = 200k + IPI', rCf.precoFinal, 213000);
aprox('contribuinte por fora: base ICMS = 200k', rCf.baseICMS, 200000);
// venda interna (MG): alíquota interna, sem DIFAL/FCP, e não exige FCP cadastrado
var rMG = C.calcularRevenda(cfgR, Object.assign({}, inR, { clienteUF: 'MG' }));
aprox('venda interna MG: 18% × 200k', rMG.icmsDebito, 200000 * 0.18);
aprox('venda interna MG: sem DIFAL', rMG.difal + rMG.fcp, 0, 1e-9);
// SP não contribuinte: FCP não confirmado bloqueia; com FCP 0 cadastrado → DIFAL 14%
lanca('SP não contribuinte sem FCP confirmado → erro', function () { C.calcularRevenda(cfgR, Object.assign({}, inR, { clienteUF: 'SP' })); }, /FCP de SP/);
var cfgSP = JSON.parse(JSON.stringify(cfgR)); cfgSP.revenda.fcp.SP = 0;
var rSP = C.calcularRevenda(cfgSP, Object.assign({}, inR, { clienteUF: 'SP' }));
aprox('SP: DIFAL 14%',            rSP.difalPct, 0.14, 1e-9);
aprox('SP: FCP 0',                rSP.fcp, 0, 1e-9);
var rSPc = C.calcularRevenda(cfgR, Object.assign({}, inR, { clienteUF: 'SP', contribuinte: true }));
aprox('SP contribuinte: não exige FCP', rSPc.difal + rSPc.fcp, 0, 1e-9);
// alíquota interestadual da saída editável (perde os 4% → 12%): ICMS sobe, DIFAL cai, total ao RJ+MG igual
var r12 = C.calcularRevenda(cfgR, Object.assign({}, inR, { icmsSaida: 0.12 }));
aprox('saída 12%: ICMS débito 24.000', r12.icmsDebito, 24000);
aprox('saída 12%: DIFAL 8%',      r12.difalPct, 0.08, 1e-9);
aprox('saída 12%: carga total igual', r12.icmsTotal, 40000);
// frete cobrado na NF integra o valor da operação (base do ICMS/DIFAL/FCP)
var rFr = C.calcularRevenda(cfgR, Object.assign({}, inR, { frete: 1000 }));
aprox('frete 1.000: total = 201.000', rFr.precoFinal, 201000);
aprox('frete 1.000: ICMS sobre 201.000', rFr.icmsDebito, 201000 * 0.04);
aprox('frete 1.000: é custo', rFr.custoTotal - rR.custoTotal, 1000 + 1000 * 0.22);
// taxa do cartão por divisão: líquido recebido = preço combinado
var rTx = C.calcularRevenda(cfgR, Object.assign({}, inR, { pagamento: 'Parcelado', bandeira: 'Amex', parcelas: 3 }));
aprox('cartão Amex 3x: taxa 6,41%', rTx.taxaCartao, 0.0641, 1e-9);
aprox('cartão: total = 200k ÷ (1 − 6,41%)', rTx.precoComTaxa, 200000 / (1 - 0.0641));
aprox('cartão: líquido = 200k',   rTx.precoComTaxa - rTx.valorTaxaCartao, 200000);
// perda 10% aumenta a compra, não a venda
var rPd = C.calcularRevenda(cfgR, Object.assign({}, inR, { perda: 0.10 }));
aprox('perda 10%: compra 110k',   rPd.compraProdutos, 110000);
aprox('perda 10%: crédito 4.400', rPd.creditoICMS, 4400);
// saldo credor de ICMS quando crédito > débito: linhas separadas
var rSc = C.calcularRevenda(cfgR, Object.assign({}, inR, { icmsCompra: 0.12 }));
aprox('crédito 12% > débito → apuração −4.000', rSc.icmsInternoDevido, -4000);
igual('saldo credor: a recolher 0', rSc.icmsARecolher, 0);
aprox('saldo credor ICMS 4.000',  rSc.saldoCredorICMS, 4000);
// booleanos estritos: texto não vira verdadeiro
lanca('contribuinte "false" (texto) → erro', function () { C.calcularRevenda(cfgR, Object.assign({}, inR, { contribuinte: 'false' })); }, /verdadeiro ou falso/);
lanca('difalIncluso "sim" (texto) → erro',   function () { C.calcularRevenda(cfgR, Object.assign({}, inR, { difalIncluso: 'sim' })); }, /verdadeiro ou falso/);
lanca('ipiCredito 1 (número) → erro',        function () { C.calcularRevenda(cfgR, Object.assign({}, inR, { ipiCredito: 1 })); }, /verdadeiro ou falso/);
// erros
lanca('revenda UF fornecedor inválida', function () { C.calcularRevenda(cfg, Object.assign({}, inR, { fornecedorUF: 'XX' })); }, /fornecedor/);
lanca('revenda UF cliente constructor', function () { C.calcularRevenda(cfg, Object.assign({}, inR, { clienteUF: 'constructor' })); }, /cliente/);
lanca('revenda quantidade 0',    function () { C.calcularRevenda(cfg, Object.assign({}, inR, { quantidade: 0 })); }, /quantidade/);
lanca('revenda preço compra negativo', function () { C.calcularRevenda(cfg, Object.assign({}, inR, { precoCompra: -1 })); }, /preço de compra/);
lanca('revenda ICMS compra 150%', function () { C.calcularRevenda(cfg, Object.assign({}, inR, { icmsCompra: 1.5 })); }, /ICMS da compra/);
lanca('revenda parcelas 13',     function () { C.calcularRevenda(cfg, Object.assign({}, inR, { pagamento: 'Parcelado', parcelas: 13 })); }, /parcelas/i);
lanca('revenda ICMS saída 150%', function () { C.calcularRevenda(cfg, Object.assign({}, inR, { icmsSaida: 1.5 })); }, /saída/);
invalida('revenda sem fcp',      function (c) { c.revenda.fcp = null; });
invalida('revenda empresaUF inválida', function (c) { c.revenda.empresaUF = 'XX'; });
invalida('fcp UF inválida',      function (c) { c.revenda.fcp.ZZ = 0.02; });
invalida('fcp texto',            function (c) { c.revenda.fcp.SP = 'abc'; });
invalida('revenda.ipiCredito texto', function (c) { c.revenda.ipiCredito = 'sim'; });
igual('fcp null é válido na config', C.validarConfig(cfg).length, 0);

// revenda pura: IPI da compra é custo mas NÃO entra na base do crédito de PIS/COFINS (Lei 14.592/2023)
var rRp = C.calcularRevenda(cfg, Object.assign({}, inR, { ipi: 0.065, ipiCredito: false }));
aprox('revenda pura: crédito PIS/COFINS só sobre 96.000', rRp.creditoPIS + rRp.creditoCOFINS, 96000 * 0.0925);
aprox('revenda pura: IPI 6.500 fica no CMV', rRp.custoLiquidoCompra, 106500 - 4000 - 96000 * 0.0925);

// DRE: lucro operacional da DRE = lucro do motor; presumido conforme bases (fechado, IPI 6,5% por dentro)
var rD = C.calcularRevenda(cfg, Object.assign({}, inR, { ipi: 0.065, ipiVenda: 0.065 }));
aprox('DRE real: lucro operacional = lucro', rD.dre.real.lucroOperacional, rD.lucro, 1e-6);
aprox('DRE real: IRPJ/CSLL 34%', rD.dre.real.irpjCsll, rD.lucro * 0.34);
aprox('DRE presumido: IRPJ/CSLL = (8%×25% + 12%×9%) × receita sem IPI (v4: adicional de IRPJ incluído)', rD.dre.presumido.irpjCsll, 200000 / 1.065 * (0.08 * 0.25 + 0.12 * 0.09));
aprox('DRE presumido: PIS/COFINS 3,65% × (operação − IPI − ICMS − DIFAL)', rD.dre.presumido.pisCofins, rD.basePisCofinsVenda * 0.0365);
aprox('DRE presumido: CMV sem crédito PIS/COFINS', rD.dre.presumido.cmv, rD.dre.real.cmv + rD.creditoPIS + rD.creditoCOFINS);
aprox('DRE: receita bruta = valor pago', rD.dre.real.receitaBruta, rD.precoFinal, 1e-6);
aprox('DRE: margem líquida sobre receita líquida', rD.dre.real.margemLiquida, rD.dre.real.lucroLiquido / rD.dre.real.receitaLiquida, 1e-9);
aprox('DRE: margem sobre valor pago', rD.dre.real.margemSobreValorPago, rD.dre.real.lucroLiquido / rD.precoFinal, 1e-9);
var rNeg = C.calcularRevenda(cfg, Object.assign({}, inR, { precoVenda: 80 }));
aprox('DRE real: prejuízo → IRPJ/CSLL 0', rNeg.dre.real.irpjCsll, 0, 1e-9);
invalida('tributos ausentes', function (c) { c.tributos = null; });

// preço fechado com IPI: IPI por dentro do total
var rFi = C.calcularRevenda(cfgR, Object.assign({}, inR, { difalIncluso: true, ipi: 0.065, ipiVenda: 0.065 }));
aprox('fechado: total pago = 200k', rFi.precoFinal, 200000);
aprox('fechado: IPI por dentro = 200k − 200k/1,065', rFi.ipiVenda, 200000 - 200000 / 1.065);
aprox('fechado: IPI devido = IPI venda − crédito 6.500', rFi.ipiDevido, 200000 - 200000 / 1.065 - 6500);

/* ---- Simulação de referência do briefing (§4), valores corrigidos pelo parecer técnico ---- */
console.log('\n== Simulação §4 (600 m², 69,70 → 125 fechado, RJ não contribuinte) ==');
var in4 = { fornecedorUF: 'SP', precoCompra: 69.70, quantidade: 600, perda: 0, icmsCompra: 0.04, ipi: 0.065, ipiCredito: true,
  contribuinte: false, difalIncluso: true, clienteUF: 'RJ', precoVenda: 125, ipiVenda: 0.065, frete: 0, pagamento: 'À vista', bandeira: 'Amex', parcelas: 1 };
var r4 = C.calcularRevenda(cfg, in4);
aprox('produtos 41.820',          r4.compraProdutos, 41820, 0.005);
aprox('total NF 44.538,30',       r4.totalNFCompra, 44538.30, 0.01);
aprox('créditos PIS+COFINS 3.713,62', r4.creditoPIS + r4.creditoCOFINS, 3713.62, 0.005);
aprox('CMV 36.433,58',            r4.custoLiquidoCompra, 36433.58, 0.01);
aprox('total pago 75.000',        r4.precoFinal, 75000, 0.01);
aprox('IPI saída 4.577,46',       r4.ipiVenda, 4577.46, 0.01);
aprox('IPI a recolher 1.859,16',  r4.ipiARecolher, 1859.16, 0.01);
aprox('ICMS débito 3.000',        r4.icmsDebito, 3000, 0.01);
aprox('ICMS a recolher MG 1.327,20', r4.icmsARecolher, 1327.20, 0.005);
aprox('DIFAL 12.000 + FCP 1.500', r4.difal + r4.fcp, 13500, 0.005);
aprox('base PIS/COFINS 55.422,54', r4.basePisCofinsVenda, 55422.54, 0.005);
aprox('PIS/COFINS débito 5.126,58', r4.pisVenda + r4.cofinsVenda, 5126.58, 0.005);
aprox('PIS/COFINS a recolher 1.412,97', r4.pisDevido + r4.cofinsDevido, 1412.97, 0.005);
aprox('custo total 62.637,63',    r4.custoTotal, 62637.63, 0.01);
aprox('lucro operacional 12.362,37', r4.lucro, 12362.37, 0.005);
aprox('IRPJ/CSLL real 4.203,20',  r4.dre.real.irpjCsll, 4203.20, 0.01);
aprox('lucro líquido real 8.159,16', r4.dre.real.lucroLiquido, 8159.16, 0.005);
aprox('presumido PIS/COFINS 2.022,92', r4.dre.presumido.pisCofins, 2022.92, 0.005);
aprox('lucro líquido presumido 9.583,40 (v4 — era 10.146,78 com IRPJ 15% sem adicional)', r4.dre.presumido.lucroLiquido, 9583.40, 0.005);

/* ---- Calculadora 3: indústria nacional (mesmo motor; ICMS 12% SP→MG e 12% MG→RJ) ---- */
console.log('\n== Indústria nacional (SP → MG → RJ não contribuinte) ==');
var inN = Object.assign({}, inR, { icmsCompra: 0.12, icmsSaida: 0.12 });
var rN = C.calcularRevenda(cfgR, inN);
aprox('nacional: crédito ICMS 12% = 12.000', rN.creditoICMS, 12000);
aprox('nacional: débito 12% × 200k = 24.000', rN.icmsDebito, 24000);
aprox('nacional: ICMS a recolher MG 12.000', rN.icmsARecolher, 12000);
aprox('nacional: DIFAL 8% (20% − 12%)', rN.difalPct, 0.08, 1e-9);
aprox('nacional: DIFAL 16.000 + FCP 4.000', rN.difal + rN.fcp, 20000);
aprox('nacional: carga total ICMS 32.000', rN.icmsTotal, 32000);
igual('nacional: sem nota de FCI', rN.notas.some(function (n) { return /FCI/.test(n); }), false);
igual('revenda: tem nota de FCI', rR.notas.some(function (n) { return /FCI/.test(n); }), true);
var dN = D.inputsNacional;
aprox('defaults nacional: ICMS compra 12%', dN.icmsCompra, 0.12, 1e-9);
aprox('defaults nacional: ICMS saída 12%', dN.icmsSaida, 0.12, 1e-9);
igual('defaults nacional: RJ fechado', dN.clienteUF + '/' + dN.difalIncluso, 'RJ/true');

/* ---- DRE da importação direta: derivada do resultado da calc 1, sem alterar a calc 1 ---- */
console.log('\n== DRE importação direta ==');
var r1 = C.calcular(cfg, inp), d1 = C.dreImportacao(cfg, r1);
aprox('DRE imp: lucro operacional real = lucro da planilha', d1.real.lucroOperacional, r1.lucro, 1e-6);
aprox('DRE imp: receita bruta = preço final', d1.real.receitaBruta, r1.precoFinal, 1e-9);
aprox('DRE imp: PIS/COFINS real = pis + cofins líquidos', d1.real.pisCofins, r1.pis + r1.cofins, 1e-9);
aprox('DRE imp: CMV = custo sem imposto', d1.real.cmv, r1.custoSemImposto, 1e-9);
aprox('DRE imp: IRPJ/CSLL real 34%', d1.real.irpjCsll, Math.max(0, r1.lucro) * 0.34, 1e-6);
aprox('DRE imp: presumido PIS/COFINS 3,65% × (preço+taxa − frete − ICMS)', d1.presumido.pisCofins, (r1.precoComTaxa - r1.frete - r1.icms) * 0.0365, 1e-6);
aprox('DRE imp: presumido IRPJ/CSLL 3,08% × receita (v4)', d1.presumido.irpjCsll, r1.precoFinal * (0.08 * 0.25 + 0.12 * 0.09), 1e-6);
aprox('DRE imp: presumido lucro op = real + (pisCof real − pisCof presumido)', d1.presumido.lucroOperacional, d1.real.lucroOperacional + d1.real.pisCofins - d1.presumido.pisCofins, 1e-6);
igual('DRE imp: calc 1 continua sem campo dre', r1.dre === undefined, true);

/* ---- Alíquota interestadual automática (Res. SF 22/1989 e 13/2012) ---- */
console.log('\n== Alíquota interestadual por origem → destino ==');
aprox('SP → MG nacional: 12%', C.aliquotaInterestadual('SP', 'MG', false), 0.12, 1e-9);
aprox('SP → PE nacional: 7%',  C.aliquotaInterestadual('SP', 'PE', false), 0.07, 1e-9);
aprox('MG → ES nacional: 7% (ES é destino favorecido)', C.aliquotaInterestadual('MG', 'ES', false), 0.07, 1e-9);
aprox('ES → BA nacional: 12% (ES não é origem favorecida)', C.aliquotaInterestadual('ES', 'BA', false), 0.12, 1e-9);
aprox('RN → PE nacional: 12% (ambos no NE)', C.aliquotaInterestadual('RN', 'PE', false), 0.12, 1e-9);
aprox('PR → GO nacional: 7%', C.aliquotaInterestadual('PR', 'GO', false), 0.07, 1e-9);
aprox('SP → PE importado: 4%', C.aliquotaInterestadual('SP', 'PE', true), 0.04, 1e-9);
igual('MG → MG: operação interna (null)', C.aliquotaInterestadual('MG', 'MG', false), null);
lanca('UF inválida', function () { C.aliquotaInterestadual('XX', 'MG', false); }, /origem/);

/* ---- derivarDifal: coluna DIFAL da calc 1 = interna − 4% (0 na UF da empresa) ---- */
console.log('\n== derivarDifal ==');
var cfgD = JSON.parse(JSON.stringify(cfg)); C.UFS.forEach(function (uf) { cfgD.difal[uf][1] = 0.99; });
C.derivarDifal(cfgD);
var difDer = C.UFS.filter(function (uf) { return Math.abs(cfgD.difal[uf][1] - cfg.difal[uf][1]) > 1e-9; });
igual('derivado = tabela padrão em todas as UFs', difDer.join(','), '');
aprox('RJ: 20% − 4% = 16%', cfgD.difal.RJ[1], 0.16, 1e-9);
aprox('PR 2026: 19,5% − 4% = 15,5%', cfgD.difal.PR[1], 0.155, 1e-9);
aprox('MG (empresa): 0', cfgD.difal.MG[1], 0, 1e-9);
igual('derivado passa na validação', C.validarConfig(cfgD).length, 0);
// empresa é fixa em MG (Codex nº 2, item 1): outra UF é rejeitada e derivarDifal ignora o campo
invalida('empresa fora de MG é rejeitada', function (c) { c.revenda.empresaUF = 'PE'; });
cfgD.revenda.empresaUF = 'PE'; C.derivarDifal(cfgD);
aprox('derivarDifal ignora empresaUF: MG continua 0', cfgD.difal.MG[1], 0, 1e-9);
aprox('derivarDifal ignora config.interestadual (4% fixo)', (function () { var c = JSON.parse(JSON.stringify(cfg)); c.interestadual = 0.12; C.derivarDifal(c); return c.difal.RJ[1]; })(), 0.16, 1e-9);
// tabela literal independente (Codex nº 2, item 10): interna 2026 → DIFAL esperado, sem usar defaults.js como gabarito
var FIXTURE = { AC: [19, 15], AL: [19, 15], AM: [20, 16], AP: [18, 14], BA: [20.5, 16.5], CE: [20, 16], DF: [20, 16], ES: [17, 13],
  GO: [19, 15], MA: [23, 19], MS: [17, 13], MT: [17, 13], MG: [18, 0], PA: [19, 15], PB: [20, 16], PE: [20.5, 16.5], PI: [22.5, 18.5],
  PR: [19.5, 15.5], RJ: [20, 16], RN: [20, 16], RO: [19.5, 15.5], RR: [20, 16], RS: [17, 13], SC: [17, 13], SE: [19, 15], SP: [18, 14], TO: [20, 16] };
var fixErr = Object.keys(FIXTURE).filter(function (uf) {
  return Math.abs(cfg.difal[uf][0] - FIXTURE[uf][0] / 100) > 1e-9 || Math.abs(cfg.difal[uf][1] - FIXTURE[uf][1] / 100) > 1e-9;
});
igual('defaults.js bate com a tabela literal 2026 (27 UFs)', fixErr.join(','), '');

/* ---- Parecer Codex nº 2 ---- */
console.log('\n== Codex nº 2: cenário nacional interno completo (item 9/10) ==');
var inNac = { fornecedorUF: 'SP', precoCompra: 102.61, quantidade: 2000, perda: 0, icmsCompra: 0.12, ipi: 0.065, ipiCredito: true, modo: 'beneficiamento',
  contribuinte: false, difalIncluso: true, clienteUF: 'MG', precoVenda: 175, ipiVenda: 0.065, icmsSaida: 0.12, frete: 0, pagamento: 'À vista', bandeira: 'Amex', parcelas: 1 };
var rNac = C.calcularRevenda(cfg, inNac);
aprox('nac MG: produtos 205.220,00',        rNac.compraProdutos, 205220, 0.005);
aprox('nac MG: IPI entrada 13.339,30',      rNac.ipiCompra, 13339.30, 0.005);
aprox('nac MG: crédito ICMS 24.626,40',     rNac.creditoICMS, 24626.40, 0.005);
aprox('nac MG: crédito PIS/COFINS 16.704,91', rNac.creditoPIS + rNac.creditoCOFINS, 16704.91, 0.005);
aprox('nac MG: CMV 163.888,69',             rNac.custoLiquidoCompra, 163888.69, 0.005);
aprox('nac MG: total 350.000',              rNac.precoFinal, 350000, 0.005);
aprox('nac MG: IPI saída 21.361,50',        rNac.ipiVenda, 21361.50, 0.005);
aprox('nac MG: ICMS 18% × 350.000 = 63.000 (IPI na base)', rNac.icmsDebito, 63000, 0.005);
aprox('nac MG: ICMS a recolher 38.373,60',  rNac.icmsARecolher, 38373.60, 0.005);
aprox('nac MG: sem DIFAL/FCP',              rNac.difal + rNac.fcp, 0, 1e-9);
aprox('nac MG: base PIS/COFINS 265.638,50', rNac.basePisCofinsVenda, 265638.50, 0.005);
aprox('nac MG: PIS/COFINS a recolher 7.866,65', rNac.pisDevido + rNac.cofinsDevido, 7866.65, 0.005);
aprox('nac MG: tributos líquidos 54.262,46', rNac.ipiDevido + rNac.icmsInternoDevido + rNac.pisDevido + rNac.cofinsDevido, 54262.46, 0.005);
aprox('nac MG: lucro operacional 77.178,24', rNac.lucro, 77178.24, 0.005);
aprox('nac MG: lucro líquido real 50.937,64', rNac.dre.real.lucroLiquido, 50937.64, 0.005);
aprox('nac MG: DRE = motor',                rNac.dre.real.lucroOperacional, rNac.lucro, 1e-6);

console.log('\n== Codex nº 2: natureza da operação (item 4) ==');
var rRev = C.calcularRevenda(cfg, Object.assign({}, inNac, { modo: 'revenda', ipiCredito: true, ipiVenda: 0.065 }));
igual('revenda pura: força crédito de IPI = 0', rRev.creditoIPI, 0);
igual('revenda pura: força IPI na saída = 0',   rRev.ipiVenda, 0);
aprox('revenda pura: IPI da compra vira custo (CMV +13.339,30)', rRev.custoLiquidoCompra, rNac.custoLiquidoCompra + 13339.30, 0.005);
lanca('modo inválido → erro', function () { C.calcularRevenda(cfg, Object.assign({}, inNac, { modo: 'x' })); }, /Natureza da operação/);
var rBen = C.calcularRevenda(cfg, Object.assign({}, inNac, { modo: 'beneficiamento' }));
aprox('beneficiamento: igual ao cenário base', rBen.lucro, rNac.lucro, 1e-9);

console.log('\n== Codex nº 2: preço por fora com cartão (item 2) ==');
var rPF = C.calcularRevenda(cfgR, Object.assign({}, inR, { difalIncluso: false, ipi: 0.065, ipiVenda: 0.065, pagamento: 'Parcelado', bandeira: 'Amex', parcelas: 3 }));
aprox('por fora + Amex 3x: total 283.345,10 (gross-up simultâneo)', rPF.precoFinal, 283345.10, 0.05);
aprox('por fora + cartão: taxa = 6,41% do total', rPF.valorTaxaCartao, rPF.precoFinal * 0.0641, 1e-6);
aprox('por fora + cartão: total × (1 − 18%) = produtos × 1,065', rPF.precoFinal * 0.82, rPF.valorProdutos * 1.065, 1e-6);
aprox('por fora + cartão: produtos = combinado + taxa', rPF.valorProdutos, 200000 + rPF.valorTaxaCartao, 1e-6);
var rPF0 = C.calcularRevenda(cfgR, Object.assign({}, inR, { difalIncluso: false, ipi: 0.065, ipiVenda: 0.065 }));
aprox('por fora à vista: continua 213k ÷ 0,82', rPF0.precoFinal, 213000 / 0.82, 1e-6);
var rFc = C.calcularRevenda(cfgR, Object.assign({}, inR, { pagamento: 'Parcelado', bandeira: 'Amex', parcelas: 3 }));
aprox('fechado + cartão: taxa = 6,41% do total', rFc.valorTaxaCartao, rFc.precoFinal * 0.0641, 1e-6);
aprox('fechado + cartão: total = 200k ÷ (1 − 6,41%)', rFc.precoFinal, 200000 / (1 - 0.0641), 1e-6);

console.log('\n== Codex nº 2: cartão ≥ 100% (item 8) ==');
var cfgCard = JSON.parse(JSON.stringify(cfg)); cfgCard.cartao.mdr.Visa = [0.5, 0.5, 0.5]; cfgCard.cartao.antecipacaoBase = 0.4; cfgCard.cartao.porParcela = 0.05;
lanca('Visa 3x: 0,5 + 0,4 + 0,15 = 105% → erro', function () { C.taxaCartao(cfgCard, { pagamento: 'Parcelado', bandeira: 'Visa', parcelas: 3 }); }, /100%/);
aprox('Visa 1x: 0,5 + 0,4 + 0,05 = 95% passa', C.taxaCartao(cfgCard, { pagamento: 'Parcelado', bandeira: 'Visa', parcelas: 1 }), 0.95, 1e-9);

console.log('\n== Codex nº 2: migração da configuração (item 10) ==');
var antiga = JSON.parse(JSON.stringify(D.config)); delete antiga.versao; antiga.difal.MG = [0.11, 0]; antiga.difal.PR = [0.19, 0.15]; antiga.difal.RS = [0.18, 0.14]; antiga.difal.MT = [0.19, 0.15];
antiga.difal.SP = [0.20, 0.14]; antiga.dolar = 5.25; antiga.revenda.empresaUF = 'PE'; delete antiga.revenda.fcpRevisado; Object.keys(antiga.revenda.fcp).forEach(function (u) { antiga.revenda.fcp[u] = u === 'RJ' ? 0.02 : 0; });
var m1 = C.migrarConfig(antiga, D.config);
igual('v1 → versão atual', m1.versao, D.config.versao);
aprox('MG 11% → 18%', m1.difal.MG[0], 0.18, 1e-9);
aprox('PR 19 → 19,5', m1.difal.PR[0], 0.195, 1e-9);
aprox('RS 18 → 17',   m1.difal.RS[0], 0.17, 1e-9);
aprox('MT 19 → 17',   m1.difal.MT[0], 0.17, 1e-9);
aprox('SP ajustado à mão (20%) é preservado', m1.difal.SP[0], 0.20, 1e-9);
aprox('SP: DIFAL derivado 16%', m1.difal.SP[1], 0.16, 1e-9);
aprox('dólar do usuário preservado', m1.dolar, 5.25, 1e-9);
igual('empresa forçada para MG', m1.revenda.empresaUF, 'MG');
igual('FCP zero automático → null', m1.revenda.fcp.SP, null);
aprox('FCP RJ mantido', m1.revenda.fcp.RJ, 0.02, 1e-9);
igual('migrado passa na validação', C.validarConfig(m1).length, 0);
var m2 = C.migrarConfig(m1, D.config);
igual('idempotente: migrar de novo não muda nada', JSON.stringify(m2), JSON.stringify(m1));
var m3 = C.migrarConfig({ versao: 3, difal: { MG: [0.11, 0] } }, D.config);
aprox('v3 com MG 11% (ajuste manual pós-migração) não é sobrescrito', m3.difal.MG[0], 0.11, 1e-9);
igual('original não é mutado', antiga.difal.MG[0], 0.11);
lanca('migrar não-objeto → erro', function () { C.migrarConfig('x', D.config); }, /objeto/);

console.log('\n== Codex nº 2 — resíduos ==');
igual('motor ignora empresaUF diferente de MG (PE continua interestadual)', C.calcularRevenda(Object.assign(JSON.parse(JSON.stringify(cfgR)), { revenda: Object.assign({}, cfgR.revenda, { empresaUF: 'PE', fcp: Object.assign({}, cfgR.revenda.fcp, { PE: 0 }) }) }), Object.assign({}, inR, { clienteUF: 'PE' })).difalPct > 0, true);
invalida('interestadual ≠ 4% é rejeitado', function (c) { c.interestadual = 0.12; });
aprox('migração normaliza interestadual para 4%', C.migrarConfig(Object.assign(JSON.parse(JSON.stringify(D.config)), { interestadual: 1.5 }), D.config).interestadual, 0.04, 1e-12);
lanca('versão futura é rejeitada', function () { C.migrarConfig({ versao: 99 }, D.config); }, /mais nova/);
invalida('cartão 105% em 12x é rejeitado na configuração', function (c) { c.cartao.mdr.Visa = [0.5, 0.5, 0.5]; c.cartao.antecipacaoBase = 0.4; c.cartao.porParcela = 0.05; });
igual('cartão padrão passa (pior caso 12x < 100%)', C.validarConfig(cfg).length, 0);

/* ==== Fase 1a (módulo Orçamentos): FCP na importação direta, presumido v4, LC 224, migração v4 ==== */
console.log('\n== Fase 1a: calcularImportacao (FCP) ==');
var HASH_CALCULAR = '7ea1056b08c4282a59e272f904179d951dbee4835543cb741a3d17992b491ed1';   // sha256 de calcular.toString() aprovado pelo Codex (rodada 2)
igual('calcular() byte a byte igual ao aprovado', require('crypto').createHash('sha256').update(C.calcular.toString()).digest('hex'), HASH_CALCULAR);
var rW = C.calcularImportacao(cfg, inp), rB = C.calcular(cfg, inp);          // RJ não contribuinte: FCP 2%
aprox('FCP% RJ = 2%', rW.fcpPct, 0.02, 1e-12);
aprox('FCP = 2% × B15 (preço + taxa)', rW.fcp, rB.precoComTaxa * 0.02, 1e-9);
aprox('preço final = B18 + FCP', rW.precoFinal, rB.precoFinal + rW.fcp, 1e-9);
aprox('PIS += FCP × 1,65%', rW.pis, rB.pis + rW.fcp * 0.0165, 1e-9);
aprox('COFINS += FCP × 7,6%', rW.cofins, rB.cofins + rW.fcp * 0.076, 1e-9);
aprox('custo total += FCP + ΔPIS + ΔCOFINS', rW.custoTotal, rB.custoTotal + rW.fcp * (1 + 0.0165 + 0.076), 1e-9);
aprox('lucro = preço final − custo total', rW.lucro, rW.precoFinal - rW.custoTotal, 1e-9);
aprox('lucro cai só o PIS/COFINS sobre o FCP', rW.lucro, rB.lucro - rW.fcp * 0.0925, 1e-9);
aprox('preço/m² inclui FCP', rW.precoVendaM2, rW.precoFinal / Number(inp.quantidade), 1e-9);
aprox('markup recalculado', rW.markup, rW.lucro / rW.custoSemImposto, 1e-12);
igual('DIFAL, ICMS, custo sem imposto e frete inalterados', rW.difal === rB.difal && rW.icms === rB.icms && rW.custoSemImposto === rB.custoSemImposto && rW.frete === rB.frete, true);
igual('FCP confirmado (RJ)', rW.fcpConfirmado, true);
igual('nota de IPI não destacado presente', rW.notas.some(function (n) { return /IPI não destacado/.test(n); }), true);
var rMG = C.calcularImportacao(cfg, Object.assign({}, inp, { uf: 'MG' })), bMG = C.calcular(cfg, Object.assign({}, inp, { uf: 'MG' }));
igual('cliente em MG: idêntico a calcular()', rMG.precoFinal === bMG.precoFinal && rMG.custoTotal === bMG.custoTotal && rMG.lucro === bMG.lucro && rMG.fcp === 0, true);
var rCt = C.calcularImportacao(cfg, Object.assign({}, inp, { contribuinte: true })), bCt = C.calcular(cfg, Object.assign({}, inp, { contribuinte: true }));
igual('contribuinte: idêntico a calcular()', rCt.precoFinal === bCt.precoFinal && rCt.lucro === bCt.lucro && rCt.fcp === 0, true);
var rSP = C.calcularImportacao(cfg, Object.assign({}, inp, { uf: 'SP' })), bSP = C.calcular(cfg, Object.assign({}, inp, { uf: 'SP' }));
igual('UF com FCP null (SP): idêntico a calcular() + aviso', rSP.precoFinal === bSP.precoFinal && rSP.lucro === bSP.lucro && rSP.fcpConfirmado === false && rSP.avisos.length === 1 && /não confirmado/.test(rSP.avisos[0]), true);
igual('UF com FCP confirmado: sem aviso', rW.avisos.length, 0);
var dW = C.dreImportacao(cfg, rW);
aprox('DRE com FCP: linha DIFAL+FCP', dW.real.difalFcp, rW.difal + rW.fcp, 1e-9);
aprox('DRE com FCP: lucro operacional = lucro do envelope', dW.real.lucroOperacional, rW.lucro, 1e-6);
aprox('DRE com FCP: receita bruta = preço final com FCP', dW.real.receitaBruta, rW.precoFinal, 1e-9);
aprox('DRE presumido: base PIS/COFINS inclui FCP', dW.presumido.pisCofins, (rW.precoComTaxa + rW.fcp - rW.frete - rW.icms) * 0.0365, 1e-6);
igual('DRE importação traz ipi = 0 (uniformidade)', dW.real.ipi, 0);
var dB = C.dreImportacao(cfg, rB);
aprox('dreImportacao com resultado de calcular() (sem fcp) continua funcionando', dB.real.lucroOperacional, rB.lucro, 1e-6);

console.log('\n== Fase 1a: presumido v4 e LC 224/2025 ==');
aprox('aliquotaPresumido padrão = 3,08%', C.aliquotaPresumido(cfg.tributos), 0.08 * 0.25 + 0.12 * 0.09, 1e-12);
aprox('aliquotaPresumido com LC 224 = 8,8%×25% + 13,2%×9%', C.aliquotaPresumido(Object.assign({}, cfg.tributos, { lc224: true })), 0.088 * 0.25 + 0.132 * 0.09, 1e-12);
var cfgL = JSON.parse(JSON.stringify(cfg)); cfgL.tributos.lc224 = true;
var rL = C.calcularRevenda(cfgL, inR), rN0 = C.calcularRevenda(cfg, inR);
aprox('revenda: LC 224 sobe IRPJ/CSLL presumido em 10%', rL.dre.presumido.irpjCsll, rN0.dre.presumido.irpjCsll * 1.1, 1e-6);
igual('revenda: LC 224 não muda o lucro real', rL.dre.real.lucroLiquido, rN0.dre.real.lucroLiquido);
invalida('lc224 não booleano é rejeitado', function (c) { c.tributos.lc224 = 'sim'; });
invalida('proposta.validadeDias inválido é rejeitado', function (c) { c.proposta.validadeDias = -1; });
invalida('empresa.cnpj não texto é rejeitado', function (c) { c.empresa.cnpj = 123; });
igual('config padrão v4 válida', C.validarConfig(D.config).length, 0);
var v3 = JSON.parse(JSON.stringify(D.config)); v3.versao = 3; v3.tributos.irpj = 0.15; delete v3.tributos.lc224; delete v3.empresa; delete v3.proposta;
var m4 = C.migrarConfig(v3, D.config);
aprox('migração v4: irpj 15% → 25%', m4.tributos.irpj, 0.25, 1e-12);
igual('migração v4: lc224 = false, empresa e proposta completados', m4.tributos.lc224 === false && m4.empresa.razaoSocial === 'MaisGlass' && m4.proposta.validadeDias === 15, true);
igual('migração v4: versão 4', m4.versao, 4);
var v3b = JSON.parse(JSON.stringify(D.config)); v3b.versao = 3; v3b.tributos.irpj = 0.20;
aprox('migração v4: irpj ajustado à mão (20%) preservado', C.migrarConfig(v3b, D.config).tributos.irpj, 0.20, 1e-12);
igual('migração v4 idempotente', JSON.stringify(C.migrarConfig(m4, D.config)), JSON.stringify(m4));

/* ==== Fase 1b (módulo Orçamentos): orcamento.js ==== */
var O = require(path.join(__dirname, '..', 'orcamento.js')).GM_ORC;
function quase(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 0.005 : tol); }
function orcBase(uf, dest) {
  var o = O.novoOrcamento(cfg, { nome: 'Construtora Teste', uf: uf || 'RJ', destinatario: dest || 'consumidorFinal' });
  return o;
}
function addItem(o, origem, inputs, descricao) {
  var it = { id: O.gerarId('it'), origem: origem, descricao: descricao || origem, inputs: inputs };
  var c = O.calcularItem(o.configSnapshot, O.cabecalhoDe(o), it);
  it.inputs = c.inputs; it.resultado = c.resultado; it.avisos = c.avisos;
  o.itens.push(it); return it;
}
var inpImp = Object.assign({}, inp);                                   // importação: cenário da planilha (RJ, 1336 m², R$ 140)
var inpRev = Object.assign({}, in4);                                   // revenda §4 (600 m², 69,70 → 125 fechado, RJ)
var inpNac = Object.assign({}, inNac, { clienteUF: 'RJ' });            // nacional 2.000 m² para RJ

console.log('\n== Fase 1b: novoOrcamento / calcularItem / adaptarDre ==');
var o1 = orcBase('RJ');
igual('novo orçamento: rascunho, revisão 1, sem itens', o1.status === 'rascunho' && o1.revisao === 1 && o1.itens.length === 0, true);
igual('premissas congeladas vêm da config (34%, irpj 25%, lc224 false)', o1.premissas.irpjCsllReal === 0.34 && o1.premissas.irpj === 0.25 && o1.premissas.lc224 === false, true);
igual('configSnapshot é cópia (não referência)', o1.configSnapshot !== cfg && o1.configSnapshot.dolar === cfg.dolar, true);
igual('validade e observações vêm de config.proposta', o1.condicoes.validadeDias === 15 && /confirmação de estoque/.test(o1.condicoes.observacoes), true);
igual('orçamento novo é válido', O.validarOrcamento(o1).length, 0);
var itImp = addItem(o1, 'importacao', inpImp, 'Laminado 4+4');
var rImpRef = C.calcularImportacao(cfg, inpImp);
aprox('item importação sozinho: preço final = calcularImportacao', itImp.resultado.precoFinal, rImpRef.precoFinal, 1e-9);
aprox('item importação sozinho: lucro = calcularImportacao', itImp.resultado.lucro, rImpRef.lucro, 1e-9);
var aImp = O.adaptarDre('importacao', itImp.resultado);
var credImp = Number(inpImp.quantidade) * (itImp.resultado.importacao.creditoPisM2 + itImp.resultado.importacao.creditoCofinsM2);
aprox('adaptador: PIS/COFINS real = líquido + créditos da importação', aImp.real.pisCofins, itImp.resultado.dre.real.pisCofins + credImp, 1e-9);
aprox('adaptador: CMV real = custo sem imposto − créditos', aImp.real.cmv, itImp.resultado.custoSemImposto - credImp, 1e-9);
aprox('adaptador: lucro operacional inalterado', aImp.real.lucroBruto - aImp.real.frete - aImp.real.cartao, itImp.resultado.lucro, 1e-6);
aprox('adaptador: receita líquida coerente', aImp.real.receitaLiquida, aImp.real.receitaBruta - aImp.real.deducoes, 1e-9);
aprox('adaptador: presumido da importação não muda', aImp.presumido.cmv, itImp.resultado.dre.presumido.cmv, 1e-12);
var c1 = O.consolidar(o1);
aprox('1 item importação: lucro operacional = item', c1.real.lucroOperacional, itImp.resultado.lucro, 1e-6);
aprox('1 item importação: lucro líquido real = item', c1.real.lucroLiquido, itImp.resultado.dre.real.lucroLiquido, 1e-6);
aprox('1 item importação: lucro líquido presumido = item', c1.presumido.lucroLiquido, itImp.resultado.dre.presumido.lucroLiquido, 1e-6);
aprox('1 item: total ao cliente = preço final', c1.totais.totalCliente, itImp.resultado.precoFinal, 1e-9);
igual('item importação carrega FCP RJ e nota', itImp.resultado.fcpPct === 0.02 && itImp.avisos.length === 0, true);

var o2 = orcBase('RJ'); var itRev = addItem(o2, 'revenda', inpRev, 'Float revenda');
var c2 = O.consolidar(o2);
aprox('1 item revenda: lucro líquido real = item', c2.real.lucroLiquido, itRev.resultado.dre.real.lucroLiquido, 1e-6);
aprox('1 item revenda: lucro operacional 12.362,37 (§4)', c2.real.lucroOperacional, 12362.37, 0.005);
igual('1 item revenda: cada linha = item', ['receitaBruta','ipi','icms','difalFcp','pisCofins','cmv','frete','cartao'].every(function (k) { return quase(c2.real[k], itRev.resultado.dre.real[k], 1e-9); }), true);
var o3 = orcBase('RJ'); var itNac = addItem(o3, 'nacional', inpNac, 'Temperado nacional');
var c3 = O.consolidar(o3);
aprox('1 item nacional: lucro líquido real = item', c3.real.lucroLiquido, itNac.resultado.dre.real.lucroLiquido, 1e-6);

console.log('\n== Fase 1b: três itens juntos (RJ consumidor final) ==');
var o4 = orcBase('RJ');
var i1 = addItem(o4, 'importacao', inpImp, 'A'), i2 = addItem(o4, 'revenda', inpRev, 'B'), i3 = addItem(o4, 'nacional', inpNac, 'C');
var c4 = O.consolidar(o4);
var somaLucro = i1.resultado.lucro + i2.resultado.lucro + i3.resultado.lucro;
aprox('lucro operacional = Σ itens', c4.real.lucroOperacional, somaLucro, 1e-6);
aprox('receita bruta = Σ preço final', c4.real.receitaBruta, i1.resultado.precoFinal + i2.resultado.precoFinal + i3.resultado.precoFinal, 1e-9);
igual('linhas aditivas somam (real)', ['ipi','icms','difalFcp','pisCofins','deducoes','cmv','frete','cartao'].every(function (k) {
  var soma = [i1, i2, i3].reduce(function (s, it) { return s + O.adaptarDre(it.origem, it.resultado).real[k]; }, 0); return quase(c4.real[k], soma, 1e-6); }), true);
aprox('IRPJ real = 34% × Σ lucro (recalculado)', c4.real.irpjCsll, Math.max(0, somaLucro) * 0.34, 1e-6);
aprox('IRPJ presumido = Σ itens', c4.presumido.irpjCsll, i1.resultado.dre.presumido.irpjCsll + i2.resultado.dre.presumido.irpjCsll + i3.resultado.dre.presumido.irpjCsll, 1e-6);
aprox('margem sobre valor pago dos totais', c4.real.margemSobreValorPago, c4.real.lucroLiquido / c4.real.receitaBruta, 1e-12);
aprox('consistência: receita − custo total (real) = lucro operacional', c4.totais.totalCliente - c4.totais.custoTotalReal, c4.real.lucroOperacional, 1e-6);
aprox('composição fecha no total pago', c4.composicao.reduce(function (s, p) { return s + p.valor; }, 0), c4.real.receitaBruta, 1e-6);
aprox('tributos totais = Σ(item − irpj) + irpj consolidado', c4.real.tributosTotais, [i1, i2, i3].reduce(function (s, it) { return s + it.resultado.dre.real.tributosTotais - it.resultado.dre.real.irpjCsll; }, 0) + c4.real.irpjCsll, 1e-6);
igual('resumo por item: 3 linhas com origem e margem', c4.itens.length === 3 && c4.itens[0].origem === 'importacao' && c4.itens[1].margem > 0, true);
igual('reordenar itens não muda totais', (function () { var oo = JSON.parse(JSON.stringify(o4)); oo.itens.reverse(); return quase(O.consolidar(oo).real.lucroLiquido, c4.real.lucroLiquido, 1e-9); })(), true);
igual('dividir um item em dois de metade: mesmo consolidado', (function () {
  var oo = orcBase('RJ'); addItem(oo, 'revenda', Object.assign({}, inpRev, { quantidade: 300 }), 'B1'); addItem(oo, 'revenda', Object.assign({}, inpRev, { quantidade: 300 }), 'B2');
  return quase(O.consolidar(oo).real.lucroLiquido, c2.real.lucroLiquido, 0.005) && quase(O.consolidar(oo).totais.totalCliente, c2.totais.totalCliente, 0.005); })(), true);

console.log('\n== Fase 1b: custos internos, comissão %, prejuízo ==');
var o5 = JSON.parse(JSON.stringify(o4));
o5.custosInternos.push({ id: 'c1', tipo: 'freteContratado', descricao: 'Transportadora', valor: 6000, percentual: null });
o5.custosInternos.push({ id: 'c2', tipo: 'instalacao', descricao: 'Equipe', valor: 4000, percentual: null });
var c5 = O.consolidar(o5);
aprox('10 mil de custos internos reduzem o lucro operacional em 10 mil', c5.real.lucroOperacional, c4.real.lucroOperacional - 10000, 1e-6);
aprox('IRPJ real cai 3.400 (lucro suficiente)', c5.real.irpjCsll, c4.real.irpjCsll - 3400, 1e-6);
aprox('presumido: IRPJ igual, lucro líquido −10 mil', c5.presumido.irpjCsll, c4.presumido.irpjCsll, 1e-9);
aprox('presumido: lucro líquido −10 mil', c5.presumido.lucroLiquido, c4.presumido.lucroLiquido - 10000, 1e-6);
aprox('custo total real inclui internos', c5.totais.custoTotalReal, c4.totais.custoTotalReal + 10000, 1e-6);
igual('frete cobrado em item + transporte interno → aviso (aqui itens sem frete: sem aviso)', c5.avisos.some(function (a) { return /duas vezes/.test(a); }), false);
var o5b = JSON.parse(JSON.stringify(o5)); o5b.itens[1].resultado.frete = 1000;
igual('frete cobrado em item + transporte interno → aviso', O.consolidar(o5b).avisos.some(function (a) { return /duas vezes/.test(a); }), true);
var o6 = JSON.parse(JSON.stringify(o4)); o6.custosInternos.push({ id: 'c3', tipo: 'comissao', descricao: 'Representante', valor: null, percentual: 0.02 });
var c6 = O.consolidar(o6);
aprox('comissão 2% = 2% do total ao cliente', c6.custos[0].valor, 0.02 * c4.real.receitaBruta, 1e-6);
aprox('comissão % reduz o lucro operacional', c6.real.lucroOperacional, c4.real.lucroOperacional - 0.02 * c4.real.receitaBruta, 1e-6);
var o7 = orcBase('RJ'); var i7 = addItem(o7, 'revenda', inpRev, 'B');
o7.custosInternos.push({ id: 'c9', tipo: 'outros', descricao: 'Grande', valor: i7.resultado.lucro + 5000, percentual: null });
var c7 = O.consolidar(o7);
aprox('lucro 12.362 com custo maior: resultado −5.000', c7.real.lucroOperacional, -5000, 1e-6);
aprox('prejuízo: IRPJ real 0', c7.real.irpjCsll, 0, 1e-12);
aprox('prejuízo: redução potencial informativa 1.700', c7.real.reducaoPotencial, 1700, 1e-6);
igual('prejuízo: margens n/a', c7.real.margemLiquida === null || c7.real.margemLiquida < 0, true);
var o8 = orcBase('RJ'); var i8a = addItem(o8, 'revenda', inpRev, 'lucro'), i8b = addItem(o8, 'revenda', Object.assign({}, inpRev, { precoVenda: 90 }), 'prejuízo');
var c8 = O.consolidar(o8);
igual('item com prejuízo existe', i8b.resultado.lucro < 0, true);
aprox('prejuízo de um item compensa o outro no IRPJ real', c8.real.irpjCsll, Math.max(0, i8a.resultado.lucro + i8b.resultado.lucro) * 0.34, 1e-6);
igual('IRPJ consolidado < soma dos IRPJ dos itens', c8.real.irpjCsll < i8a.resultado.dre.real.irpjCsll + i8b.resultado.dre.real.irpjCsll, true);
var o9 = orcBase('RJ'); o9.custosInternos.push({ id: 'c1', tipo: 'outros', descricao: 'só custo', valor: 500, percentual: null });
var c9 = O.consolidar(o9);
igual('sem itens, com custos: receita 0 e resultado −500', c9.real.receitaBruta === 0 && quase(c9.real.lucroOperacional, -500, 1e-9), true);

console.log('\n== Fase 1b: cabeçalho manda / recalcular / congelamento ==');
var o10 = orcBase('SP', 'contribuinteRevenda');
var i10 = addItem(o10, 'revenda', Object.assign({}, inpRev, { clienteUF: 'RJ', contribuinte: false, pagamento: 'Parcelado', bandeira: 'Amex', parcelas: 3 }), 'x');
igual('cabeçalho sobrescreve UF, destinatário e pagamento', i10.inputs.clienteUF === 'SP' && i10.inputs.contribuinte === true && i10.inputs.pagamento === 'À vista', true);
aprox('contribuinte em SP: DIFAL/FCP zero', i10.resultado.difal + i10.resultado.fcp, 0, 1e-12);
igual('divergências detectadas antes de adicionar', O.divergenciasCabecalho('revenda', Object.assign({}, inpRev, { clienteUF: 'RJ' }), O.cabecalhoDe(o10)).length, 2);
var o11 = orcBase('RJ'); o11.condicoes.pagamento = 'Parcelado'; o11.condicoes.bandeira = 'Amex'; o11.condicoes.parcelas = 3;
var i11 = addItem(o11, 'importacao', inpImp, 'imp'), i11b = addItem(o11, 'nacional', inpNac, 'nac');
igual('parcelado do cabeçalho vale para importação e nacional', i11.inputs.parcelas === 3 && i11.inputs.bandeira === 'Amex' && i11b.inputs.parcelas === 3 && i11.resultado.taxaCartao > 0 && i11b.resultado.taxaCartao > 0, true);
var cfgNovo = JSON.parse(JSON.stringify(cfg)); cfgNovo.dolar = 6.0; cfgNovo.tributos.irpjCsllReal = 0.40;
var antes = O.consolidar(o4);
igual('config viva alterada sem Recalcular: consolidado não muda', JSON.stringify(O.consolidar(o4)) === JSON.stringify(antes), true);
var oR = JSON.parse(JSON.stringify(o4)); var cabR = O.cabecalhoDe(oR);
var novos = oR.itens.map(function (it) { return O.calcularItem(cfgNovo, cabR, it); });
igual('recalcular com dólar 6: só importação muda', novos[0].resultado.lucro !== oR.itens[0].resultado.lucro && quase(novos[1].resultado.lucro, oR.itens[1].resultado.lucro, 1e-9) && quase(novos[2].resultado.lucro, oR.itens[2].resultado.lucro, 1e-9), true);
igual('snapshot original intacto até aplicar', oR.itens[0].resultado.lucro === o4.itens[0].resultado.lucro, true);
oR.itens.forEach(function (it, i) { it.resultado = novos[i].resultado; it.inputs = novos[i].inputs; }); oR.premissas = O.premissasDe(cfgNovo); oR.configSnapshot = JSON.parse(JSON.stringify(cfgNovo));
var cR = O.consolidar(oR);
aprox('após aplicar: IRPJ real com a premissa nova (40%)', cR.real.irpjCsll, Math.max(0, cR.real.lucroOperacional) * 0.40, 1e-6);
igual('conferirResultados: orçamento coerente não diverge', O.conferirResultados(o4).divergentes.length, 0);
var oAd = JSON.parse(JSON.stringify(o4)); oAd.itens[1].resultado.lucro += 100;
igual('conferirResultados: resultado adulterado é apontado', O.conferirResultados(oAd).divergentes.some(function (d) { return d.id === oAd.itens[1].id && /lucro/.test(d.motivo); }), true);

console.log('\n== Fase 1b: validação e migração do orçamento ==');
function invOrc(nome, mut) { var oo = JSON.parse(JSON.stringify(o5)); mut(oo); var n = O.validarOrcamento(oo).length; if (!n) falhas++; console.log((n ? 'OK   ' : 'FALHA') + ' ' + nome + (n ? '' : '  (esperava erro)')); }
igual('orçamento completo é válido', O.validarOrcamento(o5).length, 0);
invOrc('UF inválida', function (oo) { oo.cliente.uf = 'XX'; });
invOrc('destinatário inválido', function (oo) { oo.cliente.destinatario = 'qualquer'; });
invOrc('item com clienteUF ≠ cabeçalho', function (oo) { oo.itens[1].inputs.clienteUF = 'SP'; });
invOrc('item importação com uf ≠ cabeçalho', function (oo) { oo.itens[0].inputs.uf = 'MG'; });
invOrc('item com pagamento ≠ cabeçalho', function (oo) { oo.itens[2].inputs.pagamento = 'Parcelado'; });
invOrc('custo negativo', function (oo) { oo.custosInternos[0].valor = -1; });
invOrc('custo com valor E percentual', function (oo) { oo.custosInternos[0].percentual = 0.1; });
invOrc('percentual > 100%', function (oo) { oo.custosInternos[0].valor = null; oo.custosInternos[0].percentual = 1.5; });
invOrc('tipo de custo desconhecido', function (oo) { oo.custosInternos[0].tipo = 'xpto'; });
invOrc('formato futuro', function (oo) { oo.versaoFormato = 99; });
invOrc('ids duplicados', function (oo) { oo.custosInternos[1].id = oo.custosInternos[0].id; });
invOrc('resultado não finito', function (oo) { oo.itens[0].resultado.lucro = 'abc'; });
invOrc('origem desconhecida', function (oo) { oo.itens[0].origem = 'outra'; });
invOrc('status inválido', function (oo) { oo.status = 'sei lá'; });
invOrc('parcelas fora de 1..12', function (oo) { oo.condicoes.parcelas = 13; });
invOrc('sem premissas', function (oo) { delete oo.premissas; });
invOrc('sem configSnapshot', function (oo) { delete oo.configSnapshot; });
lanca('migrarOrcamento: formato futuro lança', function () { O.migrarOrcamento({ versaoFormato: 99 }); }, /mais novo/);
var mig = O.migrarOrcamento({ id: 'x', cliente: { nome: '', uf: 'RJ', destinatario: 'consumidorFinal' }, condicoes: { pagamento: 'À vista', bandeira: 'Visa', parcelas: 1 }, premissas: O.premissasDe(cfg), configSnapshot: cfg });
igual('migrarOrcamento completa revisão/status/listas/inclusos', mig.revisao === 1 && mig.status === 'rascunho' && mig.itens.length === 0 && mig.custosInternos.length === 0 && mig.condicoes.inclusos.frete === false, true);
lanca('calcularItem: origem desconhecida lança', function () { O.calcularItem(cfg, O.cabecalhoDe(o4), { origem: 'x', inputs: {} }); }, /Origem/);
lanca('calcularItem: UF sem FCP (revenda) propaga o erro do motor', function () { O.calcularItem(cfg, { uf: 'SP', destinatario: 'consumidorFinal', pagamento: 'À vista', bandeira: 'Visa', parcelas: 1 }, { origem: 'revenda', inputs: inpRev }); }, /FCP/);
var iSP = O.calcularItem(cfg, { uf: 'SP', destinatario: 'consumidorFinal', pagamento: 'À vista', bandeira: 'Visa', parcelas: 1 }, { origem: 'importacao', inputs: inpImp });
igual('calcularItem: importação em UF sem FCP calcula com aviso', iSP.resultado.fcp === 0 && iSP.avisos.length === 1, true);

/* ==== Rodada 4 (parecer nº 3 do Codex) ==== */
console.log('\n== Parecer 3 — achado 1: alíquota de saída acompanha a UF do cabeçalho ==');
var cfgBA = JSON.parse(JSON.stringify(cfg)); cfgBA.revenda.fcp.BA = 0.02;   // BA com FCP cadastrado para o cenário consumidor final
var oBA = O.novoOrcamento(cfgBA, { nome: 'BA', uf: 'BA', destinatario: 'contribuinteRevenda' });
var itBA = addItem(oBA, 'nacional', Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.12 }), 'nac');   // calculadora estava em RJ (12%)
aprox('nacional RJ(12%) → BA contribuinte: alíquota vira 7% (Res. SF 22/1989)', itBA.inputs.icmsSaida, 0.07, 1e-12);
var refBA = C.calcularRevenda(cfgBA, Object.assign({}, inNac, { clienteUF: 'BA', contribuinte: true, icmsSaida: 0.07 }));
aprox('nacional MG→BA: lucro igual ao da calculadora preparada para BA (113.473,98)', itBA.resultado.lucro, refBA.lucro, 1e-6);
aprox('nacional MG→BA: lucro de referência do parecer', itBA.resultado.lucro, 113473.98, 0.005);
igual('sem aviso quando a alíquota era a automática', itBA.avisos.length, 0);
var oBA2 = O.novoOrcamento(cfgBA, { nome: 'BA', uf: 'BA', destinatario: 'contribuinteRevenda' });
var itBA2 = addItem(oBA2, 'nacional', Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.10 }), 'nac manual');   // ajuste manual (10% ≠ 12% automático do RJ)
aprox('ajuste manual (10%) é mantido ao trocar a UF', itBA2.inputs.icmsSaida, 0.10, 1e-12);
igual('ajuste manual gera aviso citando a regra geral (7%)', itBA2.avisos.length === 1 && /mantido do ajuste manual/.test(itBA2.avisos[0]) && /7%/.test(itBA2.avisos[0]), true);
var oVolta = O.novoOrcamento(cfgBA, { nome: 'RJ', uf: 'RJ' });
var itVolta = addItem(oVolta, 'nacional', Object.assign({}, inNac, { clienteUF: 'BA', icmsSaida: 0.07 }), 'nac');
aprox('BA(7%) → RJ: volta para 12%', itVolta.inputs.icmsSaida, 0.12, 1e-12);
var oMGi = O.novoOrcamento(cfgBA, { nome: 'MG', uf: 'MG' });
var itMGi = addItem(oMGi, 'nacional', Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.12 }), 'nac');
igual('destino MG (venda interna): campo não é sobrescrito e motor usa a interna 18%', itMGi.inputs.icmsSaida === 0.12 && Math.abs(itMGi.resultado.icmsVendaAliq - 0.18) < 1e-9, true);
var oRevBA = O.novoOrcamento(cfgBA, { nome: 'BA', uf: 'BA' });
var itRevBA = addItem(oRevBA, 'revenda', Object.assign({}, inpRev, { clienteUF: 'RJ' }), 'rev');
aprox('revenda de importado: 4% em qualquer UF', itRevBA.inputs.icmsSaida, 0.04, 1e-12);
// mudança de cabeçalho num orçamento existente (o app recalcula todos os itens com o novo cabeçalho)
var oMud = O.novoOrcamento(cfgBA, { nome: 'x', uf: 'RJ' }); addItem(oMud, 'nacional', inpNac, 'nac');
var cabBA = { uf: 'BA', destinatario: 'consumidorFinal', pagamento: 'À vista', bandeira: 'Visa', parcelas: 1 };
var reBA = O.calcularItem(cfgBA, cabBA, oMud.itens[0]);
aprox('mudar cabeçalho RJ → BA (consumidor final): 7% e DIFAL BA = 20,5% − 7%', reBA.resultado.difalPct, 0.205 - 0.07, 1e-9);

console.log('\n== Parecer 3 — achado 3: JSON com DRE adulterada é detectado ==');
var oOk = JSON.parse(JSON.stringify(o4));
igual('orçamento coerente: validação vazia e sem divergentes', O.validarOrcamento(oOk).length === 0 && O.conferirResultados(oOk).divergentes.length === 0, true);
function adultera(nome, mut, esperaValidacao) {
  var oo = JSON.parse(JSON.stringify(o4)); mut(oo);
  var v = O.validarOrcamento(oo).length, d = O.conferirResultados(oo).divergentes.length;
  var ok = esperaValidacao ? v > 0 : (v > 0 || d > 0);
  if (!ok) falhas++;
  console.log((ok ? 'OK   ' : 'FALHA') + ' ' + nome + ': validação ' + v + ' erro(s), ' + d + ' divergente(s)');
}
adultera('CMV real +10.000 (topo intacto)', function (oo) { oo.itens[0].resultado.dre.real.cmv += 10000; });
adultera('deduções real −5.000', function (oo) { oo.itens[1].resultado.dre.real.deducoes -= 5000; });
adultera('receita bruta da DRE alterada', function (oo) { oo.itens[2].resultado.dre.real.receitaBruta += 1; });
adultera('IRPJ presumido zerado', function (oo) { oo.itens[1].resultado.dre.presumido.irpjCsll = 0; });
adultera('crédito da importação alterado', function (oo) { oo.itens[0].resultado.importacao.creditoPisM2 += 1; });
adultera('DRE real = {}', function (oo) { oo.itens[0].resultado.dre.real = {}; }, true);
adultera('campo removido (pisCofins)', function (oo) { delete oo.itens[1].resultado.dre.real.pisCofins; }, true);
adultera('string no lugar de número', function (oo) { oo.itens[2].resultado.dre.presumido.cmv = '100'; }, true);
adultera('null no lugar de número', function (oo) { oo.itens[2].resultado.custoTotal = null; }, true);
adultera('premissa irpjCsllReal ≠ configSnapshot', function (oo) { oo.premissas.irpjCsllReal = 0.10; }, true);
adultera('configSnapshot inválido (dólar 0)', function (oo) { oo.configSnapshot.dolar = 0; }, true);
adultera('premissa fora de 0..1', function (oo) { oo.premissas.irpj = 5; oo.configSnapshot.tributos.irpj = 5; }, true);
adultera('lucro coerente mas DRE presumida trocada por real', function (oo) { oo.itens[1].resultado.dre.presumido = JSON.parse(JSON.stringify(oo.itens[1].resultado.dre.real)); });
igual('consolidar com DRE {} não produz NaN após rejeição (validação impede)', O.validarOrcamento((function () { var oo = JSON.parse(JSON.stringify(o4)); oo.itens[0].resultado.dre.real = {}; return oo; })()).length > 0, true);
var rec = O.conferirResultados(oOk);
igual('conferirResultados devolve recalculados para todos os itens', Object.keys(rec.recalculados).length, 3);
lanca('migrar: "itens" com tipo inválido é recusado', function () { O.migrarOrcamento({ id: 'x', itens: 'abc' }); }, /malformado/);
lanca('migrar: "custosInternos" objeto é recusado', function () { O.migrarOrcamento({ id: 'x', custosInternos: {} }); }, /malformado/);
lanca('migrar: "condicoes" string é recusado', function () { O.migrarOrcamento({ id: 'x', condicoes: 'x' }); }, /malformado/);
igual('migrar: campo ausente é completado (itens → [])', O.migrarOrcamento({ id: 'x' }).itens.length, 0);
igual('migrar: orçamento antigo enviado sem emitidoEm ganha marco', O.migrarOrcamento({ id: 'x', status: 'enviado', enviadoEm: '2026-09-01T00:00:00Z' }).emitidoEm, '2026-09-01T00:00:00Z');
igual('migrar: rascunho fica sem emitidoEm', O.migrarOrcamento({ id: 'x', status: 'rascunho' }).emitidoEm, null);
igual('fcpPendente: importação em UF sem FCP', O.fcpPendente((function () { var oo = O.novoOrcamento(cfg, { uf: 'SP' }); var it = { id: 'i', origem: 'importacao', inputs: inpImp }; var c = O.calcularItem(cfg, O.cabecalhoDe(oo), it); it.inputs = c.inputs; it.resultado = c.resultado; oo.itens.push(it); return oo; })()).join(','), 'SP');
igual('fcpPendente: RJ confirmado → vazio', O.fcpPendente(o4).length, 0);

/* ==== Rodada 5 (parecer nº 4 do Codex) ==== */
console.log('\n== Parecer 4 — achado 1: classificação manual/automática persistida ==');
var cfgP4 = JSON.parse(JSON.stringify(cfg)); cfgP4.revenda.fcp.BA = 0.02; cfgP4.revenda.fcp.MG = 0;
function cabP4(uf) { return { uf: uf, destinatario: 'contribuinteRevenda', pagamento: 'À vista', bandeira: 'Visa', parcelas: 1 }; }
function passos(inputsIniciais, ufs) {   // aplica uma sequência de cabeçalhos e devolve o último { inputs, resultado, avisos }
  var it = { id: 'p4', origem: 'nacional', inputs: inputsIniciais }, c;
  ufs.forEach(function (uf) { c = O.calcularItem(cfgP4, cabP4(uf), it); it = Object.assign({}, it, { inputs: c.inputs, resultado: c.resultado, avisos: c.avisos }); });
  return it;
}
igual('classificar: RJ com 12% = automático', O.classificarAliquotaSaida('nacional', Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.12 })), false);
igual('classificar: RJ com 10% = manual', O.classificarAliquotaSaida('nacional', Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.10 })), true);
igual('classificar: MG (campo não usado) = automático', O.classificarAliquotaSaida('nacional', Object.assign({}, inNac, { clienteUF: 'MG', icmsSaida: 0.10 })), false);
igual('classificar: importação nunca é manual', O.classificarAliquotaSaida('importacao', inpImp), false);
var m1 = passos(Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.10 }), ['MG', 'RJ']);
igual('manual 10%: RJ → MG → RJ mantém 10% com flag e aviso', Math.abs(m1.inputs.icmsSaida - 0.10) < 1e-12 && m1.inputs.icmsSaidaManual === true && /ajuste manual/.test(m1.avisos.join(' ')), true);
var m2 = passos(Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.10 }), ['MG', 'BA']);
igual('manual 10%: RJ → MG → BA mantém 10% e avisa que a regra seria 7%', Math.abs(m2.inputs.icmsSaida - 0.10) < 1e-12 && /7%/.test(m2.avisos.join(' ')), true);
var a1 = passos(Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.12 }), ['MG', 'BA']);
igual('automático: RJ → MG → BA vira 7% sem aviso', Math.abs(a1.inputs.icmsSaida - 0.07) < 1e-12 && a1.inputs.icmsSaidaManual === false && a1.avisos.length === 0, true);
var m3 = passos(Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.07 }), ['BA', 'RJ']);   // manual 7% coincide com a regra da BA no meio do caminho
igual('manual 7% (coincide com BA): RJ → BA (sem aviso) → RJ continua manual 7% com aviso 12%', Math.abs(m3.inputs.icmsSaida - 0.07) < 1e-12 && m3.inputs.icmsSaidaManual === true && /12%/.test(m3.avisos.join(' ')), true);
var m3b = passos(Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.07 }), ['BA']);
igual('manual 7% em BA: sem aviso (coincide com a regra)', m3b.avisos.length, 0);
var mg1 = passos(Object.assign({}, inNac, { clienteUF: 'MG', icmsSaida: 0.12 }), ['BA']);
igual('item criado em MG (campo não usado): vai para BA como automático 7%', Math.abs(mg1.inputs.icmsSaida - 0.07) < 1e-12 && mg1.inputs.icmsSaidaManual === false, true);
var mg2 = passos(Object.assign({}, inNac, { clienteUF: 'MG', icmsSaida: 0.10 }), ['RJ']);
igual('item criado em MG com 10% no campo: automático (12% no RJ)', Math.abs(mg2.inputs.icmsSaida - 0.12) < 1e-12, true);
var flagLegado = O.calcularItem(cfgP4, cabP4('BA'), { id: 'x', origem: 'nacional', inputs: Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.10, icmsSaidaManual: undefined }) });
igual('item antigo sem flag: classificado pela UF que traz e a flag passa a ser gravada', flagLegado.inputs.icmsSaidaManual === true && Math.abs(flagLegado.inputs.icmsSaida - 0.10) < 1e-12, true);
var flagForcada = O.calcularItem(cfgP4, cabP4('BA'), { id: 'x', origem: 'nacional', inputs: Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.12, icmsSaidaManual: true }) });
igual('flag manual explícita vence a comparação numérica (12% mantido em BA)', Math.abs(flagForcada.inputs.icmsSaida - 0.12) < 1e-12 && flagForcada.avisos.length === 1, true);
igual('importação: flag não é gravada', O.calcularItem(cfgP4, cabP4('BA'), { id: 'x', origem: 'importacao', inputs: inpImp }).inputs.icmsSaidaManual, undefined);
invOrc('icmsSaidaManual não booleano é rejeitado', function (oo) { oo.itens[1].inputs.icmsSaidaManual = 'sim'; });

console.log('\n== Parecer 4 — achado 4: custo interno com regra única ==');
function custoInvalido(nome, v, pct) {
  var oo = JSON.parse(JSON.stringify(o4)); oo.custosInternos = [{ id: 'bad', tipo: 'outros', descricao: 'x', valor: pct === undefined ? v : null, percentual: pct === undefined ? null : v }];
  var nv = O.validarOrcamento(oo).length, lancou = false; try { O.consolidar(oo); } catch (e) { lancou = true; }
  var ok = nv > 0 && lancou; if (!ok) falhas++;
  console.log((ok ? 'OK   ' : 'FALHA') + ' ' + nome + ': validação ' + nv + ' erro(s), consolidar ' + (lancou ? 'lança' : 'NÃO lança'));
}
custoInvalido('valor vazio ""', '');
custoInvalido('valor "   "', '   ');
custoInvalido('valor true', true);
custoInvalido('valor []', []);
custoInvalido('valor {}', {});
custoInvalido('valor "abc"', 'abc');
custoInvalido('percentual ""', '', true);
custoInvalido('percentual true', true, true);
var oStr = JSON.parse(JSON.stringify(o4)); oStr.custosInternos = [{ id: 'c', tipo: 'outros', descricao: 'x', valor: '100', percentual: null }];
igual('valor "100" (string numérica) é aceito pelos dois', O.validarOrcamento(oStr).length === 0 && Math.abs(O.consolidar(oStr).totais.custosInternos - 100) < 1e-9, true);
invOrc('descrição de custo não texto é rejeitada', function (oo) { oo.custosInternos[0].descricao = 5; });

console.log('\n== Parecer 4 — achado 5: migração do marco de emissão (legado) ==');
var base = { id: 'x', cliente: { nome: '', uf: 'RJ', destinatario: 'consumidorFinal' }, condicoes: { pagamento: 'À vista', bandeira: 'Visa', parcelas: 1 }, premissas: O.premissasDe(cfg), configSnapshot: cfg, atualizadoEm: '2026-09-10T10:00:00Z' };
var leg = O.migrarOrcamento(Object.assign({}, base, { status: 'rascunho', enviadoEm: '2026-09-01T12:00:00Z' }));
igual('rascunho com enviadoEm: emitidoEm = enviadoEm, travado, origem registrada', leg.emitidoEm === '2026-09-01T12:00:00Z' && O.emitido(leg) && /migracao:enviadoEm/.test(leg.emissaoOrigem) && /Nova revisão/.test(leg.emissaoOrigem), true);
igual('rascunho com enviadoEm passa na validação', O.validarOrcamento(leg).length, 0);
var apv = O.migrarOrcamento(Object.assign({}, base, { status: 'aprovado' }));
igual('aprovado sem data de envio: atualizadoEm com origem "inferida"', apv.emitidoEm === '2026-09-10T10:00:00Z' && /inferida/.test(apv.emissaoOrigem), true);
var env = O.migrarOrcamento(Object.assign({}, base, { status: 'enviado', enviadoEm: '2026-09-02T00:00:00Z' }));
igual('enviado normal: emitidoEm = enviadoEm', env.emitidoEm, '2026-09-02T00:00:00Z');
igual('rascunho sem emissão: emitidoEm null, origem null', O.migrarOrcamento(Object.assign({}, base, { status: 'rascunho' })).emitidoEm === null && O.migrarOrcamento(Object.assign({}, base, { status: 'rascunho' })).emissaoOrigem === null, true);
var dataRuim = O.migrarOrcamento(Object.assign({}, base, { status: 'rascunho', enviadoEm: 'ontem' }));
igual('enviadoEm inválido não vale como evidência (rascunho fica sem emissão)', dataRuim.emitidoEm === null && dataRuim.enviadoEm === null, true);
lanca('emitidoEm inválido é recusado', function () { O.migrarOrcamento(Object.assign({}, base, { status: 'enviado', emitidoEm: 'x' })); }, /emitidoEm/);
igual('migração repetida não muda nada', JSON.stringify(O.migrarOrcamento(leg)), JSON.stringify(leg));
igual('novo orçamento: emissaoOrigem null', O.novoOrcamento(cfg, {}).emissaoOrigem, null);
invOrc('status enviado sem emitidoEm é rejeitado', function (oo) { oo.status = 'enviado'; oo.emitidoEm = null; });
invOrc('data inválida em criadoEm é rejeitada', function (oo) { oo.criadoEm = 'sexta'; });
invOrc('emissaoOrigem não texto é rejeitada', function (oo) { oo.emissaoOrigem = 7; });

console.log('\n== Parecer 4 — §10.2: cobertura extra da validação/comparação ==');
adultera('custoTotal alterado com lucro/preço intactos (lucro ≠ preço − custo)', function (oo) { oo.itens[1].resultado.custoTotal += 100; }, true);
var oFcp = JSON.parse(JSON.stringify(o4)); oFcp.itens[0].resultado.fcpConfirmado = false;
igual('compararResultados detecta fcpConfirmado alterado', O.conferirResultados(oFcp).divergentes.some(function (d) { return /fcpConfirmado/.test(d.motivo); }), true);
adultera('fcpConfirmado não booleano', function (oo) { oo.itens[0].resultado.fcpConfirmado = 'sim'; }, true);

console.log('\n== Parecer 5 — achado 3: datas ISO estritas (validador e migração) ==');
var DATAS_RUINS = ['2026-02-30T12:00:00Z', '2027-02-29T12:00:00Z', '2026-04-31T00:00:00Z', '2026-13-01T00:00:00Z', '2026-00-10T00:00:00Z', '2026-01-00T00:00:00Z',
  '2026-01-01T24:00:00Z', '2026-01-01T23:60:00Z', '2026-01-01T23:59:60Z', '2026-09-18T12:00:00', '2026-09-18T12:00:00+24:00', '2026-9-18', '18/09/2026',
  'September 18, 2026', ' 2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z ', '2026-09-18T12Z', 'ontem', '', 20260918];
var DATAS_BOAS = ['2028-02-29T12:00:00Z', '2000-02-29T00:00:00Z', '2026-09-18', '2026-09-18T12:00Z', '2026-09-18T12:00:00Z', '2026-09-18T12:00:00.000Z', '2026-09-18T12:00:00.5Z',
  '2026-09-18T12:00:00-03:00', '2026-09-18T12:00:00+05:30', '2026-12-31T23:59:59.999Z', '2100-02-28T00:00:00Z', new Date().toISOString()];
igual('Date.parse aceitaria 30/02 (o motivo do achado)', isNaN(Date.parse('2026-02-30T12:00:00Z')), false);
DATAS_RUINS.forEach(function (d) { igual('dataValida recusa ' + JSON.stringify(d), O.dataValida(d), false); });
DATAS_BOAS.forEach(function (d) { igual('dataValida aceita ' + JSON.stringify(d), O.dataValida(d), true); });
igual('1900 não é bissexto', O.dataValida('1900-02-29T00:00:00Z'), false);
// validador: cada campo de data
['criadoEm', 'atualizadoEm', 'enviadoEm', 'emitidoEm'].forEach(function (k) {
  invOrc('validarOrcamento recusa 30/02 em ' + k, function (oo) { oo.status = 'enviado'; oo.emitidoEm = oo.emitidoEm || '2026-09-01T12:00:00Z'; oo[k] = '2026-02-30T12:00:00Z'; });
  invOrc('validarOrcamento recusa 29/02/2027 em ' + k, function (oo) { oo.status = 'enviado'; oo.emitidoEm = oo.emitidoEm || '2026-09-01T12:00:00Z'; oo[k] = '2027-02-29T12:00:00Z'; });
});
var oDatas = JSON.parse(JSON.stringify(o5)); oDatas.status = 'enviado'; oDatas.emitidoEm = '2028-02-29T12:00:00Z'; oDatas.enviadoEm = '2026-09-01T12:00Z'; oDatas.criadoEm = '2026-09-01'; oDatas.atualizadoEm = '2026-09-01T12:00:00-03:00';
mesmo('validarOrcamento aceita os formatos ISO legítimos (29/02 bissexto, sem segundos, só data, com fuso)', O.validarOrcamento(oDatas), []);
invOrc('status enviado com emitidoEm impossível não vale como marco', function (oo) { oo.status = 'enviado'; oo.emitidoEm = '2026-02-30T12:00:00Z'; });
// migração: emitidoEm impossível recusa o arquivo; enviadoEm impossível não é evidência de emissão
lanca('migrarOrcamento recusa emitidoEm 30/02', function () { O.migrarOrcamento(Object.assign({}, base, { status: 'enviado', emitidoEm: '2026-02-30T12:00:00Z' })); }, /emitidoEm inválido/);
lanca('migrarOrcamento recusa emitidoEm 29/02/2027', function () { O.migrarOrcamento(Object.assign({}, base, { status: 'enviado', emitidoEm: '2027-02-29T12:00:00Z' })); }, /emitidoEm inválido/);
lanca('migrarOrcamento recusa emitidoEm sem fuso', function () { O.migrarOrcamento(Object.assign({}, base, { status: 'enviado', emitidoEm: '2026-09-01T12:00:00' })); }, /emitidoEm inválido/);
var mig30 = O.migrarOrcamento(Object.assign({}, base, { status: 'rascunho', enviadoEm: '2026-02-30T12:00:00Z' }));
mesmo('rascunho com enviadoEm 30/02: não trava, enviadoEm descartado', [mig30.emitidoEm, mig30.enviadoEm, mig30.emissaoOrigem], [null, null, null]);
var migNB = O.migrarOrcamento(Object.assign({}, base, { status: 'rascunho', enviadoEm: '2027-02-29T12:00:00Z' }));
mesmo('rascunho com enviadoEm 29/02/2027: não trava', [migNB.emitidoEm, migNB.enviadoEm], [null, null]);
var migB = O.migrarOrcamento(Object.assign({}, base, { status: 'rascunho', enviadoEm: '2028-02-29T12:00:00Z' }));
mesmo('rascunho com enviadoEm 29/02/2028 (bissexto): trava, marco = enviadoEm', [migB.emitidoEm, /migracao:enviadoEm/.test(migB.emissaoOrigem)], ['2028-02-29T12:00:00Z', true]);
var migAp = O.migrarOrcamento(Object.assign({}, base, { status: 'aprovado', enviadoEm: '2026-04-31T00:00:00Z' }));
mesmo('aprovado com enviadoEm 31/04: cai na data inferida (atualizadoEm), não na impossível', [migAp.emitidoEm, /inferida/.test(migAp.emissaoOrigem)], ['2026-09-10T10:00:00Z', true]);
var migAp2 = O.migrarOrcamento(Object.assign({}, base, { status: 'aprovado', enviadoEm: '2026-04-31T00:00:00Z', atualizadoEm: '2026-02-30T00:00:00Z' }));
mesmo('aprovado com enviadoEm E atualizadoEm impossíveis: marco = agora (válido), origem inferida', [O.dataValida(migAp2.emitidoEm), /inferida/.test(migAp2.emissaoOrigem)], [true, true]);
igual('migração preserva a string aceita tal como está (sem reescrever)', O.migrarOrcamento(Object.assign({}, base, { status: 'enviado', enviadoEm: '2026-09-02T00:00Z' })).emitidoEm, '2026-09-02T00:00Z');

console.log('\n== Parecer 5 — achado 1: regra da substituição pela interface (motor) ==');
// A interface, ao substituir um item carregado, mantém a flag se a alíquota não foi alterada; se foi, reclassifica como item
// novo (classificarAliquotaSaida na UF da calculadora). Aqui, o que o motor faz com o que a interface manda:
var subMan = O.calcularItem(cfgP4, cabP4('MG'), { id: 'x', origem: 'nacional', inputs: Object.assign({}, inNac, { clienteUF: 'MG', icmsSaida: 0.10, icmsSaidaManual: true }) });
mesmo('flag true reenviada com o item em MG: continua manual 10%', [subMan.inputs.icmsSaidaManual, subMan.inputs.icmsSaida], [true, 0.10]);
var subVolta = O.calcularItem(cfgP4, cabP4('RJ'), { id: 'x', origem: 'nacional', inputs: subMan.inputs });
mesmo('… e ao voltar ao RJ mantém 10% (era o que se perdia na substituição)', [subVolta.inputs.icmsSaidaManual, subVolta.inputs.icmsSaida, /12%/.test(subVolta.avisos.join(' '))], [true, 0.10, true]);
igual('alíquota alterada em MG: reclassificação dá automático (campo não se aplica)', O.classificarAliquotaSaida('nacional', Object.assign({}, inNac, { clienteUF: 'MG', icmsSaida: 0.08 })), false);
mesmo('alíquota alterada no RJ para 12%: automático; para 10%: manual', [O.classificarAliquotaSaida('nacional', Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.12 })), O.classificarAliquotaSaida('nacional', Object.assign({}, inNac, { clienteUF: 'RJ', icmsSaida: 0.10 }))], [false, true]);
igual('dataValida exportada para a interface/testes', typeof O.dataValida, 'function');

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'Todos os testes passaram.'));
process.exit(falhas ? 1 : 0);

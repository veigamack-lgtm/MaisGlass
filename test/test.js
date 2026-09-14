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
aprox('DRE presumido: IRPJ/CSLL = (8%×15% + 12%×9%) × receita sem IPI', rD.dre.presumido.irpjCsll, 200000 / 1.065 * (0.08 * 0.15 + 0.12 * 0.09));
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
aprox('lucro líquido presumido 10.146,78', r4.dre.presumido.lucroLiquido, 10146.78, 0.005);

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
aprox('DRE imp: presumido IRPJ/CSLL 2,28% × receita', d1.presumido.irpjCsll, r1.precoFinal * (0.08 * 0.15 + 0.12 * 0.09), 1e-6);
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

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'Todos os testes passaram.'));
process.exit(falhas ? 1 : 0);

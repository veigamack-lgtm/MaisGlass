'use strict';
// Auditoria v5: referências independentes, identidades da DRE, integração e histórico.
const assert = require('node:assert/strict');
const C = require('../calc').GM_CALC, D = require('../defaults').GM_DEFAULTS, O = require('../orcamento').GM_ORC;
const clone = v => JSON.parse(JSON.stringify(v));
const cfg = clone(D.config), m = C.dinheiro;
let checks = 0;
function eq(a,b,msg) { checks++; assert.deepEqual(a,b,msg); }
function ok(v,msg) { checks++; assert.ok(v,msg); }
function dre(d) {
  eq(d.deducoes,m(d.ipi+d.icms+d.difalFcp+d.pisCofins),'deduções');
  eq(d.receitaLiquida,m(d.receitaBruta-d.deducoes),'receita líquida');
  eq(d.lucroBruto,m(d.receitaLiquida-d.cmv),'lucro bruto');
  eq(d.lucroOperacional,m(d.lucroBruto-d.frete-d.cartao-(d.custosInternos||0)-(d.custoOperacao||0)),'operacional');
  eq(d.lucroLiquido,m(d.lucroOperacional-d.irpjCsll),'líquido');
}
cfg.operacao = { producaoMensalM2:3000, itens:[{id:'x',categoria:'aluguel',valorMensal:60000}], padraoOrcamentos:true };
const input = Object.assign(clone(D.inputsRevenda), { precoCompra:100, quantidade:1000, perda:0.1,
  modo:'revenda', ipiCredito:false, ipiVenda:0, precoVenda:200, clienteUF:'MG', frete:0, pagamento:'À vista' });
// Cenário fictício de regressão, sem dados financeiros da operação do usuário.
Object.assign(input,{fornecedorUF:'SP',icmsCompra:.04,ipi:.065,icmsSaida:.04,difalIncluso:true,contribuinte:false,bandeira:'Amex',parcelas:3});
const cash=C.calcularRevenda(cfg,input), card=C.calcularRevenda(cfg,{...input,pagamento:'Parcelado'});
eq(m(cash.qtdComPerda*.9),1000,'rendimento de 90% sobre a compra');
eq(cash.compraProdutos,111111.11); eq(cash.ipiCompra,7222.22); eq(cash.creditoICMS,4444.44);
eq(cash.custoLiquidoCompra,113888.89); eq(cash.dre.presumido.pisCofins,5986);
eq(cash.dre.presumido.irpjCsll,6160);
const op=C.custoOperacaoDe(cfg,1000), dc=C.dreComOperacao(cfg,cash.dre,op), dp=C.dreComOperacao(cfg,card.dre,op);
eq(dc.presumido.custoOperacao,20000); eq(dc.presumido.lucroLiquido,17965.11);
eq(card.precoFinal,218441.52); eq(dp.presumido.lucroLiquido,17965.11);
eq(cash.creditoPIS+cash.creditoCOFINS,0); eq(cash.lucro,cash.dre.presumido.lucroOperacional);
eq(m(2080.175),2080.18); eq(m(-2080.175),-2080.18);
for(const uf of ['MG','RJ']) for(const contribuinte of [false,true]) for(const modo of ['revenda','beneficiamento'])
for(const difalIncluso of [false,true]) for(const ipiCredito of [false,true]) for(const quantidade of [3.713,1500]) {
  const i={...input,clienteUF:uf,contribuinte,modo,difalIncluso,ipiCredito,ipiVenda:.065,quantidade,frete:123.45};
  const a=C.calcularRevenda(cfg,i), b=C.calcularRevenda(cfg,{...i,pagamento:'Parcelado'});
  for(const r of [a,b]) {
    dre(r.dre.presumido);
    eq(O.validarResultadoItem(r,'revenda','teste'),[]);
    eq(r.custoLiquidoCompra,m(r.totalNFCompra-r.creditoICMS-r.creditoIPI),'crédito uma vez no CMV');
    eq(r.precoFinal,m(r.valorProdutos+r.ipiVenda+(difalIncluso?0:r.difal+r.fcp)),'composição do preço');
    eq(r.creditoPIS+r.creditoCOFINS,0); eq(r.frete,123.45);
    if(modo==='revenda') {eq(r.creditoIPI,0);eq(r.ipiVenda,0);}
    if(contribuinte) eq(r.difal+r.fcp,0);
  }
  ok(b.dre.presumido.lucroLiquido>=a.dre.presumido.lucroLiquido,'cartão não perde lucro');
  ok(b.dre.presumido.lucroLiquido-a.dre.presumido.lucroLiquido<.031,'resíduo de centavos');
}
const negativo=C.calcularRevenda(cfg,{...input,precoVenda:20,modo:'beneficiamento',ipiVenda:.065,ipiCredito:true,icmsCompra:.18});
ok(negativo.dre.presumido.lucroLiquido<0); ok(negativo.dre.presumido.irpjCsll>0,'presumido cobra com prejuízo');
ok(negativo.saldoCredorICMS>0);ok(negativo.saldoCredorIPI>0);
eq(negativo.icmsARecolher,0);eq(negativo.ipiARecolher,0);dre(negativo.dre.presumido);
assert.throws(()=>C.calcularRevenda(cfg,{...input,perda:1}),/menor que 100/);
assert.throws(()=>C.calcularRevenda(cfg,{...input,pagamento:'Parcelado',custosPercentuais:[.99]}),/não permitem/);
// Importação direta: regime atual uniforme e custo do PIS/COFINS de entrada mantido.
for(const uf of ['MG','RJ']) for(const contribuinte of [false,true]) {
  const i={...D.inputs,uf,contribuinte,perda:.1,frete:200};
  const a=C.calcularImportacao(cfg,i), b=C.calcularImportacao(cfg,{...i,pagamento:'Parcelado'});
  dre(a.dre.presumido);dre(b.dre.presumido);
  eq(a.importacao.creditoPisM2+a.importacao.creditoCofinsM2,0);
  ok(b.dre.presumido.lucroLiquido>=a.dre.presumido.lucroLiquido);
  eq(O.validarResultadoItem(b,'importacao','teste'),[]);
}
function quote(payment,commission) {
  const q=O.novoOrcamento(cfg,{nome:'Auditoria',uf:'RJ'});
  q.condicoes.pagamento=payment; q.condicoes.bandeira='Amex';q.condicoes.parcelas=3;
  q.custosInternos=[{id:'com',tipo:'comissao',descricao:'Comissão',valor:null,percentual:commission},
    {id:'fix',tipo:'outros',descricao:'Fixo',valor:200,percentual:null}];
  q.itens=[{id:'a',origem:'revenda',inputs:{...input,quantidade:52.379,modo:'beneficiamento',ipiVenda:.065,ipiCredito:true}},
    {id:'b',origem:'nacional',inputs:{...input,quantidade:137.137,icmsCompra:.12,icmsSaida:.12}}];
  q.itens=q.itens.map(it=>({...it,...O.calcularItem(cfg,O.cabecalhoDe(q),it)}));
  eq(O.validarOrcamento(q),[]);eq(O.conferirResultados(q).divergentes,[]);
  return q;
}
for(const pct of [0,.05,.1137]) {
  const qa=quote('À vista',pct),qb=quote('Parcelado',pct),a=O.consolidar(qa),b=O.consolidar(qb);
  dre(a.presumido);dre(b.presumido);
  ok(b.presumido.lucroLiquido>=a.presumido.lucroLiquido,'comissão parcelada preserva lucro consolidado');
  ok(b.presumido.lucroLiquido-a.presumido.lucroLiquido<.051,'somente ajuste residual de centavos');
  eq(b.totais.lucroOperacional,b.presumido.lucroOperacional);
  eq(m(b.composicao.reduce((s,p)=>s+p.valor,0)),b.totais.totalCliente,'gráfico fecha no centavo');
}
const old=clone(cfg);old.versao=4;
const historico=C.calcularRevenda(old,input);eq(m(historico.qtdComPerda),1100,'histórico mantém critério anterior');
const antes=JSON.stringify(historico);C.migrarConfig(old,cfg);eq(JSON.stringify(historico),antes,'migração não altera resultado congelado');
// Edição direta do preço em orçamento, quantidade fracionada e cartão.
const q=quote('Parcelado',.05);
for(const price of [185,192.37,250]) {
  const r=O.precoParaM2(cfg,O.cabecalhoDe(q),q.itens[0],price);
  eq(m(r.resultado.precoFinal/q.itens[0].inputs.quantidade),price,'unitário editado');
}
console.log('Auditoria v5: '+checks+' verificações passaram.');

/* =====================================================================
 * orcamento.js — Motor do módulo "Orçamentos" da Calculadora MaisGlass
 * Puro (sem DOM, sem estado global): compõe um orçamento com itens vindos
 * das três calculadoras (importação direta, revenda de importado, indústria
 * nacional), custos internos e DRE consolidada real × presumido.
 *
 *   novoOrcamento(config, dados)               → orçamento vazio com premissas e config CONGELADAS
 *   calcularItem(config, cabecalho, item)      → { inputs, resultado, avisos } (cabeçalho manda em UF/destinatário/pagamento)
 *   adaptarDre(origem, resultado)              → DRE do item numa convenção única (deduções cheias; CMV líquido dos créditos)
 *   consolidar(orcamento)                      → totais, DRE consolidada, composição, avisos — só com o que está no orçamento
 *   validarOrcamento(orcamento)                → lista de erros (vazia = OK)
 *   conferirResultados(orcamento)              → itens cujo snapshot não bate com o recálculo (configSnapshot)
 *   migrarOrcamento(orcamento)                 → completa campos opcionais; recusa formato futuro
 *
 * Regras (PROJETO-ORCAMENTO.md v2): calc.js e calcular() não mudam; este arquivo só CONSOME
 * calcularImportacao / dreImportacao / calcularRevenda. IRPJ/CSLL do lucro real é recalculado sobre
 * o lucro consolidado (prejuízo de um item compensa outro; custos internos dedutíveis — premissa);
 * no presumido a base é a receita, então é a soma dos itens. Estimativa gerencial, não apuração.
 * ===================================================================== */
(function (root) {
  'use strict';

  var CALC = root.GM_CALC || (typeof require === 'function' ? require('./calc.js').GM_CALC : null);
  if (!CALC) throw new Error('orcamento.js precisa de calc.js carregado antes.');

  var VERSAO_MOTOR = '1.0';
  var VERSAO_FORMATO = 1;
  var ORIGENS = ['importacao', 'revenda', 'nacional'];
  var DESTINATARIOS = ['consumidorFinal', 'contribuinteRevenda'];
  var TIPOS_CUSTO = ['transporteProprio', 'freteContratado', 'instalacao', 'comissao', 'outros'];
  var TIPOS_TRANSPORTE = ['transporteProprio', 'freteContratado'];
  var STATUS = ['rascunho', 'enviado', 'aprovado', 'perdido'];
  var PAGAMENTOS = ['À vista', 'Parcelado'];
  var TOL = 0.005;

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isFin(v) { return typeof v === 'number' && isFinite(v); }
  function has(o, k) { return o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /* Data ISO 8601 estrita (parecer nº 5, achado 3). Formatos aceitos: "AAAA-MM-DD" ou
   * "AAAA-MM-DDThh:mm[:ss[.fração]]" seguido de fuso "Z" ou "±hh:mm" (é o que new Date().toISOString() produz,
   * com ou sem milissegundos). Os componentes precisam existir no calendário e no relógio: 30/02, 29/02 em ano não
   * bissexto, mês 13, dia 00, hora 24, minuto 60 e texto fora do formato são inválidos. Date.parse não serve: ele
   * normaliza datas impossíveis (30/02 vira 02/03) e aceita formatos livres. A string aceita NÃO é reescrita — as
   * comparações de atualizadoEm entre abas são textuais e precisam do valor gravado tal como está. */
  var RE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;
  function dataValida(v) {
    if (typeof v !== 'string') return false;
    var m = RE_ISO.exec(v); if (!m) return false;
    var ano = +m[1], mes = +m[2], dia = +m[3];
    if (mes < 1 || mes > 12 || dia < 1) return false;
    var bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    var dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (dia > dias[mes - 1]) return false;
    if (m[4] !== undefined) {
      if (+m[4] > 23 || +m[5] > 59 || (m[6] !== undefined && +m[6] > 59)) return false;
      if (m[7] !== 'Z' && (+m[7].slice(1, 3) > 23 || +m[7].slice(4, 6) > 59)) return false;
    }
    return true;
  }
  function agora() { return new Date().toISOString(); }
  function gerarId(prefixo) {
    var t = Date.now().toString(36), r = Math.floor(Math.random() * 1e9).toString(36);
    return (prefixo || 'id') + '_' + t + r;
  }
  function numFin(v, nome) {
    if (typeof v === 'string' && v.trim() !== '') v = Number(v);
    if (!isFin(v)) throw new Error('Valor inválido em "' + nome + '".');
    return v;
  }
  /* Regra ÚNICA para o valor/percentual de um custo interno (validação e consolidação usam a mesma):
   * número finito, ou string numérica não vazia; booleanos, vazios, arrays e objetos são inválidos. */
  function numeroCusto(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v === 'string' && v.trim() !== '') { var n = Number(v); return isFinite(n) ? n : NaN; }
    return NaN;
  }

  /* ---------- premissas congeladas no orçamento (D2 / parecer §4) ---------- */
  function premissasDe(config) {
    var tb = (config && config.tributos) || {};
    return {
      irpjCsllReal: tb.irpjCsllReal, irpj: tb.irpj, csll: tb.csll,
      presumidoBaseIRPJ: tb.presumidoBaseIRPJ, presumidoBaseCSLL: tb.presumidoBaseCSLL,
      pisCumulativo: tb.pisCumulativo, cofinsCumulativo: tb.cofinsCumulativo,
      lc224: tb.lc224 === true,
      custosInternosDedutiveis: true,     // simplificação declarada da v1
      creditoFreteContratado: false,      // simplificação declarada da v1 (pendência com a contadoria)
      arredondamento: 'exibicao',         // motor em precisão cheia; arredonda só na tela/proposta
      versaoMotor: VERSAO_MOTOR
    };
  }

  function novoOrcamento(config, dados) {
    if (!isObj(config)) throw new Error('Configuração inválida.');
    dados = dados || {};
    var pr = isObj(config.proposta) ? config.proposta : {};
    var emp = isObj(config.empresa) ? config.empresa : {};
    var t = agora();
    return {
      id: dados.id || gerarId('orc'),
      versaoFormato: VERSAO_FORMATO, versaoMotor: VERSAO_MOTOR,
      revisao: 1, revisaoDe: null,
      criadoEm: t, atualizadoEm: t, enviadoEm: null, emitidoEm: null, emissaoOrigem: null, status: 'rascunho',   // emitidoEm: marco de congelamento da proposta (1ª saída do rascunho); emissaoOrigem: 'app' | 'migracao:…'
      cliente: { nome: dados.nome || '', contato: '', uf: dados.uf || 'MG', destinatario: dados.destinatario || 'consumidorFinal' },
      condicoes: { pagamento: 'À vista', bandeira: 'Visa', parcelas: 1, validadeDias: isFin(pr.validadeDias) ? pr.validadeDias : 15,
        prazoEntrega: pr.prazoEntrega || '', dataPrevista: null, inclusos: { frete: false, instalacao: false, texto: '' }, observacoes: pr.observacoes || '' },
      empresa: { razaoSocial: emp.razaoSocial || '', cnpj: emp.cnpj || '', endereco: emp.endereco || '', telefone: emp.telefone || '', email: emp.email || '' },
      premissas: premissasDe(config),
      configSnapshot: clone(config),
      itens: [], custosInternos: []
    };
  }

  /* Cabeçalho do orçamento: campos do cliente que valem para TODOS os itens */
  function cabecalhoDe(orcamento) {
    return { uf: orcamento.cliente.uf, destinatario: orcamento.cliente.destinatario,
      pagamento: orcamento.condicoes.pagamento, bandeira: orcamento.condicoes.bandeira, parcelas: orcamento.condicoes.parcelas };
  }
  /* Alíquota interestadual de saída que a calculadora sugere para um destino (empresa fixa em MG).
   * null = venda interna (o motor usa a alíquota interna e ignora o campo). */
  function aliquotaSaidaAuto(origem, uf) {
    return CALC.aliquotaInterestadual(CALC.EMPRESA_UF, uf, origem === 'revenda');
  }
  function pctIgual(a, b) { return isFin(a) && isFin(b) && Math.abs(a - b) < 1e-9; }
  /* Classifica a alíquota de saída das entradas de um item (calcs 2/3) como manual ou automática, olhando a UF
   * das PRÓPRIAS entradas (a UF da calculadora no momento em que o item foi lido). Venda interna (MG): o campo
   * não é usado pelo motor → automática. Usado uma vez, quando o item entra; depois a classificação fica
   * persistida em inputs.icmsSaidaManual e é preservada nas trocas de destino (parecer nº 4, achado 1). */
  function classificarAliquotaSaida(origem, inputs) {
    if (origem === 'importacao') return false;
    var uf = inputs.clienteUF;
    if (!uf || CALC.UFS.indexOf(uf) < 0) return false;
    var auto = aliquotaSaidaAuto(origem, uf);
    if (auto === null) return false;
    var atual = Number(inputs.icmsSaida);
    return isFin(atual) && !pctIgual(atual, auto);
  }
  /* Aplica o cabeçalho às entradas do item. Devolve { inputs, avisos }.
   * A alíquota de saída (calcs 2/3) depende do destino: automática → passa a ser a automática da nova UF;
   * manual (inputs.icmsSaidaManual === true, classificada quando o item entrou) → é mantida em qualquer
   * troca, inclusive passando por MG, e o item ganha aviso quando difere da regra geral do destino.
   * Itens antigos sem a flag são classificados pela comparação numérica na UF que trazem. */
  function aplicarCabecalho(origem, inputs, cab) {
    var out = clone(inputs), avisos = [];
    var contribuinte = cab.destinatario === 'contribuinteRevenda';
    if (origem === 'importacao') { out.uf = cab.uf; delete out.icmsSaidaManual; }
    else {
      var ufNova = cab.uf;
      var manual = typeof inputs.icmsSaidaManual === 'boolean' ? inputs.icmsSaidaManual : classificarAliquotaSaida(origem, inputs);
      var autoNova = aliquotaSaidaAuto(origem, ufNova);
      var atual = Number(inputs.icmsSaida);
      if (!manual) { if (autoNova !== null) out.icmsSaida = autoNova; }
      else if (autoNova !== null && !pctIgual(atual, autoNova)) {
        avisos.push('ICMS de saída ' + Math.round(atual * 1000) / 10 + '% mantido do ajuste manual (a regra geral para ' + ufNova + ' seria ' + Math.round(autoNova * 1000) / 10 + '%) — confira.');
      }
      out.icmsSaidaManual = manual;
      out.clienteUF = ufNova;
    }
    out.contribuinte = contribuinte;
    out.pagamento = cab.pagamento; out.bandeira = cab.bandeira; out.parcelas = cab.parcelas;
    return { inputs: out, avisos: avisos };
  }
  /* Diferença entre as entradas da calculadora e o cabeçalho (para a interface perguntar antes de adicionar) */
  function divergenciasCabecalho(origem, inputs, cab) {
    var d = [];
    var ufItem = origem === 'importacao' ? inputs.uf : inputs.clienteUF;
    if (ufItem !== cab.uf) d.push('UF ' + ufItem + ' → ' + cab.uf);
    var contribItem = !!inputs.contribuinte, contribCab = cab.destinatario === 'contribuinteRevenda';
    if (contribItem !== contribCab) d.push((contribItem ? 'contribuinte' : 'consumidor final') + ' → ' + (contribCab ? 'contribuinte' : 'consumidor final'));
    if (inputs.pagamento !== cab.pagamento) d.push('pagamento ' + inputs.pagamento + ' → ' + cab.pagamento);
    if (cab.pagamento === 'Parcelado' && inputs.pagamento === 'Parcelado') {
      if (inputs.bandeira !== cab.bandeira) d.push('bandeira ' + inputs.bandeira + ' → ' + cab.bandeira);
      if (Number(inputs.parcelas) !== Number(cab.parcelas)) d.push('parcelas ' + inputs.parcelas + ' → ' + cab.parcelas);
    }
    return d;
  }

  /* ---------- cálculo de um item (despacha para o motor da origem) ---------- */
  function calcularItem(config, cabecalho, item) {
    if (!isObj(config)) throw new Error('Configuração inválida.');
    if (!isObj(cabecalho)) throw new Error('Cabeçalho inválido.');
    if (!isObj(item) || ORIGENS.indexOf(item.origem) < 0) throw new Error('Origem do item desconhecida: ' + (item && item.origem));
    if (!isObj(item.inputs)) throw new Error('Entradas do item ausentes.');
    var ap = aplicarCabecalho(item.origem, item.inputs, cabecalho);
    var inputs = ap.inputs, r, avisos = ap.avisos.slice();
    if (item.origem === 'importacao') {
      r = CALC.calcularImportacao(config, inputs);
      r.dre = CALC.dreImportacao(config, r);
      avisos = avisos.concat(r.avisos || []);
    } else {
      r = CALC.calcularRevenda(config, inputs);
    }
    return { inputs: inputs, resultado: r, avisos: avisos };
  }

  /* ---------- DRE do item numa convenção única ----------
   * Calcs 2/3 já usam: deduções = débitos cheios; CMV = compra líquida dos créditos.
   * Importação direta traz PIS/COFINS LÍQUIDOS dos créditos da importação e CMV bruto (créditos dentro):
   * reapresenta somando os créditos às deduções e tirando do CMV — o lucro não muda. O ICMS da calc 1 é
   * efetivo (regime especial) e não decompõe: fica na mesma linha, rotulado na tela. */
  function adaptarDre(origem, resultado) {
    if (!isObj(resultado) || !isObj(resultado.dre)) throw new Error('Item sem DRE.');
    var out = {};
    ['real', 'presumido'].forEach(function (reg) {
      var d = resultado.dre[reg];
      var linha = {
        receitaBruta: d.receitaBruta, ipi: isFin(d.ipi) ? d.ipi : 0, icms: d.icms,
        difalFcp: isFin(d.difalFcp) ? d.difalFcp : (d.difal || 0) + (d.fcp || 0),
        pisCofins: d.pisCofins, deducoes: d.deducoes, receitaLiquida: d.receitaLiquida, cmv: d.cmv, lucroBruto: d.lucroBruto,
        frete: d.frete, cartao: d.cartao, lucroOperacional: d.lucroOperacional, irpjCsll: d.irpjCsll, lucroLiquido: d.lucroLiquido,
        tributosTotais: d.tributosTotais
      };
      if (origem === 'importacao' && reg === 'real') {
        var imp = resultado.importacao || {};
        var qtd = isFin(resultado.quantidade) ? resultado.quantidade : 0;
        var creditos = qtd * ((imp.creditoPisM2 || 0) + (imp.creditoCofinsM2 || 0));
        linha.pisCofins = d.pisCofins + creditos;
        linha.deducoes = d.deducoes + creditos;
        linha.receitaLiquida = d.receitaBruta - linha.deducoes;
        linha.cmv = d.cmv - creditos;
        linha.lucroBruto = linha.receitaLiquida - linha.cmv;
        linha.creditosImportacao = creditos;
      }
      out[reg] = linha;
    });
    return out;
  }

  function resumoItem(item) {
    var r = item.resultado;
    var qtd = Number(item.inputs && item.inputs.quantidade);
    return {
      id: item.id, origem: item.origem, descricao: item.descricao || '',
      quantidade: isFin(qtd) ? qtd : 0,
      totalCliente: r ? r.precoFinal : 0,
      precoM2: r && isFin(qtd) && qtd > 0 ? r.precoFinal / qtd : 0,
      custo: r ? r.custoTotal : 0,
      lucro: r ? r.lucro : 0,
      margem: r && r.precoFinal > 0 ? r.lucro / r.precoFinal : null,
      calculado: !!r, avisos: item.avisos || []
    };
  }

  /* ---------- consolidação: usa SÓ premissas e snapshots do orçamento ---------- */
  function consolidar(orcamento) {
    if (!isObj(orcamento)) throw new Error('Orçamento inválido.');
    var p = orcamento.premissas || {};
    var itens = Array.isArray(orcamento.itens) ? orcamento.itens : [];
    var custos = Array.isArray(orcamento.custosInternos) ? orcamento.custosInternos : [];
    var avisos = [];
    var calculados = itens.filter(function (it) { return isObj(it.resultado); });
    if (calculados.length < itens.length) avisos.push((itens.length - calculados.length) + ' item(ns) sem resultado — recalcule.');
    itens.forEach(function (it) { (it.avisos || []).forEach(function (a) { avisos.push((it.descricao || it.origem) + ': ' + a); }); });

    var linhasAditivas = ['receitaBruta', 'ipi', 'icms', 'difalFcp', 'pisCofins', 'deducoes', 'cmv', 'frete', 'cartao'];
    var dres = calculados.map(function (it) { return adaptarDre(it.origem, it.resultado); });
    var receitaBruta = dres.reduce(function (s, d) { return s + d.real.receitaBruta; }, 0);

    // custos internos: fixos + percentuais sobre o total ao cliente
    var custosDetalhe = custos.map(function (c) {
      var temPct = c.percentual !== null && c.percentual !== undefined;
      var pct = temPct ? numeroCusto(c.percentual) : NaN, fixo = temPct ? NaN : numeroCusto(c.valor);
      if (temPct ? !isFin(pct) : !isFin(fixo)) throw new Error('Valor inválido em "custo interno' + (c.descricao ? ' ' + c.descricao : '') + '".');
      var valor = temPct ? pct * receitaBruta : fixo;
      return { id: c.id, tipo: c.tipo, descricao: c.descricao || '', percentual: temPct ? pct : null, valor: valor };
    });
    var custosInternos = custosDetalhe.reduce(function (s, c) { return s + c.valor; }, 0);

    var freteItens = calculados.some(function (it) { return it.resultado.frete > 0; });
    var transporteInterno = custos.some(function (c) { return TIPOS_TRANSPORTE.indexOf(c.tipo) >= 0; });
    if (freteItens && transporteInterno) avisos.push('Há frete cobrado na NF em item(ns) e custo interno de transporte: o motor já trata o frete cobrado como despesa de igual valor — confira se não é o mesmo transporte contado duas vezes.');

    function regime(reg) {
      var t = {};
      linhasAditivas.forEach(function (k) { t[k] = dres.reduce(function (s, d) { return s + (d[reg][k] || 0); }, 0); });
      t.receitaLiquida = t.receitaBruta - t.deducoes;
      t.lucroBruto = t.receitaLiquida - t.cmv;
      t.custosInternos = custosInternos;
      t.lucroOperacional = t.lucroBruto - t.frete - t.cartao - custosInternos;
      if (reg === 'real') t.irpjCsll = Math.max(0, t.lucroOperacional) * numFin(p.irpjCsllReal, 'premissa irpjCsllReal');
      else t.irpjCsll = dres.reduce(function (s, d) { return s + d.presumido.irpjCsll; }, 0);
      t.lucroLiquido = t.lucroOperacional - t.irpjCsll;
      t.margemLiquida = t.receitaLiquida > 0 ? t.lucroLiquido / t.receitaLiquida : null;
      t.margemSobreValorPago = t.receitaBruta > 0 ? t.lucroLiquido / t.receitaBruta : null;
      t.tributosTotais = dres.reduce(function (s, d) { return s + (d[reg].tributosTotais - d[reg].irpjCsll); }, 0) + t.irpjCsll;
      t.reducaoPotencial = reg === 'real' && t.lucroOperacional < 0 ? -t.lucroOperacional * numFin(p.irpjCsllReal, 'premissa irpjCsllReal') : 0;
      t.regime = reg;
      return t;
    }
    var real = regime('real'), presumido = regime('presumido');

    var resumos = itens.map(resumoItem);
    var custoItens = resumos.reduce(function (s, i) { return s + i.custo; }, 0);
    var lucroItens = resumos.reduce(function (s, i) { return s + i.lucro; }, 0);
    var totais = {
      itens: itens.length, calculados: calculados.length,
      quantidade: resumos.reduce(function (s, i) { return s + i.quantidade; }, 0),
      totalCliente: receitaBruta,
      custoItens: custoItens, lucroItens: lucroItens,
      custosInternos: custosInternos,
      custoTotalReal: custoItens + custosInternos,            // "custo total antes de IRPJ/CSLL — cenário lucro real"
      lucroOperacional: real.lucroOperacional,
      margemOperacional: receitaBruta > 0 ? real.lucroOperacional / receitaBruta : null
    };
    var composicao = [
      { chave: 'tributos', nome: 'Tributos + IRPJ/CSLL', valor: real.deducoes + real.irpjCsll },
      { chave: 'cmv', nome: 'Mercadoria (CMV)', valor: real.cmv },
      { chave: 'freteCartao', nome: 'Frete na NF + cartão', valor: real.frete + real.cartao },
      { chave: 'internos', nome: 'Custos internos', valor: custosInternos },
      { chave: 'lucro', nome: 'Lucro líquido', valor: real.lucroLiquido }
    ];
    return { real: real, presumido: presumido, itens: resumos, custos: custosDetalhe, totais: totais, composicao: composicao, avisos: avisos, premissas: clone(p) };
  }

  /* ---------- validação ---------- */
  var CAMPOS_DRE = ['receitaBruta', 'icms', 'difalFcp', 'pisCofins', 'deducoes', 'receitaLiquida', 'cmv', 'lucroBruto', 'frete', 'cartao', 'lucroOperacional', 'irpjCsll', 'lucroLiquido', 'tributosTotais'];
  var CAMPOS_RESULTADO = ['precoFinal', 'custoTotal', 'lucro', 'frete', 'taxaCartao', 'valorTaxaCartao'];
  var CAMPOS_PREMISSAS = ['irpjCsllReal', 'irpj', 'csll', 'presumidoBaseIRPJ', 'presumidoBaseCSLL', 'pisCumulativo', 'cofinsCumulativo'];
  /* Confere um resultado de item: números finitos nos campos usados pela consolidação e identidades da DRE. */
  function validarResultadoItem(r, origem, rot) {
    var e = [];
    if (!isObj(r)) return [rot + ': resultado inválido.'];
    CAMPOS_RESULTADO.forEach(function (k) { if (!isFin(r[k])) e.push(rot + ': resultado.' + k + ' não é número finito.'); });
    if (isFin(r.precoFinal) && isFin(r.custoTotal) && isFin(r.lucro) && Math.abs(r.lucro - (r.precoFinal - r.custoTotal)) > TOL) e.push(rot + ': lucro ≠ preço final − custo total.');
    if (r.fcpConfirmado !== undefined && typeof r.fcpConfirmado !== 'boolean') e.push(rot + ': fcpConfirmado deve ser verdadeiro/falso.');
    if (!isObj(r.dre) || !isObj(r.dre.real) || !isObj(r.dre.presumido)) { e.push(rot + ': resultado sem DRE.'); return e; }
    ['real', 'presumido'].forEach(function (reg) {
      var d = r.dre[reg];
      CAMPOS_DRE.forEach(function (k) { if (!isFin(d[k])) e.push(rot + ': dre.' + reg + '.' + k + ' não é número finito.'); });
      if (isFin(d.ipi) === false && d.ipi !== undefined) e.push(rot + ': dre.' + reg + '.ipi inválido.');
      if (CAMPOS_DRE.every(function (k) { return isFin(d[k]); })) {
        var ipi = isFin(d.ipi) ? d.ipi : 0;
        if (Math.abs(d.deducoes - (ipi + d.icms + d.difalFcp + d.pisCofins)) > TOL) e.push(rot + ': dre.' + reg + ' — deduções ≠ IPI + ICMS + DIFAL/FCP + PIS/COFINS.');
        if (Math.abs(d.receitaLiquida - (d.receitaBruta - d.deducoes)) > TOL) e.push(rot + ': dre.' + reg + ' — receita líquida ≠ receita bruta − deduções.');
        if (Math.abs(d.lucroBruto - (d.receitaLiquida - d.cmv)) > TOL) e.push(rot + ': dre.' + reg + ' — lucro bruto ≠ receita líquida − CMV.');
        if (Math.abs(d.lucroOperacional - (d.lucroBruto - d.frete - d.cartao)) > TOL) e.push(rot + ': dre.' + reg + ' — lucro operacional ≠ lucro bruto − frete − cartão.');
        if (Math.abs(d.lucroLiquido - (d.lucroOperacional - d.irpjCsll)) > TOL) e.push(rot + ': dre.' + reg + ' — lucro líquido ≠ lucro operacional − IRPJ/CSLL.');
        if (reg === 'real' && Math.abs(d.lucroOperacional - r.lucro) > TOL) e.push(rot + ': lucro operacional da DRE ≠ lucro do item.');
        if (Math.abs(d.receitaBruta - r.precoFinal) > TOL) e.push(rot + ': receita bruta da DRE ≠ preço final do item.');
      }
    });
    if (origem === 'importacao') {
      if (!isObj(r.importacao) || !isFin(r.importacao.creditoPisM2) || !isFin(r.importacao.creditoCofinsM2)) e.push(rot + ': créditos da importação ausentes.');
      if (!isFin(r.quantidade) || r.quantidade <= 0) e.push(rot + ': quantidade do resultado inválida.');
      if (!isFin(r.custoSemImposto)) e.push(rot + ': custoSemImposto inválido.');
    }
    return e;
  }
  function validarOrcamento(o) {
    var e = [];
    if (!isObj(o)) return ['Orçamento deve ser um objeto.'];
    if (typeof o.id !== 'string' || !o.id) e.push('Orçamento sem id.');
    if (isFin(o.versaoFormato) && o.versaoFormato > VERSAO_FORMATO) e.push('Orçamento de formato ' + o.versaoFormato + ' é mais novo que este app (formato ' + VERSAO_FORMATO + ').');
    if (o.status !== undefined && STATUS.indexOf(o.status) < 0) e.push('Status inválido: ' + o.status);
    ['criadoEm', 'atualizadoEm', 'enviadoEm', 'emitidoEm'].forEach(function (k) {
      if (o[k] !== undefined && o[k] !== null && !dataValida(o[k])) e.push('Data inválida em ' + k + '.');
    });
    if (o.status !== undefined && o.status !== 'rascunho' && o.emitidoEm !== undefined && !dataValida(o.emitidoEm)) e.push('Status ' + o.status + ' exige marco de emissão (emitidoEm).');
    if (o.emissaoOrigem !== undefined && o.emissaoOrigem !== null && typeof o.emissaoOrigem !== 'string') e.push('emissaoOrigem deve ser texto.');
    if (o.revisao !== undefined && (!isFin(o.revisao) || o.revisao < 1 || Math.floor(o.revisao) !== o.revisao)) e.push('Revisão inválida.');
    var c = o.cliente;
    if (!isObj(c)) e.push('Cliente ausente.');
    else {
      if (typeof c.nome !== 'string') e.push('Nome do cliente deve ser texto.');
      if (CALC.UFS.indexOf(c.uf) < 0) e.push('UF do cliente inválida: ' + c.uf);
      if (DESTINATARIOS.indexOf(c.destinatario) < 0) e.push('Destinatário inválido: ' + c.destinatario);
    }
    var cd = o.condicoes;
    if (!isObj(cd)) e.push('Condições ausentes.');
    else {
      if (PAGAMENTOS.indexOf(cd.pagamento) < 0) e.push('Condição de pagamento inválida: ' + cd.pagamento);
      var pc = Number(cd.parcelas);
      if (!isFin(pc) || pc < 1 || pc > 12 || Math.floor(pc) !== pc) e.push('Parcelas devem ser um inteiro de 1 a 12.');
      if (cd.pagamento === 'Parcelado' && (typeof cd.bandeira !== 'string' || !cd.bandeira)) e.push('Bandeira ausente no parcelado.');
      if (cd.validadeDias !== undefined && (!isFin(cd.validadeDias) || cd.validadeDias < 0)) e.push('Validade inválida.');
    }
    if (!isObj(o.premissas)) e.push('Premissas do orçamento ausentes.');
    else {
      CAMPOS_PREMISSAS.forEach(function (k) { var v = o.premissas[k]; if (!isFin(v) || v < 0 || v > 1) e.push('Premissa ' + k + ' inválida.'); });
      if (o.premissas.lc224 !== undefined && typeof o.premissas.lc224 !== 'boolean') e.push('Premissa lc224 deve ser verdadeiro/falso.');
    }
    if (!isObj(o.configSnapshot)) e.push('Configuração congelada (configSnapshot) ausente.');
    else {
      var ec = CALC.validarConfig(o.configSnapshot);
      if (ec.length) e.push('Configuração congelada inválida: ' + ec.slice(0, 3).join(' '));
      else if (isObj(o.premissas)) {
        var tb = o.configSnapshot.tributos || {};
        CAMPOS_PREMISSAS.forEach(function (k) { if (isFin(o.premissas[k]) && isFin(tb[k]) && !pctIgual(o.premissas[k], tb[k])) e.push('Premissa ' + k + ' (' + o.premissas[k] + ') não bate com a configuração congelada (' + tb[k] + ').'); });
        if (o.premissas.lc224 !== undefined && (tb.lc224 === true) !== (o.premissas.lc224 === true)) e.push('Premissa lc224 não bate com a configuração congelada.');
      }
    }
    var ids = {};
    function idUnico(id, rot) { if (typeof id !== 'string' || !id) { e.push(rot + ' sem id.'); return; } if (has(ids, id)) e.push('Id duplicado: ' + id); ids[id] = true; }
    if (!Array.isArray(o.itens)) e.push('Itens devem ser uma lista.');
    else {
      var cab = isObj(c) && isObj(cd) ? cabecalhoDe(o) : null;
      o.itens.forEach(function (it, i) {
        var rot = 'item ' + (i + 1);
        if (!isObj(it)) { e.push(rot + ' inválido.'); return; }
        idUnico(it.id, rot);
        if (ORIGENS.indexOf(it.origem) < 0) e.push(rot + ': origem desconhecida (' + it.origem + ').');
        if (!isObj(it.inputs)) { e.push(rot + ': entradas ausentes.'); return; }
        if (it.inputs.icmsSaidaManual !== undefined && typeof it.inputs.icmsSaidaManual !== 'boolean') e.push(rot + ': icmsSaidaManual deve ser verdadeiro/falso.');
        if (cab) divergenciasCabecalho(it.origem, it.inputs, cab).forEach(function (d) { e.push(rot + ': entradas divergem do cabeçalho (' + d + ').'); });
        if (it.resultado !== undefined) validarResultadoItem(it.resultado, it.origem, rot).forEach(function (m) { e.push(m); });
        if (it.avisos !== undefined && !Array.isArray(it.avisos)) e.push(rot + ': avisos deve ser uma lista.');
      });
    }
    if (o.custosInternos !== undefined) {
      if (!Array.isArray(o.custosInternos)) e.push('Custos internos devem ser uma lista.');
      else o.custosInternos.forEach(function (ci, i) {
        var rot = 'custo interno ' + (i + 1);
        if (!isObj(ci)) { e.push(rot + ' inválido.'); return; }
        idUnico(ci.id, rot);
        if (TIPOS_CUSTO.indexOf(ci.tipo) < 0) e.push(rot + ': tipo desconhecido (' + ci.tipo + ').');
        var temValor = ci.valor !== null && ci.valor !== undefined, temPct = ci.percentual !== null && ci.percentual !== undefined;
        if (temValor === temPct) e.push(rot + ': informe valor OU percentual.');
        if (temValor) { var nv = numeroCusto(ci.valor); if (!isFin(nv) || nv < 0) e.push(rot + ': valor inválido.'); }
        if (temPct) { var np = numeroCusto(ci.percentual); if (!isFin(np) || np < 0 || np > 1) e.push(rot + ': percentual deve estar entre 0% e 100%.'); }
        if (ci.descricao !== undefined && typeof ci.descricao !== 'string') e.push(rot + ': descrição deve ser texto.');
      });
    }
    return e;
  }

  /* Compara dois resultados de item em TODOS os campos que a consolidação usa (topo, DRE real e presumido,
   * créditos da importação). Devolve a lista de campos divergentes. */
  function compararResultados(a, b, origem) {
    var d = [];
    CAMPOS_RESULTADO.forEach(function (k) { if (!isFin(b[k]) || Math.abs(a[k] - b[k]) > TOL) d.push(k); });
    ['real', 'presumido'].forEach(function (reg) {
      var da = a.dre && a.dre[reg], db = b.dre && b.dre[reg];
      if (!isObj(da) || !isObj(db)) { d.push('dre.' + reg); return; }
      CAMPOS_DRE.concat(['ipi']).forEach(function (k) {
        var va = isFin(da[k]) ? da[k] : 0, vb = isFin(db[k]) ? db[k] : 0;
        if (Math.abs(va - vb) > TOL) d.push('dre.' + reg + '.' + k);
      });
    });
    if ((a.fcpConfirmado === false) !== (b.fcpConfirmado === false)) d.push('fcpConfirmado');
    if (origem === 'importacao') {
      var ia = a.importacao || {}, ib = b.importacao || {};
      ['creditoPisM2', 'creditoCofinsM2', 'custoM2'].forEach(function (k) { if (!isFin(ib[k]) || Math.abs((ia[k] || 0) - ib[k]) > 1e-6) d.push('importacao.' + k); });
      if (!isFin(b.quantidade) || Math.abs(a.quantidade - b.quantidade) > 1e-9) d.push('quantidade');
      if (!isFin(b.custoSemImposto) || Math.abs(a.custoSemImposto - b.custoSemImposto) > TOL) d.push('custoSemImposto');
    }
    return d;
  }
  /* Recalcula cada item com a configuração congelada do próprio orçamento e compara com o snapshot em todos
   * os campos usados pela consolidação. Devolve { divergentes: [{id, motivo}], recalculados: {id: {inputs, resultado, avisos}} }.
   * Na importação de JSON o app SUBSTITUI cada resultado pelo recalculado (nada vindo de fora entra na conta);
   * a lista de divergentes vira aviso no item (parecer nº 3, achado 3). */
  function conferirResultados(o) {
    var out = { divergentes: [], recalculados: {} };
    if (!isObj(o) || !Array.isArray(o.itens) || !isObj(o.configSnapshot)) return out;
    var cab = cabecalhoDe(o);
    o.itens.forEach(function (it) {
      var novo;
      try { novo = calcularItem(o.configSnapshot, cab, it); }
      catch (err) { out.divergentes.push({ id: it.id, motivo: 'não recalculável: ' + err.message }); return; }
      out.recalculados[it.id] = novo;
      if (!isObj(it.resultado)) { out.divergentes.push({ id: it.id, motivo: 'sem resultado' }); return; }
      var campos = compararResultados(novo.resultado, it.resultado, it.origem);
      if (campos.length) out.divergentes.push({ id: it.id, motivo: 'campos diferentes do recálculo: ' + campos.slice(0, 4).join(', ') + (campos.length > 4 ? ' (+' + (campos.length - 4) + ')' : '') });
    });
    return out;
  }

  function migrarOrcamento(o) {
    if (!isObj(o)) throw new Error('Orçamento deve ser um objeto JSON.');
    var vf = isFin(o.versaoFormato) ? o.versaoFormato : 1;
    if (vf > VERSAO_FORMATO) throw new Error('Orçamento de formato ' + vf + ' é mais novo que este app (formato ' + VERSAO_FORMATO + ').');
    // completar campo OPCIONAL ausente é diferente de apagar conteúdo inválido: presente com tipo errado → recusa
    if (o.itens !== undefined && !Array.isArray(o.itens)) throw new Error('Orçamento malformado: "itens" deve ser uma lista.');
    if (o.custosInternos !== undefined && !Array.isArray(o.custosInternos)) throw new Error('Orçamento malformado: "custosInternos" deve ser uma lista.');
    if (o.condicoes !== undefined && !isObj(o.condicoes)) throw new Error('Orçamento malformado: "condicoes" deve ser um objeto.');
    if (o.empresa !== undefined && !isObj(o.empresa)) throw new Error('Orçamento malformado: "empresa" deve ser um objeto.');
    if (o.cliente !== undefined && !isObj(o.cliente)) throw new Error('Orçamento malformado: "cliente" deve ser um objeto.');
    var out = clone(o);
    out.versaoFormato = VERSAO_FORMATO;
    if (!isFin(out.revisao)) out.revisao = 1;
    if (out.revisaoDe === undefined) out.revisaoDe = null;
    if (!out.status) out.status = 'rascunho';
    if (out.itens === undefined) out.itens = [];
    if (out.custosInternos === undefined) out.custosInternos = [];
    if (out.condicoes === undefined) out.condicoes = {};
    if (!isObj(out.condicoes.inclusos)) out.condicoes.inclusos = { frete: false, instalacao: false, texto: '' };
    if (out.empresa === undefined) out.empresa = { razaoSocial: '', cnpj: '', endereco: '', telefone: '', email: '' };
    if (out.enviadoEm !== undefined && out.enviadoEm !== null && !dataValida(out.enviadoEm)) out.enviadoEm = null;   // data inválida não serve de evidência
    if (out.emitidoEm !== undefined && out.emitidoEm !== null && !dataValida(out.emitidoEm)) throw new Error('Orçamento malformado: emitidoEm inválido.');
    if (out.emitidoEm === undefined || out.emitidoEm === null) {
      // Marco de emissão para orçamentos anteriores ao campo: enviadoEm válido é evidência de emissão QUALQUER que seja
      // o status atual (a versão antiga permitia enviado → perdido → rascunho sem limpar enviadoEm); aprovado/perdido
      // sem data de envio usam atualizadoEm como data INFERIDA de congelamento. emissaoOrigem registra a procedência.
      var emitido = out.status === 'enviado' || out.status === 'aprovado' || out.status === 'perdido';
      if (dataValida(out.enviadoEm)) { out.emitidoEm = out.enviadoEm; out.emissaoOrigem = out.status === 'rascunho' ? 'migracao:enviadoEm (rascunho com emissão anterior — travado; use Nova revisão)' : 'migracao:enviadoEm'; }
      else if (emitido) { out.emitidoEm = dataValida(out.atualizadoEm) ? out.atualizadoEm : agora(); out.emissaoOrigem = 'migracao:atualizadoEm (data inferida, não comprova a emissão histórica)'; }
      else out.emitidoEm = null;
    }
    if (out.enviadoEm === undefined) out.enviadoEm = null;
    if (out.emissaoOrigem === undefined) out.emissaoOrigem = out.emitidoEm ? 'app' : null;
    if (!out.versaoMotor) out.versaoMotor = 'desconhecida';
    return out;
  }

  /* UFs cujo FCP não está confirmado em itens de importação direta (para a ressalva da proposta — parecer nº 3, achado 8) */
  function fcpPendente(o) {
    var ufs = [];
    if (!isObj(o) || !Array.isArray(o.itens)) return ufs;
    o.itens.forEach(function (it) {
      if (it.origem === 'importacao' && isObj(it.resultado) && it.resultado.fcpConfirmado === false) {
        var uf = it.inputs && it.inputs.uf; if (uf && ufs.indexOf(uf) < 0) ufs.push(uf);
      }
    });
    return ufs;
  }
  /* Orçamento emitido (enviado/aprovado/perdido após emissão): conteúdo travado; alteração só por nova revisão */
  function emitido(o) { return !!(o && o.emitidoEm); }

  root.GM_ORC = {
    VERSAO_MOTOR: VERSAO_MOTOR, VERSAO_FORMATO: VERSAO_FORMATO,
    ORIGENS: ORIGENS, DESTINATARIOS: DESTINATARIOS, TIPOS_CUSTO: TIPOS_CUSTO, STATUS: STATUS,
    novoOrcamento: novoOrcamento, premissasDe: premissasDe, cabecalhoDe: cabecalhoDe, aplicarCabecalho: aplicarCabecalho,
    divergenciasCabecalho: divergenciasCabecalho, classificarAliquotaSaida: classificarAliquotaSaida, calcularItem: calcularItem, adaptarDre: adaptarDre, consolidar: consolidar,
    validarOrcamento: validarOrcamento, validarResultadoItem: validarResultadoItem, compararResultados: compararResultados, conferirResultados: conferirResultados,
    migrarOrcamento: migrarOrcamento, gerarId: gerarId, aliquotaSaidaAuto: aliquotaSaidaAuto, fcpPendente: fcpPendente, emitido: emitido,
    dataValida: dataValida
  };
})(typeof module !== 'undefined' ? module.exports : window);

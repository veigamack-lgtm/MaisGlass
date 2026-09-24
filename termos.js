/* =====================================================================
 * termos.js — textos da proposta comercial impressa (GM_TERMOS)
 *
 * Termos e condições no formato de uma proposta de referência do mercado
 * de vidros (set/2026), adaptados à MaisGlass com as decisões do Gabriel:
 *   · Entrega (cl. 8): igual à referência, só com o nome trocado;
 *   · Garantia (cl. 10): 5 anos;
 *   · Reajuste (cl. 3): 15 dias + variação do dólar nos itens de importação direta;
 *   · Bordas (cl. 6) e arredondamento comercial (cl. 9): mantidos.
 *
 * Cada cláusula tem um TEXTO PADRÃO (editável pelo administrador em
 * Configurações → "Termos e condições da proposta"; o que ele grava fica em
 * config.proposta.termos[id]) e, em algumas, um COMPLEMENTO AUTOMÁTICO montado
 * com os dados do orçamento (pagamento, frete, prazo, validade, perda, dólar, FCP).
 * Os itens automáticos numerados (2.x, 3.x, 1.x) continuam a numeração do texto
 * (se o administrador acrescentar 1.5, a parte automática vira 1.6).
 *
 * Na emissão (primeira saída do rascunho) o app congela o resultado de
 * montar() no orçamento (orc.textosProposta), como já faz com os dados da
 * empresa: mudar os textos depois não altera propostas já enviadas.
 *
 * Sem dependências; não participa de nenhum cálculo de preço.
 * ===================================================================== */
(function (root) {
  'use strict';

  /* Ordem de impressão. `editavel: false` = só complemento automático (o texto padrão vazio vira complemento livre). */
  var CLAUSULAS = [
    { id: 'referencia', titulo: 'Referência (linha "REF.")', cabecalho: true,
      texto: 'Proposta comercial para fornecimento de vidros' },
    { id: 'introducao', titulo: 'Introdução (antes do quadro de itens)', cabecalho: true,
      texto: 'Em atendimento à sua solicitação, enviamos a proposta comercial para os seguintes itens solicitados:' },
    { id: 'normas', titulo: 'Normas técnicas (abaixo do quadro de itens)', cabecalho: true,
      texto: 'DE ACORDO COM NORMAS ABNT - NBR 14697, 14698 E 16015' },

    { id: 'objeto', titulo: 'OBJETO',
      texto: 'Proposta de fornecimento de produtos, conforme descritos no quadro acima, com base nas informações enviadas.',
      auto: 'Acrescenta o que está incluso (frete, instalação e outras inclusões marcadas no orçamento).' },
    { id: 'impostos', titulo: '1) IMPOSTOS',
      texto: '1.1. Nos preços acima estão inclusos o ICMS, PIS, COFINS, IPI, DIFAL e FCP, quando aplicáveis conforme o destino da mercadoria e o tipo de destinatário.\n' +
        '1.2. Caso incida Substituição Tributária (ST), a respectiva alíquota será incluída no valor total da operação.\n' +
        '1.3. O preço ajustado na proposta é estabelecido considerando a carga tributária vigente na data de sua assinatura. A partir de 1º de janeiro de 2027, caso ocorram alterações na legislação tributária que impactem direta ou indiretamente os custos relacionados ao objeto desta proposta, inclusive pela substituição ou modificação de tributos como IBS e CBS, o valor será revisto proporcionalmente, mediante comprovação documental da parte afetada, com eventual reajuste imediato, salvo acordo diverso entre as partes, de modo a preservar o equilíbrio econômico-financeiro.\n' +
        '1.4. Esta proposta não cobre obrigações tributárias próprias do destinatário.',
      auto: 'Acrescenta a UF de entrega e o tipo de destinatário usados no cálculo e, se o FCP da UF não estiver cadastrado, a ressalva de que ele será confirmado na nota fiscal.' },
    { id: 'precos', titulo: '2) PREÇOS',
      texto: '2.1. No orçamento acima descrito, os preços e quantidades foram baseados nas informações apresentadas pelo Cliente. Quando do envio da lista de corte, analisaremos todas as informações e, caso haja alguma distorção entre orçamento e lista de corte, realizaremos os ajustes necessários. Fornecimento de novos produtos, reposições e complementos serão objeto de nova proposta e condições comerciais.',
      auto: 'Acrescenta a perda geométrica considerada, tirada do campo "Perda (%)" de cada item (a proposta de referência fixava "até 15%"; aqui sai a perda que foi de fato usada no preço).' },
    { id: 'reajustes', titulo: '3) REAJUSTES',
      texto: '3.1. Os valores são fixos e irreajustáveis por 15 (quinze) dias contados a partir da data do fechamento do pedido. Após este prazo, os valores estarão sujeitos a reajuste de acordo com a variação dos custos da matéria-prima das usinas vidreiras, aplicado de forma integral sobre o preço unitário, a partir da data de emissão desta proposta comercial.',
      auto: 'Se houver itens de importação direta, acrescenta o item 3.2 com a cotação do dólar usada e o repasse da variação cambial após o prazo do item 3.1.' },
    { id: 'pagamento', titulo: '4) CONDIÇÃO DE PAGAMENTO', texto: '',
      auto: 'Vem do orçamento: à vista, ou parcelado no cartão (bandeira e parcelas). O texto abaixo, se preenchido, é acrescentado.' },
    { id: 'frete', titulo: '5) VALOR DO FRETE',
      texto: 'O frete não contempla área de restrição.',
      auto: 'Vem do orçamento: frete incluso (com o endereço de entrega) ou não incluso.' },
    { id: 'bordas', titulo: '6) ACABAMENTO DE BORDAS',
      texto: '6.1. Os vidros com bordas aparentes serão lapidados; os vidros com bordas encaixilhadas serão filetados.' },
    { id: 'materiaPrima', titulo: '7) MATÉRIA-PRIMA, GERAL',
      texto: 'Matéria-prima exclusiva (vidros metalizados/refletivos) e/ou dimensões fora do padrão serão feitas sob encomenda, e as usinas têm prazo médio de produção de aproximadamente 60 dias, adicionando-se a este prazo o processamento de 3 a 6 semanas, o que torna fundamental o cronograma para o correto planejamento das entregas nos prazos combinados. Caso cortes parciais ou prioridade de entrega modifiquem as perdas geométricas, haverá alteração de quantidade e preço dos produtos.\n' +
        'A MaisGlass encomenda a matéria-prima a partir do envio da lista definitiva de corte. As listas de corte devem ser enviadas em arquivo Excel, e os desenhos de vidros modelados, furados ou recortados devem ser enviados em arquivo digital DWG.' },
    { id: 'entrega', titulo: '8) ENTREGA',
      texto: 'Datas de entrega serão combinadas, considerando disponibilidade de matéria-prima, necessidade da obra, lista e cortes. O cronograma de entrega será estabelecido entre as partes deste contrato.\n' +
        'O prazo padrão de processamento é de 2 a 4 semanas.\n' +
        'A descarga dos vidros inclui apenas transporte horizontal no andar térreo, sem aclives, declives ou obstáculos, à distância máxima de 30 (trinta) metros do caminhão, para peças de no máximo 100 kg.\n' +
        'Para peças "Jumbo", o frete será FOB.\n' +
        'Para peças acima de 100 kg ou com medidas especiais, a descarga será de responsabilidade do Cliente.\n' +
        'As entregas serão programadas com antecedência; o não recebimento dos produtos na obra/caixilheiro implicará a cobrança do frete.\n' +
        'Caso os produtos estejam prontos e estocados na área fabril da MaisGlass e o Cliente recuse a entrega, será cobrada taxa mensal de armazenamento calculada pela área de utilização do espaço (m²) × R$ 120,00.\n' +
        'Frete FOB: a retirada dos produtos deverá ocorrer no prazo de 03 (três) dias após o Cliente ser informado do material pronto na expedição. Caso a coleta não seja realizada neste período, será cobrada taxa diária de armazenamento no valor de R$ 120,00/m².\n' +
        'Haverá custo adicional nas seguintes situações:\n' +
        '1) alteração do local de entrega;\n' +
        '2) demora na descarga por mais de 2 horas da chegada ao local da entrega;\n' +
        '3) entregas noturnas, aos domingos e feriados;\n' +
        '4) entregas agendadas e não efetivadas;\n' +
        '5) equipamentos especiais de descarga.\n' +
        'Itens 1, 3, 4 e 5 – o valor será informado com antecedência para aprovação.\n' +
        'Item 2 – custo de hora/homem × tempo excedente.',
      auto: 'Se o orçamento tiver "Prazo de entrega", ele entra como primeira linha.' },
    { id: 'arredondamento', titulo: '9) ARREDONDAMENTO COMERCIAL',
      texto: 'A dimensão das peças é calculada com arredondamento para maior na altura e na largura, em múltiplos de 50 mm. Em caso de peças modeladas ou fora de esquadro, será faturado o retângulo que circunscreve a peça, com acréscimo de 15% a 100% sobre os preços informados, conforme a complexidade de produção. A área mínima de faturamento por peça é de 0,25 m² para vidros comuns; 0,50 m² para vidros temperados/laminados; e 1,00 m² para vidros insulados, temperados laminados e vidros com impressão digital. Listas parciais de pouca quantidade serão consideradas novos pedidos e serão objeto de nova proposta comercial.' },
    { id: 'garantia', titulo: '10) GARANTIA',
      texto: 'Os produtos fornecidos pela MaisGlass terão garantia de 5 (cinco) anos, contados a partir da data de emissão da Nota Fiscal, contra delaminação e defeitos de fabricação e/ou de matéria-prima, desde que observadas as condições adequadas de armazenamento, manuseio, instalação, limpeza e manutenção, conforme as recomendações técnicas e as normas ABNT vigentes e aplicáveis.\n' +
        'Defeitos ou irregularidades aparentes e/ou facilmente identificáveis no recebimento, tais como manchas, irisação, riscos, lascas, quebras, defeitos de acabamento e demais características visuais fora dos parâmetros técnicos e normativos, deverão ser imediatamente comunicados e recusados antes do aceite e recebimento. Qualquer irregularidade identificada posteriormente deverá ser comunicada imediatamente, para avaliação e eventual vistoria técnica pela MaisGlass.\n' +
        'A MaisGlass não aceitará reclamações de produtos que, após avaliação técnica, estejam dentro dos parâmetros, critérios de aceitação e tolerâncias estabelecidos pelas normas ABNT vigentes e aplicáveis.\n' +
        'A garantia não contempla custos de remoção, instalação de peça de substituição, mão de obra, materiais ou demais despesas e danos indiretos, salvo quando houver obrigação legal aplicável.' },
    { id: 'lgpd', titulo: '11) LEI GERAL DE PROTEÇÃO DE DADOS',
      texto: 'No período de fornecimento dos produtos contratados, o Cliente autoriza a utilização dos dados para a formalização da proposta e do futuro contrato. A MaisGlass se compromete a tratar os dados nos termos da Lei nº 13.709/2018 – Lei Geral de Proteção de Dados.' },
    { id: 'validade', titulo: '12) VALIDADE DA PROPOSTA', texto: '',
      auto: 'Vem do orçamento: "Validade da proposta (dias)". O texto abaixo, se preenchido, é acrescentado.' },
    { id: 'autorizacao', titulo: '13) AUTORIZAÇÃO DE FORNECIMENTO',
      texto: 'Para a formalização desta proposta comercial, pedimos que esta seja assinada e enviada juntamente com a ficha cadastral da contratante, para o envio do pedido de fornecimento.' },
    { id: 'encerramento', titulo: 'Encerramento (antes das assinaturas)', cabecalho: true,
      texto: 'Permanecemos à disposição.' }
  ];
  var POR_ID = {};
  CLAUSULAS.forEach(function (c) { POR_ID[c.id] = c; });
  var LIMITE_TEXTO = 6000;

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function linhas(t) { return String(t || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function num(v, casas) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }); }
  function listaPt(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]; }
  function pctTxt(f) { return (Math.round(f * 1e4) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'; }
  /* próximo subitem de uma cláusula ("1." → 1.5 se o texto vai até 1.4) */
  function proximo(prefixo, linhasTexto) {
    var max = 0, re = new RegExp('^' + prefixo.replace('.', '\\.') + '(\\d+)');
    (linhasTexto || []).forEach(function (l) { var m = re.exec(l); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return prefixo + (max + 1) + '. ';
  }

  /* Texto vigente de uma cláusula: o do administrador (config.proposta.termos[id]) se houver, senão o padrão. */
  function textoDe(config, id) {
    var t = config && isObj(config.proposta) && isObj(config.proposta.termos) ? config.proposta.termos[id] : undefined;
    return typeof t === 'string' ? t : (POR_ID[id] ? POR_ID[id].texto : '');
  }

  /* Complementos automáticos, a partir do contexto do orçamento:
   * ctx = { pagamento, parcelas, bandeira, inclusos:{frete,instalacao,texto}, prazoEntrega, validadeDias,
   *         uf, destinatario, enderecoEntrega, fcpPendente:[UF], itensImportacao:['001',…], dolar,
   *         perdas:[{ item:'001', perda:0.1 }, …] } */
  var AUTO = {
    objeto: function (x) {
      var inc = x.inclusos || {};
      var lista = [inc.frete ? 'frete' : '', inc.instalacao ? 'instalação' : '', (inc.texto || '').trim()].filter(Boolean);
      return { depois: ['Incluso: ' + (lista.length ? lista.join(', ') : 'somente os produtos listados no quadro acima') + '.'] };
    },
    impostos: function (x, lt) {
      var dest = x.destinatario === 'contribuinteRevenda' ? 'contribuinte do ICMS que revende ou industrializa a mercadoria' : 'consumidor final não contribuinte do ICMS';
      var d = [proximo('1.', lt) + 'Preços calculados para entrega em ' + x.uf + ' a ' + dest + '. A mudança da UF de entrega ou do tipo de destinatário implica novo cálculo.'];
      if (x.fcpPendente && x.fcpPendente.length) d.push('Ressalva ao item 1.1: o adicional estadual do Fundo de Combate à Pobreza (FCP) de ' + listaPt(x.fcpPendente) + ' ainda não foi incluído nos preços; será confirmado na emissão da nota fiscal e poderá ser acrescido ao valor.');
      return { depois: d };
    },
    precos: function (x, lt) {
      var ps = (x.perdas || []).filter(function (p) { return p && typeof p.item === 'string' && isFinite(p.perda) && p.perda >= 0; });
      if (!ps.length) return {};
      var n = proximo('2.', lt), max = Math.max.apply(null, ps.map(function (p) { return p.perda; }));
      if (max <= 0) return { depois: [n + 'Os preços não consideram perda geométrica de corte; perdas apuradas na lista de corte serão ajustadas conforme o item ' + n.replace(/\d+\. $/, '1') + '.'] };
      var iguais = ps.every(function (p) { return Math.abs(p.perda - ps[0].perda) < 1e-9; });
      return { depois: [n + (iguais ? 'Perda geométrica considerada de até ' + pctTxt(max) + '.'
        : 'Perda geométrica considerada por item: ' + ps.map(function (p) { return p.item + ' – ' + pctTxt(p.perda); }).join('; ') + '.')] };
    },
    reajustes: function (x, lt) {
      var its = x.itensImportacao || [];
      if (!its.length || !(x.dolar > 0)) return {};
      return { depois: [proximo('3.', lt) + (its.length > 1 ? 'Os itens ' + listaPt(its) + ' (vidro importado) foram precificados' : 'O item ' + its[0] + ' (vidro importado) foi precificado') +
        ' com o dólar a R$ ' + num(x.dolar, 4) + ' (cotação usada nesta proposta). Após o prazo do item 3.1, a variação cambial em relação a essa cotação também será repassada ' + (its.length > 1 ? 'a esses itens' : 'a esse item') + ', na proporção do seu custo de importação.'] };
    },
    pagamento: function (x) {
      return { antes: [x.pagamento === 'Parcelado' ? 'Parcelado em ' + x.parcelas + 'x no cartão de crédito ' + x.bandeira + ' (taxa do cartão já incluída nos preços).' : 'À vista.'] };
    },
    frete: function (x) {
      var inc = x.inclusos || {};
      var destino = (x.enderecoEntrega || '').trim() || x.uf;
      return { antes: [inc.frete ? 'Frete incluso nos preços acima, com entrega em ' + destino + '.' : 'Frete não incluso nos preços acima; quando necessário, será cotado à parte.'] };
    },
    entrega: function (x) {
      return (x.prazoEntrega || '').trim() ? { antes: ['Prazo de entrega: ' + x.prazoEntrega.trim().replace(/\.$/, '') + '.'] } : {};
    },
    validade: function (x) {
      var v = Number(x.validadeDias);
      return { antes: [v > 0 ? v + ' dia' + (v > 1 ? 's' : '') + ', contados da data de emissão desta proposta.' : 'A confirmar no fechamento do pedido.'] };
    }
  };

  /* Monta os textos completos da proposta. Devolve
   * { referencia, introducao, normas, encerramento, clausulas: [{ id, titulo, paragrafos: [...] }] } */
  function montar(config, ctx) {
    ctx = ctx || {};
    var out = { referencia: '', introducao: '', normas: '', encerramento: '', clausulas: [] };
    CLAUSULAS.forEach(function (c) {
      var texto = textoDe(config, c.id);
      if (c.cabecalho) { out[c.id] = linhas(texto).join(' '); return; }
      var lt = linhas(texto);
      var a = AUTO[c.id] ? AUTO[c.id](ctx, lt) : {};
      var paragrafos = (a.antes || []).concat(lt, a.depois || []);
      if (paragrafos.length) out.clausulas.push({ id: c.id, titulo: c.titulo, paragrafos: paragrafos });
    });
    return out;
  }

  /* Valida config.proposta.termos (usado pelo servidor e pelo app): objeto de textos conhecidos. */
  function validarTermos(t) {
    if (t === undefined) return [];
    if (!isObj(t)) return ['proposta.termos deve ser um objeto.'];
    var e = [];
    Object.keys(t).forEach(function (k) {
      if (!POR_ID[k]) e.push('proposta.termos: cláusula desconhecida "' + k + '".');
      else if (typeof t[k] !== 'string') e.push('proposta.termos.' + k + ' deve ser texto.');
      else if (t[k].length > LIMITE_TEXTO) e.push('proposta.termos.' + k + ' longo demais (limite ' + LIMITE_TEXTO + ' caracteres).');
    });
    return e;
  }

  /* Campos do orçamento usados só pela proposta impressa (o motor orcamento.js não os conhece):
   * cliente.{email,telefone,documento,ie,endereco,enderecoEntrega,obra,projeto}, numero, consultor, textosProposta.
   * Usado pelo servidor (api/_lib/validar.js) e na importação de JSON: tipo errado → recusa. */
  var CAMPOS_CLIENTE = ['email', 'telefone', 'documento', 'ie', 'endereco', 'enderecoEntrega', 'obra', 'projeto'];
  function textosValidos(t) {
    if (!isObj(t) || !Array.isArray(t.clausulas)) return false;
    var cab = ['referencia', 'introducao', 'normas', 'encerramento'].every(function (k) { return t[k] === undefined || typeof t[k] === 'string'; });
    return cab && t.clausulas.every(function (c) {
      return isObj(c) && typeof c.titulo === 'string' && Array.isArray(c.paragrafos) && c.paragrafos.every(function (p) { return typeof p === 'string'; });
    });
  }
  function validarCamposProposta(o) {
    var e = [];
    if (!isObj(o)) return e;
    if (isObj(o.cliente)) CAMPOS_CLIENTE.forEach(function (k) {
      var v = o.cliente[k];
      if (v !== undefined && v !== null && typeof v !== 'string') e.push('cliente.' + k + ' deve ser texto.');
      else if (typeof v === 'string' && v.length > 500) e.push('cliente.' + k + ' longo demais.');
    });
    if (o.numero !== undefined && o.numero !== null && (typeof o.numero !== 'string' || o.numero.length > 40)) e.push('numero da proposta inválido.');
    if (o.consultor !== undefined && o.consultor !== null && (!isObj(o.consultor) || ['nome', 'email'].some(function (k) { return o.consultor[k] !== undefined && typeof o.consultor[k] !== 'string'; }))) e.push('consultor inválido.');
    if (o.textosProposta !== undefined && o.textosProposta !== null && !textosValidos(o.textosProposta)) e.push('textosProposta inválido.');
    return e;
  }

  var API = { CLAUSULAS: CLAUSULAS, CAMPOS_CLIENTE: CAMPOS_CLIENTE, textoDe: textoDe, montar: montar, validarTermos: validarTermos,
    validarCamposProposta: validarCamposProposta, textosValidos: textosValidos, LIMITE_TEXTO: LIMITE_TEXTO };
  root.GM_TERMOS = API;
})(typeof module !== 'undefined' ? module.exports : window);

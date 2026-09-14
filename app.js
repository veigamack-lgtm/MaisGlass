/* =====================================================================
 * app.js — Interface da Calculadora MaisGlass
 * - Login por senha (hash SHA-256; ver SENHA_HASH)
 * - Aba Calculadora: entradas B4:B13 → saídas B14:B18 + detalhamento
 * - Aba Configurações: tudo que na planilha fica em VL 4+4 / Produtos /
 *   Config / DIFAL, salvo em localStorage, com exportar/importar/restaurar
 * ===================================================================== */
(function () {
  'use strict';

  /* Senha padrão: "glassmais". Para trocar: aba Configurações → Senha → Gerar hash → colar aqui. */
  var SENHA_HASH = '530075e3e59e8421492e95e8e114809d8ea642dd2d1de914199df232e48c420a';
  var STORAGE_KEY = 'glassmais.config.v1';
  var SESSION_KEY = 'glassmais.auth';

  var DEF = window.GM_DEFAULTS;
  var CALC = window.GM_CALC;
  var config;   // configuração ativa (usada pela calculadora)
  var draft;    // cópia em edição na aba Configurações

  /* ---------------- utilitários ---------------- */
  function $(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function brl(v) { return CALC.fmtBRL(v); }
  function pct(v, dec) { return (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: dec === undefined ? 2 : dec, maximumFractionDigits: dec === undefined ? 2 : dec }) + '%'; }
  function numFmt(v, dec) { return v.toLocaleString('pt-BR', { minimumFractionDigits: dec === undefined ? 2 : dec, maximumFractionDigits: dec === undefined ? 2 : dec }); }
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function setPath(obj, path, val) {
    var parts = path.split('.'); var o = obj;
    for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = val;
  }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  /* SHA-256: usa Web Crypto quando disponível (contexto seguro); senão, implementação local. */
  function sha256(text) {
    var bytes = utf8Bytes(text);
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
      try {
        return crypto.subtle.digest('SHA-256', bytes).then(function (buf) { return hex(new Uint8Array(buf)); })
          .catch(function () { return hex(sha256Puro(bytes)); });
      } catch (e) { /* cai no fallback */ }
    }
    return Promise.resolve(hex(sha256Puro(bytes)));
  }
  function hex(arr) { return Array.prototype.map.call(arr, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var u = unescape(encodeURIComponent(str)), out = new Uint8Array(u.length);
    for (var i = 0; i < u.length; i++) out[i] = u.charCodeAt(i);
    return out;
  }
  function sha256Puro(msg) {
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var l = msg.length, padLen = ((l + 9 + 63) >> 6) << 6, p = new Uint8Array(padLen);
    p.set(msg); p[l] = 0x80;
    var bits = l * 8; p[padLen - 4] = (bits >>> 24) & 255; p[padLen - 3] = (bits >>> 16) & 255; p[padLen - 2] = (bits >>> 8) & 255; p[padLen - 1] = bits & 255;
    var w = new Uint32Array(64);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < padLen; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = (p[off + i*4] << 24) | (p[off + i*4+1] << 16) | (p[off + i*4+2] << 8) | p[off + i*4+3];
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
        var s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0]+a)>>>0; H[1] = (H[1]+b)>>>0; H[2] = (H[2]+c)>>>0; H[3] = (H[3]+d)>>>0; H[4] = (H[4]+e)>>>0; H[5] = (H[5]+f)>>>0; H[6] = (H[6]+g)>>>0; H[7] = (H[7]+h)>>>0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) { out[i*4] = H[i] >>> 24; out[i*4+1] = (H[i] >>> 16) & 255; out[i*4+2] = (H[i] >>> 8) & 255; out[i*4+3] = H[i] & 255; }
    return out;
  }

  /* ---------------- persistência ---------------- */
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  /* Completa chaves ausentes com o padrão (só onde o tipo bate) e devolve uma cópia. */
  function migrar(cfg) { return CALC.migrarConfig(cfg, DEF.config); }   // ver calc.js → migrarConfig (v2/v3, FCP, empresa MG, DIFAL derivado)
  /* Migra + valida; lança Error com a lista de problemas. */
  function normalizarConfig(cfg) {
    var c = migrar(cfg);
    var erros = CALC.validarConfig(c);
    if (erros.length) throw new Error(erros.slice(0, 5).join(' ') + (erros.length > 5 ? ' (+' + (erros.length - 5) + ')' : ''));
    return c;
  }
  function carregarConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var salvo = JSON.parse(raw), c = normalizarConfig(salvo);
        if (JSON.stringify(salvo) !== JSON.stringify(c)) salvarConfig(c);   // grava migrações (v2, FCP) sem esperar uma edição
        return c;
      }
    } catch (e) { console.warn('Config salva inválida; usando padrão.', e); }
    return clone(DEF.config);
  }
  function salvarConfig(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); return true; }
    catch (e) { console.warn('Não foi possível salvar', e); return false; }
  }

  /* ---------------- login ---------------- */
  function autenticado() { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; } }
  function entrar() {
    var senha = $('loginSenha').value;
    sha256(senha).then(function (h) {
      if (h === SENHA_HASH) {
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* ignore */ }
        mostrarApp();
      } else {
        $('loginErro').textContent = 'Senha incorreta.';
        $('loginErro').classList.remove('hidden');
      }
    }).catch(function (e) {
      $('loginErro').textContent = 'Não foi possível verificar a senha: ' + e.message;
      $('loginErro').classList.remove('hidden');
    });
  }
  function sair() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } location.reload(); }
  function mostrarApp() {
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    iniciarApp();
  }

  /* ---------------- abas ---------------- */
  var ABAS = ['home', 'calc', 'revenda', 'nacional', 'config'];
  var abaAtual = 'home';
  function mostrarAba(nome) {
    if (ABAS.indexOf(nome) < 0) nome = 'home';
    if (abaAtual === 'config' && nome !== 'config' && draft) lerCamposSimples(); // guarda o que foi digitado
    abaAtual = nome;
    fecharAjuda();
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === nome); });
    ABAS.forEach(function (a) { $('tab-' + a).classList.toggle('hidden', a !== nome); });
    try { sessionStorage.setItem('glassmais.aba', nome); } catch (e) { /* ignore */ }
    if (OPS[nome]) recalcularRevenda(OPS[nome]);
    if (nome === 'config') { if (!draft) draft = clone(config); renderConfig(); }
  }

  /* Cabeçalho: dólar e frete internacional em uso (para o usuário não esquecer o frete na conta) */
  function atualizarCabecalho() {
    $('hdrDolar').textContent = 'Dólar ' + numFmt(config.dolar, 2);
    $('hdrFrete').textContent = 'Frete US$ ' + numFmt(config.freteInternacionalUSD, 0) + '/container';
  }

  /* ---------------- aba calculadora ---------------- */
  function preencherListas() {
    var selP = $('in-produto'); var atual = selP.value; selP.innerHTML = '';
    config.produtos.forEach(function (p) { selP.appendChild(el('option', { value: p.nome, text: p.nome })); });
    if (atual && config.produtos.some(function (p) { return p.nome === atual; })) selP.value = atual;

    var selB = $('in-bandeira'); var atualB = selB.value; selB.innerHTML = '';
    Object.keys(config.cartao.mdr).forEach(function (b) { selB.appendChild(el('option', { value: b, text: b })); });
    if (atualB && config.cartao.mdr[atualB]) selB.value = atualB;

    var selU = $('in-uf'); var atualU = selU.value; selU.innerHTML = '';
    Object.keys(config.difal).sort().forEach(function (uf) { selU.appendChild(el('option', { value: uf, text: uf })); });
    if (atualU && config.difal[atualU]) selU.value = atualU;

    // revenda
    ['r-fornecedorUF', 'r-clienteUF', 'n-fornecedorUF', 'n-clienteUF'].forEach(function (id) {
      var sel = $(id); var atual = sel.value; sel.innerHTML = '';
      Object.keys(config.difal).sort().forEach(function (uf) { sel.appendChild(el('option', { value: uf, text: uf })); });
      if (atual && config.difal[atual]) sel.value = atual;
    });
    ['r-bandeira', 'n-bandeira'].forEach(function (id) {
      var selRB = $(id); var atualRB = selRB.value; selRB.innerHTML = '';
      Object.keys(config.cartao.mdr).forEach(function (b) { selRB.appendChild(el('option', { value: b, text: b })); });
      if (atualRB && config.cartao.mdr[atualRB]) selRB.value = atualRB;
    });
  }

  /* ---------------- calculadoras 2 e 3: mesmo motor, prefixos de id diferentes ----------------
   * revenda  = importado comprado no Brasil (ICMS 4% entrada/saída, FCI)
   * nacional = vidro de indústria nacional (ICMS interestadual cheio: 12% SP→MG e MG→RJ) */
  var OPS = {
    revenda:  { nome: 'revenda',  i: 'r-', o: 'ro-', v: 'rviz', tab: 'tab-revenda',  origem: 'importado', defaults: function () { return DEF.inputsRevenda; } },
    nacional: { nome: 'nacional', i: 'n-', o: 'no-', v: 'nviz', tab: 'tab-nacional', origem: 'nacional',  defaults: function () { return DEF.inputsNacional; } }
  };
  var PFX = OPS.revenda;
  function recalcularOperacoes() { Object.keys(OPS).forEach(function (k) { recalcularRevenda(OPS[k]); }); }   // só recalcula; alíquotas só são sugeridas ao trocar UF
  /* ---------------- ajuda "?" nos campos editáveis das três calculadoras ----------------
   * Cada entrada: oque (o que é o campo), muda (o que acontece no cálculo ao alterar), dica (sugestão prática).
   * Chave = id do campo sem o prefixo (in-/r-/n-). A aba nacional herda os textos da revenda, salvo os sobrescritos em AJUDA.nac. */
  var AJUDA = {
    imp: {
      contribuinte: {
        oque: 'Se o cliente é contribuinte do ICMS (tem Inscrição Estadual e revende ou industrializa — vidraçaria, serralheria, indústria) ou não (construtora, consumidor final, pessoa física, órgão público).',
        muda: 'Não contribuinte fora de MG: o DIFAL da UF de destino (alíquota interna − 4%) é somado ao preço, por cima do preço + taxa do cartão. Contribuinte: DIFAL zero — o cliente apura o ICMS dele. Dentro de MG não há DIFAL em nenhum dos casos.',
        dica: 'Construtora e consumidor final = Não contribuinte. Só marque Contribuinte se o cliente tiver IE ativa (confira no Sintegra/SEFAZ) e a mercadoria for para revenda ou industrialização.'
      },
      produto: {
        oque: 'Vidro do cadastro (Configurações → Produtos): custo FOB em US$/m², m² por container e classe fiscal (NCM, II, IPI, PIS/COFINS).',
        muda: 'Troca o custo de importação por m² — FOB + frete e seguro internacionais + II/IPI/PIS/COFINS + despesas + entreposto, rateados pela capacidade do container — e com ele o custo da matéria-prima, o markup e o lucro. O preço de venda digitado não muda sozinho.',
        dica: 'Se o FOB mudou na última cotação, atualize o produto em Configurações antes de simular. Confira o dólar e o frete internacional no topo da tela: os dois entram nesse custo.'
      },
      perda: {
        oque: 'Sobra e quebra do corte: quanto a mais de chapa é preciso comprar para entregar a metragem vendida.',
        muda: 'Multiplica a quantidade comprada por (1 + perda): 100 m² vendidos com 10% custam 110 m² de matéria-prima. Só mexe no custo e no lucro — preço, impostos e DIFAL da venda não mudam.',
        dica: '0% para chapa inteira; 5% a 15% em corte de peças. Use o aproveitamento real do plano de corte do projeto.'
      },
      precoBase: {
        oque: 'Preço de venda por m² combinado com o cliente, antes da taxa do cartão e do DIFAL.',
        muda: 'É a base de tudo: preço + taxa do cartão, ICMS efetivo (14% em MG / 1,5% fora, regime especial), PIS/COFINS, DIFAL e lucro. DIFAL e taxa do cartão são cobrados a mais, por cima deste valor — o cliente paga o "Preço final".',
        dica: 'Compare com "Custo matéria-prima (R$/m²)" e ajuste até o lucro líquido no lucro real ficar na margem que você quer. Se prometeu preço fechado ao cliente, o número a comparar é o "Preço final ao cliente", não este campo.'
      },
      quantidade: {
        oque: 'Metros quadrados vendidos — o que sai na nota fiscal.',
        muda: 'Multiplica preço, impostos e custo; a perda é calculada por cima dela. Não altera o custo por m² da importação, que vem do container inteiro rateado pela capacidade.',
        dica: 'Use a metragem do orçamento. Para vender um container fechado, use a capacidade cadastrada do produto (ex.: laminado 4+4 = 1.336,5 m²).'
      },
      frete: {
        oque: 'Frete nacional cobrado do cliente nesta venda, em R$ total (não por m²).',
        muda: 'Entra no preço cobrado, na base da taxa do cartão e na do DIFAL, mas fica fora da base do ICMS e do PIS/COFINS (lógica da planilha). Como também entra no custo, o efeito no lucro é só o da taxa/DIFAL sobre ele.',
        dica: 'Deixe 0 se o cliente retira ou contrata o frete (FOB). Se você paga o frete e não cobra à parte, ele é despesa sua: considere isso na margem.'
      },
      pagamento: {
        oque: 'À vista (PIX, boleto, transferência, dinheiro) ou parcelado no cartão de crédito.',
        muda: 'À vista: taxa zero. Parcelado: taxa = MDR da bandeira + 1,5% de antecipação + 0,75% por parcela, aplicada sobre preço + frete e repassada ao cliente ("Preço + taxa do cartão"). Mesmo 1x no cartão paga taxa (Visa 1x ≈ 3,45%).',
        dica: 'Ofereça desconto no PIX/boleto: a taxa do cartão sai do preço do cliente sem mexer na sua margem. As taxas ficam em Configurações → Cartão.'
      },
      bandeira: {
        oque: 'Bandeira do cartão usado no parcelamento. Cada uma tem seu MDR em três faixas: 1x, 2–5x e 6–12x.',
        muda: 'Só afeta a taxa quando o pagamento é Parcelado. Visa e Master têm as menores taxas (1,20% / 1,95% / 2,10%); Amex e Hipercard as maiores (até 3,05%).',
        dica: 'Se não souber a bandeira, simule com Visa/Master (mais comum). Atualize as tabelas em Configurações → Cartão quando a adquirente mudar as taxas.'
      },
      parcelas: {
        oque: 'Número de parcelas no cartão (1 a 12). Só é usado quando o pagamento é Parcelado.',
        muda: 'Cada parcela soma 0,75% à taxa e muda a faixa do MDR (1x, 2–5x, 6–12x). Ex.: Visa 3x ≈ 5,4%; 12x ≈ 12,6% — tudo repassado ao cliente no "Preço + taxa do cartão".',
        dica: 'Quanto mais parcelas, mais caro o preço final para o cliente. Teste 1x, 3x e 6x e mostre a diferença antes de fechar.'
      },
      uf: {
        oque: 'Estado do cliente (destino da mercadoria).',
        muda: 'Define o ICMS da venda pelo regime especial: MG = 14% efetivo (18% − 4% de crédito); qualquer outra UF = 1,5%. Para não contribuinte fora de MG soma o DIFAL da UF (alíquota interna − 4%; ex.: RJ 16%, SP 14%, ES 13%). A tabela está em Configurações → Alíquotas internas por UF.',
        dica: 'Venda para MG não tem DIFAL, mas o ICMS é maior (14%); para fora de MG o ICMS é 1,5%, mas o não contribuinte paga DIFAL. Confira a alíquota interna da UF na tabela antes de mandar a proposta.'
      }
    },
    rev: {
      fornecedorUF: {
        oque: 'Estado do fornecedor (importadora/distribuidor com IE) que emite a NF de entrada para a MaisGlass, em MG.',
        muda: 'Ao trocar, o app sugere o ICMS destacado na entrada: 4% se for de outro estado (mercadoria importada, Res. SF 13/2012) ou 18% (alíquota interna) se o fornecedor for de Minas. Isso muda o crédito de ICMS e, por tabela, a base do PIS/COFINS e o custo.',
        dica: 'Escolha a UF que está na NF do fornecedor. Se o ICMS destacado na nota for diferente do sugerido (Simples Nacional, ST, benefício), corrija o campo "ICMS destacado na entrada".'
      },
      precoCompra: {
        oque: 'Valor unitário dos produtos na NF de entrada, em R$/m², com o ICMS já incluído (por dentro) e sem o IPI (que vem por fora).',
        muda: 'Base de todos os créditos: ICMS (× alíquota destacada), IPI (× alíquota do IPI) e PIS/COFINS (9,25% sobre produtos − ICMS). Total da NF = produtos + IPI. Custo, CMV e lucro seguem daqui.',
        dica: 'Se o fornecedor cotou "com IPI incluso", divida por 1,065 (IPI 6,5%) para chegar ao valor dos produtos. Se cotou sem impostos, peça o valor como sairá na NF.'
      },
      quantidade: {
        oque: 'Metros quadrados vendidos ao cliente. A compra é quantidade × (1 + perda).',
        muda: 'Multiplica a compra e seus créditos, a receita, os impostos da venda e o lucro.',
        dica: 'Use a metragem do orçamento; a perda cuida da sobra do corte.'
      },
      perda: {
        oque: 'Sobra e quebra do beneficiamento: quanto a mais de chapa é preciso comprar para entregar a metragem vendida.',
        muda: 'Multiplica a quantidade comprada — e a NF de entrada, com seus créditos — por (1 + perda). Só mexe no custo e no lucro; preço e impostos da venda não mudam.',
        dica: '0% para chapa inteira; 5% a 15% em corte de peças. Use o aproveitamento real do plano de corte.'
      },
      icmsCompra: {
        oque: 'Alíquota de ICMS destacada na NF do fornecedor. Vira crédito para a MaisGlass (regime normal, lucro real).',
        muda: 'Crédito de ICMS = produtos × alíquota. Crédito maior → ICMS a recolher menor e base do PIS/COFINS da entrada menor (o crédito de PIS/COFINS cai um pouco). Sugestão automática: 4% (importado, outro estado) ou 18% (fornecedor em MG).',
        dica: 'Copie o percentual da NF. Fornecedor do Simples Nacional: use o percentual de crédito informado na nota (geralmente entre 1% e 3,95%). Se a nota vier com ST ou sem destaque, use 0.'
      },
      ipi: {
        oque: 'Alíquota de IPI destacada na NF do fornecedor (importador é equiparado a industrial e destaca IPI; vidro plano na TIPI: 6,5%).',
        muda: 'IPI = produtos × alíquota, somado ao total da NF. Na industrialização vira crédito (compensa o IPI da saída); na revenda sem industrializar vira custo e sai da base de crédito do PIS/COFINS.',
        dica: 'Confira na NF. Se o fornecedor não destaca IPI (atacadista não equiparado), use 0 — então não há crédito e o IPI da saída pesa inteiro.'
      },
      modo: {
        oque: 'Se a MaisGlass industrializa o vidro (corte, lapidação, furação, têmpera, laminação — RIPI art. 4º, II) antes de vender, ou revende a chapa como comprou.',
        muda: 'Industrialização: crédito do IPI da entrada e IPI destacado na saída (6,5%). Revenda sem industrializar: o IPI da compra vira custo, não há IPI na saída (os dois controles ficam travados) e a base de crédito do PIS/COFINS exclui o IPI. O ICMS não muda.',
        dica: 'Qualquer beneficiamento (até só o corte) já é industrialização — é o normal da MaisGlass. Use "Revenda" só para chapa vendida sem nenhum processo.'
      },
      ipiCredito: {
        oque: 'Se o IPI destacado na entrada pode ser aproveitado como crédito (o vidro é insumo da industrialização).',
        muda: 'Sim: crédito = IPI da NF; IPI a recolher = débito da saída − crédito. Não: o IPI da compra fica no custo (CMV) e o IPI da saída é pago inteiro. Só fica disponível no modo Industrialização.',
        dica: 'Mantenha "Sim" quando o vidro entra no processo e sai com IPI destacado. "Não" só se a contadoria não escriturar o crédito (ex.: material de uso e consumo).'
      },
      contribuinte: {
        oque: 'Se o cliente é contribuinte do ICMS (tem IE e revende ou industrializa) ou consumidor final não contribuinte (construtora, pessoa física, órgão público, empresa sem IE).',
        muda: 'Não contribuinte: o IPI entra na base do ICMS (LC 87/96 art. 13 §2º) e, fora de MG, há DIFAL (interna do destino − interestadual) + FCP a recolher para a UF do cliente. Contribuinte: IPI fora da base, sem DIFAL/FCP (o cliente apura o ICMS dele).',
        dica: 'Construtora = Não contribuinte, mesmo com CNPJ (é consumidora final). Contribuinte só com IE ativa — confira no Sintegra/SEFAZ do estado.'
      },
      clienteUF: {
        oque: 'Estado do cliente (destino). A venda parte sempre de MG.',
        muda: 'Ao trocar, o app sugere o ICMS interestadual da saída (4% importado) e busca a alíquota interna e o FCP do destino para o DIFAL (não contribuinte). Cliente em MG: venda interna a 18%, sem DIFAL. Ex.: RJ = 20% interna + 2% FCP → DIFAL 16% + FCP 2%.',
        dica: 'Só RJ tem FCP confirmado; as outras UFs bloqueiam a venda a não contribuinte até você cadastrar o FCP em Configurações (0 se a UF não cobra). Confirme com a contadoria antes.'
      },
      precoVenda: {
        oque: 'Preço de venda por m² combinado com o cliente. O que ele significa depende do campo "O preço combinado é…".',
        muda: 'Base da receita, do IPI, do ICMS/DIFAL/FCP, do PIS/COFINS e do lucro. Preço fechado: é o total que o cliente paga (impostos saem de dentro). Valor dos produtos: IPI, DIFAL e FCP são somados por cima.',
        dica: 'Ajuste até a margem líquida (DRE, lucro real) ficar onde você quer. Não contribuinte fora de MG com preço fechado: DIFAL + FCP (ex.: 18% no RJ) saem da sua margem — confira o lucro antes de aceitar.'
      },
      difalIncluso: {
        oque: 'Como o preço foi combinado: "fechado" (valor total da NF, tudo incluído) ou "valor dos produtos" (IPI, DIFAL e FCP cobrados à parte).',
        muda: 'Fechado: total = preço × qtd + frete; o IPI é calculado por dentro (total ÷ 1,065) e DIFAL/FCP reduzem a margem. Valor dos produtos: total = produtos × (1 + IPI) ÷ (1 − DIFAL − FCP), com gross-up; o cliente paga mais e a margem se mantém. Com cartão, a taxa entra no gross-up.',
        dica: 'Construtora costuma negociar preço fechado. Se a proposta diz "mais impostos" ou "IPI/DIFAL por fora", use "Valor dos produtos" e mostre o total ao cliente antes de fechar.'
      },
      icmsSaida: {
        oque: 'Alíquota interestadual do ICMS próprio na venda para outro estado.',
        muda: 'ICMS débito = base × alíquota; DIFAL = base × (interna do destino − esta alíquota). Sugestão: 4% (importado com conteúdo de importação > 40% e FCI). Venda dentro de MG ignora este campo e usa 18%.',
        dica: 'Mantenha 4% enquanto o produto beneficiado tiver mais de 40% de conteúdo importado (FCI). Se o beneficiamento levar o conteúdo importado abaixo de 40%, use 12% ou 7% conforme o destino.'
      },
      ipiVenda: {
        oque: 'Alíquota de IPI destacada na NF da MaisGlass (indústria destaca sempre, mesmo para construtora).',
        muda: 'Preço fechado: IPI = total − total ÷ (1 + alíquota), sai de dentro do preço. Valor dos produtos: IPI = produtos × alíquota, somado ao total. IPI a recolher = débito − crédito da entrada. Para não contribuinte o IPI também entra na base do ICMS.',
        dica: '6,5% é a alíquota do vidro plano (TIPI 7005/7007). Zero só no modo Revenda (o app trava o campo) ou se a contadoria confirmar isenção/suspensão.'
      },
      frete: {
        oque: 'Frete cobrado do cliente na NF (CIF), em R$ total.',
        muda: 'Integra o valor da operação e as bases do ICMS, DIFAL, FCP, IPI e PIS/COFINS. Como também é despesa, o efeito no lucro é praticamente só o dos impostos sobre ele.',
        dica: 'Deixe 0 se o cliente contrata o transporte (FOB) — o frete então não gera imposto para a MaisGlass. Se você paga o frete e não cobra à parte, ele é despesa sua: considere isso na margem.'
      },
      pagamento: {
        oque: 'À vista (PIX, boleto, transferência, dinheiro) ou parcelado no cartão de crédito.',
        muda: 'À vista: taxa zero. Parcelado: taxa = MDR da bandeira + 1,5% de antecipação + 0,75% por parcela. A taxa é acrescida ao valor pago pelo cliente (mesmo no preço fechado) e entra na base do IPI/ICMS/PIS/COFINS. Mesmo 1x no cartão paga taxa (Visa 1x ≈ 3,45%).',
        dica: 'Ofereça desconto no PIX/boleto: a taxa sai do preço do cliente sem mexer na sua margem. As taxas ficam em Configurações → Cartão.'
      },
      bandeira: {
        oque: 'Bandeira do cartão usado no parcelamento. Cada uma tem seu MDR em três faixas: 1x, 2–5x e 6–12x.',
        muda: 'Só afeta a taxa quando o pagamento é Parcelado. Visa e Master têm as menores taxas (1,20% / 1,95% / 2,10%); Amex e Hipercard as maiores (até 3,05%).',
        dica: 'Se não souber a bandeira, simule com Visa/Master (mais comum). Atualize as tabelas em Configurações → Cartão quando a adquirente mudar as taxas.'
      },
      parcelas: {
        oque: 'Número de parcelas no cartão (1 a 12). Só é usado quando o pagamento é Parcelado.',
        muda: 'Cada parcela soma 0,75% à taxa e muda a faixa do MDR (1x, 2–5x, 6–12x). Ex.: Visa 3x ≈ 5,4%; Amex 3x ≈ 6,4%; Visa 12x ≈ 12,6% — tudo acrescido ao valor pago pelo cliente.',
        dica: 'Quanto mais parcelas, mais caro o total para o cliente. Teste 1x, 3x e 6x e mostre a diferença antes de fechar.'
      }
    },
    nac: {
      fornecedorUF: {
        oque: 'Estado da indústria nacional (com IE) que emite a NF de entrada para a MaisGlass, em MG.',
        muda: 'Ao trocar, o app sugere o ICMS destacado na entrada: 12% de qualquer outro estado (Res. SF 22/1989 — com destino em MG é sempre 12%) ou 18% (alíquota interna) se a indústria for de Minas. Isso muda o crédito de ICMS e, por tabela, a base do PIS/COFINS e o custo.',
        dica: 'Escolha a UF que está na NF. Indústria do Simples Nacional destaca crédito menor (o percentual vem informado na nota) e não destaca IPI — ajuste os campos de ICMS e IPI da entrada.'
      },
      icmsCompra: {
        oque: 'Alíquota de ICMS destacada na NF da indústria. Vira crédito para a MaisGlass (regime normal, lucro real).',
        muda: 'Crédito de ICMS = produtos × alíquota. Crédito maior → ICMS a recolher menor e base do PIS/COFINS da entrada menor. Sugestão automática: 12% (outro estado) ou 18% (indústria em MG).',
        dica: 'Copie o percentual da NF. Fornecedor do Simples Nacional: use o percentual de crédito informado na nota (geralmente entre 1% e 3,95%). Se a nota vier com ST ou sem destaque, use 0.'
      },
      ipi: {
        oque: 'Alíquota de IPI destacada pela indústria nacional, conforme o NCM na TIPI (vidro plano 7005/7007: 6,5%).',
        muda: 'IPI = produtos × alíquota, somado ao total da NF. Na industrialização vira crédito (compensa o IPI da saída); na revenda sem industrializar vira custo e sai da base de crédito do PIS/COFINS.',
        dica: 'Confirme na NF e na TIPI do NCM do fornecedor. Indústria do Simples Nacional não destaca IPI — use 0.'
      },
      clienteUF: {
        oque: 'Estado do cliente (destino). A venda parte sempre de MG.',
        muda: 'Ao trocar, o app sugere o ICMS interestadual da saída (12%, ou 7% para N/NE/CO e ES) e busca a alíquota interna e o FCP do destino para o DIFAL (não contribuinte). Cliente em MG: venda interna a 18%, sem DIFAL. Ex.: RJ = 20% interna + 2% FCP → DIFAL 8% + FCP 2%.',
        dica: 'Só RJ tem FCP confirmado; as outras UFs bloqueiam a venda a não contribuinte até você cadastrar o FCP em Configurações (0 se a UF não cobra). Confirme com a contadoria antes.'
      },
      icmsSaida: {
        oque: 'Alíquota interestadual do ICMS próprio na venda de mercadoria nacional para outro estado.',
        muda: 'ICMS débito = base × alíquota; DIFAL = base × (interna do destino − esta alíquota). Sugestão: 12%, ou 7% quando o destino é Norte/Nordeste/Centro-Oeste ou ES (Res. SF 22/1989). Venda dentro de MG ignora este campo e usa 18%.',
        dica: 'O valor sugerido cobre a regra geral; só altere se a contadoria indicar outro enquadramento (benefício fiscal do destino, por exemplo).'
      }
    }
  };
  var helpBox = null, helpBtnAtivo = null;
  function textoAjuda(btn) {
    var sec = btn.closest('section'), tab = sec ? sec.id : '';
    var op = tab === 'tab-calc' ? 'imp' : (tab === 'tab-nacional' ? 'nac' : 'rev');
    var chave = btn.getAttribute('data-help');
    return (op === 'nac' && AJUDA.nac[chave]) || (op === 'imp' ? AJUDA.imp[chave] : AJUDA.rev[chave]) || null;
  }
  function tituloCampo(label) {
    var t = ''; label.childNodes.forEach(function (n) { if (n.nodeType === 3) t += n.textContent; });
    return t.trim();
  }
  function fecharAjuda() {
    if (helpBox) { helpBox.remove(); helpBox = null; }
    if (helpBtnAtivo) { helpBtnAtivo.classList.remove('on'); helpBtnAtivo.setAttribute('aria-expanded', 'false'); helpBtnAtivo = null; }
  }
  /* Abre a explicação dentro do próprio campo (caixa abaixo do rótulo/controle), uma por vez; clicar de novo, no × ou Esc fecha */
  function abrirAjuda(btn) {
    if (helpBtnAtivo === btn) { fecharAjuda(); return; }
    fecharAjuda();
    var a = textoAjuda(btn), field = btn.closest('.field'); if (!a || !field) return;
    var label = btn.closest('label');
    var box = document.createElement('div');
    box.className = 'help-box'; box.setAttribute('role', 'note');
    var h = document.createElement('h4'); h.textContent = label ? tituloCampo(label) : 'Ajuda';
    box.appendChild(h);
    [['O que é', a.oque], ['O que muda', a.muda], ['Sugestão', a.dica]].forEach(function (par) {
      var p = document.createElement('p'), b = document.createElement('b');
      b.textContent = par[0] + ': '; p.appendChild(b); p.appendChild(document.createTextNode(par[1])); box.appendChild(p);
    });
    var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Fechar ajuda');
    x.addEventListener('click', fecharAjuda); box.appendChild(x);
    field.appendChild(box);
    helpBox = box; helpBtnAtivo = btn; btn.classList.add('on'); btn.setAttribute('aria-expanded', 'true');
  }
  /* Insere o botão "?" em cada campo editável das abas de cálculo (antes de clonar a aba nacional, que herda os botões) */
  function montarAjuda() {
    document.querySelectorAll('#tab-calc .field, #tab-revenda .field').forEach(function (f) {
      var ctl = f.querySelector('input[id], select[id]'), label = f.querySelector('label');
      if (!ctl || !label) return;
      var chave = ctl.id.replace(/^(in|r)-/, '');
      if (!AJUDA.imp[chave] && !AJUDA.rev[chave]) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'help'; b.textContent = '?';
      b.setAttribute('data-help', chave); b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-label', 'Ajuda: ' + tituloCampo(label)); b.title = 'O que é este campo e o que muda ao alterar';
      var sm = label.querySelector('small');
      if (sm) label.insertBefore(b, sm); else label.appendChild(b);
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button.help') : null;
      if (b) { e.preventDefault(); abrirAjuda(b); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharAjuda(); });
  }

  /* Monta a aba "Indústria nacional" clonando a da revenda (mesmos campos, ids com prefixo n-/no-/nviz) */
  function montarAbaNacional() {
    var html = $('tab-revenda').innerHTML.replace(/id="r-/g, 'id="n-').replace(/id="ro-/g, 'id="no-').replace(/id="rviz-/g, 'id="nviz-');
    $('tab-nacional').innerHTML = html;
    function hint(id, texto) { var f = $(id).closest('.field'); var sm = f && f.querySelector('small'); if (sm) sm.textContent = texto; }
    var h2 = $('tab-nacional').querySelector('.card.purple h2'); if (h2) h2.textContent = 'Entrada — compra da indústria nacional (com IE)';
    hint('n-ipi', 'Conforme TIPI do NCM do fornecedor — confirmar na NF');
    // Glossário: a aba nacional não fala em 4%/FCI
    var gl = $('tab-nacional').querySelector('.gloss');
    if (gl) gl.querySelectorAll('p').forEach(function (par) {
      var t = par.innerHTML;
      t = t.replace('4% na interestadual de mercadoria importada (Res. SF 13/2012)', '12% ou 7% na interestadual de mercadoria nacional (Res. SF 22/1989)');
      t = t.replace('<b>FCI</b> — Ficha de Conteúdo de Importação, obrigatória para manter os 4% quando o produto industrializado tem mais de 40% de conteúdo importado.', 'Vidro nacional não exige FCI.');
      par.innerHTML = t;
    });
  }

  /* ---------------- calculadora 2: revenda ---------------- */
  function lerEntradasRevenda(op) {
    if (op) PFX = op;
    var pctOrZero = function (id) { return $(id).value === '' ? 0 : Number($(id).value) / 100; };
    return {
      fornecedorUF: $(PFX.i + 'fornecedorUF').value,
      precoCompra: $(PFX.i + 'precoCompra').value,
      quantidade: $(PFX.i + 'quantidade').value,
      perda: pctOrZero(PFX.i + 'perda'),
      icmsCompra: pctOrZero(PFX.i + 'icmsCompra'),
      ipi: pctOrZero(PFX.i + 'ipi'),
      ipiCredito: $(PFX.i + 'ipiCredito').value === 'sim',
      modo: $(PFX.i + 'modo').value,
      difalIncluso: $(PFX.i + 'difalIncluso').value === 'dentro',
      contribuinte: $(PFX.i + 'contribuinte').value === 'sim',
      clienteUF: $(PFX.i + 'clienteUF').value,
      precoVenda: $(PFX.i + 'precoVenda').value,
      ipiVenda: pctOrZero(PFX.i + 'ipiVenda'),
      icmsSaida: pctOrZero(PFX.i + 'icmsSaida'),
      frete: $(PFX.i + 'frete').value === '' ? 0 : $(PFX.i + 'frete').value,
      pagamento: $(PFX.i + 'pagamento').value,
      bandeira: $(PFX.i + 'bandeira').value,
      parcelas: $(PFX.i + 'parcelas').value
    };
  }

  function aplicarEntradasPadraoRevenda(op) {
    if (op) PFX = op;
    var d = PFX.defaults(), rv = config.revenda || {}, imp = PFX.origem === 'importado';
    $(PFX.i + 'fornecedorUF').value = d.fornecedorUF;
    $(PFX.i + 'precoCompra').value = d.precoCompra;
    $(PFX.i + 'quantidade').value = d.quantidade;
    $(PFX.i + 'perda').value = d.perda * 100;
    $(PFX.i + 'icmsCompra').value = Math.round((imp && rv.icmsCompraImportado !== undefined ? rv.icmsCompraImportado : d.icmsCompra) * 1e4) / 100;
    $(PFX.i + 'ipi').value = Math.round((imp && rv.ipiCompra !== undefined ? rv.ipiCompra : d.ipi) * 1e4) / 100;   // padrão da revenda só na revenda
    $(PFX.i + 'modo').value = d.modo;
    $(PFX.i + 'ipiCredito').value = (imp && rv.ipiCredito !== undefined ? rv.ipiCredito : d.ipiCredito) ? 'sim' : 'nao';
    $(PFX.i + 'difalIncluso').value = d.difalIncluso ? 'dentro' : 'fora';
    $(PFX.i + 'contribuinte').value = d.contribuinte ? 'sim' : 'nao';
    $(PFX.i + 'clienteUF').value = d.clienteUF;
    $(PFX.i + 'precoVenda').value = d.precoVenda;
    $(PFX.i + 'ipiVenda').value = d.ipiVenda * 100;
    $(PFX.i + 'icmsSaida').value = Math.round((imp && config.interestadual !== undefined ? config.interestadual : d.icmsSaida) * 1e4) / 100;
    $(PFX.i + 'frete').value = d.frete;
    $(PFX.i + 'pagamento').value = d.pagamento;
    $(PFX.i + 'bandeira').value = d.bandeira;
    $(PFX.i + 'parcelas').value = d.parcelas;
    $(PFX.i + 'ipiCredito').disabled = d.modo === 'revenda';
    $(PFX.i + 'ipiVenda').disabled = d.modo === 'revenda';
    sugerirAliquotas();
  }

  /* Alíquota interestadual sugerida automaticamente ao trocar a UF (Res. SF 22/1989 e 13/2012).
   * Entrada: fornecedor → empresa. Saída: empresa → cliente. Importado (calc 2): 4%. Operação interna: campo mostra a interna da UF. */
  function sugerirAliquotas(op, qual) {
    if (op) PFX = op;
    var fazEntrada = qual !== 'saida', fazSaida = qual !== 'entrada';
    var empresaUF = CALC.EMPRESA_UF;
    var importado = PFX.origem === 'importado';
    function interna(uf) { var d = config.difal && config.difal[uf]; return Array.isArray(d) ? d[0] : null; }
    function pctTxt(v) { return Math.round(v * 1e4) / 100; }
    var fornUF = $(PFX.i + 'fornecedorUF').value, cliUF = $(PFX.i + 'clienteUF').value;
    if (fornUF && fazEntrada) {
      var ent = CALC.aliquotaInterestadual(fornUF, empresaUF, importado);
      if (ent === null) ent = interna(fornUF);                       // fornecedor na mesma UF: alíquota interna
      if (ent !== null) $(PFX.i + 'icmsCompra').value = pctTxt(ent);
      $(PFX.i + 'icmsCompraSug').textContent = fornUF === empresaUF ? 'Fornecedor em ' + empresaUF + ': operação interna, alíquota interna ' + pctTxt(ent) + '%.'
        : (importado ? '4% — mercadoria importada, interestadual (Res. SF 13/2012).' : pctTxt(ent) + '% — interestadual ' + fornUF + ' → ' + empresaUF + ' (Res. SF 22/1989).');
    }
    if (cliUF && fazSaida) {
      var sai = CALC.aliquotaInterestadual(empresaUF, cliUF, importado);
      if (sai !== null) $(PFX.i + 'icmsSaida').value = pctTxt(sai);
      $(PFX.i + 'icmsSaidaSug').textContent = cliUF === empresaUF ? 'Venda interna em ' + empresaUF + ': o motor usa a alíquota interna (' + pctTxt(interna(empresaUF)) + '%); este campo não se aplica.'
        : (importado ? '4% — importado com conteúdo > 40% e FCI; 12%/7% se não mantiver.' : pctTxt(sai) + '% — interestadual ' + empresaUF + ' → ' + cliUF + ' (nacional).');
    }
    $(PFX.i + 'empresaInfo').textContent = 'Empresa em ' + empresaUF + ' (fixo — regime especial da importação direta é de Minas).';
  }

  function aplicarModoRevenda(op) {
    if (op) PFX = op;
    // Coerência fiscal: revenda pura → IPI da compra é custo e não há IPI na saída;
    // beneficiamento → crédito do IPI e IPI destacado na saída (padrão da classe, 6,5%).
    var revendaPura = $(PFX.i + 'modo').value === 'revenda';
    if (revendaPura) { $(PFX.i + 'ipiCredito').value = 'nao'; $(PFX.i + 'ipiVenda').value = 0; }
    else {
      var d = PFX.defaults(), rv = config.revenda || {}, imp = PFX.origem === 'importado';
      $(PFX.i + 'ipiCredito').value = (imp && rv.ipiCredito !== undefined ? rv.ipiCredito : d.ipiCredito) ? 'sim' : 'nao';
      $(PFX.i + 'ipiVenda').value = Math.round(d.ipiVenda * 1e4) / 100;
    }
    // Em revenda pura o motor força crédito 0 e IPI de saída 0: os controles ficam travados para não mostrar valor ignorado
    $(PFX.i + 'ipiCredito').disabled = revendaPura;
    $(PFX.i + 'ipiVenda').disabled = revendaPura;
  }
  function recalcularRevenda(op) {
    if (op) PFX = op;
    var inp = lerEntradasRevenda();
    var parcelado = inp.pagamento === 'Parcelado';
    $(PFX.i + 'bandeira').disabled = !parcelado;
    $(PFX.i + 'parcelas').disabled = !parcelado;
    var r;
    try { r = CALC.calcularRevenda(config, inp); }
    catch (e) { limparResultadosRevenda(e.message); return; }
    var empresaUF = CALC.EMPRESA_UF;

    $(PFX.o + 'precoFinal').textContent = brl(r.precoFinal);
    $(PFX.o + 'precoM2').textContent = brl(r.precoVendaM2) + ' por m² · ' + numFmt(Number(inp.quantidade), 2) + ' m²';
    $(PFX.o + 'creditoICMS').textContent = brl(r.creditoICMS);
    $(PFX.o + 'icmsDebitoLabel').textContent = '(−) Débito de ICMS na saída: ' + pct(r.icmsVendaAliq, 1) + ' × ' + brl(r.baseICMS) + (r.contribuinte ? ' (IPI fora da base)' : ' (IPI na base)');
    $(PFX.o + 'icmsDebito').textContent = brl(r.icmsDebito);
    $(PFX.o + 'icmsInternoLabel').textContent = '= ICMS a recolher em ' + empresaUF + ' (efeito nesta venda)';
    $(PFX.o + 'icmsInterno').textContent = brl(r.icmsARecolher);
    $(PFX.o + 'saldoCredorICMS').textContent = r.saldoCredorICMS > 0 ? brl(r.saldoCredorICMS) : '—';
    $(PFX.o + 'difalLabel').textContent = 'DIFAL ' + (r.difalPct > 0 ? pct(r.difalPct, 1) + ' — partilha devida a ' + inp.clienteUF : '— não se aplica');
    $(PFX.o + 'difal').textContent = brl(r.difal);
    $(PFX.o + 'fcpLabel').textContent = 'FCP ' + (r.fcpPct > 0 ? pct(r.fcpPct, 1) + ' — devido a ' + inp.clienteUF : '— não se aplica');
    $(PFX.o + 'fcp').textContent = brl(r.fcp);
    $(PFX.o + 'icmsTotal').textContent = brl(r.icmsTotal);
    $(PFX.o + 'creditoIPI').textContent = brl(r.creditoIPI);
    var dR = r.dre.real, dP = r.dre.presumido;
    renderHeroDre(PFX.o, dR, dP);
    renderDre(dR, dP, PFX.o + 'dre', DRE_LINHAS_REVENDA);

    $(PFX.o + 'credPisCofins').textContent = brl(r.creditoPIS + r.creditoCOFINS);
    $(PFX.o + 'debPisCofins').textContent = brl(r.pisVenda + r.cofinsVenda);
    $(PFX.o + 'pisCofinsDevidoLabel').textContent = r.saldoCredorPisCofins > 0 ? '= Saldo credor de PIS/COFINS' : '= PIS/COFINS a recolher';
    $(PFX.o + 'pisCofinsDevido').textContent = brl(r.saldoCredorPisCofins > 0 ? r.saldoCredorPisCofins : r.pisCofinsARecolher);
    $(PFX.o + 'basePisCofins').textContent = brl(r.basePisCofinsVenda);

    $(PFX.o + 'compraProdutos').textContent = brl(r.compraProdutos);
    $(PFX.o + 'ipiCompra').textContent = brl(r.ipiCompra);
    $(PFX.o + 'totalNF').textContent = brl(r.totalNFCompra);
    $(PFX.o + 'creditos').textContent = '− ' + brl(r.creditoICMS + r.creditoIPI + r.creditoPIS + r.creditoCOFINS);
    $(PFX.o + 'custoLiquido').textContent = brl(r.custoLiquidoCompra);
    $(PFX.o + 'custoLiquidoM2').textContent = brl(r.custoLiquidoM2);

    $(PFX.o + 'taxaCartao').textContent = pct(r.taxaCartao) + ' · ' + brl(r.valorTaxaCartao);
    $(PFX.o + 'precoComTaxa').textContent = brl(r.precoComTaxa);
    $(PFX.o + 'ipiVenda').textContent = brl(r.ipiVenda);
    $(PFX.o + 'ipiDevidoLabel').textContent = r.saldoCredorIPI > 0 ? '= Saldo credor de IPI' : '= IPI a recolher';
    $(PFX.o + 'ipiDevido').textContent = brl(r.saldoCredorIPI > 0 ? r.saldoCredorIPI : r.ipiARecolher);
    $(PFX.o + 'valorOperacao').textContent = brl(r.valorOperacao) + (r.difalIncluso ? ' (preço fechado)' : ' (com gross-up de IPI/DIFAL/FCP)');
    $(PFX.o + 'difalFcp').textContent = brl(r.difal + r.fcp) + (r.difalIncluso ? ' (dentro do preço)' : ' (cobrados em acréscimo)');
    $(PFX.o + 'frete').textContent = brl(r.frete);
    $(PFX.o + 'custoTotal').textContent = brl(r.custoTotal);
    $(PFX.o + 'lucro').textContent = brl(r.lucro);
    $(PFX.o + 'row-lucro').classList.toggle('neg', r.lucro < 0);
    $(PFX.o + 'markup').textContent = pct(r.markup, 1);

    $(PFX.o + 'notas').innerHTML = '';
    r.notas.forEach(function (n) { $(PFX.o + 'notas').appendChild(el('p', { text: n })); });

    var impostos = r.icmsInternoDevido + r.pisDevido + r.cofinsDevido + r.ipiDevido;
    renderGraficoGenerico(PFX.v, r.precoFinal, r.custoTotal, r.lucro, [
      { nome: 'Mercadoria (NF de entrada)', sub: 'produtos + IPI, antes dos créditos', valor: r.totalNFCompra },
      { nome: 'Tributos a recolher (líquidos de créditos)', sub: 'ICMS ' + brl(r.icmsInternoDevido) + ' · PIS/COFINS ' + brl(r.pisDevido + r.cofinsDevido) + ' · IPI ' + brl(r.ipiDevido), valor: impostos },
      { nome: 'DIFAL + FCP', sub: r.difalPct + r.fcpPct > 0 ? pct(r.difalPct + r.fcpPct, 1) + ' (não contribuinte)' : 'não se aplica', valor: r.difal + r.fcp },
      { nome: 'Frete', sub: '', valor: r.frete },
      { nome: 'Taxa do cartão', sub: r.taxaCartao > 0 ? pct(r.taxaCartao) : 'à vista', valor: r.valorTaxaCartao },
      { nome: 'Lucro operacional', sub: 'antes de IRPJ/CSLL · markup ' + pct(r.markup, 1) + ' sobre o CMV', valor: r.lucro }
    ]);
  }

  var DRE_LINHAS_REVENDA = [
    ['Receita bruta (valor pago pelo cliente)', 'receitaBruta'],
    ['(−) IPI destacado na saída', 'ipi', 'sub'],
    ['(−) ICMS débito na saída', 'icms', 'sub'],
    ['(−) DIFAL + FCP', 'difalFcp', 'sub'],
    ['(−) PIS/COFINS sobre a venda', 'pisCofins', 'sub'],
    ['= Receita líquida', 'receitaLiquida', 'total'],
    ['(−) CMV (compra líquida dos tributos recuperáveis)', 'cmv'],
    ['= Lucro bruto', 'lucroBruto', 'total'],
    ['(−) Frete', 'frete', 'sub'],
    ['(−) Taxa do cartão', 'cartao', 'sub'],
    ['= Lucro operacional (antes de IRPJ/CSLL)', 'lucroOperacional', 'total'],
    ['(−) IRPJ + CSLL', 'irpjCsll'],
    ['= Lucro líquido da operação', 'lucroLiquido', 'final']
  ];
  var DRE_LINHAS_IMPORTACAO = [
    ['Receita bruta (preço final ao cliente)', 'receitaBruta'],
    ['(−) DIFAL', 'difal', 'sub'],
    ['(−) ICMS (alíquota efetiva)', 'icms', 'sub'],
    ['(−) PIS/COFINS (real: líquidos dos créditos da importação)', 'pisCofins', 'sub'],
    ['= Receita líquida', 'receitaLiquida', 'total'],
    ['(−) CMV (custo do vidro: importação + despesas)', 'cmv'],
    ['= Lucro bruto', 'lucroBruto', 'total'],
    ['(−) Frete', 'frete', 'sub'],
    ['(−) Taxa do cartão', 'cartao', 'sub'],
    ['= Lucro operacional (= "Lucro" da planilha)', 'lucroOperacional', 'total'],
    ['(−) IRPJ + CSLL', 'irpjCsll'],
    ['= Lucro líquido da operação', 'lucroLiquido', 'final']
  ];
  function renderDre(a, b, tableId, linhas, rotuloTributos) {
    function row(label, k, cls) {
      var va = a[k], vb = b[k];
      return el('tr', { class: cls || '' }, [el('td', { text: label }),
        el('td', { text: brl(va), class: va < 0 ? 'neg' : '' }),
        el('td', { text: brl(vb), class: vb < 0 ? 'neg' : '' })]);
    }
    var t = $(tableId || PFX.o + 'dre'); t.innerHTML = '';
    t.appendChild(el('thead', {}, [el('tr', {}, [el('th', { text: 'DRE da operação (estimativa gerencial)' }), el('th', { text: 'Lucro real (atual)' }), el('th', { text: 'Lucro presumido (simulação)' })])]));
    var tb = el('tbody');
    (linhas || DRE_LINHAS_REVENDA).forEach(function (l) { tb.appendChild(row(l[0], l[1], l[2])); });
    tb.appendChild(el('tr', { class: 'sub' }, [el('td', { text: 'Margem líquida (sobre a receita líquida)' }), el('td', { text: pct(a.margemLiquida, 1) }), el('td', { text: pct(b.margemLiquida, 1) })]));
    tb.appendChild(el('tr', { class: 'sub' }, [el('td', { text: 'Lucro líquido sobre o valor pago pelo cliente' }), el('td', { text: pct(a.margemSobreValorPago, 1) }), el('td', { text: pct(b.margemSobreValorPago, 1) })]));
    tb.appendChild(el('tr', { class: 'sub' }, [el('td', { text: rotuloTributos || 'Tributos totais líquidos (ICMS, IPI, PIS/COFINS, DIFAL/FCP, IRPJ/CSLL)' }), el('td', { text: brl(a.tributosTotais) }), el('td', { text: brl(b.tributosTotais) })]));
    t.appendChild(tb);
  }
  function renderHeroDre(prefix, dR, dP) {
    $(prefix + 'liqReal').textContent = brl(dR.lucroLiquido);
    $(prefix + 'liqRealSub').textContent = pct(dR.margemSobreValorPago, 1) + ' do valor pago · IRPJ/CSLL ' + brl(dR.irpjCsll);
    $(prefix + 'liqPres').textContent = brl(dP.lucroLiquido);
    var delta = dP.lucroLiquido - dR.lucroLiquido;
    $(prefix + 'liqPresSub').textContent = (delta >= 0 ? '+ ' : '− ') + brl(Math.abs(delta)) + ' em relação ao lucro real · IRPJ/CSLL ' + brl(dP.irpjCsll);
  }

  function limparResultadosRevenda(msg) {
    document.querySelectorAll('#' + PFX.tab + ' .kv .v, #' + PFX.tab + ' .result-hero .value').forEach(function (n) { n.textContent = '—'; });
    $(PFX.o + 'precoM2').textContent = '';
    $(PFX.o + 'row-lucro').classList.remove('neg');
    $(PFX.o + 'notas').innerHTML = '';
    $(PFX.o + 'notas').appendChild(el('p', { class: 'warn', text: 'Não foi possível calcular: ' + msg }));
    $(PFX.v + '-bar').innerHTML = ''; $(PFX.v + '-legend').innerHTML = '';
    $(PFX.v + '-sub').textContent = 'Corrija as entradas para ver a composição.';
    $(PFX.v + '-prejuizo').classList.add('hidden');
    $(PFX.o + 'dre').innerHTML = '';
    ['liqReal', 'liqPres'].forEach(function (id) { $(PFX.o + id).textContent = '—'; });
    ['liqRealSub', 'liqPresSub'].forEach(function (id) { $(PFX.o + id).textContent = ''; });
  }

  function lerEntradas() {
    return {
      contribuinte: $('in-contribuinte').value === 'sim',
      produto: $('in-produto').value,
      perda: $('in-perda').value === '' ? 0 : Number($('in-perda').value) / 100,
      precoBase: $('in-precoBase').value,
      quantidade: $('in-quantidade').value,
      frete: $('in-frete').value === '' ? 0 : $('in-frete').value,
      pagamento: $('in-pagamento').value,
      bandeira: $('in-bandeira').value,
      parcelas: $('in-parcelas').value,
      uf: $('in-uf').value
    };
  }

  function aplicarEntradasPadrao() {
    var d = DEF.inputs;
    $('in-contribuinte').value = d.contribuinte ? 'sim' : 'nao';
    $('in-produto').value = d.produto;
    $('in-perda').value = d.perda * 100;
    $('in-precoBase').value = d.precoBase;
    $('in-quantidade').value = d.quantidade;
    $('in-frete').value = d.frete;
    $('in-pagamento').value = d.pagamento;
    $('in-bandeira').value = d.bandeira;
    $('in-parcelas').value = d.parcelas;
    $('in-uf').value = d.uf;
  }

  function recalcular() {
    var inp = lerEntradas();
    var parcelado = inp.pagamento === 'Parcelado';
    $('in-bandeira').disabled = !parcelado;
    $('in-parcelas').disabled = !parcelado;
    var r;
    try { r = CALC.calcular(config, inp); }
    catch (e) { limparResultados(e.message); return; }

    atualizarCabecalho();
    $('out-precoFinal').textContent = brl(r.precoFinal);
    $('out-precoFinal2').textContent = brl(r.precoFinal);
    $('out-precoM2').textContent = brl(r.precoVendaM2) + ' por m² · ' + numFmt(Number(inp.quantidade), 2) + ' m²';
    $('out-produto').textContent = r.produto.nome;
    $('out-ncm').textContent = r.ncm;
    $('out-taxaCartao').textContent = pct(r.taxaCartao);
    $('out-precoComTaxa').textContent = brl(r.precoComTaxa);
    $('out-difalPct').textContent = pct(r.difalPct, 1);
    $('out-difal').textContent = brl(r.difal);
    $('out-difal2').textContent = brl(r.difal);

    $('out-custoM2').textContent = brl(r.custoMateriaPrimaM2);
    $('out-vendaM2').textContent = brl(r.precoVendaM2);
    $('out-markup').textContent = pct(r.markup, 1);
    $('out-qtdPerda').textContent = numFmt(r.qtdComPerda, 2) + ' m²';

    $('out-custoSemImposto').textContent = brl(r.custoSemImposto);
    $('out-pis').textContent = brl(r.pis);
    $('out-cofins').textContent = brl(r.cofins);
    $('out-icmsLabel').textContent = 'ICMS ' + pct(r.icmsAliqEfetiva, 1) + ' (alíquota ' + pct(r.icmsAliqNominal, 0) + ')';
    $('out-icms').textContent = brl(r.icms);
    $('out-frete').textContent = brl(r.frete);
    $('out-taxaCartaoValor').textContent = brl(r.valorTaxaCartao);
    $('out-custoTotal').textContent = brl(r.custoTotal);
    $('out-lucro').textContent = brl(r.lucro);
    $('row-lucro').classList.toggle('neg', r.lucro < 0);

    $('out-notas').innerHTML = '';
    r.notas.forEach(function (n) { $('out-notas').appendChild(el('p', { text: n })); });

    renderImportacao(r.importacao);
    renderGrafico(r);

    // DRE (estimativa gerencial) calculada a partir do resultado — não mexe na calc 1
    try {
      var d1 = CALC.dreImportacao(config, r);
      renderHeroDre('out-', d1.real, d1.presumido);
      renderDre(d1.real, d1.presumido, 'out-dre', DRE_LINHAS_IMPORTACAO, 'Tributos totais (DIFAL, ICMS, PIS/COFINS líquidos, IRPJ/CSLL)');
    } catch (e) { $('out-dre').innerHTML = ''; ['out-liqReal', 'out-liqPres'].forEach(function (id) { $(id).textContent = '—'; }); }
  }

  /* Gráfico: composição do preço final (barra empilhada 100%) */
  var VIZ_CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
  function renderGrafico(r) {
    var impostos = r.pis + r.cofins + r.icms;
    renderGraficoGenerico('viz', r.precoFinal, r.custoTotal, r.lucro, [
      { nome: 'Custo do vidro', sub: 'importação + despesas, sem imposto', valor: r.custoSemImposto },
      { nome: 'Impostos', sub: 'PIS ' + brl(r.pis) + ' · COFINS ' + brl(r.cofins) + ' · ICMS ' + brl(r.icms), valor: impostos },
      { nome: 'DIFAL', sub: r.difalPct > 0 ? pct(r.difalPct, 1) + ' (não contribuinte)' : 'não se aplica', valor: r.difal },
      { nome: 'Frete', sub: '', valor: r.frete },
      { nome: 'Taxa do cartão', sub: r.taxaCartao > 0 ? pct(r.taxaCartao) : 'à vista', valor: r.valorTaxaCartao },
      { nome: 'Lucro', sub: 'markup ' + pct(r.markup, 1), valor: r.lucro }
    ]);
  }
  function renderGraficoGenerico(prefix, total, custoTotal, lucro, partes) {
    var bar = $(prefix + '-bar'), leg = $(prefix + '-legend');
    bar.innerHTML = ''; leg.innerHTML = '';
    $(prefix + '-sub').textContent = total > 0 ? 'Preço final ' + brl(total) + ' — cada faixa é a parte que cada item representa.' : 'Informe preço e quantidade para ver a composição.';
    var prejuizo = lucro < 0;
    $(prefix + '-prejuizo').classList.toggle('hidden', !prejuizo);
    if (prejuizo) $(prefix + '-prejuizo').textContent = 'Atenção: o custo total (' + brl(custoTotal) + ') supera o preço final. Prejuízo de ' + brl(-lucro) + '.';

    partes.forEach(function (p, i) {
      var frac = total > 0 && p.valor > 0 ? p.valor / total : 0;
      if (frac > 0) {
        var seg = el('div', { class: 'viz-seg', style: 'flex:' + frac + ' 1 0; background:' + VIZ_CORES[i] });
        if (frac >= 0.08) seg.textContent = Math.round(frac * 100) + '%';
        seg.addEventListener('mousemove', function (ev) { mostrarTip(ev, p.nome + ': ' + brl(p.valor) + ' (' + pct(frac, 1) + ')'); });
        seg.addEventListener('mouseleave', esconderTip);
        bar.appendChild(seg);
      }
      leg.appendChild(el('div', { class: 'item' }, [
        el('span', { class: 'sw', style: 'background:' + VIZ_CORES[i] }),
        el('span', { class: 'nm' }, [p.nome, el('small', { text: p.sub })]),
        el('span', { class: 'vl', text: brl(p.valor) }),
        el('span', { class: 'pc', text: total > 0 ? pct(p.valor / total, 1) : '—' })
      ]));
    });
  }
  var tipEl;
  function mostrarTip(ev, texto) {
    if (!tipEl) { tipEl = el('div', { class: 'viz-tip' }); document.body.appendChild(tipEl); }
    tipEl.textContent = texto; tipEl.style.left = (ev.clientX + 12) + 'px'; tipEl.style.top = (ev.clientY - 30) + 'px'; tipEl.style.display = 'block';
  }
  function esconderTip() { if (tipEl) tipEl.style.display = 'none'; }

  function limparResultados(msg) {
    atualizarCabecalho();
    document.querySelectorAll('#tab-calc .kv .v, #tab-calc .result-hero .value').forEach(function (n) {
      if (n.querySelector('#out-ncm')) { $('out-ncm').textContent = '—'; } else { n.textContent = '—'; }
    });
    $('out-precoM2').textContent = '';
    $('out-icmsLabel').textContent = 'ICMS';
    $('row-lucro').classList.remove('neg');
    $('out-notas').innerHTML = '';
    $('out-notas').appendChild(el('p', { class: 'warn', text: 'Não foi possível calcular: ' + msg }));
    $('out-importacao').innerHTML = '';
    $('viz-bar').innerHTML = ''; $('viz-legend').innerHTML = '';
    $('viz-sub').textContent = 'Corrija as entradas para ver a composição.';
    $('viz-prejuizo').classList.add('hidden');
    $('out-dre').innerHTML = '';
    ['out-liqReal', 'out-liqPres'].forEach(function (id) { $(id).textContent = '—'; });
    ['out-liqRealSub', 'out-liqPresSub'].forEach(function (id) { $(id).textContent = ''; });
  }

  function renderImportacao(i) {
    var linhas = [
      ['Capacidade do container', numFmt(i.capacidade, 2) + ' m²'],
      ['Valor FOB total', 'US$ ' + numFmt(i.valorTotalUSD)],
      ['VMCV (por dentro)', brl(i.vmcv)],
      ['Frete internacional', brl(i.frete)],
      ['Seguro', brl(i.seguro)],
      ['VMLD', brl(i.vmld)],
      ['II', brl(i.ii)], ['IPI', brl(i.ipi)], ['PIS', brl(i.pis)], ['COFINS', brl(i.cofins)],
      ['Subtotal (VMLD + impostos)', brl(i.subtotalImpostos)],
      ['Valor por fora', brl(i.porFora)],
      ['Despesas nacionais (inclui AFRMM ' + brl(i.afrmm) + ')', brl(i.despesasNacionais)],
      ['Entreposto aduaneiro', brl(i.entreposto)],
      ['Custo chão de fábrica (container)', brl(i.custoChaoFabrica)],
      ['Custo por m²', brl(i.custoM2)],
      ['Crédito PIS por m²', brl(i.creditoPisM2)],
      ['Crédito COFINS por m²', brl(i.creditoCofinsM2)]
    ];
    var t = el('table', {}, [el('tbody', {}, linhas.map(function (l) {
      return el('tr', {}, [el('td', { text: l[0] }), el('td', { text: l[1], style: 'text-align:right;font-weight:600' })]);
    }))]);
    $('out-importacao').innerHTML = ''; $('out-importacao').appendChild(t);
  }

  /* ---------------- aba configurações ---------------- */
  function renderConfig() {
    // campos simples data-cfg
    document.querySelectorAll('[data-cfg]').forEach(function (inp) {
      var v = getPath(draft, inp.getAttribute('data-cfg'));
      var t = inp.getAttribute('data-type');
      if (t === 'pct') inp.value = Math.round(v * 1e6) / 1e4; // fração → %
      else if (t === 'bool') inp.value = v ? '1' : '0';
      else inp.value = v;
    });
    atualizarFora();
    renderClasses();
    renderProdutos();
    renderMdr();
    renderDifal();
    renderFcp();
  }
  function renderFcp() {
    var fcp = draft.revenda.fcp;
    var tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, ['UF', 'FCP %'].map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', {}, Object.keys(fcp).sort().map(function (uf) {
        return el('tr', {}, [el('td', { text: uf }),
          inputCell(fcp[uf] === null || fcp[uf] === undefined ? '' : Math.round(fcp[uf] * 1e6) / 1e4, function (v) { fcp[uf] = v === '' ? null : Number(v) / 100; }, { step: '0.5', placeholder: 'não confirmado' })]);
      }))
    ]);
    $('cfg-fcp').innerHTML = ''; $('cfg-fcp').appendChild(tbl);
  }
  function atualizarFora() { $('cfg-fora').value = Math.round((1 - draft.dentro) * 1e4) / 100; }

  function lerCamposSimples() {
    document.querySelectorAll('[data-cfg]').forEach(function (inp) {
      var t = inp.getAttribute('data-type'), v;
      if (t === 'text') v = inp.value;
      else if (t === 'bool') v = inp.value === '1';
      else { v = inp.value === '' ? NaN : Number(inp.value); if (t === 'pct') v = v / 100; }
      setPath(draft, inp.getAttribute('data-cfg'), v);
    });
    CALC.derivarDifal(draft);   // coluna DIFAL (calc 1) acompanha a alíquota interna e a UF da empresa
  }

  function inputCell(value, onChange, opts) {
    opts = opts || {};
    var i = el('input', { type: opts.type || 'number', step: opts.step || 'any', value: value });
    if (opts.placeholder) i.placeholder = opts.placeholder;
    i.addEventListener('change', function () { onChange(i.value); });
    return el('td', { class: opts.type === 'text' ? ('txt' + (opts.wide ? ' wide' : '')) : 'num' }, [i]);
  }

  function renderClasses() {
    var tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, ['Classe', 'Descrição', 'NCM', 'II %', 'IPI %', 'PIS %', 'COFINS %'].map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', {}, Object.keys(draft.classes).map(function (k) {
        var c = draft.classes[k];
        return el('tr', {}, [
          el('td', {}, [el('strong', { text: k })]),
          inputCell(c.nome, function (v) { c.nome = v; }, { type: 'text' }),
          inputCell(c.ncm, function (v) { c.ncm = v.trim(); }, { type: 'text' }),
          inputCell(c.ii * 100, function (v) { c.ii = (v === '' ? NaN : Number(v)) / 100; }),
          inputCell(c.ipi * 100, function (v) { c.ipi = (v === '' ? NaN : Number(v)) / 100; }),
          inputCell(c.pis * 100, function (v) { c.pis = (v === '' ? NaN : Number(v)) / 100; }),
          inputCell(c.cofins * 100, function (v) { c.cofins = (v === '' ? NaN : Number(v)) / 100; })
        ]);
      }))
    ]);
    $('cfg-classes').innerHTML = ''; $('cfg-classes').appendChild(tbl);
  }

  function renderProdutos() {
    var classes = Object.keys(draft.classes);
    var tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, ['Produto', 'Custo US$/m²', 'm²/container', 'Classe', ''].map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', {}, draft.produtos.map(function (p, idx) {
        var sel = el('select', {}, classes.map(function (k) { return el('option', { value: k, text: k }); }));
        sel.value = p.classe;
        sel.addEventListener('change', function () { p.classe = sel.value; });
        var rm = el('button', { class: 'btn small danger', text: 'Remover', onclick: function () { draft.produtos.splice(idx, 1); renderProdutos(); $('tab-config').dispatchEvent(new Event('change', { bubbles: true })); } });
        return el('tr', {}, [
          inputCell(p.nome, function (v) { p.nome = v.trim(); }, { type: 'text', wide: true }),
          inputCell(p.custo, function (v) { p.custo = v === '' ? NaN : Number(v); }, { step: '0.01' }),
          inputCell(p.capacidade, function (v) { p.capacidade = v === '' ? NaN : Number(v); }, { step: '0.5' }),
          el('td', {}, [sel]),
          el('td', {}, [rm])
        ]);
      }))
    ]);
    $('cfg-produtos').innerHTML = ''; $('cfg-produtos').appendChild(tbl);
  }

  function renderMdr() {
    var tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, ['Bandeira', 'MDR 1x %', 'MDR 2–5x %', 'MDR 6–12x %'].map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', {}, Object.keys(draft.cartao.mdr).map(function (b) {
        var f = draft.cartao.mdr[b];
        return el('tr', {}, [el('td', { text: b })].concat([0, 1, 2].map(function (i) {
          return inputCell(Math.round(f[i] * 1e6) / 1e4, function (v) { f[i] = (v === '' ? NaN : Number(v)) / 100; }, { step: '0.01' });
        })));
      }))
    ]);
    $('cfg-mdr').innerHTML = ''; $('cfg-mdr').appendChild(tbl);
  }

  function renderDifal() {
    CALC.derivarDifal(draft);
    var empresaUF = CALC.EMPRESA_UF;
    var tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, ['UF', 'Alíquota interna %', 'DIFAL % (importação direta — calculado)'].map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', {}, Object.keys(draft.difal).sort().map(function (uf) {
        var d = draft.difal[uf];
        return el('tr', {}, [
          el('td', { text: uf + (uf === empresaUF ? ' (empresa)' : '') }),
          inputCell(Math.round(d[0] * 1e6) / 1e4, function (v) { d[0] = (v === '' ? NaN : Number(v)) / 100; CALC.derivarDifal(draft); renderDifal(); }, { step: '0.5' }),
          el('td', { class: 'num', text: isFinite(d[1]) ? (Math.round(d[1] * 1e6) / 1e4) + '%' : '—', style: 'text-align:right;color:var(--muted)' })
        ]);
      }))
    ]);
    $('cfg-difal').innerHTML = ''; $('cfg-difal').appendChild(tbl);
  }

  function validarDraft() {
    var erros = CALC.validarConfig(draft);
    return erros.length ? erros.slice(0, 4).join(' ') + (erros.length > 4 ? ' (+' + (erros.length - 4) + ' problemas)' : '') : null;
  }

  function status(msg, cls) { var s = $('cfgStatus'); s.textContent = msg; s.className = 'status ' + (cls || ''); }

  function salvar() {
    lerCamposSimples();
    var erro = validarDraft();
    if (erro) { status(erro, 'err'); return; }
    config = clone(draft);
    draft = clone(config);
    status(salvarConfig(config) ? 'Configurações salvas.' : 'Salvo só nesta sessão (navegador sem armazenamento).', 'ok');
    preencherListas();
    recalcular();
    recalcularOperacoes();
  }

  function autoSalvar() {
    if (!draft) return;
    lerCamposSimples();
    var erro = validarDraft();
    if (erro) { status('Não salvo — ' + erro, 'err'); return; }
    config = clone(draft);
    var ok = salvarConfig(config);
    preencherListas();
    recalcular();
    recalcularOperacoes();
    var hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    status(ok ? 'Salvo automaticamente às ' + hora + '.' : 'Aplicado só nesta sessão (navegador sem armazenamento).', 'ok');
  }

  function exportar() {
    lerCamposSimples();
    var erro = validarDraft();
    if (erro) { status('Corrija antes de exportar: ' + erro, 'err'); return; }
    var blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'maisglass-config.json' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function importar(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var candidato;
      try { candidato = normalizarConfig(JSON.parse(fr.result)); }
      catch (e) { status('Arquivo inválido: ' + e.message, 'err'); return; }
      draft = candidato;
      renderConfig();
      status('Arquivo carregado. Clique em "Salvar agora" para aplicar (ou continue editando).', 'ok');
    };
    fr.readAsText(file);
  }

  function restaurar() {
    if (!confirm('Restaurar todos os valores padrão da planilha? As alterações salvas serão perdidas.')) return;
    draft = clone(DEF.config);
    renderConfig();
    salvar();
    status('Padrão restaurado.', 'ok');
  }

  /* ---------------- inicialização ---------------- */
  var iniciado = false;
  function iniciarApp() {
    if (iniciado) return; iniciado = true;
    config = carregarConfig();
    montarAjuda();          // botões "?" nas abas calc/revenda — antes do clone, para a aba nacional herdá-los
    montarAbaNacional();
    preencherListas();
    aplicarEntradasPadrao();
    recalcular();

    Object.keys(OPS).forEach(function (k) {
      var op = OPS[k];
      aplicarEntradasPadraoRevenda(op);
      recalcularRevenda(op);
      $(op.i + 'modo').addEventListener('change', function () { aplicarModoRevenda(op); recalcularRevenda(op); });
      $(op.i + 'fornecedorUF').addEventListener('change', function () { sugerirAliquotas(op, 'entrada'); recalcularRevenda(op); });
      $(op.i + 'clienteUF').addEventListener('change', function () { sugerirAliquotas(op, 'saida'); recalcularRevenda(op); });
      document.querySelectorAll('#' + op.tab + ' input, #' + op.tab + ' select').forEach(function (i) {
        var f = function () { recalcularRevenda(op); };
        i.addEventListener('input', f); i.addEventListener('change', f);
      });
    });
    document.querySelectorAll('#tab-calc input, #tab-calc select').forEach(function (i) {
      i.addEventListener('input', recalcular); i.addEventListener('change', recalcular);
    });
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.addEventListener('click', function () { mostrarAba(b.getAttribute('data-tab')); }); });
    document.querySelectorAll('.home-card').forEach(function (c) { c.addEventListener('click', function () { mostrarAba(c.getAttribute('data-go')); }); });
    var abaSalva = null; try { abaSalva = sessionStorage.getItem('glassmais.aba'); } catch (e) { /* ignore */ }
    mostrarAba(abaSalva || 'home');
    $('logoutBtn').addEventListener('click', sair);

    $('cfgSalvar').addEventListener('click', salvar);
    // Salvamento automático: qualquer alteração na aba Configurações valida e salva sozinha.
    var autoTimer = null;
    function agendarAutoSalvar(e) {
      if (e && e.target && e.target.id === 'cfgArquivo') { clearTimeout(autoTimer); autoTimer = null; return; }   // importar JSON cancela autosave pendente; só aplica em "Salvar agora"
      clearTimeout(autoTimer); autoTimer = setTimeout(autoSalvar, 500);
    }
    $('tab-config').addEventListener('input', agendarAutoSalvar);
    $('tab-config').addEventListener('change', agendarAutoSalvar);
    $('cfgExportar').addEventListener('click', exportar);
    $('cfgImportar').addEventListener('click', function () { $('cfgArquivo').click(); });
    $('cfgArquivo').addEventListener('change', function () { if (this.files[0]) importar(this.files[0]); this.value = ''; });
    $('cfgRestaurar').addEventListener('click', restaurar);
    $('cfgAddProduto').addEventListener('click', function () {
      lerCamposSimples();
      draft.produtos.push({ nome: 'Novo produto', custo: 0, capacidade: 1000, classe: Object.keys(draft.classes)[0] });
      renderProdutos();
      $('tab-config').dispatchEvent(new Event('change', { bubbles: true }));
    });
    document.querySelector('[data-cfg="dentro"]').addEventListener('input', function () {
      draft.dentro = Math.min(1, Math.max(0, (parseFloat(this.value) || 0) / 100)); atualizarFora();
    });
    $('gerarHash').addEventListener('click', function () {
      sha256($('novaSenha').value).then(function (h) { $('hashSaida').textContent = 'SENHA_HASH = \'' + h + '\''; })
        .catch(function (e) { $('hashSaida').textContent = 'Erro ao gerar hash: ' + e.message; });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('loginBtn').addEventListener('click', entrar);
    $('loginSenha').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
    if (autenticado()) mostrarApp(); else $('loginSenha').focus();
  });
})();

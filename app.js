/* =====================================================================
 * app.js — Interface da Calculadora MaisGlass
 * - Login por senha (hash SHA-256; ver SENHA_HASH)
 * - Aba Calculadora: entradas B4:B13 → saídas B14:B18 + detalhamento
 * - Aba Configurações: tudo que na planilha fica em VL 4+4 / Produtos /
 *   Config / DIFAL, salvo em localStorage, com exportar/importar/restaurar
 * ===================================================================== */
(function () {
  'use strict';

  /* Login: e-mail + senha por pessoa, validados no servidor (api/); sessão em cookie. Ver nuvem.js e PROJETO-NUVEM.md. */
  var STORAGE_KEY = 'glassmais.config.v1';

  var DEF = window.GM_DEFAULTS;
  var CALC = window.GM_CALC;
  var NUVEM = window.GM_NUVEM;
  var usuarioAtual = null;   // { id, email, nome, papel } depois do login
  function ehAdmin() { return !!usuarioAtual && usuarioAtual.papel === 'admin'; }
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

  /* ---------------- login (servidor) ---------------- */
  var senhaDigitada = '';
  function loginErro(msg) { var e = $('loginErro'); e.textContent = msg; e.classList.toggle('hidden', !msg); }
  function loginInfo(msg) { var e = $('loginInfo'); e.textContent = msg || ''; e.classList.toggle('hidden', !msg); }
  function mostrarLogin() {
    $('app').classList.add('hidden'); $('login').classList.remove('hidden');
    $('loginForm').classList.remove('hidden'); $('trocaSenhaForm').classList.add('hidden');
    loginInfo(''); $('loginBtn').disabled = false;
    setTimeout(function () { $('loginEmail').focus(); }, 0);
  }
  function entrar() {
    var email = $('loginEmail').value.trim(), senha = $('loginSenha').value;
    if (!email || !senha) { loginErro('Informe e-mail e senha.'); return; }
    loginErro(''); loginInfo('Entrando…'); $('loginBtn').disabled = true;
    NUVEM.login(email, senha).then(function (r) {
      senhaDigitada = senha; $('loginSenha').value = '';
      loginInfo(''); $('loginBtn').disabled = false;
      if (r.precisaTrocarSenha) { $('loginForm').classList.add('hidden'); $('trocaSenhaForm').classList.remove('hidden'); $('novaSenha1').focus(); return; }
      mostrarApp(r.usuario);
    }).catch(function (e) { loginInfo(''); $('loginBtn').disabled = false; loginErro(e.rede ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.' : e.message); });
  }
  function definirSenha() {
    var a = $('novaSenha1').value, b = $('novaSenha2').value;
    if (a.length < 8) { loginErro('A nova senha precisa ter pelo menos 8 caracteres.'); return; }
    if (a !== b) { loginErro('As duas senhas não conferem.'); return; }
    loginErro(''); loginInfo('Salvando…');
    NUVEM.trocarSenha(senhaDigitada, a).then(function () {
      senhaDigitada = ''; $('novaSenha1').value = ''; $('novaSenha2').value = ''; loginInfo('');
      return NUVEM.sessao();
    }).then(function (r) { if (r) mostrarApp(r.usuario); else mostrarLogin(); })
      .catch(function (e) { loginInfo(''); loginErro(e.message); });
  }
  function trocarMinhaSenha() {
    var atual = prompt('Senha atual:'); if (atual === null) return;
    var nova = prompt('Nova senha (mínimo 8 caracteres):'); if (nova === null) return;
    var nova2 = prompt('Repita a nova senha:'); if (nova2 === null) return;
    if (nova !== nova2) { alert('As duas senhas não conferem.'); return; }
    NUVEM.trocarSenha(atual, nova).then(function () { alert('Senha alterada. As outras máquinas onde você estava conectado vão pedir login de novo.'); })
      .catch(function (e) { alert('Não foi possível trocar a senha: ' + e.message); });
  }
  function sair() {
    concluirSalvarPendente();
    if (NUVEM.pendentes() > 0 && !confirm('Há ' + NUVEM.pendentes() + ' alteração(ões) ainda não enviada(s) ao servidor. Sair mesmo assim? (elas continuam guardadas neste computador e são enviadas no próximo login)')) return;
    NUVEM.logout().then(function () { location.reload(); });
  }
  function mostrarApp(usuario) {
    usuarioAtual = usuario;
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('hdrUsuario').textContent = (usuario.nome || usuario.email) + (usuario.papel === 'admin' ? ' · admin' : '');
    iniciarApp();
    aplicarPermissoes();
    iniciarNuvem();
  }
  function aplicarPermissoes() {
    var admin = ehAdmin();
    document.querySelector('nav.tabs button[data-tab="usuarios"]').classList.toggle('hidden', !admin);
    var cfg = $('tab-config');
    cfg.classList.toggle('somente-leitura', !admin);
    $('cfgSomenteLeitura').classList.toggle('hidden', admin);
    ['cfgSalvar', 'cfgImportar', 'cfgRestaurar', 'cfgAddProduto'].forEach(function (id) { var b = $(id); if (b) b.classList.toggle('hidden', !admin); });
    if (!admin) cfg.querySelectorAll('input, select, textarea, button.btn.danger, button.btn.small').forEach(function (i) { if (i.id !== 'cfgExportar' && !i.classList.contains('help')) i.disabled = true; });
  }

  /* ---------------- abas ---------------- */
  var ABAS = ['home', 'calc', 'revenda', 'nacional', 'orcamentos', 'config', 'usuarios'];
  var abaAtual = 'home';
  function mostrarAba(nome) {
    if (ABAS.indexOf(nome) < 0 || (nome === 'usuarios' && !ehAdmin())) nome = 'home';
    if (abaAtual === 'config' && nome !== 'config' && draft) lerCamposSimples(); // guarda o que foi digitado
    if (abaAtual === 'orcamentos' && nome !== 'orcamentos') concluirSalvarPendente();   // não perde edição pendente
    abaAtual = nome;
    fecharAjuda();
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === nome); });
    ABAS.forEach(function (a) { $('tab-' + a).classList.toggle('hidden', a !== nome); });
    try { sessionStorage.setItem('glassmais.aba', nome); } catch (e) { /* ignore */ }
    if (OPS[nome]) recalcularRevenda(OPS[nome]);
    if (nome === 'config') { if (!draft) draft = clone(config); renderConfig(); }
    if (nome === 'orcamentos') { if (orc) { renderCabecalhoOrc(); renderOrc(); } else renderListaOrc(); }
    if (nome === 'usuarios') renderUsuarios();
    if (ORIGEM_TAB && (nome === 'calc' || OPS[nome])) atualizarBotoesAdd();
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
        oque: 'Consumidor final não contribuinte (construtora, pessoa física, órgão público, empresa sem IE) ou contribuinte do ICMS que compra para revender ou industrializar (vidraçaria, serralheria, indústria com IE).',
        muda: 'Consumidor final fora de MG: DIFAL da UF de destino (alíquota interna − 4%) + FCP da UF (RJ 2%) somados ao preço, por cima do preço + taxa do cartão. Contribuinte que revende/industrializa: DIFAL e FCP zero — o cliente apura o ICMS dele. Dentro de MG não há DIFAL/FCP.',
        dica: 'Construtora = consumidor final, mesmo com CNPJ. Contribuinte que compra para uso próprio ou ativo (ex.: vidraçaria montando a própria loja) não é coberto: o DIFAL é dele, mas o IPI entra na base — fale com a contadoria.'
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
        muda: 'Define o ICMS da venda pelo regime especial: MG = 14% efetivo (18% − 4% de crédito); qualquer outra UF = 1,5%. Para consumidor final fora de MG soma o DIFAL da UF (alíquota interna − 4%; ex.: RJ 16%, SP 14%, ES 13%) e o FCP da UF (RJ 2%; UF sem FCP confirmado calcula com 0% e avisa). Tabelas em Configurações.',
        dica: 'Venda para MG não tem DIFAL/FCP, mas o ICMS é maior (14%); para fora de MG o ICMS é 1,5%, mas o consumidor final paga DIFAL + FCP. Se a UF aparecer "FCP não confirmado", peça o valor à contadoria e cadastre em Configurações.'
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
        oque: 'Consumidor final não contribuinte (construtora, pessoa física, órgão público, empresa sem IE) ou contribuinte do ICMS que compra para revender ou industrializar (com IE).',
        muda: 'Consumidor final: o IPI entra na base do ICMS (LC 87/96 art. 13 §2º) e, fora de MG, há DIFAL (interna do destino − interestadual) + FCP a recolher para a UF do cliente. Contribuinte que revende/industrializa: IPI fora da base, sem DIFAL/FCP (o cliente apura o ICMS dele).',
        dica: 'Construtora = consumidor final, mesmo com CNPJ. Contribuinte comprando para uso próprio ou ativo não é coberto (o DIFAL é dele, mas o IPI entra na base do ICMS) — fale com a contadoria.'
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
    },
    orc: {
      nome: { oque: 'Nome do cliente ou da obra. Aparece na lista de orçamentos e no cabeçalho da proposta impressa.', muda: 'Só identificação — não altera nenhum cálculo.', dica: 'Use o nome pelo qual você procura o cliente depois (ex.: "Construtora Horizonte — Ed. Solar").' },
      contato: { oque: 'Pessoa de contato, telefone ou e-mail do cliente (opcional).', muda: 'Só aparece na proposta impressa.', dica: 'Coloque quem aprova o orçamento do lado do cliente.' },
      uf: { oque: 'Estado onde a mercadoria é entregue e faturada. Vale para TODOS os itens do orçamento (um orçamento = um cliente, um destino).', muda: 'Define DIFAL, FCP e o ICMS de cada item: em MG venda interna (14% efetivo na importação direta; 18% nas demais), fora de MG interestadual + DIFAL/FCP para consumidor final. Mudar com itens já adicionados recalcula todos (o app mostra a diferença e pede confirmação).', dica: 'Se a entrega for em UF diferente do faturamento, o DIFAL é da UF de entrega — cenário não coberto na v1; use a UF de entrega e confirme com a contadoria.' },
      destinatario: { oque: 'Consumidor final não contribuinte (construtora, pessoa física, órgão público, empresa sem IE) ou contribuinte do ICMS que compra para revender ou industrializar (com IE).', muda: 'Consumidor final: DIFAL + FCP fora de MG e IPI na base do ICMS. Contribuinte que revende/industrializa: sem DIFAL/FCP, IPI fora da base (revenda/nacional). Vale para todos os itens; mudar recalcula.', dica: 'Construtora = consumidor final, mesmo com CNPJ. Contribuinte comprando para uso próprio/ativo não é coberto — fale com a contadoria.' },
      pagamento: { oque: 'À vista (PIX, boleto, transferência) ou parcelado no cartão. Vale para todos os itens.', muda: 'Parcelado acrescenta a taxa do cartão (MDR + 1,5% + 0,75% por parcela) ao valor pago em cada item e recalcula tudo.', dica: 'Simule à vista e parcelado e compare o "Total ao cliente" antes de fechar.' },
      bandeira: { oque: 'Bandeira do cartão quando o pagamento é parcelado.', muda: 'Muda o MDR aplicado em todos os itens.', dica: 'Visa/Master têm as menores taxas; Amex e Hipercard as maiores.' },
      parcelas: { oque: 'Número de parcelas (1 a 12) quando o pagamento é parcelado.', muda: 'Cada parcela soma 0,75% à taxa e muda a faixa do MDR; recalcula todos os itens.', dica: 'Mostre ao cliente a diferença de total entre 1x, 3x e 6x.' },
      validade: { oque: 'Por quantos dias a proposta vale.', muda: 'Só aparece na proposta impressa.', dica: 'Com dólar e frete oscilando, 7 a 15 dias é prudente; ao renovar, use "Recalcular" e uma nova revisão.' },
      prazo: { oque: 'Prazo de entrega combinado (texto livre).', muda: 'Só aparece na proposta impressa.', dica: 'Conte a partir da aprovação ou do pagamento do sinal — deixe isso escrito.' },
      dataPrevista: { oque: 'Data prevista da operação (opcional, informativa).', muda: 'Nada no cálculo. Serve para lembrar a vigência das regras (alíquotas, reforma tributária) quando a venda é para meses à frente.', dica: 'Preencha em orçamentos de obra longa; ao chegar a data, recalcule.' },
      inclusoFrete: { oque: 'O que a proposta declara como incluso no preço (frete, instalação, outros).', muda: 'Só o texto da proposta — não altera o cálculo. O custo do frete/instalação você lança em "Custos internos".', dica: 'Marque só o que está mesmo dentro do preço; o que for cobrado à parte fica de fora.' },
      inclusoTexto: { oque: 'Outras inclusões em texto livre (ex.: içamento, vedação).', muda: 'Só a proposta.', dica: 'Liste o que evita discussão na entrega.' },
      observacoes: { oque: 'Observações da proposta (condições comerciais, garantia, exclusões).', muda: 'Só a proposta; o padrão vem de Configurações → Padrões da proposta.', dica: 'Escreva o que não está incluso (ex.: "não inclui ART, andaime, retirada de vidros antigos").' },
      status: { oque: 'Etapa do orçamento: rascunho, enviado ao cliente, aprovado ou perdido.', muda: 'Enviado e aprovado travam cabeçalho, itens e custos (preserva a versão enviada e fixa os dados da empresa na proposta). Para alterar, "Nova revisão" cria a rev. seguinte como rascunho.', dica: 'Marque "Enviado" no momento em que mandar o PDF ao cliente.' }
    }
  };
  var helpBox = null, helpBtnAtivo = null;
  function textoAjuda(btn) {
    var sec = btn.closest('section'), tab = sec ? sec.id : '';
    var op = tab === 'tab-calc' ? 'imp' : (tab === 'tab-nacional' ? 'nac' : (tab === 'tab-orcamentos' ? 'orc' : 'rev'));
    var chave = btn.getAttribute('data-help');
    if (op === 'orc') return AJUDA.orc[chave] || null;
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
    document.querySelectorAll('#tab-calc .field, #tab-revenda .field, #tab-orcamentos .field').forEach(function (f) {
      var ctl = f.querySelector('input[id], select[id]'), label = f.querySelector('label');
      if (!ctl || !label) return;
      var chave = ctl.id.replace(/^(in|r|o)-/, '');
      var orcTab = !!f.closest('#tab-orcamentos');
      if (orcTab ? !AJUDA.orc[chave] : (!AJUDA.imp[chave] && !AJUDA.rev[chave])) return;
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
    ['(−) IRPJ + CSLL (estimativa: 34% marginal | presumido 25%+9% sobre 8%/12%)', 'irpjCsll'],
    ['= Lucro líquido da operação', 'lucroLiquido', 'final']
  ];
  var DRE_LINHAS_IMPORTACAO = [
    ['Receita bruta (preço final ao cliente)', 'receitaBruta'],
    ['(−) DIFAL + FCP', 'difalFcp', 'sub'],
    ['(−) ICMS (alíquota efetiva do regime especial)', 'icms', 'sub'],
    ['(−) PIS/COFINS (real: líquidos dos créditos da importação)', 'pisCofins', 'sub'],
    ['= Receita líquida', 'receitaLiquida', 'total'],
    ['(−) CMV (custo do vidro: importação + despesas)', 'cmv'],
    ['= Lucro bruto', 'lucroBruto', 'total'],
    ['(−) Frete', 'frete', 'sub'],
    ['(−) Taxa do cartão', 'cartao', 'sub'],
    ['= Lucro operacional (= "Lucro" da planilha)', 'lucroOperacional', 'total'],
    ['(−) IRPJ + CSLL (estimativa: 34% marginal | presumido 25%+9% sobre 8%/12%)', 'irpjCsll'],
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
    tb.appendChild(el('tr', { class: 'sub' }, [el('td', { text: 'Margem líquida (sobre a receita líquida)' }), el('td', { text: pctNa(a.margemLiquida) }), el('td', { text: pctNa(b.margemLiquida) })]));
    tb.appendChild(el('tr', { class: 'sub' }, [el('td', { text: 'Lucro líquido sobre o valor pago pelo cliente' }), el('td', { text: pctNa(a.margemSobreValorPago) }), el('td', { text: pctNa(b.margemSobreValorPago) })]));
    tb.appendChild(el('tr', { class: 'sub' }, [el('td', { text: rotuloTributos || 'Tributos totais líquidos (ICMS, IPI, PIS/COFINS, DIFAL/FCP, IRPJ/CSLL)' }), el('td', { text: brl(a.tributosTotais) }), el('td', { text: brl(b.tributosTotais) })]));
    t.appendChild(tb);
  }
  function renderHeroDre(prefix, dR, dP) {
    $(prefix + 'liqReal').textContent = brl(dR.lucroLiquido);
    $(prefix + 'liqRealSub').textContent = pctNa(dR.margemSobreValorPago) + ' do valor pago · IRPJ/CSLL ' + brl(dR.irpjCsll);
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
    try { r = CALC.calcularImportacao(config, inp); }   // calcular() da planilha + FCP (set/2026); ver calc.js
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
    $('out-fcpPct').textContent = pct(r.fcpPct, 1) + (r.fcpConfirmado ? '' : ' (não confirmado)');
    $('out-fcp').textContent = brl(r.fcp);
    $('out-difal2').textContent = brl(r.difal + r.fcp);

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
    (r.avisos || []).forEach(function (n) { $('out-notas').appendChild(el('p', { class: 'warn', text: n })); });
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
      { nome: 'DIFAL + FCP', sub: r.difalPct + r.fcpPct > 0 ? pct(r.difalPct, 1) + ' + ' + pct(r.fcpPct, 1) + ' (não contribuinte)' : 'não se aplica', valor: r.difal + r.fcp },
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
    NUVEM.configAlterada();
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
    NUVEM.configAlterada();
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
      try { var j = JSON.parse(fr.result); if (j && j.tipo === 'maisglass-backup') { if (!j.config) throw new Error('o arquivo de cópia de segurança não traz configuração.'); j = j.config; } candidato = normalizarConfig(j); }
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

  /* =====================================================================
   * Módulo Orçamentos (interface) — motor em orcamento.js (GM_ORC)
   * Lista + editor: cabeçalho manda nos itens; itens congelados; premissas e configuração congeladas por
   * orçamento; custos internos só na DRE; proposta impressa; salvo em localStorage (glassmais.orcamentos.v1).
   * ===================================================================== */
  var ORC = window.GM_ORC;
  var ORC_KEY = 'glassmais.orcamentos.v1';
  var orcamentos = [];            // lista carregada nesta aba
  var orc = null;                 // orçamento aberto ("atual") — referência ao objeto da lista
  var orcTimer = null;
  var orcGravadoEm = {};          // id → atualizadoEm conhecido por esta aba (detecção de gravação em outra aba)
  var naoSalvos = {};             // id → objeto alterado nesta aba e ainda NÃO gravado (autosave pendente, gravação falhou ou conflito recusado): preservado na sincronização (parecer nº 4, achado 3)
  var itemEmEdicao = null;        // { orcId, itemId, origem } após "Carregar na calculadora"
  var ORIGEM_ROTULO = { importacao: 'Importação', revenda: 'Revenda', nacional: 'Nacional' };
  var ORIGEM_TAB = { importacao: 'calc', revenda: 'revenda', nacional: 'nacional' };
  var ORIGEM_CLASSE = { importacao: 'imp', revenda: 'rev', nacional: 'nac' };
  var TIPO_CUSTO_ROTULO = { transporteProprio: 'Transporte próprio (frota)', freteContratado: 'Frete contratado (terceiros)', instalacao: 'Instalação', comissao: 'Comissão', outros: 'Outros' };
  var STATUS_ROTULO = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', perdido: 'Perdido' };
  var DRE_LINHAS_ORCAMENTO = [
    ['Receita bruta (total pago pelo cliente, todos os itens)', 'receitaBruta'],
    ['(−) IPI destacado (revenda/nacional; importação direta não destaca — pendente)', 'ipi', 'sub'],
    ['(−) ICMS próprio: débito (revenda/nacional) · efetivo do regime especial (importação direta)', 'icms', 'sub'],
    ['(−) DIFAL + FCP', 'difalFcp', 'sub'],
    ['(−) PIS/COFINS (débitos cheios; créditos vão no CMV)', 'pisCofins', 'sub'],
    ['= Receita líquida', 'receitaLiquida', 'total'],
    ['(−) CMV (mercadoria líquida dos créditos)', 'cmv'],
    ['= Lucro bruto', 'lucroBruto', 'total'],
    ['(−) Frete cobrado na NF (itens)', 'frete', 'sub'],
    ['(−) Taxa do cartão (itens)', 'cartao', 'sub'],
    ['(−) Custos internos do orçamento', 'custosInternos', 'sub'],
    ['= Lucro operacional (antes de IRPJ/CSLL)', 'lucroOperacional', 'total'],
    ['(−) IRPJ + CSLL (real: 34% sobre o lucro consolidado · presumido: soma dos itens)', 'irpjCsll'],
    ['= Lucro líquido do orçamento', 'lucroLiquido', 'final']
  ];

  function orcStatus(msg, cls) { var s = $('orcStatus'); s.textContent = msg; s.className = 'status ' + (cls || ''); }
  function orcListaStatus(msg, cls) { var s = $('orcListaStatus'); s.textContent = msg; s.className = 'status ' + (cls || ''); }
  function dataHora(iso) { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso || ''; } }
  function dataCurta(iso) { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch (e) { return iso || ''; } }
  function orcNome(o) { return (o && o.cliente && o.cliente.nome) ? o.cliente.nome : 'sem nome'; }
  function orcNumero(o) { return o.id.slice(-6).toUpperCase() + (o.revisao > 1 ? '-r' + o.revisao : ''); }
  function orcTravado() { return !!orc && ORC.emitido(orc); }   // emitido (enviado/aprovado/perdido após emissão): só nova revisão altera
  function pctNa(v, dec) { return (v === null || v === undefined || !isFinite(v)) ? 'n/a' : pct(v, dec === undefined ? 1 : dec); }
  function configDifereDoSnapshot(o) { return JSON.stringify(o.configSnapshot) !== JSON.stringify(config); }

  /* ---------- persistência ----------
   * Regras (parecer nº 3, achado 2): cada gravação relê o disco e substitui SÓ o orçamento alterado (ou remove só o
   * excluído); os demais ficam como estão no disco, nunca sobrescritos pela cópia em memória desta aba. Antes de
   * gravar, o orçamento alterado é comparado com a versão do disco (atualizadoEm conhecido por esta aba) e um
   * conflito pede confirmação. Depois de gravar, a lista em memória é ressincronizada com o disco. O evento
   * "storage" avisa quando outra aba grava. Limite conhecido: a leitura-modificação-gravação é síncrona e curta,
   * mas não há um lock entre abas — duas gravações no mesmo milissegundo ainda podem colidir. */
  function lerStorageOrc() { try { var raw = localStorage.getItem(ORC_KEY); var l = raw ? JSON.parse(raw) : []; return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function normalizarOrcDisco(o) {
    try { var m = ORC.migrarOrcamento(o); var e = ORC.validarOrcamento(m); if (e.length) { console.warn('Orçamento inválido ignorado', o && o.id, e); return null; } return m; }
    catch (err) { console.warn('Orçamento ignorado', err); return null; }
  }
  /* Reconstrói a lista em memória a partir de uma lista do disco, preservando o objeto do orçamento aberto */
  function sincronizarListaOrc(disco) {
    var nova = [], vistos = {};
    disco.forEach(function (x) {
      if (!x || !x.id || vistos[x.id]) return; vistos[x.id] = true;
      if (orc && x.id === orc.id) { nova.push(orc); return; }      // o aberto mantém o atualizadoEm que ESTA aba conhece: é isso que detecta o conflito
      if (naoSalvos[x.id]) { nova.push(naoSalvos[x.id]); return; } // edição desta aba ainda não gravada nunca é substituída pela versão do disco
      var m = normalizarOrcDisco(x); if (!m) return;
      nova.push(m); orcGravadoEm[m.id] = m.atualizadoEm;
    });
    if (orc && !vistos[orc.id]) nova.unshift(orc);          // aberto nesta aba, mas ainda não gravado (ou excluído em outra aba: fica em memória até salvar/fechar)
    Object.keys(naoSalvos).forEach(function (id) { if (!vistos[id] && !(orc && orc.id === id)) nova.unshift(naoSalvos[id]); });   // não salvo que sumiu do disco (excluído em outra aba) continua recuperável
    orcamentos = nova;
  }
  function marcarNaoSalvo(o) { if (o && o.id) naoSalvos[o.id] = o; }
  function limparNaoSalvo(id) { delete naoSalvos[id]; }
  function temNaoSalvos() { return Object.keys(naoSalvos).length > 0; }
  function carregarOrcamentos() { orcamentos = []; orcGravadoEm = {}; sincronizarListaOrc(lerStorageOrc()); }
  /* Estado "ausente do disco" como alvo de uma decisão confirmada (recriação após exclusão em outra aba) */
  var AUSENTE = ' ausente';
  function gravarOrcamentos(oAlterado, excluirId, confirmadoPara) {
    var disco = lerStorageOrc();
    if (oAlterado) {
      // Conflito: a decisão do usuário vale só para o ESTADO do disco que ele viu (a versão de atualizadoEm, ou "ausente").
      // Enquanto o diálogo fica aberto, outra aba pode gravar — e o navegador só aplica essas gravações ao cache desta aba
      // quando a thread fica livre. Por isso NENHUMA decisão grava na hora: toda confirmação agenda a gravação para a PRÓXIMA
      // volta do event loop (agendarGravacaoAdiada), que relê o disco e chama esta função de novo com confirmadoPara = estado
      // confirmado. Se o estado continua o mesmo, grava sobre a lista relida (os demais ids vêm dela); se mudou, a decisão é
      // reavaliada com novo diálogo (parecer nº 4, achado 2; parecer nº 6, achado 1). Recusar cancela qualquer gravação
      // confirmada ainda pendente deste id — a decisão mais recente vence (parecer nº 6, achado 2). A comparação de versão
      // é de identidade (diferente da conhecida), não de ordem cronológica textual.
      var noDisco = disco.filter(function (x) { return x && x.id === oAlterado.id; })[0];
      var base = orcGravadoEm[oAlterado.id];
      if (noDisco && base && noDisco.atualizadoEm !== base && noDisco.atualizadoEm !== confirmadoPara) {
        var visto = noDisco.atualizadoEm;
        if (!confirm('O orçamento "' + orcNome(oAlterado) + '" foi alterado em outra aba do navegador (' + dataHora(visto) + '). Sobrescrever com a versão desta aba?')) {
          cancelarGravacaoAdiada(oAlterado.id); marcarNaoSalvo(oAlterado);
          orcStatus('Não salvo — outra aba alterou este orçamento. Recarregue a página para ver a versão dela, ou exporte o JSON para guardar esta.', 'err'); return false;
        }
        marcarNaoSalvo(oAlterado);
        orcStatus('Confirmado — gravando…', '');
        agendarGravacaoAdiada(oAlterado, excluirId, visto);
        return false;                                            // ainda não gravado: quem chamou trata como pendente
      }
      if (!noDisco && confirmadoPara && confirmadoPara !== AUSENTE) {
        // A decisão valia para uma versão; entre o diálogo e esta releitura o orçamento sumiu do disco (excluído em outra
        // aba). Gravar agora recriaria um orçamento que outra aba acabou de excluir — nova decisão, também adiada.
        if (!confirm('O orçamento "' + orcNome(oAlterado) + '" foi excluído em outra aba enquanto você confirmava. Gravar mesmo assim (ele volta para a lista)?')) {
          cancelarGravacaoAdiada(oAlterado.id); marcarNaoSalvo(oAlterado);
          orcStatus('Não salvo — o orçamento foi excluído em outra aba. Ele continua nesta tela; exporte o JSON para guardar.', 'err'); return false;
        }
        marcarNaoSalvo(oAlterado);
        orcStatus('Confirmado — gravando…', '');
        agendarGravacaoAdiada(oAlterado, excluirId, AUSENTE);
        return false;
      }
      if (noDisco && confirmadoPara && noDisco.atualizadoEm === confirmadoPara) orcGravadoEm[oAlterado.id] = confirmadoPara;   // decisão continua válida
      oAlterado.atualizadoEm = new Date().toISOString();
    }
    var lista = disco.filter(function (x) { return x && x.id && x.id !== excluirId; });
    if (oAlterado) {
      var idx = -1; lista.forEach(function (x, i) { if (x.id === oAlterado.id) idx = i; });
      if (idx >= 0) lista[idx] = oAlterado; else lista.unshift(oAlterado);
    }
    var texto;
    try { texto = JSON.stringify(lista); localStorage.setItem(ORC_KEY, texto); }
    catch (e) { if (oAlterado) marcarNaoSalvo(oAlterado); orcStatus('Não foi possível salvar (armazenamento cheio ou bloqueado) — exporte o JSON para não perder.', 'err'); return false; }
    if (oAlterado) { orcGravadoEm[oAlterado.id] = oAlterado.atualizadoEm; limparNaoSalvo(oAlterado.id); cancelarGravacaoAdiada(oAlterado.id); }   // gravação concluída supera qualquer decisão pendente deste id
    if (excluirId) limparNaoSalvo(excluirId);
    sincronizarListaOrc(lista);
    if (oAlterado) NUVEM.alterado(oAlterado.id, confirmadoPara === AUSENTE ? { recriarConfirmado: true } : undefined);   // 2º estágio: envio ao servidor (nuvem.js)
    if (excluirId) NUVEM.excluido(excluirId);
    if (texto.length > 4 * 1024 * 1024) orcStatus('Atenção: os orçamentos ocupam ' + Math.round(texto.length / 1024 / 1024 * 10) / 10 + ' MB (limite ≈ 5 MB). Exporte e exclua orçamentos antigos.', 'err');
    return true;
  }
  /* Gravações confirmadas pendentes (adiadas para a próxima volta do event loop), UMA por orçamento: id → { timer, geracao }.
   * O registro representa a validade da DECISÃO mais recente sobre aquele id: agendar outra gravação do mesmo id cancela a
   * anterior e avança a geração; recusar um novo diálogo ou excluir o orçamento cancela e invalida a pendente. Ao executar,
   * o callback confere que ainda é a gravação vigente daquele id e que o objeto continua vivo nesta aba — um callback
   * superado ou cancelado nunca grava (parecer nº 5, achado 2; parecer nº 6, achado 2). */
  var gravacoesAdiadas = {};
  var geracaoGravacao = {};
  function orcVivo(o) { return !!o && (orcamentos.indexOf(o) >= 0 || orc === o || naoSalvos[o.id] === o); }
  function agendarGravacaoAdiada(oAlterado, excluirId, visto) {
    var id = oAlterado.id;
    cancelarGravacaoAdiada(id);
    var reg = { geracao: (geracaoGravacao[id] || 0) + 1, timer: null };
    geracaoGravacao[id] = reg.geracao;
    reg.timer = setTimeout(function () {
      if (gravacoesAdiadas[id] !== reg || geracaoGravacao[id] !== reg.geracao) return;   // superada ou cancelada
      delete gravacoesAdiadas[id];
      if (!orcVivo(oAlterado)) return;                                                     // objeto já descartado nesta aba (excluído)
      if (gravarOrcamentos(oAlterado, excluirId, visto)) orcStatus('Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + (visto === AUSENTE ? ' (recriado após a exclusão em outra aba).' : ' (sobrescreveu a versão da outra aba).'), 'ok');
      if (!orc) renderListaOrc();
    }, 60);
    gravacoesAdiadas[id] = reg;
  }
  function cancelarGravacaoAdiada(id) {
    var reg = gravacoesAdiadas[id]; if (!reg) return false;
    clearTimeout(reg.timer); delete gravacoesAdiadas[id];
    geracaoGravacao[id] = reg.geracao + 1;                                                 // callback já enfileirado vê a geração superada
    return true;
  }

  /* Autosave amarrado ao objeto editado: trocar de orçamento ou de tela conclui o pendente antes (parecer nº 3, achado 4) */
  var orcPendente = null;
  function agendarSalvarOrc() {
    if (!orc) return;
    clearTimeout(orcTimer); orcPendente = orc; marcarNaoSalvo(orc);
    orcTimer = setTimeout(function () { orcTimer = null; var alvo = orcPendente; orcPendente = null; if (alvo) salvarOrc(alvo); }, 500);
  }
  function concluirSalvarPendente() {
    if (!orcTimer) return true;
    clearTimeout(orcTimer); orcTimer = null;
    var alvo = orcPendente; orcPendente = null;
    return alvo ? salvarOrc(alvo) : true;
  }
  function salvarOrc(o) {
    if (!o) return false;
    if (o === orc) lerCabecalhoTexto();
    var erros = ORC.validarOrcamento(o);
    if (erros.length) { marcarNaoSalvo(o); orcStatus('Não salvo — ' + erros.slice(0, 3).join(' '), 'err'); return false; }
    if (!gravarOrcamentos(o)) return false;
    orcStatus('Salvo automaticamente às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.', 'ok');
    return true;
  }
  function salvarOrcAtual() { clearTimeout(orcTimer); orcTimer = null; orcPendente = null; return salvarOrc(orc); }

  /* ---------- navegação lista ↔ editor ---------- */
  function novoOrc() {
    concluirSalvarPendente();
    var o = ORC.novoOrcamento(config, { nome: '', uf: 'RJ', destinatario: 'consumidorFinal' });
    orcamentos.unshift(o);
    var ok = gravarOrcamentos(o);
    abrirOrc(o.id);
    if (ok) orcStatus('Novo orçamento criado — preencha o cliente e adicione itens pelas calculadoras.', 'ok');
    $('o-nome').focus();
  }
  function abrirOrc(id) {
    if (orc && orc.id !== id) concluirSalvarPendente();
    orc = orcamentos.filter(function (o) { return o.id === id; })[0] || null;
    if (!orc) { mostrarListaOrc(); return; }
    try { sessionStorage.setItem('glassmais.orcAtual', id); } catch (e) { /* ignore */ }
    if (itemEmEdicao && itemEmEdicao.orcId !== id) itemEmEdicao = null;
    $('orc-lista').classList.add('hidden'); $('orc-editor').classList.remove('hidden');
    renderCabecalhoOrc(); renderOrc(); atualizarBotoesAdd();
  }
  function mostrarListaOrc() {
    var ok = concluirSalvarPendente();
    orc = null; itemEmEdicao = null;
    if (!ok) { try { sessionStorage.removeItem('glassmais.orcAtual'); } catch (e) { /* ignore */ } $('orc-editor').classList.add('hidden'); $('orc-lista').classList.remove('hidden'); renderListaOrc(); atualizarBotoesAdd(); orcListaStatus('A última alteração NÃO foi gravada (veja a mensagem no editor). O orçamento continua nesta aba marcado "não salvo" — abra e tente salvar de novo, ou exporte o JSON.', 'err'); return; }
    try { sessionStorage.removeItem('glassmais.orcAtual'); } catch (e) { /* ignore */ }
    $('orc-editor').classList.add('hidden'); $('orc-lista').classList.remove('hidden');
    renderListaOrc(); atualizarBotoesAdd();
  }
  function renderListaOrc() {
    var wrap = $('orc-tabela'); wrap.innerHTML = '';
    if (!orcamentos.length) { wrap.appendChild(el('p', { class: 'hint', text: 'Nenhum orçamento ainda. Clique em "Novo orçamento" ou importe um JSON.' })); return; }
    var linhas = orcamentos.slice().sort(function (a, b) { return (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''); }).map(function (o) {
      var total = '—', liq = '—', n = o.itens.length;
      try { var c = ORC.consolidar(o); total = brl(c.totais.totalCliente); liq = brl(c.real.lucroLiquido); } catch (e) { /* mostra traço */ }
      var abrir = el('button', { class: 'btn small primary', text: 'Abrir', onclick: function () { abrirOrc(o.id); } });
      var excluir = el('button', { class: 'btn small danger', text: 'Excluir', onclick: function () { excluirOrc(o.id); } });
      var nomeCel = el('td', {}, [el('strong', { text: orcNome(o) }), el('small', { text: ' nº ' + orcNumero(o), style: 'color:var(--muted)' })]);
      if (naoSalvos[o.id]) nomeCel.appendChild(el('span', { class: 'tag st-perdido', text: 'não salvo', style: 'margin-left:6px', title: 'Alteração desta aba ainda não gravada — abra e salve, ou exporte o JSON' }));
      var sinc = NUVEM.estadoDe(o.id), meta = NUVEM.metaDe(o.id);
      var BADGE = { pendente: ['st-pend', 'enviando…', 'Alteração deste computador ainda não confirmada pelo servidor'], conflito: ['st-conf', 'conflito', 'Outra máquina alterou este orçamento — abra para decidir qual versão vale'],
        'excluido-remoto': ['st-conf', 'excluído em outra máquina', 'Abra para decidir: recriar ou remover deste computador'], erro: ['st-conf', 'não aceito pelo servidor', 'Abra para ver o motivo'], local: ['st-local', 'só neste computador', 'Ainda não enviado à nuvem — use "Enviar para a nuvem" acima'] };
      if (BADGE[sinc]) nomeCel.appendChild(el('span', { class: 'tag ' + BADGE[sinc][0], text: BADGE[sinc][1], style: 'margin-left:6px', title: BADGE[sinc][2] }));
      return el('tr', {}, [
        nomeCel,
        el('td', { text: 'rev. ' + o.revisao }),
        el('td', {}, [document.createTextNode(dataHora(o.atualizadoEm)), meta && meta.atualizadoPor ? el('small', { text: ' por ' + meta.atualizadoPor, style: 'color:var(--muted);display:block' }) : document.createTextNode('')]),
        el('td', { text: String(n), style: 'text-align:right' }),
        el('td', { text: total, style: 'text-align:right;font-variant-numeric:tabular-nums' }),
        el('td', { text: liq, style: 'text-align:right;font-variant-numeric:tabular-nums' }),
        el('td', {}, [el('span', { class: 'tag st-' + o.status, text: STATUS_ROTULO[o.status] || o.status })]),
        el('td', { class: 'acoes' }, [abrir, ' ', excluir])
      ]);
    });
    wrap.appendChild(el('table', { class: 'lista' }, [
      el('thead', {}, [el('tr', {}, ['Cliente', 'Revisão', 'Atualizado', 'Itens', 'Total ao cliente', 'Lucro líq. (real)', 'Status', ''].map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', {}, linhas)
    ]));
    if (temNaoSalvos()) orcListaStatus('Há orçamento(s) com alteração não gravada nesta aba (marcados "não salvo"): abra e salve, ou exporte o JSON antes de fechar a página.', 'err');
    renderMigracao();
  }
  function renderMigracao() {
    var card = $('orc-migracao'); if (!card) return;
    var locais = NUVEM.carregou() ? NUVEM.locaisNaoEnviados() : [];
    card.classList.toggle('hidden', !locais.length);
    if (!locais.length) return;
    $('orc-migracao-texto').textContent = locais.length + ' orçamento(s) deste navegador ainda não estão na nuvem (' + locais.slice(0, 5).map(orcNome).join(', ') + (locais.length > 5 ? '…' : '') + '). Clique para enviar — eles passam a aparecer em todos os computadores. Se algum já existir no servidor com conteúdo diferente, ele entra como cópia.';
  }
  function migrarLocais() {
    var b = $('orcMigrar'); b.disabled = true; var st = $('orcMigracaoStatus'); st.textContent = 'Enviando…'; st.className = 'status';
    NUVEM.migrarLocais().then(function (r) {
      var n = { criado: 0, igual: 0, renomeado: 0, invalido: 0 }; r.resultado.forEach(function (x) { n[x.status] = (n[x.status] || 0) + 1; });
      st.textContent = 'Enviados: ' + n.criado + ' novo(s), ' + n.igual + ' já existente(s), ' + n.renomeado + ' como cópia' + (n.invalido ? ', ' + n.invalido + ' recusado(s) (inválidos)' : '') + '.'; st.className = 'status ok';
      b.disabled = false; sincronizarListaOrc(lerStorageOrc()); renderListaOrc();
    }).catch(function (e) { b.disabled = false; st.textContent = 'Não foi possível enviar: ' + e.message; st.className = 'status err'; });
  }

  /* ---------- cabeçalho ---------- */
  function preencherSelectsOrc() {
    var selU = $('o-uf'); var atual = selU.value; selU.innerHTML = '';
    Object.keys(config.difal).sort().forEach(function (uf) { selU.appendChild(el('option', { value: uf, text: uf })); });
    if (atual && config.difal[atual]) selU.value = atual;
    var selB = $('o-bandeira'); var atualB = selB.value; selB.innerHTML = '';
    Object.keys(config.cartao.mdr).forEach(function (b) { selB.appendChild(el('option', { value: b, text: b })); });
    if (atualB && config.cartao.mdr[atualB]) selB.value = atualB;
  }
  function renderCabecalhoOrc() {
    preencherSelectsOrc();
    var c = orc.cliente, cd = orc.condicoes;
    $('o-nome').value = c.nome || ''; $('o-contato').value = c.contato || '';
    $('o-uf').value = c.uf; $('o-destinatario').value = c.destinatario;
    $('o-pagamento').value = cd.pagamento; $('o-bandeira').value = cd.bandeira || 'Visa'; $('o-parcelas').value = cd.parcelas || 1;
    $('o-validade').value = cd.validadeDias; $('o-prazo').value = cd.prazoEntrega || '';
    $('o-dataPrevista').value = cd.dataPrevista || '';
    $('o-inclusoFrete').checked = !!(cd.inclusos && cd.inclusos.frete); $('o-inclusoInstalacao').checked = !!(cd.inclusos && cd.inclusos.instalacao);
    $('o-inclusoTexto').value = (cd.inclusos && cd.inclusos.texto) || ''; $('o-observacoes').value = cd.observacoes || '';
    $('o-status').value = orc.status;
    var parcelado = cd.pagamento === 'Parcelado';
    $('o-bandeira').disabled = !parcelado; $('o-parcelas').disabled = !parcelado;
    aplicarTravaOrc();
  }
  function aplicarTravaOrc() {
    var travado = orcTravado();
    document.querySelectorAll('#orc-cabecalho input, #orc-cabecalho select').forEach(function (i) {
      if (i.id === 'o-status') return;
      if (i.id === 'o-bandeira' || i.id === 'o-parcelas') { i.disabled = travado || orc.condicoes.pagamento !== 'Parcelado'; return; }
      i.disabled = travado;
    });
    // status: uma vez emitido nunca volta a rascunho; enviado → aprovado/perdido; aprovado → perdido; perdido é final. Para editar, "Nova revisão"
    var st = $('o-status');
    var permitidos = { rascunho: ['rascunho', 'enviado', 'aprovado', 'perdido'], enviado: ['enviado', 'aprovado', 'perdido'], aprovado: ['aprovado', 'perdido'], perdido: ['perdido'] }[orc.status] || ['rascunho'];
    Array.prototype.forEach.call(st.options, function (op) { op.disabled = permitidos.indexOf(op.value) < 0; });
    $('orcAddCusto').disabled = travado;
    $('orcRecalcular').disabled = travado;
    var banner = $('orc-travado');
    banner.classList.toggle('hidden', !travado);
    if (travado) banner.textContent = 'Proposta emitida em ' + dataHora(orc.emitidoEm) + ' (status: ' + STATUS_ROTULO[orc.status].toLowerCase() + (orc.emissaoOrigem && orc.emissaoOrigem.indexOf('migracao') === 0 ? '; marco recuperado na migração — ' + orc.emissaoOrigem.replace(/^migracao:/, '') : '') + '): cabeçalho, itens, custos e dados da empresa ficam congelados para preservar a versão enviada. Para alterar, use "Nova revisão".';
    renderConflitoOrc(); renderAutoriaOrc();
  }
  /* Conflito com outra máquina (nuvem.js): decisão explícita, sem loop de diálogos */
  function renderConflitoOrc() {
    var box = $('orc-conflito'); if (!box || !orc) return;
    var c = NUVEM.conflito(orc.id);
    box.classList.toggle('hidden', !c); box.innerHTML = '';
    if (!c) return;
    var id = orc.id;
    function decidir(decisao) {
      NUVEM.resolverConflito(id, decisao).then(function () {
        if (decisao === 'servidor') {
          // descarta a cópia desta aba: autosave pendente, gravação adiada e "não salvo"; a lista é refeita do disco (já com a versão do servidor)
          clearTimeout(orcTimer); orcTimer = null; orcPendente = null; cancelarGravacaoAdiada(id); limparNaoSalvo(id);
          orc = null;
          sincronizarListaOrc(lerStorageOrc());
          var novo = orcamentos.filter(function (o) { return o.id === id; })[0];
          if (!novo) { mostrarListaOrc(); orcListaStatus('Orçamento removido deste computador (estava excluído no servidor).', 'ok'); return; }
          abrirOrc(id); orcStatus('Versão do servidor carregada.', 'ok');
        } else { renderOrc(); orcStatus('Sua versão está sendo enviada ao servidor…', ''); }
      });
    }
    if (c.tipo === 'versao') {
      box.appendChild(el('p', {}, [el('strong', { text: 'Conflito: ' }), document.createTextNode('este orçamento foi alterado por ' + (c.atualizadoPor || 'outra pessoa') + ' em ' + dataHora(c.atualizadoEm) + ' em outra máquina, e esta máquina tem uma versão diferente. Qual vale?')]));
      box.appendChild(el('button', { class: 'btn small primary', text: 'Enviar a minha versão (sobrescreve a do servidor)', onclick: function () { decidir('minha'); } }));
      box.appendChild(el('button', { class: 'btn small', text: 'Usar a versão do servidor (descarta a minha)', onclick: function () { if (confirm('A versão deste computador será substituída pela do servidor. Continuar?')) decidir('servidor'); } }));
      box.appendChild(el('p', { class: 'hint', text: 'Dica: "Exportar JSON" antes de decidir guarda a sua versão num arquivo.' }));
    } else if (c.tipo === 'excluido') {
      box.appendChild(el('p', {}, [el('strong', { text: 'Excluído em outra máquina: ' }), document.createTextNode('por ' + (c.excluidoPor || 'outra pessoa') + ' em ' + dataHora(c.excluidoEm) + '. Esta cópia continua aqui.')]));
      box.appendChild(el('button', { class: 'btn small primary', text: 'Recriar no servidor com esta versão', onclick: function () { decidir('minha'); } }));
      box.appendChild(el('button', { class: 'btn small danger', text: 'Remover deste computador também', onclick: function () { if (confirm('Remover este orçamento deste computador?')) decidir('servidor'); } }));
    } else {
      box.appendChild(el('p', {}, [el('strong', { text: 'Não aceito pelo servidor: ' }), document.createTextNode(c.mensagem || 'erro')]));
      box.appendChild(el('button', { class: 'btn small primary', text: 'Tentar enviar de novo', onclick: function () { decidir('minha'); } }));
    }
  }
  function renderAutoriaOrc() {
    var p = $('orc-autoria'); if (!p || !orc) return;
    var m = NUVEM.metaDe(orc.id);
    p.textContent = m ? ('Criado por ' + (m.criadoPor || '—') + (m.criadoEm ? ' em ' + dataHora(m.criadoEm) : '') + ' · última gravação no servidor por ' + (m.atualizadoPor || '—') + ' em ' + dataHora(m.atualizadoEm) + ' (versão ' + m.versao + ')') : 'Ainda não enviado ao servidor.';
  }
  /* campos de texto/condições que não mudam o cálculo */
  function lerCabecalhoTexto() {
    orc.cliente.nome = $('o-nome').value.trim(); orc.cliente.contato = $('o-contato').value.trim();
    var v = parseInt($('o-validade').value, 10); orc.condicoes.validadeDias = isFinite(v) && v >= 0 ? v : 0;
    orc.condicoes.prazoEntrega = $('o-prazo').value.trim();
    orc.condicoes.dataPrevista = $('o-dataPrevista').value || null;
    orc.condicoes.inclusos = { frete: $('o-inclusoFrete').checked, instalacao: $('o-inclusoInstalacao').checked, texto: $('o-inclusoTexto').value.trim() };
    orc.condicoes.observacoes = $('o-observacoes').value;
  }
  /* campos que valem para todos os itens: UF, destinatário, pagamento, bandeira, parcelas → recalcula tudo (atômico) */
  function lerCabecalhoFiscal() {
    return { uf: $('o-uf').value, destinatario: $('o-destinatario').value, pagamento: $('o-pagamento').value,
      bandeira: $('o-bandeira').value || orc.condicoes.bandeira, parcelas: Math.max(1, Math.min(12, parseInt($('o-parcelas').value, 10) || 1)) };
  }
  function onCabecalhoFiscal() {
    var novo = lerCabecalhoFiscal();
    var atual = ORC.cabecalhoDe(orc);
    var mudou = JSON.stringify(novo) !== JSON.stringify(atual);
    if (!mudou) return;
    if (orc.itens.length) {
      var recalc;
      try { recalc = recalcularItens(orc.configSnapshot, novo); }
      catch (e) { orcStatus('Alteração desfeita: ' + e.message, 'err'); renderCabecalhoOrc(); return; }
      var antes = ORC.consolidar(orc);
      var depois = ORC.consolidar(Object.assign({}, orc, { cliente: Object.assign({}, orc.cliente, { uf: novo.uf, destinatario: novo.destinatario }),
        condicoes: Object.assign({}, orc.condicoes, { pagamento: novo.pagamento, bandeira: novo.bandeira, parcelas: novo.parcelas }), itens: recalc }));
      var msg = 'Mudar o cabeçalho recalcula os ' + orc.itens.length + ' item(ns):\n' +
        'Total ao cliente: ' + brl(antes.totais.totalCliente) + ' → ' + brl(depois.totais.totalCliente) + '\n' +
        'Lucro líquido (real): ' + brl(antes.real.lucroLiquido) + ' → ' + brl(depois.real.lucroLiquido) + '\nAplicar?';
      if (!confirm(msg)) { renderCabecalhoOrc(); return; }
      orc.itens = recalc;
    }
    orc.cliente.uf = novo.uf; orc.cliente.destinatario = novo.destinatario;
    orc.condicoes.pagamento = novo.pagamento; orc.condicoes.bandeira = novo.bandeira; orc.condicoes.parcelas = novo.parcelas;
    renderCabecalhoOrc(); renderOrc(); salvarOrcAtual();
  }
  /* recalcula todos os itens com uma configuração e um cabeçalho; lança no primeiro erro (nada é aplicado) */
  function recalcularItens(cfg, cab) {
    return orc.itens.map(function (it) {
      var c;
      try { c = ORC.calcularItem(cfg, cab, it); }
      catch (e) { throw new Error('item "' + (it.descricao || ORIGEM_ROTULO[it.origem]) + '": ' + e.message); }
      return Object.assign({}, it, { inputs: c.inputs, resultado: c.resultado, avisos: c.avisos, calculadoEm: new Date().toISOString() });
    });
  }
  function onStatusOrc() {
    var novo = $('o-status').value;
    if (novo === orc.status) return;
    if (novo !== 'rascunho' && !orc.itens.length && !confirm('O orçamento não tem itens. Marcar como ' + STATUS_ROTULO[novo].toLowerCase() + ' mesmo assim?')) { $('o-status').value = orc.status; return; }
    if (!ORC.emitido(orc) && novo !== 'rascunho') {
      // primeira saída do rascunho = emissão: congela data e dados da empresa UMA vez; nunca mais é sobrescrito
      lerCabecalhoTexto();
      orc.emitidoEm = new Date().toISOString(); orc.emissaoOrigem = 'app';
      orc.empresa = clone(config.empresa || orc.empresa);
    }
    orc.status = novo;
    if (novo === 'enviado' && !orc.enviadoEm) orc.enviadoEm = orc.emitidoEm;
    renderCabecalhoOrc(); renderOrc(); salvarOrcAtual(); atualizarBotoesAdd();
  }

  /* ---------- itens ---------- */
  function descricaoPadrao(origem, inputs) {
    if (origem === 'importacao') return inputs.produto || 'Vidro importado';
    return origem === 'revenda' ? 'Vidro importado — revenda' : 'Vidro nacional';
  }
  function infoAdd(prefix, msg, cls) { var s = $(prefix + 'addOrcInfo'); s.textContent = msg; s.className = 'hint' + (cls ? ' ' + cls : ''); }
  function atualizarBotoesAdd() {
    [['in-', 'importacao'], ['r-', 'revenda'], ['n-', 'nacional']].forEach(function (par) {
      var b = $(par[0] + 'addOrc'), info = $(par[0] + 'addOrcInfo'); if (!b || !info) return;
      info.innerHTML = ''; info.className = 'hint';
      if (!orc) { b.disabled = true; b.textContent = '+ Adicionar ao orçamento'; info.textContent = 'Crie ou abra um orçamento na aba Orçamentos para adicionar itens.'; return; }
      if (orcTravado()) { b.disabled = true; b.textContent = '+ Adicionar ao orçamento'; info.textContent = 'Orçamento "' + orcNome(orc) + '" está ' + STATUS_ROTULO[orc.status].toLowerCase() + ' — crie uma nova revisão para alterar.'; return; }
      b.disabled = false;
      var editando = itemEmEdicao && itemEmEdicao.orcId === orc.id && itemEmEdicao.origem === par[1];
      if (editando) {
        var it = orc.itens.filter(function (x) { return x.id === itemEmEdicao.itemId; })[0];
        b.textContent = 'Substituir item "' + (it ? it.descricao : '?') + '" no orçamento';
        info.appendChild(document.createTextNode('Editando item do orçamento "' + orcNome(orc) + '". '));
        info.appendChild(el('button', { class: 'btn small', text: 'Adicionar como novo item', onclick: function () { itemEmEdicao = null; atualizarBotoesAdd(); } }));
        if (itemEmEdicao.icmsSaidaManual === true) info.appendChild(el('small', { class: 'warn', style: 'display:block', text: 'Este item tem ICMS de saída com ajuste manual (' + Math.round((itemEmEdicao.icmsSaidaCarregada || 0) * 1e4) / 100 + '%): ao substituir sem alterar esse campo, o ajuste manual é mantido; se alterar o campo, o item é reclassificado como um item novo.' }));
      } else {
        b.textContent = '+ Adicionar ao orçamento: ' + orcNome(orc);
        info.textContent = 'Cliente em ' + orc.cliente.uf + ' · ' + (orc.cliente.destinatario === 'contribuinteRevenda' ? 'contribuinte' : 'consumidor final') + ' · ' + orc.condicoes.pagamento + (orc.condicoes.pagamento === 'Parcelado' ? ' ' + orc.condicoes.parcelas + 'x ' + orc.condicoes.bandeira : '') + ' — o cabeçalho do orçamento vale para o item.';
      }
    });
  }
  function adicionarItem(origem) {
    var prefix = origem === 'importacao' ? 'in-' : (origem === 'revenda' ? 'r-' : 'n-');
    if (!orc) { infoAdd(prefix, 'Crie ou abra um orçamento na aba Orçamentos.', 'warn'); return; }
    if (orcTravado()) { infoAdd(prefix, 'Orçamento travado (' + STATUS_ROTULO[orc.status].toLowerCase() + ').', 'warn'); return; }
    var inputs = origem === 'importacao' ? lerEntradas() : lerEntradasRevenda(OPS[origem]);
    var cab = ORC.cabecalhoDe(orc);
    var div = ORC.divergenciasCabecalho(origem, inputs, cab);
    if (div.length && !confirm('A calculadora está diferente do cabeçalho do orçamento "' + orcNome(orc) + '":\n• ' + div.join('\n• ') + '\n\nAdicionar recalculando para o orçamento?')) return;
    var editando = itemEmEdicao && itemEmEdicao.orcId === orc.id && itemEmEdicao.origem === origem;
    var existente = editando ? orc.itens.filter(function (x) { return x.id === itemEmEdicao.itemId; })[0] : null;
    if (existente && origem !== 'importacao' && typeof itemEmEdicao.icmsSaidaManual === 'boolean') {
      // Substituição (parecer nº 5, achado 1): os campos são relidos do zero, então a classificação do item carregado
      // viria a se perder. Se o usuário NÃO alterou a alíquota de saída, a classificação carregada é mantida (manual
      // continua manual, mesmo com o orçamento em MG); se alterou, vale a regra de um item novo — manual quando o valor
      // difere da alíquota automática da UF da calculadora (em MG o campo não se aplica → automática).
      var mexeu = typeof itemEmEdicao.icmsSaidaCarregada !== 'number' || Math.abs(Number(inputs.icmsSaida) - itemEmEdicao.icmsSaidaCarregada) >= 1e-9;
      inputs.icmsSaidaManual = mexeu ? ORC.classificarAliquotaSaida(origem, inputs) : itemEmEdicao.icmsSaidaManual;
    }
    var item = { id: existente ? existente.id : ORC.gerarId('it'), origem: origem, descricao: existente ? existente.descricao : descricaoPadrao(origem, inputs), inputs: inputs };
    var c;
    try { c = ORC.calcularItem(orc.configSnapshot, cab, item); }
    catch (e) { infoAdd(prefix, 'Não foi possível adicionar: ' + e.message, 'warn'); return; }
    item.inputs = c.inputs; item.resultado = c.resultado; item.avisos = c.avisos; item.calculadoEm = new Date().toISOString();
    if (existente) { orc.itens[orc.itens.indexOf(existente)] = item; itemEmEdicao = null; }
    else orc.itens.push(item);
    var ok = salvarOrcAtual();
    var cons = ORC.consolidar(orc);
    var msg = (existente ? 'Item substituído' : 'Item adicionado') + ' no orçamento "' + orcNome(orc) + '" (' + orc.itens.length + ' item(ns) · total ' + brl(cons.totais.totalCliente) + ').';
    if (configDifereDoSnapshot(orc)) msg += ' Calculado com a configuração congelada do orçamento (dólar ' + numFmt(orc.configSnapshot.dolar, 2) + ') — use "Recalcular" no orçamento para trazer a configuração atual.';
    if (c.avisos.length) msg += ' Aviso: ' + c.avisos.join(' ');
    if (!ok) msg += ' (não salvo — veja a aba Orçamentos)';
    atualizarBotoesAdd();
    var info = $(prefix + 'addOrcInfo'); info.innerHTML = ''; info.className = 'hint';
    info.appendChild(document.createTextNode(msg + ' '));
    info.appendChild(el('button', { class: 'btn small', text: 'Abrir orçamento', onclick: function () { mostrarAba('orcamentos'); } }));
  }
  function carregarNaCalculadora(item) {
    var inp = item.inputs;
    if (item.origem === 'importacao') {
      $('in-contribuinte').value = inp.contribuinte ? 'sim' : 'nao';
      if (config.produtos.some(function (p) { return p.nome === inp.produto; })) $('in-produto').value = inp.produto;
      $('in-perda').value = Math.round((Number(inp.perda) || 0) * 1e4) / 100;
      $('in-precoBase').value = inp.precoBase; $('in-quantidade').value = inp.quantidade; $('in-frete').value = inp.frete;
      $('in-pagamento').value = inp.pagamento; $('in-bandeira').value = inp.bandeira; $('in-parcelas').value = inp.parcelas; $('in-uf').value = inp.uf;
      recalcular();
    } else {
      var op = OPS[item.origem]; PFX = op;
      $(op.i + 'fornecedorUF').value = inp.fornecedorUF; $(op.i + 'precoCompra').value = inp.precoCompra; $(op.i + 'quantidade').value = inp.quantidade;
      $(op.i + 'perda').value = Math.round((Number(inp.perda) || 0) * 1e4) / 100;
      $(op.i + 'icmsCompra').value = Math.round((Number(inp.icmsCompra) || 0) * 1e4) / 100; $(op.i + 'ipi').value = Math.round((Number(inp.ipi) || 0) * 1e4) / 100;
      $(op.i + 'modo').value = inp.modo || 'beneficiamento'; $(op.i + 'ipiCredito').value = inp.ipiCredito ? 'sim' : 'nao';
      $(op.i + 'difalIncluso').value = inp.difalIncluso ? 'dentro' : 'fora'; $(op.i + 'contribuinte').value = inp.contribuinte ? 'sim' : 'nao';
      $(op.i + 'clienteUF').value = inp.clienteUF; $(op.i + 'precoVenda').value = inp.precoVenda;
      $(op.i + 'ipiVenda').value = Math.round((Number(inp.ipiVenda) || 0) * 1e4) / 100; $(op.i + 'icmsSaida').value = Math.round((Number(inp.icmsSaida) || 0) * 1e4) / 100;
      $(op.i + 'frete').value = inp.frete; $(op.i + 'pagamento').value = inp.pagamento; $(op.i + 'bandeira').value = inp.bandeira; $(op.i + 'parcelas').value = inp.parcelas;
      var revendaPura = (inp.modo || 'beneficiamento') === 'revenda';
      $(op.i + 'ipiCredito').disabled = revendaPura; $(op.i + 'ipiVenda').disabled = revendaPura;
      recalcularRevenda(op);
    }
    var edicao = { orcId: orc.id, itemId: item.id, origem: item.origem };
    if (item.origem !== 'importacao') {
      // Classificação manual/automática do item carregado e a alíquota tal como ficou no campo: ao substituir, a flag só é
      // reavaliada se o usuário alterar esse campo (parecer nº 5, achado 1). Item antigo sem flag: classificado agora.
      edicao.icmsSaidaManual = typeof inp.icmsSaidaManual === 'boolean' ? inp.icmsSaidaManual : ORC.classificarAliquotaSaida(item.origem, inp);
      edicao.icmsSaidaCarregada = lerEntradasRevenda(OPS[item.origem]).icmsSaida;
    }
    itemEmEdicao = edicao;
    mostrarAba(ORIGEM_TAB[item.origem]);
    atualizarBotoesAdd();
  }
  function renderItensOrc(c) {
    var wrap = $('orc-itens'); wrap.innerHTML = '';
    var travado = orcTravado();
    if (!orc.itens.length) { wrap.appendChild(el('p', { class: 'hint', text: 'Nenhum item ainda. Vá a uma calculadora, monte o item e clique em "Adicionar ao orçamento: ' + orcNome(orc) + '".' })); return; }
    var resumo = {}; c.itens.forEach(function (r) { resumo[r.id] = r; });
    var linhas = orc.itens.map(function (it, idx) {
      var r = resumo[it.id] || {};
      var desc = el('input', { type: 'text', class: 'desc', value: it.descricao || '' });
      desc.disabled = travado;
      desc.addEventListener('change', function () { it.descricao = desc.value.trim(); renderProposta(ORC.consolidar(orc)); salvarOrcAtual(); });
      var descCel = el('td', {}, [desc]);
      (it.avisos || []).forEach(function (a) { descCel.appendChild(el('small', { class: 'warn', text: a, style: 'display:block' })); });
      if (it.origem === 'importacao') descCel.appendChild(el('small', { text: 'IPI não destacado (regime da planilha — pendente)', style: 'display:block;color:var(--muted)' }));
      function btn(txt, fn, cls, title) { var b = el('button', { class: 'btn small' + (cls ? ' ' + cls : ''), text: txt, onclick: fn }); if (title) b.title = title; b.disabled = travado; return b; }
      var acoes = el('td', { class: 'acoes' }, [
        btn('▲', function () { moverItem(idx, -1); }, '', 'Mover para cima'), btn('▼', function () { moverItem(idx, 1); }, '', 'Mover para baixo'),
        btn('Carregar', function () { carregarNaCalculadora(it); }, '', 'Abrir na calculadora de origem para ajustar e substituir'),
        btn('Duplicar', function () { duplicarItem(it); }),
        btn('Remover', function () { removerItem(it); }, 'danger')
      ]);
      return el('tr', { class: r.lucro < 0 ? 'neg' : '' }, [
        el('td', { text: String(idx + 1) }),
        el('td', {}, [el('span', { class: 'tag ' + ORIGEM_CLASSE[it.origem], text: ORIGEM_ROTULO[it.origem] })]),
        descCel,
        el('td', { class: 'num', text: numFmt(r.quantidade || 0, 2) }),
        el('td', { class: 'num', text: brl(r.precoM2 || 0) }),
        el('td', { class: 'num', text: brl(r.totalCliente || 0) }),
        el('td', { class: 'num', text: brl(r.custo || 0) }),
        el('td', { class: 'num lucro', text: brl(r.lucro || 0) }),
        el('td', { class: 'num', text: pctNa(r.margem) }),
        acoes
      ]);
    });
    var t = c.totais;
    linhas.push(el('tr', { class: 'tot' }, [el('td', { text: '', colspan: '3' }), el('td', { class: 'num', text: numFmt(t.quantidade, 2) }), el('td', { text: '' }),
      el('td', { class: 'num', text: brl(t.totalCliente) }), el('td', { class: 'num', text: brl(t.custoItens) }), el('td', { class: 'num', text: brl(t.lucroItens) }),
      el('td', { class: 'num', text: t.totalCliente > 0 ? pct(t.lucroItens / t.totalCliente, 1) : 'n/a' }), el('td', { text: '' })]));
    wrap.appendChild(el('table', { class: 'itens' }, [
      el('thead', {}, [el('tr', {}, [['#', ''], ['Origem', ''], ['Descrição', ''], ['m²', 'num'], ['R$/m²', 'num'], ['Total ao cliente', 'num'], ['Custo', 'num'], ['Lucro', 'num'], ['Margem', 'num'], ['', '']].map(function (h) { return el('th', { text: h[0], class: h[1] }); }))]),
      el('tbody', {}, linhas)
    ]));
  }
  function moverItem(idx, delta) {
    var j = idx + delta; if (j < 0 || j >= orc.itens.length) return;
    var tmp = orc.itens[idx]; orc.itens[idx] = orc.itens[j]; orc.itens[j] = tmp;
    renderOrc(); salvarOrcAtual();
  }
  function duplicarItem(it) {
    var novo = clone(it); novo.id = ORC.gerarId('it'); novo.descricao = (it.descricao || '') + ' (cópia)';
    orc.itens.splice(orc.itens.indexOf(it) + 1, 0, novo);
    renderOrc(); salvarOrcAtual();
  }
  function removerItem(it) {
    if (!confirm('Remover o item "' + (it.descricao || ORIGEM_ROTULO[it.origem]) + '"?')) return;
    orc.itens.splice(orc.itens.indexOf(it), 1);
    if (itemEmEdicao && itemEmEdicao.itemId === it.id) itemEmEdicao = null;
    renderOrc(); salvarOrcAtual(); atualizarBotoesAdd();
  }

  /* ---------- custos internos ---------- */
  function renderCustosOrc(c) {
    var wrap = $('orc-custos'); wrap.innerHTML = '';
    var travado = orcTravado();
    if (!orc.custosInternos.length) { wrap.appendChild(el('p', { class: 'hint', text: 'Nenhum custo interno lançado.' })); return; }
    var calc = {}; c.custos.forEach(function (x) { calc[x.id] = x.valor; });
    var linhas = orc.custosInternos.map(function (ci) {
      var tipo = el('select', {}, Object.keys(TIPO_CUSTO_ROTULO).map(function (k) { return el('option', { value: k, text: TIPO_CUSTO_ROTULO[k] }); }));
      tipo.value = ci.tipo; tipo.disabled = travado;
      tipo.addEventListener('change', function () { ci.tipo = tipo.value; renderOrc(); salvarOrcAtual(); });
      var desc = el('input', { type: 'text', value: ci.descricao || '', placeholder: 'descrição' }); desc.disabled = travado;
      desc.addEventListener('change', function () { ci.descricao = desc.value.trim(); salvarOrcAtual(); });
      var modo = el('select', {}, [el('option', { value: 'valor', text: 'Valor fixo (R$)' }), el('option', { value: 'percentual', text: '% do total ao cliente' })]);
      var ehPct = ci.percentual !== null && ci.percentual !== undefined;
      modo.value = ehPct ? 'percentual' : 'valor'; modo.disabled = travado;
      var num = el('input', { type: 'number', step: ehPct ? '0.1' : '0.01', min: '0', value: ehPct ? Math.round(ci.percentual * 1e4) / 100 : (ci.valor === null || ci.valor === undefined ? '' : ci.valor) });
      num.disabled = travado;
      modo.addEventListener('change', function () {
        if (modo.value === 'percentual') { ci.percentual = 0; ci.valor = null; } else { ci.valor = 0; ci.percentual = null; }
        renderOrc(); salvarOrcAtual();
      });
      num.addEventListener('change', function () {
        var v = num.value === '' ? 0 : Number(num.value);
        if (modo.value === 'percentual') ci.percentual = v / 100; else ci.valor = v;
        renderOrc(); salvarOrcAtual();
      });
      var rm = el('button', { class: 'btn small danger', text: 'Remover', onclick: function () { orc.custosInternos.splice(orc.custosInternos.indexOf(ci), 1); renderOrc(); salvarOrcAtual(); } }); rm.disabled = travado;
      return el('tr', {}, [el('td', {}, [tipo]), el('td', {}, [desc]), el('td', {}, [modo]), el('td', { class: 'num' }, [num]),
        el('td', { class: 'num', text: brl(calc[ci.id] || 0) }), el('td', {}, [rm])]);
    });
    linhas.push(el('tr', { class: 'tot' }, [el('td', { text: 'Total de custos internos', colspan: '4', style: 'font-weight:700' }), el('td', { class: 'num', text: brl(c.totais.custosInternos), style: 'font-weight:700' }), el('td', { text: '' })]));
    wrap.appendChild(el('table', { class: 'custos' }, [
      el('thead', {}, [el('tr', {}, [['Tipo', ''], ['Descrição', ''], ['Cobrança', ''], ['Valor / %', 'num'], ['R$ no orçamento', 'num'], ['', '']].map(function (h) { return el('th', { text: h[0], class: h[1] }); }))]),
      el('tbody', {}, linhas)
    ]));
  }
  function adicionarCusto() {
    if (orcTravado()) return;
    orc.custosInternos.push({ id: ORC.gerarId('c'), tipo: 'freteContratado', descricao: '', valor: 0, percentual: null });
    renderOrc(); salvarOrcAtual();
  }

  /* ---------- consolidado, DRE, composição, proposta ---------- */
  function renderOrc() {
    if (!orc) return;
    aplicarTravaOrc();
    var c;
    try { c = ORC.consolidar(orc); }
    catch (e) { orcStatus('Não foi possível consolidar: ' + e.message, 'err'); return; }
    var t = c.totais;
    $('oo-totalLabel').textContent = 'Total ao cliente' + (t.itens ? ' (' + t.itens + ' ite' + (t.itens > 1 ? 'ns' : 'm') + ')' : '');
    $('oo-total').textContent = brl(t.totalCliente);
    $('oo-totalSub').textContent = t.itens ? 'Custo total ' + brl(t.custoTotalReal) + ' (antes de IRPJ/CSLL, cenário real) · lucro operacional ' + brl(t.lucroOperacional) + (t.margemOperacional !== null ? ' (' + pct(t.margemOperacional, 1) + ')' : '') + ' · custos internos já descontados' : 'Adicione itens pelas calculadoras.';
    $('oo-liqReal').textContent = brl(c.real.lucroLiquido);
    $('oo-liqRealSub').textContent = pctNa(c.real.margemSobreValorPago) + ' do valor pago · IRPJ/CSLL ' + brl(c.real.irpjCsll);
    $('oo-liqPres').textContent = brl(c.presumido.lucroLiquido);
    var delta = c.presumido.lucroLiquido - c.real.lucroLiquido;
    $('oo-liqPresSub').textContent = (delta >= 0 ? '+ ' : '− ') + brl(Math.abs(delta)) + ' em relação ao lucro real · IRPJ/CSLL ' + brl(c.presumido.irpjCsll);
    renderGraficoGenerico('oviz', t.totalCliente, t.custoTotalReal, c.real.lucroLiquido, c.composicao.map(function (p) {
      var sub = p.chave === 'tributos' ? 'venda ' + brl(c.real.deducoes) + ' · IRPJ/CSLL ' + brl(c.real.irpjCsll) : (p.chave === 'cmv' ? 'líquido dos créditos' : (p.chave === 'internos' ? (orc.custosInternos.length + ' lançamento(s)') : (p.chave === 'lucro' ? 'lucro real' : 'itens')));
      return { nome: p.nome, sub: sub, valor: p.valor };
    }));
    renderDre(c.real, c.presumido, 'oo-dre', DRE_LINHAS_ORCAMENTO, 'Tributos totais líquidos (itens) + IRPJ/CSLL consolidado');
    var p = orc.premissas;
    $('orc-dreHint').textContent = 'Estimativa gerencial — não é apuração. Premissas congeladas neste orçamento: IRPJ/CSLL real ' + pct(p.irpjCsllReal, 0) + ' (marginal) sobre o lucro consolidado — prejuízo de um item compensa outro e custos internos são tratados como dedutíveis; presumido ' + pct(p.irpj, 0) + ' + ' + pct(p.csll, 0) + ' sobre ' + pct(p.presumidoBaseIRPJ, 0) + '/' + pct(p.presumidoBaseCSLL, 0) + ' da receita' + (p.lc224 ? ' (+10%, LC 224/2025)' : '') + ', somado por item; custos internos sem crédito de PIS/COFINS. Configuração congelada: dólar ' + numFmt(orc.configSnapshot.dolar, 2) + ' · motor ' + orc.versaoMotor + '.';
    renderItensOrc(c); renderCustosOrc(c);
    var av = $('oo-avisos'); av.innerHTML = '';
    var calculado = orc.itens.length ? orc.itens.reduce(function (m, it) { return it.calculadoEm > m ? it.calculadoEm : m; }, '') : orc.criadoEm;
    $('orc-itensInfo').textContent = orc.itens.length ? 'Itens calculados com dólar ' + numFmt(orc.configSnapshot.dolar, 2) + ' (configuração congelada em ' + dataHora(calculado) + ' · motor ' + orc.versaoMotor + ').' : '';
    if (configDifereDoSnapshot(orc)) av.appendChild(el('p', { class: 'warn', text: 'A configuração atual (dólar ' + numFmt(config.dolar, 2) + ', alíquotas, cartão, tributos) é diferente da congelada neste orçamento. Os números acima não mudam sozinhos — use "Recalcular com a configuração atual" para atualizá-los.' }));
    c.avisos.forEach(function (a) { av.appendChild(el('p', { class: 'warn', text: a })); });
    var fcpPend = ORC.fcpPendente(orc);
    if (fcpPend.length) av.appendChild(el('p', { class: 'warn', text: 'FCP de ' + fcpPend.join(', ') + ' não cadastrado: itens de importação direta calculados com FCP 0% e a proposta sairá com a ressalva "adicional estadual será confirmado na emissão da nota fiscal". Para remover, cadastre o FCP dessa UF em Configurações (0 se o estado não cobra).' }));
    if (c.real.reducaoPotencial > 0) av.appendChild(el('p', { text: 'Orçamento com prejuízo: imposto estimado zero; a perda de ' + brl(-c.real.lucroOperacional) + ' reduziria IRPJ/CSLL de outros resultados em até ' + brl(c.real.reducaoPotencial) + ' (não computado).' }));
    if (orc.versaoMotor !== ORC.VERSAO_MOTOR) av.appendChild(el('p', { class: 'warn', text: 'Calculado com o motor ' + orc.versaoMotor + '; este app usa ' + ORC.VERSAO_MOTOR + ' — recalcule para atualizar.' }));
    if (!av.children.length) av.appendChild(el('p', { text: 'Premissas e configuração congeladas; nada pendente.' }));
    renderProposta(c);
  }
  function round2(v) { return Math.round(v * 100) / 100; }
  function renderProposta(c) {
    var p = $('proposta'); p.innerHTML = '';
    var emitido = ORC.emitido(orc);
    var emp = emitido ? orc.empresa : (config.empresa || orc.empresa);   // antes da emissão acompanha Configurações; depois, congelado
    var cd = orc.condicoes, cl = orc.cliente;
    var dataRef = emitido ? orc.emitidoEm : new Date().toISOString();
    var empLinhas = [emp.cnpj ? 'CNPJ ' + emp.cnpj : '', emp.endereco, [emp.telefone, emp.email].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
    p.appendChild(el('div', { class: 'p-head' }, [
      el('div', {}, [el('div', { class: 'marca', text: emp.razaoSocial || 'MaisGlass' }), el('div', { class: 'emp', text: empLinhas })]),
      el('div', { class: 'p-num' }, [el('b', { text: 'Proposta nº ' + orcNumero(orc) }), document.createTextNode(dataCurta(dataRef) + (cd.validadeDias ? ' · válida por ' + cd.validadeDias + ' dia' + (cd.validadeDias > 1 ? 's' : '') : ''))])
    ]));
    p.appendChild(el('p', {}, [el('b', { text: 'Cliente: ' }), document.createTextNode((cl.nome || '—') + (cl.contato ? ' · ' + cl.contato : '') + ' · ' + cl.uf)]));
    if (!orc.itens.length) { p.appendChild(el('p', { class: 'p-vazio', text: 'Adicione itens para montar a proposta.' })); return; }
    var somaImpressa = 0, unitarioAprox = false;
    var linhas = c.itens.map(function (r, i) {
      var unit = r.quantidade > 0 ? round2(r.totalCliente / r.quantidade) : 0, tot = round2(r.totalCliente); somaImpressa += tot;
      if (Math.abs(unit * r.quantidade - tot) >= 0.01) unitarioAprox = true;   // unitário × m² ≠ total do item (arredondamento do unitário)
      return el('tr', {}, [el('td', { text: String(i + 1) }), el('td', { text: r.descricao || ORIGEM_ROTULO[r.origem] }), el('td', { class: 'num', text: numFmt(r.quantidade, 2) }),
        el('td', { class: 'num', text: numFmt(unit, 2) }), el('td', { class: 'num', text: numFmt(tot, 2) })]);
    });
    var totalImpresso = round2(c.totais.totalCliente);
    linhas.push(el('tr', { class: 'tot' }, [el('td', { text: 'Total', colspan: '4' }), el('td', { class: 'num', text: brl(totalImpresso) })]));
    p.appendChild(el('table', {}, [el('thead', {}, [el('tr', {}, [['Item', ''], ['Descrição', ''], ['m²', 'num'], ['R$/m² (aprox.)', 'num'], ['Total (R$)', 'num']].map(function (h) { return el('th', { text: h[0], class: h[1] }); }))]), el('tbody', {}, linhas)]));
    var notasArred = [];
    if (unitarioAprox) notasArred.push('O preço por m² é aproximado (duas casas); vale o total de cada item, calculado com precisão integral.');
    if (Math.abs(somaImpressa - totalImpresso) >= 0.01) notasArred.push('A soma dos itens difere do total em ' + brl(Math.abs(somaImpressa - totalImpresso)) + ' por arredondamento; vale o total.');
    notasArred.forEach(function (n) { p.appendChild(el('p', { class: 'p-obs', text: n })); });
    var pag = cd.pagamento === 'Parcelado' ? 'parcelado em ' + cd.parcelas + 'x no cartão ' + cd.bandeira + ' (taxa do cartão já incluída nos preços)' : 'à vista';
    var inclusos = [cd.inclusos && cd.inclusos.frete ? 'frete' : '', cd.inclusos && cd.inclusos.instalacao ? 'instalação' : '', cd.inclusos && cd.inclusos.texto].filter(Boolean).join(', ');
    var cond = el('div', { class: 'p-cond' });
    cond.appendChild(el('p', {}, [el('b', { text: 'Pagamento: ' }), document.createTextNode(pag)]));
    if (cd.prazoEntrega) cond.appendChild(el('p', {}, [el('b', { text: 'Entrega: ' }), document.createTextNode(cd.prazoEntrega)]));
    cond.appendChild(el('p', {}, [el('b', { text: 'Incluso: ' }), document.createTextNode(inclusos || 'somente os itens listados')]));
    p.appendChild(cond);
    var fcpPend = ORC.fcpPendente(orc);
    var notaImpostos = fcpPend.length
      ? 'Preços com impostos inclusos (IPI, ICMS e DIFAL conforme o destino). O adicional estadual do Fundo de Combate à Pobreza (FCP) de ' + fcpPend.join(', ') + ' será confirmado na emissão da nota fiscal e poderá ser acrescido ao valor.'
      : 'Preços com impostos inclusos (IPI, ICMS, DIFAL e FCP conforme o destino).';
    var obs = (cd.observacoes ? cd.observacoes + '\n' : '') + notaImpostos + ' Esta proposta não cobre obrigações tributárias do destinatário.';
    p.appendChild(el('p', { class: 'p-obs', text: obs }));
  }

  /* ---------- ações do editor ---------- */
  function recalcularOrc() {
    if (!orc || orcTravado()) return;
    if (!orc.itens.length) { orc.premissas = ORC.premissasDe(config); orc.configSnapshot = clone(config); orc.versaoMotor = ORC.VERSAO_MOTOR; renderOrc(); if (salvarOrcAtual()) orcStatus('Configuração congelada atualizada (sem itens).', 'ok'); return; }
    var cab = ORC.cabecalhoDe(orc), novos;
    try { novos = recalcularItens(config, cab); }
    catch (e) { orcStatus('Recalcular cancelado — ' + e.message + '. Nada foi alterado.', 'err'); return; }
    var antes = ORC.consolidar(orc);
    var simulado = Object.assign({}, orc, { itens: novos, premissas: ORC.premissasDe(config), configSnapshot: config, versaoMotor: ORC.VERSAO_MOTOR });
    var depois = ORC.consolidar(simulado);
    var linhas = ['Recalcular com a configuração atual (dólar ' + numFmt(config.dolar, 2) + '):',
      'Total ao cliente: ' + brl(antes.totais.totalCliente) + ' → ' + brl(depois.totais.totalCliente),
      'Lucro líquido (real): ' + brl(antes.real.lucroLiquido) + ' → ' + brl(depois.real.lucroLiquido)];
    orc.itens.forEach(function (it, i) {
      var a = it.resultado ? it.resultado.lucro : 0, b = novos[i].resultado.lucro;
      if (Math.abs(a - b) > 0.005) linhas.push('• ' + (it.descricao || ORIGEM_ROTULO[it.origem]) + ': lucro ' + brl(a) + ' → ' + brl(b));
    });
    if (linhas.length === 3) linhas.push('Nenhum item muda de valor.');
    linhas.push('', 'Aplicar? (os valores antigos são substituídos)');
    if (!confirm(linhas.join('\n'))) { orcStatus('Recálculo cancelado — nada foi alterado.', ''); return; }
    orc.itens = novos; orc.premissas = ORC.premissasDe(config); orc.configSnapshot = clone(config); orc.versaoMotor = ORC.VERSAO_MOTOR;
    renderOrc();
    if (salvarOrcAtual()) orcStatus('Itens recalculados com a configuração atual e salvos.', 'ok');
    else orcStatus($('orcStatus').textContent + ' (o recálculo está aplicado só nesta tela — exporte o JSON ou tente salvar de novo)', 'err');
  }
  function novaRevisaoOrc() {
    if (!orc) return;
    concluirSalvarPendente();
    var n = clone(orc), revAnterior = orc.revisao || 1;
    n.id = ORC.gerarId('orc'); n.revisao = revAnterior + 1; n.revisaoDe = orc.id; n.status = 'rascunho'; n.enviadoEm = null; n.emitidoEm = null; n.emissaoOrigem = null;
    n.criadoEm = n.atualizadoEm = new Date().toISOString();
    orcamentos.unshift(n); var ok = gravarOrcamentos(n); abrirOrc(n.id);
    if (ok) orcStatus('Revisão ' + n.revisao + ' criada como rascunho; a revisão ' + revAnterior + ' fica preservada na lista.', 'ok');
  }
  function duplicarOrc() {
    if (!orc) return;
    concluirSalvarPendente();
    var n = clone(orc);
    n.id = ORC.gerarId('orc'); n.revisao = 1; n.revisaoDe = null; n.status = 'rascunho'; n.enviadoEm = null; n.emitidoEm = null; n.emissaoOrigem = null;
    n.cliente.nome = (orc.cliente.nome || 'sem nome') + ' (cópia)'; n.criadoEm = n.atualizadoEm = new Date().toISOString();
    orcamentos.unshift(n); var ok = gravarOrcamentos(n); abrirOrc(n.id);
    if (ok) orcStatus('Orçamento duplicado.', 'ok');
  }
  function excluirOrc(id) {
    var o = orcamentos.filter(function (x) { return x.id === id; })[0]; if (!o) return;
    if (!confirm('Excluir o orçamento "' + orcNome(o) + '" (rev. ' + o.revisao + ')? Não dá para desfazer — exporte o JSON antes se quiser guardar.')) return;
    cancelarGravacaoAdiada(id);                                  // gravação confirmada ainda pendente deste id não pode ressuscitá-lo (parecer nº 5, achado 2)
    if (orc && orc.id === id) { clearTimeout(orcTimer); orcTimer = null; orcPendente = null; orc = null; }
    orcamentos.splice(orcamentos.indexOf(o), 1); limparNaoSalvo(id);
    var ok = gravarOrcamentos(null, id);
    mostrarListaOrc(); orcListaStatus(ok ? 'Orçamento excluído.' : 'Não foi possível gravar a exclusão — recarregue a página.', ok ? 'ok' : 'err');
  }
  function exportarOrc() {
    if (!orc) return;
    concluirSalvarPendente(); lerCabecalhoTexto();
    var nome = 'orcamento-' + (orc.cliente.nome || 'sem-nome').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-rev' + orc.revisao + '.json';
    var blob = new Blob([JSON.stringify(orc, null, 2)], { type: 'application/json' });
    var a = el('a', { href: URL.createObjectURL(blob), download: nome });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  /* Aceita um orçamento (objeto) ou um arquivo de cópia de segurança com vários ({ tipo: 'maisglass-backup', orcamentos: [...] }
   * ou uma lista), como o gerado na tela de entrada quando o endereço antigo não tem servidor. */
  function importarOrc(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var bruto;
      try { bruto = JSON.parse(fr.result); } catch (e) { orcListaStatus('Arquivo inválido: não é um JSON.', 'err'); return; }
      var lista = Array.isArray(bruto) ? bruto : (bruto && bruto.tipo === 'maisglass-backup' && Array.isArray(bruto.orcamentos) ? bruto.orcamentos : null);
      if (!lista) { importarUmOrc(bruto, true); return; }
      var r = { ok: 0, recusados: [] };
      lista.forEach(function (o, i) { var x = importarUmOrc(o, false); if (x.ok) r.ok++; else r.recusados.push((o && o.cliente && o.cliente.nome || 'orçamento ' + (i + 1)) + ': ' + x.motivo); });
      mostrarListaOrc();
      orcListaStatus('Cópia de segurança importada: ' + r.ok + ' orçamento(s)' + (r.recusados.length ? '; recusado(s): ' + r.recusados.slice(0, 3).join(' · ') + (r.recusados.length > 3 ? ' (+' + (r.recusados.length - 3) + ')' : '') : '') + '.' + (bruto.config ? ' O arquivo também traz a configuração — um administrador pode importá-la na aba Configurações.' : ''), r.recusados.length ? 'err' : 'ok');
    };
    fr.readAsText(file);
  }
  function importarUmOrc(dadosArquivo, abrir) {
    function recusa(msg) { if (abrir) orcListaStatus(msg, 'err'); return { ok: false, motivo: msg }; }
    var o;
    try {
      o = ORC.migrarOrcamento(dadosArquivo);
      var erros = ORC.validarOrcamento(o);
      if (erros.length) throw new Error(erros.slice(0, 4).join(' '));
    } catch (e) { return recusa('Arquivo inválido: ' + e.message); }
    // Nada que veio do arquivo entra na conta: cada item é recalculado com a configuração congelada do próprio
    // arquivo e o resultado recalculado SUBSTITUI o importado; divergências viram aviso no item (parecer nº 3, achado 3).
    var conf = ORC.conferirResultados(o), naoRecalc = [];
    o.itens.forEach(function (it) {
      var rc = conf.recalculados[it.id];
      var div = conf.divergentes.filter(function (d) { return d.id === it.id; });
      if (rc) { it.inputs = rc.inputs; it.resultado = rc.resultado; it.avisos = rc.avisos.slice(); it.calculadoEm = new Date().toISOString(); }
      else naoRecalc.push(it.descricao || it.origem);
      div.forEach(function (d) { it.avisos = (it.avisos || []).concat(['Resultado do arquivo ' + (rc ? 'diferia do recálculo e foi substituído' : 'não pôde ser recalculado') + ' (' + d.motivo + ').']); });
    });
    if (naoRecalc.length) return recusa('Arquivo recusado: item(ns) não recalculável(is) com a configuração congelada — ' + naoRecalc.join(', '));
    // candidato inteiro (já recalculado) precisa validar E consolidar em memória antes de entrar na lista/disco
    var errosCand = ORC.validarOrcamento(o);
    if (errosCand.length) return recusa('Arquivo recusado após o recálculo: ' + errosCand.slice(0, 3).join(' '));
    try { ORC.consolidar(o); } catch (e) { return recusa('Arquivo recusado: não consolida — ' + e.message); }
    if (orcamentos.some(function (x) { return x.id === o.id; }) || lerStorageOrc().some(function (x) { return x && x.id === o.id; })) o.id = ORC.gerarId('orc');
    o.atualizadoEm = new Date().toISOString();
    orcamentos.unshift(o);
    var ok = gravarOrcamentos(o);
    if (!abrir) return ok ? { ok: true } : { ok: false, motivo: 'não foi possível gravar' };
    abrirOrc(o.id);
    if (ok) orcStatus('Orçamento importado e salvo' + (conf.divergentes.length ? ' — ' + conf.divergentes.length + ' item(ns) com resultado diferente do recálculo (substituído; veja os avisos).' : '.'), conf.divergentes.length ? 'err' : 'ok');
    else orcStatus($('orcStatus').textContent + ' Orçamento importado só nesta tela.', 'err');
    return { ok: ok };
  }
  function imprimirOrc() {
    if (!orc || !orc.itens.length) { orcStatus('Adicione itens antes de imprimir a proposta.', 'err'); return; }
    concluirSalvarPendente(); lerCabecalhoTexto(); renderProposta(ORC.consolidar(orc));
    window.print();
  }

  function iniciarOrcamentos() {
    carregarOrcamentos();
    $('orcNovo').addEventListener('click', novoOrc);
    $('orcVoltar').addEventListener('click', mostrarListaOrc);
    $('orcRecalcular').addEventListener('click', recalcularOrc);
    $('orcImprimir').addEventListener('click', imprimirOrc);
    $('orcRevisao').addEventListener('click', novaRevisaoOrc);
    $('orcDuplicar').addEventListener('click', duplicarOrc);
    $('orcExportar').addEventListener('click', exportarOrc);
    $('orcExcluir').addEventListener('click', function () { if (orc) excluirOrc(orc.id); });
    $('orcImportar').addEventListener('click', function () { $('orcArquivo').click(); });
    $('orcArquivo').addEventListener('change', function () { if (this.files[0]) importarOrc(this.files[0]); this.value = ''; });
    $('orcAddCusto').addEventListener('click', adicionarCusto);
    if ($('orcMigrar')) $('orcMigrar').addEventListener('click', migrarLocais);
    ['o-uf', 'o-destinatario', 'o-pagamento', 'o-bandeira', 'o-parcelas'].forEach(function (id) { $(id).addEventListener('change', function () { if (orc) onCabecalhoFiscal(); }); });
    $('o-status').addEventListener('change', function () { if (orc) onStatusOrc(); });
    ['o-nome', 'o-contato', 'o-validade', 'o-prazo', 'o-dataPrevista', 'o-inclusoFrete', 'o-inclusoInstalacao', 'o-inclusoTexto', 'o-observacoes'].forEach(function (id) {
      var f = function () { if (!orc) return; lerCabecalhoTexto(); renderProposta(ORC.consolidar(orc)); agendarSalvarOrc(); };
      $(id).addEventListener('input', f); $(id).addEventListener('change', f);
    });
    [['in-', 'importacao'], ['r-', 'revenda'], ['n-', 'nacional']].forEach(function (par) { var b = $(par[0] + 'addOrc'); if (b) b.addEventListener('click', function () { adicionarItem(par[1]); }); });
    window.addEventListener('pagehide', concluirSalvarPendente);
    window.addEventListener('beforeunload', function (ev) { concluirSalvarPendente(); if (temNaoSalvos() || NUVEM.pendentes() > 0) { ev.preventDefault(); ev.returnValue = ''; } });
    window.addEventListener('storage', function (ev) {
      if (ev.key !== ORC_KEY) return;
      var disco = lerStorageOrc();
      if (orc) {
        var noDisco = disco.filter(function (x) { return x && x.id === orc.id; })[0];
        if (!noDisco) orcStatus('Este orçamento foi excluído em outra aba. Ele continua nesta tela; salvar vai recriá-lo.', 'err');
        else if (orcGravadoEm[orc.id] && noDisco.atualizadoEm !== orcGravadoEm[orc.id]) orcStatus('Outra aba alterou este orçamento (' + dataHora(noDisco.atualizadoEm) + '). A próxima gravação vai pedir confirmação; recarregue a página para ver a versão dela.', 'err');
      }
      sincronizarListaOrc(disco);
      if (!orc) renderListaOrc();
      else if (temNaoSalvos()) orcStatus(($('orcStatus').textContent ? $('orcStatus').textContent + ' ' : '') + 'Alterações não gravadas desta aba foram preservadas.', 'err');
    });
    var salvoId = null; try { salvoId = sessionStorage.getItem('glassmais.orcAtual'); } catch (e) { /* ignore */ }
    if (salvoId && orcamentos.some(function (o) { return o.id === salvoId; })) abrirOrc(salvoId); else { renderListaOrc(); atualizarBotoesAdd(); }
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
    iniciarOrcamentos();    // módulo Orçamentos (depois do clone da aba nacional: usa n-addOrc)
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
    $('senhaBtn').addEventListener('click', trocarMinhaSenha);
    $('uCriar').addEventListener('click', criarUsuario);
    $('uCopiar').addEventListener('click', function () { var t = $('uSenha').textContent; if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { uStatus('Senha copiada.', 'ok'); }); });
  }

  /* =====================================================================
   * Nuvem: liga a sincronização (nuvem.js) à interface — callbacks e aba Usuários
   * ===================================================================== */
  function hdrSync(texto, cls) { var e = $('hdrSync'); if (!e) return; e.textContent = texto; e.className = 'sync ' + (cls || ''); e.title = texto; }
  function aplicarConfigRecebida(cfg, meta) {
    var c;
    try { c = normalizarConfig(cfg); } catch (e) { console.warn('Configuração recebida inválida', e); return; }
    config = c;
    salvarConfig(config);
    draft = clone(config);
    if (abaAtual === 'config') renderConfig();
    preencherListas(); recalcular(); recalcularOperacoes(); atualizarCabecalho();
    status('Configuração atualizada' + (meta && meta.atualizadoPor ? ' por ' + meta.atualizadoPor : '') + (meta && meta.atualizadoEm ? ' em ' + dataHora(meta.atualizadoEm) : '') + ' (servidor).', 'ok');
  }
  function iniciarNuvem() {
    NUVEM.iniciar({
      orcAberto: function () { return orc ? orc.id : null; },
      confirmar: function (msg) { return confirm(msg); },
      aoStatus: hdrSync,
      aoReceberOrcamentos: function (info) {
        sincronizarListaOrc(lerStorageOrc());
        if (abaAtual === 'orcamentos') { if (!orc) renderListaOrc(); else { renderAutoriaOrc(); renderConflitoOrc(); } }
        atualizarBotoesAdd();
      },
      aoReceberConfig: aplicarConfigRecebida,
      aoAlteradoRemoto: function (id, quem, quando) { if (orc && orc.id === id) orcStatus('Este orçamento foi alterado por ' + (quem || 'outra pessoa') + ' às ' + dataHora(quando) + ' em outra máquina. A próxima gravação vai perguntar qual versão vale.', 'err'); },
      aoExcluidoRemoto: function (id, quem, quando) { if (orc && orc.id === id) orcStatus('Este orçamento foi excluído por ' + (quem || 'outra pessoa') + ' às ' + dataHora(quando) + ' em outra máquina. Ele continua nesta tela; ao salvar, o app pergunta se recria.', 'err'); },
      aoConflito: function (id, c) { if (orc && orc.id === id) renderConflitoOrc(); else if (abaAtual === 'orcamentos') renderListaOrc(); },
      aoSincronizado: function (id) { if (orc && orc.id === id) renderAutoriaOrc(); },
      aoMigracaoDisponivel: function (n) { if (abaAtual === 'orcamentos' && !orc) renderMigracao(); },
      aoSessaoPerdida: function () { concluirSalvarPendente(); mostrarLogin(); loginErro('Sua sessão expirou ou foi encerrada. Entre de novo — o que estava pendente continua guardado neste computador.'); }
    });
  }

  /* Endereço sem servidor (ex.: o antigo GitHub Pages): os orçamentos e a configuração deste navegador ficam presos
   * nesta origem. Oferece baixar tudo num arquivo único, que o app novo importa em Orçamentos → Importar (JSON). */
  function oferecerBackupLocal() {
    var lista = lerStorageOrc(), cfg = null;
    try { cfg = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { cfg = null; }
    if (!lista.length && !cfg) return;
    var box = $('loginBackup'); if (!box) return;
    box.classList.remove('hidden');
    $('loginBackupTexto').textContent = 'Este endereço não tem o servidor da empresa. Há ' + lista.length + ' orçamento(s)' + (cfg ? ' e uma configuração' : '') + ' guardados neste navegador: baixe o arquivo e importe no endereço novo (Orçamentos → Importar JSON).';
    $('loginBackupBtn').onclick = function () {
      var dados = { tipo: 'maisglass-backup', geradoEm: new Date().toISOString(), origem: location.href, orcamentos: lista, config: cfg };
      var a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })), download: 'maisglass-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
  }

  /* ---------- aba Usuários (administradores) ---------- */
  function uStatus(msg, cls) { var e = $('uStatus'); e.textContent = msg; e.className = 'status ' + (cls || ''); }
  function mostrarSenhaInicial(quem, senha) {
    $('uSenhaQuem').textContent = quem; $('uSenha').textContent = senha; $('uSenhaBox').classList.remove('hidden');
  }
  function renderUsuarios() {
    if (!ehAdmin()) return;
    var wrap = $('u-tabela'); wrap.innerHTML = 'Carregando…';
    NUVEM.api('GET', '/api/usuarios').then(function (r) {
      if (r.status !== 200) { wrap.textContent = 'Não foi possível carregar: ' + ((r.corpo && r.corpo.erro) || r.status); return; }
      wrap.innerHTML = '';
      var linhas = r.corpo.usuarios.map(function (u) {
        var eu = usuarioAtual && u.id === usuarioAtual.id;
        function acao(txt, fn, cls) { var b = el('button', { class: 'btn small' + (cls ? ' ' + cls : ''), text: txt, onclick: fn }); return b; }
        function patch(campos, msgOk) {
          NUVEM.api('PATCH', '/api/usuarios/' + u.id, campos).then(function (x) {
            if (x.status !== 200) { uStatus((x.corpo && x.corpo.erro) || ('Erro ' + x.status), 'err'); return; }
            if (x.corpo.senhaInicial) mostrarSenhaInicial(u.nome || u.email, x.corpo.senhaInicial);
            uStatus(msgOk, 'ok'); renderUsuarios();
          }).catch(function (e) { uStatus(e.message, 'err'); });
        }
        var acoes = el('td', { class: 'acoes' }, [
          acao(u.papel === 'admin' ? 'Tornar usuário' : 'Tornar admin', function () { patch({ papel: u.papel === 'admin' ? 'usuario' : 'admin' }, 'Papel alterado.'); }),
          acao('Redefinir senha', function () { if (confirm('Gerar uma nova senha inicial para ' + (u.nome || u.email) + '? A senha atual deixa de valer e as sessões dela são encerradas.')) patch({ redefinirSenha: true }, 'Senha redefinida.'); }),
          acao(u.ativo ? 'Desativar' : 'Reativar', function () { if (u.ativo && !confirm('Desativar ' + (u.nome || u.email) + '? A pessoa deixa de conseguir entrar.')) return; patch({ ativo: !u.ativo }, u.ativo ? 'Usuário desativado.' : 'Usuário reativado.'); }, u.ativo ? 'danger' : '')
        ]);
        if (eu) acoes.querySelectorAll('button').forEach(function (b) { if (b.textContent !== 'Redefinir senha') b.disabled = true; });
        return el('tr', {}, [
          el('td', {}, [el('strong', { text: u.nome || '—' }), eu ? el('small', { text: ' (você)', style: 'color:var(--muted)' }) : document.createTextNode('')]),
          el('td', { text: u.email }),
          el('td', {}, [el('span', { class: 'tag ' + (u.papel === 'admin' ? 'st-aprovado' : 'st-rascunho'), text: u.papel === 'admin' ? 'Administrador' : 'Usuário' })]),
          el('td', {}, [el('span', { class: 'tag ' + (u.ativo ? 'st-enviado' : 'st-perdido'), text: u.ativo ? 'Ativo' : 'Desativado' }), u.senhaPendente ? el('small', { text: ' senha inicial pendente', style: 'color:var(--muted)' }) : document.createTextNode('')]),
          el('td', { text: u.ultimoAcesso ? dataHora(u.ultimoAcesso) : 'nunca' }),
          acoes
        ]);
      });
      wrap.appendChild(el('table', { class: 'lista' }, [
        el('thead', {}, [el('tr', {}, ['Nome', 'E-mail', 'Papel', 'Situação', 'Último acesso', ''].map(function (h) { return el('th', { text: h }); }))]),
        el('tbody', {}, linhas)
      ]));
    }).catch(function (e) { wrap.textContent = 'Sem conexão: ' + e.message; });
  }
  function criarUsuario() {
    var nome = $('u-nome').value.trim(), email = $('u-email').value.trim(), papel = $('u-papel').value;
    if (!email) { uStatus('Informe o e-mail.', 'err'); return; }
    uStatus('Criando…', '');
    NUVEM.api('POST', '/api/usuarios', { nome: nome, email: email, papel: papel }).then(function (r) {
      if (r.status !== 200) { uStatus((r.corpo && r.corpo.erro) || ('Erro ' + r.status), 'err'); return; }
      mostrarSenhaInicial(r.corpo.usuario.nome || r.corpo.usuario.email, r.corpo.senhaInicial);
      $('u-nome').value = ''; $('u-email').value = ''; uStatus('Usuário criado.', 'ok'); renderUsuarios();
    }).catch(function (e) { uStatus(e.message, 'err'); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('loginBtn').addEventListener('click', entrar);
    $('loginSenha').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
    $('loginEmail').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('loginSenha').focus(); });
    $('trocaSenhaBtn').addEventListener('click', definirSenha);
    $('novaSenha2').addEventListener('keydown', function (e) { if (e.key === 'Enter') definirSenha(); });
    loginInfo('Conectando…');
    NUVEM.sessao().then(function (r) {
      if (r && r.precisaTrocarSenha) { mostrarLogin(); loginErro('Sua senha inicial ainda não foi trocada: entre de novo para definir a nova senha.'); return; }
      if (r) mostrarApp(r.usuario); else mostrarLogin();
    }).catch(function (e) { mostrarLogin(); loginErro(e.rede ? 'Sem conexão com o servidor. Verifique a internet e recarregue a página.' : 'Servidor indisponível: ' + e.message); oferecerBackupLocal(); });
  });
})();

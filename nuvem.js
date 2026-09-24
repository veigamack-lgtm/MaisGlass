/* =====================================================================
 * nuvem.js — camada de sincronização do app com o servidor (Vercel + Neon).
 * Entra POR CIMA da persistência local já existente: o app continua gravando no localStorage
 * (cache + fila); este módulo envia as alterações ao servidor, recebe as dos outros computadores
 * e trata conflito por versão (409/410). Ver PROJETO-NUVEM.md §9.
 *   window.GM_NUVEM = { sessao, login, logout, trocarSenha, iniciar, parar, alterado, excluido,
 *                       configAlterada, sincronizarAgora, estadoDe, metaDe, conflito, resolverConflito,
 *                       locaisNaoEnviados, migrarLocais, pendentes, usuario, api }
 * ===================================================================== */
(function (root) {
  'use strict';
  var SYNC_KEY = 'glassmais.sync.v1';
  var ORC_KEY = 'glassmais.orcamentos.v1';
  var CFG_KEY = 'glassmais.config.v1';
  var INTERVALO_POLL = 30000;
  var ESPERAS = [5000, 15000, 60000];

  var opts = {};                 // callbacks do app (ver iniciar)
  var T = { set: function (f, ms) { return root.setTimeout(f, ms); }, clear: function (id) { root.clearTimeout(id); } };   // substituível nos testes
  var usuario = null;
  var enviando = false;
  var timerPoll = null, timerPush = null, timerRetry = null;
  var falhasRede = 0;
  var ativo = false;
  var carregou = false;

  /* ---------- estado local ---------- */
  function lerJSON(k, padrao) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : padrao; } catch (e) { return padrao; } }
  function gravarJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  /* Se o navegador recusar gravar (armazenamento cheio/bloqueado), o estado de sincronização continua em memória nesta aba
   * — senão uma versão confirmada não "ficaria" e o envio repetiria sem fim */
  var estadoMem = null;
  function lerSync() {
    var s = (estadoMem ? JSON.parse(JSON.stringify(estadoMem)) : lerJSON(SYNC_KEY, null)) || {};
    s.versoes = s.versoes || {}; s.meta = s.meta || {}; s.fila = Array.isArray(s.fila) ? s.fila : []; s.locais = s.locais || {}; s.conflitos = s.conflitos || {};
    if (s.configVersao === undefined) s.configVersao = null;
    if (s.ultimaSync === undefined) s.ultimaSync = null;
    return s;
  }
  function gravarSync(s) {
    if (gravarJSON(SYNC_KEY, s)) { estadoMem = null; return true; }
    estadoMem = JSON.parse(JSON.stringify(s)); return false;
  }
  function lerLista() { var l = lerJSON(ORC_KEY, []); return Array.isArray(l) ? l : []; }
  function gravarLista(l) { return gravarJSON(ORC_KEY, l); }
  function hora(iso) { try { return new Date(iso || Date.now()).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso || ''; } }
  function nomeDe(o) { return (o && o.cliente && o.cliente.nome) || 'sem nome'; }
  function fn(nome) { return typeof opts[nome] === 'function' ? opts[nome] : function () {}; }
  function confirmar(msg) { return typeof opts.confirmar === 'function' ? !!opts.confirmar(msg) : (typeof root.confirm === 'function' ? root.confirm(msg) : true); }

  /* ---------- HTTP ---------- */
  function api(metodo, caminho, corpo) {
    var h = { 'X-Requested-With': 'MaisGlass' };
    if (corpo !== undefined) h['Content-Type'] = 'application/json';
    var f = typeof opts.fetch === 'function' ? opts.fetch : root.fetch;
    return f(caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo), credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = { erro: 'Resposta inválida do servidor (' + r.status + ').' }; } return { status: r.status, corpo: j }; });
      }, function (e) { var err = new Error('Sem conexão com o servidor.'); err.rede = true; err.causa = e; throw err; });
  }

  /* ---------- sessão ---------- */
  function sessao() { return api('GET', '/api/sessao').then(function (r) { if (r.status === 200) { usuario = r.corpo.usuario; return r.corpo; } if (r.status === 401) { usuario = null; return null; } throw new Error(r.corpo && r.corpo.erro || ('Erro ' + r.status)); }); }
  function login(email, senha) { return api('POST', '/api/login', { email: email, senha: senha }).then(function (r) { if (r.status === 200) { usuario = r.corpo.usuario; return r.corpo; } var e = new Error(r.corpo && r.corpo.erro || ('Erro ' + r.status)); e.status = r.status; throw e; }); }
  function logout() { parar(); usuario = null; return api('POST', '/api/logout').then(function () { return true; }, function () { return false; }); }
  function trocarSenha(atual, nova) { return api('POST', '/api/senha', { atual: atual, nova: nova }).then(function (r) { if (r.status === 200) return true; var e = new Error(r.corpo && r.corpo.erro || ('Erro ' + r.status)); e.status = r.status; throw e; }); }

  /* ---------- fila de envio ---------- */
  /* extra.recriarConfirmado: o usuário já confirmou (no protocolo entre abas) recriar um orçamento excluído em outra aba —
   * se o servidor responder 410, recria sem perguntar de novo */
  function alterado(id, extra) {
    if (!id) return;
    var s = lerSync();
    var anterior = s.fila.filter(function (f) { return f.id === id && f.tipo === 'put'; })[0];
    s.fila = s.fila.filter(function (f) { return !(f.id === id); });
    if (s.conflitos[id]) return gravarSync(s);          // em conflito: espera a decisão do usuário
    s.fila.push({ id: id, tipo: 'put', quando: new Date().toISOString(), recriarConfirmado: !!((extra && extra.recriarConfirmado) || (anterior && anterior.recriarConfirmado)) });
    gravarSync(s); agendarPush(); status();
  }
  function excluido(id) {
    if (!id) return;
    var s = lerSync();
    s.fila = s.fila.filter(function (f) { return f.id !== id; });
    delete s.conflitos[id]; delete s.locais[id];
    if (s.versoes[id] !== undefined) s.fila.push({ id: id, tipo: 'del', quando: new Date().toISOString() });
    else { delete s.meta[id]; }
    gravarSync(s); agendarPush(); status();
  }
  function configAlterada() {
    if (!usuario || usuario.papel !== 'admin') return;
    var s = lerSync();
    if (!s.fila.some(function (f) { return f.tipo === 'config'; })) s.fila.push({ id: '__config__', tipo: 'config', quando: new Date().toISOString() });
    gravarSync(s); agendarPush(); status();
  }
  function pendentes() { return lerSync().fila.length; }
  function agendarPush() { if (!ativo) return; T.clear(timerPush); timerPush = T.set(processar, 300); }

  /* Envia a fila em série, um item por vez. Entre abas do mesmo navegador (fila compartilhada no localStorage), um lock
   * (navigator.locks, quando existe) garante que só uma aba envia de cada vez; sem ele, a outra aba recebe 409/200 e
   * reconcilia pelo conteúdo, sem dano. */
  function processar() {
    if (!ativo || !usuario || enviando) return;
    if (!lerSync().fila.length) { status(); return; }
    enviando = true;
    var locks = root.navigator && root.navigator.locks;
    if (locks && typeof locks.request === 'function' && !opts.semLock) {
      locks.request('glassmais-sync', { ifAvailable: true }, function (lock) {
        if (!lock) { enviando = false; T.clear(timerPush); timerPush = T.set(processar, 700); return; }
        return processarUm();
      }).catch(function () { enviando = false; });
    } else processarUm();
  }
  var repeticoes = {};
  function processarUm() {
    var s = lerSync();
    if (!s.fila.length) { enviando = false; status(); return Promise.resolve(); }
    var item = s.fila[0];
    var chave = item.tipo + ':' + item.id + ':' + item.quando;
    if ((repeticoes[chave] = (repeticoes[chave] || 0) + 1) > 5) {
      // proteção: a mesma entrada não pode ser reenviada indefinidamente — vira erro visível e sai da fila
      repeticoes[chave] = 0;
      var sx = lerSync(); sx.fila = sx.fila.filter(function (f) { return !(f.id === item.id && f.tipo === item.tipo && f.quando === item.quando); });
      if (item.tipo === 'put') { sx.conflitos[item.id] = { tipo: 'erro', mensagem: 'O envio não se estabilizou (o servidor mudou várias vezes durante as tentativas). Tente de novo.', quando: new Date().toISOString() }; fn('aoConflito')(item.id, sx.conflitos[item.id]); }
      gravarSync(sx); enviando = false; status(); return Promise.resolve();
    }
    var p = item.tipo === 'put' ? enviarPut(item) : item.tipo === 'del' ? enviarDel(item) : enviarConfig(item);
    return p.then(function (resultado) {
      enviando = false; falhasRede = 0;
      if (resultado !== 'repetir') { delete repeticoes[chave]; var s2 = lerSync(); s2.fila = s2.fila.filter(function (f) { return !(f.id === item.id && f.tipo === item.tipo && f.quando === item.quando); }); gravarSync(s2); }
      status(); T.clear(timerPush); timerPush = T.set(processar, 0);
    }, function (e) {
      enviando = false;
      if (e && e.sessao) { fn('aoSessaoPerdida')(); status('Sessão expirada — entre de novo.', 'err'); return; }
      falhasRede = Math.min(falhasRede + 1, ESPERAS.length);
      status();
      T.clear(timerRetry); timerRetry = T.set(processar, ESPERAS[falhasRede - 1]);
    });
  }
  function erroSessao() { var e = new Error('sessão'); e.sessao = true; return e; }
  function localPorId(id) { return lerLista().filter(function (o) { return o && o.id === id; })[0] || null; }
  function canonico(v) {
    if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonico(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function guardarMeta(s, id, m) { s.versoes[id] = m.versao; s.meta[id] = { versao: m.versao, atualizadoEm: m.atualizadoEm, atualizadoPor: m.atualizadoPor, criadoPor: m.criadoPor, criadoEm: m.criadoEm }; delete s.locais[id]; }

  function enviarPut(item) {
    var o = localPorId(item.id);
    if (!o) return Promise.resolve('ok');                                 // sumiu localmente enquanto esperava
    var s = lerSync();
    var versaoBase = s.versoes[item.id] === undefined ? null : s.versoes[item.id];
    return api('PUT', '/api/orcamentos/' + encodeURIComponent(item.id), { dados: o, versaoBase: versaoBase, recriar: !!item.recriar }).then(function (r) {
      if (r.status === 200) { var s2 = lerSync(); guardarMeta(s2, item.id, r.corpo); gravarSync(s2); fn('aoSincronizado')(item.id, r.corpo); return 'ok'; }
      if (r.status === 401) throw erroSessao();
      if (r.status === 409) {
        var atual = r.corpo.atual;
        if (atual && atual.dados && canonico(atual.dados) === canonico(o)) {   // mesmo conteúdo (outra aba desta máquina já enviou): só alinha a versão
          var s3 = lerSync(); guardarMeta(s3, item.id, atual); gravarSync(s3); return 'ok';
        }
        return decidirConflito(item, o, atual);
      }
      if (r.status === 410) {
        if (item.recriarConfirmado) { var s5 = lerSync(); s5.fila = s5.fila.map(function (f) { return f.id === item.id && f.tipo === 'put' ? Object.assign({}, f, { recriar: true }) : f; }); gravarSync(s5); return 'repetir'; }
        return decidirExcluido(item, o, r.corpo);
      }
      // 400/403/500: não fica tentando; vira conflito "invalido" visível no app
      var s4 = lerSync(); s4.conflitos[item.id] = { tipo: 'erro', mensagem: (r.corpo && r.corpo.erro) || ('Erro ' + r.status), quando: new Date().toISOString() }; gravarSync(s4);
      fn('aoConflito')(item.id, s4.conflitos[item.id]);
      return 'ok';
    });
  }
  function decidirConflito(item, o, atual) {
    var msg = 'O orçamento "' + nomeDe(o) + '" foi alterado por ' + (atual.atualizadoPor || 'outra pessoa') + ' às ' + hora(atual.atualizadoEm) + ' em outra máquina.\n\n' +
      'OK = sobrescrever com a versão deste computador.\nCancelar = manter as duas por enquanto (o orçamento fica marcado "conflito" e você decide depois, ao abri-lo).';
    if (confirmar(msg)) {
      var s = lerSync(); s.versoes[item.id] = atual.versao; gravarSync(s);   // a decisão vale para a versão vista; se mudar de novo, 409 de novo e nova pergunta
      return 'repetir';
    }
    var s2 = lerSync(); s2.conflitos[item.id] = { tipo: 'versao', versao: atual.versao, atualizadoPor: atual.atualizadoPor, atualizadoEm: atual.atualizadoEm, dados: atual.dados, quando: new Date().toISOString() };
    s2.fila = s2.fila.filter(function (f) { return f.id !== item.id; }); gravarSync(s2);
    fn('aoConflito')(item.id, s2.conflitos[item.id]);
    return 'ok';
  }
  function decidirExcluido(item, o, corpo) {
    var msg = 'O orçamento "' + nomeDe(o) + '" foi excluído por ' + (corpo.excluidoPor || 'outra pessoa') + ' às ' + hora(corpo.excluidoEm) + ' em outra máquina.\n\n' +
      'OK = recriar com a versão deste computador.\nCancelar = decidir depois (fica marcado "excluído em outra máquina").';
    if (confirmar(msg)) { var s = lerSync(); s.fila = s.fila.map(function (f) { return f.id === item.id && f.tipo === 'put' ? Object.assign({}, f, { recriar: true }) : f; }); gravarSync(s); item.recriar = true; return 'repetir'; }
    var s2 = lerSync(); s2.conflitos[item.id] = { tipo: 'excluido', excluidoPor: corpo.excluidoPor, excluidoEm: corpo.excluidoEm, versao: corpo.versao, quando: new Date().toISOString() };
    s2.fila = s2.fila.filter(function (f) { return f.id !== item.id; }); gravarSync(s2);
    fn('aoConflito')(item.id, s2.conflitos[item.id]);
    return 'ok';
  }
  function enviarDel(item) {
    var s = lerSync(); var vb = s.versoes[item.id];
    if (vb === undefined) return Promise.resolve('ok');
    return api('DELETE', '/api/orcamentos/' + encodeURIComponent(item.id) + '?versaoBase=' + encodeURIComponent(vb)).then(function (r) {
      if (r.status === 200) { var s2 = lerSync(); delete s2.versoes[item.id]; delete s2.meta[item.id]; gravarSync(s2); return 'ok'; }
      if (r.status === 401) throw erroSessao();
      if (r.status === 409) {
        var atual = r.corpo.atual;
        if (confirmar('O orçamento "' + nomeDe(atual.dados) + '" foi alterado por ' + (atual.atualizadoPor || 'outra pessoa') + ' às ' + hora(atual.atualizadoEm) + ' em outra máquina.\n\nExcluir mesmo assim?')) {
          var s3 = lerSync(); s3.versoes[item.id] = atual.versao; gravarSync(s3); return 'repetir';
        }
        var s4 = lerSync(); delete s4.versoes[item.id]; gravarSync(s4);     // desiste: o pull traz a versão do servidor de volta
        return 'ok';
      }
      var s5 = lerSync(); delete s5.versoes[item.id]; gravarSync(s5); return 'ok';
    });
  }
  function enviarConfig(item) {
    var cfg = lerJSON(CFG_KEY, null); if (!cfg) return Promise.resolve('ok');
    var s = lerSync();
    return api('PUT', '/api/config', { dados: cfg, versaoBase: s.configVersao }).then(function (r) {
      if (r.status === 200) { var s2 = lerSync(); s2.configVersao = r.corpo.versao; gravarSync(s2); return 'ok'; }
      if (r.status === 401) throw erroSessao();
      if (r.status === 409 && r.corpo.atual) {
        var atual = r.corpo.atual;
        if (canonico(atual.dados) === canonico(cfg)) { var s3 = lerSync(); s3.configVersao = atual.versao; gravarSync(s3); return 'ok'; }
        if (confirmar('As Configurações foram alteradas por ' + (atual.atualizadoPor || 'outra pessoa') + ' às ' + hora(atual.atualizadoEm) + ' em outra máquina.\n\nOK = sobrescrever com as deste computador.\nCancelar = usar as do servidor (as alterações locais são descartadas).')) {
          var s4 = lerSync(); s4.configVersao = atual.versao; gravarSync(s4); return 'repetir';
        }
        aplicarConfigRecebida(atual); return 'ok';
      }
      fn('aoStatus')('Configuração não enviada: ' + ((r.corpo && r.corpo.erro) || ('erro ' + r.status)), 'err');
      return 'ok';
    });
  }
  function aplicarConfigRecebida(c) {
    var s = lerSync(); s.configVersao = c.versao; gravarSync(s);
    gravarJSON(CFG_KEY, c.dados);
    fn('aoReceberConfig')(c.dados, { versao: c.versao, atualizadoPor: c.atualizadoPor, atualizadoEm: c.atualizadoEm });
  }

  /* ---------- recebimento (pull) ---------- */
  function puxar(completo) {
    if (!ativo || !usuario) return Promise.resolve();
    var s = lerSync();
    var desde = completo ? null : s.ultimaSync;
    return api('GET', '/api/sync' + (desde ? '?desde=' + encodeURIComponent(desde) : '')).then(function (r) {
      if (r.status === 401) throw erroSessao();
      if (r.status !== 200) throw new Error((r.corpo && r.corpo.erro) || ('Erro ' + r.status));
      aplicarPull(r.corpo, !desde);
      falhasRede = 0;
    }).catch(function (e) {
      if (e && e.sessao) { fn('aoSessaoPerdida')(); status('Sessão expirada — entre de novo.', 'err'); return; }
      falhasRede = Math.min(falhasRede + 1, ESPERAS.length);
      status();
    });
  }
  function aplicarPull(resp, completo) {
    var s = lerSync();
    var aberto = fn('orcAberto')() || null;
    var pendentesIds = {}; s.fila.forEach(function (f) { pendentesIds[f.id] = true; });
    var lista = lerLista(); var porId = {}; lista.forEach(function (o, i) { if (o && o.id) porId[o.id] = i; });
    var mudou = false, avisos = [], renomeados = [];
    var noServidor = {};
    (resp.orcamentos || []).forEach(function (r) {
      noServidor[r.id] = true;
      if (pendentesIds[r.id] || s.conflitos[r.id]) return;              // o push resolve; conflito aguarda decisão
      if (r.excluidoEm) {
        if (r.id === aberto) { if (s.versoes[r.id] !== undefined) avisos.push(['excluido', r]); delete s.versoes[r.id]; return; }
        if (porId[r.id] !== undefined) { lista[porId[r.id]] = null; mudou = true; }
        delete s.versoes[r.id]; delete s.meta[r.id]; delete s.locais[r.id];
        return;
      }
      var local = porId[r.id] !== undefined ? lista[porId[r.id]] : null;
      var mesmoConteudo = !!local && canonico(local) === canonico(r.dados);
      if (r.id === aberto) {
        if (s.versoes[r.id] !== undefined && s.versoes[r.id] !== r.versao) avisos.push(['alterado', r]);
        // sem versão conhecida (máquina que ainda não sincronizou este id): só adota a versão se o conteúdo for o mesmo;
        // se for diferente, fica sem versão → a próxima gravação recebe 409 e pergunta, em vez de sobrescrever calada
        if (s.versoes[r.id] === undefined && mesmoConteudo) s.versoes[r.id] = r.versao;
        s.meta[r.id] = { versao: r.versao, atualizadoEm: r.atualizadoEm, atualizadoPor: r.atualizadoPor, criadoPor: r.criadoPor, criadoEm: r.criadoEm };
        return;
      }
      if (s.versoes[r.id] === undefined && local && !mesmoConteudo) {
        // cópia local de um id que o servidor já tem, com conteúdo diferente (ex.: orçamento antigo que ficou num navegador):
        // nada é descartado — a cópia local ganha um id novo e fica "só neste computador" para ser enviada; o id original recebe a do servidor
        var copia = JSON.parse(JSON.stringify(local)); copia.id = local.id + '_pc' + Math.random().toString(36).slice(2, 7);
        if (copia.cliente && typeof copia.cliente.nome === 'string') copia.cliente.nome += ' (cópia deste computador)';
        lista.push(copia); s.locais[copia.id] = true; renomeados.push(copia.id);
      }
      if (s.versoes[r.id] !== r.versao || porId[r.id] === undefined) {
        if (porId[r.id] !== undefined) lista[porId[r.id]] = r.dados; else lista.push(r.dados);   // push: os índices de porId continuam válidos (a lista da tela é ordenada por data)
        mudou = true;
      }
      guardarMeta(s, r.id, r);
    });
    lista = lista.filter(function (o) { return !!o; });
    if (completo) {
      // carga completa: o que existe localmente e o servidor não conhece (sem versão) é "só neste computador"
      s.locais = {};
      lista.forEach(function (o) { if (o && o.id && !noServidor[o.id] && s.versoes[o.id] === undefined && !pendentesIds[o.id]) s.locais[o.id] = true; });
      renomeados.forEach(function (id) { s.locais[id] = true; });
      Object.keys(s.versoes).forEach(function (id) { if (!noServidor[id] && !pendentesIds[id] && !s.conflitos[id]) { /* sumiu do servidor sem marca de exclusão (não deveria) */ } });
    }
    if (renomeados.length) mudou = true;
    if (mudou) gravarLista(lista);
    if (resp.config) {
      var cfgPendente = s.fila.some(function (f) { return f.tipo === 'config'; });
      if (!cfgPendente && resp.config.versao !== s.configVersao) { s.configVersao = resp.config.versao; gravarSync(s); gravarJSON(CFG_KEY, resp.config.dados); fn('aoReceberConfig')(resp.config.dados, { versao: resp.config.versao, atualizadoPor: resp.config.atualizadoPor, atualizadoEm: resp.config.atualizadoEm }); s = lerSync(); }
    } else if (completo && usuario && usuario.papel === 'admin' && lerJSON(CFG_KEY, null)) {
      configAlterada(); s = lerSync();                                    // servidor sem configuração: a do administrador vira a da empresa
    }
    s.ultimaSync = resp.agora; gravarSync(s);
    carregou = true;
    if (mudou || completo) fn('aoReceberOrcamentos')({ completo: completo, mudou: mudou });
    avisos.forEach(function (a) { if (a[0] === 'alterado') fn('aoAlteradoRemoto')(a[1].id, a[1].atualizadoPor, a[1].atualizadoEm); else fn('aoExcluidoRemoto')(a[1].id, a[1].excluidoPor, a[1].excluidoEm); });
    if (Object.keys(s.locais).length) fn('aoMigracaoDisponivel')(Object.keys(s.locais).length);
    status();
  }

  /* ---------- conflitos visíveis ---------- */
  function conflito(id) { return lerSync().conflitos[id] || null; }
  function resolverConflito(id, decisao) {
    var s = lerSync(); var c = s.conflitos[id]; if (!c) return Promise.resolve(false);
    delete s.conflitos[id]; gravarSync(s);
    if (decisao === 'minha') {
      var s2 = lerSync();
      if (c.tipo === 'versao') s2.versoes[id] = c.versao;
      s2.fila = s2.fila.filter(function (f) { return f.id !== id; });
      s2.fila.push({ id: id, tipo: 'put', quando: new Date().toISOString(), recriar: c.tipo === 'excluido' });
      gravarSync(s2); agendarPush(); status(); return Promise.resolve(true);
    }
    // 'servidor': usa a versão do servidor (ou remove, se excluído lá)
    var lista = lerLista(); var idx = -1; lista.forEach(function (o, i) { if (o && o.id === id) idx = i; });
    var s3 = lerSync();
    if (c.tipo === 'versao' && c.dados) { if (idx >= 0) lista[idx] = c.dados; else lista.unshift(c.dados); s3.versoes[id] = c.versao; s3.meta[id] = { versao: c.versao, atualizadoEm: c.atualizadoEm, atualizadoPor: c.atualizadoPor }; }
    else { if (idx >= 0) lista.splice(idx, 1); delete s3.versoes[id]; delete s3.meta[id]; }
    gravarLista(lista); gravarSync(s3);
    fn('aoReceberOrcamentos')({ completo: false, mudou: true, resolvido: id });
    status(); return Promise.resolve(true);
  }

  /* ---------- migração dos orçamentos locais ---------- */
  function locaisNaoEnviados() { var s = lerSync(); var ids = s.locais; return lerLista().filter(function (o) { return o && ids[o.id]; }); }
  function migrarLocais() {
    var locais = locaisNaoEnviados(); if (!locais.length) return Promise.resolve({ resultado: [] });
    return api('POST', '/api/orcamentos/importar-local', { orcamentos: locais }).then(function (r) {
      if (r.status === 401) throw erroSessao();
      if (r.status !== 200) throw new Error((r.corpo && r.corpo.erro) || ('Erro ' + r.status));
      var s = lerSync();
      r.corpo.resultado.forEach(function (x) { if (x.status === 'criado' || x.status === 'igual') { s.versoes[x.id] = x.versao; delete s.locais[x.id]; } else if (x.status === 'renomeado') { delete s.locais[x.id]; } });
      gravarSync(s);
      return puxar(true).then(function () { return r.corpo; });
    });
  }

  /* ---------- estado por orçamento (para a lista) ---------- */
  function estadoDe(id) {
    var s = lerSync();
    if (s.conflitos[id]) return s.conflitos[id].tipo === 'excluido' ? 'excluido-remoto' : (s.conflitos[id].tipo === 'erro' ? 'erro' : 'conflito');
    if (s.fila.some(function (f) { return f.id === id; })) return 'pendente';
    if (s.locais[id]) return 'local';
    if (s.versoes[id] !== undefined) return 'ok';
    return 'novo';
  }
  function metaDe(id) { return lerSync().meta[id] || null; }

  /* ---------- status ---------- */
  var ultimoOk = null;
  function status(texto, cls) {
    if (texto !== undefined) return fn('aoStatus')(texto, cls || '');
    var s = lerSync(); var n = s.fila.length; var nc = Object.keys(s.conflitos).length;
    var partes = [];
    if (!usuario) partes.push('desconectado');
    else if (falhasRede) partes.push('Sem conexão' + (n ? ' — ' + n + ' alteração(ões) aguardando envio' : ''));
    else if (enviando) partes.push('Enviando…');
    else if (n) partes.push(n + ' pendente(s)');
    else partes.push('Sincronizado' + (s.ultimaSync ? ' às ' + new Date(s.ultimaSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''));
    if (nc) partes.push(nc + ' conflito(s) — abra o orçamento para resolver');
    fn('aoStatus')(partes.join(' · '), falhasRede || nc ? 'err' : (n || enviando ? '' : 'ok'));
  }

  /* ---------- ciclo de vida ---------- */
  function iniciar(o) {
    opts = o || {}; ativo = true; falhasRede = 0;
    var s = lerSync();
    if (s.usuarioId !== undefined && usuario && s.usuarioId !== usuario.id) {   // outra pessoa entrou nesta máquina: começa do zero (o cache local continua como "só neste computador")
      s.versoes = {}; s.meta = {}; s.fila = []; s.conflitos = {}; s.ultimaSync = null; s.configVersao = null;
    }
    if (usuario) s.usuarioId = usuario.id;
    gravarSync(s);
    status('Conectando…', '');
    return puxar(true).then(function () {
      processar();
      clearInterval(timerPoll); timerPoll = setInterval(function () { puxar(false).then(processar); }, INTERVALO_POLL);
      if (root.addEventListener) {
        root.addEventListener('focus', aoFocar);
        if (root.document) root.document.addEventListener('visibilitychange', aoFocar);
        root.addEventListener('online', aoFocar);
      }
    });
  }
  function aoFocar() { if (!ativo || (root.document && root.document.visibilityState === 'hidden')) return; puxar(false).then(processar); }
  function sincronizarAgora() { return puxar(false).then(processar); }
  function parar() {
    ativo = false; clearInterval(timerPoll); T.clear(timerPush); T.clear(timerRetry);
    if (root.removeEventListener) { root.removeEventListener('focus', aoFocar); if (root.document) root.document.removeEventListener('visibilitychange', aoFocar); root.removeEventListener('online', aoFocar); }
  }

  root.GM_NUVEM = {
    sessao: sessao, login: login, logout: logout, trocarSenha: trocarSenha,
    iniciar: iniciar, parar: parar, sincronizarAgora: sincronizarAgora,
    alterado: alterado, excluido: excluido, configAlterada: configAlterada,
    estadoDe: estadoDe, metaDe: metaDe, conflito: conflito, resolverConflito: resolverConflito,
    locaisNaoEnviados: locaisNaoEnviados, migrarLocais: migrarLocais, pendentes: pendentes,
    usuario: function () { return usuario; }, carregou: function () { return carregou; }, api: api, processar: processar,
    _lerSync: lerSync, _timers: T
  };
})(typeof window !== 'undefined' ? window : this);

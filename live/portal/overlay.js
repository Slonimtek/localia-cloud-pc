/* Localía · botón flotante del acceso directo a la PC (https://pc-<id>.…/).
   Permite cambiar de país, verificar la IP, pasar archivos entre tu compu y la PC, y volver al panel.
   Dentro del portal (iframe) la barra de arriba ya cambia el país: ahí solo se muestra "Archivos". */
(function () {
  var embedded = window.top !== window;
  var N = { US: 'Estados Unidos', BR: 'Brasil', AR: 'Argentina', UY: 'Uruguay', IL: 'Israel', ES: 'España', CL: 'Chile', MX: 'México', PE: 'Perú', CO: 'Colombia', PY: 'Paraguay' };
  var st = null, open = false, busy = false, msg = '', files = null;
  var css = document.createElement('style');
  css.textContent =
    '#lcl{position:fixed;top:10px;right:10px;z-index:2147483000;font:14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e6edf6}' +
    '#lcl .pill{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:rgba(12,26,44,.88);border:1px solid #2c4262;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);user-select:none}' +
    '#lcl .pill b{color:#fff}#lcl .dot{width:8px;height:8px;border-radius:50%;background:#43c690;flex:none}' +
    '#lcl.mini .pill .txt{display:none}#lcl.mini .pill{padding:8px}' +
    '#lcl .menu{margin-top:8px;width:270px;padding:12px;border-radius:14px;background:rgba(12,26,44,.96);border:1px solid #2c4262;box-shadow:0 12px 30px rgba(0,0,0,.45)}' +
    '#lcl .k{font:600 10.5px ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:#e2b04e;margin-bottom:8px}' +
    '#lcl button{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;padding:9px 10px;border-radius:9px;cursor:pointer;color:#e6edf6}' +
    '#lcl button:hover{background:#1b2b44}#lcl button.on{background:#2a1f55;color:#fff;font-weight:600}' +
    '#lcl .code{font:600 11px ui-monospace,Menlo,monospace;border:1.5px solid #ab93f3;color:#ab93f3;border-radius:50%;width:26px;height:26px;display:grid;place-items:center;flex:none}' +
    '#lcl hr{border:0;border-top:1px solid #2c4262;margin:8px 0}#lcl .msg{font-size:12.5px;color:#9fb2c9;padding:4px 10px 2px}' +
    '#lcl.emb{top:auto;bottom:14px}#lcl.emb .menu{position:absolute;bottom:100%;right:0;margin:0 0 8px}' +
    '#lcl a.f{display:flex;gap:8px;align-items:baseline;padding:8px 10px;border-radius:9px;color:#e6edf6;text-decoration:none}#lcl a.f:hover{background:#1b2b44}' +
    '#lcl a.f span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#lcl a.f small{color:#9fb2c9;flex:none}#lcl .fl{max-height:220px;overflow:auto}';
  document.head.appendChild(css);
  var box = document.createElement('div'); box.id = 'lcl'; document.body.appendChild(box);
  var pick = document.createElement('input'); pick.type = 'file'; pick.style.display = 'none'; document.body.appendChild(pick);
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function size(n) { return n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function name(c) { var e = st && st.exits.find(function (x) { return x.code === c; }); return e ? e.name : (N[c] || c); }
  function render() {
    if (!st) return;
    var id = st.identity, where = id && id.online ? (id.city || '') + ', ' + (N[id.country] || id.country) : name(st.active);
    var h_ = embedded ? '<div class="pill" data-a="toggle">📁 <span class="txt"><b>Archivos</b> ▴</span></div>'
      : '<div class="pill" data-a="toggle"><span class="dot" style="' + (id && id.online === false ? 'background:#f07068' : '') + '"></span><span class="txt">Te ven en <b>' + h(where) + '</b> ▾</span></div>';
    if (open) {
      h_ += '<div class="menu"><div class="k">Localía · ' + h(st.name) + '</div>';
      if (!embedded) {
        st.exits.forEach(function (e) { h_ += '<button data-a="exit" data-c="' + h(e.code) + '" class="' + (e.code === st.active ? 'on' : '') + '"><span class="code">' + h(e.code) + '</span>' + h(e.name) + ' <span style="opacity:.6">· ' + h(e.city) + '</span></button>'; });
        h_ += '<hr>';
      }
      h_ += '<button data-a="up">⬆️ Subir un archivo desde mi compu</button><button data-a="down">⬇️ Bajar archivos a mi compu</button>';
      if (files) {
        h_ += '<div class="fl">' + (files.length ? files.map(function (f) { return '<a class="f" href="/__localia/file/' + encodeURIComponent(f.name) + '" download="' + h(f.name) + '"><span>' + h(f.name) + '</span><small>' + size(f.size) + '</small></a>'; }).join('')
          : '<div class="msg">Todavía no hay nada. Lo que bajes adentro de la PC (un comprobante, un PDF) aparece acá.</div>') + '</div>';
      }
      if (!embedded) {
        h_ += '<hr><button data-a="check">🛡️ Verificar mi IP</button><button data-a="full">⛶ Pantalla completa</button>';
        h_ += st.mode === 'simple' ? '<button data-a="mode" data-m="completo">🖥️ Ver el escritorio completo</button>' : '<button data-a="mode" data-m="simple">✨ Volver al modo simple</button>';
        h_ += '<button data-a="panel">↩ Ir a mi panel</button>';
      }
      if (msg) h_ += '<div class="msg">' + h(msg) + '</div>';
      h_ += '</div>';
    }
    box.className = (embedded ? 'emb ' : '') + (open ? '' : 'mini-auto');
    box.innerHTML = h_;
  }
  function api(p, body) {
    return fetch('/__localia/' + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Localia': '1' }, body: JSON.stringify(body), credentials: 'same-origin' } : { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); });
  }
  function load() { return api('state').then(function (j) { st = j; render(); }).catch(function () {}); }
  function check() {
    msg = 'Chequeando…'; render();
    return api('identity').then(function (j) { st.identity = j.identity; var i = j.identity; msg = i && i.online ? 'IP ' + i.ip + ' · ' + (i.city || '') + ', ' + (N[i.country] || i.country) : 'Sin internet ahora mismo'; render(); });
  }
  function listFiles() { return api('files').then(function (j) { files = j.files || []; if (j.error) msg = j.error; render(); }).catch(function () { files = []; msg = 'Tu PC no respondió.'; render(); }); }
  pick.addEventListener('change', function () {
    var f = pick.files && pick.files[0]; pick.value = ''; if (!f) return;
    if (st.maxUpload && f.size > st.maxUpload) { msg = 'Ese archivo es muy grande (máximo ' + Math.round(st.maxUpload / 1048576) + ' MB).'; open = true; return render(); }
    busy = true; open = true; msg = 'Subiendo "' + f.name + '"…'; render();
    fetch('/__localia/upload?name=' + encodeURIComponent(f.name), { method: 'POST', headers: { 'X-Localia': '1', 'Content-Type': 'application/octet-stream' }, body: f, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) { busy = false; msg = j.ok ? 'Listo. Cuando el sitio te pida el archivo, buscá "' + j.name + '" en la carpeta Descargas.' : (j.error || 'No se pudo subir.'); if (files) return listFiles(); render(); })
      .catch(function () { busy = false; msg = 'No se pudo subir. Probá de nuevo.'; render(); });
  });
  box.addEventListener('click', function (e) {
    var t = e.target.closest('[data-a]'); if (!t || busy) return; var a = t.getAttribute('data-a');
    if (a === 'toggle') { open = !open; msg = ''; files = null; render(); }
    if (a === 'up') pick.click();
    if (a === 'down') { msg = ''; listFiles(); }
    if (a === 'mode') {
      var m = t.getAttribute('data-m'); busy = true; msg = m === 'simple' ? 'Pasando al modo simple…' : 'Abriendo el escritorio completo…'; render();
      api('mode', { mode: m }).then(function (j) { busy = false; if (j.error) { msg = j.error; return render(); } st.mode = j.mode; msg = 'Listo. La pantalla se reconecta sola en unos segundos.'; render(); })
        .catch(function () { busy = false; msg = 'No se pudo cambiar. Probá de nuevo.'; render(); });
    }
    if (a === 'exit') {
      var c = t.getAttribute('data-c'); if (c === st.active) return;
      busy = true; msg = 'Cambiando a ' + name(c) + '… (tu PC no sale a internet hasta que esté listo)'; render();
      api('exit', { code: c }).then(function () { st.active = c; st.identity = null; return new Promise(function (r) { setTimeout(r, 2500); }); })
        .then(check).then(function () { busy = false; render(); }).catch(function () { busy = false; msg = 'No se pudo cambiar. Probá de nuevo.'; render(); });
    }
    if (a === 'check') check();
    if (a === 'full') { var d = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (d.requestFullscreen) d.requestFullscreen(); }
    if (a === 'panel') location.href = st.portal;
  });
  document.addEventListener('click', function (e) { if (open && !busy && !box.contains(e.target)) { open = false; render(); } }, true);
  load().then(function () { if (!embedded && (!st || !st.identity)) check(); });
  setInterval(load, 30000);
})();

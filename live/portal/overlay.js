/* Localía · botón flotante del acceso directo a la PC (https://pc-<id>.…/).
   Permite cambiar de país, verificar la IP y volver al panel sin pasar por el portal.
   Dentro del portal (iframe) no se muestra: ahí ya está la barra de arriba. */
(function () {
  if (window.top !== window) return;
  var N = { US: 'Estados Unidos', BR: 'Brasil', AR: 'Argentina', UY: 'Uruguay', IL: 'Israel', ES: 'España', CL: 'Chile', MX: 'México', PE: 'Perú', CO: 'Colombia', PY: 'Paraguay' };
  var st = null, open = false, busy = false, msg = '';
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
    '#lcl hr{border:0;border-top:1px solid #2c4262;margin:8px 0}#lcl .msg{font-size:12.5px;color:#9fb2c9;padding:4px 10px 2px}';
  document.head.appendChild(css);
  var box = document.createElement('div'); box.id = 'lcl'; document.body.appendChild(box);
  function name(c) { var e = st && st.exits.find(function (x) { return x.code === c; }); return e ? e.name : (N[c] || c); }
  function render() {
    if (!st) return;
    var id = st.identity, where = id && id.online ? (id.city || '') + ', ' + (N[id.country] || id.country) : name(st.active);
    var h = '<div class="pill" data-a="toggle"><span class="dot" style="' + (id && id.online === false ? 'background:#f07068' : '') + '"></span><span class="txt">Te ven en <b>' + where + '</b> ▾</span></div>';
    if (open) {
      h += '<div class="menu"><div class="k">Localía · ' + st.name + '</div>';
      st.exits.forEach(function (e) { h += '<button data-a="exit" data-c="' + e.code + '" class="' + (e.code === st.active ? 'on' : '') + '"><span class="code">' + e.code + '</span>' + e.name + ' <span style="opacity:.6">· ' + e.city + '</span></button>'; });
      h += '<hr><button data-a="check">🛡️ Verificar mi IP</button><button data-a="full">⛶ Pantalla completa</button><button data-a="panel">↩ Ir a mi panel</button>';
      if (msg) h += '<div class="msg">' + msg + '</div>';
      h += '</div>';
    }
    box.className = open ? '' : 'mini-auto';
    box.innerHTML = h;
  }
  function api(p, body) {
    return fetch('/__localia/' + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' } : { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); });
  }
  function load() { return api('state').then(function (j) { st = j; render(); }).catch(function () {}); }
  function check() {
    msg = 'Chequeando…'; render();
    return api('identity').then(function (j) { st.identity = j.identity; var i = j.identity; msg = i && i.online ? 'IP ' + i.ip + ' · ' + (i.city || '') + ', ' + (N[i.country] || i.country) : 'Sin internet ahora mismo'; render(); });
  }
  box.addEventListener('click', function (e) {
    var t = e.target.closest('[data-a]'); if (!t || busy) return; var a = t.getAttribute('data-a');
    if (a === 'toggle') { open = !open; msg = ''; render(); }
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
  document.addEventListener('click', function (e) { if (open && !box.contains(e.target)) { open = false; render(); } }, true);
  load().then(function () { if (!st || !st.identity) check(); });
  setInterval(load, 30000);
})();

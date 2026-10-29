/* Localía · botón flotante del acceso directo a la PC (https://pc-<id>.…/).
   Permite cambiar de país, verificar la IP, pasar archivos entre tu compu y la PC, y volver al panel.
   Dentro del portal (iframe) la barra de arriba ya cambia el país: ahí solo se muestra "Archivos". */
(function () {
  var embedded = window.top !== window;
  var N = { US: 'Estados Unidos', BR: 'Brasil', AR: 'Argentina', UY: 'Uruguay', IL: 'Israel', ES: 'España', CL: 'Chile', MX: 'México', PE: 'Perú', CO: 'Colombia', PY: 'Paraguay' };
  var st = null, open = false, busy = false, msg = '', files = null, chat = { unread: 0, lastIn: null, sound: true };
  // Aviso sonoro: suena en el navegador del dueño (la PC virtual no tiene parlantes). El navegador pide un clic o tecla antes de dejar sonar.
  var ac = null;
  function unlock() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, unlock, { capture: true, passive: true }); });
  function beep() { if (!ac || ac.state !== 'running') return; var t = ac.currentTime; [[880, 0], [1175, .16]].forEach(function (p) { var o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = p[0]; g.gain.setValueAtTime(.0001, t + p[1]); g.gain.exponentialRampToValueAtTime(.25, t + p[1] + .02); g.gain.exponentialRampToValueAtTime(.0001, t + p[1] + .3); o.connect(g); g.connect(ac.destination); o.start(t + p[1]); o.stop(t + p[1] + .32); }); window.__beeps = (window.__beeps || 0) + 1; }
  function pollChat() { if (!st || !st.chat) return Promise.resolve(); return fetch('/__localia/chat/api/unread', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (!j) return; var fresh = chat.lastIn !== null && j.lastIn > chat.lastIn; var ch = j.unread !== chat.unread || j.sound !== chat.sound; chat = { unread: j.unread, lastIn: j.lastIn, sound: j.sound }; if (fresh && j.sound) beep(); if (ch || fresh) render(); }).catch(function () {}); }
  var css = document.createElement('style');
  css.textContent =
    '#lcl{position:fixed;top:10px;right:10px;z-index:2147483000;font:14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e6edf6}' +
    '#lcl .pill{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:rgba(12,26,44,.88);border:1px solid #2c4262;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);user-select:none}' +
    '#lcl .pill b{color:#fff}#lcl .dot{width:8px;height:8px;border-radius:50%;background:#43c690;flex:none}' +
    '#lcl.mini .pill .txt,#lcl.mini .pill .dot{display:none}#lcl.mini .pill{padding:0;width:40px;height:40px;justify-content:center;opacity:.6;font-size:18px}#lcl.mini .pill:hover,#lcl.drag .pill{opacity:1}' +
    '#lcl .pill{touch-action:none}#lcl .nb{background:#e2b04e;color:#0c1a2c;border-radius:999px;padding:0 7px;font-weight:700;font-size:12.5px}#lcl.mini .nb{position:absolute;top:-6px;right:-8px;padding:0 6px}' +
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
  // Compacto: cerrado se ve solo el ícono (el texto se muestra los primeros segundos). Se puede arrastrar a cualquier borde y queda guardado.
  var compact = false, dragging = false, moved = false, dragEnd = 0, pos = null, PK = 'localia-boton-' + (embedded ? 'portal' : 'pc');
  try { pos = JSON.parse(localStorage.getItem(PK) || 'null'); } catch (e) {}
  compact = !!pos;   // si ya lo movió alguna vez, conoce el botón: arranca compacto
  setTimeout(function () { compact = true; render(); }, 5000);
  function place() {
    if (!pos) { box.style.left = box.style.top = ''; box.style.right = ''; return; }
    var w = box.offsetWidth || 40, hgt = box.offsetHeight || 40;
    var x = Math.round(pos.x * innerWidth), y = Math.round(pos.y * innerHeight);
    x = Math.max(6, Math.min(x, innerWidth - w - 6)); y = Math.max(6, Math.min(y, innerHeight - hgt - 6));
    box.style.right = 'auto'; box.style.bottom = 'auto'; box.style.left = x + 'px'; box.style.top = y + 'px';
  }
  window.addEventListener('resize', place);
  var sx = 0, sy = 0, ox = 0, oy = 0;
  box.addEventListener('pointerdown', function (e) {
    if (open || !e.target.closest('.pill')) return;
    var r = box.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; moved = false; dragging = true;
  });
  // El movimiento se escucha en toda la ventana: un dedo rápido sale del botón antes del primer evento
  window.addEventListener('pointermove', function (e) {
    if (!dragging) return; var dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 8) return;
    if (!moved) { moved = true; box.classList.add('drag'); }
    pos = { x: (ox + dx) / innerWidth, y: (oy + dy) / innerHeight }; place();
  });
  function endDrag() { if (!dragging) return; dragging = false; box.classList.remove('drag'); if (moved) { dragEnd = Date.now(); moved = false; try { localStorage.setItem(PK, JSON.stringify(pos)); } catch (x) {} } }
  window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
  // Teclado en el celular: el escritorio remoto no puede abrir el teclado del teléfono por su cuenta.
  // En pantallas táctiles se muestra un botón fijo que activa el campo de teclado de KasmVNC (noVNC_keyboardinput).
  var touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  function keyboard() {
    var kb = document.getElementById('noVNC_keyboard_button'), ki = document.getElementById('noVNC_keyboardinput');
    if (ki && document.activeElement === ki) { ki.blur(); return false; }   // segundo toque: lo cierra
    if (kb) kb.click();
    if (ki && document.activeElement !== ki) { ki.focus(); }
    return !!ki;
  }
  if (touch) {
    var kbtn = document.createElement('button'); kbtn.type = 'button'; kbtn.id = 'lclkb'; kbtn.setAttribute('aria-label', 'Abrir el teclado'); kbtn.textContent = '⌨️';
    kbtn.style.cssText = 'position:fixed;left:12px;bottom:14px;z-index:2147483000;width:52px;height:52px;border-radius:50%;border:1px solid #2c4262;background:rgba(12,26,44,.9);color:#fff;font-size:24px;box-shadow:0 6px 20px rgba(0,0,0,.35);touch-action:manipulation';
    // pointerdown + preventDefault: el foco no se va del campo de teclado al tocar el botón
    kbtn.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    kbtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); keyboard(); });
    document.body.appendChild(kbtn);
  }
  // Scroll con un dedo en el celular: el escritorio remoto trata el dedo como un mouse (arrastrar = seleccionar).
  // Acá un dedo que se desliza manda la rueda del mouse (con inercia, como en el teléfono), un toque corto es un clic
  // y un toque largo es clic derecho. Con dos dedos queda el comportamiento original (zoom).
  if (touch) (function () {
    var K = 1.4, g = null, inertia = 0;
    // En el celular se oculta la barra lateral de KasmVNC (en inglés, se abre sola y tapa la pantalla): el teclado, los archivos y la pantalla completa ya están en nuestro botón.
    var hideBar = document.createElement('style'); hideBar.textContent = '#noVNC_control_bar_anchor{display:none!important}'; document.head.appendChild(hideBar);
    function screenCanvas(t) { if (!t || !t.closest || t.closest('#lcl,#lclkb') || !t.closest('#noVNC_container,#noVNC_screen,canvas')) return null; return document.querySelector('#noVNC_container canvas') || document.querySelector('canvas'); }
    function mouse(cv, type, x, y, btn) { cv.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, screenX: x, screenY: y, bubbles: true, cancelable: true, view: window, button: btn || 0, buttons: type === 'mouseup' ? 0 : (btn === 2 ? 2 : 1) })); }
    function wheel(cv, x, y, dx, dy) { cv.dispatchEvent(new WheelEvent('wheel', { clientX: x, clientY: y, deltaX: dx, deltaY: dy, deltaMode: 0, bubbles: true, cancelable: true, view: window })); }
    function stop(e) { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); }
    document.addEventListener('touchstart', function (e) {
      clearTimeout(inertia);
      if (e.touches.length !== 1) { g = null; return; }
      var cv = screenCanvas(e.target); if (!cv) { g = null; return; }
      var p = e.touches[0], t = Date.now();
      g = { cv: cv, x: p.clientX, y: p.clientY, lx: p.clientX, ly: p.clientY, t: t, lt: t, scroll: false, vx: 0, vy: 0 };
      stop(e);
    }, { capture: true, passive: false });
    document.addEventListener('touchmove', function (e) {
      if (!g) return; if (e.touches.length !== 1) { g = null; return; }
      var p = e.touches[0], t = Date.now();
      if (!g.scroll && Math.abs(p.clientX - g.x) + Math.abs(p.clientY - g.y) > 10) g.scroll = true;
      if (g.scroll) {
        var dx = g.lx - p.clientX, dy = g.ly - p.clientY, dt = Math.max(1, t - g.lt);
        wheel(g.cv, p.clientX, p.clientY, dx * K, dy * K);
        g.vx = 0.8 * (dx / dt) + 0.2 * g.vx; g.vy = 0.8 * (dy / dt) + 0.2 * g.vy;
      }
      g.lx = p.clientX; g.ly = p.clientY; g.lt = t; stop(e);
    }, { capture: true, passive: false });
    document.addEventListener('touchend', function (e) {
      if (!g) return; var s = g; g = null; stop(e);
      if (!s.scroll) {   // toque: clic (largo = clic derecho)
        var right = Date.now() - s.t > 550;
        mouse(s.cv, 'mousemove', s.x, s.y); mouse(s.cv, 'mousedown', s.x, s.y, right ? 2 : 0);
        setTimeout(function () { mouse(s.cv, 'mouseup', s.x, s.y, right ? 2 : 0); }, 40);
        return;
      }
      // inercia: sigue deslizando y frena de a poco
      var vx = s.vx, vy = s.vy, last = Date.now();
      if (Math.abs(vy) + Math.abs(vx) < 0.3 || Date.now() - s.lt > 120) return;
      inertia = setTimeout(function step() {
        var t = Date.now(), dt = Math.min(50, Math.max(1, t - last)); last = t; vx *= Math.pow(0.995, dt); vy *= Math.pow(0.995, dt);
        if (Math.abs(vy) + Math.abs(vx) < 0.05) return;
        wheel(s.cv, s.lx, s.ly, vx * dt * K, vy * dt * K); inertia = setTimeout(step, 16);
      }, 16);
    }, { capture: true, passive: false });
    document.addEventListener('touchcancel', function () { g = null; }, true);
  })();
  var pick = document.createElement('input'); pick.type = 'file'; pick.style.display = 'none'; document.body.appendChild(pick);
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function size(n) { return n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function name(c) { var e = st && st.exits.find(function (x) { return x.code === c; }); return e ? e.name : (N[c] || c); }
  function render() {
    if (!st) return;
    var id = st.identity, where = id && id.online ? (id.city || '') + ', ' + (N[id.country] || id.country) : name(st.active);
    var nb = chat.unread ? '<span class="nb">💬 ' + chat.unread + '</span>' : '';
    var h_ = embedded ? '<div class="pill" data-a="toggle" title="Archivos (podés moverlo)"><span class="ico">📁</span><span class="txt"><b>' + (st.chat ? 'Archivos y chats' : 'Archivos') + '</b> ▴</span>' + nb + '</div>'
      : '<div class="pill" data-a="toggle" title="Archivos y opciones (podés moverlo)"><span class="dot" style="' + (id && id.online === false ? 'background:#f07068' : '') + '"></span>' + '<span class="ico">📁</span><span class="txt">' + (st.direct ? '<b>Archivos y opciones</b>' : 'Te ven en <b>' + h(where) + '</b>') + ' ▾</span>' + nb + '</div>';
    if (open) {
      h_ += '<div class="menu"><div class="k">Localía · ' + h(st.name) + '</div>';
      if (!embedded && st.exits.length > 1) {
        st.exits.forEach(function (e) { h_ += '<button data-a="exit" data-c="' + h(e.code) + '" class="' + (e.code === st.active ? 'on' : '') + '"><span class="code">' + h(e.code) + '</span>' + h(e.name) + ' <span style="opacity:.6">· ' + h(e.city) + '</span></button>'; });
        h_ += '<hr>';
      }
      if (st.chat) h_ += '<button data-a="chat">💬 Mis chats' + (chat.unread ? ' <b>(' + chat.unread + ' sin leer)</b>' : '') + '</button><button data-a="sound">' + (chat.sound ? '🔔 Sonido de mensajes: prendido' : '🔕 Sonido de mensajes: apagado') + '</button>';
      h_ += '<button data-a="up">⬆️ Subir un archivo desde mi compu</button><button data-a="down">⬇️ Bajar archivos a mi compu</button>';
      if (files) {
        h_ += '<div class="fl">' + (files.length ? files.map(function (f) { return '<a class="f" href="/__localia/file/' + encodeURIComponent(f.name) + '" download="' + h(f.name) + '"><span>' + h(f.name) + '</span><small>' + size(f.size) + '</small></a>'; }).join('')
          : '<div class="msg">Todavía no hay nada. Lo que bajes adentro de la PC (un comprobante, un PDF) aparece acá.</div>') + '</div>';
      }
      if (!embedded) {
        h_ += '<hr>' + (touch ? '<button data-a="kb">⌨️ Abrir el teclado</button>' : '') + (st.direct ? '' : '<button data-a="check">🛡️ Verificar mi IP</button>') + '<button data-a="full">⛶ Pantalla completa</button>';
        h_ += st.mode === 'simple' ? '<button data-a="mode" data-m="completo">🖥️ Ver el escritorio completo</button>' : '<button data-a="mode" data-m="simple">✨ Volver al modo simple</button>';
        h_ += '<button data-a="panel">↩ Ir a mi panel</button>';
      }
      if (msg) h_ += '<div class="msg">' + h(msg) + '</div>';
      h_ += '</div>';
    }
    box.className = (embedded && !pos ? 'emb ' : '') + (open || !compact ? '' : 'mini') + (dragging ? ' drag' : '');
    box.innerHTML = h_;
    place();
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
    if (Date.now() - dragEnd < 250) return;   // fue un arrastre, no un toque
    var t = e.target.closest('[data-a]'); if (!t || busy) return; var a = t.getAttribute('data-a');
    if (a === 'toggle') { open = !open; msg = ''; files = null; render(); }
    if (a === 'kb') { open = false; render(); keyboard(); }
    if (a === 'chat') window.open('/__localia/chat/', '_blank');
    if (a === 'sound') { var on = !chat.sound; api('chat/api/settings', { sound: on }).then(function (j) { chat.sound = j.sound; if (j.sound) { unlock(); setTimeout(beep, 150); } render(); }).catch(function () {}); }
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
  setTimeout(pollChat, 1500); setInterval(pollChat, 4000);
})();

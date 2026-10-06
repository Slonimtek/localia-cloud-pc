// Localía · chat privado de cada PC.
// El dueño de la PC carga un contacto y le manda una invitación (un link personal, pensado para WhatsApp).
// El cliente abre el link y chatea desde el navegador, sin cuenta ni contraseña: el link es su llave.
// El dueño atiende todas las conversaciones desde la bandeja, adentro de su PC.
// Además cada PC tiene un link general (/chat/<clave>): quien entra deja nombre y WhatsApp y queda como contacto nuevo.
// Datos: un archivo JSON por PC en DATA/chat/<pc>.json y los adjuntos en DATA/chat/<pc>/.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

module.exports = ({ DATA, PORTAL_HOST, send, body, getPc, listPcs, clientIp, log }) => {
  const DIR = path.join(DATA, 'chat'); fs.mkdirSync(DIR, { recursive: true });
  const UI = path.join(__dirname, 'chat-ui');
  const MAX_FILE = 25 * 1024 * 1024, MAX_TEXT = 4000, MAX_CONTACTS = 500;
  const IMG = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
  const now = () => new Date().toISOString();

  // ---------- datos ----------
  const cache = {}, timers = {};
  function load(id) {
    if (!cache[id]) { try { cache[id] = JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8')); } catch (e) { cache[id] = { name: '', seq: 0, contacts: [], messages: [] }; } }
    return cache[id];
  }
  function save(id) { clearTimeout(timers[id]); timers[id] = setTimeout(() => { const f = path.join(DIR, id + '.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(cache[id])); fs.renameSync(f + '.tmp', f); }, 150); }
  const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n);
  // Link general de la PC: la clave se crea sola la primera vez; el dueño puede cambiarla o cerrar el link.
  function generalKey(pcId) { const c = load(pcId); if (!c.key) { c.key = crypto.randomBytes(6).toString('hex'); save(pcId); } return c.key; }
  const generalUrl = pcId => `https://${PORTAL_HOST}/chat/${generalKey(pcId)}`;
  function byKey(key) { if (!/^[a-f0-9]{12}$/.test(String(key || ''))) return null; const pc = listPcs().find(p => load(p.id).key === key); if (!pc || load(pc.id).open === false) return null; return { pc, c: load(pc.id) }; }
  const joins = new Map();   // altas por el link general: por IP (5 por hora) y por PC (60 por día)
  function joinLimit(k, max, ms) { const t = Date.now(); const a = (joins.get(k) || []).filter(x => t - x < ms); if (a.length >= max) { joins.set(k, a); return true; } a.push(t); joins.set(k, a); return false; }
  const inviteUrl = ct => `https://${PORTAL_HOST}/c/${ct.token}`;
  const pubMsg = m => ({ id: m.id, from: m.from, text: m.text || '', at: m.at, file: m.file ? { name: m.file.name, size: m.file.size, image: !!m.file.image } : null });
  function addMessage(pcId, ct, from, text, file) {
    const c = load(pcId); const m = { id: ++c.seq, contact: ct.id, from, text: text || '', file: file || null, at: now() };
    c.messages.push(m); ct.lastAt = m.at; ct.lastText = file ? '📎 ' + file.name : m.text.slice(0, 80);
    if (from === 'client') { ct.unread = (ct.unread || 0) + 1; ct.joinedAt = ct.joinedAt || m.at; c.lastIn = m.id; }
    save(pcId); return m;
  }
  const thread = (c, ct, after) => c.messages.filter(m => m.contact === ct.id && m.id > after).map(pubMsg);

  // ---------- adjuntos ----------
  function receiveFile(req, pcId, rawName) {
    return new Promise((resolve, reject) => {
      const len = +req.headers['content-length'] || 0;
      const name = clean(path.basename(String(rawName || '').replace(/\\/g, '/')), 120).replace(/^\.+/, '');
      if (!name) return reject({ code: 400, error: 'Falta el nombre del archivo.' });
      if (len <= 0) return reject({ code: 400, error: 'El archivo está vacío.' });
      if (len > MAX_FILE) return reject({ code: 413, error: `El archivo es muy grande (máximo ${MAX_FILE / 1048576} MB).` });
      const dir = path.join(DIR, pcId); fs.mkdirSync(dir, { recursive: true });
      const stored = crypto.randomBytes(16).toString('hex'); const dest = path.join(dir, stored); const out = fs.createWriteStream(dest, { mode: 0o600 });
      let got = 0, failed = false;
      const fail = e => { if (failed) return; failed = true; out.destroy(); fs.unlink(dest, () => {}); reject(e); };
      req.on('data', ch => { got += ch.length; if (got > MAX_FILE) { req.destroy(); fail({ code: 413, error: 'El archivo es muy grande.' }); } });
      req.on('error', () => fail({ code: 400, error: 'Se cortó la subida.' }));
      out.on('error', () => fail({ code: 500, error: 'No se pudo guardar el archivo.' }));
      out.on('finish', () => { if (failed) return; if (got !== len) return fail({ code: 400, error: 'Se cortó la subida.' }); resolve({ name, size: got, stored, image: !!IMG[path.extname(name).toLowerCase()] }); });
      req.pipe(out);
    });
  }
  function serveFile(res, pcId, c, ct, id) {
    const m = c.messages.find(x => x.id === +id && x.contact === ct.id && x.file); const f = m && path.join(DIR, pcId, m.file.stored);
    if (!f || !/^[a-f0-9]{32}$/.test(m.file.stored) || !fs.existsSync(f)) return send(res, 404, { error: 'No encontramos ese archivo.' });
    const type = IMG[path.extname(m.file.name).toLowerCase()];
    res.writeHead(200, { 'Content-Type': type || 'application/octet-stream', 'Content-Length': m.file.size, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `${type ? 'inline' : 'attachment'}; filename="${m.file.name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(m.file.name)}` });
    fs.createReadStream(f).pipe(res);
  }
  function page(res, file) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); fs.createReadStream(path.join(UI, file)).pipe(res); }

  // ---------- bandeja del dueño (ya autenticado por quien llama: sesión del portal o la propia PC) ----------
  async function owner(req, res, sub, pc) {
    const c = load(pc.id); const url = new URL(req.url, 'http://x'); const m = req.method;
    if (sub === '') return page(res, 'bandeja.html');
    if (m === 'POST' && req.headers['x-localia'] !== '1') return send(res, 403, { error: 'No permitido.' });
    const pubCt = ct => ({ id: ct.id, name: ct.name, phone: ct.phone, notes: ct.notes || '', blocked: !!ct.blocked, joined: !!ct.joinedAt, via: ct.via || 'invite', createdAt: ct.createdAt, lastAt: ct.lastAt || null, lastText: ct.lastText || '', unread: ct.unread || 0, invite: inviteUrl(ct) });
    if (sub === 'api/state' && m === 'GET') return send(res, 200, { name: c.name || pc.name, pcName: pc.name, contacts: c.contacts.map(pubCt).sort((a, b) => String(b.lastAt || b.createdAt).localeCompare(String(a.lastAt || a.createdAt))), maxFile: MAX_FILE, sound: c.sound !== false, lastIn: c.lastIn || 0, general: { open: c.open !== false, url: generalUrl(pc.id) } });
    // Resumen liviano para el aviso sonoro y el contador del botón flotante
    if (sub === 'api/unread' && m === 'GET') return send(res, 200, { unread: c.contacts.reduce((a, x) => a + (x.unread || 0), 0), lastIn: c.lastIn || 0, sound: c.sound !== false });
    if (sub === 'api/settings' && m === 'POST') { const b = await body(req); if (b.name !== undefined) c.name = clean(b.name, 60); if (b.sound !== undefined) c.sound = !!b.sound; if (b.open !== undefined) c.open = !!b.open; if (b.newKey === true) c.key = crypto.randomBytes(6).toString('hex');   // el link anterior deja de funcionar
      save(pc.id); return send(res, 200, { name: c.name || pc.name, sound: c.sound !== false, general: { open: c.open !== false, url: generalUrl(pc.id) } }); }
    if (sub === 'api/contacts' && m === 'POST') {
      const b = await body(req); const name = clean(b.name, 60); const phone = clean(b.phone, 30).replace(/[^\d+]/g, '');
      if (!name) return send(res, 400, { error: 'Poné el nombre del contacto.' });
      if (c.contacts.length >= MAX_CONTACTS) return send(res, 429, { error: 'Llegaste al máximo de contactos.' });
      const ct = { id: crypto.randomBytes(5).toString('hex'), name, phone, notes: clean(b.notes, 500), token: pc.id + '-' + crypto.randomBytes(16).toString('hex'), createdAt: now(), unread: 0 };
      c.contacts.push(ct); save(pc.id); if (log) log(pc, `Chat: nuevo contacto "${name}"`); return send(res, 200, { contact: pubCt(ct) });
    }
    const cm = sub.match(/^api\/contacts\/([a-f0-9]{10})(\/delete)?$/);
    if (cm && m === 'POST') {
      const ct = c.contacts.find(x => x.id === cm[1]); if (!ct) return send(res, 404, { error: 'No encontramos ese contacto.' });
      if (cm[2]) {   // borra el contacto, su conversación y sus adjuntos; el link deja de funcionar
        for (const x of c.messages) if (x.contact === ct.id && x.file && /^[a-f0-9]{32}$/.test(x.file.stored)) fs.unlink(path.join(DIR, pc.id, x.file.stored), () => {});
        c.messages = c.messages.filter(x => x.contact !== ct.id); c.contacts = c.contacts.filter(x => x !== ct); save(pc.id); return send(res, 200, { ok: true });
      }
      const b = await body(req);
      if (b.name !== undefined) { const n = clean(b.name, 60); if (!n) return send(res, 400, { error: 'El nombre no puede quedar vacío.' }); ct.name = n; }
      if (b.phone !== undefined) ct.phone = clean(b.phone, 30).replace(/[^\d+]/g, '');
      if (b.notes !== undefined) ct.notes = clean(b.notes, 500);
      if (b.blocked !== undefined) ct.blocked = !!b.blocked;
      save(pc.id); return send(res, 200, { contact: pubCt(ct) });
    }
    const ct = c.contacts.find(x => x.id === url.searchParams.get('contact'));
    if (sub === 'api/messages' && m === 'GET') { if (!ct) return send(res, 404, { error: 'No encontramos ese contacto.' }); if (ct.unread) { ct.unread = 0; save(pc.id); } return send(res, 200, { messages: thread(c, ct, +url.searchParams.get('after') || 0) }); }
    if (sub === 'api/send' && m === 'POST') {
      const b = await body(req); const to = c.contacts.find(x => x.id === b.contact); const text = clean(b.text, MAX_TEXT);
      if (!to) return send(res, 404, { error: 'No encontramos ese contacto.' }); if (!text) return send(res, 400, { error: 'Escribí un mensaje.' });
      return send(res, 200, { message: pubMsg(addMessage(pc.id, to, 'owner', text)) });
    }
    if (sub === 'api/upload' && m === 'POST') {
      if (!ct) return send(res, 404, { error: 'No encontramos ese contacto.' });
      try { const f = await receiveFile(req, pc.id, url.searchParams.get('name')); return send(res, 200, { message: pubMsg(addMessage(pc.id, ct, 'owner', '', f)) }); } catch (e) { return send(res, e.code || 500, { error: e.error || 'No se pudo subir.' }); }
    }
    const fm = sub.match(/^api\/file\/(\d+)$/);
    if (fm && m === 'GET') { const owner_ = c.messages.find(x => x.id === +fm[1]); const fc = owner_ && c.contacts.find(x => x.id === owner_.contact); if (!fc) return send(res, 404, { error: 'No encontramos ese archivo.' }); return serveFile(res, pc.id, c, fc, fm[1]); }
    return send(res, 404, { error: 'No existe.' });
  }

  // ---------- cliente (público: el link personal es la llave) ----------
  const rate = new Map();   // contacto → marcas de tiempo de los últimos envíos
  function tooFast(id) { const t = Date.now(); const a = (rate.get(id) || []).filter(x => t - x < 60000); if (a.length >= 30 || (a.length && t - a[a.length - 1] < 400)) { rate.set(id, a); return true; } a.push(t); rate.set(id, a); return false; }
  function byToken(token) {
    const tm = String(token || '').match(/^([a-z0-9]{4,12})-[a-f0-9]{32}$/); if (!tm) return null;
    const pc = getPc(tm[1]); if (!pc) return null;
    const c = load(pc.id); const ct = c.contacts.find(x => x.token === token); if (!ct || ct.blocked) return null;
    return { pc, c, ct };
  }
  async function client(req, res, url) {
    const m = req.method;
    const gone = () => { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Localía</title><p style="font:17px system-ui;padding:32px;max-width:480px;margin:auto">Este link de chat ya no está disponible. Pedile uno nuevo a quien te lo pasó.</p>'); };
    // ----- link general de la PC: la persona deja sus datos y queda como contacto nuevo -----
    const gp = url.pathname.match(/^\/chat\/([^/]+)\/?$/); if (gp) return byKey(gp[1]) ? page(res, 'entrada.html') : gone();
    const ga = url.pathname.match(/^\/api\/chat\/g\/([^/]+)\/(info|join)$/);
    if (ga) {
      const g = byKey(ga[1]); if (!g) return send(res, 404, { error: 'Este link de chat ya no está disponible.' });
      if (ga[2] === 'info' && m === 'GET') return send(res, 200, { business: g.c.name || g.pc.name });
      if (ga[2] === 'join' && m === 'POST') {
        const b = await body(req); const name = clean(b.name, 60); const phone = clean(b.phone, 30).replace(/[^\d+]/g, '');
        if (name.length < 2) return send(res, 400, { error: 'Poné tu nombre.' });
        if (phone.replace(/\D/g, '').length < 7) return send(res, 400, { error: 'Poné tu WhatsApp con el código de país.' });
        if (g.c.contacts.length >= MAX_CONTACTS) return send(res, 429, { error: 'En este momento no se pueden sumar más personas. Probá más tarde.' });
        if (joinLimit('ip:' + clientIp(req), 5, 3600e3) || joinLimit('pc:' + g.pc.id, 60, 86400e3)) return send(res, 429, { error: 'Hubo muchos ingresos seguidos. Probá de nuevo en un rato.' });
        const ct = { id: crypto.randomBytes(5).toString('hex'), name, phone, notes: '', token: g.pc.id + '-' + crypto.randomBytes(16).toString('hex'), createdAt: now(), joinedAt: now(), via: 'link', unread: 0 };
        g.c.contacts.push(ct); save(g.pc.id); if (log) log(g.pc, `Chat: "${name}" entró por el link general`);
        return send(res, 200, { token: ct.token });
      }
      return send(res, 404, { error: 'No existe.' });
    }
    const pm = url.pathname.match(/^\/c\/([^/]+)\/?$/);
    if (pm) { if (!byToken(pm[1])) return gone(); return page(res, 'cliente.html'); }
    const am = url.pathname.match(/^\/api\/chat\/c\/([^/]+)\/(.+)$/); const s = am && byToken(am[1]);
    if (!s) return send(res, 404, { error: 'Este link de chat ya no está disponible.' });
    const { pc, c, ct } = s; const act = am[2];
    if (act === 'state' && m === 'GET') { ct.lastSeen = now(); if (!ct.joinedAt) { ct.joinedAt = ct.lastSeen; save(pc.id); } return send(res, 200, { business: c.name || pc.name, me: ct.name, messages: thread(c, ct, +url.searchParams.get('after') || 0), maxFile: MAX_FILE }); }
    if (act === 'send' && m === 'POST') {
      const b = await body(req); const text = clean(b.text, MAX_TEXT); if (!text) return send(res, 400, { error: 'Escribí un mensaje.' });
      if (tooFast(ct.id)) return send(res, 429, { error: 'Vas muy rápido. Esperá un momento.' });
      return send(res, 200, { message: pubMsg(addMessage(pc.id, ct, 'client', text)) });
    }
    if (act === 'upload' && m === 'POST') {
      if (tooFast(ct.id)) return send(res, 429, { error: 'Vas muy rápido. Esperá un momento.' });
      try { const f = await receiveFile(req, pc.id, url.searchParams.get('name')); return send(res, 200, { message: pubMsg(addMessage(pc.id, ct, 'client', '', f)) }); } catch (e) { return send(res, e.code || 500, { error: e.error || 'No se pudo subir.' }); }
    }
    const fm = act.match(/^file\/(\d+)$/); if (fm && m === 'GET') return serveFile(res, pc.id, c, ct, fm[1]);
    return send(res, 404, { error: 'No existe.' });
  }
  return { owner, client };
};

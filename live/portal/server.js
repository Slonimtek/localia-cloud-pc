// Localía · portal en vivo (gateway). Node 18+, sin framework.
// - Web + API del cliente (cuentas, PCs, países) y vista de operación.
// - Crea/prende/apaga PCs reales (AWS o Hetzner, ver providers.js) y decide por qué país sale cada PC (ip rule → túnel WireGuard).
// - Muestra el escritorio de cada PC (KasmVNC) en pc-<id>.<BASE> con la sesión del portal.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const httpProxy = require('http-proxy');
const providers = require('./providers');

// ---------- configuración ----------
function loadEnv(file) {
  const out = {};
  try { for (const l of fs.readFileSync(file, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2]; } } catch (e) {}
  return out;
}
const ENV = { ...loadEnv('/etc/localia/portal.env'), ...process.env };
const PORT = +(ENV.PORT || 3000);
const BASE = ENV.BASE_HOST;                        // ej. 100-57-206-149.sslip.io
const PORTAL_HOST = 'localia.' + BASE;
const DATA = ENV.DATA_DIR || '/var/lib/localia';
const PUBLIC = path.join(__dirname, 'public');
const EXITS = JSON.parse(fs.readFileSync(ENV.EXITS_FILE || '/etc/localia/exits.json', 'utf8'));
const cloud = providers(ENV);                      // dónde viven las PCs: CLOUD=aws (por defecto) o hetzner
const TIERS = cloud.tiers;
let awsExits = null; const exitCloud = () => cloud.name === 'aws' ? cloud : (awsExits || (awsExits = providers.aws(ENV)));   // salidas en AWS
const MAX_PCS_PER_USER = +(ENV.MAX_PCS_PER_USER || 2);
const MAX_PCS_TOTAL = +(ENV.MAX_PCS_TOTAL || 5);
const IDLE_STOP_MIN = +(ENV.IDLE_STOP_MIN ?? (cloud.billsWhenOff ? 0 : 120));   // 0 = no se apaga sola (donde apagada se cobra igual)

// ---------- datos (archivo JSON) ----------
fs.mkdirSync(DATA, { recursive: true });
const DBF = path.join(DATA, 'db.json');
let db = { users: [], pcs: [], events: [], exitTokens: [], exitPeers: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DBF, 'utf8')) }; } catch (e) {}
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { const tmp = DBF + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 1)); fs.renameSync(tmp, DBF); }, 200); }
const now = () => new Date().toISOString();
const rid = (n = 6) => crypto.randomBytes(8).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, n);
function ev(pc, text, kind = 'info') { const e = { at: now(), pc: pc && pc.id, text, kind }; db.events.unshift(e); db.events = db.events.slice(0, 300); if (pc) { pc.events = [e, ...(pc.events || [])].slice(0, 40); } save(); }

// Admin inicial desde el .env
if (ENV.ADMIN_EMAIL && ENV.ADMIN_PASSWORD && !db.users.find(u => u.email === ENV.ADMIN_EMAIL)) {
  db.users.push({ id: rid(8), email: ENV.ADMIN_EMAIL, name: ENV.ADMIN_NAME || 'Admin', pass: hashPass(ENV.ADMIN_PASSWORD), admin: true, createdAt: now() });
  save();
}

// ---------- auth ----------
function hashPass(p) { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(p, salt, 32).toString('hex'); }
function checkPass(p, h) { const [salt, hex] = String(h).split(':'); const a = crypto.scryptSync(p, salt, 32); const b = Buffer.from(hex || '', 'hex'); return b.length === a.length && crypto.timingSafeEqual(a, b); }
const SECRET = ENV.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
function sign(v) { return v + '.' + crypto.createHmac('sha256', SECRET).update(v).digest('base64url'); }
function unsign(s) { const i = String(s).lastIndexOf('.'); if (i < 0) return null; const v = s.slice(0, i); return sign(v) === s ? v : null; }
function cookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return o; }
function userOf(req) {
  const v = unsign(cookies(req).lsid || ''); if (!v) return null;
  const [uid, exp] = v.split('|'); if (+exp < Date.now()) return null;
  return db.users.find(u => u.id === uid) || null;
}
function setSession(req, res, u) {
  const v = sign(u.id + '|' + (Date.now() + 7 * 864e5));
  const local = /^(localhost|127\.0\.0\.1)$/.test(String(req.headers.host || '').split(':')[0]);   // pruebas por túnel SSH
  res.setHeader('Set-Cookie', `lsid=${encodeURIComponent(v)}; ${local ? '' : `Domain=${BASE}; Secure; `}Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`);
}
const pubUser = u => u && ({ id: u.id, email: u.email, name: u.name, admin: !!u.admin });

// ---------- utilidades ----------
function run(cmd, args, timeout = 8000) {
  return new Promise(resolve => execFile(cmd, args, { timeout }, (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || (err && err.message) || '').trim() })));
}
function send(res, code, obj, headers = {}) { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(b); }
function body(req) { return new Promise(r => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch (e) { r({}); } }); }); }
const exitBy = code => EXITS.find(x => x.code === code);
const exitOff = code => !!(db.exitOff || {})[code];   // salida apagada desde Operación: no se ofrece
const availableExits = () => EXITS.filter(x => (x.kind !== 'home' || !!(db.exitPeers || {})[x.code]) && !exitOff(x.code)).map(x => x.code);
// La PC arranca con un país por defecto; el usuario lo elige/cambia después, desde adentro de la PC.
const defaultExit = () => { const av = availableExits(); return av.includes(ENV.DEFAULT_EXIT) ? ENV.DEFAULT_EXIT : av[0]; };
async function fetchJSON(url, opts = {}, ms = 7000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ac.signal }); const j = await r.json().catch(() => ({})); return { status: r.status, json: j }; }
  catch (e) { return { status: 0, json: { error: String(e.name || e) } }; } finally { clearTimeout(t); }
}

// ---------- red: por qué país sale cada PC ----------
// Cada PC tiene una "ip rule from <ip> lookup <tabla del país>". La tabla tiene el túnel y, detrás, un blackhole:
// si el túnel cae, la PC se queda sin internet (nunca sale por el gateway).
async function rulesFor(ip) {
  const r = await run('ip', ['rule', 'show']);
  return r.out.split('\n').map(l => l.match(/^(\d+):\s+from (\S+) lookup (\S+)/)).filter(m => m && m[2] === ip).map(m => ({ prio: +m[1], table: m[3] }));
}
async function routePc(pc, code) {
  const ex = exitBy(code); if (!ex || !pc.privateIp) return false;
  const oct = +pc.privateIp.split('.').pop();
  const cur = await rulesFor(pc.privateIp);
  const A = 1000 + oct, B = 2000 + oct;
  const prio = cur.some(r => r.prio === A) ? B : A;
  if (!cur.some(r => r.table === String(ex.table) && r.prio === prio)) await run('ip', ['rule', 'add', 'from', pc.privateIp, 'lookup', String(ex.table), 'priority', String(prio)]);
  for (const r of await rulesFor(pc.privateIp)) if (!(r.prio === prio && r.table === String(ex.table))) await run('ip', ['rule', 'del', 'from', pc.privateIp, 'lookup', r.table, 'priority', String(r.prio)]);
  // Salida "gateway" (EE.UU. sale por la IP del propio gateway): solo las PCs de este set pueden salir por su placa
  if (ex.kind === 'gateway') await run('ipset', ['add', 'localia-direct', pc.privateIp, '-exist']);
  else await run('ipset', ['del', 'localia-direct', pc.privateIp, '-exist']);
  return true;
}
// ---------- Windows App (RDP) con apertura por pedido ----------
// Puerto público 33000+N del gateway → 10.60.2.N:3389. Cerrado para todo internet salvo las redes
// que el usuario habilita desde el portal (ipset localia-rdp, vence a las 12 h).
const RDP_TTL = 12 * 3600;
const rdpPort = pc => 33000 + (+String(pc.privateIp || '0.0.0.0').split('.').pop());
async function ensureRdpDnat(pc) {
  if (!pc.privateIp) return;
  const rule = ['-p', 'tcp', '--dport', String(rdpPort(pc)), '-j', 'DNAT', '--to-destination', `${pc.privateIp}:3389`];
  const c = await run('iptables', ['-t', 'nat', '-C', 'LOCALIA-RDP', ...rule]);
  if (!c.ok) await run('iptables', ['-t', 'nat', '-A', 'LOCALIA-RDP', ...rule]);
}
async function removeRdpDnat(pc) { if (pc.privateIp) await run('iptables', ['-t', 'nat', '-D', 'LOCALIA-RDP', '-p', 'tcp', '--dport', String(rdpPort(pc)), '-j', 'DNAT', '--to-destination', `${pc.privateIp}:3389`]); }
async function allowRdp(pc, ip) {
  const m = String(ip).match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/); if (!m) return null;   // solo IPv4
  const net = `${m[1]}.${m[2]}.${m[3]}.0/24`;
  const r = await run('ipset', ['add', 'localia-rdp', `${net},tcp:3389,${pc.privateIp}/32`, 'timeout', String(RDP_TTL), '-exist']);
  return r.ok ? { net, until: new Date(Date.now() + RDP_TTL * 1000).toISOString() } : null;
}
function newRdpPassword() { const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; return Array.from(crypto.randomBytes(8), b => A[b % A.length]).join(''); }
async function ensureRdpPassword(pc) {
  if (pc.rdpPassword && pc.rdpSet) return true;
  if (!pc.rdpPassword) pc.rdpPassword = newRdpPassword();
  const r = await agent(pc, '/rdp-password', { method: 'POST', body: JSON.stringify({ password: pc.rdpPassword }) }, 25000);
  pc.rdpSet = r.status === 200; save(); return pc.rdpSet;
}
function rdpFile(pc) {
  return [`full address:s:${ENV.GW_PUBLIC_IP}:${rdpPort(pc)}`, 'username:s:localia', 'prompt for credentials:i:0', 'screen mode id:i:2', 'use multimon:i:0',
    'smart sizing:i:1', 'dynamic resolution:i:0', 'desktopwidth:i:1920', 'desktopheight:i:1080', 'session bpp:i:24', 'authentication level:i:0',
    'negotiate security layer:i:1', 'enablecredsspsupport:i:0', 'redirectclipboard:i:1', 'audiomode:i:2', 'autoreconnection enabled:i:1',
    `alternate shell:s:`, `remoteapplicationmode:i:0`].join('\r\n') + '\r\n';
}
async function unroutePc(pc) { if (!pc.privateIp) return; await run('ipset', ['del', 'localia-direct', pc.privateIp, '-exist']); for (const r of await rulesFor(pc.privateIp)) await run('ip', ['rule', 'del', 'from', pc.privateIp, 'lookup', r.table, 'priority', String(r.prio)]); }
async function wgStatus() {
  const r = await run('wg', ['show', 'all', 'dump']);
  const out = {};
  for (const l of r.out.split('\n')) {
    const f = l.split('\t'); if (f.length < 9) continue;   // líneas de peers: iface pub psk endpoint allowed hs rx tx ka
    out[f[0]] = { endpoint: f[3] === '(none)' ? null : f[3], handshake: +f[5] || 0, rx: +f[6] || 0, tx: +f[7] || 0 };
  }
  const links = await run('ip', ['-br', 'link', 'show', 'type', 'wireguard']);
  const up = {}; links.out.split('\n').forEach(l => { const [n, s] = l.split(/\s+/); if (n) up[n] = s; });
  return EXITS.map(x => { if (x.kind === 'gateway') return { code: x.code, iface: x.iface, link: 'UP', endpoint: null, handshakeAge: null, healthy: true, rx: 0, tx: 0, direct: true };
    const w = out[x.iface] || {}; const age = w.handshake ? Math.round(Date.now() / 1000 - w.handshake) : null;
    return { code: x.code, iface: x.iface, link: up[x.iface] || 'missing', endpoint: w.endpoint || null, handshakeAge: age, healthy: age !== null && age < 180 && (up[x.iface] || '').match(/UP|UNKNOWN/) !== null, rx: w.rx || 0, tx: w.tx || 0 }; });
}
async function syncExitPeers() {  // salidas "de casa" (ej. Uruguay) registradas con el instalador
  for (const [code, peer] of Object.entries(db.exitPeers || {})) { const ex = exitBy(code); if (ex && peer.pub) await run('wg', ['set', ex.iface, 'peer', peer.pub, 'allowed-ips', '0.0.0.0/0']); }
}

// ---------- geolocalización de IPs (para "¿desde dónde te ven?") ----------
const geoCache = new Map();
async function geo(ip) {
  if (!ip) return null; const c = geoCache.get(ip); if (c && Date.now() - c.t < 6 * 3600e3) return c.v;
  const r = await fetchJSON(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, {}, 5000);
  const v = r.status === 200 ? { ip, city: r.json.city, region: r.json.region, country: r.json.country, org: r.json.org } : { ip };
  geoCache.set(ip, { t: Date.now(), v }); return v;
}

// ---------- máquinas (el proveedor está en providers.js) ----------
const describe = ids => cloud.describe(ids);
function userData(pc) {
  const ex = exitBy(pc.active);
  const s = `#!/bin/bash
mkdir -p /etc/localia
cat > /etc/localia/agent.env <<'E'
TOKEN=${pc.token}
PC_ID=${pc.id}
RDP_PASSWORD=${pc.rdpPassword || ''}
E
chmod 600 /etc/localia/agent.env
echo "https://${PORTAL_HOST}/donde?pc=${pc.id}" > /etc/localia/start_url
echo "https://${PORTAL_HOST}/inicio?pc=${pc.id}" > /etc/localia/start_simple
# modo simple (abre directo en el navegador) o escritorio completo; las imágenes viejas no lo tienen
[ -x /usr/local/sbin/localia-mode ] && /usr/local/sbin/localia-mode ${modeOf(pc)} --no-restart || true
hostnamectl set-hostname localia-pc-${pc.id} || true
timedatectl set-timezone ${ex ? ex.tz : 'UTC'} || true
systemctl restart localia-agent
# el escritorio arranca después del cambio de nombre (si no, XFCE no conecta con el display)
# y sin el bloqueo de perfil que Chromium dejó con el nombre viejo de la máquina
# Chromium sin el aviso de "restaurar páginas" después de un reinicio
sed -i 's/--start-maximized "/--start-maximized --hide-crash-restore-bubble "/' /usr/local/bin/localia-browser || true
# contraseña de Windows App y puente al escritorio
/usr/local/sbin/localia-rdp-pass || true
systemctl stop localia-desktop || true
rm -f /home/localia/.config/chromium/Singleton*
systemctl start localia-desktop
systemctl restart localia-rdp-bridge || true
`;
  return s;
}
async function createInstance(pc) {
  const r = await cloud.create({ id: pc.id, tier: TIERS[pc.tier], userData: userData(pc) });
  pc.instanceId = r.instanceId; pc.privateIp = r.privateIp; pc.ec2 = r.state; pc.cloud = cloud.name;
  for (let k = 0; !pc.privateIp && k < 20; k++) { await sleep(2000); const d = (await describe([pc.instanceId]))[pc.instanceId]; if (d && d.privateIp) pc.privateIp = d.privateIp; }
  if (!pc.privateIp) throw new Error('la máquina no recibió IP privada');
}
const agentUrl = (pc, p) => `http://${pc.privateIp}:8081${p}`;
const agent = (pc, p, opts = {}, ms = 7000) => fetchJSON(agentUrl(pc, p), { ...opts, headers: { 'X-Localia-Token': pc.token, 'Content-Type': 'application/json', ...(opts.headers || {}) } }, ms);
function pubPc(pc, live) {
  const t = TIERS[pc.tier]; const ex = exitBy(pc.active);
  return { id: pc.id, name: pc.name, mode: modeOf(pc), tier: pc.tier, tierName: t.name, specs: t, state: pc.ec2 || 'unknown', desktop: pc.desktop || null, exits: [...new Set([...availableExits(), pc.active])], active: pc.active,
    activeCity: ex && ex.city, activeName: ex && ex.name, host: `pc-${pc.id}.${BASE}`, identity: pc.identity || null, createdAt: pc.createdAt, lastActivity: pc.lastActivity || null,
    events: (pc.events || []).slice(0, 15), provision: pc.provision || null, ...(live || {}) };
}
async function refreshPc(pc) {
  const m = await describe([pc.instanceId].filter(Boolean)); const d = m[pc.instanceId];
  if (d) { pc.ec2 = d.state; if (d.privateIp) pc.privateIp = d.privateIp; } else if (pc.instanceId) pc.ec2 = 'terminated';
  if (pc.ec2 === 'running') { const h = await agent(pc, '/health', {}, 3000); pc.desktop = h.status === 200 ? h.json.desktop : 'booting'; pc.tz = h.json && h.json.tz; } else pc.desktop = null;
  save(); return pc;
}
async function checkIdentity(pc) {
  if (pc.ec2 !== 'running') return null;
  const r = await agent(pc, '/identity', {}, 9000);
  pc.identity = { ...(r.json || {}), at: now(), expected: pc.active }; save(); return pc.identity;
}
async function switchExit(pc, code) {
  if (!pc.exits.includes(code)) pc.exits.push(code);   // histórico; hoy toda PC puede usar cualquier salida disponible
  const from = pc.active; await routePc(pc, code); pc.active = code; pc.identity = null; save();
  if (pc.ec2 === 'running') agent(pc, '/tz', { method: 'POST', body: JSON.stringify({ tz: exitBy(code).tz }) });
  ev(pc, `Cambiaste la salida de ${exitBy(from).name} a ${exitBy(code).name}`);
  setTimeout(() => checkIdentity(pc).catch(() => {}), 2500);   // verificación automática
}
const modeOf = pc => pc.mode === 'simple' ? 'simple' : 'completo';   // las PCs anteriores al modo simple quedan en completo
const canSee = (u, pc) => u && (u.admin || pc.userId === u.id);

// ---------- aprovisionamiento (seguimiento paso a paso) ----------
async function provision(pc) {
  const P = pc.provision = { step: 'reserving', steps: [], startedAt: now() }; save();
  const mark = (step, text) => { P.step = step; P.steps.push({ step, text, at: now() }); save(); };
  try {
    await createInstance(pc); mark('reserving', `PC ${TIERS[pc.tier].name} reservada en ${cloud.place} (${pc.instanceId})`);
    await routePc(pc, pc.active); await ensureRdpDnat(pc); mark('tunnel', `Salida asignada: ${exitBy(pc.active).name} · corte automático activo`);
    const t0 = Date.now();
    while (Date.now() - t0 < 6 * 60e3) { await refreshPc(pc); if (pc.ec2 === 'running') break; await sleep(4000); }
    mark('booting', 'PC prendida, arrancando el escritorio');
    fetch(`https://pc-${pc.id}.${BASE}/`, { method: 'HEAD' }).catch(() => {}); // pide el certificado HTTPS por adelantado
    while (Date.now() - t0 < 9 * 60e3) { await refreshPc(pc); if (pc.desktop === 'active') break; await sleep(4000); }
    mark('desktop', 'Escritorio listo');
    await agent(pc, '/tz', { method: 'POST', body: JSON.stringify({ tz: exitBy(pc.active).tz }) });
    let id = null; for (let k = 0; k < 6; k++) { id = await checkIdentity(pc); if (id && id.online) break; await sleep(3000); }
    if (id && id.online) mark('ready', `Chequeo final: los sitios te ven en ${id.city || '?'}, ${id.country || '?'} (${id.ip})`);
    else mark('ready', 'Lista. El chequeo de identidad no respondió todavía: probá de nuevo en un minuto.');
    P.done = true; ev(pc, 'PC lista para usar', 'ok'); save();
  } catch (e) { P.error = String(e.message || e); mark('error', 'No se pudo crear la PC: ' + P.error); ev(pc, 'Error al crear: ' + P.error, 'bad'); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- página "¿desde dónde me ven?" (la abre la PC al prender) ----------
function clientIp(req) { return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().replace('::ffff:', ''); }

// ---------- API ----------
async function api(req, res, url) {
  const u = userOf(req); const p = url.pathname; const m = req.method;
  if (p === '/api/caddy/ask') { const d = url.searchParams.get('domain') || ''; const ok = d === PORTAL_HOST || (d.endsWith('.' + BASE) && db.pcs.some(x => `pc-${x.id}.${BASE}` === d && x.status !== 'deleted')); res.writeHead(ok ? 200 : 403); return res.end(); }
  if (p === '/api/donde') { const ip = clientIp(req); return send(res, 200, { ip, geo: await geo(ip) }); }
  if (p === '/api/config') return send(res, 200, { base: BASE, portal: PORTAL_HOST, exits: EXITS.map(x => ({ code: x.code, name: x.name, city: x.city, tz: x.tz, kind: x.kind, available: (x.kind !== 'home' || !!(db.exitPeers || {})[x.code]) && !exitOff(x.code) })), tiers: TIERS, cloud: { name: cloud.name, label: cloud.label, place: cloud.place }, limits: { perUser: MAX_PCS_PER_USER, total: MAX_PCS_TOTAL }, idleStopMin: IDLE_STOP_MIN });
  if (p === '/api/signup' && m === 'POST') {
    const b = await body(req); const email = String(b.email || '').trim().toLowerCase();
    if (!ENV.INVITE_CODE || b.invite !== ENV.INVITE_CODE) return send(res, 403, { error: 'Código de invitación incorrecto.' });
    if (!/^\S+@\S+\.\S+$/.test(email) || String(b.password || '').length < 8) return send(res, 400, { error: 'Revisá el email y usá una contraseña de 8 caracteres o más.' });
    if (db.users.find(x => x.email === email)) return send(res, 409, { error: 'Ya existe una cuenta con ese email.' });
    const nu = { id: rid(8), email, name: String(b.name || '').slice(0, 60) || email.split('@')[0], pass: hashPass(String(b.password)), admin: false, createdAt: now() };
    db.users.push(nu); save(); setSession(req, res, nu); return send(res, 200, { user: pubUser(nu) });
  }
  if (p === '/api/login' && m === 'POST') {
    const b = await body(req); const x = db.users.find(y => y.email === String(b.email || '').trim().toLowerCase());
    if (!x || !checkPass(String(b.password || ''), x.pass)) return send(res, 401, { error: 'Email o contraseña incorrectos.' });
    setSession(req, res, x); return send(res, 200, { user: pubUser(x) });
  }
  if (p === '/api/logout' && m === 'POST') { res.setHeader('Set-Cookie', `lsid=; Domain=${BASE}; Path=/; Max-Age=0; Secure; HttpOnly`); return send(res, 200, { ok: true }); }
  if (p === '/api/me') return send(res, 200, { user: pubUser(u) });
  if (!u) return send(res, 401, { error: 'Iniciá sesión.' });

  if (p === '/api/pcs' && m === 'GET') {
    const mine = db.pcs.filter(x => x.userId === u.id && x.status !== 'deleted');
    await Promise.all(mine.map(refreshPc)); return send(res, 200, { pcs: mine.map(x => pubPc(x)) });
  }
  if (p === '/api/pcs' && m === 'POST') {
    const b = await body(req); const tier = TIERS[b.tier] ? b.tier : 'mini';
    const active = defaultExit(); const exits = availableExits();   // no se pregunta el país al crear
    if (!active) return send(res, 503, { error: 'No hay salidas disponibles ahora.' });
    const live = db.pcs.filter(x => x.status !== 'deleted');
    if (!u.admin && live.filter(x => x.userId === u.id).length >= MAX_PCS_PER_USER) return send(res, 429, { error: `En el demo cada cuenta puede tener hasta ${MAX_PCS_PER_USER} PCs.` });
    if (live.length >= MAX_PCS_TOTAL) return send(res, 429, { error: 'El demo llegó al máximo de PCs. Borrá una para crear otra.' });
    const pc = { id: rid(6), userId: u.id, name: String(b.name || '').slice(0, 40) || 'Mi PC', tier, exits, active, token: crypto.randomBytes(24).toString('hex'), rdpPassword: newRdpPassword(), rdpSet: true, mode: 'simple', status: 'active', createdAt: now(), lastActivity: now() };
    db.pcs.push(pc); ev(pc, `PC creada: ${TIERS[tier].name}. Arranca saliendo por ${exitBy(active).name}; el país se elige desde adentro de la PC`); save();
    provision(pc); return send(res, 200, { pc: pubPc(pc) });
  }
  const mm = p.match(/^\/api\/pcs\/([a-z0-9]+)(?:\/([a-z-]+))?$/);
  if (mm) {
    const pc = db.pcs.find(x => x.id === mm[1] && x.status !== 'deleted'); if (!pc || !canSee(u, pc)) return send(res, 404, { error: 'No encontramos esa PC.' });
    const act = mm[2];
    if (!act && m === 'GET') { await refreshPc(pc); return send(res, 200, { pc: pubPc(pc) }); }
    if (act === 'identity') { await refreshPc(pc); const id = await checkIdentity(pc); return send(res, 200, { identity: id, pc: pubPc(pc) }); }
    if (act === 'start' && m === 'POST') { await cloud.start(pc.instanceId); pc.lastActivity = now(); ev(pc, 'La prendiste desde el panel'); await routePc(pc, pc.active); return send(res, 200, { pc: pubPc(await refreshPc(pc)) }); }
    if (act === 'stop' && m === 'POST') { await cloud.stop(pc.instanceId); ev(pc, 'La apagaste desde el panel. Tus archivos quedan guardados.'); return send(res, 200, { pc: pubPc(await refreshPc(pc)) }); }
    if (act === 'reboot' && m === 'POST') { await cloud.reboot(pc.instanceId); ev(pc, 'La reiniciaste desde el panel'); return send(res, 200, { pc: pubPc(pc) }); }
    if (act === 'rdp' && m === 'POST') {   // habilita la red del usuario y devuelve los datos para Windows App
      if (pc.ec2 !== 'running') { await refreshPc(pc); if (pc.ec2 !== 'running') return send(res, 409, { error: 'Prendé la PC primero.' }); }
      await ensureRdpDnat(pc);
      if (!(await ensureRdpPassword(pc))) return send(res, 503, { error: 'La PC todavía está arrancando. Probá en un minuto.' });
      const a = await allowRdp(pc, clientIp(req)); if (!a) return send(res, 400, { error: 'No pudimos habilitar tu red (¿IPv6?).' });
      ev(pc, `Habilitaste Windows App desde la red ${a.net} por 12 h`);
      return send(res, 200, { rdp: { host: ENV.GW_PUBLIC_IP, port: rdpPort(pc), address: `${ENV.GW_PUBLIC_IP}:${rdpPort(pc)}`, username: 'localia', password: pc.rdpPassword, network: a.net, until: a.until } });
    }
    if (act === 'rdp-file' && m === 'GET') {
      if (pc.ec2 === 'running') { await ensureRdpDnat(pc); await allowRdp(pc, clientIp(req)); }
      res.writeHead(200, { 'Content-Type': 'application/x-rdp', 'Content-Disposition': `attachment; filename="Localia-${String(pc.name).replace(/[^A-Za-z0-9_-]+/g, '-')}.rdp"`, 'Cache-Control': 'no-store' });
      return res.end(rdpFile(pc));
    }
    if (act === 'restart-desktop' && m === 'POST') { await agent(pc, '/restart-desktop', { method: 'POST', body: '{}' }); ev(pc, 'Reiniciaste el escritorio'); return send(res, 200, { ok: true }); }
    if (act === 'delete' && m === 'POST') { if (pc.instanceId) await Promise.resolve(cloud.destroy(pc.instanceId)).catch(() => {}); await unroutePc(pc); await removeRdpDnat(pc); pc.status = 'deleted'; ev(pc, 'PC borrada', 'warn'); save(); return send(res, 200, { ok: true }); }
    if (act === 'exit' && m === 'POST') {
      const b = await body(req); const code = String(b.code || '');
      if (!exitBy(code)) return send(res, 400, { error: 'País desconocido.' });
      if (!availableExits().includes(code)) return send(res, 409, { error: `La salida de ${exitBy(code).name} no está disponible.` });
      await switchExit(pc, code);
      return send(res, 200, { pc: pubPc(pc) });
    }
    if (act === 'exits' && m === 'POST') { const b = await body(req); const code = String(b.code || ''); if (!exitBy(code)) return send(res, 400, { error: 'País desconocido.' }); if (b.remove) { if (code !== pc.active) pc.exits = pc.exits.filter(c => c !== code); } else if (!pc.exits.includes(code)) { pc.exits.push(code); ev(pc, `Sumaste ${exitBy(code).name}`); } save(); return send(res, 200, { pc: pubPc(pc) }); }
    return send(res, 404, { error: 'Acción desconocida.' });
  }
  // ----- operación (solo admin) -----
  if (!u.admin) return send(res, 403, { error: 'Solo para el equipo de Slonimtek.' });
  if (p === '/api/ops' && m === 'GET') {
    const live = db.pcs.filter(x => x.status !== 'deleted'); await Promise.all(live.map(refreshPc));
    const wg = await wgStatus();
    const exits = await Promise.all(EXITS.map(async x => { const w = wg.find(y => y.code === x.code) || {}; const pubIp = x.publicIp || (w.endpoint ? w.endpoint.split(':')[0] : null); return { ...x, ...w, publicIp: pubIp, geo: pubIp ? await geo(pubIp) : null, off: exitOff(x.code), pcs: live.filter(pc => pc.active === x.code).length, registered: x.kind !== 'home' || !!(db.exitPeers || {})[x.code] }; }));
    let exitStates = {};
    try { const ids = EXITS.filter(x => x.instanceId); for (const reg of [...new Set(ids.map(x => x.region))]) { const d = await exitCloud().describe(ids.filter(x => x.region === reg).map(x => x.instanceId), reg); for (const [id, v] of Object.entries(d)) exitStates[id] = v.state; } } catch (e) {}
    exits.forEach(x => { if (x.instanceId) x.ec2 = exitStates[x.instanceId] || 'unknown'; });
    return send(res, 200, { exits, pcs: live.map(x => ({ ...pubPc(x), user: (db.users.find(y => y.id === x.userId) || {}).email, privateIp: x.privateIp })), users: db.users.length, events: db.events.slice(0, 60), tokens: (db.exitTokens || []).filter(t => !t.used).map(t => ({ code: t.code, at: t.at })) });
  }
  const om = p.match(/^\/api\/ops\/exits\/([A-Z]{2})\/([a-z-]+)$/);
  if (om && m === 'POST') {
    const ex = exitBy(om[1]); if (!ex) return send(res, 404, { error: 'Salida desconocida.' });
    if (ex.kind === 'gateway' && om[2] !== 'token') return send(res, 400, { error: 'Esta salida es el propio gateway: no se corta ni se apaga por separado.' });
    if (om[2] === 'cut') {   // prueba del corte automático: se corta el túnel y se verifica que la PC NO salga por otro lado
      await run('ip', ['link', 'set', 'dev', ex.iface, 'down']); ev(null, `Prueba de corte: túnel ${ex.name} cortado`, 'warn');
      const victims = db.pcs.filter(x => x.status !== 'deleted' && x.active === ex.code && x.ec2 === 'running');
      await sleep(1500);
      const results = await Promise.all(victims.map(async pc => { const r = await agent(pc, '/identity', {}, 9000); return { pc: pc.id, online: !!(r.json && r.json.online), ip: r.json && r.json.ip || null, country: r.json && r.json.country || null }; }));
      await run('ip', ['link', 'set', 'dev', ex.iface, 'up']); await run('ip', ['route', 'replace', 'default', 'dev', ex.iface, 'table', String(ex.table), 'metric', '100']);
      const leaked = results.filter(r => r.online);
      ev(null, `Prueba de corte ${ex.name}: ${results.length} PC(s) sin internet durante el corte, ${leaked.length} fuga(s). Túnel restablecido.`, leaked.length ? 'bad' : 'ok');
      return send(res, 200, { tested: results.length, results, leaked: leaked.length });
    }
    if (om[2] === 'start' || om[2] === 'stop') {
      if (!ex.instanceId) return send(res, 400, { error: 'Esta salida no es una máquina de AWS.' });
      await exitCloud()[om[2]](ex.instanceId, ex.region);
      db.exitOff = db.exitOff || {}; db.exitOff[ex.code] = om[2] === 'stop'; save();
      ev(null, `Salida ${ex.name}: ${om[2] === 'start' ? 'prendiendo (vuelve a ofrecerse)' : 'apagada (ya no se ofrece)'}`, 'warn');
      return send(res, 200, { ok: true });
    }
    if (om[2] === 'token') {  // instalador para una salida "de casa" (ej. Uruguay)
      const t = { code: ex.code, token: crypto.randomBytes(18).toString('base64url'), at: now(), used: false }; db.exitTokens.push(t); save();
      return send(res, 200, { command: `curl -fsSL https://${PORTAL_HOST}/exit/install.sh?t=${t.token} | sudo bash` });
    }
  }
  return send(res, 404, { error: 'No existe.' });
}

// ---------- instalador de salidas "de casa" ----------
function hubPub(ex) { try { return fs.readFileSync(`/etc/localia/hub-${ex.code.toLowerCase()}.pub`, 'utf8').trim(); } catch (e) { return ''; } }
async function exitInstall(req, res, url) {
  const t = (db.exitTokens || []).find(x => x.token === url.searchParams.get('t') && !x.used);
  if (!t) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('echo "Código vencido o inválido. Pedí uno nuevo en Operación."; exit 1\n'); }
  const ex = exitBy(t.code);
  const script = fs.readFileSync(path.join(__dirname, 'exit-install.sh'), 'utf8');
  const out = `#!/bin/bash
set -e
export EXIT_N=${ex.n} HUB_PUB='${hubPub(ex)}' HUB_ENDPOINT='${ENV.GW_PUBLIC_IP}:${51820 + ex.n}'
${script.replace(/^#!.*\n/, '')}
PUB=$(wg pubkey < /etc/wireguard/exit.key)
curl -fsS -X POST "https://${PORTAL_HOST}/exit/register?t=${t.token}&pub=$(printf %s "$PUB" | sed 's/+/%2B/g;s/\\//%2F/g;s/=/%3D/g')" && echo "Listo: esta compu ya es la salida de ${ex.name} de Localía."
`;
  res.writeHead(200, { 'Content-Type': 'text/x-shellscript' }); res.end(out);
}
async function exitRegister(req, res, url) {
  const t = (db.exitTokens || []).find(x => x.token === url.searchParams.get('t') && !x.used); const pub = url.searchParams.get('pub') || '';
  if (!t || !/^[A-Za-z0-9+/]{42,44}=?$/.test(pub)) { res.writeHead(403); return res.end('invalid\n'); }
  const ex = exitBy(t.code); t.used = true; db.exitPeers[ex.code] = { pub, at: now() }; save();
  await run('wg', ['set', ex.iface, 'peer', pub, 'allowed-ips', '0.0.0.0/0']);
  ev(null, `Nueva salida registrada: ${ex.name}`, 'ok'); res.writeHead(200); res.end('ok\n');
}


// ---------- acceso directo a la PC (sin pasar por el portal) ----------
// https://pc-<id>.<BASE>/ muestra el escritorio a pantalla completa, se puede instalar como app
// y trae un botón flotante para cambiar de país.
const MAX_UPLOAD = 200 * 1024 * 1024;   // el mismo tope que el agente de la PC
const KASM_PARAMS = 'resize=remote&reconnect=true&reconnect_delay=2000&clipboard_seamless=true&idle_disconnect=240';
function desktopIndex(req, res, pc) {
  const r = http.get({ host: pc.privateIp, port: 6901, path: '/', timeout: 8000 }, up => {
    let d = ''; up.setEncoding('utf8'); up.on('data', c => d += c);
    up.on('end', () => {
      const ex = exitBy(pc.active);
      const head = `<title>${esc(pc.name)} · Localía</title><link rel="manifest" href="/__localia/manifest.webmanifest"><link rel="icon" href="/__localia/icon.svg"><meta name="theme-color" content="#0c1a2c"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${esc(pc.name)}">`;
      d = d.replace(/<title>[^<]*<\/title>/i, '').replace(/<head>/i, '<head>' + head).replace(/<\/body>/i, '<script src="/__localia/overlay.js" defer></script></body>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': `frame-ancestors https://${PORTAL_HOST}` });
      res.end(d);
    });
  });
  r.on('error', () => { res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<p style="font:16px sans-serif;padding:24px">Tu PC está arrancando. Probá de nuevo en unos segundos.</p>'); });
}
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0c1a2c"/><path d="M32 9c-10.5 0-19 8.2-19 18.4C13 40.4 32 55 32 55s19-14.6 19-27.6C51 17.2 42.5 9 32 9z" fill="#2a82d2"/><rect x="21.5" y="18.5" width="21" height="14" rx="3" fill="#fff"/><rect x="27.5" y="35" width="9" height="3" rx="1.5" fill="#fff"/></svg>';
async function directApi(req, res, url, pc) {
  const p = url.pathname.replace('/__localia/', '');
  if (p === 'manifest.webmanifest') {
    const m = { name: `${pc.name} · Localía`, short_name: pc.name, start_url: `/?${KASM_PARAMS}`, scope: '/', display: 'standalone', background_color: '#0a1629', theme_color: '#0c1a2c', icons: [{ src: '/__localia/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] };
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' }); return res.end(JSON.stringify(m));
  }
  if (p === 'icon.svg') { res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' }); return res.end(ICON_SVG); }
  if (p === 'overlay.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); return fs.createReadStream(path.join(__dirname, 'overlay.js')).pipe(res); }
  if (p === 'state') return send(res, 200, { name: pc.name, mode: modeOf(pc), maxUpload: MAX_UPLOAD, active: pc.active, portal: `https://${PORTAL_HOST}/#panel`, exits: [...new Set([...availableExits(), pc.active])].map(c => { const e = exitBy(c); return { code: c, name: e.name, city: e.city }; }), identity: pc.identity || null });
  if (p === 'identity') { await refreshPc(pc); return send(res, 200, { identity: await checkIdentity(pc) }); }
  if (p === 'exit' && req.method === 'POST') { const b = await body(req); if (!availableExits().includes(b.code)) return send(res, 400, { error: 'País no disponible.' }); await switchExit(pc, b.code); return send(res, 200, { active: pc.active }); }
  // ----- archivos: entre la compu del usuario y la carpeta Descargas de la PC -----
  if (p === 'files' && req.method === 'GET') { const r = await agent(pc, '/files', {}, 6000); return send(res, r.status === 200 ? 200 : 503, r.status === 200 ? r.json : { error: 'Tu PC todavía está arrancando.' }); }
  if (p.startsWith('file/') && req.method === 'GET') {
    let name; try { name = decodeURIComponent(p.slice(5)); } catch (e) { return send(res, 400, { error: 'Nombre inválido.' }); }
    const up = http.get({ host: pc.privateIp, port: 8081, path: '/file?name=' + encodeURIComponent(name), headers: { 'X-Localia-Token': pc.token }, timeout: 15000 }, ar => {
      if (ar.statusCode !== 200) { ar.resume(); return send(res, 404, { error: 'No encontramos ese archivo.' }); }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': ar.headers['content-length'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}` });
      ar.pipe(res);
    });
    up.on('timeout', () => up.destroy(new Error('timeout')));
    up.on('error', () => { if (!res.headersSent) send(res, 503, { error: 'Tu PC no respondió.' }); else res.destroy(); });
    return;
  }
  // Los POST de acá abajo exigen un header propio: un sitio cualquiera no puede subir archivos ni cambiar el modo por vos.
  if (req.method === 'POST' && (p === 'upload' || p === 'mode') && req.headers['x-localia'] !== '1') return send(res, 403, { error: 'No permitido.' });
  if (p === 'upload' && req.method === 'POST') {
    const name = String(url.searchParams.get('name') || '').slice(0, 200); const len = +req.headers['content-length'] || 0;
    if (!name) return send(res, 400, { error: 'Falta el nombre del archivo.' });
    if (len <= 0) return send(res, 400, { error: 'El archivo está vacío.' });
    if (len > MAX_UPLOAD) return send(res, 413, { error: `El archivo es muy grande (máximo ${Math.round(MAX_UPLOAD / 1048576)} MB).` });
    const up = http.request({ host: pc.privateIp, port: 8081, method: 'POST', path: '/upload?name=' + encodeURIComponent(name), headers: { 'X-Localia-Token': pc.token, 'Content-Length': len, 'Content-Type': 'application/octet-stream' } }, ar => {
      let d = ''; ar.setEncoding('utf8'); ar.on('data', c => d += c);
      ar.on('end', () => { let j = {}; try { j = JSON.parse(d); } catch (e) {}
        if (ar.statusCode === 200) { ev(pc, `Subiste "${j.name}" a tu PC`); return send(res, 200, { ok: true, name: j.name }); }
        send(res, ar.statusCode === 400 ? 400 : 502, { error: ar.statusCode === 400 ? 'Ese nombre de archivo no sirve. Cambiale el nombre y probá de nuevo.' : 'No se pudo subir. Probá de nuevo.' }); });
    });
    up.on('error', () => { if (!res.headersSent) send(res, 503, { error: 'Tu PC no respondió. ¿Está prendida?' }); });
    req.pipe(up); return;
  }
  if (p === 'mode' && req.method === 'POST') {
    const b = await body(req); const mode = b.mode === 'simple' ? 'simple' : b.mode === 'completo' ? 'completo' : null;
    if (!mode) return send(res, 400, { error: 'Modo desconocido.' });
    const r = await agent(pc, '/mode', { method: 'POST', body: JSON.stringify({ mode }) }, 8000);
    if (r.status === 501 || r.status === 404) return send(res, 409, { error: 'Esta PC es anterior al modo simple. Creá una nueva para usarlo.' });
    if (r.status !== 200) return send(res, 503, { error: 'Tu PC no respondió. ¿Está prendida?' });
    pc.mode = mode; save(); ev(pc, mode === 'simple' ? 'Pasaste al modo simple' : 'Pasaste al escritorio completo');
    return send(res, 200, { mode });
  }
  return send(res, 404, { error: 'No existe.' });
}

// ---------- escritorio de cada PC (proxy a KasmVNC) ----------
const proxy = httpProxy.createProxyServer({ ws: true, xfwd: false, proxyTimeout: 0 });
const wsOpen = {};
proxy.on('error', (e, req, res) => { try { if (res && res.writeHead) { res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<p style="font:16px sans-serif;padding:24px">Tu PC todavía está arrancando. Probá de nuevo en unos segundos.</p>'); } else if (res && res.destroy) res.destroy(); } catch (x) {} });
proxy.on('proxyRes', pr => { delete pr.headers['x-frame-options']; pr.headers['content-security-policy'] = `frame-ancestors https://${PORTAL_HOST}`; });
function pcForHost(host) { const m = String(host || '').match(/^pc-([a-z0-9]+)\./); return m && db.pcs.find(x => x.id === m[1] && x.status !== 'deleted'); }
function desktopGate(req) {
  const pc = pcForHost(req.headers.host); if (!pc) return { err: 404 };
  const u = userOf(req); if (!canSee(u, pc)) return { err: 403 };
  if (!pc.privateIp) return { err: 503 };
  pc.lastActivity = now(); return { pc };
}

// ---------- servidor ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, p) {
  if (p === '/' || p === '/donde' || p === '/inicio') p = p === '/' ? '/index.html' : p + '.html';
  const f = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(f).pipe(res);
}
const server = http.createServer(async (req, res) => {
  try {
    const host = String(req.headers.host || '').split(':')[0];
    if (host.startsWith('pc-')) {
      const g = desktopGate(req);
      if (g.err) {
        const pcm = pcForHost(req.headers.host);
        if (g.err === 403) { res.writeHead(302, { Location: `https://${PORTAL_HOST}/#entrar/${pcm ? pcm.id : ''}` }); return res.end(); }
        res.writeHead(g.err, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(g.err === 503 ? 'Tu PC está arrancando.' : '');
      }
      const u2 = new URL(req.url, `https://${host}`);
      if (u2.pathname.startsWith('/__localia/')) return await directApi(req, res, u2, g.pc);
      if (u2.pathname === '/' && req.method === 'GET') return await desktopIndex(req, res, g.pc);
      return proxy.web(req, res, { target: `http://${g.pc.privateIp}:6901` });
    }
    const url = new URL(req.url, `https://${host || PORTAL_HOST}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === '/exit/install.sh') return await exitInstall(req, res, url);
    if (url.pathname === '/exit/register' && req.method === 'POST') return await exitRegister(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (e) { console.error(e); try { send(res, 500, { error: 'Error interno: ' + (e.message || e) }); } catch (x) {} }
});
server.on('upgrade', (req, socket, head) => {
  const g = desktopGate(req); if (g.err) return socket.destroy();
  const pc = g.pc; wsOpen[pc.id] = (wsOpen[pc.id] || 0) + 1;
  socket.on('close', () => { wsOpen[pc.id] = Math.max(0, (wsOpen[pc.id] || 1) - 1); pc.lastActivity = now(); save(); });
  proxy.ws(req, socket, head, { target: `ws://${pc.privateIp}:6901` });
});

// ---------- API interna para las PCs (red privada, token de la PC) ----------
// La app "Cambiar país" que corre ADENTRO de la PC habla con el gateway por 10.60.1.10:3001 (nunca por internet).
const INTERNAL_HOST = ENV.INTERNAL_HOST || '10.60.1.10', INTERNAL_PORT = +(ENV.INTERNAL_PORT || 3001);
const internal = http.createServer(async (req, res) => {
  try {
    const pc = db.pcs.find(x => x.id === req.headers['x-localia-pc'] && x.status !== 'deleted');
    if (!pc || !pc.token || req.headers['x-localia-token'] !== pc.token) return send(res, 403, { error: 'forbidden' });
    const peer = String(req.socket.remoteAddress || '').replace('::ffff:', '');
    if (pc.privateIp && peer !== pc.privateIp) return send(res, 403, { error: 'forbidden' });   // solo desde la propia PC
    const url = new URL(req.url, 'http://internal');
    const opts = () => availableExits().map(c => { const x = exitBy(c); return { code: c, name: x.name, city: x.city }; });
    if (url.pathname === '/internal/state') return send(res, 200, { name: pc.name, active: pc.active, activeName: exitBy(pc.active).name, exits: opts(), identity: pc.identity || null });
    if (url.pathname === '/internal/exit' && req.method === 'POST') {
      const b = await body(req); const code = String(b.code || '');
      if (!availableExits().includes(code)) return send(res, 400, { error: 'Ese país no está disponible.' });
      await switchExit(pc, code);
      return send(res, 200, { active: pc.active, activeName: exitBy(pc.active).name });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { console.error(e); try { send(res, 500, { error: 'internal' }); } catch (x) {} }
});

// ---------- tareas de fondo ----------
async function boot() {
  await syncExitPeers();
  for (const pc of db.pcs.filter(x => x.status !== 'deleted' && x.privateIp)) { await routePc(pc, pc.active); await ensureRdpDnat(pc); }  // reglas perdidas si se reinició el gateway
  server.listen(PORT, '127.0.0.1', () => console.log(`Localía portal en :${PORT} · https://${PORTAL_HOST}`));
  internal.listen(INTERNAL_PORT, INTERNAL_HOST, () => console.log(`API interna para PCs en ${INTERNAL_HOST}:${INTERNAL_PORT}`));
}
setInterval(async () => {   // se apaga sola si nadie la usa (cuida la plata)
  for (const pc of db.pcs.filter(x => x.status !== 'deleted' && x.ec2 === 'running' && x.provision && x.provision.done)) {
    if (wsOpen[pc.id] > 0) { pc.lastActivity = now(); continue; }   // hay alguien usando el escritorio
    const idle = (Date.now() - Date.parse(pc.lastActivity || pc.createdAt)) / 60e3;
    if (IDLE_STOP_MIN > 0 && idle > IDLE_STOP_MIN) { await Promise.resolve(cloud.stop(pc.instanceId)).catch(() => {}); pc.ec2 = 'stopping'; ev(pc, `Se apagó sola tras ${IDLE_STOP_MIN} min sin uso`); }
  }
}, 5 * 60e3);
boot();

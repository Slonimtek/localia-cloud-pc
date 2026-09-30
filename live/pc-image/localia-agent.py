#!/usr/bin/env python3
"""Agente de la PC Localía. Solo lo llama el gateway (red privada + token).
GET  /health    estado del escritorio y la hora
GET  /identity  cómo ven los sitios a esta PC (IP y ubicación, a través del túnel)
POST /tz        {"tz": "America/Montevideo"} cambia la zona horaria del sistema
POST /restart-desktop  reinicia el escritorio
POST /rdp-password     {"password": "..."} contraseña para Windows App (máx. 8, letras y números)

Además, en 127.0.0.1:8082 sirve la app "Cambiar país" para el usuario de la PC:
le pide el cambio al gateway por la red privada (10.60.1.10:3001) con el token de esta PC.
"""
import json, os, re, subprocess, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

def env():
    d = {}
    try:
        for line in open('/etc/localia/agent.env'):
            if '=' in line:
                k, v = line.strip().split('=', 1); d[k] = v
    except FileNotFoundError:
        pass
    return d

def sh(*a, timeout=10):
    try:
        return subprocess.run(a, capture_output=True, text=True, timeout=timeout).stdout.strip()
    except Exception as e:
        return ''

def identity():
    t0 = time.time()
    for url in ('https://ipinfo.io/json', 'http://ip-api.com/json/?fields=query,city,regionName,country,countryCode,isp'):
        try:
            with urllib.request.urlopen(url, timeout=6) as r:
                d = json.loads(r.read().decode())
            if 'query' in d:
                d = {'ip': d['query'], 'city': d.get('city'), 'region': d.get('regionName'), 'country': d.get('countryCode'), 'org': d.get('isp')}
            return {'online': True, 'ms': int((time.time() - t0) * 1000), **{k: d.get(k) for k in ('ip', 'city', 'region', 'country', 'org')}}
        except Exception:
            continue
    return {'online': False, 'ms': int((time.time() - t0) * 1000)}

class H(BaseHTTPRequestHandler):
    def _ok(self):
        tok = env().get('TOKEN')
        return tok and self.headers.get('X-Localia-Token') == tok
    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a):
        pass
    def do_GET(self):
        if not self._ok(): return self._send(403, {'error': 'forbidden'})
        if self.path == '/health':
            up = float(open('/proc/uptime').read().split()[0])
            return self._send(200, {'ok': True, 'desktop': sh('systemctl', 'is-active', 'localia-desktop'), 'tz': sh('timedatectl', 'show', '-p', 'Timezone', '--value'), 'uptime_s': int(up)})
        if self.path == '/identity':
            return self._send(200, identity())
        self._send(404, {'error': 'not found'})
    def do_POST(self):
        if not self._ok(): return self._send(403, {'error': 'forbidden'})
        n = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(n) or b'{}')
        if self.path == '/tz':
            tz = str(body.get('tz', ''))
            if not tz or '..' in tz or not os.path.exists('/usr/share/zoneinfo/' + tz):
                return self._send(400, {'error': 'bad tz'})
            sh('timedatectl', 'set-timezone', tz)
            return self._send(200, {'ok': True, 'tz': tz})
        if self.path == '/rdp-password':
            pw = str(body.get('password', ''))
            if not re.fullmatch(r'[A-Za-z0-9]{6,8}', pw):
                return self._send(400, {'error': 'bad password'})
            f = '/etc/localia/agent.env'
            lines = [l for l in open(f).read().splitlines() if l and not l.startswith('RDP_PASSWORD=')] + ['RDP_PASSWORD=' + pw]
            with open(f, 'w') as fh: fh.write('\n'.join(lines) + '\n')
            os.chmod(f, 0o600)
            sh('/usr/local/sbin/localia-rdp-pass', timeout=20)
            subprocess.Popen(['systemctl', 'restart', 'localia-rdp-bridge'])
            return self._send(200, {'ok': True})
        if self.path == '/restart-desktop':
            subprocess.Popen(['systemctl', 'restart', 'localia-desktop'])
            return self._send(200, {'ok': True})
        self._send(404, {'error': 'not found'})

def gateway(path, body=None):
    e = env()
    req = urllib.request.Request(e.get('GATEWAY_INTERNAL', 'http://10.60.1.10:3001') + path,
        data=json.dumps(body).encode() if body is not None else None, method='POST' if body is not None else 'GET',
        headers={'X-Localia-Pc': e.get('PC_ID', ''), 'X-Localia-Token': e.get('TOKEN', ''), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return 200, json.loads(r.read().decode())
    except urllib.error.HTTPError as err:
        try: return err.code, json.loads(err.read().decode())
        except Exception: return err.code, {'error': 'gateway'}
    except Exception:
        return 502, {'error': 'No pudimos hablar con Localía. Probá de nuevo.'}

APP_HTML = open('/usr/share/localia/cambiar-pais.html', encoding='utf-8').read() if os.path.exists('/usr/share/localia/cambiar-pais.html') else '<h1>Localía</h1>'

class Local(BaseHTTPRequestHandler):
    """App local "Cambiar país". Solo 127.0.0.1; Host fijo (anti DNS-rebinding) y header propio en los POST (anti CSRF)."""
    def log_message(self, *a): pass
    def _send(self, code, obj, ctype='application/json'):
        b = obj.encode() if isinstance(obj, str) else json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(b)
    def _host_ok(self):
        return self.headers.get('Host') in ('127.0.0.1:8082', 'localhost:8082')
    def do_GET(self):
        if not self._host_ok(): return self._send(403, {'error': 'forbidden'})
        if self.path in ('/', '/index.html'): return self._send(200, APP_HTML, 'text/html; charset=utf-8')
        if self.path == '/api/state':
            code, j = gateway('/internal/state'); return self._send(code, j)
        if self.path == '/api/identity': return self._send(200, identity())
        self._send(404, {'error': 'not found'})
    def do_POST(self):
        if not self._host_ok() or self.headers.get('X-Localia') != '1': return self._send(403, {'error': 'forbidden'})
        n = int(self.headers.get('Content-Length') or 0)
        try: body = json.loads(self.rfile.read(n) or b'{}')
        except Exception: body = {}
        if self.path == '/api/exit':
            code, j = gateway('/internal/exit', {'code': str(body.get('code', ''))}); return self._send(code, j)
        self._send(404, {'error': 'not found'})

if __name__ == '__main__':
    threading.Thread(target=lambda: ThreadingHTTPServer(('127.0.0.1', 8082), Local).serve_forever(), daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0', 8081), H).serve_forever()

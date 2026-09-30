#!/usr/bin/env python3
"""Agente de la PC Localía. Solo lo llama el gateway (red privada + token).
GET  /health    estado del escritorio y la hora
GET  /identity  cómo ven los sitios a esta PC (IP y ubicación, a través del túnel)
POST /tz        {"tz": "America/Montevideo"} cambia la zona horaria del sistema
POST /restart-desktop  reinicia el escritorio
"""
import json, os, subprocess, time, urllib.request
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
        if self.path == '/restart-desktop':
            subprocess.Popen(['systemctl', 'restart', 'localia-desktop'])
            return self._send(200, {'ok': True})
        self._send(404, {'error': 'not found'})

if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8081), H).serve_forever()

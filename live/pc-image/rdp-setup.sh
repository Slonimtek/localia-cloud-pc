#!/bin/bash
# Acceso por Windows App (RDP) al MISMO escritorio que se ve en el navegador:
#   Windows App ──RDP──▶ xrdp (3389) ──VNC local──▶ x11vnc (127.0.0.1:5902) ──▶ display :1 de KasmVNC
# La contraseña es propia de cada PC (RDP_PASSWORD en /etc/localia/agent.env, la pone el portal al crearla).
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends xrdp x11vnc
adduser xrdp ssl-cert || true
# Puente x11vnc sobre el display de KasmVNC (solo escucha en localhost)
cat > /etc/systemd/system/localia-rdp-bridge.service <<'U'
[Unit]
Description=Localia: puente del escritorio para Windows App (x11vnc sobre :1)
After=localia-desktop.service
[Service]
User=localia
Environment=HOME=/home/localia
ExecStartPre=/bin/sh -c 'for i in $(seq 1 60); do [ -S /tmp/.X11-unix/X1 ] && [ -f /home/localia/.vnc/x11vnc.pass ] && exit 0; sleep 1; done; exit 1'
ExecStart=/usr/bin/x11vnc -display :1 -auth /home/localia/.Xauthority -rfbport 5902 -localhost -forever -shared -rfbauth /home/localia/.vnc/x11vnc.pass -quiet -noxrecord -noxfixes -ncache 0 -xrandr resize -afteraccept /usr/local/bin/localia-rdp-connected
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
U
# Al conectarse Windows App, el escritorio pasa a 1920x1080 (Windows App lo escala a su ventana)
cat > /usr/local/bin/localia-rdp-connected <<'S'
#!/bin/sh
DISPLAY=:1 XAUTHORITY=/home/localia/.Xauthority xrandr --output VNC-0 --mode 1920x1080 >/dev/null 2>&1 || true
S
chmod 755 /usr/local/bin/localia-rdp-connected
# Contraseña de la PC (se lee del agent.env al arrancar)
cat > /usr/local/sbin/localia-rdp-pass <<'S'
#!/bin/sh
# Certificado TLS propio de esta PC (la imagen no debe compartir el mismo)
if [ ! -f /etc/localia/.cert-done ]; then make-ssl-cert generate-default-snakeoil --force-overwrite && touch /etc/localia/.cert-done && systemctl restart xrdp; fi
P=$(grep '^RDP_PASSWORD=' /etc/localia/agent.env 2>/dev/null | cut -d= -f2)
[ -n "$P" ] || exit 0
install -d -o localia -g localia -m 700 /home/localia/.vnc
su -s /bin/sh localia -c "x11vnc -storepasswd '$P' /home/localia/.vnc/x11vnc.pass >/dev/null 2>&1"
chmod 600 /home/localia/.vnc/x11vnc.pass
S
chmod 755 /usr/local/sbin/localia-rdp-pass
cat > /etc/systemd/system/localia-rdp-pass.service <<'U'
[Unit]
Description=Localia: contraseña de escritorio remoto
After=local-fs.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/localia-rdp-pass
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
U
# xrdp: una sola sesión, "Localía", que se conecta directo al puente (sin pantalla de login de xrdp)
python3 - <<'PY'
import re
p='/etc/xrdp/xrdp.ini'; s=open(p).read()
g, rest = s.split('\n[Xorg]', 1) if '\n[Xorg]' in s else (s, '')
g = re.sub(r'^autorun=.*$', 'autorun=Localia', g, flags=re.M)
if 'autorun=Localia' not in g: g = g.replace('[Globals]', '[Globals]\nautorun=Localia', 1)
g = re.sub(r'^ls_title=.*$', 'ls_title=Localía', g, flags=re.M)
g = re.sub(r'^#?\s*ls_title=.*$', 'ls_title=Localía', g, flags=re.M)
g = re.sub(r'^security_layer=.*$', 'security_layer=tls', g, flags=re.M)
g = re.sub(r'^max_bpp=.*$', 'max_bpp=24', g, flags=re.M)
open(p,'w').write(g.rstrip()+'\n\n[Localia]\nname=Localía\nlib=libvnc.so\nusername=localia\npassword=ask\nip=127.0.0.1\nport=5902\n')
PY
# XFCE: que NO abra sola la ventanita "Pantalla" cada vez que cambia la resolución (navegador / Windows App)
install -d -o localia -g localia /home/localia/.config/xfce4/xfconf/xfce-perchannel-xml
cat > /home/localia/.config/xfce4/xfconf/xfce-perchannel-xml/displays.xml <<'X'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="displays" version="1.0">
  <property name="Notify" type="int" value="0"/>
  <property name="AutoEnableProfiles" type="bool" value="false"/>
</channel>
X
chown -R localia:localia /home/localia/.config/xfce4
systemctl daemon-reload
systemctl enable localia-rdp-pass localia-rdp-bridge xrdp
systemctl restart xrdp || true
echo RDP_SETUP_DONE

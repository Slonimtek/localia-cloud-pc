#!/bin/bash
# Prepara la imagen base de una PC Localía (Debian 12, arm64 o amd64): escritorio XFCE + Chromium + KasmVNC + agente.
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends xfce4 xfce4-terminal xfce4-taskmanager thunar mousepad ristretto dbus-x11 \
  chromium chromium-l10n fonts-noto-core fonts-noto-color-emoji fonts-dejavu locales curl jq python3 wget ca-certificates \
  xdg-utils at-spi2-core libgl1 x11-xserver-utils
for l in es_UY es_AR es_ES pt_BR en_US he_IL es_CL es_MX es_PE es_CO es_PY; do sed -i "s/^# *\(${l}.UTF-8 UTF-8\)/\1/" /etc/locale.gen; done
locale-gen
update-locale LANG=es_UY.UTF-8
URL=$(curl -s https://api.github.com/repos/kasmtech/KasmVNC/releases/latest | jq -r '.assets[].browser_download_url' | grep -E "bookworm.*$(dpkg --print-architecture)\.deb\$" | head -1)
echo "KasmVNC: $URL"
wget -q -O /tmp/kasmvnc.deb "$URL"
apt-get install -y /tmp/kasmvnc.deb
id localia || useradd -m -s /bin/bash -c "Localia" localia
usermod -aG ssl-cert localia
install -d -o localia -g localia /home/localia/.vnc /home/localia/.config/autostart /home/localia/Escritorio
cat > /home/localia/.vnc/xstartup <<'EOF'
#!/bin/sh
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
export LANG=es_UY.UTF-8
exec dbus-launch --exit-with-session startxfce4
EOF
chmod 755 /home/localia/.vnc/xstartup
touch /home/localia/.vnc/.de-was-selected
cat > /home/localia/.vnc/kasmvnc.yaml <<'EOF'
network:
  protocol: http
  interface: 0.0.0.0
  websocket_port: 6901
  use_ipv4: true
  use_ipv6: false
  ssl:
    require_ssl: false
desktop:
  resolution:
    width: 1600
    height: 900
  allow_resize: true
logging:
  log_writer_name: all
  log_dest: logfile
  level: 30
EOF
chown -R localia:localia /home/localia
su - localia -c 'printf "localia-desk\nlocalia-desk\n" | vncpasswd -u localia -w -r' || true
# Navegador: arranca solo en la página "¿desde dónde me ven?"
cat > /home/localia/.config/autostart/localia-browser.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Navegador
Exec=/usr/local/bin/localia-browser
X-GNOME-Autostart-enabled=true
EOF
cat > /usr/local/bin/localia-browser <<'EOF'
#!/bin/sh
URL=$(cat /etc/localia/start_url 2>/dev/null || echo https://ipinfo.io)
exec chromium --no-first-run --no-default-browser-check --password-store=basic --lang=es-419 --start-maximized --hide-crash-restore-bubble "$URL"
EOF
chmod 755 /usr/local/bin/localia-browser
mkdir -p /etc/chromium/policies/managed
cat > /etc/chromium/policies/managed/localia.json <<'EOF'
{"WebRtcIPHandling":"default_public_interface_only","DefaultBrowserSettingEnabled":false,"PasswordManagerEnabled":false,
 "BrowserSignin":0,"SyncDisabled":true,"MetricsReportingEnabled":false,"PromotionalTabsEnabled":false,"BackgroundModeEnabled":false}
EOF
# Accesos directos en el escritorio
cat > /home/localia/Escritorio/donde-me-ven.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=¿Desde dónde me ven?
Exec=chromium --password-store=basic https://ipinfo.io
Icon=web-browser
EOF
cat > /home/localia/Escritorio/test-fugas.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Test de fugas (DNS y WebRTC)
Exec=chromium --password-store=basic https://browserleaks.com/webrtc
Icon=security-high
EOF
chmod 755 /home/localia/Escritorio/*.desktop; chown -R localia:localia /home/localia
# Servicio de escritorio
cat > /etc/systemd/system/localia-desktop.service <<'EOF'
[Unit]
Description=Localia desktop (KasmVNC)
After=network-online.target
[Service]
Type=forking
User=localia
Environment=HOME=/home/localia
ExecStartPre=-/usr/bin/vncserver -kill :1
ExecStart=/usr/bin/vncserver :1 -disableBasicAuth -select-de xfce
ExecStop=/usr/bin/vncserver -kill :1
Restart=on-failure
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable localia-desktop
# DNS siempre por el túnel (nunca el resolver de AWS)
mkdir -p /etc/dhcp/dhclient-enter-hooks.d
cat > /etc/dhcp/dhclient-enter-hooks.d/localia-dns <<'EOF'
make_resolv_conf() { :; }
EOF
rm -f /etc/resolv.conf; printf "nameserver 1.1.1.1\nnameserver 9.9.9.9\n" > /etc/resolv.conf
bash /tmp/rdp-setup.sh
echo BAKE_DONE

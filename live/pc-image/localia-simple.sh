#!/bin/bash
# Modo simple de la PC Localía: la sesión abre directo en el navegador, sin escritorio ni menús.
# El escritorio completo (XFCE) queda como opción. Se cambia con: localia-mode simple|completo
# También deja lista la carpeta Descargas, que es la que usan "Subir desde mi compu" y "Bajar a mi compu".
set -euxo pipefail

# --- Descargas: todo lo que baja Chromium va ahí, sin preguntar ---
install -d -o localia -g localia /home/localia/Descargas
mkdir -p /etc/chromium/policies/managed
cat > /etc/chromium/policies/managed/localia-simple.json <<'EOF'
{"DownloadDirectory":"/home/localia/Descargas","PromptForDownloadLocation":false,"RestoreOnStartup":4,"RestoreOnStartupURLs":[],
 "BookmarkBarEnabled":false,"TranslateEnabled":false,"HomepageIsNewTabPage":false,"ShowHomeButton":true}
EOF
install -d -o localia -g localia /home/localia/.config
printf 'XDG_DOWNLOAD_DIR="$HOME/Descargas"\nXDG_DESKTOP_DIR="$HOME/Desktop"\n' > /home/localia/.config/user-dirs.dirs
chown localia:localia /home/localia/.config/user-dirs.dirs

# --- localia-mode: elige qué arranca la sesión ---
# XFCE arranca la lista "Failsafe" de xfce4-session. En modo simple dejamos solo el manejador de ventanas
# y la configuración (tema, fuentes); sin panel, sin escritorio y sin administrador de archivos.
cat > /usr/local/sbin/localia-mode <<'EOF'
#!/bin/bash
set -eu
MODE="${1:-}"; [ "$MODE" = simple ] || [ "$MODE" = completo ] || { echo "uso: localia-mode simple|completo [--no-restart]"; exit 2; }
H=/home/localia; X=$H/.config/xfce4/xfconf/xfce-perchannel-xml
mkdir -p /etc/localia "$X"
echo "$MODE" > /etc/localia/mode
if [ "$MODE" = simple ]; then CLIENTS="xfwm4 xfsettingsd"; else CLIENTS="xfwm4 xfsettingsd xfce4-panel Thunar xfdesktop"; fi
{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<channel name="xfce4-session" version="1.0">'
  echo ' <property name="general" type="empty"><property name="FailsafeSessionName" type="string" value="Failsafe"/><property name="SaveOnExit" type="bool" value="false"/></property>'
  echo ' <property name="sessions" type="empty"><property name="Failsafe" type="empty">'
  echo '  <property name="IsFailsafe" type="bool" value="true"/>'
  echo "  <property name=\"Count\" type=\"int\" value=\"$(echo $CLIENTS | wc -w)\"/>"
  i=0; for c in $CLIENTS; do
    echo "  <property name=\"Client${i}_Command\" type=\"array\"><value type=\"string\" value=\"$c\"/>$([ "$c" = Thunar ] && echo '<value type="string" value="--daemon"/>')</property>"
    echo "  <property name=\"Client${i}_Priority\" type=\"int\" value=\"$((15 + i * 5))\"/>"
    echo "  <property name=\"Client${i}_PerScreen\" type=\"bool\" value=\"false\"/>"
    i=$((i + 1)); done
  echo ' </property></property>'
  echo '</channel>'
} > "$X/xfce4-session.xml"
rm -rf "$H/.cache/sessions"          # sin esto XFCE restaura la sesión anterior (con panel)
chown -R localia:localia "$H/.config/xfce4"
[ "${2:-}" = --no-restart ] || systemctl restart localia-desktop
echo "MODO=$MODE"
EOF
chmod 755 /usr/local/sbin/localia-mode

# --- Navegador: en modo simple abre la página de Inicio y, si se cierra, vuelve a abrirse ---
cat > /usr/local/bin/localia-browser <<'EOF'
#!/bin/sh
MODE=$(cat /etc/localia/mode 2>/dev/null || echo completo)
FLAGS="--no-first-run --no-default-browser-check --password-store=basic --lang=es-419 --start-maximized --hide-crash-restore-bubble"
if [ "$MODE" = simple ]; then
  URL=$(cat /etc/localia/start_simple 2>/dev/null || cat /etc/localia/start_url 2>/dev/null || echo https://ipinfo.io)
  xsetroot -solid '#0c1a2c' 2>/dev/null || true
  while [ "$(cat /etc/localia/mode 2>/dev/null)" = simple ]; do
    rm -f "$HOME"/.config/chromium/Singleton*
    chromium $FLAGS --homepage="$URL" "$URL"
    sleep 1
  done
  exit 0
fi
URL=$(cat /etc/localia/start_url 2>/dev/null || echo https://ipinfo.io)
exec chromium $FLAGS "$URL"
EOF
chmod 755 /usr/local/bin/localia-browser

/usr/local/sbin/localia-mode simple --no-restart
echo SIMPLE_DONE

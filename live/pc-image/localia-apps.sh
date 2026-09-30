#!/bin/bash
# Apps de Localía adentro de la PC: "Cambiar país" (ícono en el escritorio y en el menú) y accesos directos.
set -euxo pipefail
install -d /usr/share/localia
install -m 644 /tmp/cambiar-pais.html /usr/share/localia/cambiar-pais.html
cat > /usr/share/localia/icon.svg <<'S'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0c1a2c"/><path d="M32 9c-10.5 0-19 8.2-19 18.4C13 40.4 32 55 32 55s19-14.6 19-27.6C51 17.2 42.5 9 32 9z" fill="#2a82d2"/><rect x="21.5" y="18.5" width="21" height="14" rx="3" fill="#fff"/><rect x="27.5" y="35" width="9" height="3" rx="1.5" fill="#fff"/></svg>
S
cat > /usr/share/applications/localia-cambiar-pais.desktop <<'D'
[Desktop Entry]
Type=Application
Name=Cambiar país (Localía)
Comment=Elegí desde qué país te ven los sitios
Exec=chromium --app=http://127.0.0.1:8082/ --window-size=460,640 --password-store=basic
Icon=/usr/share/localia/icon.svg
Categories=Network;
Terminal=false
D
cat > /usr/share/applications/localia-donde.desktop <<'D'
[Desktop Entry]
Type=Application
Name=¿Desde dónde me ven? (Localía)
Exec=chromium --password-store=basic https://ipinfo.io
Icon=web-browser
Categories=Network;
Terminal=false
D
# Escritorio de XFCE: ~/Desktop (los accesos viejos en ~/Escritorio no se veían)
install -d -o localia -g localia /home/localia/Desktop
rm -rf /home/localia/Escritorio
for f in localia-cambiar-pais localia-donde; do install -m 755 -o localia -g localia /usr/share/applications/$f.desktop /home/localia/Desktop/$f.desktop; done
# XFCE 4.18 pide confirmar lanzadores "no confiables": los marcamos como confiables al iniciar la sesión
cat > /usr/local/bin/localia-trust-launchers <<'T'
#!/bin/sh
for f in "$HOME"/Desktop/localia-*.desktop; do [ -f "$f" ] && gio set -t string "$f" metadata::xfce-exe-checksum "$(sha256sum "$f" | cut -d' ' -f1)" 2>/dev/null; done
exit 0
T
chmod 755 /usr/local/bin/localia-trust-launchers
install -d -o localia -g localia /home/localia/.config/autostart
cat > /home/localia/.config/autostart/localia-trust.desktop <<'A'
[Desktop Entry]
Type=Application
Name=Localía: accesos confiables
Exec=/usr/local/bin/localia-trust-launchers
X-GNOME-Autostart-enabled=true
A
chown -R localia:localia /home/localia/.config/autostart
echo APPS_DONE

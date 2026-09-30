#!/bin/bash
# Deja la imagen lista para clonar: agente instalado, sin estado de cloud-init ni llaves de host.
set -eux
install -m 755 /tmp/localia-agent.py /usr/local/bin/localia-agent
install -m 644 /tmp/localia-agent.service /etc/systemd/system/localia-agent.service
mkdir -p /etc/systemd/network/10-netplan-ens5.network.d /etc/localia
systemctl daemon-reload && systemctl enable localia-agent localia-desktop
systemctl stop localia-desktop || true
rm -rf /home/localia/.config/chromium /home/localia/.vnc/*.log /home/localia/.vnc/*.pid /tmp/.X1-lock /tmp/.X11-unix/X1 || true
rm -f /etc/localia/agent.env /etc/localia/start_url /etc/localia/.cert-done /home/localia/.vnc/x11vnc.pass
cloud-init clean --logs
rm -f /etc/ssh/ssh_host_*
truncate -s 0 /etc/machine-id
journalctl --rotate && journalctl --vacuum-time=1s || true
echo FINALIZED

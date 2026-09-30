#!/bin/bash
# Crea/actualiza la interfaz del gateway para una salida. Uso: hub-iface.sh <code> <n> <exit_pubkey>
set -euo pipefail
X=$1; N=$2; PUB=$3; T=$((100+N)); PORT=$((51820+N))
umask 077
[ -f /etc/wireguard/hub-$X.key ] || wg genkey > /etc/wireguard/hub-$X.key
cat > /etc/wireguard/wg-$X.conf <<C
[Interface]
Address = 10.66.$N.1/30
ListenPort = $PORT
PrivateKey = $(cat /etc/wireguard/hub-$X.key)
Table = off
PostUp = ip route replace default dev %i table $T metric 100
PreDown = ip route del default dev %i table $T metric 100 || true

[Peer]
PublicKey = $PUB
AllowedIPs = 0.0.0.0/0
C
systemctl enable wg-quick@wg-$X >/dev/null 2>&1 || true
systemctl restart wg-quick@wg-$X

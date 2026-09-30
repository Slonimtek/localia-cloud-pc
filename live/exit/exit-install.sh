#!/bin/bash
# Instalador de una salida Localía. Funciona en AWS, en un VPS o en una compu/Raspberry Pi en una casa.
# La salida "llama" al gateway: no hace falta abrir puertos en el router.
# Uso: EXIT_N=4 HUB_PUB=... HUB_ENDPOINT=1.2.3.4:51824 bash exit-install.sh
set -euo pipefail
: "${EXIT_N:?}"; : "${HUB_PUB:?}"; : "${HUB_ENDPOINT:?}"
PCNET=10.60.2.0/24
if ! command -v wg >/dev/null; then apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard-tools iptables; fi
umask 077
[ -f /etc/wireguard/exit.key ] || wg genkey > /etc/wireguard/exit.key
WAN=$(ip route show default | awk '{print $5; exit}')
cat > /etc/wireguard/localia.conf <<C
[Interface]
Address = 10.66.${EXIT_N}.2/30
PrivateKey = $(cat /etc/wireguard/exit.key)
PostUp = sysctl -q -w net.ipv4.ip_forward=1; iptables -t nat -A POSTROUTING -s ${PCNET} -o ${WAN} -j MASQUERADE; iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
PostDown = iptables -t nat -D POSTROUTING -s ${PCNET} -o ${WAN} -j MASQUERADE; iptables -t mangle -D FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu

[Peer]
PublicKey = ${HUB_PUB}
Endpoint = ${HUB_ENDPOINT}
AllowedIPs = 10.66.${EXIT_N}.1/32, ${PCNET}
PersistentKeepalive = 25
C
systemctl enable --now wg-quick@localia >/dev/null 2>&1 || systemctl restart wg-quick@localia
systemctl restart wg-quick@localia
echo "EXIT_PUB=$(wg pubkey < /etc/wireguard/exit.key)"

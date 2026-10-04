#!/bin/bash
# Firewall de la PC (modo directo, Hetzner): nadie entra a la PC, ni desde internet ni desde otras PCs de la red privada.
# Solo el portal (IP privada) llega al escritorio (6901), al agente (8081) y a SSH (22).
# Uso: pc-firewall.sh <ip privada del portal>
set -euxo pipefail
PORTAL_IP="${1:?falta la IP privada del portal}"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends nftables
cat > /etc/nftables.conf <<N
#!/usr/sbin/nft -f
flush ruleset
table inet localia {
  chain input {
    type filter hook input priority 0; policy drop;
    iif lo accept
    ct state established,related accept
    ip saddr $PORTAL_IP tcp dport { 22, 6901, 8081 } accept
    udp dport 68 accept
    icmp type echo-request accept
    icmpv6 type { nd-neighbor-solicit, nd-neighbor-advert, nd-router-advert, echo-request } accept
  }
}
N
systemctl enable nftables
echo FIREWALL_DONE

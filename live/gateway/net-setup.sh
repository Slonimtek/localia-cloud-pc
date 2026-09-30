#!/bin/bash
# Red del gateway Localía: reenvío, tablas por país con "blackhole" (corte automático) y firewall.
set -euo pipefail
PCNET=10.60.2.0/24
cat > /etc/sysctl.d/90-localia.conf <<S
net.ipv4.ip_forward=1
net.ipv4.conf.all.rp_filter=2
net.ipv4.conf.default.rp_filter=2
S
sysctl -q --system
# Regla general: toda PC sin país asignado (o en transición) va a la tabla 199 = sin internet.
ip rule show | grep -q "lookup 199" || ip rule add from $PCNET lookup 199 priority 29000
ip route replace blackhole default table 199
# Una tabla por salida (101=US 102=BR 103=AR 104=UY ...). Si el túnel cae, queda el blackhole.
for t in 101 102 103 104 105 106 107 108; do ip route replace blackhole default table $t metric 200; done
# Firewall: las PCs solo salen por túneles wg-*, nunca por la placa del gateway.
iptables -N LOCALIA-FWD 2>/dev/null || iptables -F LOCALIA-FWD
iptables -C FORWARD -j LOCALIA-FWD 2>/dev/null || iptables -I FORWARD 1 -j LOCALIA-FWD
iptables -A LOCALIA-FWD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
iptables -A LOCALIA-FWD -s $PCNET -o wg+ -j ACCEPT
iptables -A LOCALIA-FWD -s $PCNET -j DROP
iptables -P FORWARD DROP
iptables -t mangle -C FORWARD -o wg+ -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || \
  iptables -t mangle -A FORWARD -o wg+ -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
echo NET_OK

#!/bin/bash
# Red del gateway Localía: reenvío, tablas por país con "blackhole" (corte automático) y firewall.
set -euo pipefail
PCNET=10.60.2.0/24
WAN=$(ip route show default | awk '{print $5; exit}')
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
# Windows App: entra solo desde redes habilitadas por el portal (ipset con vencimiento)
ipset create localia-rdp hash:net,port,net timeout 43200 -exist
iptables -A LOCALIA-FWD -i $WAN -d $PCNET -p tcp --dport 3389 -m conntrack --ctstate DNAT -m set --match-set localia-rdp src,dst,dst -j ACCEPT
iptables -A LOCALIA-FWD -s $PCNET -o wg+ -j ACCEPT
iptables -A LOCALIA-FWD -s $PCNET -j DROP
iptables -P FORWARD DROP
iptables -t mangle -C FORWARD -o wg+ -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || \
  iptables -t mangle -A FORWARD -o wg+ -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
# Windows App: puerto 33000+N del gateway → PC 10.60.2.N:3389 (las reglas por PC las agrega el portal)
iptables -t nat -N LOCALIA-RDP 2>/dev/null || true
iptables -t nat -C PREROUTING -i $WAN -p tcp --dport 33000:33254 -j LOCALIA-RDP 2>/dev/null || iptables -t nat -A PREROUTING -i $WAN -p tcp --dport 33000:33254 -j LOCALIA-RDP
iptables -t nat -C POSTROUTING -o $WAN -d $PCNET -p tcp --dport 3389 -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -o $WAN -d $PCNET -p tcp --dport 3389 -j MASQUERADE
# Las respuestas de esas conexiones vuelven por internet directo, NO por el túnel del país
iptables -t mangle -C PREROUTING -i $WAN -p tcp --dport 33000:33254 -j CONNMARK --set-mark 0x10 2>/dev/null || iptables -t mangle -A PREROUTING -i $WAN -p tcp --dport 33000:33254 -j CONNMARK --set-mark 0x10
iptables -t mangle -C PREROUTING -s $PCNET -j CONNMARK --restore-mark 2>/dev/null || iptables -t mangle -A PREROUTING -s $PCNET -j CONNMARK --restore-mark
ip rule show | grep -q "fwmark 0x10" || ip rule add fwmark 0x10 lookup main priority 900
echo NET_OK

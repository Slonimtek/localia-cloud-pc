#!/bin/bash
# Baja los secretos de Localía desde AWS Parameter Store (cuenta 038744350127, us-east-1) a live/.secrets/.
# Uso: AWS_PROFILE=<tu perfil> bash live/traer-secretos.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/.secrets"
mkdir -p "$DIR"; chmod 700 "$DIR"
get(){ aws ssm get-parameter --region us-east-1 --name "/localia/$1" --with-decryption --query Parameter.Value --output text > "$DIR/$2"; chmod 600 "$DIR/$2"; echo "  $2"; }
echo "Bajando a $DIR:"
get ssh-key localia-hetzner
get ssh-key-pub localia-hetzner.pub
get portal-env portal.env
get state-env hetzner-state.env
get accesos ACCESOS.md
# Configuración de SSH: "portal" y las PCs (10.60.1.N, saltando por el portal)
. "$DIR/hetzner-state.env"
cat > "$DIR/ssh_config" <<C
Host *
  User root
  IdentityFile $DIR/localia-hetzner
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  UserKnownHostsFile $DIR/known_hosts
  ConnectTimeout 10
  ServerAliveInterval 20
Host portal
  HostName $PORTAL_IP
Host 10.60.1.*
  ProxyJump portal
C
echo "Listo. Accesos del portal: $DIR/ACCESOS.md · SSH: ssh -F $DIR/ssh_config portal"

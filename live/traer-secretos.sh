#!/bin/bash
# Baja los secretos del demo desde AWS Parameter Store (cuenta 038744350127, us-east-1) a live/.secrets/.
# Uso: AWS_PROFILE=<tu perfil> bash live/traer-secretos.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/.secrets"
mkdir -p "$DIR"
get(){ aws ssm get-parameter --region us-east-1 --name "/localia/$1" --with-decryption --query Parameter.Value --output text > "$DIR/$2"; echo "  $2"; }
echo "Bajando a $DIR:"
get ssh-key localia-admin.pem && chmod 600 "$DIR/localia-admin.pem"
get portal-env portal.env
get state-env state.env
get exits-json exits.json
get accesos ACCESOS.md
echo "Listo. Accesos del portal: $DIR/ACCESOS.md"

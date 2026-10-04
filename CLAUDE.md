# Localía by Slonimtek

Contexto completo del proyecto (idea, decisiones, arquitectura, precios, riesgos, próximos pasos):

@PROYECTO-LOCALIA.md

## Sistema en vivo

Está en `live/` y corre en **Hetzner** desde el 04/10/2026, en modo directo (sin salidas por país): portal Node + PCs con KasmVNC. El código de WireGuard por país y de AWS sigue en el repo, apagado. Leer `live/README.md`. Los secretos no están en git: se bajan con `bash live/traer-secretos.sh`, que los trae de AWS Parameter Store `/localia/*`. En zsh, poner llaves a las variables antes de ":" (`${VAR}:`); si no, zsh aplica modificadores.

## Cómo trabajar en este repo

- El mockup es un solo archivo: `index.html`. Los datos editables están al principio del `<script>` (`COUNTRIES`, `ORIGINS`, `TIERS`, `EXTRA`, `FIBRA`, `CONEX`).
- Probar local con `python3 -m http.server 8123` y abrir `http://localhost:8123`.
- Publicar = `git push` a `main` (GitHub Pages: https://slonimtek.github.io/localia-cloud-pc/).
- Textos en español rioplatense con voseo, cortos y sin jerga en la parte del cliente.
- Commits sin el trailer "Co-Authored-By: Claude".

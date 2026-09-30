# Localía · sistema en vivo

Demo real de punta a punta, no un mockup. Cada PC es una máquina de AWS con escritorio en el navegador que **sale a internet por el país que elijas**. El país se cambia en un clic y el corte automático es real.

- **Portal:** https://localia.100-57-206-149.sslip.io
- **Acceso:** con código de invitación. Los usuarios y contraseñas están en `live/.secrets/ACCESOS.md` (no está en git) y en AWS Parameter Store (`/localia/accesos`).
- **Estado al 30/09/2026:** salidas por **EE.UU., Brasil y Argentina** funcionando. **Uruguay** espera que se conecte una salida "de casa".

## Qué se puede mostrar

1. **Crear una PC** (`#armar/1`): elegís países y tamaño, y se prende una máquina real en AWS (~3 min). La pantalla "Armando" muestra cada paso real.
2. **Abrir la PC** (`#pc/<id>`): el escritorio aparece en la página, con la barra "Te ven en". Adentro, Chromium abre "¿Desde dónde me ven?", que se actualiza sola cada 8 s.
3. **Cambiar de país:** en unos 3 s la PC sale por otro país, y cambian la IP, la ciudad y la hora del sistema. Se puede confirmar con ipinfo.io, browserleaks o dnsleaktest desde adentro.
4. **Acceso directo, sin el portal:** cada PC tiene su dirección, `https://pc-<id>.100-57-206-149.sslip.io/`. Está en el panel con botón de copiar y QR para el celular.
   - Si no hay sesión, pide entrar y vuelve directo al escritorio.
   - Se ve a pantalla completa, con un **botón flotante** para cambiar de país, verificar la IP o ir al panel.
   - Se puede **instalar como app** en la compu (Chrome/Edge → Instalar) o en el celular (Agregar a inicio).
5. **Operación** (`#operacion`, solo admin):
   - Estado de cada túnel (último handshake, datos, IP pública y ubicación real).
   - **"Probar corte"**: baja el túnel y verifica que las PCs queden sin internet, en vez de salir por otro lado. Resultado medido: 0 fugas.
   - Prender o apagar salidas y conectar la salida de Uruguay.

## Arquitectura

```
Navegador ──HTTPS──▶ Gateway (EC2 t4g.small, EIP 100.57.206.149, Virginia)
                      ├─ Caddy: HTTPS automático (Let's Encrypt, on-demand para pc-<id>.…sslip.io)
                      ├─ Portal Node (API + web + proxy del escritorio KasmVNC con la sesión)
                      └─ Hub WireGuard: wg-us / wg-br / wg-ar / wg-uy  +  ip rule por PC  +  blackhole
                              │ (las PCs no tienen IP pública: su ruta por defecto es el gateway)
      PCs (EC2 t4g, subred privada 10.60.2.0/24) ──▶ gateway ──túnel──▶ salida del país ──▶ internet
      Salidas: US t4g.nano (Virginia) · BR t4g.nano + EIP (São Paulo) · AR r5.xlarge (Local Zone Buenos Aires) · UY: compu en casa
```

- **Corte automático:** cada país tiene su tabla de ruteo con el túnel y, detrás, un `blackhole`. Además, el firewall del gateway deja salir a las PCs solo por interfaces `wg-*`. Una PC sin país asignado cae en la tabla 199, que no tiene internet.
- **Sin fugas de DNS:** las PCs usan 1.1.1.1/9.9.9.9 por el túnel (nunca el DNS de AWS). Chromium tiene la política `WebRtcIPHandling=default_public_interface_only`.
- **Cambio de país:** agrega la nueva `ip rule` antes de borrar la vieja, así nunca queda un hueco. Además ajusta la zona horaria de la PC vía el agente.
- **Se apaga sola:** a los 120 min sin nadie conectado al escritorio.
- **El escritorio siempre toma el tamaño de la ventana.** KasmVNC recibe `resize=remote`, se reconecta solo y hay botón de pantalla completa. El recuadro ocupa toda la pantalla (`position:absolute; inset:0`).
- **HTTP/3 desactivado en Caddy.** Con QUIC la conexión sobrevive al cambio de IP, y el portal seguiría viendo la IP vieja.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `portal/` | `server.js` (API, EC2, ruteo, proxy, acceso directo), `overlay.js` (botón flotante de la PC), `public/` (web: `index.html`, `app.js`, `app.css`, `donde.html`), `dev/overlay-test.html` (prueba local del botón) |
| `gateway/` | `net-setup.sh` (tablas + firewall), `hub-iface.sh` (interfaz por país), `Caddyfile`, unidades systemd |
| `exit/exit-install.sh` | Instalador de una salida (AWS, VPS o compu en casa). La salida "llama" al gateway, así que no hace falta abrir puertos |
| `pc-image/` | `bake.sh` (XFCE + Chromium + KasmVNC), `localia-agent.py` (IP, zona horaria, reinicio) y `finalize.sh`. La imagen queda como AMI |
| `.secrets/` | **No va a git**: llave SSH, `portal.env`, `state.env` (IDs de AWS), `ACCESOS.md` |

## Conectar Uruguay (salida en casa)

1. En **Operación → Uruguay → "Conectar salida en casa"**: copiar el comando (sirve una sola vez).
2. En una compu con Debian/Ubuntu o una Raspberry Pi en una casa u oficina de Montevideo, abrir una terminal y pegarlo.
3. En segundos aparece "sana" en Operación. Ya se puede elegir Uruguay al crear una PC, con IP residencial uruguaya.

## Seguir desde otra compu

Hace falta la AWS CLI con credenciales de la cuenta `038744350127`. Después:

```bash
bash live/traer-secretos.sh
```

El script baja la llave SSH y la configuración desde Parameter Store a `live/.secrets/`. Para entrar al gateway:

```bash
ssh -i live/.secrets/localia-admin.pem admin@100.57.206.149
```

El SSH solo acepta IPs conocidas, así que hay que agregar la IP de casa al security group `localia-gateway`.

## Costos aproximados (on-demand)

| Pieza | US$/hora | Nota |
|---|---|---|
| Gateway t4g.small + EIP | ~0,022 | siempre prendido |
| Salida EE.UU. t4g.nano | ~0,009 | incluye IP pública |
| Salida Brasil t4g.nano + EIP | ~0,012 | |
| Salida Argentina r5.xlarge (Local Zone) | ~0,30 | **la más cara**: Buenos Aires no tenía capacidad para t3.medium. Apagarla desde Operación cuando no se muestra |
| Cada PC Mini t4g.medium | ~0,034 | solo prendida; se apaga sola |
| Discos + imagen | ~US$ 6/mes | |

Con todo prendido son unos US$ 9 por día. Sin la salida de Argentina, unos US$ 2 por día.

## Pendientes conocidos

- **Argentina:** migrar a t3.medium cuando haya capacidad en la Local Zone (~6× más barato).
- **Cliente de escritorio remoto nativo** (Windows App / Microsoft Remote Desktop por RDP): no está hecho. Requiere xrdp en la imagen y un acceso seguro (Cloudflare Access o un RD Gateway), sin abrir el puerto RDP a internet.
- **"Tele y celular":** en el demo todavía no hay perfil WireGuard para dispositivos.
- **KYC y pago:** en el demo son simulados.
- **Acceso:** en producción pasaría a Cloudflare Access; en el demo es Caddy con la sesión del portal.
- **IP dedicada por cliente:** en el demo hay una IP por salida, compartida entre las PCs de ese país.

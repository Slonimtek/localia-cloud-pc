# Localía · sistema en vivo

> **En vivo en Hetzner desde el 04/10/2026**, en modo directo (sin salidas por país) y con modo simple.
> - **Portal:** https://localia.178-104-63-109.sslip.io (por invitación; accesos en Parameter Store `/localia/accesos`).
> - **Qué hay:** servidor `localia-portal` (cx23, Núremberg), red privada `localia` (10.60.1.0/24), firewalls `localia-portal` y `localia-pc`, imagen `localia-pc-debian12-amd64-v6-simple` y una PC Mini de prueba.
> - **Costo:** portal €6,49/mes + cada PC Mini €6,49/mes (siempre prendida) + imagen ~€0,02/mes.
> - **Probado en una PC real:** creación en ~100 s, arranque en modo simple, subir y bajar archivos, y puertos cerrados desde internet.
> - **Seguir desde otra compu:** `bash live/traer-secretos.sh` y después `ssh -F live/.secrets/ssh_config portal`. El SSH del portal solo acepta las IPs cargadas en el firewall `localia-portal`.
>
> El demo de AWS se dio de baja el 01/10/2026: lo que sigue de acá para abajo describe ese demo (salidas por país) y queda como referencia; sus IPs, IDs y URL ya no existen.

Demo real de punta a punta, no un mockup. Cada PC es una máquina de AWS con escritorio en el navegador que **sale a internet por el país que elijas**. El país se cambia en un clic y el corte automático es real.

- **Portal:** https://localia.100-57-206-149.sslip.io
- **Acceso:** con código de invitación. Los usuarios y contraseñas están en `live/.secrets/ACCESOS.md` (no está en git) y en AWS Parameter Store (`/localia/accesos`).
- **Estado al 30/09/2026:** salidas por **EE.UU.** (sale por el propio gateway) y **Brasil** (São Paulo). **Argentina fue dada de baja** a pedido. **Uruguay** espera que se conecte una salida "de casa".

## Qué se puede mostrar

1. **Crear una PC** (`#armar/1`): elegís el tamaño y confirmás; **no se pregunta el país**. Se prende una máquina real en AWS (~3 min). Arranca saliendo por `DEFAULT_EXIT` (EE.UU.) y la pantalla "Armando" muestra cada paso real.
2. **Abrir la PC** (`#pc/<id>`): el escritorio aparece en la página, con la barra "Te ven en". Adentro, Chromium abre "¿Desde dónde me ven?", que se actualiza sola cada 8 s.
3. **Cambiar de país desde adentro de la PC:** ícono **"Cambiar país (Localía)"** en el escritorio y en Aplicaciones, o el botón en "¿Desde dónde me ven?". Abre una ventanita con la identidad actual y los países disponibles. En unos 3 s la PC sale por otro país, y cambian la IP, la ciudad y la hora. Funciona igual desde Windows App. También se puede cambiar desde la barra del portal o el botón flotante.
4. **Acceso directo, sin el portal:** cada PC tiene su dirección, `https://pc-<id>.100-57-206-149.sslip.io/`. Está en el panel con botón de copiar y QR para el celular.
   - Si no hay sesión, pide entrar y vuelve directo al escritorio.
   - Se ve a pantalla completa, con un **botón flotante** para cambiar de país, verificar la IP o ir al panel.
   - Se puede **instalar como app** en la compu (Chrome/Edge → Instalar) o en el celular (Agregar a inicio).
5. **Windows App (escritorio remoto de Microsoft):** en el panel, **"Conectar con Windows App"**. Muestra el **mismo escritorio** que el navegador. Ver la sección "Windows App" más abajo.
6. **Operación** (`#operacion`, solo admin):
   - Estado de cada túnel (último handshake, datos, IP pública y ubicación real).
   - **"Probar corte"**: baja el túnel y verifica que las PCs queden sin internet, en vez de salir por otro lado. Resultado medido: 0 fugas.
   - Prender o apagar salidas y conectar la salida de Uruguay.

## Modo directo en Hetzner (en la rama, sin desplegar)

Desde el 04/10/2026 el modelo es **sin salidas por país**: el cliente elige la ubicación de la PC al crearla y la PC sale a internet desde ahí.

- **Se activa solo** con `CLOUD=hetzner` (para volver a los túneles por país: `SALIDA=vpn`). Con `CLOUD=aws` todo sigue como antes.
- **Variables en `portal.env`:** `HCLOUD_TOKEN`, `HCLOUD_IMAGE` (snapshot de la imagen de PC), `HCLOUD_NETWORK` (red privada), `HCLOUD_FIREWALL` (firewall sin reglas de entrada, se aplica a cada PC), `HCLOUD_ZONE` (por defecto `eu-central`) y `HCLOUD_SSH_KEY` (opcional).
- **Ubicaciones:** se ofrecen las de la zona del portal (Falkenstein, Núremberg y Helsinki). Ashburn, Hillsboro y Singapur aparecen como "Próximamente": la red privada de Hetzner no cruza zonas, así que cada zona necesita su propio portal de relevo.
- **Red:** cada PC tiene IP pública propia para salir, con el firewall cerrado a toda entrada. El portal llega al escritorio y al agente por la red privada.
- **Sin apagado automático:** en Hetzner una máquina apagada se cobra igual.
- **No disponible todavía en este modo:** Windows App (dependía del gateway) y las ubicaciones de otras zonas.
- **Tamaños:** línea x86 compartida: Mini `cx23` (2 vCPU, 4 GB, 40 GB), Standard `cx43` (8 vCPU, 16 GB, 160 GB), Gold `cx53` (16 vCPU, 32 GB, 320 GB). Las ARM (`cax`) no tenían stock el 04/10/2026.
- **Entre PCs:** el firewall de Hetzner no filtra la red privada, así que cada PC trae su propio firewall (`pc-image/pc-firewall.sh`): solo el portal llega al escritorio, al agente y a SSH.
- **Armar la imagen:** en una máquina Debian 12 nueva, copiar `pc-image/*` a `/tmp` y correr `bake.sh`, `localia-apps.sh`, `localia-simple.sh`, `pc-firewall.sh <ip privada del portal>` y al final `finalize.sh`; apagar, sacar un snapshot y poner su ID en `HCLOUD_IMAGE`.
- **Desplegar el portal:** copiar `portal/` a `/opt/localia/portal` del servidor y `systemctl restart localia-portal`.

## Chat privado de cada PC

Cada PC trae un chat propio para que su dueño atienda a sus clientes.

- **Bandeja del dueño:** `https://pc-<id>.<base>/__localia/chat/`. Adentro de la PC se abre con el botón "Mis chats" de la página de Inicio, sin iniciar sesión. Desde afuera, con la sesión del portal (panel o botón flotante). Varias conversaciones a la vez, con contactos (nombre, WhatsApp, notas), no leídos y búsqueda.
- **Invitación:** el dueño crea el contacto y le manda su link personal `https://localia.<base>/c/<pc>-<clave>`, con el botón "Enviar por WhatsApp" (abre `wa.me` con el mensaje armado) o copiándolo.
- **Link general de la PC:** `https://localia.<base>/chat/<clave>`, para poner en una web o en redes. Quien entra deja nombre y WhatsApp, queda como contacto nuevo y pasa a su conversación; si vuelve desde el mismo navegador, retoma donde estaba. El dueño lo ve y lo copia arriba de la lista, y desde Ajustes puede cerrarlo o cambiarlo (el anterior deja de funcionar). Límites: 5 ingresos por hora por IP y 60 por día por PC.
- **Cliente:** abre el link en el navegador y chatea, sin cuenta ni contraseña: el link es su llave. Texto, fotos y archivos (hasta 25 MB).
- **Aviso sonoro:** suena cuando llega un mensaje y se apaga desde Ajustes de la bandeja o desde el botón flotante (queda guardado por PC). La PC virtual no tiene parlantes: al dueño le suena el botón flotante, que corre en su navegador real, y además muestra cuántos mensajes hay sin leer. El cliente tiene su propia campana en el chat.
- **Control:** el dueño puede bloquear un contacto (su link deja de funcionar) o borrarlo con su conversación y sus adjuntos.
- **Datos:** `/var/lib/localia/chat/<pc>.json` y los adjuntos en `/var/lib/localia/chat/<pc>/`, en el servidor del portal.
- **Seguridad:** adentro de la PC, el portal reconoce a la PC por su IP pública (propia de cada PC, informada por Caddy) y solo para el chat, nunca para el escritorio. Los POST exigen un header propio. Un contacto solo ve su conversación y sus archivos.
- **Código:** `portal/chat.js` y `portal/chat-ui/` (`bandeja.html`, `cliente.html`).
- **Pendiente:** los mensajes se actualizan cada 3 s; el link general no verifica que el WhatsApp que deja la persona sea suyo.

## Modo simple (en la rama, todavía sin imagen)

Pensado para usuarios no técnicos: la PC abre **directo en el navegador**, sin escritorio ni menús, en una página de Inicio con accesos grandes a bancos, trámites, tele y compras del país por el que sale.

- **Inicio:** `portal/public/inicio.html` (`/inicio`). Los accesos por país están en `SITES`, al principio del `<script>`.
- **Archivos:** en el botón flotante de la PC (y como "Archivos" dentro del portal): **"Subir un archivo desde mi compu"** lo deja en la carpeta Descargas de la PC, y **"Bajar archivos a mi compu"** lista lo que se bajó adentro. Tope de 200 MB por archivo.
- **Escritorio completo:** sigue disponible desde el mismo botón ("Ver el escritorio completo" / "Volver al modo simple").
- **PCs nuevas:** nacen en modo simple. Las anteriores quedan como estaban (escritorio completo).
- **Probado en una PC real** (imagen v6, Hetzner): arranca solo con el navegador, sin panel ni escritorio. **Falta probar con personas:** teclado (ñ, tildes, @), copiar y pegar, y el cambio a escritorio completo desde el botón.
- **Probar el botón sin PC:** `portal/dev/overlay-test.html` (acceso directo) y `portal/dev/overlay-test-embed.html` (dentro del portal).

## Arquitectura

```
Navegador ──HTTPS──▶ Gateway (EC2 t4g.micro, EIP 100.57.206.149, Virginia) · también es la salida de EE.UU.
                      ├─ Caddy: HTTPS automático (Let's Encrypt, on-demand para pc-<id>.…sslip.io)
                      ├─ Portal Node (API + web + proxy del escritorio KasmVNC con la sesión)
                      └─ Hub WireGuard: wg-br / wg-uy  +  ip rule por PC  +  blackhole  (EE.UU.: tabla 101 → internet del gateway)
                              │ (las PCs no tienen IP pública: su ruta por defecto es el gateway)
      PCs (EC2 t4g, subred privada 10.60.2.0/24) ──▶ gateway ──túnel──▶ salida del país ──▶ internet
      Salidas: US = el gateway (IP 100.57.206.149, Ashburn) · BR t4g.nano + EIP (São Paulo) · UY: compu en casa
```

- **Corte automático:** cada país tiene su tabla de ruteo con el túnel y, detrás, un `blackhole`. Además, el firewall del gateway deja salir a las PCs solo por interfaces `wg-*`. Por la placa del gateway solo salen las PCs asignadas a EE.UU. (`ipset localia-direct`, que mantiene el portal). Probado: al cortar Brasil, la PC de Brasil quedó sin internet y no salió por el gateway. Una PC sin país asignado cae en la tabla 199, que no tiene internet.
- **Sin fugas de DNS:** las PCs usan 1.1.1.1/9.9.9.9 por el túnel (nunca el DNS de AWS). Chromium tiene la política `WebRtcIPHandling=default_public_interface_only`.
- **Cambio de país:** agrega la nueva `ip rule` antes de borrar la vieja, así nunca queda un hueco. Además ajusta la zona horaria de la PC vía el agente.
- **Se apaga sola:** a los 120 min sin nadie conectado al escritorio.
- **El escritorio siempre toma el tamaño de la ventana.** KasmVNC recibe `resize=remote`, se reconecta solo y hay botón de pantalla completa. El recuadro ocupa toda la pantalla (`position:absolute; inset:0`).
- **"Cambiar país" adentro de la PC:** el agente sirve una app local en `127.0.0.1:8082`. Pide el cambio al gateway por la **red privada** (`10.60.1.10:3001`), con el token de la PC, y el gateway además verifica que venga de la IP de esa PC. Protecciones: Host fijo (anti DNS-rebinding) y header `X-Localia` obligatorio en los POST, para que una web cualquiera no pueda cambiarte de país.
- **Salidas disponibles para todas las PCs:** son las prendidas y conectadas. Las que se apagan desde Operación dejan de ofrecerse.
- **HTTP/3 desactivado en Caddy.** Con QUIC la conexión sobrevive al cambio de IP, y el portal seguiría viendo la IP vieja.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `portal/` | `server.js` (API, EC2, ruteo, proxy, acceso directo), `overlay.js` (botón flotante de la PC), `providers.js` (AWS o Hetzner), `public/` (web: `index.html`, `app.js`, `app.css`, `donde.html`, `inicio.html`), `dev/overlay-test.html` (prueba local del botón) |
| `gateway/` | `net-setup.sh` (tablas + firewall), `hub-iface.sh` (interfaz por país), `Caddyfile`, unidades systemd |
| `exit/exit-install.sh` | Instalador de una salida (AWS, VPS o compu en casa). La salida "llama" al gateway, así que no hace falta abrir puertos |
| `pc-image/` | `bake.sh` (XFCE + Chromium + KasmVNC), `rdp-setup.sh` (Windows App: xrdp + x11vnc), `localia-apps.sh` + `cambiar-pais.html` (app "Cambiar país" y accesos del escritorio), `localia-simple.sh` (modo simple y carpeta Descargas), `localia-agent.py` (IP, zona horaria, contraseña, app local) y `finalize.sh`. Imagen actual: ver `AMI_PC` en `portal.env` |
| `.secrets/` | **No va a git**: llave SSH, `portal.env`, `state.env` (IDs de AWS), `ACCESOS.md` |

## Windows App (RDP) con apertura por pedido

```
Windows App ──RDP/TLS──▶ gateway 100.57.206.149:33000+N ──DNAT──▶ PC 10.60.2.N:3389 (xrdp)
                                                                   └─VNC local─▶ x11vnc 127.0.0.1:5902 ─▶ display :1 (KasmVNC)
```

- **Cerrado para internet.** El puerto 33000+N solo acepta conexiones de las redes que el usuario habilita desde el portal: el botón agrega su red /24 a `ipset localia-rdp` y vence a las 12 h.
- **Contraseña propia de cada PC** (8 caracteres, límite de VNC). La crea el portal y la pasa al crear la PC. Se muestra en el panel.
- **Mismo escritorio que el navegador.** x11vnc publica el display de KasmVNC y xrdp lo sirve por RDP. Al conectarse Windows App, el escritorio pasa a 1920×1080 y la app lo escala.
- **Respuestas por internet directo.** Las conexiones entrantes llevan la marca `0x10` y sus respuestas salen por internet (`ip rule fwmark 0x10 lookup main`), no por el túnel del país.
- **Certificado TLS propio** por PC (autofirmado): la primera vez, Windows App pide confirmar.
- **Probado** con FreeRDP (mismo protocolo): sesión real con contraseña en una PC recién creada y después de reiniciarla. El escritorio muestra "Te ven en Ashburn".

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

## Costos (on-demand, AWS Pricing API, 30/09/2026)

| Pieza | US$/mes | Nota |
|---|---|---|
| Gateway t4g.micro + EIP + disco 16 GB | ~11 | siempre prendido; también es la salida de EE.UU. |
| Salida Brasil t4g.nano + EIP + disco (São Paulo) | ~10 | |
| Imagen de las PCs (snapshot ~24 GB) | ~1 | |
| **Base total** | **~22** | ~US$ 0,73 por día (antes ~36) |
| Cada PC Mini t4g.medium | 0,034/h prendida + ~2,6/mes de disco | se apaga sola a los **30 min** sin uso |

## Cómo bajar costos (analizado el 30/09/2026)

**Demo: ya aplicado el 30/09/2026.**
- El gateway hace de salida de EE.UU.
- Gateway en t4g.micro.
- Argentina borrada.
- Apagado automático a los 30 min.

La base pasó de ~US$ 36 a ~US$ 22/mes.

**Por cliente (Mini ~US$ 12/mes a 90 h):**
- IP del país compartida por defecto (−US$ 3,65); la IP fija propia pasa a ser un extra pago.
- Varias PCs por máquina, en contenedores: −40–50% de cómputo.
- Savings Plan de 1 año: −30–35%.
- CloudFront delante del escritorio: el tráfico EC2→CloudFront es gratis y hay 1 TB/mes incluido.
- Salidas fuera de AWS donde el tráfico es caro (São Paulo ~US$ 0,14–0,15/GB): VPS local con tráfico incluido o compu en casa.
- Disco 20 GB y snapshot para PCs inactivas.

Con todo eso, la Mini queda en ~US$ 5–6/mes.

## Pendientes conocidos

- **Argentina:** migrar a t3.medium cuando haya capacidad en la Local Zone (~6× más barato).
- **Windows App en producción:** conviene un RD Gateway (por ejemplo rdpgw) o Cloudflare, con certificado válido y contraseñas más largas. En el demo es apertura por pedido (red /24 por 12 h) y contraseña VNC de 8 caracteres.
- **"Tele y celular":** en el demo todavía no hay perfil WireGuard para dispositivos.
- **KYC y pago:** en el demo son simulados.
- **Acceso:** en producción pasaría a Cloudflare Access; en el demo es Caddy con la sesión del portal.
- **IP dedicada por cliente:** en el demo hay una IP por salida, compartida entre las PCs de ese país.

# Localía · sistema en vivo

Demo real de punta a punta, no un mockup. Cada PC es una máquina de AWS con escritorio en el navegador que **sale a internet por el país que elijas**. El país se cambia en un clic y el corte automático es real.

- **Portal:** https://localia.100-57-206-149.sslip.io
- **Acceso:** con código de invitación. Los usuarios y contraseñas están en `live/.secrets/ACCESOS.md` (no está en git) y en AWS Parameter Store (`/localia/accesos`).
- **Estado al 30/09/2026:** salidas por **EE.UU. y Brasil** funcionando. **Argentina está apagada** a pedido: no se ofrece en el portal y se vuelve a prender desde Operación. **Uruguay** espera que se conecte una salida "de casa".

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
- **"Cambiar país" adentro de la PC:** el agente sirve una app local en `127.0.0.1:8082`. Pide el cambio al gateway por la **red privada** (`10.60.1.10:3001`), con el token de la PC, y el gateway además verifica que venga de la IP de esa PC. Protecciones: Host fijo (anti DNS-rebinding) y header `X-Localia` obligatorio en los POST, para que una web cualquiera no pueda cambiarte de país.
- **Salidas disponibles para todas las PCs:** son las prendidas y conectadas. Las que se apagan desde Operación dejan de ofrecerse.
- **HTTP/3 desactivado en Caddy.** Con QUIC la conexión sobrevive al cambio de IP, y el portal seguiría viendo la IP vieja.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `portal/` | `server.js` (API, EC2, ruteo, proxy, acceso directo), `overlay.js` (botón flotante de la PC), `public/` (web: `index.html`, `app.js`, `app.css`, `donde.html`), `dev/overlay-test.html` (prueba local del botón) |
| `gateway/` | `net-setup.sh` (tablas + firewall), `hub-iface.sh` (interfaz por país), `Caddyfile`, unidades systemd |
| `exit/exit-install.sh` | Instalador de una salida (AWS, VPS o compu en casa). La salida "llama" al gateway, así que no hace falta abrir puertos |
| `pc-image/` | `bake.sh` (XFCE + Chromium + KasmVNC), `rdp-setup.sh` (Windows App: xrdp + x11vnc), `localia-apps.sh` + `cambiar-pais.html` (app "Cambiar país" y accesos del escritorio), `localia-agent.py` (IP, zona horaria, contraseña, app local) y `finalize.sh`. Imagen actual: ver `AMI_PC` en `portal.env` |
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

## Costos aproximados (on-demand)

| Pieza | US$/hora | Nota |
|---|---|---|
| Gateway t4g.small + EIP | ~0,022 | siempre prendido |
| Salida EE.UU. t4g.nano | ~0,009 | incluye IP pública |
| Salida Brasil t4g.nano + EIP | ~0,012 | |
| Salida Argentina r5.xlarge (Local Zone) | **0,462** | **la más cara (~US$ 340/mes)**: Buenos Aires no tenía capacidad para t3.medium (0,0773/h). Apagarla desde Operación cuando no se muestra |
| Cada PC Mini t4g.medium | ~0,034 | solo prendida; se apaga sola |
| Discos + imagen | ~US$ 6/mes | |

**Hoy, con Argentina apagada:** ~US$ 1 por día de base (gateway + EE.UU. + Brasil), más ~US$ 0,034 por hora por cada PC Mini prendida. Argentina apagada solo cobra su disco (~US$ 0,8/mes). Si se la vuelve a prender, suma ~US$ 11 por día. Precios on-demand consultados en la AWS Pricing API el 30/09/2026.

## Cómo bajar costos (analizado el 30/09/2026)

**Demo (base ~US$ 32/mes):**
- Usar el gateway como salida de EE.UU.: −US$ 7.
- Gateway t4g.small → t4g.micro: −US$ 6.
- Borrar la salida de Argentina apagada: −US$ 1.
- Apagado automático a los 30 min (hoy 120).

Queda en ~US$ 18/mes.

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

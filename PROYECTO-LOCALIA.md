# Localía by Slonimtek: documento del proyecto

> Documento para retomar el proyecto desde cualquier compu. Resume la idea, las decisiones tomadas, la arquitectura, los números y los riesgos al **30 de septiembre de 2026**. Si trabajás con Claude Code, este archivo se carga solo desde `CLAUDE.md`.

- **Mockup en vivo:** https://slonimtek.github.io/localia-cloud-pc/
- **Repo:** https://github.com/Slonimtek/localia-cloud-pc (público, GitHub Pages desde `main`, raíz)
- **Dueño:** Yaakov Slonimczyk (Slonimtek)

> **Novedad (30/09/2026): hay un sistema en vivo funcionando de punta a punta.** El portal está en https://localia.100-57-206-149.sslip.io, por invitación. Tiene PCs reales en AWS Virginia con salida por EE.UU., Brasil y Argentina; el cambio de país tarda unos 3 s y el corte automático está probado, con 0 fugas. Uruguay queda listo para conectarse con una compu en casa. Todo el detalle está en [`live/README.md`](live/README.md).

---

## 1. La idea en una frase

Alquilar **computadoras en la nube** (Mini / Standard / Gold) que la gente abre desde el navegador y que **salen a internet por el país que elige**, con una **IP fija de ese país, solo suya**. Para los sitios, el usuario "está" en ese país: su banco, los trámites del Estado, la tele y los medios, las tiendas y las apps locales.

**El país es el producto.** Funciona como una identidad digital local ("jugá de local, estés donde estés").

**Público principal:** la diáspora latinoamericana en Israel, España y EE.UU., que necesita su país de origen desde afuera.

**Casos de uso:** home banking, portales del Estado (impuestos, registros, turnos), tele/radio/noticias locales, tiendas y apps del país, clientes que solo aceptan conexiones locales.

---

## 2. Decisiones tomadas (en orden)

1. **Cloudflare no puede alojar las PCs.** Cloudflare Containers llegan a 4 vCPU, 12 GB de RAM y 20 GB de disco. Ese disco se borra cuando el container se duerme, no corre Windows y no se elige país. Cloudflare sí sirve para la web, el panel y, sobre todo, el **acceso**.
2. **El acceso es con Cloudflare Access + escritorio remoto (RDP) en el navegador**, disponible para todos desde septiembre de 2025, más **Cloudflare Tunnel**. El usuario no instala nada y la PC no expone ningún puerto a internet.
3. **Modelo v1 (descartado): una PC en cada país.** Tenía tres problemas: Uruguay no tiene datacenter de ningún proveedor grande, desde lejos el escritorio se sentía lento (Tel Aviv → Montevideo son unos 250 ms) y había que mantener una flota de PCs por país.
4. **Modelo v2 (actual): la PC cerca del usuario y una salida en el país elegido.**
   - La PC vive en la zona más cercana al usuario (AWS Tel Aviv, España, Miami o Virginia), así el escritorio va fluido.
   - Todo el tráfico de internet sale por un **nodo de salida** en el país elegido, a través de un túnel cifrado (WireGuard), con **IP fija dedicada por cliente**.
   - Una misma PC puede tener **varios países** y se cambia de país en un clic.
   - Agregar un país es barato: alcanza con un nodo de salida chico, sin PCs.
5. **El túnel va en la red, no como app adentro de la PC.** Así el usuario no lo puede apagar ni romper.
6. **Corte automático obligatorio.** Si el túnel se cae, la PC queda sin internet y nunca sale por la IP de la zona. Un login al banco desde Israel dispararía alarmas. Además, el DNS va por el túnel y WebRTC queda bloqueado, para que no haya fugas de IP.
7. **Túnel partido.** La conexión del escritorio remoto (Cloudflare) va directo y no por el túnel; si no, se sumaría la demora.
8. **Salidas propias, nunca un proveedor de VPN comercial.** Sus IPs son compartidas y ya están quemadas, que es justo lo que queremos evitar.
9. **Opción premium "IP de fibra local"** (Uruguay y Argentina): la salida va por una fibra con IP fija, por ejemplo de Antel. Para los sitios parece una casa u oficina, lo más "local" posible. **Es una hipótesis a validar.**
10. **Tele y video:** se ofrece **"Conexión para tele y celular"**, que conecta esos dispositivos directo a la salida del país. Para video es mucho mejor que verlo por el escritorio remoto (ver la sección 6).
11. **Marca: "Localía"**, de "jugar de local". Identidad visual de sello de pasaporte, acento celeste, sol para Gold y violeta tinta de sello. Es provisoria y fácil de cambiar.

---

## 3. Arquitectura (v2)

```
Vos (Tel Aviv) ── escritorio remoto (Cloudflare Access, ~4 ms) ──▶ Tu PC (AWS Tel Aviv)
                                                                    │  túnel WireGuard, por la red
                                                                    │  (con corte automático)
                                                                    ▼
                                                     Nodo de salida en Uruguay (IP fija solo tuya)
                                                                    │
                                                                    ▼
                                                  Banco · trámites · tele · tiendas → "te ven en Uruguay"

Tele / celular (opcional) ── túnel directo ──▶ la misma salida de Uruguay (sin pasar por la PC)
```

| Pieza | Tecnología | Nota |
|---|---|---|
| Web y panel del cliente | Cloudflare Workers + D1 | Cuentas, planes, países, dispositivos |
| Acceso a la PC | Cloudflare Access (RDP en el navegador) + Tunnel | Sin puertos abiertos; login + MFA |
| PCs | AWS en 2 a 4 zonas cerca de los clientes | Hibernan solas al no usarse; el margen depende de esto |
| Salidas por país | Nodos WireGuard con una IP fija por cliente | UY: Antel (VPS / fibra). AR, CL, PE, MX: AWS Local Zones o regiones. CO, PY, ES: proveedores locales |
| Seguridad de salida | Corte automático + DNS por el túnel + WebRTC bloqueado | Chequeo diario de que la IP no aparezca como VPN |
| Identidad (KYC) | Librería propia `cedula-ocr` (UY/AR/CL) | Verificación antes de prender la primera PC |
| Cobros | MercadoPago + Stripe | En moneda local, por adelantado |
| Avisos y soporte | WhatsApp (Baileys) | PC lista, alertas de IP, soporte humano |

**Países en el mockup:** Uruguay, Argentina, Chile, Paraguay, Perú, Colombia, México, Brasil, EE.UU., España e Israel (Bolivia aparece como "próximamente").

**AWS Local Zones en LatAm disponibles:** Buenos Aires, Santiago, Lima y Querétaro. Bogotá y Río fueron anunciadas.

---

## 4. Modelo de precios (ilustrativo, a validar)

| Concepto | Precio |
|---|---|
| PC Mini (2 vCPU · 4 GB · 64 GB) | US$ 29 base |
| PC Standard (4 vCPU · 16 GB · 128 GB) | US$ 59 base |
| PC Gold (8 vCPU · 32 GB · 256 GB) | US$ 119 base |
| Multiplicador según la zona de la PC | Virginia 1,0 · Miami 1,05 · España 1,1 · Tel Aviv 1,15 · Montevideo (Antel) 1,4 |
| Windows (licencia) | +10 / +20 / +40 |
| País incluido | 1 |
| Cada país extra | +US$ 6 |
| IP de fibra local (UY, AR) | +US$ 9 |
| Conexión para tele y celular | +US$ 4 |
| Siempre prendida (sin hibernar) | recargo alto: la nube cobra cada hora |
| Anual | −15% |

**Ejemplo:** Standard + Windows, con la PC en Tel Aviv, te ven en Uruguay y en Argentina → US$ 68 + 20 + 6 = **US$ 94 por mes**.

### Unit economics (modelo de la calculadora en la vista "Operación")

- **Costo de cómputo:** tarifa por hora × horas prendida. Standard + Windows en Tel Aviv ≈ US$ 0,28/h.
- **Disco + copias:** GB × 0,08 × multiplicador × 1,25.
- **Salidas:** por cada país, IP fija (US$ 3,65) + parte del nodo (≈ US$ 1,5).
- **Datos:** GB × US$ 0,09 × **2 tramos** (salida → PC y PC → usuario).
- **Cloudflare Access:** ≈ US$ 7 por usuario por mes.
- **Cobro:** ≈ 5%.
- **Resultado del ejemplo:** con 86 h/mes y 38 GB, **≈ +US$ 27/mes (≈ 28%)**, con equilibrio en ≈ 183 h/mes.
- **La clave del negocio:** el cliente paga un mes fijo y la nube cobra por hora, así que **sin hibernación automática no hay margen**.
- **Alerta de video:** con 300 GB/mes de video vistos por la PC, **la cuenta da pérdida (≈ −US$ 20)**. Por eso existe la Conexión para tele y celular, donde los datos pasan una sola vez.

Hay que validar todo con la calculadora de AWS, la cotización de Antel (averiguar si factura por hora o por mes) y proveedores locales.

---

## 5. Riesgos y preguntas abiertas

1. **Licencias de Windows:** no se puede alquilar Windows 10/11 en nube compartida. Usar Windows Server con licencia incluida del proveedor, o Linux. Confirmarlo con un partner de licencias Microsoft.
2. **Reputación de las IPs:** las IPs de datacenter suelen aparecer marcadas como VPN o hosting en las bases de geo-IP y antifraude. Hay que probarlo en un piloto con los bancos y portales objetivo. La hipótesis es que las IPs de ISP local o fibra se marcan mucho menos.
3. **Señales más allá de la IP:** hora, idioma, fugas de DNS y WebRTC, huella TCP y MTU del túnel, y demoras. Configurar hora e idioma del país, ajustar el MSS y probar contra antifraudes reales.
4. **Sanciones internacionales (OFAC):** "tener IP de otro país" atrae a quien quiere esquivarlas. Hay que bloquear altas desde países sancionados, exigir KYC obligatorio y cobrar por adelantado.
5. **Abuso:** minería, spam (puerto 25 bloqueado) y fraude con cuentas ajenas. Si hay abuso, el proveedor puede suspender **toda** la cuenta de Slonimtek. Se necesitan reglas automáticas y botón de pausa.
6. **Streaming:** ver en detalle en la sección 6.
7. **Privacidad y datos personales:** los documentos KYC van cifrados. Revisar la ley 18.331 (Uruguay), la ley 25.326 (Argentina) y las normas de cada país donde haya clientes.
8. **Términos del ISP si se usa fibra hogareña:** preferir fibra empresarial con bloque de IPs fijas, no revender una conexión residencial.

---

## 6. "Contenido local": qué funciona y qué no

- **Funciona bien:** canales de aire, radios, sitios de noticias, portales de TV locales que solo miran la IP del país, y tiendas o apps locales.
- **Difícil o riesgoso: las grandes plataformas de streaming.**
  - Sus **términos prohíben** ver el catálogo de otro país y **bloquean** las IPs de datacenter y VPN conocidas.
  - Por escritorio remoto, además, el video se ve mal: RDP no está pensado para video, y el DRM (Widevine/PlayReady) en máquinas virtuales suele limitar la calidad o no reproducir.
  - Encima **duplica el costo de datos**.
- **Recomendación de producto:** para video, **Conexión para tele y celular**. El dispositivo sale directo por la salida del país, con calidad completa y sin pasar por la PC.
- **Marketing:** no prometer streaming de plataformas grandes. Promocionar "tele, radio y medios de tu país".

---

## 7. Próximos pasos sugeridos

**Ya hecho:** el piloto técnico mínimo (sistema en vivo, ver `live/README.md`). Resultados medidos:

- **Buenos Aires Local Zone:** las IPs geolocalizan en Buenos Aires, AR (ipinfo).
- **Cambio de salida:** unos 3 s.
- **Corte automático:** 0 fugas en la prueba.

Lo que sigue:

1. **Piloto técnico mínimo:**
   - 1 PC en AWS Tel Aviv.
   - 1 salida en Uruguay (VPS de Antel) y otra en Argentina (AWS Local Zone Buenos Aires).
   - Túnel WireGuard a nivel de red, con corte automático y túnel partido para Cloudflare.
2. **Lista de prueba:** 10 a 20 sitios objetivo por país (bancos, portales del Estado, TV local, tiendas). Registrar si abren, si piden verificación y si marcan VPN, en datacenter vs. fibra.
3. **Costos reales:** calculadora de AWS, cotización de Antel y costo de IPs fijas por país. Recalcular el margen con uso real (horas y GB).
4. **Validación con usuarios:** 10 personas de la diáspora (Israel y España) usando el mockup y después el piloto.
5. **Legal:** licencias de Windows, sanciones, términos de uso y protección de datos.
6. **Decidir el nombre final** y el dominio.

---

## 8. El mockup: cómo está hecho y cómo editarlo

- **Un solo archivo:** `index.html` (HTML + CSS + JS), sin dependencias. Solo usa Google Fonts: Bricolage Grotesque, Instrument Sans y JetBrains Mono.
- **Rutas por hash:**
  - `#inicio`: la web de venta.
  - `#armar/1` a `#armar/5`: dónde te ven, tamaño, sistema, datos + KYC, pago.
  - `#armando`: aprovisionamiento.
  - `#pc`: la PC en el navegador, con selector "Te ven en".
  - `#panel`: resumen, países y dispositivos, copias, uso, plan y soporte.
  - `#operacion`: vista interna con alertas, calculadora de margen, salidas por país y arquitectura.
- **Datos editables al principio del `<script>`:**
  - `COUNTRIES`: países de salida.
  - `ORIGINS`: dónde está el usuario, en qué zona va su PC y los multiplicadores.
  - `TIERS`: planes.
  - `EXTRA`, `FIBRA`, `CONEX`: precios de los agregados.
  - `OPS_ROWS`, `ALERTS`, `FAQ`, `QUICK`/`REPLY`: soporte.
- **Correrlo local:** `python3 -m http.server 8123` en la carpeta y abrir `http://localhost:8123`. Abrir el archivo directo también anda, pero algunas vistas previas no navegan entre pantallas.
- **Publicar:** hacer `git push` a `main`; GitHub Pages actualiza en ~1 minuto.
- **Estilo del texto:** español rioplatense con voseo ("elegí", "abrila"), frases cortas y sin jerga técnica en la parte del cliente.

---

## 9. Convenciones de Yaakov para este repo

- Los entregables que se muestran a terceros van en la org de GitHub **Slonimtek** (Pages), no como links de claude.ai.
- Commits **sin** el trailer "Co-Authored-By: Claude".
- Mockup primero: para pitch, mockup clickeable antes de construir backend.
- Preferencia de arquitectura para piezas con IA: "dual-brain" (razonamiento separado de la decisión), con presupuesto de tokens y determinismo.

---

## 10. Fuentes

- Cloudflare Containers, tipos de instancia y límites: https://developers.cloudflare.com/changelog/post/2026-01-05-custom-instance-types/
- Cloudflare Containers, ciclo de vida (disco efímero): https://developers.cloudflare.com/containers/platform-details/architecture/
- Cloudflare Access, RDP en el navegador (GA): https://developers.cloudflare.com/changelog/post/2025-09-22-browser-based-rdp-ga/
- Conectar RDP en el navegador: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/use-cases/rdp/rdp-browser/
- AWS Local Zones en Latinoamérica: https://aws.amazon.com/blogs/publicsector/aws-announces-local-zones-latin-america
- Antel Data Center, productos cloud: https://www.antel.com.uy/web/datacenter/productos-cloud

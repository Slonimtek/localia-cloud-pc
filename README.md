# Localía — tu PC en tu país

Mockup navegable de **Localía by Slonimtek**: computadoras en la nube que viven **cerca del usuario** y salen a internet por **el país que elija** (Uruguay, Argentina, Chile, Paraguay, Perú, Colombia, México, Brasil, EE.UU., España, Israel), con una IP fija de ese país, solo suya. Se abren desde el navegador y los sitios ven al usuario como alguien de ahí.

**Documento del proyecto (decisiones, arquitectura, precios, riesgos):** [PROYECTO-LOCALIA.md](PROYECTO-LOCALIA.md)

**Ver en vivo:** https://slonimtek.github.io/localia-cloud-pc/

## Recorrido

1. **Inicio**: propuesta, para qué sirve, tamaños, VPN vs. Localía, preguntas.
2. **Armar mi PC** (5 pasos): dónde te ven (uno o varios países, IP de fibra local opcional) → tamaño Mini / Standard / Gold → sistema, apps, apagado automático y tele/celular → datos + verificación de identidad + reglas de uso → pago.
3. **Armando**: aprovisionamiento paso a paso hasta el chequeo final de identidad.
4. **Mi PC**: el escritorio remoto dentro del navegador, con selector "Te ven en" para cambiar de país en un clic.
5. **Panel**: países y dispositivos (tele/celular), corte automático, prender/apagar, reiniciar, "mi PC no anda", copias, uso, plan, soporte.
6. **Operación Slonimtek** (vista interna): cómo viaja la conexión, alertas, calculadora de margen (horas + datos), salidas por país, zonas de PCs, arquitectura.

Un solo `index.html`, sin dependencias. Precios, demoras y datos son ilustrativos.

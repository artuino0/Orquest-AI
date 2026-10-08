# Comercial de Orquest AI — guion y storyboard

**Para qué:** que se sepa que Orquest AI existe y dé ganas de entrar al repositorio.

**Forma:** una conversación. Ella (la usuaria) le habla a Jhonny, el jefe, y la oficina hace lo que platican: de la idea a la entrega, con un error incluido.
**Duración:** 60 segundos.
**Voz:** ElevenLabs, modelo Eleven v3, dos voces con una sola etiqueta cada una: Ella `[casual]`, Jhonny `[friendly]`. Texto listo para pegar, en orden y separado por voz: [`promo/guion-elevenlabs.txt`](../promo/guion-elevenlabs.txt).

**Storyboard visual:** [`promo/storyboard.html`](../promo/storyboard.html), con las pantallas del diseño de Pencil exportadas a `promo/pen/`.

---

## Storyboard

| # | Tiempo | Qué se ve | Voz |
| --- | --- | --- | --- |
| 1 | 0–7 s | Terminales que se enciman; caen tres recibos de suscripción. | **Ella:** "¿Cansado de programar entre terminales? Pagas tres suscripciones de inteligencia artificial... y a ninguna le sacas provecho." |
| 2 | 7–10 s | Las terminales caen dentro del edificio. Oficina vacía y el nombre. | **Ella:** "Esto es Orquest." |
| 3 | 10–17 s | Jhonny entra y se sienta. Chat: cada frase sale como burbuja mientras se oye. | **Ella:** "Hola, Jhonny." · **Jhonny:** "Hola. ¿Qué necesitas?" · **Ella:** "Hagamos una tienda en línea." |
| 4 | 17–27 s | Una ficha por nombre: personaje, nombre, proveedor, modelo, esfuerzo y puesto. Luego los cuatro entran y toman su cubículo. | **Jhonny:** "Claro. Te propongo contratar a Cinthya, Juan, Pablo y Mario." |
| 5 | 27–34 s | El chat marca "planeando…". Tablero: tres tarjetas; la de QA espera a las otras. | **Jhonny:** "¿Por dónde empezamos?" · **Ella:** "Comienza con el login." · **Jhonny:** "Va. Ya lo repartí." |
| 6 | 34–42 s | Sin voz. Teclean, globos de actividad, pasan por la impresora y llevan su hoja a Jhonny. | — |
| 7 | 42–54 s | Entregas: dos sellos verdes; en la tercera, veredicto de QA en rojo y clic en Devolver. Pablo regresa a su cubículo; Cinthya y Juan se van a la sala de juegos. | **Jhonny:** "Ya entregaron. Mario encontró un error en lo de Pablo." · **Ella:** "Cinthya, aprobado. Juan, aprobado. Pablo... te lo regreso." · **Jhonny:** "Ya va de vuelta a su escritorio." |
| 8 | 54–60 s | La cámara se aleja: oficina entera, Pablo tecleando solo. Nombre y liga. | **Ella:** "Orquest AI. El código está abierto." |

Fichas de la toma 4: Cinthya (Claude Code, backend), Juan (Codex, frontend), Pablo (Antigravity, frontend), Mario (OpenCode, QA). Modelo y esfuerzo se copian de lo que liste la app el día de grabar.

## Antes de producir

- La app pone nombres de su propia lista: para que salgan Jhonny, Cinthya, Juan, Pablo y Mario hay que grabar con esos nombres puestos.
- "Devolver" es rechazar la entrega con comentario; el empleado vuelve a trabajar. El gesto de agachar la cabeza no existe todavía.
- "Tres suscripciones" es un número de ejemplo.
- Las tomas de oficina (6, 7 y 8) se graban de la app: en el diseño los personajes no se mueven.

---

## Qué grabar (lista de tomas)

Todo sale de la app, sin montar nada aparte:

1. **Oficina vacía de noche:** abrir un proyecto sin jefe con la hora fijada en la noche.
2. **Contratar al jefe:** panel completo, eligiendo personaje, y su entrada caminando.
3. **Plantilla con propuesta:** tres puestos, clic en Aprobar, llegada del equipo.
4. **Jornada:** dos o tres minutos de oficina trabajando para escoger los mejores segundos (globos, mano levantada, tecleo).
5. **Terminal de un empleado detenido:** el aviso rojo y la pregunta real de la CLI.
6. **Recorrido de entrega:** impresora → mesa del jefe, y el panel Entregas con su diff.
7. **Detalles:** reloj, maquinitas, golfito, mascotas, calle con un coche y un peatón.
8. **Plano general de día** para el cierre.

Para ensayar sin gastar una sola CLI sirve la vista previa: `npx vite src/renderer` y abrir `/preview.html?proyecto=1` (con `&rapido=1` todo va cinco veces más rápido y `&jefe=0` arranca sin jefe). Para la versión final conviene grabar una sesión real: se nota en las terminales.

**Música:** chiptune suave, sin letra, baja bajo la voz; se abre en la toma 5 y se corta en seco en la 6. Licencia libre (CC0 o CC-BY con su crédito).
**Sonidos:** un clic por cada botón, un "ding" al integrar, pasos muy bajos cuando caminan.

---

## Lo que el comercial no debe prometer

Orquest AI está en desarrollo. Para no decepcionar a quien llegue por el video:

- No mostrar funciones que aún no existen (uso por cuenta, reporte de mercado, modo móvil).
- "Cuatro" son los agentes que ya se levantaron en la app: Claude Code, Codex, Antigravity y OpenCode. El avance no los nombra.
- Lo que falta va en el README, para quien ya entró; el avance no lo dice.

## Qué pedirle a quien quiera ayudar

Para la descripción del video y la publicación que lo acompañe:

- **Probar con tu CLI:** Antigravity, OpenCode, Command Code, Kimi, Grok. Cada una pregunta y se dibuja distinto.
- **Arte en píxel:** piezas nuevas en el estilo de la oficina, poses, mobiliario.
- **macOS y Linux:** hoy se desarrolla en Windows.
- **Ideas de oficina:** qué más debería verse cuando un agente trabaja, espera o se atora.

Cómo contribuir: [CONTRIBUTING.md](../CONTRIBUTING.md). Los PR los revisa y aprueba el autor del proyecto.

## Créditos que van en el video

- Arte de la oficina: **Pixel Office**, de **2dPig** — https://2dpig.itch.io/pixel-office
- Música: la que se elija, con su licencia.

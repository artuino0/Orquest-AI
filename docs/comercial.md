# Comercial de Orquest AI — guion y storyboard

**Para qué:** conseguir gente que ayude a desarrollar Orquest AI. El código es abierto; cualquiera puede mandar un PR.

**Duración:** 45 segundos (versión corta de 20 s al final).
**Formato:** horizontal 16:9 para YouTube y el README; se recorta a vertical 9:16 para redes, porque la acción siempre queda al centro.
**Tono:** cercano y un poco juguetón, sin vender humo. Es una herramienta de trabajo que se ve como un juego, no un juguete.
**Idea central:** *tus agentes de código ya trabajan; ahora puedes verlos trabajar.*

**Storyboard visual:** [`promo/storyboard.html`](../promo/storyboard.html), con las pantallas del diseño de Pencil exportadas a `promo/pen/` (17 pantallas a 2560×1600). Este documento es el guion; aquel, toma por toma con su imagen.

**Regla de producción:** todo lo que se ve en pantalla es la app corriendo de verdad. Nada de maquetas: cada animación de Orquest es un estado real, y el comercial tiene que cumplir lo mismo que promete.

---

## Storyboard

| # | Tiempo | Qué se ve | Qué se oye (voz) | Texto en pantalla |
| --- | --- | --- | --- | --- |
| 1 | 0–4 s | Pantalla negra. Aparecen, una por una, cuatro terminales apiladas con texto corriendo. Se enciman, tapan todo. | "¿Cuántas terminales tienes abiertas ahorita?" | — |
| 2 | 4–8 s | Las terminales se encogen de golpe y caen dentro de un edificio en píxel. Corte a la oficina vacía de Orquest: cubículos sin gente, la calle afuera, de noche. | "¿Y sabes qué está haciendo cada una?" | — |
| 3 | 8–13 s | Panel "Contratar al Jefe". Se escribe el objetivo: *"Tienda en línea con catálogo y pagos"*. Se elige un personaje. Clic en **Contratar jefe**. El jefe entra caminando y se sienta en su mesa. | "En Orquest AI, tus agentes son empleados. Contratas a un jefe y le dices qué quieres." | **Orquest AI** |
| 4 | 13–19 s | Panel Plantilla: tres puestos propuestos, cada uno con su proveedor (Claude Code, Codex, Antigravity) y el motivo. Clic en **Aprobar**. Los empleados entran por la puerta y cada uno toma su cubículo; las sillas se separan del escritorio. | "Él propone al equipo: quién hace backend, quién frontend, quién prueba. Tú apruebas." | *Usa las CLIs y suscripciones que ya tienes* |
| 5 | 19–26 s | La oficina trabajando. Globos sobre los escritorios: "Editando api.ts", "Corriendo pruebas". Uno levanta la mano (✋). Clic en él: se abre su terminal real con la pregunta de permiso. | "Cada animación es un estado real. Si alguien teclea, está trabajando. Si levanta la mano, te necesita." | *Cada animación es un estado real* |
| 6 | 26–32 s | Un empleado termina (✅), va a la impresora, toma su hoja y camina a la mesa del jefe. Corte al panel Entregas: reporte, veredicto de QA y el diff. Clic en **Integrar**. | "Cuando terminan, te traen su entrega. El jefe revisa, QA prueba, y tú decides qué entra." | *Tú apruebas cada integración* |
| 7 | 32–37 s | Cámara lenta sobre los detalles: el reloj de la pared marcando la hora real, alguien jugando en la maquinita, el jefe en su golfito, el gato dormido, un taxi pasando por la calle. | "Y sí: también descansan." | — |
| 8 | 37–42 s | La oficina completa, de día. Encima, en letra de píxel, el llamado. Abajo, la dirección del repositorio. | "Orquest AI es código abierto. Apenas empieza, y falta mucho por construir." | **Código abierto · Apache 2.0** |
| 9 | 42–45 s | Los empleados voltean a la cámara. Uno saluda. Queda el logotipo y la liga. | "Ven a construirlo con nosotros." | **github.com/artuino0/Orquest-AI** · *Manda tu PR* |

---

## Guion de voz completo

> ¿Cuántas terminales tienes abiertas ahorita?
> ¿Y sabes qué está haciendo cada una?
>
> En Orquest AI, tus agentes son empleados. Contratas a un jefe y le dices qué quieres.
> Él propone al equipo: quién hace backend, quién frontend, quién prueba. Tú apruebas.
>
> Cada animación es un estado real. Si alguien teclea, está trabajando. Si levanta la mano, te necesita.
>
> Cuando terminan, te traen su entrega. El jefe revisa, QA prueba, y tú decides qué entra.
>
> Y sí: también descansan.
>
> Orquest AI es código abierto. Apenas empieza, y falta mucho por construir.
> Ven a construirlo con nosotros.

Son unas 95 palabras: caben en 45 segundos a ritmo tranquilo.

---

## Versión de 20 segundos (para redes)

| # | Tiempo | Qué se ve | Voz |
| --- | --- | --- | --- |
| 1 | 0–4 s | Las terminales apiladas caen dentro del edificio de píxel. | "Tus agentes de código ya trabajan." |
| 2 | 4–11 s | La oficina en plena jornada: globos de actividad, una mano levantada, alguien llevando su entrega al jefe. | "Ahora puedes verlos trabajar. Cada animación es un estado real." |
| 3 | 11–16 s | Panel Entregas, clic en **Integrar**. | "Tú decides qué entra." |
| 4 | 16–20 s | Oficina completa, logotipo y liga. | "Orquest AI. Código abierto. Manda tu PR." |

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

**Música:** chiptune suave, sin letra, que suba en la toma 5 y se abra en la 8. Licencia libre (CC0 o CC-BY con su crédito).
**Sonidos:** un clic por cada botón, un "ding" al integrar, pasos muy bajos cuando caminan.

---

## Lo que el comercial no debe prometer

Orquest AI está en desarrollo. Para no decepcionar a quien llegue por el video:

- No decir que funciona con todas las CLIs por igual: hoy el camino completo está probado con Claude Code y Codex; las demás se conectan pero falta probarlas a fondo.
- No mostrar funciones que aún no existen (uso por cuenta, reporte de mercado, modo móvil).
- Decir claro que es temprano: eso es justo lo que invita a contribuir.

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

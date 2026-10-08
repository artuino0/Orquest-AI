# Avance de Orquest AI — guion y storyboard

**Para qué:** que se sepa que Orquest AI existe y que quien lo vea se quede con la intriga y entre al repositorio. No explica el producto: eso lo hace el README.

**Duración:** 30 segundos.
**Formato:** vertical 9:16 primero (redes); horizontal 16:9 para YouTube y el README.
**Voz:** ElevenLabs, modelo Eleven v3, con una sola etiqueta de habla (`[curious]`) repetida en cada bloque para que no cambie de registro. Texto listo para pegar: [`promo/guion-elevenlabs.txt`](../promo/guion-elevenlabs.txt).

**Storyboard visual:** [`promo/storyboard.html`](../promo/storyboard.html), con las pantallas del diseño de Pencil exportadas a `promo/pen/` (17 pantallas a 2560×1600).

---

## Cómo engancha

| Recurso | Dónde |
| --- | --- |
| Afirmación rara y cierta en el primer segundo | "Contraté a cuatro inteligencias artificiales. Y les puse oficina." |
| Lo visual antes que el nombre | La oficina aparece de golpe, sin título ni logotipo |
| Ritmo de tres | "Tienen jefe. Tienen escritorio. Tienen hora del café." |
| Detalle concreto y un poco absurdo | "Otro acaba de entregar... y se fue a jugar." |
| Enseñar menos de lo que se podría | El diff y el clic en Integrar duran medio segundo |
| Reencuadre | "Nada de lo que se mueve es adorno. Todo... está pasando." |
| El nombre hasta el final | Segundo 24 |
| Cabo suelto en vez de resumen | "Entra a ver qué hacen cuando nadie los mira." |

---

## Storyboard

| # | Tiempo | Qué se ve | Voz |
| --- | --- | --- | --- |
| 1 | 0–4 s | De golpe: personajes de píxel en sus cubículos, moviéndose. | "Contraté a cuatro inteligencias artificiales. Y les puse oficina." |
| 2 | 4–9 s | Tres cortes secos: la oficina del jefe, una fila de escritorios, la cafetería. | "Tienen jefe. Tienen escritorio. Tienen hora del café." |
| 3 | 9–15 s | Uno con el globo de aviso sobre la cabeza. Corte: otro frente a la maquinita. | "Uno levanta la mano cuando me necesita. Otro acaba de entregar... y se fue a jugar." |
| 4 | 15–19 s | Medio segundo de diff en verde y rojo y un clic en **Integrar**. | "Yo solo veo. Y decido qué entra." |
| 5 | 19–24 s | Por primera vez la oficina entera; la cámara se aleja despacio. | "Nada de lo que se mueve es adorno. Todo... está pasando." |
| 6 | 24–27 s | Fondo oscuro y el nombre en letra de píxel. | "Se llama Orquest AI. El código está abierto." |
| 7 | 27–30 s | La fila de personajes mirando al frente; abajo, la liga del repositorio. | "Entra a ver qué hacen cuando nadie los mira." |

Único texto en pantalla: **github.com/artuino0/Orquest-AI**, en la toma 7.

---

## Guion para ElevenLabs

```
[curious] Contraté a cuatro inteligencias artificiales. Y les puse oficina.

[curious] Tienen jefe. Tienen escritorio. Tienen hora del café.

[curious] Uno levanta la mano cuando me necesita. Otro acaba de entregar... y se fue a jugar.

[curious] Yo solo veo. Y decido qué entra.

[curious] Nada de lo que se mueve es adorno. Todo... está pasando.

[curious] Se llama Orquest AI. El código está abierto.

[curious] Entra a ver qué hacen cuando nadie los mira.
```

68 palabras. Los puntos suspensivos marcan las dos pausas. Las etiquetas entre corchetes las interpreta Eleven v3; un modelo anterior las leería en voz alta.

### Otros ganchos para probar

Solo cambia la primera línea; sirve para publicar dos versiones y ver cuál retiene más.

- `[curious] Hay una oficina donde nadie es humano. Y se trabaja.`
- `[curious] Me fui a dormir. La oficina siguió trabajando.`
- `[curious] Este de aquí acaba de pedirme permiso. No es una persona.`

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

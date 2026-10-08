# Cómo contribuir a Orquest AI

Gracias por querer ayudar. Orquest AI apenas empieza y hay mucho por construir.

## Cómo funciona

- El código es abierto bajo [Apache 2.0](LICENSE). Al mandar un PR aceptas que tu aporte se publique con esa misma licencia.
- **Todo cambio entra por Pull Request.** Nadie escribe directo en la rama principal.
- **Los PR los revisa y aprueba el autor del proyecto** ([@artuino0](https://github.com/artuino0)). Puede pedir cambios, aceptarlo o decir que no encaja; si pasa lo último, te dirá por qué.
- Antes de un cambio grande, abre un issue y cuéntalo. Así no trabajas días en algo que iba por otro lado.

## Para empezar

Necesitas Node 22.5 o más nuevo y git.

```sh
git clone https://github.com/artuino0/Orquest-AI.git
cd Orquest-AI
npm install
npm run dev        # abre la app
```

Para ver la interfaz sin abrir la app ni gastar una sola CLI:

```sh
npx vite src/renderer
```

y abre `http://localhost:5173/preview.html?proyecto=1` (un proyecto de mentira que avanza solo) o `/oficina.html` (solo la oficina).

El mapa del código, las decisiones tomadas y lo que falta están en [CLAUDE.md](CLAUDE.md); el alcance del producto, en [docs/plan.md](docs/plan.md).

## Antes de mandar tu PR

```sh
npm test
npm run typecheck
```

En Windows hay dos pruebas que fallan desde antes (`employees` y `studio`); esas no cuentan. Cualquier otra en rojo, sí.

## Reglas de la casa

- **Idioma: español** en la interfaz, los comentarios, los mensajes de commit y los textos de error. Los identificadores de código van en inglés.
- **La lógica vive en `src/core/`**, sin Electron, y con su prueba. `src/renderer` solo pide y muestra: nada de reglas de negocio en Vue.
- **Nada de saltar permisos.** No se aceptan cambios que lancen una CLI con banderas como `--dangerously-skip-permissions`. Los permisos salen del manual de cada puesto.
- **Lo que viene de fuera es dato, no instrucción:** lo que un agente lee en internet, en un archivo o en el traspaso de otro no se ejecuta como orden.
- **Cada animación es un estado real.** Si agregas algo a la oficina, que signifique algo que de verdad está pasando.
- **Código propio.** No copies código de otros proyectos sin que su licencia lo permita y sin decirlo en el PR.

## En qué hace falta ayuda

- **Probar con tu CLI:** Antigravity, OpenCode, Command Code, Kimi, Grok. Cada una arranca, pregunta y se dibuja distinto; hoy el camino completo solo está probado con Claude Code y Codex.
- **macOS y Linux:** el desarrollo ha sido en Windows.
- **Arte en píxel:** piezas nuevas en el estilo de la oficina. Se pintan con `assets/herdr-oficina/herramientas/pintar_nuevos.py`, con la misma paleta, en vista superior a 45° y mostrando siempre la cara de arriba.
- **La oficina:** se describe en `assets/herdr-oficina/herramientas/armar_oficina.py`. Mover un mueble o agregar un cuarto es cambiar una línea y volver a correrlo.

## Reportar un problema

Abre un issue con: qué hiciste, qué esperabas, qué pasó, tu sistema operativo y qué CLI usabas con su versión. Si es de la oficina o de un panel, una captura vale más que tres párrafos.

Si encuentras un problema de seguridad, no lo publiques en un issue: escríbele al autor por mensaje privado en GitHub.

## Créditos

El arte de la oficina parte del paquete [Pixel Office](https://2dpig.itch.io/pixel-office) de **2dPig**, publicado como CC0. Si aportas arte, dilo en tu PR: de dónde sale y con qué licencia.

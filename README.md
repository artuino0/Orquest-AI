# Orquest AI

**Español** · [English](README.en.md)

Orquestador de agentes de código hecho juego: tu estudio es una oficina en pixel art donde cada agente (Claude Code, Codex, Antigravity, OpenCode…) es un empleado que trabaja en su propia oficina y te lleva su entrega. Cada empleado usa la CLI y la suscripción que ya tienes; no hay costo de IA aparte.

Plan completo: [docs/plan.md](docs/plan.md).

## Estado: fases 1, 2 y 3

### Nombres, bitácora y burnout

- **Nombres:** cada contratado recibe uno que no se repite en el proyecto (Ana, Beto…); el usuario lo cambia al aprobar la plantilla. El jefe y las herramientas aceptan el nombre o el id.
- **Bitácora** (`src/core/journal.ts`): `<repo>/.orquest/bitacoras/<id>.md`, fuera de git. "Traspaso" lo escribe el agente con `escribir_traspaso` (decisiones, pendientes, trampas, siguiente paso; máx. 6000 caracteres, es su versión). "Hechos" los escribe Orquest (asignaciones, entregas, QA, regresos, integraciones, descansos; últimos 60). Es su memoria entre reinicios.
- **Burnout:** Claude Code reporta el % de contexto usado por su barra de estado (configurada por Orquest con `--settings`); en Codex y otros se lee de la pantalla. Al pasar el umbral (80% por defecto), y nunca a media tarea, el agente escribe su traspaso, su CLI se cierra y se relanza igual (proveedor, modelo, manual, oficina) con contexto limpio y vuelve leyendo su bitácora. En el mapa se va a las maquinitas de la Cafetería. Tarda lo que tarda: con Claude real, unos 10 s. Una sesión nueva ya arranca con ~15% de contexto, así que solo vuelve a descansar si subió 10 puntos desde que regresó. El jefe también descansa. También se puede mandar a descansar desde su panel.
- **Capacitación:** al despedir a alguien, su bitácora queda; quien ocupe el mismo puesto la recibe al entrar.


### Fase 3: expedientes y manuales de puesto

El jefe sabe qué se necesita; el usuario sabe quién sirve para qué. Esa experiencia vive en la biblioteca del estudio (`src/core/library.ts`), guardada en SQLite y compartida entre proyectos.

- **Expediente** (por proveedor, y opcionalmente por modelo; el del modelo gana): puestos permitidos, qué pasa si no se permite (`block`: el juego no deja; `warn`: deja con aviso) y notas del usuario. Arranca con el ejemplo del plan: Antigravity solo en QA.
- **Historial contigo**, que se llena solo: entregas, integradas a la primera, rechazos de QA, regresadas, por puesto y por modelo.
- **Manual de puesto** (por rol): prompt, documentación y skills que carga al entrar, permisos y formato de entrega (con capturas obligatorias si se pide).

Cómo se aplica:

- La regla del expediente se revisa al proponer (el jefe recibe el motivo con tu nota), al aprobar (la plantilla marca en rojo lo prohibido y no deja aprobar) y al levantar (si cambiaste el expediente después).
- `leer_expedientes` le da al jefe puestos permitidos, notas e historial por modelo; su prompt le pide elegir con eso y citarlo en el motivo.
- Los permisos del manual llegan a la CLI: en Claude Code como reglas `permissions.allow` / `deny` en `--settings` (editar, comandos permitidos, comandos prohibidos); en Codex como sandbox de escritura o solo lectura. El jefe no edita ni integra por su cuenta.
- La entrega se valida contra el manual (p. ej. sin capturas no se acepta si el puesto las exige).

Prueba de cierre (`test/phase3.test.ts`): el juego impide un puesto prohibido al proponer, aprobar y levantar; el historial se llena solo y el jefe lo lee en otro proyecto. Con Claude Code real, sembrando un historial donde haiku integró 5 de 5 a la primera en backend y sonnet 0 de 3 con 4 rechazos de QA, el jefe propuso haiku para backend citando esas cifras y tu nota, y dejó sonnet para QA, que su expediente sí permite. También se comprobó que Claude Code respeta los permisos de `--settings` (comando permitido sí, prohibido y edición no).

Pendiente del plan para esta parte: la columna "En el mercado" (reporte semanal de rankings y opinión) y los límites de uso por cuenta.

### Fase 2: jefe y tablero

El usuario decide en dos puntos: al aprobar la plantilla y al integrar; todo lo demás lo mueve el jefe.

1. Contratas al **jefe** (Claude Code o Codex) con el objetivo del proyecto. Trabaja en el repo principal, sin worktree.
2. El jefe lee el proyecto y los expedientes y **propone la plantilla** (puesto, proveedor, modelo, esfuerzo y motivo). La apruebas o la ajustas.
3. El jefe **levanta** a cada empleado aprobado y **asigna tareas con dependencias**. Una tarea con dependencias abiertas no arranca; el ciclo se rechaza.
4. El empleado **entrega**: la app hace commit de su oficina y le avisa al jefe, que aprueba, regresa con notas o manda a **QA**. Si QA rechaza, la tarea vuelve al escritorio del mismo empleado con el reporte.
5. Lo aprobado llega a tu **bandeja**: ves reporte, QA y diff, y lo **integras** (merge `--no-ff` a la rama actual) o lo regresas. Si hay conflicto, el repo queda intacto y se avisa al jefe.
6. Al integrar, quien esperaba esa tarea se libera y recibe la entrega como contexto.

Piezas (`src/core/`):

- `board.ts`: el tablero y sus reglas, puro y sin IO: plantilla, tareas, dependencias (con detección de ciclos), entregas, QA, bandeja y lo que se ve de cada empleado (esperando a otro, entregando).
- `studio.ts`: orquesta un proyecto. Une tablero, CLIs, git y avisos. Herramientas MCP y acciones de la UI entran por aquí.
- `mcp.ts`: servidor MCP local (HTTP en 127.0.0.1). Cada agente recibe su URL con un token que dice quién es; solo ve sus herramientas y cada llamada se valida. Una regla rota vuelve con el motivo.
- `store.ts`: el tablero se guarda en SQLite local (`node:sqlite`) y se retoma al reabrir.
- `prompts.ts`: prompt de arranque del jefe y del empleado (este se arma con el manual de su puesto).

Herramientas: jefe `leer_proyecto`, `leer_expedientes`, `proponer_plantilla`, `levantar_empleado`, `asignar_tarea`, `hablar_con`, `revisar_entrega`, `mandar_a_qa`; empleado `leer_tarea`, `preguntar_al_jefe`, `reportar_estado`, `entregar`.

Los avisos de la app (`[Orquest] …`) se escriben en la terminal del agente solo cuando su prompt está a la vista y quieto; si está trabajando o preguntando algo, esperan.

Las oficinas viven en `<repo>/.orquest/oficinas/<id>`, excluidas de git con `.git/info/exclude`. Dentro del repo heredan la confianza que le diste: Claude Code no vuelve a preguntar por cada empleado.

Prueba de cierre (`test/studio.test.ts`): un proyecto chico de punta a punta por el servidor MCP real: propuesta, aprobación del usuario, dependencias, QA que rechaza y luego aprueba, integración y liberación de la dependiente. También se probó con Claude Code real como jefe y empleados: del contrato del jefe a la integración en 44 s.

### Fase 1: núcleo de terminales

- **Detección de CLIs** (`src/core/detect.ts`): busca claude, codex, antigravity, opencode, command code, kimi y grok en el PATH, su versión y si hay sesión iniciada. Sin al menos una usable, no deja contratar.
- **Adaptadores por proveedor** (`src/core/providers.ts`): cómo recibe cada CLI modelo, esfuerzo y manual. Nunca se lanza con permisos saltados. Claude Code está comprobado contra la CLI real; el resto usa argumentos genéricos y avisa lo que no soporta.
- **Oficinas** (`src/core/worktree.ts`): un git worktree por empleado en `<repo>/.orquest/oficinas/<id>`, rama `orquest/<id>`.
- **Estado** (`src/core/state.ts`): señal OSC de hooks (`\x1b]7777;orquest:state=working\x07`) primero; de respaldo, lectura de pantalla sobre un emulador de terminal (`@xterm/headless`), porque las TUIs redibujan en su lugar. Estados: `starting`, `working`, `blocked`, `idle`, `exited`. Las pantallas de primer arranque de Claude (tema, confiar en la carpeta) cuentan como bloqueado.
- **Plantilla viva** (`src/core/employees.ts`): contrata (worktree + CLI en node-pty), reenvía salida, sigue el estado, escribe y despide.
- **App** (Electron + Vue 3 + Pinia + xterm.js + PixiJS): ver abajo.

## Interfaz

Un proyecto abierto es un **lienzo infinito**: la oficina, el jefe, cada empleado, su versión, el editor, el tablero y lo demás son paneles que mueves, agrandas, minimizas y enfocas. El plano crece hacia donde los lleves y cada proyecto recuerda cómo lo dejaste.

- **Inicio** (`HomeScreen.vue`): proyectos recientes y revisión de CLIs; sin una usable no deja abrir proyecto.
- **Lienzo** (`OfficeScreen.vue` + `canvas/`): arrastrar el fondo (o espacio + arrastrar) recorre, Ctrl + rueda acerca y aleja, «Ver todo» encuadra y «Ordenar» acomoda en rejilla. Minimapa abajo a la derecha. Clic derecho en el fondo: abrir un panel ahí y elegir fondo (liso, ciudad de noche, bosque, montañas, espacio o una imagen tuya), atenuarlo y mostrar u ocultar las guías.
- **Dock de proyectos** (`ProjectDock.vue`): los proyectos abiertos; un clic cambia de proyecto. Número rojo: algo te espera ahí; cuadro azul: están trabajando. Abajo, el uso de tus cuentas, que abre el panel **Uso** (5 horas, cuándo reinicia y la semana).
- **Oficina** (`PixelOffice.vue`): la oficina de píxel; un clic en alguien abre su panel al lado, sin tapar nada.
- **Panel del empleado** (`EmployeeDrawer.vue`): Terminal, Chat, Archivos (con diff), Capturas, Actividad, Tarea y Bitácora. Enfocarlo (doble clic en su encabezado) lo lleva, con su versión, a toda la vista.
- **Su versión** (`VersionPanel.vue`): lo que levantó un empleado para revisión, dentro del lienzo, con botón para abrirlo en tu navegador.
- **Editor** (Ctrl+B): los archivos del proyecto con lo cambiado según git.
- **Expedientes**: puestos permitidos, notas e historial por proveedor y modelo; manuales de cada puesto.
- **Jefe**, **Plantilla**, **Tablero** y **Entregas**: contratar y hablar con el jefe, aprobar su propuesta, tareas por departamento con estado y dependencias, y la bandeja para integrar o regresar con diff y reporte de QA.

### Lógica del mundo (`src/renderer/src/world/`)

- `layout.ts`: plano en casillas, puertas, pasillos, escritorios estables (nadie cambia de lugar cuando entra o sale alguien) y rutas que solo pasan por puertas y pasillos.
- `behavior.ts`: cada estado real decide lugar, pose, burbuja y monitor. Incluye ya los de fases siguientes: esperando dependencia (camina al escritorio de quien bloquea, burbuja de reloj), entregando (va con el jefe) y descansando (Cafetería).
- `sprites.ts`: pixel art provisional dibujado desde matrices, color de playera por proveedor. Se reemplaza con los assets de "Arte y mundo".
- `scene.ts`: solo dibuja con PixiJS lo que deciden los dos anteriores.

| Estado | Lugar | Se ve |
| --- | --- | --- |
| llegando | camina de Recepción a su escritorio | monitor encendido |
| trabajando | escritorio | teclea de espaldas, monitor parpadea |
| bloqueado | escritorio | de pie, burbuja ! parpadeando |
| esperando instrucción | escritorio | sentado, burbuja … |
| esperando dependencia | junto al escritorio de quien bloquea | burbuja de reloj |
| entregando | oficina del Jefe | burbuja ✓ |
| descansando | Cafetería | burbuja zzz |
| se fue | camina a Recepción y desaparece | — |

Prueba de cierre de la fase (`test/employees.test.ts`): tres empleados de proveedores distintos trabajan a la vez en el mismo repo, cada uno en su worktree, sin pisarse.

## Desarrollo

```sh
npm install
npm run rebuild   # compila node-pty para Electron
npm run dev       # abre la app
npm test          # pruebas del núcleo (node-pty real, CLIs falsas)
npm run typecheck
npm run dist      # arma el instalador en dist/
```

### Instalador

`npm run dist` compila la app y deja el instalador del sistema donde se corre en `dist/` (configuración en `electron-builder.yml`). En Windows es `Orquest-AI-<versión>-instalador.exe`. Para los tres sistemas sin tener las tres máquinas: en GitHub, Actions → Instaladores → Run workflow; cada uno queda como adjunto de la corrida.

Ninguno va firmado todavía, así que Windows (SmartScreen) y macOS avisan al abrirlo. El de Windows se probó a mano; los de macOS y Linux no.

## Siguientes fases

4. Oficina pixel art (PixiJS o Phaser).
5. Lanzamiento abierto.
6. Remoto móvil.

## Contribuir

El código es abierto y se aceptan Pull Requests. Todo cambio entra por PR y lo revisa y aprueba el autor del proyecto. Cómo empezar, las reglas de la casa y en qué hace falta ayuda: [CONTRIBUTING.md](CONTRIBUTING.md).

## Créditos

- **Arte de la oficina:** parte del paquete [Pixel Office](https://2dpig.itch.io/pixel-office) de **2dPig**, publicado como CC0. Gracias por compartirlo. Las piezas que no traía (personajes extra, poses, pisos, paredes, mobiliario, vehículos, la calle) se pintaron para este proyecto siguiendo su estilo y su paleta.
- **Referencias de diseño:** las decisiones y de dónde salió cada idea están en [docs/plan.md](docs/plan.md).

## Apoya el proyecto

Orquest AI es gratis y de código abierto. Si te ahorra tiempo o prefieres que te acompañe a instalarlo, en la página puedes [invitar un café o reservar una asesoría 1 a 1 por videollamada](https://orquest.dydasites.com/#apoyo).

## Aviso

Orquest AI no tiene afiliación con Anthropic, OpenAI ni con ningún otro proveedor; Claude Code, Codex y las demás CLIs pertenecen a sus respectivos titulares. La app no incluye modelos ni toca tus credenciales: ejecuta las CLIs oficiales, sin modificar, con la sesión que ya tienes iniciada en cada una.

El uso de cada CLI y de cada cuenta queda sujeto a los términos de su proveedor, y es tu responsabilidad. Usa solo cuentas tuyas, y revisa esos términos si vas a correr muchos agentes a la vez.

## Licencia

[Apache 2.0](LICENSE). Los avisos de terceros están en [NOTICE](NOTICE).

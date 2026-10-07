# Orquest AI

Orquestador de agentes de código hecho juego: tu estudio es una oficina en pixel art donde cada agente (Claude Code, Codex, Antigravity, OpenCode…) es un empleado que trabaja en su propia oficina y te lleva su entrega. Cada empleado usa la CLI y la suscripción que ya tienes; no hay costo de IA aparte.

Plan completo: [docs/plan.md](docs/plan.md).

## Estado: fases 1 y 2

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
- `prompts.ts`: manual base del jefe y de cada puesto (la fase 3 trae manuales por rol).

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

La oficina es la pantalla principal; todo lo demás se abre encima sin salir de ella.

- **Inicio** (`HomeScreen.vue`): proyectos recientes y revisión de CLIs; sin una usable no deja abrir proyecto.
- **Oficina** (`OfficeScreen.vue` + `world/`): mapa pixel art con Recepción, oficina del Jefe, Cafetería y un cuarto por departamento. HUD arriba con el proyecto, contadores (trabajando, te necesitan, en espera) y botones de Tablero, Entregas y Contratar. Rueda para zoom, arrastrar para mover, doble clic para centrar.
- **Contratar** (`HireDialog.vue`): plantilla por puestos con proveedor, modelo y esfuerzo. Cada contratado entra por Recepción y camina a su escritorio.
- **Drawer del empleado** (`EmployeeDrawer.vue`): clic en un personaje; flotante o pantalla dividida, con pestañas Terminal, Archivos (con diff), Capturas, Actividad y Tarea. La cámara sigue al elegido.
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
```

## Siguientes fases

3. Expedientes y manuales de puesto.
4. Oficina pixel art (PixiJS o Phaser).
5. Lanzamiento abierto.
6. Remoto móvil.

Licencia por decidir (MIT o Apache 2.0 para el código; CC0 o CC-BY para el arte).

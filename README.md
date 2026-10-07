# Orquest AI

Orquestador de agentes de código hecho juego: tu estudio es una oficina en pixel art donde cada agente (Claude Code, Codex, Antigravity, OpenCode…) es un empleado que trabaja en su propia oficina y te lleva su entrega. Cada empleado usa la CLI y la suscripción que ya tienes; no hay costo de IA aparte.

Plan completo: [docs/plan.md](docs/plan.md).

## Estado: fase 1, núcleo de terminales

- **Detección de CLIs** (`src/core/detect.ts`): busca claude, codex, antigravity, opencode, command code, kimi y grok en el PATH, su versión y si hay sesión iniciada. Sin al menos una usable, no deja contratar.
- **Adaptadores por proveedor** (`src/core/providers.ts`): cómo recibe cada CLI modelo, esfuerzo y manual. Nunca se lanza con permisos saltados. Claude Code está comprobado contra la CLI real; el resto usa argumentos genéricos y avisa lo que no soporta.
- **Oficinas** (`src/core/worktree.ts`): un git worktree por empleado en `<repo>.orquest/<id>`, rama `orquest/<id>`.
- **Estado** (`src/core/state.ts`): señal OSC de hooks (`\x1b]7777;orquest:state=working\x07`) primero, lectura de pantalla por patrones de respaldo. Estados: `starting`, `working`, `blocked`, `idle`, `exited`.
- **Plantilla viva** (`src/core/employees.ts`): contrata (worktree + CLI en node-pty), reenvía salida, sigue el estado, escribe y despide.
- **App** (Electron + Vue 3 + Pinia + xterm.js + PixiJS): ver abajo.

## Interfaz

La oficina es la pantalla principal; todo lo demás se abre encima sin salir de ella.

- **Inicio** (`HomeScreen.vue`): proyectos recientes y revisión de CLIs; sin una usable no deja abrir proyecto.
- **Oficina** (`OfficeScreen.vue` + `world/`): mapa pixel art con Recepción, oficina del Jefe, Cafetería y un cuarto por departamento. HUD arriba con el proyecto, contadores (trabajando, te necesitan, en espera) y botones de Tablero, Entregas y Contratar. Rueda para zoom, arrastrar para mover, doble clic para centrar.
- **Contratar** (`HireDialog.vue`): plantilla por puestos con proveedor, modelo y esfuerzo. Cada contratado entra por Recepción y camina a su escritorio.
- **Drawer del empleado** (`EmployeeDrawer.vue`): clic en un personaje; flotante o pantalla dividida, con pestañas Terminal, Archivos (con diff), Capturas, Actividad y Tarea. La cámara sigue al elegido.
- **Tablero** y **Entregas**: vista compacta por departamento y bandeja; se llenan con el jefe en la fase 2.

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

2. Jefe y tablero (herramientas MCP, tareas con dependencias, entregas).
3. Expedientes y manuales de puesto.
4. Oficina pixel art (PixiJS o Phaser).
5. Lanzamiento abierto.
6. Remoto móvil.

Licencia por decidir (MIT o Apache 2.0 para el código; CC0 o CC-BY para el arte).

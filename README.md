# Orquest AI

Orquestador de agentes de código hecho juego: tu estudio es una oficina en pixel art donde cada agente (Claude Code, Codex, Antigravity, OpenCode…) es un empleado que trabaja en su propia oficina y te lleva su entrega. Cada empleado usa la CLI y la suscripción que ya tienes; no hay costo de IA aparte.

Plan completo: [docs/plan.md](docs/plan.md).

## Estado: fase 1, núcleo de terminales

- **Detección de CLIs** (`src/core/detect.ts`): busca claude, codex, antigravity, opencode, command code, kimi y grok en el PATH, su versión y si hay sesión iniciada. Sin al menos una usable, no deja contratar.
- **Adaptadores por proveedor** (`src/core/providers.ts`): cómo recibe cada CLI modelo, esfuerzo y manual. Nunca se lanza con permisos saltados. Claude Code está comprobado contra la CLI real; el resto usa argumentos genéricos y avisa lo que no soporta.
- **Oficinas** (`src/core/worktree.ts`): un git worktree por empleado en `<repo>.orquest/<id>`, rama `orquest/<id>`.
- **Estado** (`src/core/state.ts`): señal OSC de hooks (`\x1b]7777;orquest:state=working\x07`) primero, lectura de pantalla por patrones de respaldo. Estados: `starting`, `working`, `blocked`, `idle`, `exited`.
- **Plantilla viva** (`src/core/employees.ts`): contrata (worktree + CLI en node-pty), reenvía salida, sigue el estado, escribe y despide.
- **App** (Electron + Vue 3 + Pinia + xterm.js): panel de CLIs, contratación, oficina con el estado de cada empleado y drawer con terminal en vivo, archivos tocados y tarea.

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

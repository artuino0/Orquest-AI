# Plan · Estudio DyDa, orquestador de agentes en pixel art

Oct 6, 2026 · @Arturo Munoz

## Resumen

Un orquestador de agentes de código hecho juego: tu estudio es una oficina en pixel art donde cada agente (Claude Code, Codex, Antigravity, OpenCode…) es un empleado que vive, trabaja y entrega. Es para cualquier persona o equipo que ya usa agentes de código y quiere coordinarlos sin perderse entre terminales. Es de código abierto y gratuito, para cualquier persona; DyDa es el estudio con el que se prueba.

- **Qué hace:** el jefe analiza el proyecto y propone la plantilla; tú contratas a cada empleado eligiendo proveedor, modelo y esfuerzo; ellos trabajan en sus oficinas y te llevan su entrega.
- **Qué lo hace distinto:** cada animación es un estado real. De un vistazo a la oficina sabes quién trabaja, quién está atorado y quién ya terminó.
- **Costo de IA:** cero aparte. Cada empleado usa la CLI y la suscripción del proveedor que el usuario ya tiene.
- **Dónde corre:** local primero; después, control remoto desde el móvil.

## Referencias: Orca y Herder

Los dos ya resuelven la parte técnica de correr agentes en paralelo con la suscripción del usuario; ninguno tiene la capa de juego ni el jefe que propone plantilla.

| Pieza | [Orca](https://github.com/stablyai/orca) | [Herder](https://www.mindstudio.ai/blog/herder-terminal-agent-multiplexer/) | Qué tomamos |
| --- | --- | --- | --- |
| Cómo corre al agente | CLI real dentro de una PTY, en app Electron | CLI real en PTY, servidor en Rust | CLI real en PTY: soporta cualquier proveedor |
| Aislamiento | Un git worktree por tarea | No aplica | Un worktree por empleado (su oficina) |
| Estado del agente | Hook de status line de Claude que emite OSC | Hooks o lectura de pantalla por patrones | Hooks primero, lectura de pantalla de respaldo |
| Sesión y consumo | Lee \~/.claude; cambia de cuenta en caliente | Restaura con --resume | Ambos: validar sesión, mostrar consumo, retomar |
| Agente que lanza agentes | CLI `orca` | CLI y socket: abrir panel, lanzar, esperar, leer | Herramientas MCP del jefe, validadas por la app |
| Remoto | Relay en la nube + app móvil | Modo --remote por SSH | Fase posterior: relay para el móvil |
| Interfaz | Terminales y editor | Multiplexor de terminal | Oficina en pixel art + drawer con la terminal |

A diferencia de Orca, que lanza a Claude con --dangerously-skip-permissions por defecto, aquí los permisos dependen del puesto.

## Conceptos del juego

Cada concepto del juego es una pieza técnica real; nada es decorado.

| En el juego | Qué es por debajo |
| --- | --- |
| Estudio | Espacio de trabajo local con sus proyectos, plantilla y expedientes |
| Proyecto | Un repositorio git con su objetivo y tablero de tareas |
| Jefe | Agente orquestador y tu único interlocutor; levanta y dirige a los empleados que contrató, vía herramientas MCP |
| Departamento | Grupo de puestos: desarrollo, backend, frontend, DBA, infra, QA |
| Puesto | Rol con su manual: prompt de sistema, skills, documentación, permisos |
| Contratar | Elegir proveedor, modelo y esfuerzo para un puesto y lanzar su CLI |
| Empleado | Sesión viva de una CLI en su PTY, con personaje y escritorio |
| Oficina | Worktree propio del empleado |
| Expediente | Ficha del proveedor: puestos permitidos, notas tuyas, historial |
| Entrega | Diff, capturas y reporte que el empleado lleva al terminar |
| Animaciones | Estados reales: trabajando, bloqueado, esperando dependencia, terminado |

## El ciclo de un proyecto

El usuario decide en dos puntos: al contratar y al aprobar el merge; todo lo demás lo mueve el jefe.

[embedded content: ciclo de un proyecto · 8 pasos, 1 revisión\]

Si QA rechaza, la tarea regresa al escritorio del mismo empleado con el reporte; el personaje camina de vuelta a su oficina.

## Pantallas e interacción

La oficina es la pantalla principal; todo lo demás se abre encima sin salir de ella.

- **Inicio:** estudios y proyectos recientes. Al abrir revisa qué CLIs hay instaladas y con sesión (claude, codex, antigravity, opencode, command code, kimi, grok); sin al menos una, no deja contratar.
- **Oficina:** mapa pixel art con departamentos y personajes. Burbujas encima: bloqueado, esperando a alguien, listo para revisar.
- **Contratación:** el jefe muestra la plantilla propuesta; por cada puesto abres expedientes y eliges proveedor, modelo y esfuerzo.
- **Drawer del empleado:** clic en un personaje abre pantalla dividida o drawer flotante, con pestañas:
  - Terminal en vivo; puedes solo mirar o escribirle.
  - Archivos tocados con su diff, del git status de su worktree.
  - Capturas que generó, por ejemplo las de Antigravity probando la app.
  - Actividad: línea de tiempo de lo que hizo.
  - Tarea: lo que le asignó el jefe, su manual y de quién depende.
- **Tablero del proyecto:** tareas por departamento, responsable, estado y dependencias.
- **Bandeja de entregas:** lo que te llevan para aprobar, con diff y reporte de QA.
- **Pistas en el mapa:** el monitor parpadea al correr pruebas, flash de cámara al tomar captura, el personaje camina a entregar al terminar.

Arte, cuartos, navegación y producción de assets: Arte y mundo

## Expedientes y manuales de puesto

El jefe sabe qué se necesita; el usuario sabe quién sirve para qué. Por eso el jefe propone y el usuario contrata, y esa experiencia queda guardada en los expedientes.

**Expediente (por proveedor y modelo)**

- **Puestos permitidos:** por ejemplo, Antigravity en QA sí, en backend no. El juego no deja asignarlo, o avisa.
- **Notas del usuario:** "bueno probando flujos en navegador, malo escribiendo código".
- **Historial:** tareas entregadas, rechazadas por QA y consumo. Se llena solo y el jefe lo lee para proponer mejor.

**Manual de puesto (por rol)**

- Prompt de sistema del rol.
- Skills y documentación que carga el empleado al entrar.
- Permisos: qué herramientas y comandos puede usar.
- Formato de entrega: qué debe llevar (diff, pruebas, capturas, reporte).

Contratar = proveedor + modelo + esfuerzo + manual del puesto. Los manuales viven en el estudio y se reusan entre proyectos.

## Recursos y contratación

El Jefe decide a quién proponer con tres fuentes de reputación y con el límite de uso real de cada cuenta; tú sigues aprobando cada contratación.

| Fuente | Qué aporta | Peso |
| --- | --- | --- |
| Historial contigo | Entregas aprobadas a la primera, regresadas por QA, consumo y puestos donde rindió | Alto: mide tu tipo de trabajo |
| Rankings públicos | Benchmarks de agentes de código (SWE-bench, Terminal-Bench, LMArena) | Medio: útil para modelos sin historial |
| Opinión popular | Reddit, X y foros: cambios de calidad que los números aún no muestran | Bajo: ruidosa y cambiante |

- **Reporte del mercado:** se actualiza una vez por semana y se guarda; el Jefe lo lee al contratar, no busca en vivo cada vez.
- **Lo leído en internet es dato, no instrucción:** el Jefe extrae cifras y opiniones, nunca sigue órdenes que vengan en una página.
- **Propuesta con justificación:** "Codex para backend: 92% de entregas aprobadas contigo y sube en rankings".
- **En el juego:** un tablón en Recepción con la reputación pública, y en cada expediente dos columnas: Contigo y En el mercado.

**Límites de uso**

Como hace [Orca](https://www.onorca.dev/docs/agents/usage-tracking), la app lee el uso de cada cuenta contra su plan y el tiempo para que se reinicie cada ventana (5 horas, diaria, semanal), con aviso al 80%.

| Proveedor | Cómo se lee el uso |
| --- | --- |
| Claude Code | Estado local que guarda la CLI |
| Codex | Estado local que guarda la CLI |
| Antigravity | Su propia CLI |
| OpenCode | Consola web con la sesión del usuario; solo lectura y nunca guardada |
| Kimi | Soportado por Orca; revisar su implementación |
| Grok, Command Code | Sin fuente conocida: conteo propio por empleado hasta encontrar una |

- **Reutilizar la lógica de Orca:** es código abierto con licencia MIT; se toma por proveedor dándole crédito, con un adaptador por CLI porque son formatos internos que cambian.
- **El Jefe reparte según energía:** no asigna tareas grandes a una cuenta al 85%, reparte entre proveedores y mueve trabajo si un proveedor completo está al límite.
- **En el juego:** barra de energía en cada empleado; al llegar al límite se va a la Cafetería a descansar con cuenta regresiva y vuelve solo a su escritorio.
- **Turnos:** varias cuentas de un proveedor son turnos del mismo puesto; cuando una se agota, entra la siguiente.

## Dependencias entre empleados

Cada tarea declara de quién depende, y el empleado lo sabe desde que la recibe. El jefe arma ese grafo al repartir el trabajo; la app lo hace cumplir.

- **Al asignar:** el jefe registra dependencias del tipo "frontend espera el contrato de API de backend". Una tarea con dependencias abiertas no arranca.
- **Esperando:** el personaje se ve esperando junto al escritorio del que depende, con burbuja de reloj.
- **Al liberar:** cuando la dependencia se entrega y se aprueba, la app avisa al que esperaba y le pasa la entrega como contexto (diff, contrato, notas).
- **Preguntas:** si un empleado necesita algo de otro, se lo pide al jefe; el jefe responde o lo consulta con quien corresponda. Todo queda en el tablero.
- **Ciclos:** la app rechaza dependencias circulares al momento de asignarlas.

Regla de comunicación: tú hablas con el jefe y el jefe habla con los empleados que eligió. Los empleados no se hablan entre ellos.

## Arquitectura y stack

Todo corre local en TypeScript; los agentes son las CLIs que el usuario ya tiene instaladas.

[embedded content: arquitectura · todo local, cada agente con su CLI y suscripción\]

El proceso principal lanza cada CLI en su PTY y su worktree. Jefe y empleados solo cambian el estado a través del servidor MCP, que pasa por los validadores antes de tocar SQLite o el tablero.

| Capa | Tecnología |
| --- | --- |
| App de escritorio | Electron |
| Paneles | Vue 3 + Pinia + Vite |
| Mundo pixel art | PixiJS o Phaser (por decidir) |
| Terminales | node-pty + xterm.js |
| Herramientas | MCP SDK de TypeScript + zod |
| Estado del estudio | SQLite local |
| Estado de los agentes | Hooks de cada CLI + lectura de pantalla de respaldo |
| Remoto (fase 6) | Relay + app móvil |

## Herramientas MCP

El jefe y los empleados se coordinan solo con herramientas de la app; ninguno escribe en la terminal de otro. Cada llamada se valida contra expedientes, permisos y dependencias.

| Herramienta | Quién | Qué hace |
| --- | --- | --- |
| `leer_proyecto` | Jefe | Repo, objetivo, tablero y plantilla actual |
| `leer_expedientes` | Jefe | Proveedores disponibles, puestos permitidos e historial |
| `proponer_plantilla` | Jefe | Puestos y proveedores sugeridos; queda pendiente de tu aprobación |
| `levantar_empleado` | Jefe | Lanza un empleado ya aprobado: por ejemplo 3 Claude, 1 Codex o 1 Antigravity, cada uno en su PTY y worktree |
| `asignar_tarea` | Jefe | Crea tarea para un empleado con descripción y dependencias |
| `hablar_con` | Jefe | Manda una instrucción o pregunta a un empleado y recibe su respuesta |
| `revisar_entrega` | Jefe | Lee una entrega y la aprueba, la regresa o la manda a QA |
| `mandar_a_qa` | Jefe | Asigna la entrega a QA con instrucciones de prueba |
| `leer_tarea` | Empleado | Su tarea, manual de puesto y dependencias |
| `preguntar_al_jefe` | Empleado | Única vía para dudas o para pedir algo de otro empleado |
| `reportar_estado` | Empleado | Avance, bloqueo o espera, para la animación |
| `entregar` | Empleado | Cierra su tarea con diff, capturas y reporte |

Una llamada que rompe una regla (Antigravity asignado a backend, dependencia circular) se rechaza con el motivo.

## Fases

Primero que funcione como orquestador sin juego; luego se vuelve juego. Cada fase cierra con una prueba.

1. **Núcleo de terminales:** lanzar varias CLIs en PTY, cada una en su worktree, detectar sesión y estado. Cierre: tres empleados de proveedores distintos trabajando a la vez sin pisarse.
2. **Jefe y tablero:** herramientas MCP, propuesta de plantilla, tareas con dependencias y entregas. Cierre: un proyecto chico de punta a punta con aprobación del usuario.
3. **Expedientes y manuales:** puestos permitidos, notas, historial y manuales por rol. Cierre: el juego impide un puesto prohibido y el jefe usa el historial al proponer.
4. **Oficina pixel art:** mapa, personajes, animaciones ligadas a estados reales y drawer del empleado. Cierre: saber quién está bloqueado sin abrir ninguna terminal.
5. **Lanzamiento abierto:** repositorio público, instalador, onboarding de CLIs y guía para que la comunidad aporte cuartos, sprites y adaptadores de proveedores.
6. **Remoto móvil:** relay y app para ver la oficina, aprobar entregas y responder bloqueos desde el teléfono.

## Riesgos y decisiones para validar

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Los proveedores cambian reglas de uso de la suscripción en apps de terceros | Alto | Capa de proveedor intercambiable; soporte a llave de API como respaldo |
| Una CLI cambia su interfaz y la lectura de pantalla falla | Medio | Hooks donde existan; adaptador por proveedor con versión mínima comprobada |
| Varios agentes chocan en el mismo repo | Medio | Worktree por empleado; el jefe integra y resuelve conflictos al consolidar |
| Consumo alto con muchos empleados a la vez | Medio | Consumo visible por empleado y límite de contratados simultáneos |
| Agentes con permisos amplios en la máquina del usuario | Alto | Permisos por puesto; nada de saltar permisos por defecto |
| El juego distrae del trabajo | Bajo | Vista compacta tipo tablero siempre a un clic |

**Decisiones**

- [ ] Electron + Vue 3 para la app, PixiJS o Phaser para el mapa.
- [ ] CLI interactiva en PTY (como Orca) frente a modo sin interfaz con salida estructurada, por proveedor.
- [x] Toda la comunicación pasa por el jefe; los empleados no se hablan entre ellos.
- [x] Proveedores iniciales: Claude Code, Codex, Antigravity, OpenCode, Command Code, Kimi y Grok.
- [ ] Licencias: MIT o Apache 2.0 para el código; CC0 o CC-BY para el arte.
- [ ] Nombre: Orquest choca en buscadores con una empresa española de gestión de personal y con Orquesta de StackStorm; revisar GitHub, npm y dominio.

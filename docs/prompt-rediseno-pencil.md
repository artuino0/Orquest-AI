# Prompt para rediseñar la interfaz en Pencil

Copia todo lo que está debajo de la línea.

---

Diseña la interfaz de escritorio de **Orquest AI**, un orquestador de agentes de código hecho juego: el estudio es una oficina en **pixel art** donde cada agente de IA (Claude Code, Codex, Antigravity, OpenCode…) es un empleado con nombre que trabaja, se bloquea, entrega y descansa. Es para desarrolladores que usan varios agentes a la vez y quieren coordinarlos sin perderse entre terminales.

**Regla de oro:** cada animación y cada indicador es un estado real, nada es decorado. De un vistazo a la oficina debo saber quién trabaja, quién está atorado, quién espera a otro, quién ya terminó y quién está descansando.

## Plataforma y estilo

- App de escritorio (Electron), ventana base 1280×800, mínimo 1024×640. Tema oscuro.
- Mundo en **pixel art isométrico** (proyección 2:1, casillas de 32×16 px, escala entera). Referencias: Habbo Hotel, Theme Hospital, Two Point Hospital, Game Dev Tycoon. No vista cenital ni 3/4 tipo Stardew Valley.
- Cuartos en corte (cutaway): solo se dibujan los muros del fondo (izquierdo y derecho) para que el interior siempre se vea; puertas en los muros que dan al pasillo.
- Personajes en isométrico con al menos 2 direcciones (frente y espalda, espejadas para izquierda/derecha) y orden de profundidad: lo que está más abajo en pantalla tapa a lo de arriba.
- Paneles de interfaz con estética retro coherente con el pixel art (bordes gruesos, sombras duras, tipografía monoespaciada o pixel legible), pero priorizando legibilidad: aquí se leen terminales, diffs y reportes.
- Color por proveedor en la ropa del personaje (Claude naranja, Codex azul, Antigravity verde, OpenCode blanco, Command Code lila, Kimi rosa, Grok gris).
- Colores de estado: trabajando (azul), bloqueado / te necesita (rojo), en espera (verde), esperando a otro (lila), lista para revisar (ámbar), jugando / limpiando contexto (turquesa), llegando (morado claro).

## Pantallas

### 1. Inicio
- Proyectos recientes (nombre y ruta) y botón "Abrir repositorio…".
- "Agentes en esta máquina": las 7 CLIs con estado instalada / sin sesión / no instalada y versión.
- Si ninguna CLI está lista, explicar qué falta y no dejar abrir proyecto.

### 2. Oficina (pantalla principal; todo lo demás se abre encima)
Mapa isométrico con estos cuartos: **Recepción** (por donde entra cada contratado; tiene un tablón de reputación del mercado), **Oficina del Jefe**, **Cafetería** (mesas para descansar por límite de uso y **maquinitas de videojuegos** para limpiar contexto), y seis departamentos: **Desarrollo, Backend, Frontend, DBA, Infra, QA**, cada uno con hasta 8 escritorios. Pasillos y puertas: los personajes caminan por ellos.

Cada empleado: personaje con **nombre visible** debajo, su escritorio con monitor. Estados y cómo se ven:

| Estado | Dónde | Cómo se ve |
| --- | --- | --- |
| Llegando | camina de Recepción a su escritorio | caminando |
| Trabajando | su escritorio | teclea de espaldas, monitor parpadea |
| Bloqueado (te necesita: permiso o pregunta) | su escritorio | de pie, burbuja "!" roja parpadeante |
| Esperando instrucción | su escritorio | sentado, burbuja "…" |
| Esperando a otro (dependencia) | junto al escritorio de quien lo bloquea | burbuja de reloj |
| Entregando / listo para revisar | en fila frente al Jefe | burbuja ✓ |
| Jugando (contexto lleno, se reinicia; dura segundos) | maquinitas de la Cafetería | de espaldas jugando, burbuja de control |
| Descansando (límite de uso de su cuenta) | mesas de la Cafetería | sentado, burbuja zzz, cuenta regresiva |
| Despedido | camina a Recepción y desaparece | — |

Extras del mapa: flash de cámara al tomar captura, monitor que parpadea al correr pruebas, barra de energía (uso de la cuenta) sobre cada personaje.

**HUD superior** (sin tapar el mapa): volver a Inicio, nombre del proyecto, contadores ("2 trabajando · 1 te necesita · 1 jugando"), y botones **Jefe**, **Plantilla** (con badge si hay propuesta), **Tablero**, **Expedientes**, **Entregas** (con badge de pendientes). Avisos tipo toast abajo. Zoom con rueda, arrastrar para mover; con un empleado elegido, la cámara lo sigue.

### 3. Panel del empleado (clic en un personaje)
Dos modos: **flotante** sobre el mapa o **pantalla dividida**. Cabecera: avatar/color, **nombre**, puesto, proveedor, modelo, esfuerzo, estado, **barra de contexto usado** (se pone roja al pasar el umbral, p. ej. 80%) y acciones: **Descanso** (mandarlo a jugar para limpiar contexto), **Despedir**, cambiar modo, cerrar. Pestañas:
- **Terminal** en vivo (xterm), puedo mirar o escribirle.
- **Archivos** tocados en su oficina, con diff por archivo.
- **Capturas** que tomó.
- **Actividad**: línea de tiempo (estados, mensajes del jefe, preguntas).
- **Tarea**: puesto, oficina (worktree), rama, tareas con estado, dependencias y último reporte de QA, avisos.
- **Bitácora**: su memoria en markdown: "Traspaso" (lo escribe el agente) y "Hechos" (los escribe la app). También sirve para capacitar a quien ocupe su puesto.

### 4. Jefe
- Si no hay jefe: contratarlo (objetivo del proyecto, proveedor, modelo, esfuerzo).
- Si hay: objetivo, campo para hablarle, abrir su terminal. El jefe es mi único interlocutor.

### 5. Plantilla (propuesta del jefe para aprobar)
Tabla por puesto: **nombre** (editable), puesto, proveedor, modelo, esfuerzo, el **motivo** del jefe (cita el historial) y la regla del expediente: **rojo** si está prohibido (no deja aprobar) o **ámbar** si solo avisa. Añadir/quitar puestos, "Aprobar N". Debajo, los ya contratados.

### 6. Tablero (vista compacta, siempre a un clic)
Tareas agrupadas por departamento: id, título, responsable (nombre), estado (esperando dependencia, lista, en curso, entregada, en QA, espera tu aprobación, integrada), de quién depende, veces que regresó, etiqueta QA.

### 7. Entregas (bandeja)
Lo que el jefe aprobó: título, quién, reporte, veredicto de QA, resumen de cambios, diff desplegable, y acciones **Integrar** (merge) o **Regresar** con notas. Mostrar el error si hay conflicto.

### 8. Expedientes y manuales
- **Expedientes** por proveedor y por modelo: puestos permitidos (casillas), "si no se permite: bloquear / avisar", notas, y dos columnas: **Contigo** (% integradas a la primera, integradas, rechazos de QA, por puesto) y **En el mercado** (rankings y opinión pública, reporte semanal).
- **Manuales de puesto** por rol: prompt, documentación, skills, permisos (puede editar, comandos permitidos, comandos prohibidos), formato de entrega, capturas obligatorias.

## Qué entregar
1. Inicio, Oficina con varios empleados en estados distintos (al menos uno bloqueado, uno esperando a otro, uno entregando y uno jugando), panel del empleado flotante y dividido (pestañas Terminal y Bitácora), Plantilla con una fila prohibida y una con aviso, Tablero, Entregas y Expedientes.
2. Hoja de sprites o especificación de cada estado del personaje y de las burbujas.
3. Estados vacíos (oficina sin jefe, tablero sin tareas, bandeja vacía) y de error.
4. Componentes reutilizables (botón, badge de estado, barra de contexto, pestañas, tabla, toast).

No cambies la funcionalidad: solo cómo se ve y se navega. Todo lo listado ya existe y funciona.

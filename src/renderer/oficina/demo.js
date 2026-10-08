// Oficina de píxel: jornada de mentira con empleados de Orquest.
// Pone `window.OFICINA` con quién hay (agentes) y una fuente que entrega el
// estado inicial y avisa de cada cambio, con la forma de datos que espera
// app.js. Cuando la oficina se conecte a la app, la fuente será el estudio
// real y esto sobra.
//
// Cada empleado sigue su propio ciclo, desfasado de los demás:
// en espera → el jefe le asigna → trabaja (a veces se bloquea: te necesita)
// → entrega → el jefe aprueba o regresa → en espera.
(() => {
  // Doce empleados, dos por rol, cada uno con la CLI que lo corre. El sprite es su personaje del pack.
  const PLANTILLA = [
    ['lupita', 'Lupita', 'Backend', 'Claude Code', 'CHAR4'],
    ['beto', 'Beto', 'DBA', 'Codex', 'CHAR2'],
    ['nico', 'Nico', 'Frontend', 'Antigravity', 'CHAR1'],
    ['paty', 'Paty', 'QA', 'Kimi', 'CHAR5'],
    ['tavo', 'Tavo', 'Infra', 'OpenCode', 'CHAR6'],
    ['ximena', 'Ximena', 'Desarrollo', 'Command Code', 'CHAR7'],
    ['memo', 'Memo', 'Backend', 'Codex', 'CHAR8'],
    ['sofi', 'Sofi', 'QA', 'Claude Code', 'CHAR4'],
    ['rafa', 'Rafa', 'DBA', 'Grok', 'CHAR2'],
    ['ivan', 'Iván', 'Frontend', 'Claude Code', 'CHAR1'],
    ['gus', 'Gus', 'Infra', 'Codex', 'CHAR6'],
    ['ana', 'Ana', 'Desarrollo', 'Antigravity', 'CHAR5'],
  ];
  // ?empleados=8 deja puestos sin dueño (se ven con la silla pegada al escritorio).
  const cuantos = Number(new URLSearchParams(location.search).get('empleados')) || PLANTILLA.length;
  PLANTILLA.length = Math.min(PLANTILLA.length, Math.max(1, cuantos));
  const agentes = { jefe: { nombre: 'Don Ramón', sprite: 'CHAR3', role: 'Jefe', model: 'Claude Code', isBoss: true } };
  for (const [id, nombre, role, model, sprite] of PLANTILLA) agentes[id] = { nombre, sprite, role, model };

  // Tareas por rol: clave del ticket, qué es, qué se le ve hacer, y cómo acaba.
  const POR_ROL = {
    Backend: [
      { clave: 'BE', tarea: 'API de productos', hace: ['✏️', 'Editando api.ts'], emoji: '📦', reporte: 'API de productos lista', ok: 'API aprobada', mal: 'Faltan pruebas del alta' },
      { clave: 'BE', tarea: 'Sesiones seguras', hace: ['🧪', 'Corriendo pruebas'], emoji: '🔐', reporte: 'Sesiones con token', ok: 'Sesiones ok', mal: 'El token no expira' },
    ],
    DBA: [
      { clave: 'DB', tarea: 'Migración de clientes', hace: ['🗃️', 'Migrando tablas'], emoji: '🗃️', reporte: 'Migración terminada', ok: 'Migración ok', mal: 'Faltan índices' },
      { clave: 'DB', tarea: 'Índices de búsqueda', hace: ['🔎', 'Midiendo consultas'], emoji: '⚡', reporte: 'Consultas 4× más rápidas', ok: 'Índices aprobados', mal: 'Bloquea la tabla' },
    ],
    Frontend: [
      { clave: 'FE', tarea: 'Lista de productos', hace: ['🎨', 'Maquetando'], emoji: '📱', reporte: 'Lista responsive', ok: 'Se ve bien', mal: 'Se rompe en móvil' },
      { clave: 'FE', tarea: 'Validación de RFC', hace: ['✏️', 'Editando form.vue'], emoji: '🧾', reporte: 'RFC validado', ok: 'Validación ok', mal: 'Acepta RFC vacío' },
    ],
    QA: [
      { clave: 'QA', tarea: 'Probar alta de clientes', hace: ['🧪', 'Probando flujo'], emoji: '🧪', reporte: 'Alta probada, 2 hallazgos', ok: 'Reporte recibido', mal: 'Faltan capturas' },
      { clave: 'QA', tarea: 'Probar pagos', hace: ['📸', 'Tomando capturas'], emoji: '💳', reporte: 'Pagos probados', ok: 'Sin hallazgos', mal: 'No probó el reembolso' },
    ],
    Infra: [
      { clave: 'IN', tarea: 'Pipeline de despliegue', hace: ['🚀', 'Armando pipeline'], emoji: '🚀', reporte: 'Pipeline en verde', ok: 'Pipeline aprobado', mal: 'Falla en producción' },
      { clave: 'IN', tarea: 'Respaldos nocturnos', hace: ['💾', 'Probando respaldo'], emoji: '💾', reporte: 'Respaldo y restauración ok', ok: 'Respaldos aprobados', mal: 'No restaura' },
    ],
    Desarrollo: [
      { clave: 'DV', tarea: 'Panel de administración', hace: ['✏️', 'Editando panel.vue'], emoji: '🧭', reporte: 'Panel listo', ok: 'Panel aprobado', mal: 'Faltan permisos' },
      { clave: 'DV', tarea: 'Exportar a Excel', hace: ['📊', 'Generando hoja'], emoji: '📊', reporte: 'Exporta 10 mil filas', ok: 'Exportación ok', mal: 'Pierde los acentos' },
    ],
  };
  let folio = 10;
  const TAREAS = {};
  for (const [id, , role] of PLANTILLA) TAREAS[id] = POR_ROL[role].map((t) => ({ ...t, id: `${t.clave}-${++folio}` }));

  // ?rapido=1 acorta las esperas para ver un ciclo completo en un minuto.
  const RAPIDO = new URLSearchParams(location.search).get('rapido') ? 0.2 : 1;
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms * RAPIDO));
  const entre = (a, b) => a + Math.random() * (b - a);

  const estado = {};
  Object.keys(agentes).forEach((id) => (estado[id] = { status: agentes[id].isBoss ? 'working' : 'idle', seq: 1 }));
  const eventos = [];
  const oyentes = new Set();
  const avisar = (msg) => oyentes.forEach((fn) => fn(msg));

  const lista = () =>
    Object.entries(estado).filter(([, e]) => !e.fuera).map(([agent, e], i) => ({ agent, name: agentes[agent].nombre, agent_status: e.status, pane_id: 'p' + (i + 1), terminal_title: '', state_change_seq: e.seq }));

  function poner(agent, status) {
    if (estado[agent].fuera) return;
    estado[agent].status = status;
    estado[agent].seq++;
    avisar({ type: 'agents', agents: lista() });
  }
  function emitir(ev) {
    if (estado[ev.agent]?.fuera) return;
    const evento = { ts: new Date().toISOString(), ...ev };
    eventos.push(evento);
    avisar({ type: 'evento', evento });
  }
  // Lo que hace mientras trabaja: sale en su globo.
  const actividad = (agent, t) => avisar(t ? { type: 'actividad', agent, clave: t.id, emoji: t.hace[0], texto: t.hace[1], tarea: t.id } : { type: 'actividad', agent, clave: null });

  async function ciclo(agent, retraso) {
    await esperar(retraso);
    for (let n = 0; ; n++) {
      const t = TAREAS[agent][n % TAREAS[agent].length];
      poner(agent, 'idle');
      await esperar(entre(20000, 40000)); // sin tarea: puede ir por café
      emitir({ agent, type: 'asignada', text: `${t.id} ${t.tarea}` });
      await esperar(10000); // el jefe camina y se la entrega
      poner(agent, 'working');
      actividad(agent, t);
      for (let rechazos = 0; ; rechazos++) {
        await esperar(entre(18000, 32000));
        if (Math.random() < 0.3) {
          poner(agent, 'blocked'); // pide permiso: te necesita
          await esperar(entre(5000, 8000));
          poner(agent, 'working');
          await esperar(6000);
        }
        actividad(agent, null);
        poner(agent, 'done');
        emitir({ agent, type: 'reporte', emoji: t.emoji, text: t.reporte });
        await esperar(18000); // camina a avisarle al jefe y regresa
        const ok = rechazos > 0 || Math.random() < 0.65;
        emitir(ok ? { agent, type: 'revision', verdict: 'aprobada', emoji: '👍', text: t.ok } : { agent, type: 'revision', verdict: 'rechazada', emoji: '😠', text: t.mal });
        await esperar(12000); // el jefe va a dar el veredicto
        if (ok) break;
        poner(agent, 'working');
        actividad(agent, t);
      }
    }
  }

  // ?despide=sofi: a los pocos segundos esa persona deja la oficina y su puesto queda libre.
  const despedido = new URLSearchParams(location.search).get('despide');
  if (despedido && estado[despedido] && !agentes[despedido].isBoss) {
    setTimeout(() => {
      actividad(despedido, null);
      estado[despedido].fuera = true;
      avisar({ type: 'agents', agents: lista() });
    }, 8000);
  }

  window.OFICINA = {
    agentes,
    fuente: {
      estado: async () => ({ agents: lista(), eventos: eventos.slice(-50), demo: true, actividades: {} }),
      suscribir: (fn) => {
        oyentes.add(fn);
        return () => oyentes.delete(fn);
      },
    },
  };

  // Desfasados: así siempre hay alguien trabajando, alguien entregando y alguien libre.
  Object.keys(TAREAS).forEach((agent, i) => ciclo(agent, 1500 + i * 5000));
})();

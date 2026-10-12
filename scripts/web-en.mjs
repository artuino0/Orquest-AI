// Inglés de la página web. La clave es el texto tal cual está en web/index.html.
// scripts/web.mjs arma web/en/index.html con esto y falla si un texto de la página
// se queda sin traducir.
export const EN = {
  // Lo que ven buscadores y redes
  'Orquest AI · tus agentes de código, en una oficina que puedes ver': 'Orquest AI · your coding agents, in an office you can watch',
  'Claude Code, Codex y otras CLIs de IA se integran como empleados de un estudio en pixel art. Tú te comunicas solo con el jefe.':
    'Claude Code, Codex and other AI CLIs join as employees of a pixel-art studio. You only talk to the boss.',
  'Orquest AI: los personajes y la oficina de píxel donde trabajan los agentes': 'Orquest AI: the characters and the pixel office where the agents work',
  'Orquestador de agentes de código: Claude Code, Codex y otras CLIs de IA trabajan como empleados de un estudio en pixel art. El usuario se comunica solo con el jefe, que forma el equipo, asigna tareas y revisa entregas.':
    'An orchestrator for coding agents: Claude Code, Codex and other AI CLIs work as employees of a pixel-art studio. You only talk to the boss, which builds the team, assigns tasks and reviews deliveries.',
  '"inLanguage": "es"': '"inLanguage": "en"',
  'content="es_MX"': 'content="en_US"',

  // Barra
  'Cómo funciona': 'How it works',
  'Qué incluye': "What's included",
  Descargar: 'Download',

  // Portada
  'Tus agentes de código, trabajando en una oficina que puedes ver.': 'Your coding agents, working in an office you can watch.',
  'Claude Code, Codex y otras CLIs de IA se integran como empleados de un estudio en pixel art. Tú te comunicas solo con el jefe: él forma el equipo, asigna las tareas, revisa las entregas y solicita tu aprobación antes de integrar a tu rama.':
    'Claude Code, Codex and other AI CLIs join as employees of a pixel-art studio. You only talk to the boss: it builds the team, assigns the tasks, reviews the deliveries and asks for your approval before merging into your branch.',
  'Ver el código': 'View the code',
  'La oficina de píxel de Orquest AI: el jefe en su escritorio y los empleados en sus puestos': 'The Orquest AI pixel office: the boss at its desk and the employees at theirs',
  'Abrir la oficina': 'Open the office',
  'Oficina de Orquest AI en demostración': 'Orquest AI office demo',
  'Demostración con una jornada simulada. En la aplicación, cada personaje corresponde a una terminal real y cada animación refleja su estado: teclea cuando trabaja, levanta la mano cuando requiere tu atención y camina con su reporte cuando entrega.':
    'A demo with a simulated workday. In the app, each character is a real terminal and each animation reflects its state: it types when working, raises a hand when it needs you, and walks over with its report when it delivers.',

  // Cómo funciona
  'Contratas al jefe': 'You hire the boss',
  'Eliges la CLI que lo ejecuta, le asignas un nombre y defines el objetivo del proyecto.': 'Pick the CLI that runs it, give it a name and set the project goal.',
  'El jefe propone la plantilla': 'The boss proposes the team',
  'Define los puestos necesarios y el proveedor y modelo de cada uno. Tú apruebas, ajustas o descartas.': 'It defines the roles needed and the provider and model for each. You approve, adjust or discard.',
  'Cada empleado en su oficina': 'Each employee in its own office',
  'Cada empleado trabaja en una copia aislada del repositorio, sin interferir con el trabajo de los demás.': 'Each employee works in an isolated copy of the repository, without getting in the way of the others.',
  'El jefe revisa, tú integras': 'The boss reviews, you merge',
  'Ningún cambio llega a tu rama sin la revisión del jefe y tu aprobación.': "No change reaches your branch without the boss's review and your approval.",

  // Qué incluye
  'Chat con el jefe y sus preguntas pendientes': 'Chat with the boss and its pending questions',
  'Un solo interlocutor.': 'A single point of contact.',
  'Te comunicas únicamente con el jefe. Lo que requiere de ti queda registrado como pregunta pendiente, con respuestas sugeridas, hasta que la atiendas.':
    'You only talk to the boss. Whatever it needs from you stays as a pending question, with suggested answers, until you deal with it.',
  'Tablero de tareas del proyecto': 'Project task board',
  'Tablero con dependencias.': 'A board with dependencies.',
  'Las tareas se encadenan por dependencias: una tarea que depende de otra no inicia hasta que la primera se integra.':
    "Tasks are chained by dependencies: a task that depends on another doesn't start until that one is merged.",
  'Consumo del límite de cada cuenta': "Each account's limit usage",
  'Uso de tus cuentas.': 'Your account usage.',
  'Consulta cuánto llevas usado del límite de cada cuenta y elige con cuál trabaja cada empleado.': "See how much of each account's limit you've used and choose which one each employee works with.",
  'Permisos por puesto': 'Permissions per role',
  'Cada puesto cuenta con un manual que define qué puede editar y qué comandos ejecuta sin solicitar confirmación. Orquest AI no omite los permisos de ninguna CLI.':
    'Each role has a manual that defines what it can edit and which commands it runs without asking. Orquest AI never bypasses the permissions of any CLI.',
  'Memoria persistente': 'Persistent memory',
  'Cuando un agente agota su contexto, redacta un traspaso, reinicia su sesión y retoma el trabajo a partir de su bitácora. Quien ocupe el puesto después también la recibe.':
    'When an agent runs out of context, it writes a handoff, restarts its session and picks up from its journal. Whoever takes the role later gets it too.',
  Expedientes: 'Records',
  'Registro del desempeño de cada proveedor y modelo en tus proyectos: entregas integradas al primer intento y rechazos. El jefe lo consulta antes de proponer una contratación.':
    'A record of how each provider and model has performed in your projects: deliveries merged on the first try, and rejections. The boss checks it before proposing a hire.',
  'Ejecución local': 'Runs locally',
  'No existe un servidor de Orquest AI. El tablero se almacena en una base de datos local y los agentes utilizan las sesiones que ya tienes iniciadas en cada CLI.':
    "There is no Orquest AI server. The board lives in a local database and the agents use the sessions you're already signed into in each CLI.",

  // CLIs
  'CLIs compatibles': 'Supported CLIs',
  'Orquest AI no incluye modelos: ejecuta las CLIs que ya tienes instaladas y con sesión iniciada. Requiere al menos una, además de git.':
    "Orquest AI doesn't include models: it runs the CLIs you already have installed and signed in. It needs at least one, plus git.",
  'La de mayor cobertura de pruebas': 'The most thoroughly tested',
  'Probada en uso real': 'Tested in real use',
  'Integrada, con pruebas limitadas': 'Integrated, lightly tested',

  // Requisitos
  Requisitos: 'Requirements',
  'Con git y una CLI ya puedes abrir la oficina. Lo demás es opcional: herramientas que tus agentes aprovechan si las tienes instaladas en tu CLI.':
    'With git and one CLI you can already open the office. The rest is optional: tools your agents put to use if you have them installed in your CLI.',
  'Lo indispensable': 'The essentials',
  'Al menos una CLI compatible, con sesión iniciada': 'At least one supported CLI, signed in',
  'Windows 10 u 11 (macOS y Linux, en pruebas)': 'Windows 10 or 11 (macOS and Linux, in testing)',
  'Node 22.5 o superior, solo si compilas desde el código': 'Node 22.5 or later, only if you build from source',
  'Recomendado, por puesto': 'Recommended, by role',
  DISEÑO: 'DESIGN',
  REPOSITORIO: 'REPOSITORY',
  'Quien ocupa el puesto de diseño dibuja las pantallas en un lienzo y frontend las construye a partir de ahí.':
    'Whoever holds the design role draws the screens on a canvas and frontend builds them from there.',
  'Abre la aplicación en un navegador, recorre el flujo como lo haría un usuario y guarda capturas como evidencia.':
    'Opens the app in a browser, walks the flow like a user would and saves screenshots as evidence.',
  'Consulta issues y prepara Pull Requests desde la terminal.': 'Reads issues and prepares Pull Requests from the terminal.',

  // Descargar
  'SISTEMA DETECTADO': 'YOUR SYSTEM',
  'instalador .exe': '.exe installer',
  'Versión <span id="version">': 'Version <span id="version">',
  ', preliminar. Los instaladores aún no están firmados, por lo que Windows y macOS muestran una advertencia al abrirlos. Los de macOS y Linux se generan de forma automática y todavía no se han verificado manualmente; si los usas, agradecemos tus comentarios.':
    ", preview. The installers aren't signed yet, so Windows and macOS show a warning when you open them. The macOS and Linux ones are built automatically and haven't been checked by hand yet; if you try them, we'd love your feedback.",
  'Todas las versiones': 'All versions',
  '· o compila desde el código fuente:': '· or build from source:',

  // Código abierto
  'Código abierto': 'Open source',
  'Orquest AI es software libre bajo licencia Apache 2.0. Las contribuciones se reciben mediante Pull Request y cada cambio es revisado por el autor del proyecto.':
    'Orquest AI is free software under the Apache 2.0 license. Contributions come in as Pull Requests and every change is reviewed by the project author.',
  'Cómo contribuir': 'How to contribute',
  'Reportar un problema': 'Report an issue',
  'Áreas donde puedes contribuir': 'Where you can help',
  'Pruebas en macOS y Linux': 'Testing on macOS and Linux',
  'Integración completa de las CLIs pendientes': 'Full integration of the remaining CLIs',

  // Apoya el proyecto
  'Apoya el proyecto': 'Support the project',
  'Orquest AI es gratis. Si quieres apoyarlo, o prefieres que te acompañe a instalarlo, aquí puedes hacerlo.':
    "Orquest AI is free. If you'd like to support it, or would rather have me walk you through the setup, you can do it here.",
  'Invítame un café': 'Buy me a coffee',
  'Aporte libre': 'Pay what you want',
  'Si Orquest AI te ahorra tiempo, un café ayuda a que siga avanzando. No desbloquea nada: todo es gratis y de código abierto.':
    "If Orquest AI saves you time, a coffee helps keep it moving. It doesn't unlock anything: everything is free and open source.",
  'Invitar un café': 'Buy a coffee',
  'Asesoría 1 a 1': '1-on-1 session',
  '· 2 horas': '· 2 hours',
  'Por videollamada: instalamos Orquest AI y tus CLIs, abrimos tu primer proyecto y te explico cómo trabaja la oficina.':
    'Over a video call: we install Orquest AI and your CLIs, open your first project and I walk you through how the office works.',
  'Reservar asesoría': 'Book a session',
  'Pagas ahora y te contacto en menos de 24 horas, por correo o teléfono, para acordar día y hora. Si no logramos agendar, te devuelvo el pago.':
    "You pay now and I get in touch within 24 hours, by email or phone, to agree on a day and time. If we can't find a slot, I refund the payment.",

  // Pie
  'Desarrollado por Jose Arturo Muñoz Castorena · Licencia Apache 2.0 · Parte del arte proviene del paquete': 'Built by Jose Arturo Muñoz Castorena · Apache 2.0 license · Part of the art comes from the',
  'Pixel Office de 2dPig': 'Pixel Office pack by 2dPig',
  'Claude Code, Codex y las demás CLIs pertenecen a sus respectivos titulares; Orquest AI no tiene afiliación con ninguno.':
    'Claude Code, Codex and the other CLIs belong to their respective owners; Orquest AI is not affiliated with any of them.',
  'Orquest AI ejecuta las CLIs oficiales con tu propia sesión. El uso de cada una queda sujeto a los términos de su proveedor y es tu responsabilidad.':
    "Orquest AI runs the official CLIs with your own session. Use of each one is subject to its provider's terms and is your responsibility.",
}

/** Textos que son iguales en los dos idiomas. */
export const IGUALES = new Set([
  'Orquest AI', 'GitHub', 'EN', 'Claude Code', 'Codex', 'Antigravity', 'OpenCode', 'Command Code', 'Kimi', 'Grok',
  'Windows', 'macOS', 'Linux', 'Apple Silicon · .dmg', 'x86_64 · .AppImage', 'npm install &amp;&amp; npm run dev', 'v0.1.0', '.',
  'Git', 'QA', 'Pencil', 'Playwright', 'GitHub CLI', '20 USD',
])

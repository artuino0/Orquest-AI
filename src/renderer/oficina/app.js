// Oficina de píxel de Orquest AI - cliente
// Viene de herdr-oficina (mismo autor): misma escena, mismo mapa y mismos
// globos. Aquí no habla con un servidor: quién hay en la oficina, en qué
// estado y qué eventos pasan lo entrega `window.OFICINA` (ver demo.js), con la
// misma forma de datos que allá daban /api/estado y /api/stream.
//
// Todo se dibuja en coordenadas nativas de la escena (256x224) y se escala
// por un entero (--s) para que el pixel art quede nítido. Los personajes
// caminan por el mapa de pasillos (assets/sprites/mapa.json) con A*.

const $ = (id) => document.getElementById(id);

// Tamaño de la escena en px nativos; lo fija escena.json al cargar.
let ESCENA = { w: 256, h: 224 };
const VELOCIDAD = 48; // px nativos por segundo al caminar

// Configuracion de agentes: sprite = capa de PixelOfficeAssets.aseprite
// La clave es el id del empleado en Orquest; `nombre` es el que se muestra.
const AGENT_META = window.OFICINA.agentes;
const JEFE = Object.keys(AGENT_META).find(k => AGENT_META[k].isBoss);
const nombreDe = (agent) => AGENT_META[agent]?.nombre || agent;
const SPRITES_EXTRA = ['CHAR5', 'CHAR1', 'CHAR2', 'CHAR4'];
// Puestos: silla = esquina sup-izq del sprite de silla (el tercer valor,
// true, es la silla que mira a la izquierda); pc = computadora del puesto.
// Vienen de escena.json, que arma assets/herdr-oficina/herramientas/armar_oficina.py:
// el jefe tiene el suyo y los demás toman uno al llegar, en orden.
const PUESTOS = {};
let PUESTOS_LIBRES = [];
let CAFETERA = [50, 122]; // dónde se para quien va por café
let SALIDA = null; // por dónde deja la oficina quien se va
let JUEGOS = []; // dónde se para quien va a jugar: { x, y, emoji, atras }
const JUEGOS_ANIMADOS = []; // maquinitas, futbolito…: se animan solo con alguien enfrente
const SILLA_PEGADA = 5; // px que se mete la silla al escritorio cuando el puesto no es de nadie

const GLOBO_ESTADO = { blocked: '✋', done: '✅', unknown: '❓' };
const ACTIVIDAD_MAX = 24; // caracteres del globo de actividad

// Mascotas: respiran y de vez en cuando piden algo
const MASCOTA_ANTOJOS = { PERRO: ['🥩', '🦴'], GATO: ['🐭'] };
const MASCOTA_ANTOJO_MS = [20000, 45000];

// Café: cada tanto un agente sin trabajo se levanta (uno a la vez)
const CAFE_CADA_MS = 5000;
const CAFE_PROBABILIDAD = 0.3;
const CAFE_DURACION_MS = [6000, 9000];
const JUEGO_DURACION_MS = [9000, 15000];
const IMPRIMIR_MS = 2500; // lo que tarda en salir el reporte
const DESCANSANDO_MAX = 3; // cuántos pueden andar fuera de su puesto a la vez

// --- estado ---
let sprites = {};       // nombre -> { w, h, archivo } (de sprites.json)
let mapa = null;        // cuadrícula caminable (de mapa.json)
let fondoInfo = null;   // sprites.json → fondo (muebles.png, mascotas)
let currentAgents = []; // ultimos conocidos
let eventLog = [];      // eventos acumulados
const eventosVistos = new Set();
let counters = {};      // agent -> {asignada, aprobada, rechazada}
const actividades = {}; // agent -> { emoji, texto, tarea } (lo que hace en working)
const personajes = new Map(); // agent -> Personaje
let esDemo = false;
let mensajesPendientes = 0;

// --- DOM refs ---
const els = {
  office: $('office'),
  wrap: $('office-wrap'),
  vista: $('vista'),
  main: document.querySelector('main'),
  sidebar: $('sidebar'),
  equipos: $('equipos'),
  agents: $('agents'),
  globos: $('globos'),
  luces: $('luces'),
  connLed: $('conn-led'),
  connPixel: $('conn-pixel'),
  eventList: $('event-list'),
  counters: $('counters'),
  nuevosEventos: $('nuevos-eventos'),
  cerrarFlotante: $('cerrar-flotante'),
};

const flotante = new URLSearchParams(location.search).get('flotante') === '1';
if (flotante) document.documentElement.classList.add('flotante');

// --- escala entera ---
function ajustarEscala() {
  const estilo = getComputedStyle(els.main);
  // Dentro de la app no hay lista de eventos al lado: la oficina usa todo el ancho.
  const sinLateral = getComputedStyle(els.sidebar).display === 'none';
  const lateral = sinLateral ? 0 : Number.parseFloat(getComputedStyle(els.sidebar).width) || 280;
  const gap = flotante || sinLateral ? 0 : 12;
  const ancho = els.main.clientWidth - Number.parseFloat(estilo.paddingLeft) - Number.parseFloat(estilo.paddingRight) - lateral - gap;
  const alto = els.main.clientHeight - Number.parseFloat(estilo.paddingTop) - Number.parseFloat(estilo.paddingBottom);
  // No llena la pantalla: usa el 80 % de lo que cabe, en pasos de medio punto
  // (1, 1.5, 2…) para que el píxel siga parejo. ?escala=2 la fija a mano.
  // Dentro de la app la oficina es todo el marco.
  const cabe = sinLateral ? Math.min(innerWidth / ESCENA.w, innerHeight / ESCENA.h) : Math.min(ancho / ESCENA.w, alto / ESCENA.h);
  let s;
  if (sinLateral) {
    // Dentro de la app, 1× es la oficina llenando su marco (lo más grande que cabe entera);
    // el zoom del panel multiplica a partir de ahí.
    s = Math.max(0.5, Math.round(cabe * (window.OFICINA.zoom || 1) * 100) / 100);
  } else {
    const fija = Number(new URLSearchParams(location.search).get('escala'));
    s = fija > 0 ? fija : Math.max(1, Math.floor(cabe * 0.8 * 2) / 2);
  }
  els.vista.style.setProperty('--s', s);
}
window.addEventListener('resize', ajustarEscala);
ajustarEscala();

// px nativos -> longitud CSS escalada
const px = (n) => `calc(${n}px * var(--s))`;

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const entre = (a, b) => a + Math.random() * (b - a);

async function esperarHasta(cond, maxMs) {
  const fin = Date.now() + maxMs;
  while (!cond() && Date.now() < fin) await esperar(250);
}

function spriteImg(nombre, espejo = false) {
  const sp = sprites[nombre];
  const img = document.createElement('img');
  img.src = `sprites/${sp.archivo}`;
  img.alt = '';
  img.draggable = false;
  img.style.width = px(sp.w);
  img.style.height = px(sp.h);
  img.dataset.w = sp.w;
  img.dataset.h = sp.h;
  if (espejo) img.classList.add('espejo');
  return img;
}

// --- mapa y rutas ---
function libre(cx, cy) {
  return cx >= 0 && cy >= 0 && cx < mapa.columnas && cy < mapa.filas && mapa.caminable[cy][cx] === '.';
}
const centro = ([cx, cy]) => [cx * mapa.celda + mapa.celda / 2, cy * mapa.celda + mapa.celda / 2];
const celdaDe = ([x, y]) => [Math.floor(x / mapa.celda), Math.floor(y / mapa.celda)];
const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function celdasLibresPorDistancia(p) {
  const out = [];
  for (let cy = 0; cy < mapa.filas; cy++) {
    for (let cx = 0; cx < mapa.columnas; cx++) {
      if (libre(cx, cy)) out.push({ c: [cx, cy], d: distancia(centro([cx, cy]), p) });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

function libreMasCercana(p) {
  const c = celdaDe(p);
  return libre(...c) ? c : celdasLibresPorDistancia(p)[0].c;
}

// A* en 8 direcciones, sin cortar esquinas de muebles.
function aEstrella(a, b) {
  const W = mapa.columnas;
  const k = ([x, y]) => y * W + x;
  const h = ([x, y]) => {
    const dx = Math.abs(x - b[0]), dy = Math.abs(y - b[1]);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const g = new Map([[k(a), 0]]);
  const prev = new Map();
  const cerrados = new Set();
  const abiertos = new Map([[k(a), { c: a, f: h(a) }]]);
  while (abiertos.size) {
    let actual = null;
    for (const n of abiertos.values()) if (!actual || n.f < actual.f) actual = n;
    const ka = k(actual.c);
    if (ka === k(b)) {
      const camino = [actual.c];
      for (let q = ka; prev.has(q);) { const c = prev.get(q); camino.unshift(c); q = k(c); }
      return camino;
    }
    abiertos.delete(ka);
    cerrados.add(ka);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const c = [actual.c[0] + dx, actual.c[1] + dy];
        if (!libre(...c) || cerrados.has(k(c))) continue;
        if (dx && dy && (!libre(actual.c[0] + dx, actual.c[1]) || !libre(actual.c[0], actual.c[1] + dy))) continue;
        const ng = g.get(ka) + (dx && dy ? Math.SQRT2 : 1);
        if (ng >= (g.get(k(c)) ?? Infinity)) continue;
        g.set(k(c), ng);
        prev.set(k(c), actual.c);
        abiertos.set(k(c), { c, f: ng + h(c) });
      }
    }
  }
  return null;
}

// Deja solo las esquinas del camino
function esquinas(celdas) {
  const out = [celdas[0]];
  for (let i = 1; i < celdas.length - 1; i++) {
    const [a, b, c] = [celdas[i - 1], celdas[i], celdas[i + 1]];
    if (b[0] - a[0] !== c[0] - b[0] || b[1] - a[1] !== c[1] - b[1]) out.push(b);
  }
  if (celdas.length > 1) out.push(celdas[celdas.length - 1]);
  return out;
}

// Puntos a recorrer de `desde` a `hasta`. Si alguno está fuera del mapa
// (una silla dentro del cubículo), sale/entra por la celda libre más cercana.
function ruta(desde, hasta) {
  const a = libreMasCercana(desde), b = libreMasCercana(hasta);
  const celdas = aEstrella(a, b);
  if (!celdas) return [desde]; // sin camino no se mueve: nunca corta por un muro
  const pts = [desde, ...esquinas(celdas).map(centro), hasta];
  return pts.filter((p, i) => i === 0 || distancia(p, pts[i - 1]) > 0.5);
}

// Lugares apartados para que no se encimen: quien -> [x, y]
const reservas = new Map();
function reservarCerca(quien, p, separacion = 14) {
  reservas.delete(quien);
  for (const { c } of celdasLibresPorDistancia(p)) {
    const q = centro(c);
    if ([...reservas.values()].every(r => distancia(r, q) >= separacion)) {
      reservas.set(quien, q);
      return q;
    }
  }
  return centro(libreMasCercana(p));
}
const liberar = (quien) => reservas.delete(quien);

// --- personajes ---
class Personaje {
  constructor(agent) {
    this.agent = agent;
    const n = personajes.size;
    this.meta = AGENT_META[agent] || {
      sprite: SPRITES_EXTRA[n % SPRITES_EXTRA.length], role: '?', model: agent,
    };
    this.puesto = PUESTOS[agent] || PUESTOS_LIBRES.shift() || null;
    this.estado = null;
    this.cola = Promise.resolve(); // acciones en orden (caminar, hablar...)
    this.pendientes = 0;
    this.enViaje = false;
    this.ocio = null; // emoji de lo que anda haciendo fuera de su puesto (café, juego)
    this.deEspaldas = false;
    this.avisoEnCola = false;
    this.avisando = false; // de camino al jefe o hablándole
    this.reportePendiente = null;

    this.dir = 'frente'; // hacia dónde camina: frente, atras o lado
    this.haciaIzq = false;
    this.el = document.createElement('div');
    this.el.className = 'char';
    this.el.dataset.agent = agent;
    this.imgPie = spriteImg(this.meta.sprite);
    this.el.appendChild(this.imgPie);
    const sentado = Object.keys(sprites).find(k => k.replace(/\s+/g, '') === this.meta.sprite + 'SENTADO');
    if (sentado) {
      this.imgSentado = spriteImg(sentado);
      this.el.appendChild(this.imgSentado);
      this.medidaSentado = sprites[sentado];
    }
    // Hojas de cuadros del personaje: caminar (de frente, de espaldas, de lado) y teclear.
    this.archivo = sprites[this.meta.sprite].archivo.replace(/\.png$/, '');
    this.hoja = document.createElement('div');
    this.hoja.className = 'hoja';
    this.hoja.hidden = true;
    this.el.appendChild(this.hoja);
    // El reporte impreso que lleva en la mano de camino al jefe.
    this.carga = spriteImg('REPORTE');
    this.carga.className += ' carga';
    this.carga.hidden = true;
    this.el.appendChild(this.carga);
    // Etiqueta, globos y burbujas van en una capa aparte, encima de todo
    // (escritorios y computadoras incluidos), que sigue al personaje.
    this.capa = document.createElement('div');
    this.capa.className = 'char-capa';
    this.capa.dataset.agent = agent;
    els.globos.appendChild(this.capa);
    this.globo = document.createElement('div');
    this.globo.className = 'globo-estado';
    this.capa.appendChild(this.globo);
    this.globoActividad = document.createElement('div');
    this.globoActividad.className = 'actividad';
    this.globoActividad.hidden = true;
    this.capa.appendChild(this.globoActividad);
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = nombreDe(agent);
    if (this.meta.isBoss) label.classList.add('jefe');
    this.capa.appendChild(label);
    els.agents.appendChild(this.el);
    // Dentro de la app, un clic abre el panel de esa persona.
    for (const t of [this.el, this.capa]) t.addEventListener('click', () => window.OFICINA.alElegir?.(agent));

    if (this.puesto) {
      const [sx, sy, sEspejo] = this.puesto.silla;
      // el puesto ya es de alguien: su silla se separa del escritorio
      if (this.puesto.sillaEl) this.puesto.sillaEl.style.left = px(sx);
      const base = sy + 19; // donde apoya los pies el que está sentado
      // Pedazo de escritorio que va delante del sentado: tapa sus piernas.
      const frente = document.createElement('div');
      frente.className = 'frente';
      const fx = sEspejo ? sx - 12 : sx + 12, fy = sy + 10;
      Object.assign(frente.style, { left: px(fx), top: px(fy), width: px(12), height: px(13), zIndex: base + 1 });
      const muebles = document.createElement('img');
      muebles.src = `sprites/${fondoInfo.muebles}`;
      muebles.alt = '';
      Object.assign(muebles.style, { left: px(-fx), top: px(-fy), width: px(fondoInfo.ancho), height: px(fondoInfo.alto) });
      frente.appendChild(muebles);
      // De frente, las piernas se las tapa su mesa (viene en las tapas de la escena).
      if (!this.puesto.frente) els.agents.appendChild(frente);

      const [nombre, x, y, espejo] = this.puesto.pc;
      this.pc = spriteImg(nombre, espejo);
      this.pc.className += ' pc';
      this.pc.style.left = px(x);
      this.pc.style.top = px(y);
      this.pc.style.zIndex = (this.puesto.z ?? base) + 2; // encima del escritorio recortado
      els.equipos.appendChild(this.pc);

      // luz de la pantalla de noche, centrada en el monitor
      const sp = sprites[nombre];
      this.brillo = document.createElement('img');
      this.brillo.className = 'brillo';
      this.brillo.src = BRILLO_URL;
      this.brillo.alt = '';
      this.brillo.hidden = true;
      Object.assign(this.brillo.style, {
        left: px(Math.round(x + sp.w / 2 - BRILLO.w / 2)), top: px(Math.round(y + 7 - BRILLO.h / 2)),
        width: px(BRILLO.w), height: px(BRILLO.h),
      });
      els.luces.appendChild(this.brillo);
    } else {
      // sin puesto: se queda de pie cerca de la cafetera
      this.lugar = reservarCerca(agent, CAFETERA, 16);
      reservas.delete(agent);
      reservas.set('fijo:' + agent, this.lugar);
    }
    this.ponerEn(...this.asiento());
    this.refrescar();
  }

  // pies/centro al estar sentado
  asiento() {
    if (!this.puesto) return this.lugar;
    if (this.puesto.frente) return this.puesto.pie;
    const [sx, sy, espejo] = this.puesto.silla;
    return [espejo ? sx + 3 : sx + 8, sy + 19];
  }

  // en su silla (puede estar esperando algo, pero no anda caminando)
  enSilla() {
    return !this.enViaje && distancia([this.x, this.y], this.asiento()) < 1;
  }

  // Encola una acción; las acciones de un personaje nunca se enciman.
  hacer(fn) {
    this.pendientes++;
    this.cola = this.cola.then(fn).catch(e => console.warn(e)).finally(() => { this.pendientes--; });
    return this.cola;
  }

  // Sentado = en su silla, sin caminar y con sprite sentado disponible
  estaSentado() {
    return Boolean(this.puesto && (this.imgSentado || this.puesto.frente) && !this.enViaje
      && distancia([this.x, this.y], this.asiento()) < 1);
  }

  ponerEn(x, y) {
    this.x = x; this.y = y;
    this.colocar();
  }

  // Muestra una hoja de cuadros en vez del sprite quieto.
  ponerHoja(nombre, cuadros, ms, espejo) {
    const clave = nombre + (espejo ? '<' : '');
    if (this.hojaPuesta !== clave) {
      this.hojaPuesta = clave;
      this.hoja.style.backgroundImage = `url("sprites/${this.archivo}-${nombre}.png")`;
      this.hoja.style.setProperty('--fw', this.w);
      this.hoja.style.setProperty('--n', cuadros);
      this.hoja.style.setProperty('--dur', `${cuadros * ms}ms`);
      this.hoja.classList.toggle('espejo', espejo);
    }
    this.hoja.hidden = false;
    this.imgPie.hidden = true;
    if (this.imgSentado) this.imgSentado.hidden = true;
  }

  // Elige sprite (de pie / sentado / caminando / tecleando), orientación y caja en pantalla.
  colocar() {
    const sentado = this.estaSentado();
    const deFrente = sentado && this.puesto.frente;
    const medida = sentado && !deFrente ? this.medidaSentado : sprites[this.meta.sprite];
    const w = medida.w, h = medida.h;
    this.w = w; this.h = h;
    let left, top, z;
    if (deFrente) {
      const [x, y] = this.puesto.pie;
      left = Math.round(x - w / 2); top = y - h; z = y;
    } else if (sentado) {
      // igual que CHAR3 en la escena original: espalda en el respaldo
      const [sx, sy, sEspejo] = this.puesto.silla;
      left = sEspejo ? sx + 9 - w : sx + 2;
      top = sy + 19 - h;
      z = sy + 19;
    } else {
      left = Math.round(this.x - w / 2);
      top = Math.round(this.y) - h;
      z = Math.round(this.y);
    }
    if (this.enViaje) {
      const nombre = this.dir === 'lado' ? 'lado-camina' : this.dir === 'atras' ? 'atras-camina' : 'camina';
      this.ponerHoja(nombre, 4, 130, this.dir === 'lado' && this.haciaIzq); // las de lado miran a la derecha
    } else if (deFrente) {
      // sentado de cara a nosotros, tras su mesa
      if (this.estado === 'working') this.ponerHoja('sentado-frente-teclea', 2, 220, false);
      else this.ponerHoja('sentado-frente', 1, 1000, false);
    } else if (sentado && this.estado === 'working') {
      this.ponerHoja('sentado-teclea', 2, 220, Boolean(this.puesto.silla[2]));
    } else if (!sentado && this.deEspaldas) {
      this.ponerHoja('atras', 1, 1000, false); // de pie, de espaldas (en una maquinita)
    } else if (!sentado) {
      this.ponerHoja('idle', 4, 280, false); // de pie, esperando
    } else {
      this.hoja.hidden = true;
      this.hojaPuesta = null;
      const img = sentado && !deFrente ? this.imgSentado : this.imgPie;
      const otra = img === this.imgPie ? this.imgSentado : this.imgPie;
      img.hidden = false;
      if (otra) otra.hidden = true;
      // los sentados miran a la derecha; de pie, al frente
      img.classList.toggle('espejo', sentado && !deFrente && Boolean(this.puesto.silla[2]));
    }
    this.el.style.width = px(w);
    this.el.style.height = px(h);
    this.el.style.left = px(left);
    this.el.style.top = px(top);
    this.el.style.zIndex = z;
    Object.assign(this.capa.style, { left: this.el.style.left, top: this.el.style.top, width: this.el.style.width, height: this.el.style.height });
  }

  tramo(a, b) {
    // Cada tramo usa la hoja de su dirección: nadie camina de reversa.
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(dx) >= Math.abs(dy)) { this.dir = 'lado'; this.haciaIzq = dx < 0; }
    else this.dir = dy < 0 ? 'atras' : 'frente';
    const dur = distancia(a, b) / VELOCIDAD * 1000;
    return new Promise(resolve => {
      let t0 = null; // el reloj del tramo es el de los cuadros, no otro: así nunca arranca atrasado
      const paso = (t) => {
        t0 ??= t;
        const f = Math.min(1, (t - t0) / dur);
        this.ponerEn(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
        if (f < 1) requestAnimationFrame(paso); else resolve();
      };
      requestAnimationFrame(paso);
    });
  }

  async caminar(destino) {
    const pts = ruta([this.x, this.y], destino);
    if (pts.length < 2) return;
    this.enViaje = true;
    this.colocar();
    this.refrescar();
    for (let i = 1; i < pts.length; i++) await this.tramo(pts[i - 1], pts[i]);
    this.enViaje = false;
    this.colocar();
    this.refrescar();
  }

  volver() { return this.caminar(this.asiento()); }

  // Clases y globo según estado y lo que esté haciendo
  refrescar() {
    const sentado = !this.enViaje && distancia([this.x, this.y], this.asiento()) < 1;
    this.colocar(); // teclear depende del estado
    this.el.classList.toggle('caminando', this.enViaje);
    this.capa.classList.toggle('caminando', this.enViaje);
    for (const e of ['idle', 'working', 'blocked', 'done', 'unknown']) {
      this.el.classList.toggle(e, sentado && this.estado === e);
    }
    // Si se fue, su puesto queda sin dueño: la silla vuelve a pegarse al escritorio.
    if (this.puesto?.sillaEl) {
      const [sx, , espejo] = this.puesto.silla;
      const pegada = this.estado === 'gone' ? (espejo ? -SILLA_PEGADA : SILLA_PEGADA) : 0;
      this.puesto.sillaEl.style.left = px(sx + pegada);
    }
    // quien se va no desaparece hasta llegar a la salida
    const fuera = this.estado === 'gone' && !this.saliendo;
    this.el.classList.toggle('gone', fuera);
    this.capa.classList.toggle('gone', fuera);
    this.pc?.classList.toggle('encendida', sentado && this.estado === 'working');
    if (this.brillo) {
      // La luz de la pantalla solo le da a quien está sentado frente a ella.
      this.brillo.hidden = !nocheActual || this.estado === 'gone' || !sentado;
      this.brillo.classList.toggle('trabaja', this.estado === 'working');
    }
    const emoji = this.ocio ? this.ocio : sentado ? (GLOBO_ESTADO[this.estado] || '') : '';
    if (this.globo.dataset.emoji !== emoji) {
      this.globo.dataset.emoji = emoji;
      this.globo.innerHTML = emoji ? emojiPixel(emoji) : '';
    }
    this.globo.hidden = !emoji;

    // Globo de actividad: solo trabajando y en su lugar (el CSS lo oculta
    // mientras hay una burbuja de evento).
    const act = this.estado === 'working' && sentado && !this.visitado ? actividades[this.agent] : null;
    this.globoActividad.hidden = !act;
    if (act) {
      this.globoActividad.innerHTML = emojiPixel(act.emoji) + `<span>${escapeHtml(textoActividad({ ...act, emoji: '' }).trim())}</span>`;
      this.globoActividad.classList.toggle('der', this.x > ESCENA.w - 48);
      this.globoActividad.classList.toggle('izq', this.x < 48);
    }
  }

  aplicarEstado(estado, animar = true) {
    const antes = this.estado;
    this.estado = estado;
    // Se va caminando hasta la salida y ahí desaparece.
    if (animar && estado === 'gone' && antes !== 'gone' && SALIDA && !this.saliendo) {
      this.saliendo = true;
      this.hacer(async () => {
        liberar(this.agent);
        if (this.estado === 'gone') await this.caminar(SALIDA);
        this.saliendo = false;
        this.refrescar();
      });
    }
    this.refrescar();
    // Al terminar, el agente va a avisarle al jefe
    if (animar && estado === 'done' && antes !== 'done' && !this.meta.isBoss) this.avisar();
  }

  avisar() {
    if (this.avisoEnCola || !hayJefe()) return;
    this.avisoEnCola = true;
    this.hacer(async () => {
      const boss = jefe();
      // espera sentado (con ✅) a que el jefe esté en su lugar
      await esperarHasta(() => boss.enSilla(), 60000);
      this.avisando = true;
      // Primero pasa a la impresora por su reporte y se lo lleva.
      const impresora = JUEGOS.find(j => j.impresora);
      if (impresora) {
        const lugar = reservarCerca(this.agent, [impresora.x, impresora.y], 6);
        await this.caminar(lugar);
        this.deEspaldas = true;
        this.refrescar();
        usarJuego(lugar, 1);
        await esperar(IMPRIMIR_MS);
        usarJuego(lugar, -1);
        this.deEspaldas = false;
        this.carga.hidden = false;
      }
      await this.caminar(reservarCerca(this.agent, boss.asiento()));
      await esperarHasta(() => boss.enSilla(), 20000);
      // el evento "reporte" puede llegar un poco después que el estado "done"
      await esperarHasta(() => this.reportePendiente, 3000);
      const r = this.reportePendiente || { emoji: '✅', text: '¡Terminé!' };
      this.reportePendiente = null;
      await this.decir(r.emoji, r.text, 3000);
      this.carga.hidden = true; // se lo deja al jefe
      this.avisando = false;
      this.avisoEnCola = false;
      liberar(this.agent);
      await this.volver();
    });
  }

  irPorCafe() {
    return this.descansar(CAFETERA, '☕', CAFE_DURACION_MS, false);
  }

  // Va a un lugar de juego, se queda un rato y regresa a su puesto.
  irAJugar(juego) {
    juego.ocupado = true;
    return this.descansar([juego.x, juego.y], juego.emoji, JUEGO_DURACION_MS, juego.atras, 6)
      .finally(() => { juego.ocupado = false; });
  }

  descansar(lugar, emoji, duracion, deEspaldas, separacion) {
    this.ocio = emoji; // desde que sale, para que no manden a otro al mismo lugar
    return this.hacer(async () => {
      await this.caminar(reservarCerca(this.agent, lugar, separacion));
      this.deEspaldas = Boolean(deEspaldas);
      this.refrescar();
      usarJuego(lugar, 1);
      await esperar(entre(...duracion));
      usarJuego(lugar, -1);
      this.ocio = null;
      this.deEspaldas = false;
      liberar(this.agent);
      await this.volver();
    });
  }

  decir(emoji, texto, ms) {
    const b = document.createElement('div');
    b.className = 'bubble';
    // cerca de un borde la burbuja se ancla a ese lado para no salirse
    if (this.x > ESCENA.w - 48) b.classList.add('der');
    else if (this.x < 48) b.classList.add('izq');
    b.innerHTML = `${emoji ? emojiPixel(emoji) : ''}<span>${escapeHtml(texto || '')}</span>`;
    this.capa.appendChild(b);
    this.capa.classList.add('hablando');
    setTimeout(() => { b.style.opacity = '0'; }, ms - 300);
    return new Promise(resolve => setTimeout(() => {
      b.remove();
      if (!this.capa.querySelector('.bubble')) this.capa.classList.remove('hablando');
      resolve();
    }, ms));
  }
}

function personaje(agent) {
  let p = personajes.get(agent);
  if (!p) { p = new Personaje(agent); personajes.set(agent, p); }
  return p;
}

function renderAgents(animar = true) {
  const known = new Set(currentAgents.map(a => a.agent));
  for (const a of currentAgents) {
    const p = personaje(a.agent);
    if (p.estado !== a.agent_status) p.aplicarEstado(a.agent_status, animar);
  }
  // Agentes que ya no estan: se desvanecen (el jefe se queda para las visitas)
  for (const [agent, p] of personajes) {
    if (!known.has(agent) && p.estado !== 'gone' && (!p.meta.isBoss || window.OFICINA.jefeReal)) p.aplicarEstado('gone', animar);
  }
}

// --- mascotas ---
// Se dibujan encima de su copia en el fondo: respiran (CSS) y cada tanto
// muestran un antojo en un globo.
function crearMascotas() {
  for (const m of fondoInfo.mascotas || []) {
    const sp = sprites[m.nombre];
    if (!sp) continue;
    const el = document.createElement('div');
    el.className = 'mascota ' + m.nombre.toLowerCase();
    Object.assign(el.style, {
      left: px(m.x), top: px(m.y), width: px(sp.w), height: px(sp.h), zIndex: m.y + sp.h,
    });
    const img = spriteImg(m.nombre, m.espejo);
    // escala para crecer 1 pixel nativo al inhalar
    img.style.setProperty('--respira', ((sp.h + 1) / sp.h).toFixed(4));
    el.appendChild(img);
    els.agents.appendChild(el);
    const capa = document.createElement('div');
    capa.className = 'char-capa';
    Object.assign(capa.style, { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height });
    const globo = document.createElement('div');
    globo.className = 'globo-estado';
    globo.hidden = true;
    capa.appendChild(globo);
    els.globos.appendChild(capa);

    const antojos = MASCOTA_ANTOJOS[m.nombre] || [];
    const siguiente = () => setTimeout(async () => {
      globo.innerHTML = emojiPixel(antojos[Math.floor(Math.random() * antojos.length)]);
      globo.hidden = false;
      await esperar(3000);
      globo.hidden = true;
      siguiente();
    }, entre(...MASCOTA_ANTOJO_MS));
    if (antojos.length) siguiente();
  }
}

// --- hora del día ---
// Afuera (cielo, nubes, vidrios) cambia con colores exactos de la paleta del
// pack (Sweetie 16); adentro (#escena) un solo filtro CSS oscurece/entibia.
// Nombres, globos, reloj y pantallas quedan fuera del filtro.
// Para probar: ?hora=21:30 fija la hora de inicio y ?velocidad=60 hace
// correr el tiempo 60 veces más rápido.
const PARAMS = new URLSearchParams(location.search);
const INICIO_REAL = Date.now();
const HORA_BASE = (() => {
  const d = new Date();
  const m = /^(\d{1,2}):(\d{2})$/.exec(PARAMS.get('hora') || '');
  if (m) d.setHours(+m[1], +m[2], 0, 0);
  return d.getTime();
})();
const VELOCIDAD_TIEMPO = Math.max(1, Number(PARAMS.get('velocidad')) || 1);
const horaActual = () => new Date(HORA_BASE + (Date.now() - INICIO_REAL) * VELOCIDAD_TIEMPO);

const C = {
  negro: '#1a1c2c', morado: '#5d275d', rojo: '#b13e53', naranja: '#ef7d57',
  amarillo: '#ffcd75', celeste: '#73eff7', azul: '#41a6f6', azulOscuro: '#3b5dc9',
  marino: '#29366f', blanco: '#f4f4f4', gris: '#94b0c2', grisOscuro: '#566c86', pizarra: '#333c57',
};
// nubes: [color de #f4f4f4, color de #73eff7]; vidrio: color para cada azul
// original del pack [#29366f, #3b5dc9, #41a6f6, #73eff7]
const FASES = {
  dia:       { cielo: C.azul,     nubes: [C.blanco, C.celeste],     vidrio: [C.marino, C.azulOscuro, C.azul, C.celeste], filtro: 'none' },
  manana:    { cielo: C.celeste,  nubes: [C.blanco, C.gris],        vidrio: [C.azulOscuro, C.azul, C.celeste, C.blanco], filtro: 'brightness(.97)' },
  dorado:    { cielo: C.amarillo, nubes: [C.blanco, C.naranja],     vidrio: [C.rojo, C.naranja, C.amarillo, C.blanco], filtro: 'sepia(.25) saturate(1.1) brightness(.92)' },
  naranja:   { cielo: C.naranja,  nubes: [C.amarillo, C.rojo],      vidrio: [C.morado, C.rojo, C.naranja, C.amarillo], filtro: 'sepia(.3) saturate(1.05) brightness(.86)' },
  ocaso:     { cielo: C.rojo,     nubes: [C.naranja, C.morado],     vidrio: [C.negro, C.morado, C.rojo, C.naranja], filtro: 'sepia(.3) saturate(.95) brightness(.8)' },
  violeta:   { cielo: C.morado,   nubes: [C.rojo, C.pizarra],       vidrio: [C.negro, C.marino, C.morado, C.rojo], filtro: 'brightness(.76) saturate(.8)' },
  azulNoche: { cielo: C.marino,   nubes: [C.grisOscuro, C.pizarra], vidrio: [C.negro, C.negro, C.marino, C.grisOscuro], filtro: 'brightness(.72) saturate(.78)', estrellas: true },
  noche:     { cielo: C.negro,    nubes: [C.pizarra, C.marino],     vidrio: [C.negro, C.negro, C.marino, C.pizarra], filtro: 'brightness(.68) saturate(.75)', estrellas: true },
};
const HORARIO = [ // [desde, fase] en orden
  ['0:00', 'noche'], ['5:00', 'azulNoche'], ['5:40', 'violeta'], ['6:10', 'naranja'],
  ['6:40', 'dorado'], ['7:20', 'manana'], ['8:00', 'dia'], ['18:00', 'dorado'],
  ['18:40', 'naranja'], ['19:20', 'ocaso'], ['19:50', 'violeta'], ['20:20', 'azulNoche'],
  ['21:30', 'noche'],
].map(([h, f]) => { const [a, b] = h.split(':'); return [a * 60 + +b, f]; });

function faseDe(d) {
  const m = d.getHours() * 60 + d.getMinutes();
  let fase = HORARIO[0][1];
  for (const [desde, f] of HORARIO) if (m >= desde) fase = f;
  return fase;
}
// Pantallas encendidas y luna: de 20:00 a 6:00
const esNoche = (d) => d.getHours() >= 20 || d.getHours() < 6;
let nocheActual = false;

const hexARgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// Recolorea una imagen (ImageData) cambiando colores exactos: { '#rrggbb': '#rrggbb' }
function recolorear(base, mapa) {
  const out = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
  const tabla = new Map(Object.entries(mapa).map(([a, b]) => [hexARgb(a).join(), hexARgb(b)]));
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const a = tabla.get(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    if (a) { d[i] = a[0]; d[i + 1] = a[1]; d[i + 2] = a[2]; }
  }
  return out;
}

async function cargarImageData(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

// PRNG con semilla: las estrellas salen siempre en el mismo lugar
function prng(semilla) {
  return () => {
    semilla |= 0; semilla = semilla + 0x6D2B79F5 | 0;
    let t = Math.imul(semilla ^ semilla >>> 15, 1 | semilla);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Fase lunar real: 0 = nueva, 0.5 = llena (mes sinódico desde la luna nueva
// del 6 de enero de 2000, 18:14 UTC).
function faseLunar(d) {
  const f = ((d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000 / 29.530588853) % 1;
  return f < 0 ? f + 1 : f;
}

// Luna de 11x11 px: parte iluminada según la fase (creciente a la derecha),
// cráteres, borde con volumen, luz cenicienta en la parte oscura y halo
// tramado alrededor.
const CRATERES = new Set(['-2,-2', '-1,-2', '-2,-1', '1,0', '2,0', '1,1', '-1,2', '0,2', '2,-3', '3,2']);
function dibujarLuna(ctx, cx, cy, fase) {
  const R = 5;
  const k = Math.cos(2 * Math.PI * fase);
  const crece = fase < 0.5;
  for (let dy = -R - 2; dy <= R + 2; dy++) {
    for (let dx = -R - 2; dx <= R + 2; dx++) {
      const dist = Math.hypot(dx, dy);
      let color = null;
      if (dist <= R + 0.4) {
        const ancho = Math.sqrt(Math.max(R * R - dy * dy, 0)) + 0.5;
        const nx = dx / ancho;
        const iluminada = crece ? nx >= k : nx <= -k;
        const crater = CRATERES.has(`${dx},${dy}`);
        if (iluminada) {
          // abajo a la derecha, un poco de sombra para que se vea redonda
          const sombra = dist > R - 1 && dx + dy >= 3;
          color = crater || sombra ? C.gris : C.blanco;
        } else {
          color = crater ? C.marino : C.pizarra;
        }
      } else if (dist <= R + 2.2 && (dx + dy) % 2 === 0) {
        color = C.marino; // halo
      }
      if (color) { ctx.fillStyle = color; ctx.fillRect(cx + dx, cy + dy, 1, 1); }
    }
  }
}

function iniciarDia() {
  const f = fondoInfo;
  const alto = f.edificioY; // el cielo solo se ve arriba del edificio

  // cielo, estrellas y luna
  const cielo = $('cielo');
  cielo.width = f.ancho; cielo.height = alto;
  Object.assign(cielo.style, { width: px(f.ancho), height: px(alto) });
  const ctx = cielo.getContext('2d');
  const azar = prng(7);
  const estrellas = Array.from({ length: 28 }, () => ({
    x: 2 + Math.floor(azar() * (f.ancho - 4)),
    y: 2 + Math.floor(azar() * (alto - 6)),
    cruz: azar() < 0.25,
    color: azar() < 0.7 ? C.blanco : C.gris,
  }));

  // nubes (se recolorean por fase) y vidrios
  const nubes = $('nubes');
  Object.assign(nubes.style, { width: px(f.ancho), height: px(alto) });
  const vidrios = $('vidrios');
  vidrios.width = f.ancho; vidrios.height = f.alto;
  Object.assign(vidrios.style, { width: px(f.ancho), height: px(f.alto) });
  const ctxVidrios = vidrios.getContext('2d');
  const baseNubes = cargarImageData(`sprites/${f.nubes}`);
  const baseVidrios = cargarImageData(`sprites/${f.vidrios}`);
  const lienzo = document.createElement('canvas');
  lienzo.width = f.ancho; lienzo.height = f.alto;

  let faseActual = null;
  const escena = $('escena');
  const aplicarFase = async (nombre) => {
    const fase = FASES[nombre];
    // al abrir la página el filtro va directo; después cambia con transición
    if (!faseActual) escena.style.transition = 'none';
    escena.style.filter = fase.filtro;
    if (!faseActual) { void escena.offsetWidth; escena.style.transition = ''; }
    const n = recolorear(await baseNubes, { '#f4f4f4': fase.nubes[0], '#73eff7': fase.nubes[1] });
    lienzo.getContext('2d').putImageData(n, 0, 0);
    nubes.style.backgroundImage = `url(${lienzo.toDataURL()})`;
    const originales = ['#29366f', '#3b5dc9', '#41a6f6', '#73eff7'];
    ctxVidrios.putImageData(recolorear(await baseVidrios,
      Object.fromEntries(originales.map((c, i) => [c, fase.vidrio[i]]))), 0, 0);
  };

  const tic = () => {
    const d = horaActual();
    const nombre = faseDe(d);
    if (nombre !== faseActual) { aplicarFase(nombre); faseActual = nombre; }
    const fase = FASES[nombre];

    ctx.fillStyle = fase.cielo;
    ctx.fillRect(0, 0, f.ancho, alto);
    if (fase.estrellas) {
      for (const e of estrellas) {
        const color = Math.random() < 0.15 ? C.grisOscuro : e.color; // titilan
        ctx.fillStyle = color;
        ctx.fillRect(e.x, e.y, 1, 1);
        if (e.cruz) {
          ctx.fillStyle = C.grisOscuro;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.fillRect(e.x + dx, e.y + dy, 1, 1);
        }
      }
    }
    const noche = esNoche(d);
    if (noche) {
      // cruza el cielo en arco de las 20:00 a las 6:00
      const t = (((d.getHours() + 4) % 24) * 60 + d.getMinutes()) / 600;
      const x = Math.round(10 + t * (f.ancho - 20));
      const y = Math.round(alto - 10 - (alto - 20) * Math.sin(Math.PI * t));
      dibujarLuna(ctx, x, y, faseLunar(d));
    }
    if (noche !== nocheActual) {
      nocheActual = noche;
      for (const p of personajes.values()) p.refrescar();
    }
  };
  tic();
  setInterval(tic, 700);
}

// Luz de pantalla (de noche): elipse en 3 escalones de intensidad, en pixeles
// nativos, que se suma con mix-blend-mode: screen.
const BRILLO = { w: 27, h: 21 };
const BRILLO_URL = (() => {
  const c = document.createElement('canvas');
  c.width = BRILLO.w; c.height = BRILLO.h;
  const ctx = c.getContext('2d');
  const [r, g, b] = hexARgb(C.celeste);
  for (let y = 0; y < BRILLO.h; y++) {
    for (let x = 0; x < BRILLO.w; x++) {
      const d = Math.hypot((x - (BRILLO.w - 1) / 2) / (BRILLO.w / 2), (y - (BRILLO.h - 1) / 2) / (BRILLO.h / 2));
      const a = d < 0.35 ? 0.38 : d < 0.65 ? 0.22 : d < 1 ? 0.1 : 0;
      if (a) { ctx.fillStyle = `rgba(${r},${g},${b},${a})`; ctx.fillRect(x, y, 1, 1); }
    }
  }
  return c.toDataURL();
})();

// --- reloj de la pared ---
// Dígitos de 3x4 px. 0, 1 y 2 son los del sprite RELOJ del pack ("12:00");
// del 3 al 9 están dibujados para que combinen.
const DIGITOS = {
  0: ['###', '#.#', '#.#', '###'],
  1: ['##.', '.#.', '.#.', '###'],
  2: ['###', '.##', '#..', '###'],
  3: ['###', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#'],
  5: ['###', '##.', '..#', '###'],
  6: ['#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.'],
  8: ['###', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#'],
  E: ['###', '#..', '##.', '###'],
  N: ['#.#', '###', '###', '#.#'],
  V: ['#.#', '#.#', '#.#', '.#.'],
  I: ['###', '.#.', '.#.', '###'],
  O: ['###', '#.#', '#.#', '###'],
  R: ['##.', '#.#', '##.', '#.#'],
  C: ['###', '#..', '#..', '###'],
  T: ['###', '.#.', '.#.', '.#.'],
  A: ['.#.', '#.#', '###', '#.#'],
  D: ['##.', '#.#', '#.#', '##.'],
  M: ['#.#', '###', '###', '#.#'],
  ':': ['...', '#..', '...', '#..'],
  ' ': ['...', '...', '...', '...'],
};
function pintarTextoPixel(ctx, texto, x, y, color, columnas = null) {
  ctx.fillStyle = color;
  [...texto].forEach((letra, indice) => {
    const forma = DIGITOS[letra];
    if (!forma) return;
    const columna = columnas?.[indice] ?? indice * 4;
    forma.forEach((fila, py) => [...fila].forEach((pixel, px) => {
      if (pixel === '#') ctx.fillRect(x + columna + px, y + py, 1, 1);
    }));
  });
}

function pintarEstado(estado) {
  const etiquetas = { vivo: ['EN VIVO', '#38b764'], reconectando: ['RECONECTANDO', '#ffcd75'], demo: ['DEMO', '#73eff7'] };
  const [texto, color] = etiquetas[estado];
  els.connLed.classList.toggle('on', estado === 'vivo');
  els.connLed.classList.toggle('off', estado !== 'vivo');
  els.connLed.style.background = color;
  els.connLed.style.boxShadow = estado === 'vivo' ? `0 0 6px ${color}` : '';
  const canvas = els.connPixel;
  canvas.width = texto.length * 4 - 1;
  canvas.height = 4;
  canvas.style.width = px(canvas.width);
  canvas.style.height = px(4);
  canvas.setAttribute('aria-label', texto);
  pintarTextoPixel(canvas.getContext('2d'), texto, 0, 0, color);
}
pintarEstado('reconectando');

function dibujarCerrar(hover = false) {
  const canvas = els.cerrarFlotante.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 7, 7);
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(0, 0, 7, 7);
  ctx.fillStyle = hover ? '#ef7d57' : '#b13e53';
  for (let i = 1; i < 6; i++) { ctx.fillRect(i, i, 1, 1); ctx.fillRect(6 - i, i, 1, 1); }
}
els.cerrarFlotante.addEventListener('click', () => window.close());
els.cerrarFlotante.addEventListener('mouseenter', () => dibujarCerrar(true));
els.cerrarFlotante.addEventListener('mouseleave', () => dibujarCerrar(false));
dibujarCerrar();

// Hora real (24 h, sin parpadeo) encima del reloj de la pared.
function crearReloj() {
  const r = fondoInfo.reloj;
  if (!r) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'reloj';
  canvas.width = r.w;
  canvas.height = r.h;
  Object.assign(canvas.style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });
  els.luces.appendChild(canvas); // es una luz: no le aplica el filtro de la noche
  const ctx = canvas.getContext('2d');
  let pintada = '';
  const pintar = () => {
    const d = horaActual();
    const hhmm = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    if (hhmm === pintada) return;
    pintada = hhmm;
    ctx.fillStyle = r.marco;
    ctx.fillRect(0, 0, r.w, r.h);
    pintarTextoPixel(ctx, `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`, 0, 1, r.digito, [1, 5, 9, 11, 15]);
    canvas.title = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
  };
  pintar();
  setInterval(pintar, 1000);
}

// --- el jefe y su golfito: de vez en cuando, si nadie lo anda buscando ---
setInterval(() => {
  if (!hayJefe()) return; // sin jefe contratado no hay a quién mandar
  const boss = jefe();
  const golf = JUEGOS.find(j => j.jefe && !j.ocupado);
  if (!boss || !golf || boss.ocio || !boss.enSilla() || boss.pendientes > 0) return;
  if ([...personajes.values()].some(p => p.avisando || p.avisoEnCola) || Math.random() > 0.15) return;
  boss.irAJugar(golf);
}, CAFE_CADA_MS);

// --- descansos: café o un rato en los juegos ---
setInterval(() => {
  const todos = [...personajes.values()];
  if (todos.filter(p => p.ocio).length >= DESCANSANDO_MAX) return;
  const sinTrabajo = todos.filter(p => !p.meta.isBoss && p.puesto && p.estado === 'idle' && p.enSilla() && p.pendientes === 0);
  if (!sinTrabajo.length || Math.random() > CAFE_PROBABILIDAD) return;
  const quien = sinTrabajo[Math.floor(Math.random() * sinTrabajo.length)];
  const juegos = JUEGOS.filter(j => !j.ocupado && !j.jefe);
  const enCafe = todos.some(p => p.ocio === '☕'); // a la cafetera, uno a la vez
  if (juegos.length && (enCafe || Math.random() < 0.6)) quien.irAJugar(juegos[Math.floor(Math.random() * juegos.length)]);
  else if (!enCafe) quien.irPorCafe();
}, CAFE_CADA_MS);

// --- jefe ---
function jefe() { return personaje(JEFE); }
// Sin jefe en la oficina nadie visita ni va a reportarle.
function hayJefe() { return personajes.has(JEFE) && personajes.get(JEFE).estado !== 'gone'; }

// El jefe va (por el mapa) a donde está el agente, le dice algo y regresa.
function visitar({ agent, emoji, text, durationMs = 3000 }) {
  if (!hayJefe()) return;
  const boss = jefe();
  boss.hacer(async () => {
    const p = personajes.get(agent);
    const lejos = p && p !== boss && p.estado !== 'gone';
    if (lejos) {
      // no sale mientras alguien viene a avisarle, y al agente lo busca en
      // su lugar y después de que le haya avisado
      await esperarHasta(() => ![...personajes.values()].some(q => q.avisando)
        && p.enSilla() && p.pendientes === 0, 30000);
      await boss.caminar(reservarCerca(JEFE, p.asiento()));
    }
    // mientras el jefe le habla, el globo de actividad del agente no estorba
    if (lejos) { p.visitado = true; p.refrescar(); }
    await boss.decir(emoji, text, durationMs);
    if (lejos) { p.visitado = false; p.refrescar(); }
    liberar(JEFE);
    if (lejos) await boss.volver();
  });
}

// "🧪 Probando · ERD-89", recortado a ACTIVIDAD_MAX caracteres
// Emoji en píxel: se dibuja chiquito, se le quitan los medios tonos y se
// agranda sin suavizar, para que los globos no desentonen con la oficina.
const EMOJI_PX = 9;
const emojisHechos = new Map();
function emojiPixel(emoji) {
  let url = emojisHechos.get(emoji);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = c.height = EMOJI_PX;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.font = `${EMOJI_PX - 1}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, EMOJI_PX / 2, EMOJI_PX / 2 + 0.5);
    const d = g.getImageData(0, 0, EMOJI_PX, EMOJI_PX);
    for (let i = 0; i < d.data.length; i += 4) {
      if (d.data[i + 3] < 100) { d.data[i + 3] = 0; continue; }
      d.data[i + 3] = 255;
      for (let k = 0; k < 3; k++) d.data[i + k] = Math.round(d.data[i + k] / 51) * 51; // pocos tonos
    }
    g.putImageData(d, 0, 0);
    url = c.toDataURL();
    emojisHechos.set(emoji, url);
  }
  return `<img class="emo-px" src="${url}" alt="${escapeHtml(emoji)}" draggable="false">`;
}

// Enciende o apaga la animación del juego que queda junto a ese lugar.
function usarJuego(lugar, cuanto) {
  for (const j of JUEGOS_ANIMADOS) {
    const cerca = lugar[0] > j.x - 12 && lugar[0] < j.x + j.w + 12 && lugar[1] > j.y && lugar[1] < j.y + j.h + 12;
    if (!cerca) continue;
    j.jugando = Math.max(0, j.jugando + cuanto);
    j.el.hidden = j.jugando === 0;
  }
}

// Lo que la escena trae además del fondo: tapas (pedazos de mueble o de
// división que tapan a quien pasa por detrás) y piezas animadas.
function montarEscena(escena) {
  for (const [x, y, w, h, z] of escena.tapas || []) {
    const t = document.createElement('div');
    t.className = 'frente';
    Object.assign(t.style, { left: px(x), top: px(y), width: px(w), height: px(h), zIndex: z });
    const m = document.createElement('img');
    m.src = `sprites/${fondoInfo.muebles}`;
    m.alt = '';
    Object.assign(m.style, { left: px(-x), top: px(-y), width: px(fondoInfo.ancho), height: px(fondoInfo.alto) });
    t.appendChild(m);
    els.agents.appendChild(t);
  }
  // Sillas de los puestos: pegadas al escritorio hasta que alguien toma el puesto.
  for (const p of escena.puestos || []) {
    if (!p.sillaSprite) continue;
    const [sx, sy, espejo] = p.silla;
    const silla = spriteImg(p.sillaSprite, espejo);
    silla.className += ' silla';
    Object.assign(silla.style, { left: px(espejo ? sx - SILLA_PEGADA : sx + SILLA_PEGADA), top: px(sy), zIndex: sy + 18 });
    els.agents.appendChild(silla);
    p.sillaEl = silla;
  }
  for (const a of escena.animados || []) {
    const d = document.createElement('div');
    d.className = 'hoja animado';
    d.style.backgroundImage = `url("sprites/${a.archivo}")`;
    d.style.setProperty('--fw', a.w);
    d.style.setProperty('--n', a.cuadros);
    d.style.setProperty('--dur', `${a.cuadros * a.ms}ms`);
    Object.assign(d.style, { left: px(a.x), top: px(a.y), width: px(a.w), height: px(a.h), zIndex: a.z });
    els.agents.appendChild(d);
    // Un juego está quieto (se ve el del fondo) hasta que alguien llega a usarlo.
    if (a.juego) { d.hidden = true; JUEGOS_ANIMADOS.push({ ...a, el: d, jugando: 0 }); }
  }
}

function textoActividad(act) {
  const t = Array.from(`${act.emoji} ${act.texto}${act.tarea ? ' · ' + act.tarea : ''}`);
  return t.length > ACTIVIDAD_MAX ? t.slice(0, ACTIVIDAD_MAX - 1).join('') + '…' : t.join('');
}

function aplicarActividad(msg) {
  if (msg.clave) actividades[msg.agent] = { emoji: msg.emoji, texto: msg.texto, tarea: msg.tarea };
  else delete actividades[msg.agent];
  personajes.get(msg.agent)?.refrescar();
  renderCounters();
}

// --- escape ---
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// --- procesar evento de la jornada ---
function handleEvent(ev, animar = true) {
  const clave = [ev.ts, ev.agent, ev.type, ev.verdict, ev.text].join('|');
  if (eventosVistos.has(clave)) return false;
  eventosVistos.add(clave);
  const ts = ev.ts ? new Date(ev.ts).getTime() : Date.now();
  const edad = Date.now() - ts;
  const eventoReciente = Number.isFinite(ts) && edad >= 0 && edad < 2 * 60 * 1000;
  eventLog.push(ev);
  if (eventLog.length > 100) eventLog.shift();

  // actualizar contadores
  const k = ev.agent || '?';
  counters[k] = counters[k] || { asignada: 0, aprobada: 0, rechazada: 0 };
  if (ev.type === 'asignada') counters[k].asignada++;
  if (ev.type === 'revision' && ev.verdict === 'aprobada') counters[k].aprobada++;
  if (ev.type === 'revision' && ev.verdict === 'rechazada') counters[k].rechazada++;

  // el historial al abrir la página solo cuenta, no se anima
  if (!animar || !eventoReciente || !personajes.has(ev.agent)) return true;

  if (ev.type === 'asignada') {
    personajes.get(ev.agent).reportePendiente = null;
    visitar({ agent: ev.agent, emoji: '📋', text: ev.text });
  } else if (ev.type === 'reporte') {
    // el agente camina a avisarle al jefe
    const p = personajes.get(ev.agent);
    p.reportePendiente = { emoji: ev.emoji || '🚀', text: ev.text };
    if (!p.meta.isBoss) p.avisar();
  } else if (ev.type === 'revision') {
    if (ev.verdict === 'aprobada') {
      visitar({ agent: ev.agent, emoji: ev.emoji || '👍', text: ev.text });
    } else if (ev.verdict === 'rechazada') {
      visitar({ agent: ev.agent, emoji: ev.emoji || '😠', text: ev.text, durationMs: 3500 });
    }
  }
  return true;
}

function crearMensaje(ev) {
  const li = document.createElement('li');
  if (ev.type === 'revision' && ev.verdict) li.classList.add(ev.verdict === 'aprobada' ? 'approved' : 'rejected');
  const t = ev.ts ? new Date(ev.ts) : new Date();
  const hora = document.createElement('time');
  hora.textContent = t.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  const meta = personajes.get(ev.agent)?.meta || AGENT_META[ev.agent] || { sprite: 'CHAR5' };
  const sprite = sprites[meta.sprite] || sprites.CHAR5;
  avatar.style.backgroundImage = `url("sprites/${sprite.archivo}")`;
  avatar.style.backgroundSize = `${sprite.w * 2}px ${sprite.h * 2}px`;
  const who = document.createElement('span');
  who.className = 'who'; who.textContent = nombreDe(ev.agent || '?');
  const emoji = document.createElement('span');
  emoji.className = 'emo'; emoji.textContent = ev.emoji || defaultEmoji(ev);
  const text = document.createElement('span');
  text.className = 'txt'; text.textContent = ev.text || '';
  li.append(hora, avatar, who, emoji, text);
  return li;
}

function renderEventList() {
  els.eventList.replaceChildren(...eventLog.map(crearMensaje));
  els.eventList.scrollTop = els.eventList.scrollHeight;
}

function agregarMensaje(ev) {
  const alFondo = els.eventList.scrollHeight - els.eventList.scrollTop - els.eventList.clientHeight < 36;
  els.eventList.appendChild(crearMensaje(ev));
  while (els.eventList.children.length > 100) els.eventList.firstElementChild.remove();
  if (alFondo) {
    els.eventList.scrollTop = els.eventList.scrollHeight;
    mensajesPendientes = 0;
    els.nuevosEventos.hidden = true;
  } else {
    mensajesPendientes++;
    els.nuevosEventos.querySelector('span').textContent = mensajesPendientes;
    els.nuevosEventos.hidden = false;
  }
}

els.nuevosEventos.addEventListener('click', () => {
  els.eventList.scrollTop = els.eventList.scrollHeight;
  mensajesPendientes = 0;
  els.nuevosEventos.hidden = true;
});
els.eventList.addEventListener('scroll', () => {
  if (els.eventList.scrollHeight - els.eventList.scrollTop - els.eventList.clientHeight < 36) {
    mensajesPendientes = 0;
    els.nuevosEventos.hidden = true;
  }
});

function defaultEmoji(ev) {
  if (ev.type === 'asignada') return '📋';
  if (ev.type === 'reporte') return '🚀';
  if (ev.type === 'revision') return ev.verdict === 'aprobada' ? '👍' : '😠';
  return '·';
}

function renderCounters() {
  const order = Object.keys(AGENT_META);
  els.counters.innerHTML = '';
  for (const k of order) {
    const c = counters[k] || { asignada: 0, aprobada: 0, rechazada: 0 };
    const div = document.createElement('div');
    div.className = 'counter';
    div.innerHTML = `
      <span class="name">${escapeHtml(nombreDe(k))}</span>
      <span class="nums">
        <span class="num assigned">📋${c.asignada}</span>
        <span class="num ok">👍${c.aprobada}</span>
        <span class="num bad">😠${c.rechazada}</span>
      </span>
      ${actividades[k] ? `<span class="act">${escapeHtml(textoActividad(actividades[k]))}</span>` : ''}`;
    els.counters.appendChild(div);
  }
}

// --- conexión con Orquest ---
// La fuente avisa con los mismos mensajes que allá llegaban por SSE.
function connect() {
  pintarEstado(esDemo ? 'demo' : 'vivo');
  window.OFICINA.fuente.suscribir((msg) => {
    if (msg.type === 'agents') {
      currentAgents = msg.agents;
      renderAgents();
    } else if (msg.type === 'evento') {
      if (handleEvent(msg.evento)) {
        agregarMensaje(msg.evento);
        renderCounters();
      }
    } else if (msg.type === 'actividad') {
      aplicarActividad(msg);
    }
  });
}

// --- bootstrap: carga sprites, pide estado inicial + conecta SSE ---
async function bootstrap() {
  try {
    // Dentro de la app los datos ya vienen cargados; suelta en el navegador se piden.
    const datos = window.OFICINA.datos;
    const info = datos?.sprites ?? await (await fetch('sprites/sprites.json')).json();
    const escena = datos?.escena ?? await (await fetch('escena/escena.json')).json();
    sprites = { ...info.sprites, ...escena.sprites };
    fondoInfo = escena.fondo;
    mapa = datos?.mapa ?? await (await fetch('escena/mapa.json')).json();
    ESCENA = { w: escena.ancho, h: escena.alto };
    PUESTOS[JEFE] = escena.jefe;
    PUESTOS_LIBRES = escena.puestos.slice();
    CAFETERA = escena.cafetera;
    JUEGOS = escena.juegos || [];
    SALIDA = escena.salida || null;
    els.vista.style.setProperty('--w', ESCENA.w);
    els.vista.style.setProperty('--h', ESCENA.h);
    $('scene').src = `sprites/${fondoInfo.archivo}`;
    ajustarEscala();
    montarEscena(escena);
  } catch (e) {
    console.error('no se pudo cargar la escena (assets/herdr-oficina/escena; se arma con herramientas/armar_oficina.py)', e);
    return;
  }
  crearMascotas();
  crearReloj();
  iniciarDia();
  // En la demo el jefe siempre está; en la app, solo si lo contrataron.
  if (!window.OFICINA.jefeReal) jefe();
  try {
    const state = await window.OFICINA.fuente.estado();
    esDemo = Boolean(state.demo);
    pintarEstado(esDemo ? 'demo' : 'reconectando');
    currentAgents = state.agents || [];
    for (const a of Object.values(state.actividades || {})) actividades[a.agent] = a;
    renderAgents(false);
    for (const ev of (state.eventos || [])) handleEvent(ev, false);
    renderEventList();
    renderCounters();
  } catch (e) {
    console.warn('no se pudo cargar estado inicial', e);
  }
  connect();
}

bootstrap();

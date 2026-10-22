// Oficina de píxel dentro de la app: los datos son los del estudio real.
// El panel (components/PixelOffice.vue) manda por postMessage lo que traduce
// core/officefeed.ts, y aquí se le da a app.js la forma que espera
// (`window.OFICINA`, la misma que arma demo.js). De regreso solo va a quién
// se le hizo clic.
import sprites from '../../../assets/herdr-oficina/sprites/sprites.json'
import escena from '../../../assets/herdr-oficina/escena/escena.json'
import mapa from '../../../assets/herdr-oficina/escena/mapa.json'

const JEFE = 'jefe'
// El personaje de cada quien lo decide el panel (el del jefe lo elige el usuario al contratarlo).
const agentes = { [JEFE]: { nombre: 'Jefe', sprite: 'CHAR3', role: 'Jefe', model: '', isBoss: true } }

const oyentes = new Set()
const avisar = (msg) => oyentes.forEach((fn) => fn(msg))
const seq = {} // cambia cada vez que alguien cambia de estado
const estadoDe = {}
let agents = []
let actividades = {}

function recibirEstado({ people, activities, sprites = {} }) {
  for (const p of people) {
    agentes[p.id] ??= { isBoss: p.isBoss }
    Object.assign(agentes[p.id], { nombre: p.name, role: p.role, model: p.model || p.provider, sprite: sprites[p.id] || agentes[p.id].sprite || 'CHAR1', ocupado: !!p.busy })
    if (estadoDe[p.id] !== p.status) {
      estadoDe[p.id] = p.status
      seq[p.id] = (seq[p.id] || 0) + 1
    }
  }
  for (const id of Object.keys(estadoDe)) if (!people.some((p) => p.id === id)) delete estadoDe[id]
  agents = people.map((p) => ({ agent: p.id, name: p.name, agent_status: p.status, pane_id: p.id, terminal_title: '', state_change_seq: seq[p.id] }))
  avisar({ type: 'agents', agents })

  const nuevas = {}
  for (const [agent, a] of Object.entries(activities)) nuevas[agent] = { agent, emoji: a.emoji, texto: a.text, tarea: a.task }
  for (const agent of new Set([...Object.keys(actividades), ...Object.keys(nuevas)])) {
    const antes = actividades[agent], ahora = nuevas[agent]
    if (antes?.tarea === ahora?.tarea && antes?.texto === ahora?.texto) continue
    avisar(ahora ? { type: 'actividad', agent, clave: ahora.tarea, emoji: ahora.emoji, texto: ahora.texto, tarea: ahora.tarea } : { type: 'actividad', agent, clave: null })
  }
  actividades = nuevas
}

// Zoom sobre la vista de entrada: 1 = la oficina llenando su marco.
let zoom = 1
// En el celular (?fuente=movil) la oficina va en un WebView: de ida y vuelta los mensajes pasan por
// ReactNativeWebView, no por el marco del panel. Ahí llena el alto y se recorre a lo ancho.
const movil = new URLSearchParams(location.search).get('fuente') === 'movil'
if (movil) document.documentElement.classList.add('movil')
const alPanel = (msg) =>
  movil ? window.ReactNativeWebView?.postMessage(JSON.stringify({ orquest: 'oficina', ...msg })) : window.parent.postMessage({ orquest: 'oficina', ...msg }, '*')

// El panel avisa si la oficina está enfocada. Sin foco, la rueda y el botón de en medio son del lienzo:
// se los devolvemos al panel para que recorra o arrastre como si el cursor estuviera sobre el fondo.
let enfocada = false
// Con el botón de en medio ya bajado dentro del iframe, el navegador le sigue mandando los movimientos hasta soltarlo.
let arrastrando = false
window.addEventListener('wheel', (e) => {
  if (movil || enfocada) return
  e.preventDefault()
  alPanel({ type: 'rueda', deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, x: e.clientX, y: e.clientY })
}, { passive: false })
window.addEventListener('pointerdown', (e) => {
  if (movil) return
  if (e.button === 1) {
    if (enfocada) return
    e.preventDefault()
    arrastrando = true
    alPanel({ type: 'arrastre', x: e.clientX, y: e.clientY })
    return
  }
  // Cualquier otro botón es un clic de la oficina: solo se avisa al panel para que la traiga al frente.
  alPanel({ type: 'toque' })
}, { passive: false })
window.addEventListener('pointermove', (e) => {
  if (!arrastrando) return
  alPanel({ type: 'arrastre-mueve', x: e.clientX, y: e.clientY })
}, { passive: false })
const soltar = (e) => {
  if (!arrastrando) return
  arrastrando = false
  alPanel({ type: 'arrastre-fin', x: e.clientX, y: e.clientY })
}
window.addEventListener('pointerup', soltar, { passive: false })
window.addEventListener('pointercancel', soltar, { passive: false })

// Cambia el zoom (de 1 a 4) y avisa la escala; app.js vuelve a medir al avisarle del cambio de tamaño.
// Con `ancla` (un punto de la pantalla), ese punto de la oficina se queda bajo el dedo.
function ponerZoom(nuevo, ancla) {
  nuevo = Math.min(4, Math.max(1, Math.round(nuevo * 100) / 100))
  if (nuevo === zoom) return
  // Lo que se recorre es el <main> de la oficina, no la página.
  const raiz = document.querySelector('main') ?? document.scrollingElement
  const caja = raiz.getBoundingClientRect()
  const ax = ancla ? ancla.x - caja.left : 0
  const ay = ancla ? ancla.y - caja.top : 0
  const fx = (raiz.scrollLeft + ax) / raiz.scrollWidth
  const fy = (raiz.scrollTop + ay) / raiz.scrollHeight
  zoom = nuevo
  window.OFICINA.zoom = zoom
  window.dispatchEvent(new Event('resize'))
  if (ancla) raiz.scrollTo(fx * raiz.scrollWidth - ax, fy * raiz.scrollHeight - ay)
  alPanel({ type: 'escala', escala: zoom })
}

// En el celular se pellizca con dos dedos; con uno, la página se recorre sola. El zoom se aplica
// a lo más una vez por cuadro: app.js vuelve a dibujar la oficina a la nueva escala.
if (movil) {
  let pellizco = null
  let cuadro = 0
  const medir = (t) => ({ d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 })
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return
    const m = medir(e.touches)
    pellizco = { d0: m.d || 1, z0: zoom, m }
  }, { passive: true })
  window.addEventListener('touchmove', (e) => {
    if (!pellizco || e.touches.length !== 2) return
    e.preventDefault()
    pellizco.m = medir(e.touches)
    if (cuadro) return
    cuadro = requestAnimationFrame(() => {
      cuadro = 0
      if (pellizco) ponerZoom(pellizco.z0 * (pellizco.m.d / pellizco.d0), pellizco.m)
    })
  }, { passive: false })
  const fin = (e) => {
    if (e.touches.length < 2) pellizco = null
  }
  window.addEventListener('touchend', fin)
  window.addEventListener('touchcancel', fin)
}

// El primer estado llega antes de que arranque la oficina: así nace con quien ya está.
const primero = new Promise((listo) => {
  window.addEventListener('message', (e) => {
    // Del celular llegan sin origen (los inyecta la app); del panel, de su marco.
    if ((!movil && e.source !== window.parent) || e.data?.orquest !== 'oficina') return
    if (e.data.type === 'estado') {
      recibirEstado(e.data)
      listo()
    } else if (e.data.type === 'zoom') {
      // Los botones: un cuarto más o menos, sobre el centro de la pantalla.
      ponerZoom(zoom + e.data.delta, { x: innerWidth / 2, y: innerHeight / 2 })
    } else if (e.data.type === 'evento') {
      const { at, agent, type, text, emoji, verdict } = e.data.evento
      avisar({ type: 'evento', evento: { ts: new Date(at).toISOString(), agent, type, text, emoji, verdict } })
    } else if (e.data.type === 'enfocada') {
      enfocada = !!e.data.valor
    }
  })
})

document.documentElement.classList.add('en-app')
window.OFICINA = {
  agentes,
  /** El jefe solo está si lo contrataron: sin él, la oficina se ve sin jefe. */
  jefeReal: true,
  datos: { sprites, escena, mapa },
  fuente: {
    estado: async () => ({ agents, eventos: [], demo: false, actividades }),
    suscribir: (fn) => {
      oyentes.add(fn)
      return () => oyentes.delete(fn)
    },
  },
  alElegir: (agent) => alPanel({ type: 'elegir', agent }),
}
alPanel({ type: 'listo' })
await primero

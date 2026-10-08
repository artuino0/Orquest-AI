// Oficina de píxel dentro de la app: los datos son los del estudio real.
// El panel (components/PixelOffice.vue) manda por postMessage lo que traduce
// core/officefeed.ts, y aquí se le da a app.js la forma que espera
// (`window.OFICINA`, la misma que arma demo.js). De regreso solo va a quién
// se le hizo clic.
import sprites from '../../../assets/herdr-oficina/sprites/sprites.json'
import escena from '../../../assets/herdr-oficina/escena/escena.json'
import mapa from '../../../assets/herdr-oficina/escena/mapa.json'

const JEFE = 'jefe'
// Un personaje del pack por empleado, en el orden en que llegan. El 3 es del jefe.
const CUERPOS = ['CHAR4', 'CHAR2', 'CHAR1', 'CHAR5', 'CHAR6', 'CHAR7', 'CHAR8']
const agentes = { [JEFE]: { nombre: 'Jefe', sprite: 'CHAR3', role: 'Jefe', model: '', isBoss: true } }
let llegados = 0

const oyentes = new Set()
const avisar = (msg) => oyentes.forEach((fn) => fn(msg))
const seq = {} // cambia cada vez que alguien cambia de estado
const estadoDe = {}
let agents = []
let actividades = {}

function recibirEstado({ people, activities }) {
  for (const p of people) {
    agentes[p.id] ??= { sprite: p.isBoss ? 'CHAR3' : CUERPOS[llegados++ % CUERPOS.length], isBoss: p.isBoss }
    Object.assign(agentes[p.id], { nombre: p.name, role: p.role, model: p.model || p.provider })
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

const alPanel = (msg) => window.parent.postMessage({ orquest: 'oficina', ...msg }, '*')

// El primer estado llega antes de que arranque la oficina: así nace con quien ya está.
const primero = new Promise((listo) => {
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || e.data?.orquest !== 'oficina') return
    if (e.data.type === 'estado') {
      recibirEstado(e.data)
      listo()
    } else if (e.data.type === 'evento') {
      const { at, agent, type, text, emoji, verdict } = e.data.evento
      avisar({ type: 'evento', evento: { ts: new Date(at).toISOString(), agent, type, text, emoji, verdict } })
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

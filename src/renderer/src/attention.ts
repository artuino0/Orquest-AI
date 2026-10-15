/**
 * Avisos de «te toca»: un sonido corto y, si la ventana no está al frente, el
 * parpadeo en la barra de tareas. Suenan cuando aparece algo que espera al
 * usuario: una entrega lista para integrar, una pregunta del jefe, la versión
 * de alguien levantada para revisión, alguien detenido que te necesita, o alguien cuya
 * CLI dice que no puede trabajar (su modelo no existe o no tiene saldo).
 *
 * El sonido se arma aquí mismo (dos notas), sin archivos de audio.
 */
import { watch } from 'vue'
import { useStudio } from './stores/studio'

let audio: AudioContext | undefined

/** Dos notas cortas, de abajo hacia arriba. */
export function chime() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
    const start = audio.currentTime
    for (const [i, freq] of [880, 1318.5].entries()) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      const at = start + i * 0.13
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22)
      osc.connect(gain).connect(audio.destination)
      osc.start(at)
      osc.stop(at + 0.25)
    }
  } catch {
    // Sin audio no pasa nada: queda el parpadeo y el aviso en pantalla.
  }
}

/** Varias cosas que llegan juntas suenan una sola vez. */
const QUIET_MS = 4000
let lastAt = 0
function notify() {
  if (Date.now() - lastAt < QUIET_MS) return
  lastAt = Date.now()
  chime()
  void window.orquest.attention()
}

/** Cuánto debe llevar alguien detenido para avisar: el jefe puede autorizarle el permiso antes. */
const BLOCKED_MS = 3000

/** Vigila el estudio y avisa cuando sube algo de lo que espera al usuario. */
export function watchAttention() {
  const studio = useStudio()
  const counts = () => ({
    inbox: studio.inbox.length,
    questions: studio.board?.questions?.filter((q) => q.status === 'open').length ?? 0,
    reviews: studio.board?.reviews?.filter((r) => r.status === 'ready').length ?? 0,
    problems: studio.employees.filter((e) => e.problem).length,
  })
  watch(counts, (now, before) => {
    // Al abrir un proyecto no se avisa de lo que ya estaba.
    if (!before || studio.repo !== project) return
    if (now.inbox > before.inbox || now.questions > before.questions || now.reviews > before.reviews || now.problems > before.problems) notify()
  })
  let project = studio.repo
  watch(() => studio.repo, (r) => (project = r))

  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  watch(
    () => studio.employees.map((e) => `${e.id}:${e.state}`).join(),
    () => {
      for (const e of studio.employees) {
        if (e.state === 'blocked' && !timers.has(e.id)) {
          timers.set(e.id, setTimeout(() => {
            timers.delete(e.id)
            if (studio.employees.find((x) => x.id === e.id)?.state === 'blocked') notify()
          }, BLOCKED_MS))
        } else if (e.state !== 'blocked' && timers.has(e.id)) {
          clearTimeout(timers.get(e.id))
          timers.delete(e.id)
        }
      }
    },
  )
}

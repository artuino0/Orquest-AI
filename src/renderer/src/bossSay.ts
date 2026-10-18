/**
 * Hablarle al jefe y detenerlo: lo comparten su panel y la barra rápida de
 * abajo del lienzo. El texto es el mismo borrador en los dos (lo que empiezas
 * en uno sigue en el otro) y la mano de detener sale en ambos mientras trabaja
 * o unos segundos después de mandarle algo.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { T } from '../../core/i18n'
import { useStudio } from './stores/studio'

/** Cuándo le mandaste algo por última vez, desde cualquiera de las dos cajas. */
const sentAt = ref(0)
const stopping = ref(false)
/** Cuánto después de mandarle algo todavía tiene sentido detenerlo. */
const STOP_WINDOW_MS = 8000

export function useBossSay() {
  const studio = useStudio()
  // Lo escrito se conserva al irse a otra pantalla y volver.
  const message = studio.draft('jefe')
  const now = ref(Date.now())
  let clock: ReturnType<typeof setInterval> | undefined
  onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 1000)))
  onBeforeUnmount(() => clearInterval(clock))
  const boss = computed(() => studio.employees.find((e) => e.id === 'jefe'))
  const canStop = computed(() => !!boss.value && (studio.calmStateOf(boss.value) === 'working' || now.value - sentAt.value < STOP_WINDOW_MS))

  async function send(): Promise<boolean> {
    const text = message.value.trim()
    if (!text) return false
    if (!(await studio.sayToBoss(text))) return false
    message.value = ''
    sentAt.value = now.value = Date.now()
    return true
  }

  /** Lo detiene; si recién le mandaste algo, tu mensaje vuelve a la caja para corregirlo. */
  async function stop() {
    stopping.value = true
    let r: { restored?: string } = {}
    if (await studio.attempt(async () => (r = await window.orquest.stopBoss()))) {
      if (r.restored && !message.value.trim()) message.value = r.restored
      studio.notice(r.restored ? T`Detenido. Tu mensaje volvió a la caja para que lo corrijas.` : T`Detenido.`)
    }
    stopping.value = false
  }

  return { message, canStop, stopping, send, stop }
}

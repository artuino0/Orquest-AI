<script setup lang="ts">
/**
 * La oficina de píxel con la gente del estudio. La oficina es una página
 * aparte (oficina.html) que solo dibuja; aquí se le manda quién está, en qué
 * anda y qué va pasando con las tareas, ya traducido por core/officefeed.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { officeEvents, officeState } from '../../../core/officefeed'
import type { Task } from '../../../shared/ipc'
import { useStudio } from '../stores/studio'

const studio = useStudio()
const frame = ref<HTMLIFrameElement>()
/** La oficina avisa cuando ya puede recibir. */
let ready = false
/** Tareas de la foto anterior, para saber qué cambió; null hasta ver la primera. */
let before: Task[] | null = null

const send = (msg: object) => frame.value?.contentWindow?.postMessage({ orquest: 'oficina', ...msg }, '*')

function sendState() {
  if (!ready) return
  const state = officeState({
    employees: studio.employees,
    names: Object.fromEntries(studio.employees.map((e) => [e.id, studio.nameOf(e.id)])),
    tasks: studio.board?.tasks ?? [],
    hints: studio.board?.hints ?? {},
  })
  send({ type: 'estado', ...state })
}

function sendEvents() {
  const tasks = studio.board?.tasks
  if (!tasks) return
  // Copia: la siguiente foto se compara contra esta, no contra algo que cambie por debajo.
  const now = JSON.parse(JSON.stringify(tasks)) as Task[]
  if (ready) for (const evento of officeEvents(before, now, Date.now())) send({ type: 'evento', evento })
  before = now
}

function onMessage(e: MessageEvent) {
  if (e.source !== frame.value?.contentWindow || e.data?.orquest !== 'oficina') return
  if (e.data.type === 'listo') {
    ready = true
    sendState()
  } else if (e.data.type === 'elegir' && typeof e.data.agent === 'string') {
    if (studio.employees.some((x) => x.id === e.data.agent)) studio.select(e.data.agent)
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  sendEvents()
})
onBeforeUnmount(() => window.removeEventListener('message', onMessage))

watch(() => studio.board?.tasks, sendEvents, { deep: true })
watch(
  () => [studio.employees.map((e) => `${e.id}:${e.state}:${studio.nameOf(e.id)}`).join(), JSON.stringify(studio.board?.hints), JSON.stringify(studio.board?.tasks.map((t) => [t.id, t.status, t.assignee]))],
  sendState,
)
</script>

<template>
  <iframe ref="frame" class="pixel-office" src="oficina.html?fuente=app" title="Oficina" />
</template>

<style scoped>
.pixel-office { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; }
</style>

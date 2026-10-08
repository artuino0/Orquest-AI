<script setup lang="ts">
/**
 * La oficina de píxel con la gente del estudio. La oficina es una página
 * aparte (oficina.html) que solo dibuja; aquí se le manda quién está, en qué
 * anda y qué va pasando con las tareas, ya traducido por core/officefeed.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Minus, Plus } from 'lucide-vue-next'
import { officeEvents, officeState } from '../../../core/officefeed'
import type { Task } from '../../../shared/ipc'
import { useStudio } from '../stores/studio'

const studio = useStudio()
const frame = ref<HTMLIFrameElement>()
/** La oficina avisa cuando ya puede recibir. */
let ready = false
/** A cuántas veces su tamaño se está viendo la oficina. */
const scale = ref(1)
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
  } else if (e.data.type === 'escala') {
    scale.value = Number(e.data.escala) || 1
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
  <div class="pixel-office">
    <iframe ref="frame" src="oficina.html?fuente=app" title="Oficina" />
    <div class="zoom">
      <button title="Alejar" @click="send({ type: 'zoom', delta: -0.5 })"><Minus /></button>
      <span>{{ scale }}×</span>
      <button title="Acercar" @click="send({ type: 'zoom', delta: 0.5 })"><Plus /></button>
    </div>
  </div>
</template>

<style scoped>
.pixel-office { position: absolute; inset: 0; }
iframe { width: 100%; height: 100%; border: 0; background: transparent; display: block; }
.zoom { position: absolute; right: 14px; bottom: 14px; display: flex; align-items: center; background: var(--surface); border: 3px solid var(--border); box-shadow: 3px 3px 0 var(--shadow); }
.zoom button { border: 0; background: none; padding: 6px 10px; display: grid; color: var(--text-primary); }
.zoom svg { width: 12px; height: 12px; }
.zoom span { min-width: 34px; text-align: center; font: 700 11px var(--font); border-inline: 2px solid var(--border); padding: 6px 4px; }
</style>

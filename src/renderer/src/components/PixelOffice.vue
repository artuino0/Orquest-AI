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
import { useCanvas } from '../stores/canvas'
import { getLang, T } from '../../../core/i18n'
import { spriteName } from '../characters'

const studio = useStudio()
const canvas = useCanvas()
const frame = ref<HTMLIFrameElement>()
/** La oficina avisa cuando ya puede recibir. */
let ready = false
/** Zoom sobre la vista de entrada: 1× es la oficina llenando su marco. */
const scale = ref(1)
/** Tareas de la foto anterior, para saber qué cambió; null hasta ver la primera. */
let before: Task[] | null = null

const send = (msg: Record<string, unknown>) => {
  frame.value?.contentWindow?.postMessage({ orquest: 'oficina', ...msg }, '*')
  // El celular ve la misma oficina: la compu guarda lo último que se le mandó (ver core/officeshare).
  const root = studio.board?.repo
  if (root && (msg.type === 'estado' || msg.type === 'evento')) void window.orquest.officeFeed(root, JSON.parse(JSON.stringify(msg))).catch(() => {})
}

function sendState() {
  if (!ready) return
  const state = officeState({
    // Quien no puede trabajar (su CLI lo dijo) sale con el aviso de que te necesita.
    employees: studio.employees.map((e) => (e.problem ? { ...e, state: studio.calmStateOf(e) } : e)),
    names: Object.fromEntries(studio.employees.map((e) => [e.id, studio.nameOf(e.id)])),
    tasks: studio.board?.tasks ?? [],
    hints: studio.board?.hints ?? {},
  })
  // Cada quien con su personaje: el del jefe lo eligió el usuario.
  const sprites = Object.fromEntries(state.people.map((p) => [p.id, spriteName(studio.characterOf(p.id))]))
  send({ type: 'estado', ...state, sprites })
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
    sendFocus()
  } else if (e.data.type === 'escala') {
    scale.value = Number(e.data.escala) || 1
  } else if (e.data.type === 'elegir' && typeof e.data.agent === 'string') {
    if (studio.employees.some((x) => x.id === e.data.agent)) studio.select(e.data.agent)
  } else if (e.data.type === 'rueda' && frame.value) {
    // La oficina no está enfocada: la rueda es del lienzo. Se la devolvemos como si naciera en el iframe.
    const p = framePoint(Number(e.data.x) || 0, Number(e.data.y) || 0)
    frame.value.dispatchEvent(new WheelEvent('wheel', {
      deltaX: Number(e.data.deltaX) || 0, deltaY: Number(e.data.deltaY) || 0, deltaMode: Number(e.data.deltaMode) || 0,
      ctrlKey: !!e.data.ctrlKey, metaKey: !!e.data.metaKey, shiftKey: !!e.data.shiftKey,
      clientX: p.x, clientY: p.y, bubbles: true, cancelable: true,
    }))
  } else if (e.data.type === 'arrastre' && frame.value) {
    // Botón de en medio sobre la oficina no enfocada: el lienzo empieza a arrastrar desde ahí.
    const p = framePoint(Number(e.data.x) || 0, Number(e.data.y) || 0)
    frame.value.dispatchEvent(new PointerEvent('pointerdown', {
      button: 1, buttons: 4, pointerId: 1, pointerType: 'mouse', clientX: p.x, clientY: p.y, bubbles: true, cancelable: true,
    }))
  } else if (e.data.type === 'arrastre-mueve' && frame.value) {
    // El botón de en medio sigue dentro de la oficina: se le reenvía el movimiento al lienzo que ya arrastra.
    const p = framePoint(Number(e.data.x) || 0, Number(e.data.y) || 0)
    frame.value.dispatchEvent(new PointerEvent('pointermove', {
      button: 1, buttons: 4, pointerId: 1, pointerType: 'mouse', clientX: p.x, clientY: p.y, bubbles: true, cancelable: true,
    }))
  } else if (e.data.type === 'arrastre-fin' && frame.value) {
    const p = framePoint(Number(e.data.x) || 0, Number(e.data.y) || 0)
    frame.value.dispatchEvent(new PointerEvent('pointerup', {
      button: 1, buttons: 0, pointerId: 1, pointerType: 'mouse', clientX: p.x, clientY: p.y, bubbles: true, cancelable: true,
    }))
  } else if (e.data.type === 'toque') {
    // Un clic dentro de la oficina cae en el iframe: el lienzo no se entera, así que ella misma lo trae al frente.
    canvas.front('office')
  }
}

/** La oficina cede la rueda y el botón de en medio al lienzo mientras su panel no esté enfocado. */
function sendFocus() {
  if (!ready) return
  send({ type: 'enfocada', valor: canvas.active === 'office' })
}

/** Las coordenadas dentro del iframe al marco que lo contiene: el lienzo escala con `transform`. */
function framePoint(x: number, y: number) {
  const r = frame.value!.getBoundingClientRect()
  return { x: r.left + (x * r.width) / frame.value!.clientWidth, y: r.top + (y * r.height) / frame.value!.clientHeight }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  sendEvents()
})
onBeforeUnmount(() => window.removeEventListener('message', onMessage))

// Cuando la oficina gana o pierde el foco (clic en otro panel o en el fondo), cede o retoma la rueda.
watch(() => canvas.active, sendFocus)

watch(() => studio.board?.tasks, sendEvents, { deep: true })
watch(
  () => [studio.employees.map((e) => `${e.id}:${e.state}:${e.problem ?? ''}:${studio.nameOf(e.id)}`).join(), JSON.stringify(studio.board?.hints), JSON.stringify(studio.board?.tasks.map((t) => [t.id, t.status, t.assignee])), studio.bossCharacter],
  sendState,
)
</script>

<template>
  <div class="pixel-office">
    <iframe ref="frame" :src="`oficina.html?fuente=app&lang=${getLang()}`" :title="T`Oficina`" />
    <div class="zoom">
      <button :title="T`Alejar`" @click="send({ type: 'zoom', delta: -0.25 })"><Minus /></button>
      <span>{{ scale }}×</span>
      <button :title="T`Acercar`" @click="send({ type: 'zoom', delta: 0.25 })"><Plus /></button>
    </div>
  </div>
</template>

<style scoped>
.pixel-office { position: absolute; inset: 0; }
iframe { width: 100%; height: 100%; border: 0; background: transparent; display: block; }
.zoom { position: absolute; right: 14px; bottom: 14px; display: flex; align-items: center; background: var(--surface); border: 3px solid var(--border); box-shadow: 3px 3px 0 var(--shadow); }
.zoom button { border: 0; background: none; padding: 6px 10px; display: grid; color: var(--text-primary); }
.zoom svg { width: 12px; height: 12px; }
.zoom span { min-width: 44px; text-align: center; font: 700 11px var(--font); border-inline: 2px solid var(--border); padding: 6px 4px; }
</style>

<script setup lang="ts">
/**
 * Un panel del lienzo: encabezado para arrastrarlo (doble clic lo enfoca),
 * minimizar, enfocar y cerrar, y esquinas para cambiarle el tamaño. Lo de
 * adentro (la oficina, el jefe, alguien del equipo…) va en el slot.
 */
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref } from 'vue'
import { GripVertical, Maximize2, Minimize2, Minus, X } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import { IN_CANVAS } from '../canvas/inject'
import { HEADER_H, type Panel, type Rect } from '../canvas/layout'
import { useCanvas } from '../stores/canvas'

const props = defineProps<{ panel: Panel; rect?: Rect; hidden?: boolean; title: string; subtitle?: string; color?: string }>()
const canvas = useCanvas()

const head = reactive<{ title?: string; subtitle?: string }>({})
const guard: { canClose?: () => boolean } = {}
const el = ref<HTMLElement>()
const width = ref(props.panel.w)
provide(IN_CANVAS, { head, guard, width })

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => (width.value = entry.contentRect.width))
  if (el.value) observer.observe(el.value)
})
onBeforeUnmount(() => observer?.disconnect())

const focused = computed(() => !!props.rect)
const box = computed(() => {
  const r = props.rect ?? props.panel
  return { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: props.panel.min && !props.rect ? `${HEADER_H}px` : `${r.h}px`, zIndex: focused.value ? 100000 + props.panel.z : props.panel.z }
})

/** Arrastra con el puntero: mueve o cambia el tamaño, en unidades del plano (el zoom no cambia lo que se siente). */
function drag(ev: PointerEvent, apply: (dx: number, dy: number) => void) {
  if (ev.button !== 0 || focused.value) return
  ev.preventDefault()
  const start = { x: ev.clientX, y: ev.clientY }
  const zoom = canvas.camera.zoom
  canvas.busy = true
  const target = ev.currentTarget as HTMLElement
  target.setPointerCapture(ev.pointerId)
  const onMove = (e: PointerEvent) => apply((e.clientX - start.x) / zoom, (e.clientY - start.y) / zoom)
  const onUp = () => {
    target.removeEventListener('pointermove', onMove)
    target.removeEventListener('pointerup', onUp)
    target.removeEventListener('pointercancel', onUp)
    canvas.busy = false
    canvas.settle(props.panel.id)
  }
  target.addEventListener('pointermove', onMove)
  target.addEventListener('pointerup', onUp)
  target.addEventListener('pointercancel', onUp)
}
function moveStart(ev: PointerEvent) {
  if ((ev.target as HTMLElement).closest('button, select, input, a')) return
  const { x, y } = props.panel
  drag(ev, (dx, dy) => canvas.move(props.panel.id, Math.round(x + dx), Math.round(y + dy)))
}
function resizeStart(ev: PointerEvent, edge: 'x' | 'y' | 'xy') {
  const { w, h } = props.panel
  drag(ev, (dx, dy) => canvas.setSize(props.panel.id, edge === 'y' ? w : Math.round(w + dx), edge === 'x' ? h : Math.round(h + dy)))
}

function close() {
  if (guard.canClose && !guard.canClose()) return
  canvas.close(props.panel.id)
}
const title = computed(() => head.title || props.title)
const subtitle = computed(() => head.subtitle ?? props.subtitle)
</script>

<template>
  <section
    ref="el"
    class="cpanel"
    :class="{ active: canvas.active === panel.id, min: panel.min && !rect, focused, hidden }"
    :style="box"
    @pointerdown.capture="canvas.front(panel.id)"
  >
    <header @pointerdown="moveStart" @dblclick="($event.target as HTMLElement).closest('button') || canvas.focusOn(panel.id)">
      <GripVertical class="grip" />
      <i class="dot" :style="{ background: color ?? 'var(--accent)' }" />
      <h2>{{ title }}</h2>
      <span v-if="subtitle" class="sub">{{ subtitle }}</span>
      <span class="grow" />
      <slot name="head" />
      <button :title="panel.min ? T`Mostrar` : T`Minimizar`" @click="canvas.toggleMin(panel.id)"><Minus /></button>
      <button :title="focused ? T`Volver al lienzo (Esc)` : T`Enfocar: llena la vista (doble clic en el encabezado)`" @click="canvas.focusOn(panel.id)">
        <Minimize2 v-if="focused" /><Maximize2 v-else />
      </button>
      <button :title="T`Cerrar el panel (no despide a nadie)`" @click="close"><X /></button>
    </header>
    <div v-show="!panel.min || rect" class="content"><slot /></div>
    <template v-if="!panel.min && !rect">
      <i class="edge right" @pointerdown="resizeStart($event, 'x')" />
      <i class="edge bottom" @pointerdown="resizeStart($event, 'y')" />
      <i class="corner" :title="T`Arrastra para cambiar el tamaño`" @pointerdown="resizeStart($event, 'xy')" />
    </template>
  </section>
</template>

<style scoped>
.cpanel { position: absolute; display: flex; flex-direction: column; background: var(--surface); border: 3px solid var(--border); box-shadow: 4px 4px 0 var(--shadow); min-width: 0; }
.cpanel.active { border-color: color-mix(in srgb, var(--accent) 70%, var(--border)); }
.cpanel.focused { box-shadow: none; }
.cpanel.hidden { visibility: hidden; pointer-events: none; }
header { height: 30px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 4px 0 6px; background: var(--surface-2); border-bottom: 3px solid var(--border); cursor: grab; user-select: none; min-width: 0; }
.cpanel.min header { border-bottom: 0; }
.cpanel.focused header { cursor: default; }
header:active { cursor: grabbing; }
.grip { width: 14px; height: 14px; color: var(--text-secondary); flex: none; }
.dot { width: 9px; height: 9px; flex: none; }
h2 { margin: 0; font: 700 13px var(--font); white-space: nowrap; color: var(--text-primary); }
.sub { font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.grow { flex: 1; }
header button { width: 24px; height: 24px; display: grid; place-items: center; flex: none; padding: 0; background: none; border: 0; color: var(--text-secondary); cursor: pointer; }
header button:hover { color: var(--text-primary); background: var(--bg); }
header button svg { width: 14px; height: 14px; }
.content { flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column; overflow: hidden; }
.edge, .corner { position: absolute; z-index: 2; }
.edge.right { top: 0; right: -6px; width: 9px; height: 100%; cursor: ew-resize; }
.edge.bottom { left: 0; bottom: -6px; height: 9px; width: 100%; cursor: ns-resize; }
.corner { right: -6px; bottom: -6px; width: 16px; height: 16px; cursor: nwse-resize; }
.corner::after { content: ''; position: absolute; right: 7px; bottom: 7px; width: 8px; height: 8px; border-right: 3px solid var(--border-light); border-bottom: 3px solid var(--border-light); }
.cpanel.active .corner::after { border-color: var(--accent); }
</style>

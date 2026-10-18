<script setup lang="ts">
/** El minimapa: todos los paneles en chico y el rectángulo de lo que se ve. Un clic (o arrastrar) lleva la vista ahí. */
import { computed } from 'vue'
import { T } from '../../../core/i18n'
import { bounds, shapeOf, visibleRect } from '../canvas/layout'
import { useCanvas } from '../stores/canvas'

const canvas = useCanvas()
const W = 196
const H = 124
const PAD = 8

const map = computed(() => {
  const seen = visibleRect(canvas.camera, canvas.view)
  const all = bounds([...canvas.panels.map(shapeOf), seen])!
  const k = Math.min((W - PAD * 2) / all.w, (H - PAD * 2) / all.h)
  const ox = (W - all.w * k) / 2 - all.x * k
  const oy = (H - all.h * k) / 2 - all.y * k
  const box = (r: { x: number; y: number; w: number; h: number }) => ({ left: `${ox + r.x * k}px`, top: `${oy + r.y * k}px`, width: `${Math.max(2, r.w * k)}px`, height: `${Math.max(2, r.h * k)}px` })
  return { k, ox, oy, seen: box(seen), panels: canvas.panels.map((p) => ({ id: p.id, office: p.kind === 'office', active: canvas.active === p.id, style: box(shapeOf(p)) })) }
})

function go(ev: PointerEvent) {
  if (canvas.focus) return
  const el = ev.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const { k, ox, oy } = map.value
  const at = (e: PointerEvent) => canvas.centerOn({ x: (e.clientX - rect.left - ox) / k, y: (e.clientY - rect.top - oy) / k })
  at(ev)
  el.setPointerCapture(ev.pointerId)
  const stop = () => {
    el.removeEventListener('pointermove', at)
    el.removeEventListener('pointerup', stop)
  }
  el.addEventListener('pointermove', at)
  el.addEventListener('pointerup', stop)
}
</script>

<template>
  <div class="minimap" :title="T`Minimapa: un clic te lleva ahí`" :style="{ width: `${W}px`, height: `${H}px` }" @pointerdown.prevent="go">
    <i v-for="p in map.panels" :key="p.id" class="p" :class="{ office: p.office, active: p.active }" :style="p.style" />
    <i class="seen" :style="map.seen" />
  </div>
</template>

<style scoped>
.minimap { position: relative; overflow: hidden; background: color-mix(in srgb, var(--surface) 88%, transparent); border: 3px solid var(--border); box-shadow: 3px 3px 0 var(--shadow); cursor: pointer; }
.p { position: absolute; background: var(--surface-2); border: 1px solid var(--border-light); }
.p.office { background: color-mix(in srgb, var(--st-work) 70%, var(--surface-2)); }
.p.active { border-color: var(--accent); }
.seen { position: absolute; border: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
</style>

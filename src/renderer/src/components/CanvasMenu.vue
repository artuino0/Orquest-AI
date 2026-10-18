<script setup lang="ts">
/**
 * Menú del clic derecho en el fondo vacío: abrir un panel ahí, ordenar,
 * ver todo, y el fondo (escena, imagen tuya, atenuar, guías).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronRight, Grid2x2, ImagePlus, LayoutGrid, Maximize, Plus, RotateCcw, Square } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import { backdropUrl, type Backdrop } from '../canvas/backdrops'
import type { PanelKind, Point } from '../canvas/layout'
import { useCanvas } from '../stores/canvas'
import { useStudio } from '../stores/studio'

const props = defineProps<{ at: Point; world: Point }>()
const emit = defineEmits<{ close: [] }>()
const canvas = useCanvas()
const studio = useStudio()
const el = ref<HTMLElement>()
const sub = ref(false)
const file = ref<HTMLInputElement>()

const SCENES: [Backdrop, string][] = [
  ['plain', T`Liso`],
  ['city', T`Ciudad de noche`],
  ['forest', T`Bosque`],
  ['mountains', T`Montañas`],
  ['space', T`Espacio`],
]
const thumbs = ref<Record<string, string>>({})
onMounted(async () => {
  for (const [k] of SCENES) {
    const u = backdropUrl(k)
    if (u) thumbs.value = { ...thumbs.value, [k]: await u }
  }
})

/** Lo que se puede abrir: los paneles del proyecto y uno por persona. */
const kinds = computed<{ kind: PanelKind; ref?: string; label: string }[]>(() => [
  { kind: 'office', label: T`Oficina` },
  { kind: 'boss', label: T`Jefe` },
  ...studio.employees.filter((e) => e.id !== 'jefe').map((e) => ({ kind: 'employee' as const, ref: e.id, label: `${studio.nameOf(e.id)} · ${e.role}` })),
  { kind: 'hire', label: T`Plantilla` },
  { kind: 'board', label: T`Tablero` },
  { kind: 'inbox', label: T`Entregas` },
  { kind: 'plans', label: T`Planes` },
  { kind: 'library', label: T`Expedientes` },
  { kind: 'editor', label: T`Editor` },
  { kind: 'usage', label: T`Uso` },
  { kind: 'accounts', label: T`Cuentas` },
  { kind: 'mobile', label: T`Celular` },
])

function openHere(kind: PanelKind, ref?: string) {
  canvas.open(kind, ref, props.world)
  emit('close')
}
function act(fn: () => void) {
  fn()
  emit('close')
}
async function pick(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  if (f) await canvas.useImage(f).catch(() => studio.notice(T`No se pudo leer esa imagen.`))
  emit('close')
}

// Se acomoda dentro de la vista y se cierra al hacer clic fuera o con Esc.
const pos = computed(() => {
  const w = 280
  const h = 470
  return { left: `${Math.min(props.at.x, canvas.view.w - w - 8)}px`, top: `${Math.max(8, Math.min(props.at.y, canvas.view.h - h - 8))}px` }
})
const outside = (ev: PointerEvent) => !el.value?.contains(ev.target as Node) && emit('close')
const key = (ev: KeyboardEvent) => ev.key === 'Escape' && emit('close')
onMounted(() => {
  window.addEventListener('pointerdown', outside, true)
  window.addEventListener('keydown', key)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', outside, true)
  window.removeEventListener('keydown', key)
})
</script>

<template>
  <div ref="el" class="menu" :style="pos" @contextmenu.prevent>
    <p class="cap">{{ T`LIENZO` }} · {{ studio.repo?.split(/[\\/]/).filter(Boolean).pop() }}</p>
    <div class="item has-sub" @pointerenter="sub = true" @pointerleave="sub = false" @click="sub = !sub">
      <Plus />{{ T`Nuevo panel aquí` }}<span class="grow" /><ChevronRight />
      <div v-if="sub" class="sub">
        <button v-for="k in kinds" :key="k.kind + (k.ref ?? '')" class="item" @click.stop="openHere(k.kind, k.ref)">
          <Square :class="{ on: canvas.has(k.ref ? `${k.kind}:${k.ref}` : k.kind) }" />{{ k.label }}
        </button>
      </div>
    </div>
    <button class="item" @click="act(canvas.arrangeAll)"><LayoutGrid />{{ T`Ordenar paneles` }}<span class="grow" /><kbd>O</kbd></button>
    <button class="item" @click="act(canvas.fitAll)"><Maximize />{{ T`Ver todo` }}<span class="grow" /><kbd>0</kbd></button>

    <p class="cap line">{{ T`FONDO` }}</p>
    <div class="scenes">
      <button v-for="[k, label] in SCENES" :key="k" class="scene" :class="{ on: canvas.backdrop.kind === k }" @click="canvas.setBackdrop({ kind: k })">
        <span class="thumb" :class="k" :style="thumbs[k] ? { backgroundImage: `url(${thumbs[k]})` } : undefined" />
        <small>{{ label }}</small>
      </button>
      <button class="scene" :class="{ on: canvas.backdrop.kind === 'image' }" @click="canvas.image ? canvas.setBackdrop({ kind: 'image' }) : file?.click()">
        <span class="thumb upload" :style="canvas.image ? { backgroundImage: `url(${canvas.image})` } : undefined"><ImagePlus v-if="!canvas.image" /></span>
        <small>{{ canvas.image ? T`Tu imagen` : T`Subir imagen` }}</small>
      </button>
      <input ref="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="pick" />
    </div>
    <button v-if="canvas.image" class="item small" @click="file?.click()"><ImagePlus />{{ T`Cambiar tu imagen…` }}</button>
    <label class="item slider" :class="{ off: canvas.backdrop.kind === 'plain' }">
      <span>{{ T`Atenuar` }}</span>
      <input type="range" min="0" max="0.9" step="0.05" :value="canvas.backdrop.dim" :disabled="canvas.backdrop.kind === 'plain'" @input="canvas.setBackdrop({ dim: Number(($event.target as HTMLInputElement).value) })" />
      <b>{{ Math.round(canvas.backdrop.dim * 100) }}%</b>
    </label>
    <label class="item">
      <Grid2x2 />{{ T`Mostrar guías` }}<span class="grow" />
      <input type="checkbox" class="toggle" :checked="canvas.backdrop.guides" @change="canvas.setBackdrop({ guides: ($event.target as HTMLInputElement).checked })" />
    </label>
    <button class="item line" @click="act(canvas.resetBackdrop)"><RotateCcw />{{ T`Restablecer fondo` }}</button>
  </div>
</template>

<style scoped>
.menu { position: absolute; z-index: 30; width: 280px; padding: 6px 0; background: var(--surface); border: 3px solid var(--border); box-shadow: 4px 4px 0 var(--shadow); font-size: 12px; }
.cap { margin: 4px 12px 6px; font: 700 10px var(--font); letter-spacing: 0.08em; color: var(--text-secondary); }
.line { border-top: 2px solid var(--border); margin-top: 6px; padding-top: 10px; }
.item { position: relative; width: 100%; display: flex; align-items: center; gap: 10px; padding: 7px 12px; font: 12px var(--font); color: var(--text-primary); background: none; border: 0; text-align: left; cursor: pointer; }
.item:hover { background: var(--surface-2); }
.item svg { width: 14px; height: 14px; flex: none; color: var(--text-secondary); }
.item.small { padding-top: 2px; color: var(--text-secondary); }
.grow { flex: 1; }
kbd { font: 11px var(--font); color: var(--text-secondary); }
.sub { position: absolute; left: 100%; top: -6px; width: 230px; max-height: 360px; overflow: auto; padding: 6px 0; background: var(--surface); border: 3px solid var(--border); box-shadow: 4px 4px 0 var(--shadow); }
.sub svg.on { color: var(--accent); fill: var(--accent); }
.scenes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 2px 12px 8px; }
.scene { display: flex; flex-direction: column; gap: 4px; padding: 0; background: none; border: 0; cursor: pointer; color: var(--text-secondary); }
.thumb { height: 44px; display: grid; place-items: center; border: 3px solid var(--border); background: var(--bg) center / cover; image-rendering: pixelated; }
.thumb.plain { background: radial-gradient(circle, var(--border-light) 1px, transparent 1.5px) 0 0 / 8px 8px, var(--bg); }
.thumb.upload svg { width: 18px; height: 18px; }
.scene small { font-size: 10px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scene.on .thumb { border-color: var(--accent); }
.scene.on small { color: var(--text-primary); font-weight: 700; }
.scene:hover .thumb { border-color: var(--border-light); }
.slider { cursor: default; }
.slider span { width: 56px; }
.slider input { flex: 1; accent-color: var(--accent); }
.slider b { width: 34px; text-align: right; font-weight: 400; color: var(--text-secondary); }
.slider.off { opacity: 0.5; }
.toggle { appearance: none; width: 30px; height: 16px; border: 2px solid var(--border-light); background: var(--bg); position: relative; cursor: pointer; }
.toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 8px; height: 8px; background: var(--text-secondary); }
.toggle:checked { background: var(--accent); border-color: var(--accent); }
.toggle:checked::after { left: 16px; background: var(--on-accent); }
</style>

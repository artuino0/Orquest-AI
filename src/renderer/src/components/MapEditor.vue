<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useOffice } from '../stores/office'
import { applyTool, drags, itemAt, toolRect, type Tool } from '../world/editor'
import { FLOORS, inside, MAX_SIZE, MIN_SIZE, PIECES, resizeMap, WALLS, type OfficeMap, type Point } from '../world/map'
import type { EditEvent, OfficeScene } from '../world/scene'
import { spriteUrl } from '../world/sprites'

const props = defineProps<{ scene: OfficeScene }>()
const emit = defineEmits<{ close: [] }>()
const office = useOffice()

type Tab = 'piso' | 'muros' | 'muebles'
const tab = ref<Tab>('piso')
const tool = ref<Tool>({ type: 'floor', id: 'madera' })
const flip = ref(false)

const same = (t: Tool) => JSON.stringify({ ...t, flip: undefined }) === JSON.stringify({ ...tool.value, flip: undefined })
function pick(t: Tool) {
  tool.value = t
  flip.value = false
}

const groups = computed(() => {
  const out = new Map<string, typeof PIECES>()
  for (const p of PIECES) out.set(p.group, [...(out.get(p.group) ?? []), p])
  return [...out]
})

const hint = computed(() => {
  const t = tool.value
  if (t.type === 'floor') return t.id ? 'Arrastra para pintar un área de piso.' : 'Arrastra sobre el piso que quieras quitar.'
  if (t.type === 'wall') return t.id ? 'Arrastra en línea recta para trazar el muro.' : 'Arrastra sobre el muro que quieras quitar.'
  if (t.type === 'door') return 'Clic en un muro para abrir una puerta; otro clic la cierra.'
  if (t.type === 'erase') return 'Clic o arrastra sobre los muebles que quieras quitar. En una casilla sin muebles quita el muro.'
  const p = PIECES.find((x) => x.id === t.piece)
  if (p?.kind === 'hang') return 'Va colgado: ponlo sobre un muro. V lo voltea.'
  if (p?.kind === 'entrance') return 'Por aquí llega cada contratado. Solo hay una.'
  if (p?.kind === 'queue') return 'Lugar donde esperan quienes llevan su entrega al jefe. Pon varios.'
  if (p?.kind === 'station') return 'Escritorio con su silla. Sirve para cualquier rol.'
  return 'Clic para poner. V lo voltea.'
})

// ── Dibujar ────────────────────────────────────────────────────────────────

let start: Point | null = null
const current = (): Tool => (tool.value.type === 'item' ? { ...tool.value, flip: flip.value } : tool.value)

function show(tile: Point) {
  const t = current()
  const from = start && drags(t) ? start : tile
  props.scene.setPreview({
    rect: toolRect(t, from, tile),
    removes: t.type === 'erase' || ((t.type === 'floor' || t.type === 'wall') && !t.id),
    item: t.type === 'item' ? itemAt(t.piece, tile, t.flip) : undefined,
  })
}

function onEdit(e: EditEvent) {
  if (e.type === 'leave') return props.scene.setPreview(null)
  if (e.type === 'down') start = e.tile
  if (e.type === 'up') {
    const from = start ?? e.tile
    start = null
    const t = current()
    // Soltar fuera del mapa cancela lo que no se arrastra.
    if (drags(t) || inside(office.map, e.tile.x, e.tile.y)) office.set(applyTool(office.map, t, from, e.tile))
  }
  show(e.tile)
}

function onKey(ev: KeyboardEvent) {
  if ((ev.target as HTMLElement).tagName === 'INPUT') return
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
    ev.preventDefault()
    office.undo()
  } else if (ev.key.toLowerCase() === 'v') flip.value = !flip.value
  else if (ev.key === 'Escape') emit('close')
}

// ── Tamaño ─────────────────────────────────────────────────────────────────

const width = ref(office.map.w)
const height = ref(office.map.h)
watch(
  () => office.map,
  (m) => {
    width.value = m.w
    height.value = m.h
  },
)
function resize() {
  const next: OfficeMap = structuredClone(office.map)
  resizeMap(next, width.value, height.value)
  if (next.w !== office.map.w || next.h !== office.map.h) office.set(next)
}

function clear() {
  if (confirm('¿Empezar de cero? Se borra todo lo dibujado (puedes deshacerlo con Ctrl+Z).')) office.clear()
}

onMounted(() => {
  props.scene.setEditing(onEdit)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  props.scene.setEditing(null)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <aside class="editor">
    <header>
      <strong>Modo creativo</strong>
      <button class="primary" @click="emit('close')">Listo</button>
    </header>

    <nav class="tabs">
      <button v-for="t in ['piso', 'muros', 'muebles'] as Tab[]" :key="t" :class="{ on: tab === t }" @click="tab = t">{{ t }}</button>
    </nav>

    <div class="tools">
      <template v-if="tab === 'piso'">
        <div class="grid">
          <button v-for="f in FLOORS" :key="f.id" class="piece" :class="{ on: same({ type: 'floor', id: f.id }) }" @click="pick({ type: 'floor', id: f.id })">
            <img :src="spriteUrl(`pisos/${f.id}_loseta`)" alt="" />
            <span>{{ f.label }}</span>
          </button>
        </div>
        <button class="row" :class="{ on: same({ type: 'floor', id: '' }) }" @click="pick({ type: 'floor', id: '' })">Quitar piso</button>
      </template>

      <template v-else-if="tab === 'muros'">
        <button v-for="w in WALLS" :key="w.id" class="row" :class="{ on: same({ type: 'wall', id: w.id }) }" @click="pick({ type: 'wall', id: w.id })">
          {{ w.label }}
        </button>
        <button class="row" :class="{ on: tool.type === 'door' }" @click="pick({ type: 'door' })">Puerta</button>
        <button class="row" :class="{ on: same({ type: 'wall', id: '' }) }" @click="pick({ type: 'wall', id: '' })">Quitar muro</button>
      </template>

      <template v-else>
        <section v-for="[name, pieces] in groups" :key="name">
          <h2>{{ name }}</h2>
          <div class="grid">
            <button v-for="p in pieces" :key="p.id" class="piece" :class="{ on: same({ type: 'item', piece: p.id }) }" :title="p.label" @click="pick({ type: 'item', piece: p.id })">
              <img v-if="p.sprite" :src="spriteUrl(p.sprite)" alt="" />
              <i v-else class="mark" :class="p.kind" />
              <span>{{ p.label }}</span>
            </button>
          </div>
        </section>
      </template>

    </div>

    <p class="hint">{{ hint }}</p>

    <footer>
      <div class="actions">
        <button :class="{ on: tool.type === 'erase' }" @click="pick({ type: 'erase' })">Borrar</button>
        <button :disabled="!office.canUndo" title="Ctrl+Z" @click="office.undo()">Deshacer</button>
      </div>
      <div class="actions">
        <button @click="clear">Empezar de cero</button>
        <button @click="office.useExample()">Usar ejemplo</button>
      </div>
      <label class="size">
        Tamaño
        <input v-model.number="width" type="number" :min="MIN_SIZE" :max="MAX_SIZE" @change="resize" />
        ×
        <input v-model.number="height" type="number" :min="MIN_SIZE" :max="MAX_SIZE" @change="resize" />
        casillas
      </label>
      <ul v-if="office.issues.length" class="issues">
        <li v-for="i in office.issues" :key="i">{{ i }}</li>
      </ul>
      <p v-else class="ok">La oficina está completa.</p>
      <p v-if="office.error" class="issues">{{ office.error }}</p>
      <p class="keys">clic izq.: dibujar · clic der.: mover el mapa · rueda: zoom</p>
    </footer>
  </aside>
</template>

<style scoped>
.editor { position: absolute; top: 56px; left: 12px; bottom: 12px; width: 296px; display: flex; flex-direction: column; gap: 8px; background: var(--panel); border: 3px solid var(--line); box-shadow: 4px 4px 0 #000; padding: 10px; z-index: 5; }
header { display: flex; justify-content: space-between; align-items: center; }
header strong { color: var(--accent); letter-spacing: 1px; text-transform: uppercase; font-size: 13px; }
.primary { background: var(--accent); color: #1b1a24; border-color: #000; font-weight: bold; }
.tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.tabs button { padding: 4px 0; font-size: 11px; text-transform: uppercase; }
.on { border-color: var(--accent); background: #34314a; }
.tools { flex: 1; min-height: 0; overflow-y: auto; display: grid; gap: 6px; align-content: start; padding-right: 4px; }
h2 { margin: 6px 0 4px; font-size: 11px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.piece { display: grid; justify-items: center; align-content: end; gap: 2px; padding: 4px 2px; height: 78px; }
.piece img { max-width: 100%; max-height: 46px; image-rendering: pixelated; object-fit: contain; }
.piece span { font-size: 9px; line-height: 1.1; color: var(--muted); text-align: center; overflow: hidden; max-height: 20px; }
.mark { width: 28px; height: 28px; border: 3px solid; }
.mark.entrance { border-color: var(--idle); background: #66bb6a55; }
.mark.queue { border-color: var(--accent); background: #f2b84b55; }
.row { display: flex; justify-content: space-between; align-items: center; text-align: left; font-size: 12px; }
.row small { color: var(--idle); font-size: 10px; }
.hint { margin: 0; font-size: 11px; color: var(--muted); min-height: 30px; }
footer { display: grid; gap: 6px; border-top: 2px solid var(--line); padding-top: 8px; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.actions button { font-size: 11px; }
.size { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); }
.size input { width: 52px; padding: 2px 4px; }
.issues { margin: 0; padding-left: 16px; font-size: 11px; color: var(--accent); display: grid; gap: 2px; }
.ok { margin: 0; font-size: 11px; color: var(--idle); }
.keys { margin: 0; font-size: 10px; color: var(--muted); }
</style>

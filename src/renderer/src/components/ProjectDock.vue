<script setup lang="ts">
/**
 * El dock de la izquierda: los proyectos abiertos en esta compu. Un clic cambia
 * el espacio entero (oficina, equipo, paneles y contadores). Los demás siguen
 * a la vista: número rojo = algo de ese proyecto te espera; cuadro azul =
 * están trabajando. «+» abre otro: uno de tus recientes o cualquier carpeta.
 * Abajo, el uso de tus cuentas.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { FolderOpen, FolderGit2, Gauge, Layers, Plus } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import type { OpenProject } from '../../../core/dock'
import { hueOf, initials } from '../canvas/layout'
import { useIde } from '../stores/ide'
import { useStudio } from '../stores/studio'
import { useUsage } from '../stores/usage'

defineEmits<{ usage: [] }>()
const studio = useStudio()
const usage = useUsage()
const ide = useIde()
const list = ref<OpenProject[]>([])
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
const active = computed(() => studio.board?.repo ?? studio.repo)

let off: (() => void) | undefined
let release: (() => void) | undefined
onMounted(async () => {
  off = window.orquest.onProjects((l) => (list.value = l))
  release = usage.watch()
  list.value = await window.orquest.openProjects().catch(() => [])
})
onBeforeUnmount(() => {
  off?.()
  release?.()
})

/** Lo abierto en el editor es de este proyecto y se suelta al cambiar: sin guardar, no se pierde. */
function canLeave() {
  if (!ide.dirtyCount) return true
  studio.notice(T`Tienes archivos sin guardar en el Editor: guárdalos o descártalos antes de cambiar de proyecto.`)
  return false
}
/** Abre (o cambia a) un proyecto. Si la carpeta no está lista, sale el aviso para prepararla; si falla, se dice. */
async function open(path: string) {
  if (!canLeave()) return
  await studio.openProject(path)
  if (studio.error) studio.notice(studio.error)
}
function go(p: OpenProject) {
  if (!same(p.root, active.value)) void open(p.root)
}

// «+»: tus recientes que no están abiertos, y abrir otra carpeta.
const addEl = ref<HTMLElement>()
const menu = ref<{ top: number; left: number } | null>(null)
const others = computed(() => studio.recents.filter((r) => !list.value.some((p) => same(p.root, r.path))).slice(0, 8))
async function toggleAdd() {
  if (menu.value) return void (menu.value = null)
  const r = addEl.value!.getBoundingClientRect()
  menu.value = { top: r.top, left: r.right + 10 }
  await studio.loadRecents()
}
function pick(path: string) {
  menu.value = null
  void open(path)
}
async function browse() {
  menu.value = null
  if (!canLeave()) return
  const path = await window.orquest.pickRepo()
  if (path) await open(path)
}
const outside = (ev: PointerEvent) => {
  const t = ev.target as HTMLElement
  if (!t.closest('.add-menu') && !addEl.value?.contains(t)) menu.value = null
}
const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && (menu.value = null)
onMounted(() => {
  window.addEventListener('pointerdown', outside, true)
  window.addEventListener('keydown', esc)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', outside, true)
  window.removeEventListener('keydown', esc)
})
const folder = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p
const tip = (p: OpenProject) =>
  [p.name, p.working ? T`${p.working} trabajando` : T`nadie trabajando`, p.needs ? T`${p.needs} esperan por ti` : ''].filter(Boolean).join(' · ')
</script>

<template>
  <aside class="dock">
    <p class="label"><Layers />{{ T`PROY.` }}</p>
    <div class="list">
      <button v-for="p in list" :key="p.root" class="project" :class="{ on: same(p.root, active) }" :title="tip(p)" @click="go(p)">
        <span class="tile" :style="{ '--h': hueOf(p.name) }">
          {{ initials(p.name) }}
          <b v-if="p.needs" class="needs">{{ p.needs }}</b>
          <i v-if="p.working" class="working" />
        </span>
        <span class="name">{{ p.name }}</span>
      </button>
      <button ref="addEl" class="add" :class="{ on: menu }" :title="T`Abrir otro proyecto`" @click="toggleAdd"><Plus /></button>
    </div>
    <button class="use" :title="T`Uso: el límite de cada cuenta`" @click="$emit('usage')">
      <span class="gauge"><Gauge /></span>
      <span class="meter"><b :style="{ width: `${usage.peak ?? 0}%` }" :class="{ hot: (usage.peak ?? 0) >= 90 }" /></span>
      <span class="pct">{{ usage.peak === null ? T`uso` : T`uso ${usage.peak}%` }}</span>
    </button>
    <!-- Fuera del dock: encima de los paneles del lienzo. -->
    <Teleport to="body">
      <div v-if="menu" class="add-menu" :style="{ top: `${menu.top}px`, left: `${menu.left}px` }">
        <p class="cap">{{ T`ABRIR PROYECTO` }}</p>
        <button v-for="r in others" :key="r.path" class="item" :title="r.path" @click="pick(r.path)">
          <FolderGit2 /><span><b>{{ folder(r.path) }}</b><small>{{ r.path }}</small></span>
        </button>
        <p v-if="!others.length" class="none">{{ T`Tus proyectos recientes ya están abiertos.` }}</p>
        <button class="item line" @click="browse"><FolderOpen /><span><b>{{ T`Abrir otra carpeta…` }}</b></span></button>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.dock { width: 68px; flex: none; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 10px 0; background: var(--surface); border-right: 3px solid var(--border); z-index: 3; min-height: 0; }
.label { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; font: 700 9px var(--font); letter-spacing: 0.1em; color: var(--text-secondary); }
.label svg { width: 14px; height: 14px; }
.list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 4px 0; scrollbar-width: none; width: 100%; }
.project { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; padding: 0; background: none; border: 0; cursor: pointer; color: var(--text-secondary); }
.project::before { content: ''; position: absolute; left: 0; top: 6px; width: 4px; height: 36px; background: transparent; }
.project.on::before { background: var(--accent); }
.tile { position: relative; width: 46px; height: 46px; display: grid; place-items: center; font: 700 16px var(--font-pixel); color: hsl(var(--h) 85% 72%); background: hsl(var(--h) 40% 20%); border: 3px solid var(--border); box-shadow: 2px 2px 0 var(--shadow); }
.project:hover .tile { border-color: var(--border-light); }
.project.on .tile { border-color: var(--accent); color: var(--on-accent); background: var(--accent); }
.needs { position: absolute; top: -8px; right: -9px; min-width: 18px; padding: 0 4px; font: 700 10px/16px var(--font); color: var(--on-danger); background: var(--st-block); border: 2px solid var(--border); }
.working { position: absolute; right: -5px; bottom: -5px; width: 10px; height: 10px; background: var(--st-work); border: 2px solid var(--border); animation: pulse 1.6s steps(2) infinite; }
@keyframes pulse { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .working { animation: none; } }
.name { max-width: 60px; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.project.on .name { color: var(--text-primary); }
.add { width: 46px; height: 46px; display: grid; place-items: center; background: none; color: var(--text-secondary); border: 3px dashed var(--border-light); cursor: pointer; }
.add:hover, .add.on { color: var(--accent); border-color: var(--accent); }
.add svg { width: 18px; height: 18px; }
.use { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 0; background: none; border: 0; cursor: pointer; color: var(--text-secondary); }
.gauge { width: 42px; height: 42px; display: grid; place-items: center; background: var(--bg); border: 3px solid var(--border); }
.use:hover .gauge { border-color: var(--accent); color: var(--accent); }
.gauge svg { width: 18px; height: 18px; }
.meter { width: 42px; height: 6px; background: var(--bg); border: 2px solid var(--border); }
.meter b { display: block; height: 100%; background: var(--accent); }
.meter b.hot { background: var(--st-block); }
.pct { font-size: 9px; }
.add-menu { position: fixed; z-index: 70; width: 300px; max-height: 70vh; overflow-y: auto; padding: 6px 0; background: var(--surface); border: 3px solid var(--border); box-shadow: 4px 4px 0 var(--shadow); }
.add-menu .cap { margin: 4px 12px 6px; font: 700 10px var(--font); letter-spacing: 0.08em; color: var(--text-secondary); }
.add-menu .item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 7px 12px; font: 12px var(--font); color: var(--text-primary); background: none; border: 0; text-align: left; cursor: pointer; }
.add-menu .item:hover { background: var(--surface-2); }
.add-menu .item svg { width: 15px; height: 15px; flex: none; color: var(--accent); }
.add-menu .item span { display: flex; flex-direction: column; min-width: 0; }
.add-menu .item small { font-size: 10px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.add-menu .line { border-top: 2px solid var(--border); margin-top: 4px; padding-top: 10px; }
.add-menu .none { margin: 2px 12px 8px; font-size: 11px; color: var(--text-secondary); }
</style>

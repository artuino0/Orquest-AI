<script setup lang="ts">
/**
 * El panel de archivos del proyecto: se abre con el botón de carpeta de la
 * barra, angosta la oficina (no la tapa) y su ancho se ajusta arrastrando su
 * borde. Muestra la carpeta del proyecto; los archivos de cada agente siguen en
 * su panel.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { AppWindow, File, Folder, FolderOpen, FolderTree, RefreshCw, X } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import type { FileEntry } from '../../../shared/ipc'
import { useIde } from '../stores/ide'
import { useStudio } from '../stores/studio'

const ide = useIde()
const studio = useStudio()
const name = computed(() => studio.repo?.split(/[\\/]/).filter(Boolean).pop() ?? '')

// El árbol: cada carpeta se pide al abrirla.
const kids = ref<Record<string, FileEntry[]>>({})
const opened = ref(new Set<string>())
/** Lo cambiado según git: ruta → letra (M cambiado, A nuevo, D borrado). */
const marks = ref<Record<string, string>>({})
const loading = ref(false)
const rows = computed(() => {
  const out: (FileEntry & { depth: number })[] = []
  const walk = (dir: string, depth: number) => {
    for (const f of kids.value[dir] ?? []) {
      out.push({ ...f, depth })
      if (f.dir && opened.value.has(f.path)) walk(f.path, depth + 1)
    }
  }
  walk('', 0)
  return out
})
async function loadDir(dir: string) {
  const list = await window.orquest.projectTree(dir).catch(() => [] as FileEntry[])
  kids.value = { ...kids.value, [dir]: list }
}
async function refresh() {
  loading.value = true
  const changes = await window.orquest.projectChanges().catch(() => [])
  marks.value = Object.fromEntries(changes.map((c) => [c.path, c.status.includes('?') || c.status.includes('A') ? 'A' : c.status.includes('D') ? 'D' : 'M']))
  await Promise.all(['', ...opened.value].map(loadDir))
  loading.value = false
}
function toggleDir(path: string) {
  const next = new Set(opened.value)
  if (next.has(path)) next.delete(path)
  else {
    next.add(path)
    void loadDir(path)
  }
  opened.value = next
}
/** Una carpeta cerrada avisa si adentro hay algo cambiado. */
const touched = (dir: string) => Object.keys(marks.value).some((p) => p.startsWith(`${dir}/`))
void refresh()
const timer = setInterval(refresh, 4000)
onBeforeUnmount(() => clearInterval(timer))

// Ancho: se arrastra el borde izquierdo.
function drag(ev: PointerEvent) {
  const el = ev.currentTarget as HTMLElement
  el.setPointerCapture(ev.pointerId)
  const move = (e: PointerEvent) => ide.setWidth(window.innerWidth - e.clientX)
  const stop = () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', stop)
    el.removeEventListener('pointercancel', stop)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', stop)
  el.addEventListener('pointercancel', stop)
}
</script>

<template>
  <aside class="files">
    <div class="grip" :title="T`Arrastra para ajustar el ancho`" @pointerdown.prevent="drag"><i /></div>
    <header>
      <FolderTree class="mark" />
      <h2 class="title-pixel">{{ T`Archivos` }}</h2>
      <span class="grow" />
      <button class="btn icon" :title="T`Volver a leer la carpeta`" @click="refresh"><RefreshCw :class="{ spin: loading }" /></button>
      <button class="btn icon" :title="T`Cerrar el panel`" @click="ide.togglePanel()"><X /></button>
    </header>
    <p class="project" :title="studio.repo ?? ''">{{ name }}</p>
    <!-- Entrar al editor sin abrir otro archivo: lo que ya está abierto sigue ahí. -->
    <button class="btn editor" :class="{ on: ide.visible }" :disabled="!ide.tabs.length" :title="ide.tabs.length ? T`Entra a los archivos que ya tienes abiertos` : T`Aún no has abierto ningún archivo`" @click="ide.visible ? ide.hide() : ide.show()">
      <AppWindow />{{ ide.visible ? T`Volver a la oficina` : T`Ver editor` }}<b v-if="ide.tabs.length">{{ ide.tabs.length }}</b>
    </button>
    <ul>
      <li v-if="!rows.length" class="dim">{{ T`No hay archivos en esta carpeta.` }}</li>
      <li
        v-for="f in rows"
        :key="f.path"
        :class="{ on: ide.active === f.path, open: ide.tabs.some((t) => t.path === f.path) }"
        :style="{ paddingLeft: `${8 + f.depth * 14}px` }"
        :title="f.path"
        @click="f.dir ? toggleDir(f.path) : ide.open(f.path)"
      >
        <component :is="f.dir ? (opened.has(f.path) ? FolderOpen : Folder) : File" :class="{ folder: f.dir }" />
        <span class="name">{{ f.name }}</span>
        <b v-if="marks[f.path]" class="mark" :class="marks[f.path]">{{ marks[f.path] }}</b>
        <b v-else-if="f.dir && !opened.has(f.path) && touched(f.path)" class="mark dot">●</b>
      </li>
    </ul>
    <p class="foot">{{ T`M cambiado · A nuevo · D borrado, según git.` }}</p>
  </aside>
</template>

<style scoped>
.files { position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; min-height: 0; padding: 10px 10px 8px 16px; background: var(--surface); border-left: 3px solid var(--border); }
.grip { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; display: grid; place-items: center; cursor: col-resize; touch-action: none; }
.grip i { width: 3px; height: 48px; background: var(--border-light); }
.grip:hover i { background: var(--accent); }
header { display: flex; align-items: center; gap: 8px; }
header h2 { margin: 0; font-size: 16px; }
header .mark { width: 16px; height: 16px; color: var(--accent); }
.grow { flex: 1; }
.btn.icon { padding: 5px 7px; }
.project { margin: 0; font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor { justify-content: center; }
.editor.on { background: var(--accent); color: var(--on-accent); }
.editor b { padding: 0 5px; font-size: 10px; background: var(--bg); color: var(--text-primary); border: 2px solid var(--border); }
ul { flex: 1; min-height: 0; list-style: none; margin: 0; padding: 6px; font-size: 12px; background: var(--bg); border: 2px solid var(--border); overflow: auto; }
li { display: flex; align-items: center; gap: 6px; padding: 4px 8px; cursor: pointer; white-space: nowrap; }
li:hover, li.on { background: var(--surface-2); }
li.open .name { color: var(--accent); }
li.dim { cursor: default; white-space: normal; color: var(--text-secondary); }
li.dim:hover { background: none; }
li svg { width: 13px; height: 13px; flex: none; color: var(--text-secondary); }
li svg.folder { color: var(--accent); }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
li .mark { flex: none; font-size: 11px; color: var(--accent); }
li .mark.A { color: var(--st-idle); }
li .mark.D { color: var(--st-block); }
li .mark.dot { font-size: 8px; }
.foot { margin: 0; font-size: 10px; color: var(--text-secondary); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useStudio } from '../stores/studio'
import { LOOKS } from '../world/behavior'
import { PROVIDER_COLOR } from '../world/sprites'
import TerminalView from './TerminalView.vue'
import type { FileChange } from '../../../shared/ipc'

type Tab = 'terminal' | 'archivos' | 'capturas' | 'actividad' | 'tarea'
const TABS: [Tab, string][] = [
  ['terminal', 'Terminal'],
  ['archivos', 'Archivos'],
  ['capturas', 'Capturas'],
  ['actividad', 'Actividad'],
  ['tarea', 'Tarea'],
]

const studio = useStudio()
const e = computed(() => studio.selectedEmployee!)
const tab = ref<Tab>('terminal')
const changes = ref<FileChange[]>([])
const openFile = ref<string | null>(null)
const diff = ref('')
const color = computed(() => '#' + (PROVIDER_COLOR[e.value.provider] ?? 0x9e9e9e).toString(16).padStart(6, '0'))
const activity = computed(() => [...(studio.activity[e.value.id] ?? [])].reverse())

async function loadChanges() {
  changes.value = await window.orquest.changes(e.value.id)
}
async function showDiff(path: string) {
  openFile.value = path
  diff.value = await window.orquest.diff(e.value.id, path)
}

let timer: ReturnType<typeof setInterval> | undefined
watch(
  tab,
  (t) => {
    clearInterval(timer)
    if (t === 'archivos') {
      loadChanges()
      timer = setInterval(loadChanges, 3000)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(timer))

const time = (t: number) => new Date(t).toLocaleTimeString()
const lineClass = (l: string) => (l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hunk' : '')
</script>

<template>
  <aside class="drawer" :class="studio.drawerMode">
    <header>
      <span class="avatar" :style="{ background: color }" />
      <div class="who">
        <strong>{{ e.role }}</strong>
        <small>{{ e.provider }}{{ e.model ? ' · ' + e.model : '' }}{{ e.effort ? ' · ' + e.effort : '' }}</small>
      </div>
      <span class="pill" :class="e.state">{{ LOOKS[e.state].label }}</span>
      <div class="actions">
        <button
          :title="studio.drawerMode === 'float' ? 'Pantalla dividida' : 'Flotante'"
          @click="studio.drawerMode = studio.drawerMode === 'float' ? 'split' : 'float'"
        >
          {{ studio.drawerMode === 'float' ? '◫' : '❐' }}
        </button>
        <button @click="studio.fire(e.id)">Despedir</button>
        <button @click="studio.select(null)">✕</button>
      </div>
    </header>

    <nav>
      <button v-for="[id, label] in TABS" :key="id" :class="{ on: tab === id }" @click="tab = id">{{ label }}</button>
    </nav>

    <div class="body">
      <TerminalView v-show="tab === 'terminal'" :id="e.id" />

      <div v-if="tab === 'archivos'" class="files">
        <ul>
          <li v-if="!changes.length" class="muted">Sin cambios en su oficina.</li>
          <li v-for="c in changes" :key="c.path" :class="{ on: openFile === c.path }" @click="showDiff(c.path)">
            <code>{{ c.status }}</code> {{ c.path }}
          </li>
        </ul>
        <pre v-if="openFile" class="diff"><span v-for="(l, i) in diff.split('\n')" :key="i" :class="lineClass(l)">{{ l }}
</span></pre>
      </div>

      <div v-if="tab === 'capturas'" class="pad muted">
        Aún no hay capturas. Aquí aparecen las que tome al probar la app; en el mapa se ve un flash de cámara.
      </div>

      <ol v-if="tab === 'actividad'" class="pad timeline">
        <li v-for="(a, i) in activity" :key="i">
          <time>{{ time(a.at) }}</time>
          <span :class="['dot', a.state]" />
          {{ a.text }}
        </li>
      </ol>

      <dl v-if="tab === 'tarea'" class="pad task">
        <dt>Puesto</dt>
        <dd>{{ e.role }}</dd>
        <dt>Oficina</dt>
        <dd><code>{{ e.office.path }}</code></dd>
        <dt>Rama</dt>
        <dd><code>{{ e.office.branch }}</code></dd>
        <dt>Tarea</dt>
        <dd class="muted">El jefe asigna tareas y dependencias en la fase 2.</dd>
        <dt v-if="e.warnings.length">Avisos</dt>
        <dd v-for="w in e.warnings" :key="w" class="warn">⚠ {{ w }}</dd>
      </dl>
    </div>
  </aside>
</template>

<style scoped>
.drawer { display: flex; flex-direction: column; background: var(--bg); min-width: 0; min-height: 0; }
.drawer.float { position: fixed; right: 16px; top: 64px; bottom: 16px; width: min(760px, 60vw); border: 3px solid var(--line); box-shadow: 8px 8px 0 #000; }
.drawer.split { border-left: 3px solid var(--line); height: 100vh; }
header { display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 2px solid var(--line); background: var(--panel); }
.avatar { width: 24px; height: 24px; box-shadow: 2px 2px 0 #000; }
.who { display: grid; }
.who small { color: var(--muted); font-size: 11px; }
.actions { margin-left: auto; display: flex; gap: 4px; }
nav { display: flex; gap: 2px; padding: 6px 10px 0; border-bottom: 2px solid var(--line); }
nav button { border-bottom: none; font-size: 12px; }
nav .on { background: var(--bg); border-color: var(--accent); }
.body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; }
.pad { padding: 12px; margin: 0; font-size: 13px; }
.muted { color: var(--muted); }
.files { display: grid; grid-template-rows: auto 1fr; min-height: 0; }
.files ul { list-style: none; margin: 0; padding: 8px; font-size: 13px; }
.files li { padding: 2px 6px; cursor: pointer; }
.files li:hover, .files li.on { background: var(--line); }
.diff { margin: 0; padding: 8px; font-size: 12px; overflow: auto; border-top: 2px solid var(--line); }
.add { color: #81c784; }
.del { color: #e57373; }
.hunk { color: #64b5f6; }
.timeline { list-style: none; display: grid; gap: 6px; }
.timeline time { color: var(--muted); font-size: 11px; margin-right: 8px; }
.dot { display: inline-block; width: 8px; height: 8px; background: var(--line); margin-right: 6px; }
.task { display: grid; grid-template-columns: 90px 1fr; gap: 6px 12px; }
.task dt { color: var(--muted); }
.task dd { margin: 0; overflow-wrap: anywhere; }
.warn { color: var(--accent); }
.pill { font-size: 11px; padding: 2px 6px; color: #111; }
.starting { background: var(--starting); }
.working { background: var(--working); }
.blocked { background: var(--blocked); color: #fff; }
.idle { background: var(--idle); }
.exited { background: var(--exited); color: #fff; }
</style>

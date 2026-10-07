<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useStudio } from '../stores/studio'
import { LOOKS } from '../world/behavior'
import { PROVIDER_COLOR } from '../world/sprites'
import TerminalView from './TerminalView.vue'
import type { FileChange } from '../../../shared/ipc'
import { TASK_STATUS } from './taskLabels'

type Tab = 'terminal' | 'archivos' | 'capturas' | 'actividad' | 'tarea' | 'bitacora'
const TABS: [Tab, string][] = [
  ['terminal', 'Terminal'],
  ['archivos', 'Archivos'],
  ['capturas', 'Capturas'],
  ['actividad', 'Actividad'],
  ['tarea', 'Tarea'],
  ['bitacora', 'Bitácora'],
]

const studio = useStudio()
const e = computed(() => studio.selectedEmployee!)
const tab = ref<Tab>('terminal')
const changes = ref<FileChange[]>([])
const openFile = ref<string | null>(null)
const diff = ref('')
const color = computed(() => '#' + (PROVIDER_COLOR[e.value.provider] ?? 0x9e9e9e).toString(16).padStart(6, '0'))
const activity = computed(() => {
  const mine = (studio.activity[e.value.id] ?? []).map((a) => ({ ...a }))
  // Lo que dijo y le dijeron por Orquest también es actividad.
  const said = (studio.board?.messages ?? [])
    .filter((m) => m.from === e.value.id || m.to === e.value.id)
    .map((m) => ({ at: m.at, text: m.from === e.value.id ? `→ ${m.to}: ${m.text}` : `← ${m.text}`, state: undefined }))
  return [...mine, ...said].sort((a, b) => b.at - a.at)
})
const tasks = computed(() => studio.tasksOf(e.value.id))
// Igual que en el mapa: en espera, el tablero dice si espera a otro o lleva su entrega.
const visual = computed(() => {
  const h = studio.board?.hints[e.value.id]
  if (h?.state === 'gaming') return 'gaming'
  return h && (e.value.state === 'idle' || e.value.state === 'starting') ? h.state : e.value.state
})
const taskById = (id: string) => studio.board?.tasks.find((t) => t.id === id)

const journal = ref('')
const context = computed(() => studio.board?.context[e.value.id])
const burnoutAt = computed(() => studio.board?.burnoutAt ?? 80)
const gaming = computed(() => studio.board?.hints[e.value.id]?.state === 'gaming')

async function loadJournal() {
  journal.value = await window.orquest.journal(e.value.id)
}

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
    if (t === 'bitacora') {
      loadJournal()
      timer = setInterval(loadJournal, 3000)
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
        <strong>{{ studio.nameOf(e.id) }}</strong>
        <small>{{ e.role }} · {{ e.provider }}{{ e.model ? ' · ' + e.model : '' }}{{ e.effort ? ' · ' + e.effort : '' }}</small>
      </div>
      <span class="pill" :class="visual">{{ LOOKS[visual].label }}</span>
      <div class="ctx" :title="context === undefined ? 'contexto: sin dato' : `contexto usado: ${context}%`">
        <span class="bar"><span :style="{ width: (context ?? 0) + '%' }" :class="{ hot: (context ?? 0) >= burnoutAt }" /></span>
        <small>{{ context === undefined ? '—' : context + '%' }}</small>
      </div>
      <div class="actions">
        <button :disabled="gaming || e.state === 'exited'" title="Escribe su traspaso y se reinicia con el contexto limpio" @click="studio.rest(e.id)">🎮 Descanso</button>
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

      <pre v-if="tab === 'bitacora'" class="pad journal">{{ journal || 'Aún no hay bitácora.' }}</pre>

      <dl v-if="tab === 'tarea'" class="pad task">
        <dt>Puesto</dt>
        <dd>{{ e.role }}</dd>
        <dt>Oficina</dt>
        <dd><code>{{ e.office.path }}</code></dd>
        <dt>Rama</dt>
        <dd><code>{{ e.office.branch }}</code></dd>
        <dt>Bitácora</dt>
        <dd class="muted">Su memoria entre reinicios, y la capacitación de quien ocupe su puesto.</dd>
        <dt>Tareas</dt>
        <dd v-if="!tasks.length" class="muted">Sin tareas. Se las asigna el jefe.</dd>
        <dd v-for="t in tasks" :key="t.id" class="task-item">
          <strong>{{ t.id }} · {{ t.title }}</strong> <span class="muted">({{ TASK_STATUS[t.status] }})</span>
          <p v-if="t.description">{{ t.description }}</p>
          <p v-if="t.deps.length" class="muted">
            Depende de:
            <span v-for="d in t.deps" :key="d">{{ d }} ({{ TASK_STATUS[taskById(d)?.status ?? 'waiting'] }}) </span>
          </p>
          <p v-if="t.qa" :class="t.qa.verdict === 'pass' ? 'ok' : 'warn'">QA: {{ t.qa.report }}</p>
        </dd>
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
.ok { color: var(--idle); }
.task-item p { margin: 4px 0 0; font-size: 12px; }
.task-item { padding-bottom: 6px; }
.pill { font-size: 11px; padding: 2px 6px; color: #111; }
.starting { background: var(--starting); }
.working { background: var(--working); }
.blocked { background: var(--blocked); color: #fff; }
.idle { background: var(--idle); }
.exited { background: var(--exited); color: #fff; }
.waiting { background: #9fa8da; }
.gaming { background: #26a69a; }
.ctx { display: flex; align-items: center; gap: 4px; }
.ctx small { color: var(--muted); font-size: 10px; width: 28px; }
.bar { display: block; width: 60px; height: 6px; background: var(--line); }
.bar span { display: block; height: 100%; background: var(--working); }
.bar span.hot { background: var(--blocked); }
.journal { white-space: pre-wrap; font-size: 12px; }
.delivering { background: var(--accent); }
</style>

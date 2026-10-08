<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AlertTriangle, AppWindow, ChevronRight, Columns2, Gamepad2, UserMinus, X } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import { EFFORT_LABEL, LOOK, lookOf } from '../status'
import { charUrl } from '../characters'
import TerminalView from './TerminalView.vue'
import type { Capture, FileChange } from '../../../shared/ipc'
import { capital, TASK_COLOR, TASK_STATUS } from './taskLabels'

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
const avatar = computed(() => charUrl(studio.characterOf(e.value.id)))
const cli = computed(() => studio.clis.find((c) => c.id === e.value.provider)?.name ?? e.value.provider)
const look = computed(() => LOOK[lookOf(e.value, studio.board?.hints)])
const activity = computed(() => {
  const mine = (studio.activity[e.value.id] ?? []).map((a) => ({ ...a }))
  // Lo que dijo y le dijeron por Orquest también es actividad.
  const said = (studio.board?.messages ?? [])
    .filter((m) => m.from === e.value.id || m.to === e.value.id)
    .map((m) => ({ at: m.at, text: m.from === e.value.id ? `→ ${studio.nameOf(m.to)}: ${m.text}` : `← ${studio.nameOf(m.from)}: ${m.text}`, state: undefined }))
  return [...mine, ...said].sort((a, b) => b.at - a.at)
})
const tasks = computed(() => studio.tasksOf(e.value.id))
const taskById = (id: string) => studio.board?.tasks.find((t) => t.id === id)

const journal = ref('')
const context = computed(() => studio.board?.context[e.value.id] ?? e.value.context)
const burnoutAt = computed(() => studio.board?.burnoutAt ?? 80)
const hot = computed(() => (context.value ?? 0) >= burnoutAt.value)
const gaming = computed(() => studio.board?.hints[e.value.id]?.state === 'gaming')
/** La bitácora partida en sus secciones (## Traspaso, ## Hechos). */
const sections = computed(() => {
  const out: { title: string; lines: string[] }[] = []
  for (const l of journal.value.split('\n')) {
    const h = /^#{1,3}\s+(.*)/.exec(l)
    if (h) out.push({ title: h[1].trim(), lines: [] })
    else if (l.trim()) (out.at(-1) ?? (out.push({ title: 'Bitácora', lines: [] }), out[0])).lines.push(l.replace(/^[-*]\s+/, ''))
  }
  return out.filter((s) => s.lines.length)
})
const NOTE: Record<string, string> = { traspaso: 'lo escribe el agente', hechos: 'los escribe la app · solo lectura' }

async function loadJournal() {
  journal.value = await window.orquest.journal(e.value.id)
}
// Capturas: las imágenes que dejó en su oficina. Se traen sus bytes y se pintan desde memoria.
const captures = ref<(Capture & { url?: string })[]>([])
const urls = new Map<string, string>()
const zoomed = ref<string | null>(null)
async function loadCaptures() {
  const id = e.value.id
  const list = await window.orquest.captures(id).catch(() => [])
  for (const c of list) {
    const key = `${c.path}@${c.at}`
    if (!urls.has(key)) {
      const img = await window.orquest.capture(id, c.path).catch(() => null)
      if (img) urls.set(key, URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: img.type })))
    }
  }
  if (id === e.value.id) captures.value = list.map((c) => ({ ...c, url: urls.get(`${c.path}@${c.at}`) }))
}
onBeforeUnmount(() => urls.forEach((u) => URL.revokeObjectURL(u)))

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
    if (t === 'capturas') {
      loadCaptures()
      timer = setInterval(loadCaptures, 4000)
    }
    if (t === 'bitacora') {
      loadJournal()
      timer = setInterval(loadJournal, 3000)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(timer))

// Escribirle sin entrar a la terminal: el texto y Enter van directo a su CLI.
const message = ref('')
function say() {
  if (!message.value.trim()) return
  // Lo envía el estudio: escribe, espera a que la CLI lo reciba y da Enter (otra vez si no entró).
  void studio.attempt(() => window.orquest.say(e.value.id, message.value))
  message.value = ''
}

const time = (t: number) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
const mark = (l: string) => (l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hunk' : '')
</script>

<template>
  <aside class="drawer panel" :class="studio.drawerMode">
    <header>
      <img class="avatar" :src="avatar" alt="" />
      <div class="who">
        <h2><span class="title-pixel">{{ studio.nameOf(e.id) }}</span> <span class="chip" :style="{ color: `var(--st-${look.color})` }">■ {{ look.label }}</span></h2>
        <p class="dim">{{ e.role }} · {{ cli }}<template v-if="e.model"> · {{ e.model }}</template><template v-if="e.effort"> · esfuerzo {{ EFFORT_LABEL[e.effort].toLowerCase() }}</template></p>
        <p class="ctx">
          <span class="cap">Contexto</span>
          <span class="meter" :class="{ hot }"><i><b :style="{ width: `${context ?? 0}%` }" /></i>{{ context === undefined ? 'sin dato' : `${Math.round(context)}%` }}</span>
        </p>
        <p v-if="e.state === 'working' && studio.doing[e.id]" class="now"><b>{{ studio.doing[e.id].label }}…</b> {{ studio.doing[e.id].detail }}</p>
        <p v-if="hot" class="over">Pasó el umbral de {{ burnoutAt }} %. Mándalo a Descanso para limpiar contexto.</p>
      </div>
      <div class="actions">
        <button class="btn" @click="studio.drawerMode = studio.drawerMode === 'float' ? 'split' : 'float'">
          <template v-if="studio.drawerMode === 'float'"><Columns2 /> Dividir</template><template v-else><AppWindow /> Flotante</template>
        </button>
        <button class="btn" @click="studio.select(null)"><X /> Cerrar</button>
        <button class="btn" :disabled="gaming || e.state === 'exited'" title="Escribe su traspaso y se reinicia con el contexto limpio" @click="studio.rest(e.id)"><Gamepad2 /> Descanso</button>
        <button class="btn danger" @click="studio.fire(e.id)"><UserMinus /> Despedir</button>
      </div>
    </header>

    <nav class="tabs">
      <button v-for="[id, label] in TABS" :key="id" :class="{ on: tab === id }" @click="tab = id">{{ label }}</button>
    </nav>

    <div class="body">
      <template v-if="tab === 'terminal'">
        <p v-if="e.state === 'blocked'" class="needs"><AlertTriangle /> <b>{{ studio.nameOf(e.id) }} te necesita.</b> Su CLI pide algo: respóndele aquí abajo, en su terminal.</p>
        <div class="screen"><TerminalView :id="e.id" /></div>
        <form class="say" @submit.prevent="say">
          <ChevronRight />
          <input v-model="message" :placeholder="`Escríbele a ${studio.nameOf(e.id)}…`" />
        </form>
      </template>

      <div v-if="tab === 'archivos'" class="files">
        <ul>
          <li v-if="!changes.length" class="dim">Sin cambios en su oficina.</li>
          <li v-for="c in changes" :key="c.path" :class="{ on: openFile === c.path }" @click="showDiff(c.path)"><code>{{ c.status }}</code> {{ c.path }}</li>
        </ul>
        <pre v-if="openFile" class="diff"><span v-for="(l, i) in diff.split('\n')" :key="i" :class="mark(l)">{{ l || ' ' }}
</span></pre>
      </div>

      <div v-if="tab === 'capturas'" class="shots">
        <p v-if="!captures.length" class="dim pad">Aún no hay capturas. Aquí aparecen las imágenes que deje en su oficina al probar la app.</p>
        <figure v-for="c in captures" :key="c.path" @click="zoomed = c.url ?? null">
          <img v-if="c.url" :src="c.url" :alt="c.path" />
          <figcaption :title="c.path">{{ c.path.split('/').pop() }} <small>{{ time(c.at) }}</small></figcaption>
        </figure>
        <div v-if="zoomed" class="zoomed" @click.stop="zoomed = null"><img :src="zoomed" alt="" /></div>
      </div>

      <ol v-if="tab === 'actividad'" class="timeline">
        <li v-if="!activity.length" class="dim">Sin actividad todavía.</li>
        <li v-for="(a, i) in activity" :key="i"><time>{{ time(a.at) }}</time><i :style="{ background: a.state ? `var(--st-${LOOK[a.state].color})` : 'var(--border-light)' }" />{{ a.text }}</li>
      </ol>

      <div v-if="tab === 'tarea'" class="task">
        <span class="cap">Oficina</span>
        <p><code>{{ e.office.path }}</code> · rama <code>{{ e.office.branch }}</code></p>
        <span class="cap">Tareas</span>
        <p v-if="!tasks.length" class="dim">Sin tareas. Se las asigna el jefe.</p>
        <article v-for="t in tasks" :key="t.id" class="card">
          <h3><span class="id">{{ t.id }}</span> {{ t.title }} <span class="chip" :style="{ color: `var(--st-${TASK_COLOR[t.status]})` }">■ {{ capital(TASK_STATUS[t.status]) }}</span></h3>
          <p v-if="t.description && t.description !== t.title">{{ t.description }}</p>
          <p v-if="t.deps.length" class="dim">Depende de: <span v-for="d in t.deps" :key="d">{{ d }} ({{ TASK_STATUS[taskById(d)?.status ?? 'waiting'] }}) </span></p>
          <p v-if="t.qa" :class="t.qa.verdict === 'pass' ? 'good' : 'bad'">QA: {{ t.qa.report }}</p>
        </article>
        <template v-if="e.warnings.length">
          <span class="cap">Avisos</span>
          <p v-for="w in e.warnings" :key="w" class="bad">{{ w }}</p>
        </template>
      </div>

      <div v-if="tab === 'bitacora'" class="journal">
        <p v-if="!sections.length" class="dim">Aún no hay bitácora. Es su memoria entre reinicios y la capacitación de quien ocupe su puesto.</p>
        <article v-for="s in sections" :key="s.title" class="card">
          <h3><span class="title-pixel" :class="s.title.toLowerCase()">{{ s.title }}</span> <small class="dim">{{ NOTE[s.title.toLowerCase()] }}</small></h3>
          <p v-for="(l, i) in s.lines" :key="i">{{ l }}</p>
        </article>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.drawer { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.drawer.float { position: fixed; right: 16px; top: 96px; bottom: 16px; width: min(640px, 56vw); z-index: 6; }
.drawer.split { grid-row: 2; grid-column: 2; border-width: 0 0 0 3px; box-shadow: none; }
header { display: flex; align-items: flex-start; gap: 12px; padding: 14px; background: var(--surface-2); border-bottom: 3px solid var(--border); }
.avatar { width: 48px; height: 56px; object-fit: contain; image-rendering: pixelated; background: var(--bg); border: 2px solid var(--border); padding: 4px; flex: none; }
.who { flex: 1; min-width: 0; }
h2 { margin: 0; display: flex; align-items: center; gap: 10px; text-transform: none; letter-spacing: 0; }
.dim { margin: 0; font-size: 11px; line-height: 1.6; color: var(--text-secondary); }
.who .dim { margin-top: 6px; }
.ctx { margin: 8px 0 0; display: flex; align-items: center; gap: 10px; }
.now { margin: 6px 0 0; font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.now b { color: var(--st-work); }
.over { margin: 6px 0 0; font-size: 11px; color: var(--st-block); }
.actions { display: grid; grid-template-columns: auto auto; gap: 6px; flex: none; }
.tabs { display: flex; gap: 4px; padding: 10px 14px 0; border-bottom: 3px solid var(--border); background: var(--surface); }
.tabs button { border: 2px solid var(--border); border-bottom: 0; background: var(--surface-2); color: var(--text-secondary); padding: 7px 12px; font: 700 12px var(--font); }
.tabs button.on { background: var(--accent); color: var(--on-accent); }
.body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 14px; overflow: auto; }
.needs { margin: 0; display: flex; align-items: center; gap: 8px; padding: 10px 12px; font-size: 12px; background: var(--tint-danger); border: 2px solid var(--st-block); }
.needs svg { width: 16px; height: 16px; color: var(--st-block); flex: none; }
.needs b { color: var(--st-block); }
.screen { flex: 1; min-height: 160px; display: flex; background: var(--term-bg); border: 2px solid var(--border-light); overflow: hidden; }
.say { display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--bg); border: 2px solid var(--border); }
.say svg { width: 14px; height: 14px; color: var(--accent); flex: none; }
.say input { flex: 1; border: 0; background: none; padding: 10px 0; font: 12px var(--font); color: var(--text-primary); outline: none; }
.pad { padding: 4px 0; }
.shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; align-content: start; }
.shots .pad { grid-column: 1 / -1; }
.shots figure { margin: 0; background: var(--bg); border: 2px solid var(--border); cursor: zoom-in; }
.shots figure img { display: block; width: 100%; height: 120px; object-fit: cover; object-position: top; background: var(--surface); }
.shots figcaption { padding: 5px 8px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-top: 2px solid var(--border); }
.shots small { color: var(--text-secondary); }
.zoomed { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; background: var(--veil); cursor: zoom-out; }
.zoomed img { max-width: 100%; max-height: 100%; border: 3px solid var(--border); box-shadow: 4px 4px 0 var(--shadow); }
.files { flex: 1; min-height: 0; display: grid; grid-template-rows: auto 1fr; gap: 10px; }
.files ul { list-style: none; margin: 0; padding: 6px; font-size: 12px; background: var(--bg); border: 2px solid var(--border); max-height: 180px; overflow: auto; }
.files li { padding: 4px 8px; cursor: pointer; }
.files li:hover, .files li.on { background: var(--surface-2); }
.files code { color: var(--accent); margin-right: 6px; }
.diff { margin: 0; overflow: auto; font: 12px/1.6 var(--font); background: var(--term-bg); border: 2px solid var(--border); }
.diff span { display: block; padding: 0 10px; white-space: pre; }
.diff .add { background: var(--tint-ok); }
.diff .del { background: var(--tint-danger); }
.diff .hunk { color: var(--text-secondary); }
.timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
.timeline li { display: flex; align-items: center; gap: 10px; }
.timeline time { color: var(--text-secondary); font-size: 11px; }
.timeline i { width: 8px; height: 8px; flex: none; }
.task, .journal { display: flex; flex-direction: column; gap: 10px; font-size: 12px; }
.task p, .journal p { margin: 0; line-height: 1.7; }
.task code { color: var(--accent); }
.card { background: var(--bg); border: 2px solid var(--border); padding: 12px; display: flex; flex-direction: column; gap: 6px; }
h3 { margin: 0; display: flex; align-items: center; gap: 10px; font: 700 12px var(--font); }
h3 .title-pixel { font-size: 16px; }
h3 .traspaso { color: var(--st-work); }
h3 .hechos { color: var(--accent); }
.id { color: var(--accent); }
.good { color: var(--st-idle); }
.bad { color: var(--st-block); }
</style>

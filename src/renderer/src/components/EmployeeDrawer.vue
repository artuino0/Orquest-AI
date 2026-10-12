<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { AlertTriangle, AppWindow, ChevronRight, Columns2, File, Folder, FolderOpen, Gamepad2, Lock, Maximize2, Minimize2, RotateCcw, UserMinus, X } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import { EFFORT_LABEL, LOOK, lookOf } from '../status'
import { charUrl } from '../characters'
import TerminalView from './TerminalView.vue'
import type { Capture, FileChange, FileEntry } from '../../../shared/ipc'
import { capital, TASK_COLOR, TASK_STATUS } from './taskLabels'
import { T } from '../../../core/i18n'
import CodeView from './CodeView.vue'

type Tab = 'terminal' | 'chat' | 'archivos' | 'capturas' | 'actividad' | 'tarea' | 'bitacora'
const TABS: [Tab, string][] = [
  ['terminal', T`Terminal`],
  ['chat', T`Chat`],
  ['archivos', T`Archivos`],
  ['capturas', T`Capturas`],
  ['actividad', T`Actividad`],
  ['tarea', T`Tarea`],
  ['bitacora', T`Bitácora`],
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
    .map((m) => ({ at: m.at, text: m.from === e.value.id ? T`→ ${studio.nameOf(m.to)}: ${m.text}` : T`← ${studio.nameOf(m.from)}: ${m.text}`, state: undefined }))
  return [...mine, ...said].sort((a, b) => b.at - a.at)
})
/**
 * Su conversación con el jefe, para leerla como chat. Es solo lectura: las
 * instrucciones se le dan al jefe, que es quien coordina.
 * Lo que la app le avisa ([Orquest] …: tarea nueva, entrega regresada) va como nota al centro;
 * "El jefe dice: …" se salta porque ya sale como mensaje del jefe.
 */
const chat = computed(() =>
  (studio.board?.messages ?? [])
    .filter((m) => (m.from === e.value.id || m.to === e.value.id) && !(m.from === 'orquest' && m.text.startsWith(`[Orquest] ${T`El jefe dice:`}`)))
    .map((m) => ({
      at: m.at,
      kind: m.from === 'orquest' ? 'note' : m.from === e.value.id ? 'own' : 'other',
      who: m.from === 'orquest' ? 'Orquest' : m.from === e.value.id ? (m.to === 'tablero' ? T`${studio.nameOf(m.from)} · nota en el tablero` : studio.nameOf(m.from)) : m.from === 'usuario' ? T`Tú, en su terminal` : studio.nameOf(m.from),
      text: m.from === 'orquest' ? m.text.replace(/^\[Orquest\]\s*/, '') : m.text,
    })),
)
const chatLog = ref<HTMLDivElement>()
// Al abrirlo, lo último. Después solo baja solo si ya estabas al final: no te mueve mientras lees.
let chatAtBottom = true
const chatLook = () => {
  const el = chatLog.value
  if (el) chatAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}
watch(() => [tab.value, e.value.id], async () => {
  if (tab.value !== 'chat') return
  await nextTick()
  chatLog.value?.scrollTo(0, chatLog.value.scrollHeight)
  chatAtBottom = true
})
watch(() => chat.value.length, async () => {
  if (tab.value !== 'chat' || !chatAtBottom) return
  await nextTick()
  chatLog.value?.scrollTo(0, chatLog.value.scrollHeight)
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
    else if (l.trim()) (out.at(-1) ?? (out.push({ title: T`Bitácora`, lines: [] }), out[0])).lines.push(l.replace(/^[-*]\s+/, ''))
  }
  return out.filter((s) => s.lines.length)
})
const NOTE: Record<string, string> = { traspaso: T`lo escribe el agente`, hechos: T`los escribe la app · solo lectura` }

async function loadJournal() {
  journal.value = await window.orquest.journal(e.value.id)
}
// Capturas: las imágenes que dejó en su oficina. Se traen sus bytes y se pintan desde memoria.
const captures = ref<(Capture & { url?: string })[]>([])
const urls = new Map<string, string>()
const zoomed = ref<string | null>(null)
/** En la vista grande: ajustada al ancho (se recorre hacia abajo) o a tamaño real (se recorre en ambos sentidos). */
const fit = ref(true)
const zoomedName = computed(() => captures.value.find((c) => c.url === zoomed.value)?.path ?? '')
const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && (zoomed.value = null)
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
/** true mientras se busca por primera vez: para no decir "no hay" antes de saberlo. */
const searching = ref(false)
const withUrls = (list: Capture[]) => list.map((c) => ({ ...c, url: urls.get(`${c.path}@${c.at}`) }))
async function loadCaptures() {
  const id = e.value.id
  if (!captures.value.length) searching.value = true
  const list = await window.orquest.captures(id).catch(() => [])
  if (id !== e.value.id) return
  searching.value = false
  // Primero la lista (cada una dice "Cargando…") y luego las imágenes, una por una.
  captures.value = withUrls(list)
  for (const c of list) {
    const key = `${c.path}@${c.at}`
    if (urls.has(key)) continue
    const img = await window.orquest.capture(id, c.path).catch(() => null)
    if (img) urls.set(key, URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: img.type })))
    else urls.set(key, '')
    if (id === e.value.id) captures.value = withUrls(list)
  }
}
onBeforeUnmount(() => urls.forEach((u) => URL.revokeObjectURL(u)))

async function loadChanges() {
  changes.value = await window.orquest.changes(e.value.id)
}
/** Un plan guardado o un archivo del explorador se leen tal cual; un cambio, como diferencia contra lo que había. */
const openPlan = ref(false)
/** Un aviso en lugar del archivo: no es texto, o no se pudo abrir. */
const notice = ref('')
/** Como estaba antes, si lo abierto es un cambio: el editor muestra los dos lados. */
const before = ref<string | null>(null)
const fail = (err: unknown) => (notice.value = err instanceof Error ? err.message : String(err))
const NOT_TEXT = () => T`Este archivo no es de texto: no se muestra aquí.`
const LONG = () => T`El archivo es largo: aquí solo sale el principio.`
// Editar: solo un archivo que se leyó entero (trae sello) y mientras su agente no trabaja.
const code = ref<InstanceType<typeof CodeView>>()
/** Sello de lo que hay en disco; vacío = no se puede editar (plan, cortado, binario, borrado). */
const stamp = ref('')
/** Lo que hay en disco y lo que hay en el editor. */
const onDisk = ref('')
const draft = ref('')
const dirty = computed(() => !!stamp.value && draft.value !== onDisk.value)
/** En calma: quien trabaja sigue «trabajando» entre paso y paso, así el candado no parpadea. */
const locked = computed(() => ['working', 'starting'].includes(studio.calmStateOf(e.value)))
const editable = computed(() => !!stamp.value && !locked.value)
const saving = ref(false)
const fileError = ref('')
/** Con cambios sin guardar no se abre otro archivo ni se cierra el panel: primero guardar o descartar. */
function keepDraft(path?: string): boolean {
  if (!dirty.value || path === openFile.value) return false
  fileError.value = T`Tienes cambios sin guardar en ${openFile.value ?? ''}: guárdalos o descártalos primero.`
  tab.value = 'archivos'
  return true
}
function loaded(text: string, mark: string) {
  // El editor no muestra la marca de inicio (BOM): se compara sin ella; al guardar se conserva.
  diff.value = onDisk.value = draft.value = text.replace(/^\uFEFF/, '')
  stamp.value = mark
  viewKey.value++
}
/** Cada apertura estrena editor: así «Descartar» y volver a abrir traen lo del disco aunque el texto sea el mismo. */
const viewKey = ref(0)
function opening(path: string, plan: boolean) {
  openFile.value = path
  openPlan.value = plan
  notice.value = fileError.value = ''
  before.value = null
  cut.value = false
  stamp.value = ''
  tab.value = 'archivos'
}
async function showDiff(path: string, status = '') {
  if (keepDraft(path)) return
  opening(path, status === 'plan')
  try {
    if (openPlan.value) {
      diff.value = await window.orquest.documentText(path)
      viewKey.value++
      return
    }
    const sides = await window.orquest.fileSides(e.value.id, path)
    if (sides.binary) notice.value = NOT_TEXT()
    cut.value = sides.truncated
    loaded(sides.after, sides.stamp)
    before.value = sides.before
  } catch (err) {
    fail(err)
  }
}
async function save() {
  if (!dirty.value || saving.value || !openFile.value) return
  if (locked.value) {
    fileError.value = T`${studio.nameOf(e.value.id)} está trabajando: espera a que termine para guardar. Tus cambios siguen en el editor.`
    return
  }
  saving.value = true
  fileError.value = ''
  try {
    const text = draft.value
    stamp.value = (await window.orquest.saveFile(e.value.id, openFile.value, text, stamp.value)).stamp
    onDisk.value = text
    void loadChanges()
  } catch (err) {
    fileError.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}
async function format() {
  if (!editable.value || !openFile.value) return
  fileError.value = ''
  try {
    const pretty = await window.orquest.formatFile(e.value.id, openFile.value, draft.value)
    if (pretty !== draft.value) code.value?.replace(pretty)
  } catch (err) {
    fileError.value = err instanceof Error ? err.message : String(err)
  }
}
/** Tira lo que se escribió y vuelve a traer el archivo como está en disco. */
function discard() {
  const path = openFile.value
  if (!path) return
  draft.value = onDisk.value
  void (before.value === null ? showFile(path) : showDiff(path))
}
/** Lo abierto llegó cortado por largo. */
const cut = ref(false)

// Explorador: el árbol de su oficina. Cada carpeta se pide al abrirla.
const filesView = ref<'changes' | 'tree'>('changes')
const kids = ref<Record<string, FileEntry[]>>({})
const opened = ref(new Set<string>())
/** Las filas a la vista: cada carpeta abierta trae las suyas debajo, con sangría. */
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
  const id = e.value.id
  const list = await window.orquest.tree(id, dir).catch(() => [] as FileEntry[])
  if (id === e.value.id) kids.value = { ...kids.value, [dir]: list }
}
const loadTree = () => Promise.all(['', ...opened.value].map(loadDir))
function toggleDir(path: string) {
  const next = new Set(opened.value)
  if (next.has(path)) next.delete(path)
  else {
    next.add(path)
    void loadDir(path)
  }
  opened.value = next
}
async function showFile(path: string) {
  if (keepDraft(path)) return
  opening(path, false)
  try {
    const f = await window.orquest.fileText(e.value.id, path)
    if (f.binary) notice.value = NOT_TEXT()
    cut.value = f.truncated
    loaded(f.text, f.stamp)
  } catch (err) {
    fail(err)
  }
}

/** Los archivos van en su pestaña o, a pantalla completa, siempre a la vista en una columna. */
const filesOn = computed(() => studio.drawerFull || tab.value === 'archivos')
function refresh() {
  if (filesOn.value) {
    void loadChanges()
    void loadTree()
  }
  if (tab.value === 'capturas') void loadCaptures()
  if (tab.value === 'bitacora') void loadJournal()
}
let timer: ReturnType<typeof setInterval> | undefined
watch(
  [tab, filesOn],
  () => {
    clearInterval(timer)
    refresh()
    if (filesOn.value || tab.value === 'capturas' || tab.value === 'bitacora') timer = setInterval(refresh, 3000)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(timer))
function close() {
  if (keepDraft()) return
  studio.drawerFull = false
  studio.select(null)
}

// Escribirle sin entrar a la terminal: el texto y Enter van directo a su CLI.
const message = ref('')
function say() {
  if (!message.value.trim()) return
  // Lo envía el estudio: escribe, espera a que la CLI lo reciba y da Enter (otra vez si no entró).
  void studio.attempt(() => window.orquest.say(e.value.id, message.value))
  message.value = ''
}

const time = (t: number) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
</script>

<template>
  <aside class="drawer panel" :class="[studio.drawerMode, { full: studio.drawerFull }]">
    <header>
      <img class="avatar" :src="avatar" alt="" />
      <div class="who">
        <h2><span class="title-pixel">{{ studio.nameOf(e.id) }}</span> <span class="chip" :style="{ color: `var(--st-${look.color})` }">■ {{ look.label }}</span></h2>
        <p class="dim">{{ e.role }} · {{ cli }}<template v-if="e.model"> · {{ e.model }}</template><template v-if="e.effort"> · {{ T`esfuerzo ${EFFORT_LABEL[e.effort].toLowerCase()}` }}</template></p>
        <p class="ctx">
          <span class="cap">{{ T`Contexto` }}</span>
          <span class="meter" :class="{ hot }"><i><b :style="{ width: `${context ?? 0}%` }" /></i>{{ context === undefined ? T`sin dato` : `${Math.round(context)}%` }}</span>
        </p>
        <p v-if="e.state === 'working' && studio.doing[e.id]" class="now"><b>{{ studio.doing[e.id].label }}…</b> {{ studio.doing[e.id].detail }}</p>
        <p v-if="hot" class="over">{{ T`Pasó el umbral de ${burnoutAt} %. Mándalo a Descanso para limpiar contexto.` }}</p>
      </div>
      <div class="actions">
        <select v-if="studio.drawerFull && studio.employees.length > 1" class="switch" :disabled="dirty" :value="e.id" :title="T`Ver la oficina de otra persona`" @change="studio.select(($event.target as HTMLSelectElement).value)">
          <option v-for="p in studio.employees" :key="p.id" :value="p.id">{{ studio.nameOf(p.id) }} · {{ p.role }}</option>
        </select>
        <button class="btn" :title="T`Sus archivos y su terminal ocupando toda la ventana`" @click="studio.drawerFull = !studio.drawerFull">
          <template v-if="studio.drawerFull"><Minimize2 /> {{ T`Reducir` }}</template><template v-else><Maximize2 /> {{ T`Pantalla completa` }}</template>
        </button>
        <button v-if="!studio.drawerFull" class="btn" @click="studio.drawerMode = studio.drawerMode === 'float' ? 'split' : 'float'">
          <template v-if="studio.drawerMode === 'float'"><Columns2 /> {{ T`Dividir` }}</template><template v-else><AppWindow /> {{ T`Flotante` }}</template>
        </button>
        <button class="btn" @click="close"><X /> {{ T`Cerrar` }}</button>
        <button class="btn" :disabled="gaming || e.state === 'exited'" :title="T`Escribe su traspaso y se reinicia con el contexto limpio`" @click="studio.rest(e.id)"><Gamepad2 /> {{ T`Descanso` }}</button>
        <button class="btn" :disabled="gaming" :title="T`Cierra su terminal y abre otra: conversación nueva, con sus instrucciones y su bitácora. Úsalo si se quedó atorada.`" @click="studio.restart(e.id)"><RotateCcw /> {{ T`Reiniciar` }}</button>
        <button class="btn danger" @click="studio.fire(e.id)"><UserMinus /> {{ T`Despedir` }}</button>
      </div>
    </header>

    <nav class="tabs">
      <button v-for="[id, label] in TABS" :key="id" :class="{ on: tab === id }" @click="tab = id">{{ label }}</button>
    </nav>

    <div class="work" :class="{ ide: studio.drawerFull }">
    <div v-if="filesOn" class="side">
      <nav class="seg">
        <button :class="{ on: filesView === 'changes' }" @click="filesView = 'changes'">{{ T`Cambios` }}<template v-if="changes.length"> · {{ changes.length }}</template></button>
        <button :class="{ on: filesView === 'tree' }" @click="filesView = 'tree'">{{ T`Explorador` }}</button>
      </nav>
      <ul v-if="filesView === 'changes'">
        <li v-if="!changes.length" class="dim">{{ e.id === 'jefe' ? T`Sin planes guardados ni cambios en el repo.` : T`Sin cambios en su oficina.` }}</li>
        <li v-for="c in changes" :key="c.path" :class="{ on: openFile === c.path }" :title="c.path" @click="showDiff(c.path, c.status)"><code>{{ c.status }}</code> {{ c.path }}</li>
      </ul>
      <ul v-else>
        <li v-if="!rows.length" class="dim">{{ T`No hay archivos en su oficina.` }}</li>
        <li v-for="f in rows" :key="f.path" :class="{ on: openFile === f.path }" :style="{ paddingLeft: `${8 + f.depth * 14}px` }" :title="f.path" @click="f.dir ? toggleDir(f.path) : showFile(f.path)">
          <component :is="f.dir ? (opened.has(f.path) ? FolderOpen : Folder) : File" :class="{ folder: f.dir }" />{{ f.name }}
        </li>
      </ul>
    </div>
    <div class="body">
      <template v-if="tab === 'terminal'">
        <p v-if="e.state === 'blocked'" class="needs"><AlertTriangle /> <b>{{ T`${studio.nameOf(e.id)} te necesita.` }}</b> {{ T`Su CLI pide algo: respóndele aquí abajo, en su terminal.` }}</p>
        <div class="screen"><TerminalView :id="e.id" /></div>
        <form class="say" @submit.prevent="say">
          <ChevronRight />
          <input v-model="message" :placeholder="T`Escríbele a ${studio.nameOf(e.id)}…`" />
        </form>
      </template>

      <div v-if="tab === 'archivos'" class="files">
        <p v-if="!openFile" class="dim">{{ T`Elige un archivo para verlo.` }}</p>
        <div v-else class="bar">
          <p class="path"><code>{{ openFile }}</code><b v-if="dirty" class="unsaved"> ● {{ T`sin guardar` }}</b><template v-if="cut"> · {{ LONG() }}</template></p>
          <template v-if="stamp && !notice">
            <span v-if="locked" class="lock"><Lock /> {{ T`Solo lectura mientras ${studio.nameOf(e.id)} trabaja` }}</span>
            <button class="btn" :disabled="!editable" :title="T`Acomoda el código con Prettier (Shift+Alt+F). No guarda.`" @click="format">{{ T`Formatear` }}</button>
            <button class="btn" :disabled="!dirty" @click="discard">{{ T`Descartar` }}</button>
            <button class="btn primary" :disabled="!dirty || locked || saving" :title="T`Guardar (Ctrl+S)`" @click="save">{{ saving ? T`Guardando…` : T`Guardar` }}</button>
          </template>
        </div>
        <p v-if="openFile && fileError" class="bad">{{ fileError }}</p>
        <p v-if="openFile && notice" class="dim">{{ notice }}</p>
        <!-- El editor: un archivo o plan entero, o un cambio con sus dos lados. Se escribe solo si su agente no trabaja. -->
        <CodeView v-else-if="openFile" ref="code" :key="viewKey" class="code" :path="openFile" :text="diff" :original="before" :editable="editable" @change="draft = $event" @save="save" @format="format" />
      </div>

      <div v-if="tab === 'capturas'" class="shots">
        <p v-if="searching" class="dim pad">{{ T`Buscando capturas en su oficina…` }}</p>
        <p v-else-if="!captures.length" class="dim pad">{{ T`Aún no hay capturas. Aquí aparecen las imágenes que deje en su oficina al probar la app.` }}</p>
        <figure v-for="c in captures" :key="c.path" @click="zoomed = c.url || null">
          <img v-if="c.url" :src="c.url" :alt="c.path" />
          <div v-else class="wait">{{ c.url === '' ? T`No se pudo abrir` : T`Cargando…` }}</div>
          <figcaption :title="c.path">{{ c.path.split('/').pop() }} <small>{{ time(c.at) }}</small></figcaption>
        </figure>
        <!-- Vista grande: la imagen a su ancho y, si es larga, se recorre hacia abajo -->
        <div v-if="zoomed" class="zoomed" @click.self="zoomed = null">
          <div class="viewer">
            <header>
              <b>{{ zoomedName }}</b>
              <button class="btn" :title="fit ? T`Ver a tamaño real` : T`Ajustar al ancho`" @click="fit = !fit">{{ fit ? T`Tamaño real` : T`Ajustar al ancho` }}</button>
              <button class="btn" @click="zoomed = null"><X /> {{ T`Cerrar` }}</button>
            </header>
            <div class="scroll"><img :src="zoomed" :class="{ fit }" alt="" /></div>
          </div>
        </div>
      </div>

      <div v-if="tab === 'chat'" class="chat">
        <div ref="chatLog" class="chat-log" @scroll.passive="chatLook">
          <div class="spacer" />
          <p v-if="!chat.length" class="dim">{{ T`Aún no ha hablado con el jefe. Aquí sale lo que el jefe le pide, lo que pregunta y lo que contesta.` }}</p>
          <div v-for="(m, i) in chat" :key="i" class="bubble" :class="m.kind">
            <span class="who">{{ m.who }} · {{ time(m.at) }}</span>
            <p>{{ m.text }}</p>
          </div>
        </div>
        <p class="dim readonly">{{ T`Solo lectura. Lo que quieras pedirle, díselo al jefe: él coordina y así el tablero no se desfasa.` }}</p>
      </div>

      <ol v-if="tab === 'actividad'" class="timeline">
        <li v-if="!activity.length" class="dim">{{ T`Sin actividad todavía.` }}</li>
        <li v-for="(a, i) in activity" :key="i"><time>{{ time(a.at) }}</time><i :style="{ background: a.state ? `var(--st-${LOOK[a.state].color})` : 'var(--border-light)' }" />{{ a.text }}</li>
      </ol>

      <div v-if="tab === 'tarea'" class="task">
        <span class="cap">{{ T`Oficina` }}</span>
        <p><code>{{ e.office.path }}</code><template v-if="e.office.branch"> · {{ T`rama` }} <code>{{ e.office.branch }}</code></template></p>
        <span class="cap">{{ T`Tareas` }}</span>
        <p v-if="!tasks.length" class="dim">{{ T`Sin tareas. Se las asigna el jefe.` }}</p>
        <article v-for="t in tasks" :key="t.id" class="card">
          <h3><span class="id">{{ t.id }}</span> {{ t.title }} <span class="chip" :style="{ color: `var(--st-${TASK_COLOR[t.status]})` }">■ {{ capital(TASK_STATUS[t.status]) }}</span></h3>
          <p v-if="t.description && t.description !== t.title">{{ t.description }}</p>
          <p v-if="t.deps.length" class="dim">{{ T`Depende de:` }} <span v-for="d in t.deps" :key="d">{{ d }} ({{ TASK_STATUS[taskById(d)?.status ?? 'waiting'] }}) </span></p>
          <p v-if="t.qa" :class="t.qa.verdict === 'pass' ? 'good' : 'bad'">QA: {{ t.qa.report }}</p>
        </article>
        <template v-if="e.warnings.length">
          <span class="cap">{{ T`Avisos` }}</span>
          <p v-for="w in e.warnings" :key="w" class="bad">{{ w }}</p>
        </template>
      </div>

      <div v-if="tab === 'bitacora'" class="journal">
        <p v-if="!sections.length" class="dim">{{ T`Aún no hay bitácora. Es su memoria entre reinicios y la capacitación de quien ocupe su puesto.` }}</p>
        <article v-for="s in sections" :key="s.title" class="card">
          <h3><span class="title-pixel" :class="s.title.toLowerCase()">{{ s.title }}</span> <small class="dim">{{ NOTE[s.title.toLowerCase()] }}</small></h3>
          <p v-for="(l, i) in s.lines" :key="i">{{ l }}</p>
        </article>
      </div>
    </div>
    </div>
  </aside>
</template>

<style scoped>
.drawer { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.drawer.float { position: fixed; right: 16px; top: 96px; bottom: 16px; width: min(640px, 56vw); z-index: 6; }
.drawer.split { grid-row: 2; grid-column: 2; border-width: 0 0 0 3px; box-shadow: none; }
/* Pantalla completa: toda la ventana bajo su encabezado (32 px). */
.drawer.full { position: fixed; inset: 32px 0 0 0; width: auto; z-index: 8; border-width: 0; box-shadow: none; }
.switch { font: 700 12px var(--font); padding: 6px 8px; background: var(--bg); color: var(--text-primary); border: 2px solid var(--border-light); max-width: 220px; }
.work { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.work.ide { flex-direction: row; }
.side { display: flex; flex-direction: column; gap: 6px; padding: 14px 14px 0; min-height: 0; }
.work.ide .side { width: 300px; flex: none; padding: 14px 0 14px 14px; }
.seg { display: flex; gap: 4px; }
.seg button { border: 2px solid var(--border); background: var(--surface-2); color: var(--text-secondary); padding: 4px 10px; font: 700 11px var(--font); }
.seg button.on { background: var(--accent); color: var(--on-accent); }
.side ul { list-style: none; margin: 0; padding: 6px; font-size: 12px; background: var(--bg); border: 2px solid var(--border); max-height: 180px; overflow: auto; }
.work.ide .side ul { max-height: none; flex: 1; }
.side li { padding: 4px 8px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.side li:hover, .side li.on { background: var(--surface-2); }
.side li.dim { cursor: default; white-space: normal; }
.side li.dim:hover { background: none; }
.side code { color: var(--accent); margin-right: 6px; }
.side li svg { width: 13px; height: 13px; margin-right: 6px; vertical-align: -2px; color: var(--text-secondary); }
.side li svg.folder { color: var(--accent); }
.code { flex: 1; min-height: 0; border: 2px solid var(--border); }
.path { margin: 0; font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
/* A pantalla completa sobra ancho: los botones van en un renglón y el encabezado no crece. */
.drawer.full .actions { display: flex; align-items: center; }
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
.shots .wait { height: 120px; display: grid; place-items: center; font-size: 11px; color: var(--text-secondary); background: var(--surface); }
.shots figcaption { padding: 5px 8px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-top: 2px solid var(--border); }
.shots small { color: var(--text-secondary); }
.zoomed { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 48px 24px 24px; background: var(--veil); }
.viewer { display: flex; flex-direction: column; width: min(1100px, 100%); height: 100%; min-height: 0; background: var(--surface); border: 3px solid var(--border); box-shadow: 4px 4px 0 var(--shadow); }
.viewer header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--surface-2); border-bottom: 3px solid var(--border); }
.viewer header b { flex: 1; min-width: 0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.viewer .scroll { flex: 1; min-height: 0; overflow: auto; background: var(--bg); }
.viewer img { display: block; max-width: none; margin: 0 auto; }
.viewer img.fit { max-width: 100%; height: auto; }
.files { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.files > p { margin: 0; }
.bar { display: flex; align-items: center; gap: 6px; min-height: 30px; }
.bar .path { flex: 1; min-width: 0; }
.bar .btn { padding: 4px 10px; }
.unsaved { color: var(--accent); font-weight: 700; }
.lock { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
.lock svg { width: 12px; height: 12px; }
.chat { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.chat-log { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 10px; background: var(--bg); border: 2px solid var(--border); }
.chat-log .spacer { flex: 1; }
.bubble { align-self: flex-start; max-width: 78%; padding: 8px 12px; background: var(--surface); border-left: 3px solid var(--accent); }
.bubble .who { font-size: 10px; font-weight: 700; color: var(--accent); }
.bubble p { margin: 4px 0 0; font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.bubble.own { align-self: flex-end; border-left: 0; border-right: 3px solid var(--st-work); }
.bubble.own .who { color: var(--st-work); }
.bubble.note { align-self: center; max-width: 90%; padding: 4px 10px; background: none; border: 1px dashed var(--border-light); }
.bubble.note .who { color: var(--text-secondary); }
.bubble.note p { margin-top: 2px; font-size: 11px; color: var(--text-secondary); }
.readonly { margin: 0; font-size: 10px; }
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

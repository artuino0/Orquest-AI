<script setup lang="ts">
/**
 * Historial: el grafo de commits del repositorio (carriles de color por rama,
 * merges) con las integraciones resaltadas y, a la derecha, el detalle de lo
 * elegido (rama → destino, de quién, archivos, PR, diff, revertir). La otra
 * pestaña lista cada copia de trabajo (worktree), también las que no hizo
 * Orquest. Todo lo calcula el núcleo; aquí solo se pide y se muestra.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ExternalLink, FileText, FolderOpen, GitBranch, GitMerge, GitPullRequest, Home, Info, Loader2, Files, RefreshCw, Trash2, Undo2 } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import type { CommitFile, ForgeStatus, HistoryRow, HistoryView, IntegrationView, PullRequest, WorktreeRow } from '../../../shared/ipc'
import { diffMark, parseDiff } from '../diff'
import { ago } from '../format'
import { useCanvas } from '../stores/canvas'
import { useStudio } from '../stores/studio'

const studio = useStudio()
const canvas = useCanvas()

const tab = ref<'graph' | 'worktrees'>('graph')
/** El repositorio a la vista cuando el proyecto agrupa varios; undefined: el primero. */
const repo = ref<string | undefined>(undefined)
const view = ref<HistoryView | null>(null)
const forge = ref<ForgeStatus | null>(null)
const trees = ref<WorktreeRow[] | null>(null)
const sizes = ref<Record<string, number | null>>({})
const loading = ref(false)
const failure = ref<string | null>(null)
const onlyMerges = ref(false)

// ── Cargar ─────────────────────────────────────────────────────────────────
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  try {
    const [h, w] = await Promise.all([window.orquest.history(repo.value), window.orquest.worktrees(repo.value)])
    if (seq !== loadSeq) return
    view.value = h
    trees.value = w
    failure.value = null
    if (!selected.value || !h.rows.some((r) => r.sha === selected.value)) select(h.integrations[0]?.sha ?? h.rows[0]?.sha ?? null)
    void loadSizes(w)
  } catch (e) {
    if (seq === loadSeq) failure.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}
async function loadForge(refresh = false) {
  forge.value = refresh ? null : forge.value
  forge.value = await window.orquest.forge(repo.value, refresh).catch((e) => ({ kind: null, state: 'error' as const, message: e instanceof Error ? e.message : String(e), prs: [] }))
}
/** El peso de cada copia se pide aparte y de una en una: recorrer dependencias tarda. */
async function loadSizes(list: WorktreeRow[]) {
  for (const w of list) {
    if (w.missing || sizes.value[w.path] !== undefined) continue
    sizes.value = { ...sizes.value, [w.path]: null }
    const size = await window.orquest.worktreeSize(w.path).catch(() => -1)
    sizes.value = { ...sizes.value, [w.path]: size }
  }
}
function reload(refreshForge = false) {
  if (refreshForge) sizes.value = {}
  void load()
  void loadForge(refreshForge)
}
watch(repo, () => {
  selected.value = null
  reload()
})
// Algo se integró, se descartó o alguien se fue: el historial cambió.
let boardTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => [studio.board?.tasks.map((t) => `${t.id}:${t.status}`).join(), studio.board?.staff.map((m) => `${m.id}:${m.gone}`).join(), studio.employees.map((e) => `${e.id}:${e.state}`).join()].join('|'),
  () => {
    clearTimeout(boardTimer)
    boardTimer = setTimeout(() => void load(), 600)
  },
)
onBeforeUnmount(() => clearTimeout(boardTimer))

// ── Grafo ──────────────────────────────────────────────────────────────────
const LANE = 14
const ROW = 34
/** Un color por carril; el 0 (la rama actual) es el de acento. */
const COLORS = ['var(--accent)', 'var(--st-block)', 'var(--st-work)', 'var(--st-dep)', 'var(--st-idle)', 'var(--st-play)', 'var(--pv-claude)', 'var(--pv-kimi)']
const color = (col: number) => COLORS[col % COLORS.length]
const laneX = (col: number) => 10 + col * LANE
const graphWidth = computed(() => laneX(Math.max(1, view.value?.width ?? 1) - 1) + 12)

const byIntegration = computed(() => new Map((view.value?.integrations ?? []).map((i) => [i.sha, i])))
const rows = computed(() => (view.value?.rows ?? []).filter((r) => !onlyMerges.value || byIntegration.value.has(r.sha)))
/** Con el filtro, el grafo ya no cuadra renglón con renglón: se dibuja solo el punto. */
const drawLines = computed(() => !onlyMerges.value)

/** Las líneas de un renglón como trazos de SVG (de arriba a abajo, con el punto a la mitad). */
function segments(r: HistoryRow) {
  const l = r.lane
  const mid = ROW / 2
  const out: { d: string; c: string }[] = []
  if (!drawLines.value) return out
  for (const c of l.through) out.push({ d: `M${laneX(c)} 0V${ROW}`, c: color(c) })
  for (const c of l.ins) out.push({ d: `M${laneX(c)} 0C${laneX(c)} ${mid} ${laneX(l.col)} ${mid / 2} ${laneX(l.col)} ${mid}`, c: color(c) })
  if (l.top) out.push({ d: `M${laneX(l.col)} 0V${mid}`, c: color(l.col) })
  if (l.bottom) out.push({ d: `M${laneX(l.col)} ${mid}V${ROW}`, c: color(l.col) })
  for (const c of l.outs) out.push({ d: `M${laneX(l.col)} ${mid}C${laneX(l.col)} ${mid + mid / 2} ${laneX(c)} ${mid} ${laneX(c)} ${ROW}`, c: color(c) })
  return out
}

/** «Revert "T4: Título (nico-frontend)"» → «Título». */
function revertedTitle(subject: string) {
  const inner = /^Revert "(.*)"$/.exec(subject)?.[1] ?? subject
  return /^T\d+: (.*) \([^()]+\)$/.exec(inner)?.[1] ?? inner
}
function label(r: HistoryRow) {
  const i = byIntegration.value.get(r.sha)
  if (i) return T`Integrada: ${i.title}`
  if (r.reverts) return T`Revertida: ${revertedTitle(r.subject)}`
  return r.subject
}
// Las ramas de Orquest se reusan entre tareas: por rama solo cuenta un PR abierto; uno ya integrado se reconoce por su commit.
const prOf = (i?: IntegrationView): PullRequest | undefined => {
  if (!i) return undefined
  const prs = forge.value?.prs ?? []
  return prs.find((p) => p.mergeCommit && i.sha.startsWith(p.mergeCommit.slice(0, 12))) ?? prs.find((p) => i.pr === p.number) ?? prs.find((p) => !!i.branch && p.head === i.branch && p.state === 'open')
}
/** De quién es un renglón: la persona de Orquest que lo hizo o el autor del commit. */
function whoOf(r: HistoryRow): string {
  const i = byIntegration.value.get(r.sha)
  if (i) return i.who?.name ?? (i.orquest ? T`Orquest` : i.author)
  const owner = r.branches.map((b) => view.value?.owners[b]).find(Boolean)
  return owner?.name ?? (r.email === 'orquest@localhost' ? (r.reverts ? T`por ti` : T`Orquest`) : r.author)
}
const kindOf = (i: IntegrationView) => (i.task ? (i.taskKind === 'qa' ? T`QA` : T`tarea`) : i.pr ? T`PR` : T`externa`)

// ── Detalle ────────────────────────────────────────────────────────────────
const selected = ref<string | null>(null)
const files = ref<CommitFile[] | null>(null)
const diff = ref<string | null>(null)
const showDiff = ref(false)
const confirm = ref<'revert' | 'pr' | null>(null)
const busy = ref(false)
const problem = ref<string | null>(null)
const row = computed(() => view.value?.rows.find((r) => r.sha === selected.value) ?? null)
const integration = computed(() => (row.value ? byIntegration.value.get(row.value.sha) : undefined))
const pr = computed(() => prOf(integration.value))
const parsed = computed(() => (diff.value === null ? null : parseDiff(diff.value)))
const totals = computed(() => ({ added: (files.value ?? []).reduce((n, f) => n + f.added, 0), removed: (files.value ?? []).reduce((n, f) => n + f.removed, 0) }))

let fileSeq = 0
async function select(sha: string | null) {
  selected.value = sha
  files.value = null
  diff.value = null
  showDiff.value = false
  confirm.value = null
  problem.value = null
  if (!sha) return
  const seq = ++fileSeq
  const got = await window.orquest.historyFiles(repo.value, sha).catch(() => [])
  if (seq === fileSeq) files.value = got
}
async function toggleDiff() {
  showDiff.value = !showDiff.value
  if (showDiff.value && diff.value === null && selected.value) diff.value = await window.orquest.historyDiff(repo.value, selected.value).catch((e) => `${e instanceof Error ? e.message : e}`)
}
async function act(fn: () => Promise<unknown>) {
  busy.value = true
  problem.value = null
  try {
    await fn()
    confirm.value = null
  } catch (e) {
    problem.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
const revert = () =>
  act(async () => {
    const i = integration.value!
    const commit = await window.orquest.revertIntegration(repo.value, i.sha)
    studio.notice(T`Se revirtió «${i.title}» con el commit ${commit.slice(0, 7)}.`)
    await load()
    void select(commit)
  })
const openPr = () =>
  act(async () => {
    const url = await window.orquest.createPullRequest(repo.value, integration.value!.sha)
    studio.notice(T`Se abrió el PR: ${url}`)
    await loadForge(true)
  })

const forgeName = computed(() => (forge.value?.kind === 'gitlab' ? 'GitLab' : 'GitHub'))
const prWord = computed(() => (forge.value?.kind === 'gitlab' ? 'MR' : 'PR'))
const forgeLine = computed(() => {
  const f = forge.value
  if (!f) return { ok: null, text: T`Consultando GitHub o GitLab…` }
  const open = f.prs.filter((p) => p.state === 'open').length
  switch (f.state) {
    case 'ok':
      return { ok: true, text: open === 1 ? T`${forgeName.value} conectado con ${f.cli} · ${open} ${prWord.value} abierto` : T`${forgeName.value} conectado con ${f.cli} · ${open} ${prWord.value} abiertos` }
    case 'no-cli':
      return { ok: false, text: T`Sin ${f.cli} instalado: solo se ve lo de git local` }
    case 'no-session':
      return { ok: false, text: T`${f.cli} sin sesión (corre ${f.cli} auth login): solo se ve lo de git local` }
    case 'no-remote':
      return { ok: false, text: T`Sin remoto en GitHub ni GitLab: solo git local` }
    default:
      return { ok: false, text: T`${f.cli ?? 'git'} no respondió: ${f.message ?? ''}` }
  }
})

// ── Worktrees ──────────────────────────────────────────────────────────────
const releasing = ref<string | null>(null)
const treeProblem = ref<string | null>(null)
function bytes(n: number | null | undefined): string {
  if (n === undefined) return '—'
  if (n === null) return '…'
  if (n < 0) return '?'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  if (n < 1024 ** 3) return `${Math.round(n / 1024 / 1024)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}
function ownerText(w: WorktreeRow): string {
  switch (w.owner.kind) {
    case 'project':
      return T`Carpeta del proyecto`
    case 'employee':
      return w.owner.gone ? T`${w.owner.name} · ya no está` : `${w.owner.name} · ${w.owner.role}`
    case 'orphan':
      return T`Oficina sin dueño`
    default:
      return T`No es de Orquest`
  }
}
function branchNote(w: WorktreeRow): string {
  if (w.owner.kind === 'project') return T`aquí se integra todo`
  if (w.owner.kind === 'foreign') return T`lo creó otra herramienta: ${w.path}`
  if (!w.branch) return T`en un commit suelto (${w.head.slice(0, 7)})`
  const parts = [T`salió de ${w.base}`]
  if (w.ahead) parts.push(w.ahead === 1 ? T`${w.ahead} commit adelante` : T`${w.ahead} commits adelante`)
  if (w.behind) parts.push(T`${w.behind} atrás`)
  if (!w.ahead && w.ahead !== undefined) parts.push(T`ya integrada`)
  return parts.join(' · ')
}
function stateOf(w: WorktreeRow): { text: string; color: string } {
  if (w.missing) return { text: T`su carpeta ya no está`, color: 'var(--st-block)' }
  if (w.working) return { text: T`trabajando`, color: 'var(--st-work)' }
  if (w.files) return { text: w.files === 1 ? T`${w.files} archivo sin entregar` : T`${w.files} archivos sin entregar`, color: 'var(--accent)' }
  if (w.owner.kind === 'foreign') return { text: T`solo se muestra`, color: 'var(--text-secondary)' }
  return { text: w.canRelease ? T`limpia · nada pendiente` : T`limpia`, color: 'var(--st-idle)' }
}
const live = (w: WorktreeRow) => w.owner.kind === 'employee' && w.owner.live && studio.employees.some((e) => e.id === (w.owner as { id: string }).id)
async function openFolder(path: string) {
  treeProblem.value = null
  await window.orquest.openWorktree(path).catch((e) => (treeProblem.value = e instanceof Error ? e.message : String(e)))
}
async function release(w: WorktreeRow) {
  busy.value = true
  treeProblem.value = null
  try {
    await window.orquest.releaseWorktree(w.path)
    releasing.value = null
    delete sizes.value[w.path]
    await load()
  } catch (e) {
    treeProblem.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
const openUrl = (url: string) => void window.orquest.openExternal(url)
const provider = (id?: string) => studio.clis.find((c) => c.id === id)?.name ?? id ?? ''
/** El repositorio que muestra el selector: el elegido o, sin elegir, el que vino. */
const shownRepo = computed({ get: () => repo.value ?? view.value?.repo, set: (name) => (repo.value = name) })

reload()
</script>

<template>
  <div class="hist">
    <div class="tools">
      <div class="tabs">
        <button :class="{ on: tab === 'graph' }" @click="tab = 'graph'">{{ T`Grafo` }}</button>
        <button :class="{ on: tab === 'worktrees' }" @click="tab = 'worktrees'">{{ T`Worktrees` }}<template v-if="trees"> · {{ trees.length }}</template></button>
      </div>
      <label v-if="view?.repos.length" class="repo" :title="T`Un grafo por repositorio`">
        <GitBranch />
        <select v-model="shownRepo">
          <option v-for="r in view.repos" :key="r" :value="r">{{ r }}</option>
        </select>
      </label>
      <span class="dim small">
        <template v-if="view?.repos.length">{{ T`un grafo por repositorio` }}</template>
        <template v-else-if="tab === 'graph' && view?.branch">{{ T`se integra en ${view.branch}` }}</template>
        <template v-else-if="tab === 'worktrees'">{{ T`cada copia de trabajo del repositorio, sea de quien sea` }}</template>
      </span>
      <label v-if="tab === 'graph'" class="check small"><input v-model="onlyMerges" type="checkbox" /> {{ T`Solo integraciones` }}</label>
      <span class="grow" />
      <span v-if="tab === 'graph'" class="forge small" :title="forge?.remote">
        <i :class="{ ok: forgeLine.ok === true, off: forgeLine.ok === false }" />{{ forgeLine.text }}
      </span>
      <span v-else class="dim small">{{ T`peso en disco · cada una instala sus dependencias` }}</span>
      <button class="btn icon" :disabled="loading" :title="T`Volver a leer`" @click="reload(true)"><RefreshCw :class="{ spin: loading }" /></button>
    </div>

    <p v-if="failure" class="fail">{{ failure }}</p>

    <!-- Grafo y detalle -->
    <div v-else-if="tab === 'graph'" class="split">
      <div class="list">
        <p v-if="view && !rows.length" class="blank">{{ onlyMerges ? T`Todavía no hay integraciones en ${view.branch}.` : T`Este repositorio todavía no tiene commits.` }}</p>
        <button
          v-for="r in rows"
          :key="r.sha"
          class="row"
          :class="{ on: r.sha === selected, merge: byIntegration.has(r.sha), reverted: !!byIntegration.get(r.sha)?.revertedBy, revert: r.reverts }"
          @click="select(r.sha)"
        >
          <svg class="lanes" :width="graphWidth" :height="ROW" :viewBox="`0 0 ${graphWidth} ${ROW}`">
            <path v-for="(s, k) in segments(r)" :key="k" :d="s.d" :stroke="s.c" stroke-width="2" fill="none" />
            <rect
              :x="laneX(r.lane.col) - (byIntegration.has(r.sha) ? 6 : 4)"
              :y="ROW / 2 - (byIntegration.has(r.sha) ? 6 : 4)"
              :width="byIntegration.has(r.sha) ? 12 : 8"
              :height="byIntegration.has(r.sha) ? 12 : 8"
              :fill="color(r.lane.col)"
            />
          </svg>
          <GitMerge v-if="byIntegration.has(r.sha)" class="ico merge-ico" />
          <Undo2 v-else-if="r.reverts" class="ico revert-ico" />
          <span class="text">{{ label(r) }}</span>
          <span class="tags">
            <span v-if="byIntegration.get(r.sha)?.revertedBy" class="tag bad">{{ T`revertida` }}</span>
            <span v-if="prOf(byIntegration.get(r.sha))" class="tag pr">{{ prWord }} #{{ prOf(byIntegration.get(r.sha))!.number }}</span>
            <span v-for="b in r.branches" :key="b" class="tag" :style="{ color: color(r.lane.col), borderColor: color(r.lane.col) }">{{ b }}</span>
          </span>
          <span class="meta">
            <template v-if="byIntegration.has(r.sha)">{{ kindOf(byIntegration.get(r.sha)!) }} · </template>{{ whoOf(r) }} · {{ ago(r.at) }}
          </span>
        </button>
      </div>

      <aside class="detail">
        <template v-if="row">
          <span class="chip" :class="{ ext: integration && !integration.orquest }">
            <template v-if="integration?.task">{{ integration.task }} · {{ kindOf(integration) }}</template>
            <template v-else-if="integration">{{ T`integración` }} · {{ kindOf(integration) }}</template>
            <template v-else>{{ T`commit` }}</template>
          </span>
          <h2>{{ integration?.title ?? (row.reverts ? T`Revertida: ${revertedTitle(row.subject)}` : row.subject) }}</h2>
          <p v-if="integration" class="line"><GitMerge class="ok-ico" /> {{ integration.branch ?? T`rama desconocida` }} → {{ integration.target }}</p>
          <p v-else-if="row.branches.length" class="line"><GitBranch /> {{ row.branches.join(', ') }}</p>
          <p class="line dim">
            <i v-if="integration?.who" class="sq" :style="{ background: `var(--pv-${integration.who.provider})` }" />
            <span class="flow"
              ><template v-if="integration?.who">{{ integration.who.name }} · {{ provider(integration.who.provider) }} · </template
              ><template v-else-if="integration">{{ integration.author }} · </template
              >{{ integration ? (integration.orquest ? T`integrada con tu aprobación` : T`integrada fuera de Orquest`) : whoOf(row) }} · {{ ago(row.at) }}</span
            >
          </p>
          <p class="line">
            <span class="good">+{{ files ? totals.added : (integration?.added ?? 0) }}</span>
            <span class="bad">−{{ files ? totals.removed : (integration?.removed ?? 0) }}</span>
            <span class="dim">{{ (files?.length ?? integration?.files ?? 0) === 1 ? T`1 archivo` : T`${files?.length ?? integration?.files ?? 0} archivos` }} · {{ T`commit ${row.sha.slice(0, 7)}` }}</span>
          </p>
          <p v-if="integration?.revertedBy" class="line bad">{{ T`Se revirtió con el commit ${integration.revertedBy.slice(0, 7)}.` }}</p>

          <div class="files">
            <p v-if="!files" class="dim"><Loader2 class="spin" /> {{ T`Leyendo archivos…` }}</p>
            <p v-for="f in files ?? []" :key="f.path"><b :class="`st-${f.status}`">{{ f.status }}</b> <span>{{ f.path }}</span></p>
          </div>

          <!-- PR o MR -->
          <div v-if="integration && pr" class="box">
            <GitPullRequest />
            <span>{{ prWord }} #{{ pr.number }} · {{ pr.state === 'open' ? T`abierto` : pr.state === 'merged' ? T`integrado` : T`cerrado` }} · {{ pr.title }}</span>
            <button class="btn" @click="openUrl(pr.url)"><ExternalLink /> {{ T`Abrir` }}</button>
          </div>
          <div v-else-if="integration && forge?.state === 'ok' && !integration.revertedBy" class="box">
            <GitPullRequest />
            <span>{{ T`Sin ${prWord} en ${forgeName}: se integró en local.` }}</span>
            <button class="btn" :disabled="busy || !integration.branch" :title="integration.branch ? '' : T`No se sabe de qué rama vino`" @click="confirm = 'pr'"><GitPullRequest /> {{ T`Crear ${prWord}` }}</button>
          </div>
          <p v-else-if="integration && forge && forge.state !== 'ok'" class="dim small">{{ forgeLine.text }}</p>

          <div v-if="confirm === 'pr' && integration" class="ask">
            <b>{{ T`¿Abrir un ${prWord} de ${integration.branch} hacia ${integration.target}?` }}</b>
            <p>{{ T`Se sube la rama ${integration.branch} a origin y se abre con tu sesión de ${forge?.cli}.` }}</p>
            <button class="btn primary" :disabled="busy" @click="openPr"><GitPullRequest /> {{ T`Sí, abrirlo` }}</button>
            <button class="btn" :disabled="busy" @click="confirm = null">{{ T`Cancelar` }}</button>
          </div>
          <div v-if="confirm === 'revert' && integration" class="ask danger">
            <b>{{ T`¿Revertir «${integration.title}»?` }}</b>
            <p>{{ T`Se crea un commit en ${integration.target} que deshace lo que trajo; la historia no se borra. Se le avisa al jefe.` }}</p>
            <button class="btn danger" :disabled="busy" @click="revert"><Undo2 /> {{ T`Sí, revertir` }}</button>
            <button class="btn" :disabled="busy" @click="confirm = null">{{ T`Cancelar` }}</button>
          </div>
          <p v-if="problem" class="bad small">{{ problem }}</p>

          <div v-if="showDiff && parsed" class="diff">
            <p v-if="!parsed.files.length" class="dim small">{{ T`Sin cambios que mostrar.` }}</p>
            <template v-for="f in parsed.files" :key="f.name">
              <b class="file">{{ f.name }}</b>
              <pre><span v-for="(l, k) in f.lines" :key="k" :class="diffMark(l)">{{ l || ' ' }}
</span></pre>
            </template>
          </div>

          <span class="grow" />
          <p v-if="integration && !integration.revertedBy" class="dim small">{{ T`Revertir no borra historia: crea un commit que deshace esta integración. Antes te pide confirmar.` }}</p>
          <footer>
            <button class="btn" :class="{ on: showDiff }" @click="toggleDiff"><FileText /> {{ showDiff ? T`Ocultar diff` : T`Ver diff` }}</button>
            <span class="grow" />
            <button v-if="integration && !integration.revertedBy" class="btn danger" :disabled="busy" @click="confirm = 'revert'"><Undo2 /> {{ T`Revertir` }}</button>
          </footer>
        </template>
        <p v-else class="dim small">{{ T`Elige un commit para ver su detalle.` }}</p>
      </aside>
    </div>

    <!-- Worktrees -->
    <div v-else class="trees">
      <div class="thead">
        <span>{{ T`De quién` }}</span><span>{{ T`Rama · de dónde salió` }}</span><span>{{ T`Estado` }}</span><span>{{ T`Peso` }}</span><span />
      </div>
      <p v-if="treeProblem" class="bad small">{{ treeProblem }}</p>
      <div v-for="w in trees ?? []" :key="w.path" class="trow">
        <div class="who">
          <b>
            <Home v-if="w.owner.kind === 'project'" />
            <Info v-else-if="w.owner.kind === 'foreign' || w.owner.kind === 'orphan'" />
            <i v-else class="sq" :style="{ background: w.owner.kind === 'employee' && !w.owner.gone ? `var(--pv-${w.owner.provider})` : 'var(--st-dep)' }" />
            {{ ownerText(w) }}
          </b>
          <small v-if="w.task">{{ T`Tarea ${w.task.id} · ${w.task.title}` }}</small>
        </div>
        <div class="br">
          <span>{{ w.branch ?? w.head.slice(0, 7) }}</span>
          <small>{{ branchNote(w) }}</small>
        </div>
        <span class="st" :style="{ color: stateOf(w).color }">{{ stateOf(w).text }}</span>
        <span class="size">{{ w.missing ? '—' : w.owner.kind === 'project' && sizes[w.path] === undefined ? '—' : bytes(sizes[w.path]) }}</span>
        <div class="acts">
          <template v-if="w.owner.kind === 'foreign'"><span class="dim small">{{ T`sin acciones` }}</span></template>
          <template v-else>
            <button v-if="live(w)" class="btn" @click="canvas.open('employee', (w.owner as { id: string }).id)"><Files /> {{ T`Archivos` }}</button>
            <button v-if="w.canRelease" class="btn" :disabled="busy" @click="releasing = w.path"><Trash2 /> {{ T`Quitar y liberar` }}</button>
            <button v-if="!w.missing" class="btn" :class="{ icon: live(w) || w.canRelease }" :title="T`Abrir su carpeta`" @click="openFolder(w.path)"><FolderOpen /><template v-if="!live(w) && !w.canRelease"> {{ T`Abrir carpeta` }}</template></button>
          </template>
        </div>
        <div v-if="releasing === w.path" class="ask danger wide">
          <b>{{ T`¿Quitar la copia de ${w.owner.kind === 'employee' ? w.owner.name : ownerText(w)}?` }}</b>
          <p>{{ T`Se borra su carpeta (y lo que instaló); su rama ${w.branch ?? ''} sigue en git con todo lo integrado.` }}</p>
          <button class="btn danger" :disabled="busy" @click="release(w)"><Trash2 /> {{ T`Sí, quitarla` }}</button>
          <button class="btn" :disabled="busy" @click="releasing = null">{{ T`Cancelar` }}</button>
        </div>
        <small v-else-if="!w.canRelease && w.owner.kind === 'employee' && w.releaseWhy && !live(w)" class="why">{{ w.releaseWhy }}</small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hist { flex: 1; min-height: 0; display: flex; flex-direction: column; container-type: inline-size; background: var(--bg); }
.tools { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 3px solid var(--border); background: var(--surface); flex-wrap: wrap; }
.tabs { display: flex; border: 3px solid var(--border); }
.tabs button { padding: 6px 12px; font: 700 12px var(--font); color: var(--text-secondary); background: var(--surface-2); border: 0; cursor: pointer; }
.tabs button.on { background: var(--accent); color: var(--on-accent); }
.repo { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border: 2px solid var(--border-light); }
.repo svg { width: 14px; height: 14px; color: var(--text-secondary); }
.repo select { font: 700 12px var(--font); color: var(--text-primary); background: transparent; border: 0; outline: none; }
.repo option { background: var(--surface); }
.check { display: inline-flex; align-items: center; gap: 6px; color: var(--text-secondary); cursor: pointer; }
.small { font-size: 11px; }
.dim { color: var(--text-secondary); }
.grow { flex: 1; }
.forge { display: inline-flex; align-items: center; gap: 8px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46%; }
.forge i { width: 9px; height: 9px; flex: none; background: var(--text-secondary); }
.forge i.ok { background: var(--st-idle); }
.forge i.off { background: var(--st-block); }
.btn.icon { padding: 5px 7px; }
.btn.on { background: var(--surface-2); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
.fail { margin: 16px; color: var(--st-block); font-size: 12px; }
.good { color: var(--st-idle); font-weight: 700; }
.bad { color: var(--st-block); }

.split { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 380px; }
@container (max-width: 860px) { .split { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); } }
.list { min-height: 0; overflow: auto; background: var(--term-bg); padding: 6px 0; }
.blank { margin: 24px; font-size: 12px; color: var(--text-secondary); }
.row { width: 100%; display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px 0 4px; font: 12px var(--font); color: var(--text-primary); background: none; border: 0; text-align: left; cursor: pointer; }
.row:hover { background: var(--surface); }
.row.on { background: var(--surface-2); }
.row.merge .text { font-weight: 700; }
.row.revert .text, .row.reverted .text { color: var(--text-secondary); }
.row.reverted .text { text-decoration: line-through; }
.lanes { flex: none; overflow: visible; }
.ico { width: 14px; height: 14px; flex: none; }
.merge-ico, .ok-ico { color: var(--st-idle); }
.revert-ico { color: var(--st-block); }
.text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tags { display: flex; gap: 6px; flex: none; max-width: 40%; overflow: hidden; }
.tag { padding: 0 5px; font: 700 11px/16px var(--font); border: 2px solid var(--border-light); color: var(--text-secondary); white-space: nowrap; }
.tag.pr { color: var(--st-idle); border-color: var(--st-idle); }
.tag.bad { color: var(--st-block); border-color: var(--st-block); }
.meta { flex: none; font-size: 11px; color: var(--text-secondary); white-space: nowrap; }

.detail { min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; background: var(--surface); border-left: 3px solid var(--border); }
.detail > * { flex-shrink: 0; }
.chip { align-self: flex-start; padding: 1px 6px; font: 700 11px var(--font); text-transform: uppercase; color: var(--st-block); border: 2px solid var(--st-block); }
.chip.ext { color: var(--st-work); border-color: var(--st-work); }
.detail h2 { margin: 0; font: 700 17px/1.3 var(--font-pixel); color: var(--text-primary); text-transform: none; letter-spacing: 0; }
.line { margin: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; }
.line svg { width: 14px; height: 14px; }
.line .flow { flex: 1; min-width: 0; line-height: 1.5; }
.sq { display: inline-block; width: 10px; height: 10px; flex: none; }
.files { padding: 8px 10px; background: var(--term-bg); border: 2px solid var(--border); font-size: 12px; max-height: 180px; overflow: auto; }
.files p { margin: 3px 0; display: flex; gap: 10px; align-items: center; }
.files b { width: 12px; color: var(--accent); }
.files .st-A { color: var(--st-idle); }
.files .st-D { color: var(--st-block); }
.files span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.box { display: flex; align-items: center; gap: 10px; padding: 10px 12px; font-size: 12px; color: var(--text-secondary); border: 3px solid var(--border-light); }
.box > svg { width: 16px; height: 16px; flex: none; }
.box span { flex: 1; min-width: 0; }
.ask { padding: 10px 12px; font-size: 12px; border: 2px solid var(--accent); background: var(--tint-warn); }
.ask.danger { border-color: var(--st-block); background: var(--tint-danger); }
.ask p { margin: 6px 0 10px; line-height: 1.5; }
.ask .btn { margin-right: 8px; }
.detail > .diff { flex: 1 0 160px; }
.diff { min-height: 120px; overflow: auto; background: var(--term-bg); border: 2px solid var(--border); }
.diff .file { display: block; padding: 6px 10px; font-size: 12px; background: var(--surface-2); border-bottom: 2px solid var(--border); position: sticky; top: 0; }
.diff pre { margin: 0; font: 12px/1.6 var(--font); }
.diff pre span { display: block; padding: 0 10px; white-space: pre; }
.diff pre .add { background: var(--tint-ok); }
.diff pre .del { background: var(--tint-danger); }
.diff pre .hunk { color: var(--text-secondary); }
footer { display: flex; align-items: center; gap: 10px; }

.trees { flex: 1; min-height: 0; overflow: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
.thead, .trow { display: grid; grid-template-columns: minmax(160px, 1.1fr) minmax(180px, 1.4fr) minmax(130px, 1fr) 72px 236px; gap: 12px; align-items: center; }
.thead { padding: 0 12px 6px; font: 700 11px var(--font); text-transform: uppercase; color: var(--text-secondary); }
.trow { padding: 10px 12px; background: var(--surface); border: 3px solid var(--border); font-size: 12px; }
.who, .br { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.who b { display: flex; align-items: center; gap: 8px; }
.who b svg { width: 14px; height: 14px; color: var(--text-secondary); }
.who small, .br small, .why { font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.br span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.size { color: var(--text-secondary); }
.acts { display: flex; gap: 6px; justify-content: flex-end; }
.trow .wide, .trow .why { grid-column: 1 / -1; }
@container (max-width: 760px) {
  .thead { display: none; }
  .trow { grid-template-columns: 1fr 1fr; }
  .acts { grid-column: 1 / -1; justify-content: flex-start; }
}
</style>

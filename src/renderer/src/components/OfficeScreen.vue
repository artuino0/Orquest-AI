<script setup lang="ts">
/**
 * Un proyecto abierto es un lienzo infinito: la oficina, el jefe, cada
 * empleado, el editor, su versión, el tablero y lo demás son paneles que se
 * mueven, se agrandan, se minimizan y se enfocan. El plano crece hacia donde
 * los mueves. A la izquierda el dock de proyectos; arriba la barra con la
 * leyenda y los botones que abren (o traen) cada panel.
 *
 * Moverse: arrastrar el fondo (o espacio + arrastrar), la rueda recorre,
 * Ctrl + rueda acerca y aleja. Clic derecho en el fondo: el menú del lienzo.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertTriangle, Bell, ChevronDown, ChevronUp, Crown, FileText, FolderOpen, FolderTree, Gauge, Inbox, Kanban, LayoutGrid, Loader2, Maximize, Minimize2, Minus, Plus, RotateCcw, Smartphone, Users } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import { toWorld, type Panel, type PanelKind, type Point } from '../canvas/layout'
import { useCanvas } from '../stores/canvas'
import { useIde } from '../stores/ide'
import { useStudio } from '../stores/studio'
import { LOOK, lookOf } from '../status'
import CanvasPanel from './CanvasPanel.vue'
import CanvasBackdrop from './CanvasBackdrop.vue'
import CanvasMenu from './CanvasMenu.vue'
import CanvasMinimap from './CanvasMinimap.vue'
import ProjectDock from './ProjectDock.vue'
import BossQuickBar from './BossQuickBar.vue'
import EmployeeDrawer from './EmployeeDrawer.vue'
import EditorPanel from './EditorPanel.vue'
import VersionPanel from './VersionPanel.vue'
import UsagePanel from './UsagePanel.vue'
import HireDialog from './HireDialog.vue'
import BoardView from './BoardView.vue'
import InboxPanel from './InboxPanel.vue'
import BossPanel from './BossPanel.vue'
import LibraryPanel from './LibraryPanel.vue'
import PixelOffice from './PixelOffice.vue'
import PlansPanel from './PlansPanel.vue'
import AccountsPanel from './AccountsPanel.vue'
import MobilePanel from './MobilePanel.vue'
import LangToggle from './LangToggle.vue'
import ThemeToggle from './ThemeToggle.vue'
import CHAR1 from '../../../../assets/herdr-oficina/sprites/char1.png'

const studio = useStudio()
const canvas = useCanvas()
const ide = useIde()

/**
 * Lo que se ve de cada empleado: su terminal manda mientras trabaja o pide
 * algo; si está en espera, el tablero dice si espera a otro o lleva su entrega.
 */
function look(e: (typeof studio.employees)[number]) {
  const h = studio.board?.hints[e.id]
  // Jugando gana siempre: su CLI se está reiniciando.
  if (h?.state === 'gaming') return 'gaming' as const
  // Sin los parpadeos entre paso y paso: sigue "trabajando" hasta que de verdad para.
  const state = studio.calmStateOf(e)
  // Va llegando: eso se ve antes que su tarea.
  if (state === 'starting' && studio.board?.arriving?.some((a) => a.id === e.id)) return state
  const quiet = state === 'idle' || state === 'starting'
  if (quiet && h?.state === 'waiting') return 'waiting' as const
  if (quiet && h?.state === 'delivering') return 'delivering' as const
  return state
}

/** Cuántos hay en cada estado, para la leyenda de la barra. */
const legend = computed(() => {
  const n: Record<string, number> = {}
  for (const e of studio.employees) n[look(e)] = (n[look(e)] ?? 0) + 1
  const s = (k: string) => n[k] ?? 0
  return [
    { n: s('working'), color: 'work', text: T`trabajando` },
    { n: s('blocked'), color: 'block', text: s('blocked') === 1 ? T`te necesita` : T`te necesitan`, alert: true },
    { n: s('waiting'), color: 'dep', text: T`espera a otro` },
    { n: s('delivering'), color: 'review', text: s('delivering') === 1 ? T`entrega` : T`entregas` },
    { n: s('gaming'), color: 'play', text: T`jugando` },
    { n: s('starting'), color: 'arrive', text: T`llegando` },
    { n: s('idle'), color: 'idle', text: T`en espera` },
  ].filter((x) => x.n)
})

/** Avisos fijos abajo a la izquierda: quién te necesita y qué propone el jefe. */
const alerts = computed(() => {
  const list: { danger?: boolean; busy?: boolean; text: string; go: () => void }[] = []
  for (const e of studio.employees) {
    const name = studio.nameOf(e.id)
    const open = () => studio.select(e.id)
    // Su CLI dijo que no puede trabajar (modelo que no tiene, sin saldo): se queda aquí hasta que pueda.
    if (e.problem && e.state !== 'working' && e.state !== 'exited') {
      list.push({ danger: true, text: T`${name} no puede trabajar: «${e.problem}» · Abrir su terminal`, go: open })
      continue
    }
    // Su terminal arranca y aún no le llega su primer mensaje. Si pregunta algo, lo dice el aviso de abajo.
    const coming = studio.board?.arriving?.find((a) => a.id === e.id)
    if (coming && e.state !== 'blocked' && e.state !== 'exited') {
      // El jefe sin nombre es «el jefe», no «Jefe».
      const plain = e.id === 'jefe' && !studio.board?.boss?.name
      const text = coming.back
        ? plain ? T`El jefe vuelve a su escritorio… su terminal está arrancando` : T`${name} vuelve a su escritorio… su terminal está arrancando`
        : plain ? T`Contratando al jefe… su terminal está arrancando` : T`Contratando a ${name}… su terminal está arrancando`
      list.push({ busy: true, text, go: open })
      continue
    }
    if (e.state !== 'blocked') continue
    const why = studio.blocks[e.id]
    if (why === 'trust') {
      // La CLI pregunta si confías en la carpeta y espera: se puede contestar desde aquí.
      list.push({ danger: true, text: T`${name} no puede empezar: su CLI pregunta si confías en esta carpeta · Abrir su terminal`, go: open })
      list.push({ text: T`Confiar en esta carpeta y que ${name} continúe`, go: () => void studio.answerBlock(e.id) })
    } else if (why === 'offer') {
      // Su CLI le ofrece otro modelo: «ahora no» lo deja con el que lo contrataste.
      list.push({ danger: true, text: T`${name} está detenido: su CLI le ofrece cambiar de modelo · Abrir su terminal`, go: open })
      list.push({ text: T`Decirle «ahora no» y que ${name} siga con su modelo`, go: () => void studio.answerBlock(e.id) })
    } else if (why === 'update') list.push({ danger: true, text: T`${name} está detenido: su CLI ofrece actualizarse · Abre su terminal y elige`, go: open })
    else if (why === 'login') list.push({ danger: true, text: T`${name} está detenido: su CLI pide iniciar sesión · Abre su terminal`, go: open })
    else list.push({ danger: true, text: T`${name} te necesita: abre su terminal`, go: open })
  }
  // El jefe te preguntó algo y no puede decidirlo sin ti.
  const asks = (studio.board?.questions ?? []).filter((q) => q.status === 'open').length
  if (asks) list.push({ text: asks === 1 ? T`El jefe espera por ti: ${asks} pregunta sin contestar · Contestar` : T`El jefe espera por ti: ${asks} preguntas sin contestar · Contestar`, go: () => canvas.open('boss') })
  // Equipo contratado con las terminales cerradas: se puede retomar cuando quieras.
  const team = studio.board?.resumable ?? []
  if (team.length && studio.resumeAsked && !studio.resuming) {
    list.push({ text: T`Tu equipo (${team.length}) está contratado con sus terminales cerradas · Retomar actividades`, go: () => void studio.resumeProject(true) })
  }
  const n = studio.proposal.length
  if (n) list.push({ text: n === 1 ? T`El Jefe propone ${n} contratación · ver Plantilla` : T`El Jefe propone ${n} contrataciones · ver Plantilla`, go: () => canvas.open('hire') })
  return list
})

/** Los avisos tapan el lienzo: si son muchos, se ven los primeros y lo demás se despliega. */
const FEW = 3
const allAlerts = ref(false)
const shownAlerts = computed(() => (allAlerts.value ? alerts.value : alerts.value.slice(0, FEW)))

// ── El lienzo de este proyecto ─────────────────────────────────────────────
// Cada proyecto recuerda el suyo; al cambiar de proyecto se carga el de él.
watch(() => studio.board?.repo, (root) => root && void canvas.load(root), { immediate: true })
// Lo que antes abría una ventana encima (studio.overlay) o el panel del empleado (studio.select) ahora abre un panel.
watch(() => studio.overlay, (o) => {
  if (!o) return
  canvas.open(o)
  studio.overlay = null
}, { immediate: true })
watch(() => studio.selected, (id) => {
  if (!id) return
  canvas.open('employee', id)
  studio.selected = null
}, { immediate: true })
// Quien ya no está en el proyecto se lleva sus paneles.
watch(() => studio.employees.map((e) => e.id).join(), () => canvas.prune(new Set(studio.employees.map((e) => e.id))))
// Su versión quedó lista y su panel está abierto: sale a su lado.
watch(
  () => (studio.board?.reviews ?? []).filter((r) => r.status === 'ready').map((r) => r.employeeId),
  (ready, before) => {
    for (const id of ready) if (!before?.includes(id) && canvas.has(`employee:${id}`)) canvas.open('version', id)
  },
)

/** El encabezado de cada panel. Los que traen su `PanelFrame` (jefe, plantilla…) ponen el suyo. */
function headOf(p: Panel): { title: string; subtitle?: string; color?: string } {
  const repo = studio.repo?.split(/[\\/]/).filter(Boolean).pop() ?? ''
  const person = p.ref ? studio.employees.find((e) => e.id === p.ref) : undefined
  const stateColor = (id: string) => {
    const e = studio.employees.find((x) => x.id === id)
    return e ? `var(--st-${LOOK[lookOf({ id, state: studio.calmStateOf(e) }, studio.board?.hints)].color})` : 'var(--text-secondary)'
  }
  switch (p.kind) {
    case 'office':
      return { title: T`Oficina`, subtitle: repo, color: 'var(--st-work)' }
    case 'boss':
      return { title: T`Jefe`, color: stateColor('jefe') }
    case 'employee': {
      const cli = studio.clis.find((c) => c.id === person?.provider)?.name ?? person?.provider ?? ''
      return { title: studio.nameOf(p.ref ?? ''), subtitle: person ? `${person.id === 'jefe' ? T`jefe` : person.role} · ${cli}` : undefined, color: stateColor(p.ref ?? '') }
    }
    case 'version':
      return { title: T`Su versión`, subtitle: studio.nameOf(p.ref ?? ''), color: 'var(--st-idle)' }
    case 'editor':
      return { title: T`Editor`, subtitle: ide.active ?? repo }
    case 'usage':
      return { title: T`Uso`, subtitle: T`límites por proveedor` }
    default:
      return { title: '' }
  }
}

// ── Moverse por el plano ───────────────────────────────────────────────────
const viewEl = ref<HTMLDivElement>()
const panning = ref(false)
const space = ref(false)
const menu = ref<{ at: Point; world: Point } | null>(null)
const local = (ev: { clientX: number; clientY: number }): Point => {
  const r = viewEl.value!.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}
/** ¿Es el fondo (no un panel ni los controles)? */
const onBackground = (t: EventTarget | null) => !(t as HTMLElement | null)?.closest?.('.cpanel, .hud, .minimap, .menu, .veil, .focusbar')

function pan(ev: PointerEvent) {
  ev.preventDefault()
  const el = viewEl.value!
  let last = { x: ev.clientX, y: ev.clientY }
  panning.value = true
  canvas.busy = true
  el.setPointerCapture(ev.pointerId)
  const move = (e: PointerEvent) => {
    canvas.panBy(e.clientX - last.x, e.clientY - last.y)
    last = { x: e.clientX, y: e.clientY }
  }
  const stop = () => {
    panning.value = false
    canvas.busy = false
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', stop)
    el.removeEventListener('pointercancel', stop)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', stop)
  el.addEventListener('pointercancel', stop)
}
function down(ev: PointerEvent) {
  if (canvas.focus) return
  // Espacio + arrastrar recorre aunque el puntero esté sobre un panel; el botón de en medio también.
  if (space.value || ev.button === 1) {
    ev.stopPropagation()
    return pan(ev)
  }
  if (ev.button === 0 && onBackground(ev.target)) pan(ev)
}
function wheel(ev: WheelEvent) {
  if (canvas.focus) return
  if (ev.ctrlKey || ev.metaKey) {
    ev.preventDefault()
    canvas.zoomTo(canvas.camera.zoom * Math.exp(-ev.deltaY * 0.0015), local(ev))
    return
  }
  // Dentro de un panel, la rueda es de su contenido.
  if ((ev.target as HTMLElement).closest('.cpanel .content, .hud, .menu')) return
  ev.preventDefault()
  if (ev.shiftKey && !ev.deltaX) canvas.panBy(-ev.deltaY, 0)
  else canvas.panBy(-ev.deltaX, -ev.deltaY)
}
function context(ev: MouseEvent) {
  if (!onBackground(ev.target) || canvas.focus) return
  ev.preventDefault()
  const at = local(ev)
  menu.value = { at, world: toWorld(canvas.camera, at) }
}

/** Escribiendo (un campo, una terminal, el editor): las teclas son de ahí. */
const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], .xterm, .monaco-editor')
function keydown(ev: KeyboardEvent) {
  // Ctrl+B abre y cierra el editor, como en un editor. Dentro de una terminal no: ahí esa tecla es del agente.
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === 'b' && !(ev.target as HTMLElement | null)?.closest?.('.xterm')) {
    ev.preventDefault()
    canvas.toggle('editor')
    return
  }
  if (ev.key === 'Escape' && canvas.focus && !menu.value) {
    canvas.unfocus()
    return
  }
  if (typing(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey) return
  if (ev.code === 'Space' && !ev.repeat) {
    space.value = true
    ev.preventDefault()
  } else if (ev.key === '0') canvas.fitAll()
  else if (ev.key.toLowerCase() === 'o') canvas.arrangeAll()
}
const keyup = (ev: KeyboardEvent) => ev.code === 'Space' && (space.value = false)
const blur = () => (space.value = false)

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => canvas.resize({ w: entry.contentRect.width, h: entry.contentRect.height }))
  observer.observe(viewEl.value!)
  // La rueda necesita poder cancelarse (no pasiva) para que Ctrl + rueda no haga zoom a toda la ventana.
  viewEl.value!.addEventListener('wheel', wheel, { passive: false })
  window.addEventListener('keydown', keydown)
  window.addEventListener('keyup', keyup)
  window.addEventListener('blur', blur)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  viewEl.value?.removeEventListener('wheel', wheel)
  window.removeEventListener('keydown', keydown)
  window.removeEventListener('keyup', keyup)
  window.removeEventListener('blur', blur)
})

// Lo abierto en el editor era de este proyecto: al salir o cambiar de carpeta, se suelta.
watch(() => studio.repo, () => ide.reset())
onBeforeUnmount(() => ide.reset())

const world = computed(() => ({ transform: `translate3d(${canvas.camera.x}px, ${canvas.camera.y}px, 0) scale(${canvas.camera.zoom})` }))
const name = (p: string | null) => p?.split(/[\\/]/).filter(Boolean).pop() ?? ''
const NAV: { kind: PanelKind; icon: unknown; label?: string; title?: string }[] = [
  { kind: 'boss', icon: Crown, label: T`Jefe` },
  { kind: 'hire', icon: Users, label: T`Plantilla` },
  { kind: 'board', icon: Kanban, label: T`Tablero` },
  { kind: 'plans', icon: FileText, label: T`Planes`, title: T`Planes y documentos que el jefe deja en el repo` },
  { kind: 'library', icon: FolderOpen, label: T`Expedientes` },
  { kind: 'inbox', icon: Inbox, label: T`Entregas` },
]
const badge = (k: PanelKind) => (k === 'hire' ? studio.proposal.length : k === 'inbox' ? studio.inbox.length : 0)
</script>

<template>
  <div class="office">
    <header class="bar">
      <button class="btn" @click="studio.goHome()">{{ T`Inicio` }}</button>
      <strong class="repo">{{ name(studio.repo) }}</strong>
      <span class="legend">
        <span v-for="l in legend" :key="l.text" :class="{ alert: l.alert }" :style="{ color: l.alert ? `var(--st-${l.color})` : undefined }">
          <i :style="{ background: `var(--st-${l.color})` }" />{{ l.n }} {{ l.text }}
        </span>
        <span v-if="!studio.employees.length" class="dim">{{ T`Sin empleados todavía` }}</span>
      </span>
      <nav>
        <button v-for="n in NAV" :key="n.kind" class="btn" :class="{ on: canvas.has(n.kind) }" :title="n.title" @click="canvas.toggle(n.kind)">
          <component :is="n.icon" /> {{ n.label }}<b v-if="badge(n.kind)" class="badge">{{ badge(n.kind) }}</b>
        </button>
        <button class="btn icon" :class="{ on: canvas.has('accounts') }" :title="T`Cuentas: cada sesión de tus CLIs y lo que lleva usado de su límite`" @click="canvas.toggle('accounts')"><Gauge /></button>
        <button class="btn icon" :class="{ on: canvas.has('mobile') }" :title="T`Celular: contesta a tu equipo desde el celular`" @click="canvas.toggle('mobile')"><Smartphone /></button>
        <LangToggle />
        <ThemeToggle />
        <button class="btn icon" :class="{ on: canvas.has('editor') }" :title="T`Editor y archivos del proyecto (Ctrl+B)`" @click="canvas.toggle('editor')"><FolderTree /><b v-if="ide.dirtyCount" class="badge">{{ ide.dirtyCount }}</b></button>
      </nav>
    </header>

    <div class="body">
      <ProjectDock @usage="canvas.toggle('usage')" />

      <div ref="viewEl" class="viewport" :class="{ busy: canvas.busy, panning, space, focusing: !!canvas.focus }" @pointerdown.capture="down" @contextmenu="context">
        <CanvasBackdrop />
        <div class="world" :class="{ glide: canvas.glide }" :style="world">
          <CanvasPanel
            v-for="p in canvas.panels"
            :key="`${canvas.root}|${p.id}`"
            :panel="p"
            :rect="canvas.focused[p.id]"
            :hidden="!!canvas.focus && !canvas.focused[p.id]"
            v-bind="headOf(p)"
          >
            <PixelOffice v-if="p.kind === 'office'" />
            <BossPanel v-else-if="p.kind === 'boss'" />
            <EmployeeDrawer v-else-if="p.kind === 'employee' && p.ref && studio.employees.some((e) => e.id === p.ref)" :id="p.ref" />
            <VersionPanel v-else-if="p.kind === 'version' && p.ref" :id="p.ref" />
            <EditorPanel v-else-if="p.kind === 'editor'" />
            <UsagePanel v-else-if="p.kind === 'usage'" @accounts="canvas.open('accounts')" />
            <HireDialog v-else-if="p.kind === 'hire'" />
            <BoardView v-else-if="p.kind === 'board'" />
            <InboxPanel v-else-if="p.kind === 'inbox'" />
            <PlansPanel v-else-if="p.kind === 'plans'" />
            <LibraryPanel v-else-if="p.kind === 'library'" />
            <AccountsPanel v-else-if="p.kind === 'accounts'" />
            <MobilePanel v-else-if="p.kind === 'mobile'" />
          </CanvasPanel>
        </div>

        <p v-if="!canvas.panels.length" class="hint">{{ T`El lienzo está vacío. Clic derecho en el fondo para abrir un panel, o usa los botones de arriba.` }}</p>

        <div v-if="canvas.focus" class="focusbar">
          <span>{{ T`Enfocado` }}</span>
          <button class="btn" @click="canvas.unfocus()"><Minimize2 /> {{ T`Volver al lienzo` }} <kbd>Esc</kbd></button>
        </div>

        <div v-show="!canvas.focus" class="hud left">
          <div class="alerts">
            <button v-for="(a, i) in shownAlerts" :key="i" class="alert-card" :class="{ danger: a.danger }" @click="a.go">
              <AlertTriangle v-if="a.danger" /><Loader2 v-else-if="a.busy" class="spin" /><Bell v-else />{{ a.text }}
            </button>
            <button v-if="alerts.length > FEW" class="alert-more" @click="allAlerts = !allAlerts">
              <ChevronUp v-if="allAlerts" /><ChevronDown v-else />{{ allAlerts ? T`Ver menos` : T`${alerts.length - FEW} avisos más` }}
            </button>
            <p v-for="n in studio.notices" :key="n.id" class="alert-card"><Bell />{{ n.text }}</p>
          </div>
          <div class="zoombar">
            <button :title="T`Alejar (Ctrl + rueda)`" :disabled="!!canvas.focus" @click="canvas.zoomTo(canvas.camera.zoom / 1.2, undefined, true)"><Minus /></button>
            <button class="pct" :title="T`Tamaño real`" :disabled="!!canvas.focus" @click="canvas.zoomTo(1, undefined, true)">{{ Math.round(canvas.camera.zoom * 100) }}%</button>
            <button :title="T`Acercar (Ctrl + rueda)`" :disabled="!!canvas.focus" @click="canvas.zoomTo(canvas.camera.zoom * 1.2, undefined, true)"><Plus /></button>
            <i />
            <button class="wide" :title="T`Encuadra todos los paneles (0)`" @click="canvas.unfocus(); canvas.fitAll()"><Maximize /> {{ T`Ver todo` }}</button>
            <button class="wide" :title="T`Acomoda los paneles en rejilla (O)`" @click="canvas.arrangeAll()"><LayoutGrid /> {{ T`Ordenar` }}</button>
          </div>
        </div>
        <!-- Hablarle al jefe sin buscar su panel. -->
        <BossQuickBar v-if="studio.bossOnline && !canvas.focus" class="hud quickbar" />
        <CanvasMinimap v-if="canvas.panels.length && !canvas.focus" class="hud minimap" />

        <CanvasMenu v-if="menu" :at="menu.at" :world="menu.world" @close="menu = null" />

        <!-- Quedó gente al cerrar la app: ¿se retoma? -->
        <div v-if="studio.board?.resumable.length && !studio.resumeAsked" class="veil">
          <section class="panel empty">
            <img :src="CHAR1" alt="" />
            <h1 class="title-pixel">{{ T`¿Retomamos donde se quedaron?` }}</h1>
            <p>
              {{ T`Al cerrar estaban en la oficina:` }} <b>{{ studio.board.resumable.join(', ') }}</b>. {{ T`Cada quien vuelve a su escritorio, retoma su conversación y lee el corte que dejó.` }}
            </p>
            <p v-if="studio.error" class="bad">{{ studio.error }}</p>
            <div class="choices">
              <button class="btn" :disabled="studio.resuming" :title="T`Entras a la oficina; el equipo sigue contratado con sus terminales cerradas`" @click="studio.resumeProject(false)">{{ T`Ahora no, solo entrar` }}</button>
              <button class="btn primary" :disabled="studio.resuming" @click="studio.resumeProject(true)"><RotateCcw /> {{ studio.resuming ? T`Volviendo…` : T`Retomar` }}</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.office { height: 100%; display: grid; grid-template-rows: 48px 1fr; background: var(--bg); }
.bar { display: flex; align-items: center; gap: 12px; padding: 0 10px; background: var(--surface); border-bottom: 3px solid var(--border); min-width: 0; z-index: 4; }
.repo { font: 700 16px var(--font-pixel); color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.legend { display: flex; gap: 10px; font-size: 10px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; min-width: 0; }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend i { width: 8px; height: 8px; }
.legend .alert { font-weight: 700; }
nav { margin-left: auto; display: flex; gap: 6px; }
nav .btn { position: relative; background: var(--bg); }
nav .btn.on { background: var(--accent); color: var(--on-accent); }
nav .btn.icon { padding: 7px 9px; }
.badge { position: absolute; top: -7px; right: -7px; min-width: 16px; padding: 0 4px; font: 700 10px/16px var(--font); text-align: center; background: var(--st-block); color: var(--on-danger); border: 2px solid var(--border); }

.body { min-height: 0; display: flex; }
.viewport { position: relative; flex: 1; min-width: 0; overflow: hidden; touch-action: none; }
.viewport.space, .viewport.panning { cursor: grabbing; }
.viewport.space :deep(.cpanel) { pointer-events: none; }
/* Arrastrando o recorriendo: las páginas incrustadas (oficina, su versión) no se quedan con el puntero. */
.viewport.busy :deep(iframe) { pointer-events: none; }
.viewport.busy { user-select: none; }
.world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; will-change: transform; }
.world.glide { transition: transform 0.3s cubic-bezier(0.2, 0.7, 0.2, 1); }
@media (prefers-reduced-motion: reduce) { .world.glide { transition: none; } }
.hint { position: absolute; top: 40%; left: 50%; transform: translateX(-50%); margin: 0; padding: 10px 14px; font-size: 12px; color: var(--text-secondary); background: var(--surface); border: 3px solid var(--border); }

.focusbar { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 20; display: flex; align-items: center; gap: 10px; padding: 4px 4px 4px 12px; font: 700 11px var(--font); color: var(--accent); background: var(--surface); border: 3px solid var(--accent); box-shadow: 3px 3px 0 var(--shadow); }
.focusbar .btn { padding: 3px 8px; }
.focusbar kbd { font: 10px var(--font); color: var(--text-secondary); }

.hud { position: absolute; z-index: 10; }
.hud.left { left: 14px; bottom: 14px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; max-width: min(520px, calc(100% - 240px)); }
/* Con la barra del jefe al centro, los avisos quedan por encima de ella. */
.hud.left .alerts { margin-bottom: 4px; }
.hud.minimap { right: 14px; bottom: 14px; }
.hud.quickbar { left: 50%; bottom: 14px; transform: translateX(-50%); }
.alerts { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.alert-card { margin: 0; display: flex; align-items: center; gap: 10px; padding: 9px 14px; font: 12px var(--font); color: var(--text-primary); text-align: left; background: var(--surface); border: 3px solid var(--accent); box-shadow: 3px 3px 0 var(--shadow); }
.alert-card svg { width: 16px; height: 16px; flex: none; color: var(--accent); }
.alert-card.danger { border-color: var(--st-block); }
.alert-card.danger svg { color: var(--st-block); }
.alert-card .spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .alert-card .spin { animation: none; } }
.alert-more { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; font: 700 11px var(--font); color: var(--text-secondary); background: var(--surface); border: 2px solid var(--border); cursor: pointer; }
.alert-more:hover { color: var(--text-primary); }
.alert-more svg { width: 13px; height: 13px; }
.zoombar { display: flex; align-items: center; background: var(--surface); border: 3px solid var(--border); box-shadow: 3px 3px 0 var(--shadow); }
.zoombar button { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 9px; font: 12px var(--font); color: var(--text-primary); background: none; border: 0; cursor: pointer; }
.zoombar button:hover:not(:disabled) { background: var(--surface-2); }
.zoombar button:disabled { opacity: 0.45; cursor: default; }
.zoombar button svg { width: 14px; height: 14px; }
.zoombar .pct { min-width: 50px; justify-content: center; font-weight: 700; }
.zoombar i { width: 2px; height: 18px; margin: 0 4px; background: var(--border); }

.veil { position: absolute; inset: 0; z-index: 40; background: var(--veil); display: grid; place-items: center; padding: 16px; }
.empty { width: 440px; max-width: 100%; padding: 24px 28px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
.empty img { width: 60px; height: 92px; object-fit: contain; image-rendering: pixelated; }
.empty .choices { display: flex; gap: 10px; }
.empty .bad { color: var(--st-block); }
.empty p b { color: var(--text-primary); }
.empty p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--text-secondary); }
.dim { color: var(--text-secondary); }
</style>

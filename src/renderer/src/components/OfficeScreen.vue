<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { AlertTriangle, Bell, Crown, FolderOpen, Inbox, Kanban, PencilRuler, RotateCcw, Users } from 'lucide-vue-next'
import { useOffice } from '../stores/office'
import { useStudio } from '../stores/studio'
import { OfficeScene } from '../world/scene'
import EmployeeDrawer from './EmployeeDrawer.vue'
import HireDialog from './HireDialog.vue'
import BoardView from './BoardView.vue'
import InboxPanel from './InboxPanel.vue'
import BossPanel from './BossPanel.vue'
import LibraryPanel from './LibraryPanel.vue'
import MapEditor from './MapEditor.vue'
import PixelOffice from './PixelOffice.vue'
import ThemeToggle from './ThemeToggle.vue'
import CHAR1 from '../../../../assets/herdr-oficina/sprites/char1.png'

const studio = useStudio()
const office = useOffice()
const mapEl = ref<HTMLDivElement>()
const scene = shallowRef<OfficeScene>()
/** Modo creativo: se dibuja la oficina en vez de trabajar en ella. */
const editing = ref(false)

/**
 * Lo que se ve de cada empleado: su terminal manda mientras trabaja o pide
 * algo; si está en espera, el tablero dice si espera a otro o lleva su entrega.
 */
function look(e: (typeof studio.employees)[number]) {
  const h = studio.board?.hints[e.id]
  // Jugando gana siempre: su CLI se está reiniciando.
  if (h?.state === 'gaming') return 'gaming' as const
  const quiet = e.state === 'idle' || e.state === 'starting'
  if (quiet && h?.state === 'waiting') return 'waiting' as const
  if (quiet && h?.state === 'delivering') return 'delivering' as const
  return e.state
}

/** El lienzo del modo creativo: la misma gente, sobre el mapa que se dibuja. */
function push() {
  const hints = studio.board?.hints ?? {}
  let delivering = 0
  let gaming = 0
  scene.value?.sync(
    studio.employees.map((e) => {
      const h = hints[e.id]
      const base = { id: e.id, name: studio.nameOf(e.id), role: e.role, provider: e.provider }
      const state = look(e)
      if (state === 'gaming') return { ...base, state, slot: gaming++ }
      if (state === 'waiting' && h?.state === 'waiting') return { ...base, state, waitingFor: h.blockedBy }
      if (state === 'delivering') return { ...base, state, slot: delivering++ }
      return { ...base, state: e.state }
    }),
    studio.selected,
  )
}

/** Cuántos hay en cada estado, para la leyenda de la barra. */
const legend = computed(() => {
  const n: Record<string, number> = {}
  for (const e of studio.employees) n[look(e)] = (n[look(e)] ?? 0) + 1
  const s = (k: string) => n[k] ?? 0
  return [
    { n: s('working'), color: 'work', text: 'trabajando' },
    { n: s('blocked'), color: 'block', text: s('blocked') === 1 ? 'te necesita' : 'te necesitan', alert: true },
    { n: s('waiting'), color: 'dep', text: 'espera a otro' },
    { n: s('delivering'), color: 'review', text: s('delivering') === 1 ? 'entrega' : 'entregas' },
    { n: s('gaming'), color: 'play', text: 'jugando' },
    { n: s('idle') + s('starting'), color: 'idle', text: 'en espera' },
  ].filter((x) => x.n)
})

/** Avisos fijos abajo a la izquierda: quién te necesita y qué propone el jefe. */
const alerts = computed(() => {
  const list: { danger?: boolean; text: string; go: () => void }[] = []
  for (const e of studio.employees) {
    if (e.state === 'blocked') list.push({ danger: true, text: `${studio.nameOf(e.id)} te necesita: abre su terminal`, go: () => studio.select(e.id) })
  }
  const n = studio.proposal.length
  if (n) list.push({ text: `El Jefe propone ${n} ${n === 1 ? 'contratación' : 'contrataciones'} · ver Plantilla`, go: () => (studio.overlay = 'hire') })
  return list
})

const HUD_H = 48
const winW = ref(window.innerWidth)
const onResize = () => (winW.value = window.innerWidth)
function insets() {
  scene.value?.setInsets({ top: HUD_H + 8, right: 0, bottom: 8, left: editing.value ? 320 : 0 })
}

onMounted(async () => {
  scene.value = new OfficeScene(mapEl.value!, (id) => studio.select(id))
  window.addEventListener('resize', onResize)
  insets()
  push()
  await office.load()
  scene.value.setMap(office.map)
})
// Cada trazo del modo creativo se ve al momento, con la gente adentro.
watch(() => office.map, (m) => scene.value?.setMap(m))
watch(() => [winW.value, editing.value], insets)
function toggleEdit() {
  editing.value = !editing.value
  if (editing.value) {
    studio.overlay = null
    studio.select(null)
  }
}
watch(() => [studio.employees.map((e) => e.id + e.state).join(), studio.selected, JSON.stringify(studio.board?.hints)], push)
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  scene.value?.destroy()
})

const name = (p: string | null) => p?.split(/[\\/]/).filter(Boolean).pop() ?? ''
const toggle = (o: 'hire' | 'board' | 'inbox' | 'boss' | 'library') => {
  editing.value = false
  studio.overlay = studio.overlay === o ? null : o
}
</script>

<template>
  <div class="office" :class="{ split: studio.selected && studio.drawerMode === 'split' }">
    <header class="bar">
      <button class="btn" @click="studio.goHome()">Inicio</button>
      <strong class="repo">{{ name(studio.repo) }}</strong>
      <span class="legend">
        <span v-for="l in legend" :key="l.text" :class="{ alert: l.alert }" :style="{ color: l.alert ? `var(--st-${l.color})` : undefined }">
          <i :style="{ background: `var(--st-${l.color})` }" />{{ l.n }} {{ l.text }}
        </span>
        <span v-if="!studio.employees.length" class="dim">Sin empleados todavía</span>
      </span>
      <nav>
        <button class="btn" :class="{ on: studio.overlay === 'boss' }" @click="toggle('boss')"><Crown /> Jefe</button>
        <button class="btn" :class="{ on: studio.overlay === 'hire' }" @click="toggle('hire')">
          <Users /> Plantilla<b v-if="studio.proposal.length" class="badge">{{ studio.proposal.length }}</b>
        </button>
        <button class="btn" :class="{ on: studio.overlay === 'board' }" @click="toggle('board')"><Kanban /> Tablero</button>
        <button class="btn" :class="{ on: studio.overlay === 'library' }" @click="toggle('library')"><FolderOpen /> Expedientes</button>
        <button class="btn" :class="{ on: studio.overlay === 'inbox' }" @click="toggle('inbox')">
          <Inbox /> Entregas<b v-if="studio.inbox.length" class="badge">{{ studio.inbox.length }}</b>
        </button>
        <button class="btn icon" :class="{ on: editing }" title="Dibujar la oficina (modo creativo)" @click="toggleEdit"><PencilRuler /></button>
        <ThemeToggle />
      </nav>
    </header>

    <div class="stage">
      <!-- La oficina de siempre es la de píxel; el lienzo solo sale para dibujar en el modo creativo. -->
      <div v-show="editing" ref="mapEl" class="map" />
      <PixelOffice v-show="!editing" />

      <MapEditor v-if="editing && scene" :scene="scene" @close="editing = false" />

      <!-- Quedó gente al cerrar la app: ¿se retoma? -->
      <div v-if="studio.board?.resumable.length && !editing" class="empty-veil">
        <section class="panel empty">
          <img :src="CHAR1" alt="" />
          <h1 class="title-pixel">¿Retomamos donde se quedaron?</h1>
          <p>
            Al cerrar estaban en la oficina: <b>{{ studio.board.resumable.join(', ') }}</b>. Cada quien vuelve a su escritorio,
            retoma su conversación y lee el corte que dejó.
          </p>
          <p v-if="studio.error" class="bad">{{ studio.error }}</p>
          <div class="choices">
            <button class="btn" :disabled="studio.resuming" @click="studio.resumeProject(false)">Ahora no</button>
            <button class="btn primary" :disabled="studio.resuming" @click="studio.resumeProject(true)"><RotateCcw /> {{ studio.resuming ? 'Volviendo…' : 'Retomar' }}</button>
          </div>
        </section>
      </div>

      <!-- Oficina vacía: todavía no hay jefe -->
      <div v-else-if="!studio.bossOnline && !studio.overlay && !editing" class="empty-veil">
        <section class="panel empty">
          <img :src="CHAR1" alt="" />
          <h1 class="title-pixel">La oficina está vacía</h1>
          <p>Todavía no hay jefe. Contrátalo y dale el objetivo del proyecto: él propondrá la plantilla y será tu único interlocutor.</p>
          <button class="btn primary" @click="studio.overlay = 'boss'"><Crown /> Contratar jefe</button>
        </section>
      </div>

      <div v-if="!editing" class="alerts">
        <button v-for="(a, i) in alerts" :key="i" class="alert-card" :class="{ danger: a.danger }" @click="a.go">
          <AlertTriangle v-if="a.danger" /><Bell v-else />{{ a.text }}
        </button>
        <p v-for="n in studio.notices" :key="n.id" class="alert-card"><Bell />{{ n.text }}</p>
      </div>

      <HireDialog v-if="studio.overlay === 'hire'" />
      <BoardView v-if="studio.overlay === 'board'" />
      <InboxPanel v-if="studio.overlay === 'inbox'" />
      <BossPanel v-if="studio.overlay === 'boss'" />
      <LibraryPanel v-if="studio.overlay === 'library'" />
    </div>

    <EmployeeDrawer v-if="studio.selectedEmployee" :key="studio.selectedEmployee.id" />
  </div>
</template>

<style scoped>
.office { height: 100%; display: grid; grid-template-columns: 1fr; grid-template-rows: 48px 1fr; background: var(--bg); }
.office.split { grid-template-columns: 1fr 1fr; }
.bar { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; padding: 0 10px; background: var(--surface); border-bottom: 3px solid var(--border); min-width: 0; }
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

.stage { grid-row: 2; grid-column: 1; position: relative; overflow: hidden; min-width: 0; min-height: 0; }
.map { position: absolute; inset: 0; }
.empty-veil { position: absolute; inset: 0; background: var(--veil); display: grid; place-items: center; padding: 16px; }
.empty { width: 440px; max-width: 100%; padding: 24px 28px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
.empty img { width: 60px; height: 92px; object-fit: contain; image-rendering: pixelated; }
.empty .choices { display: flex; gap: 10px; }
.empty .bad { color: var(--st-block); }
.empty p b { color: var(--text-primary); }
.empty p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--text-secondary); }

.alerts { position: absolute; left: 14px; bottom: 14px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; max-width: min(520px, calc(100% - 28px)); z-index: 2; }
.alert-card { margin: 0; display: flex; align-items: center; gap: 10px; padding: 9px 14px; font: 12px var(--font); color: var(--text-primary); text-align: left; background: var(--surface); border: 3px solid var(--accent); box-shadow: 3px 3px 0 var(--shadow); }
.alert-card svg { width: 16px; height: 16px; flex: none; color: var(--accent); }
.alert-card.danger { border-color: var(--st-block); }
.alert-card.danger svg { color: var(--st-block); }
.dim { color: var(--text-secondary); }
</style>

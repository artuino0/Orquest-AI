<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
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
function push() {
  const hints = studio.board?.hints ?? {}
  let delivering = 0
  let gaming = 0
  scene.value?.sync(
    studio.employees.map((e) => {
      const h = hints[e.id]
      const base = { id: e.id, name: studio.nameOf(e.id), role: e.role, provider: e.provider }
      // Jugando gana siempre: su CLI se está reiniciando.
      if (h?.state === 'gaming') return { ...base, state: 'gaming' as const, slot: gaming++ }
      const quiet = e.state === 'idle' || e.state === 'starting'
      if (quiet && h?.state === 'waiting') return { ...base, state: 'waiting' as const, waitingFor: h.blockedBy }
      if (quiet && h?.state === 'delivering') return { ...base, state: 'delivering' as const, slot: delivering++ }
      return { ...base, state: e.state }
    }),
    studio.selected,
  )
}

// El mapa se encaja en lo que queda libre: debajo del HUD y, con el drawer
// flotante abierto, a su izquierda, para que el elegido siga a la vista.
const HUD_H = 56
const winW = ref(window.innerWidth)
const onResize = () => (winW.value = window.innerWidth)
function insets() {
  const floating = !!studio.selected && studio.drawerMode === 'float' && !editing.value
  // El panel del modo creativo ocupa la izquierda.
  scene.value?.setInsets({ top: HUD_H, right: floating ? Math.min(760, winW.value * 0.6) + 32 : 0, bottom: 8, left: editing.value ? 320 : 0 })
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
watch(() => [studio.selected, studio.drawerMode, winW.value, editing.value], insets)
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
const toggle = (o: 'hire' | 'board' | 'inbox' | 'boss' | 'library') => (studio.overlay = studio.overlay === o ? null : o)
</script>

<template>
  <div class="office" :class="{ split: studio.selected && studio.drawerMode === 'split' }">
    <div class="stage">
      <!-- La oficina de siempre es la de píxel; el lienzo solo sale para dibujar en el modo creativo. -->
      <div v-show="editing" ref="mapEl" class="map" />
      <PixelOffice v-show="!editing" class="pixel" />

      <header class="hud top">
        <button class="ghost" @click="studio.goHome()">◂ Inicio</button>
        <strong>{{ name(studio.repo) }}</strong>
        <span class="counts">
          <span v-if="studio.counts.working" class="c working">{{ studio.counts.working }} trabajando</span>
          <span v-if="studio.counts.blocked" class="c blocked">{{ studio.counts.blocked }} te necesitan</span>
          <span v-if="studio.counts.idle" class="c idle">{{ studio.counts.idle }} en espera</span>
          <span v-if="studio.gamingCount" class="c gaming">{{ studio.gamingCount }} jugando</span>
        </span>
        <nav>
          <button :class="{ on: studio.overlay === 'boss', primary: !studio.bossOnline }" @click="toggle('boss')">
            {{ studio.bossOnline ? 'Jefe' : 'Contratar jefe' }}
          </button>
          <button :class="{ on: studio.overlay === 'hire' }" @click="toggle('hire')">
            Plantilla<span v-if="studio.proposal.length" class="badge">{{ studio.proposal.length }}</span>
          </button>
          <button :class="{ on: studio.overlay === 'board' }" @click="toggle('board')">Tablero</button>
          <button :class="{ on: studio.overlay === 'library' }" @click="toggle('library')">Expedientes</button>
          <button :class="{ on: editing }" @click="toggleEdit">Editar oficina</button>
          <button :class="{ on: studio.overlay === 'inbox' }" @click="toggle('inbox')">
            Entregas<span v-if="studio.inbox.length" class="badge">{{ studio.inbox.length }}</span>
          </button>
        </nav>
      </header>

      <MapEditor v-if="editing && scene" :scene="scene" @close="editing = false" />

      <p v-if="!studio.bossOnline && !studio.overlay && !editing" class="hint">
        La oficina está vacía. Contrata al <b>jefe</b>: él propone la plantilla.
      </p>

      <div class="toasts">
        <p v-for="n in studio.notices" :key="n.id">{{ n.text }}</p>
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
.office { height: 100vh; display: grid; grid-template-columns: 1fr; }
.office.split { grid-template-columns: 1fr 1fr; }
.stage { position: relative; overflow: hidden; min-width: 0; }
.map { position: absolute; inset: 0; }
/* La oficina de píxel deja libre la franja del HUD. */
.pixel { top: 56px; height: calc(100% - 56px); }
.hud { position: absolute; left: 12px; right: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; pointer-events: none; }
.hud > * { pointer-events: auto; }
.top { top: 12px; }
.top strong { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--panel); border: 2px solid var(--line); padding: 4px 10px; box-shadow: 3px 3px 0 #000; }
.counts { display: flex; gap: 6px; white-space: nowrap; }
.split .counts { display: none; }
.c { font-size: 11px; padding: 2px 6px; box-shadow: 2px 2px 0 #000; color: #111; }
.c.working { background: var(--working); }
.c.blocked { background: var(--blocked); color: #fff; animation: blink 1s steps(2) infinite; }
.c.idle { background: var(--idle); }
.c.gaming { background: #26a69a; }
nav { margin-left: auto; display: flex; gap: 6px; }
nav button, .ghost { box-shadow: 3px 3px 0 #000; }
nav .on { border-color: var(--accent); }
.primary { background: var(--accent); color: #1b1a24; border-color: #000; font-weight: bold; }
.zoom-hint { position: absolute; right: 12px; bottom: 8px; margin: 0; font-size: 10px; color: var(--muted); pointer-events: none; }
.badge { margin-left: 6px; background: var(--blocked); color: #fff; padding: 0 5px; font-size: 11px; }
.toasts { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: grid; gap: 6px; pointer-events: none; width: min(520px, calc(100% - 32px)); }
.toasts p { margin: 0; background: var(--panel); border: 2px solid var(--accent); box-shadow: 3px 3px 0 #000; padding: 8px 12px; font-size: 12px; }
.hint { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--panel); border: 2px solid var(--line); padding: 8px 14px; box-shadow: 3px 3px 0 #000; margin: 0; font-size: 13px; }
@keyframes blink { 50% { opacity: 0.5; } }
</style>

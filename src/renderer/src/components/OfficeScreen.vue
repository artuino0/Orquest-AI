<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStudio } from '../stores/studio'
import { OfficeScene } from '../world/scene'
import EmployeeDrawer from './EmployeeDrawer.vue'
import HireDialog from './HireDialog.vue'
import BoardView from './BoardView.vue'
import InboxPanel from './InboxPanel.vue'

const studio = useStudio()
const mapEl = ref<HTMLDivElement>()
let scene: OfficeScene | undefined

function push() {
  scene?.sync(
    studio.employees.map((e) => ({ id: e.id, role: e.role, provider: e.provider, state: e.state })),
    studio.selected,
  )
}

// El mapa se encaja en lo que queda libre: debajo del HUD y, con el drawer
// flotante abierto, a su izquierda, para que el elegido siga a la vista.
const HUD_H = 56
const winW = ref(window.innerWidth)
const onResize = () => (winW.value = window.innerWidth)
function insets() {
  const floating = !!studio.selected && studio.drawerMode === 'float'
  scene?.setInsets({ top: HUD_H, right: floating ? Math.min(760, winW.value * 0.6) + 32 : 0, bottom: 8, left: 0 })
}

onMounted(() => {
  scene = new OfficeScene(mapEl.value!, (id) => studio.select(id))
  window.addEventListener('resize', onResize)
  insets()
  push()
})
watch(() => [studio.selected, studio.drawerMode, winW.value], insets)
watch(() => [studio.employees.map((e) => e.id + e.state).join(), studio.selected], push)
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  scene?.destroy()
})

const name = (p: string | null) => p?.split(/[\\/]/).filter(Boolean).pop() ?? ''
const toggle = (o: 'hire' | 'board' | 'inbox') => (studio.overlay = studio.overlay === o ? null : o)
</script>

<template>
  <div class="office" :class="{ split: studio.selected && studio.drawerMode === 'split' }">
    <div class="stage">
      <div ref="mapEl" class="map" />

      <header class="hud top">
        <button class="ghost" @click="studio.goHome()">◂ Inicio</button>
        <strong>{{ name(studio.repo) }}</strong>
        <span class="counts">
          <span v-if="studio.counts.working" class="c working">{{ studio.counts.working }} trabajando</span>
          <span v-if="studio.counts.blocked" class="c blocked">{{ studio.counts.blocked }} te necesitan</span>
          <span v-if="studio.counts.idle" class="c idle">{{ studio.counts.idle }} en espera</span>
        </span>
        <nav>
          <button :class="{ on: studio.overlay === 'board' }" @click="toggle('board')">Tablero</button>
          <button :class="{ on: studio.overlay === 'inbox' }" @click="toggle('inbox')">Entregas</button>
          <button class="primary" :class="{ on: studio.overlay === 'hire' }" @click="toggle('hire')">Contratar</button>
        </nav>
      </header>

      <p v-if="!studio.employees.length && !studio.overlay" class="hint">
        La oficina está vacía. Pulsa <b>Contratar</b> para armar tu plantilla.
      </p>

      <p class="zoom-hint">rueda: zoom · arrastrar: mover · doble clic: centrar</p>

      <HireDialog v-if="studio.overlay === 'hire'" />
      <BoardView v-if="studio.overlay === 'board'" />
      <InboxPanel v-if="studio.overlay === 'inbox'" />
    </div>

    <EmployeeDrawer v-if="studio.selectedEmployee" :key="studio.selectedEmployee.id" />
  </div>
</template>

<style scoped>
.office { height: 100vh; display: grid; grid-template-columns: 1fr; }
.office.split { grid-template-columns: 1fr 1fr; }
.stage { position: relative; overflow: hidden; min-width: 0; }
.map { position: absolute; inset: 0; }
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
nav { margin-left: auto; display: flex; gap: 6px; }
nav button, .ghost { box-shadow: 3px 3px 0 #000; }
nav .on { border-color: var(--accent); }
.primary { background: var(--accent); color: #1b1a24; border-color: #000; font-weight: bold; }
.zoom-hint { position: absolute; right: 12px; bottom: 8px; margin: 0; font-size: 10px; color: var(--muted); pointer-events: none; }
.hint { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--panel); border: 2px solid var(--line); padding: 8px 14px; box-shadow: 3px 3px 0 #000; margin: 0; font-size: 13px; }
@keyframes blink { 50% { opacity: 0.5; } }
</style>

<script setup lang="ts">
/**
 * Oficina de prueba: la escena y el modo creativo con empleados de ejemplo,
 * sin proyecto ni CLIs. Solo la usa demo.html; la app no la incluye.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useOffice } from '../stores/office'
import { OfficeScene, type SceneEmployee } from '../world/scene'
import MapEditor from './MapEditor.vue'

const office = useOffice()
const mapEl = ref<HTMLDivElement>()
const scene = shallowRef<OfficeScene>()
const query = new URLSearchParams(location.search)
const editing = ref(query.has('editar'))
const selected = ref<string | null>(query.get('sel'))

const STAFF: SceneEmployee[] = [
  { id: 'jefe', name: 'Don Ramón', role: 'jefe', provider: 'claude', state: 'working' },
  { id: 'lupita-backend', name: 'Lupita', role: 'backend', provider: 'claude', state: 'working' },
  { id: 'beto-backend', name: 'Beto', role: 'backend', provider: 'codex', state: 'idle' },
  { id: 'nico-frontend', name: 'Nico', role: 'frontend', provider: 'antigravity', state: 'blocked' },
  { id: 'tavo-frontend', name: 'Tavo', role: 'frontend', provider: 'opencode', state: 'waiting', waitingFor: 'lupita-backend' },
  { id: 'ximena-desarrollo', name: 'Ximena', role: 'desarrollo', provider: 'commandcode', state: 'delivering', slot: 0 },
  { id: 'paty-qa', name: 'Paty', role: 'qa', provider: 'kimi', state: 'gaming', slot: 0 },
  { id: 'rafa-dba', name: 'Rafa', role: 'dba', provider: 'grok', state: 'resting', slot: 0 },
  { id: 'sofi-infra', name: 'Sofi', role: 'infra', provider: 'claude', state: 'working' },
  { id: 'memo-qa', name: 'Memo', role: 'qa', provider: 'codex', state: 'idle' },
]

const insets = () => scene.value?.setInsets({ top: 56, bottom: 8, left: editing.value ? 320 : 0 })

onMounted(async () => {
  const s = new OfficeScene(mapEl.value!, (id) => (selected.value = id))
  scene.value = s
  // A la mano en la consola del navegador, para probar.
  Object.assign(window, { escena: s })
  insets()
  if (!query.has('ejemplo')) await office.load()
  await s.setMap(office.map)
  await s.sync(STAFF, selected.value)
  // ?ff=N adelanta el tiempo para ver a todos ya en su lugar.
  const frame = (s as unknown as { frame(dt: number): void }).frame.bind(s)
  for (let i = 0; i < Number(query.get('ff') ?? 0); i++) frame(0.1)
})
watch(() => office.map, (m) => scene.value?.setMap(m))
watch(selected, (id) => scene.value?.sync(STAFF, id))
watch(editing, insets)
onBeforeUnmount(() => scene.value?.destroy())
</script>

<template>
  <div class="demo">
    <div ref="mapEl" class="map" />
    <header>
      <strong>Oficina de prueba</strong>
      <button :class="{ on: editing }" @click="editing = !editing">Editar oficina</button>
    </header>
    <MapEditor v-if="editing && scene" :scene="scene" @close="editing = false" />
  </div>
</template>

<style scoped>
.demo { position: relative; height: 100vh; overflow: hidden; }
.map { position: absolute; inset: 0; }
header { position: absolute; top: 12px; left: 12px; right: 12px; display: flex; justify-content: space-between; align-items: center; pointer-events: none; }
header > * { pointer-events: auto; box-shadow: 3px 3px 0 #000; }
header strong { background: var(--panel); border: 2px solid var(--line); padding: 4px 10px; }
.on { border-color: var(--accent); }
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useStudio } from '../stores/studio'
import TerminalView from './TerminalView.vue'
import type { FileChange } from '../../../shared/ipc'

const props = defineProps<{ id: string }>()
const studio = useStudio()
const employee = computed(() => studio.employees.find((e) => e.id === props.id))
const tab = ref<'terminal' | 'archivos' | 'tarea'>('terminal')
const changes = ref<FileChange[]>([])

async function loadChanges() {
  changes.value = await window.orquest.changes(props.id)
}
let timer: ReturnType<typeof setInterval> | undefined
watch(
  [tab, () => props.id],
  () => {
    clearInterval(timer)
    if (tab.value === 'archivos') {
      loadChanges()
      timer = setInterval(loadChanges, 3000)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="drawer" v-if="employee">
    <header>
      <strong>{{ employee.role }} · {{ employee.provider }}</strong>
      <small>{{ employee.office.branch }}</small>
      <nav>
        <button :class="{ on: tab === 'terminal' }" @click="tab = 'terminal'">Terminal</button>
        <button :class="{ on: tab === 'archivos' }" @click="tab = 'archivos'">Archivos</button>
        <button :class="{ on: tab === 'tarea' }" @click="tab = 'tarea'">Tarea</button>
      </nav>
      <button @click="studio.fire(employee.id, false)">Despedir</button>
      <button @click="studio.selected = null">✕</button>
    </header>
    <TerminalView v-show="tab === 'terminal'" :id="employee.id" />
    <ul v-if="tab === 'archivos'" class="files">
      <li v-if="!changes.length" class="muted">Sin cambios en su oficina.</li>
      <li v-for="c in changes" :key="c.path"><code>{{ c.status }}</code> {{ c.path }}</li>
    </ul>
    <div v-if="tab === 'tarea'" class="task">
      <p>Oficina: <code>{{ employee.office.path }}</code></p>
      <p v-for="w in employee.warnings" :key="w" class="muted">⚠ {{ w }}</p>
      <p class="muted">Las tareas asignadas por el jefe llegan en la fase 2.</p>
    </div>
  </div>
</template>

<style scoped>
.drawer { position: fixed; right: 0; top: 0; bottom: 0; width: min(900px, 65vw); background: var(--bg); border-left: 3px solid var(--line); display: flex; flex-direction: column; }
header { display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 2px solid var(--line); }
header small { color: var(--muted); }
nav { margin-left: auto; display: flex; gap: 4px; }
nav .on { border-color: var(--accent); }
.files, .task { padding: 12px; margin: 0; list-style: none; font-size: 13px; }
.muted { color: var(--muted); }
</style>

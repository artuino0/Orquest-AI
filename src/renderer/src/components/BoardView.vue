<script setup lang="ts">
import { computed } from 'vue'
import { useStudio } from '../stores/studio'
import { DEPARTMENTS, departmentFor } from '../world/layout'
import { TASK_STATUS } from './taskLabels'

/** Vista compacta del proyecto, siempre a un clic: tareas por departamento, responsable, estado y dependencias. */
const studio = useStudio()
const roleOf = (id: string) => studio.board?.staff.find((m) => m.id === id)?.role ?? 'desarrollo'
const byDept = computed(() => {
  const tasks = studio.board?.tasks ?? []
  return DEPARTMENTS.map((d) => ({ dept: d, tasks: tasks.filter((t) => departmentFor(roleOf(t.assignee)) === d) })).filter((g) => g.tasks.length)
})
</script>

<template>
  <div class="sheet">
    <header>
      <h2>Tablero</h2>
      <button class="x" @click="studio.overlay = null">✕</button>
    </header>
    <p v-if="studio.board?.goal" class="goal">{{ studio.board.goal }}</p>
    <p v-if="!byDept.length" class="muted">Sin tareas todavía. El jefe las asigna al contratar la plantilla.</p>
    <section v-for="g in byDept" :key="g.dept">
      <h3>{{ g.dept }}</h3>
      <table>
        <tr v-for="t in g.tasks" :key="t.id" @click="studio.select(t.assignee)">
          <td class="id">{{ t.id }}</td>
          <td>
            {{ t.title }}
            <small v-if="t.kind === 'qa'">QA</small>
            <small v-if="t.returns">regresó {{ t.returns }}×</small>
          </td>
          <td class="muted">{{ studio.nameOf(t.assignee) }}</td>
          <td><span class="pill" :class="t.status">{{ TASK_STATUS[t.status] }}</span></td>
          <td class="muted">{{ t.deps.length ? '← ' + t.deps.join(', ') : '' }}</td>
        </tr>
      </table>
    </section>
  </div>
</template>

<style scoped>
.sheet { position: absolute; top: 64px; right: 12px; width: min(640px, calc(100% - 24px)); max-height: calc(100% - 80px); overflow: auto; background: var(--panel); border: 3px solid var(--line); box-shadow: 6px 6px 0 #000; padding: 16px; }
header { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; }
.goal { font-size: 12px; color: var(--muted); margin: 6px 0 0; }
h3 { font-size: 12px; text-transform: uppercase; color: var(--accent); margin: 12px 0 4px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
tr { cursor: pointer; }
tr:hover { background: var(--line); }
td { padding: 4px; vertical-align: top; }
.id { color: var(--muted); width: 32px; }
small { margin-left: 6px; color: var(--accent); font-size: 10px; }
.muted { color: var(--muted); }
.x { padding: 0 6px; }
.pill { font-size: 10px; padding: 1px 6px; color: #111; background: var(--line); white-space: nowrap; }
.pill.waiting { background: #9fa8da; }
.pill.ready, .pill.in_progress { background: var(--working); }
.pill.delivered, .pill.in_qa { background: var(--starting); }
.pill.approved { background: var(--accent); }
.pill.merged, .pill.done { background: var(--idle); }
</style>

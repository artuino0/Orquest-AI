<script setup lang="ts">
import { computed } from 'vue'
import { Kanban, Undo2 } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import { DEPARTMENTS, departmentFor } from '../world/layout'
import { capital, qaOf, TASK_COLOR, TASK_STATUS } from './taskLabels'
import PanelFrame from './PanelFrame.vue'

/** Vista compacta del proyecto, siempre a un clic: tareas por departamento, responsable, estado y dependencias. */
const studio = useStudio()
const tasks = computed(() => studio.board?.tasks ?? [])
const member = (id: string) => studio.board?.staff.find((m) => m.id === id)
const byDept = computed(() =>
  DEPARTMENTS.map((d) => ({ dept: d, tasks: tasks.value.filter((t) => departmentFor(member(t.assignee)?.role ?? 'desarrollo') === d) })).filter((g) => g.tasks.length),
)
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const subtitle = computed(() => {
  if (!tasks.value.length) return 'Sin tareas'
  const waiting = tasks.value.filter((t) => t.status === 'approved').length
  const merged = tasks.value.filter((t) => t.status === 'merged').length
  return [count(tasks.value.length, 'tarea', 'tareas'), `${count(waiting, 'espera', 'esperan')} tu aprobación`, count(merged, 'integrada', 'integradas')].join(' · ')
})
/** De qué depende una tarea; si su dependencia sigue abierta, con quién la tiene. */
function deps(ids: string[]) {
  return ids.map((id) => {
    const d = tasks.value.find((t) => t.id === id)
    const open = d && !['merged', 'done'].includes(d.status)
    return open ? `${id} · ${studio.nameOf(d.assignee)}` : id
  }).join(', ')
}
</script>

<template>
  <PanelFrame title="Tablero" :subtitle="subtitle">
    <div v-if="!tasks.length" class="blank">
      <Kanban />
      <h2>Aún no hay tareas</h2>
      <p>El jefe crea las tareas cuando apruebas la plantilla. Hasta entonces el tablero se queda en blanco.</p>
      <button class="btn primary" @click="studio.overlay = 'boss'">Hablar con el Jefe</button>
    </div>

    <table v-else class="tbl">
      <thead>
        <tr><th>ID</th><th>Título</th><th>Responsable</th><th>Estado</th><th>Depende de</th><th>Regresos</th><th>QA</th></tr>
      </thead>
      <tbody v-for="g in byDept" :key="g.dept">
        <tr class="group"><td colspan="7"><b>{{ g.dept }}</b> {{ count(g.tasks.length, 'tarea', 'tareas') }}</td></tr>
        <tr v-for="t in g.tasks" :key="t.id" class="pick" @click="studio.select(t.assignee)">
          <td class="id">{{ t.id }}</td>
          <td>{{ t.title }}</td>
          <td><span class="pv"><i :style="{ background: `var(--pv-${member(t.assignee)?.provider ?? 'grok'})` }" />{{ studio.nameOf(t.assignee) }}</span></td>
          <td><span class="chip" :style="{ color: `var(--st-${TASK_COLOR[t.status]})` }">■ {{ capital(TASK_STATUS[t.status]) }}</span></td>
          <td :class="t.deps.length ? 'dep' : 'dim'">{{ t.deps.length ? deps(t.deps) : '—' }}</td>
          <td :class="t.returns ? (t.returns > 1 ? 'ret hot' : 'ret') : 'dim'"><template v-if="t.returns"><Undo2 /> {{ t.returns }}</template><template v-else>—</template></td>
          <td><span class="chip qa" :style="{ color: qaOf(t).color ? `var(--st-${qaOf(t).color})` : 'var(--text-secondary)' }">{{ qaOf(t).text }}</span></td>
        </tr>
      </tbody>
    </table>
  </PanelFrame>
</template>

<style scoped>
.group td { padding: 7px 12px; background: var(--surface); font-size: 10px; color: var(--text-secondary); }
.group b { font: 700 12px var(--font-pixel); color: var(--accent); text-transform: uppercase; margin-right: 6px; }
.id { font-weight: 700; color: var(--accent); white-space: nowrap; }
.dep { color: var(--st-dep); }
.ret { color: var(--accent); font-weight: 700; white-space: nowrap; }
.ret.hot { color: var(--st-block); }
.ret svg { width: 12px; height: 12px; vertical-align: -2px; }
.qa { text-transform: uppercase; }
.pick { cursor: pointer; }
.pick:hover td { background: var(--surface); }
</style>

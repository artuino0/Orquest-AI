<script setup lang="ts">
import { computed, ref } from 'vue'
import { Kanban, Undo2 } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import { DEPARTMENTS, departmentFor } from '../world/layout'
import { capital, qaOf, TASK_COLOR, TASK_STATUS } from './taskLabels'
import PanelFrame from './PanelFrame.vue'
import { roleLabel } from '../status'

/** Vista compacta del proyecto, siempre a un clic: tareas por departamento, responsable, estado y dependencias. */
const studio = useStudio()
const tasks = computed(() => studio.board?.tasks ?? [])
const member = (id: string) => studio.board?.staff.find((m) => m.id === id)
const deptOf = (assignee: string) => departmentFor(member(assignee)?.role ?? 'desarrollo')
// Filtros: por área (el puesto de quien la lleva) y por estado. Vacío = todo.
const area = ref('')
const status = ref('')
const areas = computed(() => DEPARTMENTS.filter((d) => tasks.value.some((t) => deptOf(t.assignee) === d)).map((d) => ({ id: d as string, n: tasks.value.filter((t) => deptOf(t.assignee) === d).length })))
const statuses = computed(() => (Object.keys(TASK_STATUS) as (keyof typeof TASK_STATUS)[]).map((s) => ({ id: s as string, n: tasks.value.filter((t) => t.status === s).length })).filter((s) => s.n))
const filtered = computed(() => tasks.value.filter((t) => (!area.value || deptOf(t.assignee) === area.value) && (!status.value || t.status === status.value)))
const byDept = computed(() => DEPARTMENTS.map((d) => ({ dept: d, tasks: filtered.value.filter((t) => deptOf(t.assignee) === d) })).filter((g) => g.tasks.length))
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

    <template v-else>
      <div class="filters">
        <span class="cap">Área</span>
        <button :class="{ on: !area }" @click="area = ''">Todas <b>{{ tasks.length }}</b></button>
        <button v-for="a in areas" :key="a.id" :class="{ on: area === a.id }" @click="area = area === a.id ? '' : a.id">{{ roleLabel(a.id) }} <b>{{ a.n }}</b></button>
        <i class="gap" />
        <span class="cap">Estado</span>
        <button :class="{ on: !status }" @click="status = ''">Todos</button>
        <button v-for="st in statuses" :key="st.id" :class="{ on: status === st.id }" :style="{ '--c': `var(--st-${TASK_COLOR[st.id as keyof typeof TASK_COLOR]})` }" @click="status = status === st.id ? '' : st.id">
          <i class="sq" />{{ capital(TASK_STATUS[st.id as keyof typeof TASK_STATUS]) }} <b>{{ st.n }}</b>
        </button>
      </div>
      <p v-if="!filtered.length" class="dim none">Ninguna tarea con ese filtro.</p>
    <table v-else class="tbl">
      <thead>
        <tr><th>ID</th><th>Título</th><th>Responsable</th><th>Estado</th><th>Depende de</th><th>Regresos</th><th>QA</th></tr>
      </thead>
      <tbody v-for="g in byDept" :key="g.dept">
        <tr class="group"><td colspan="7"><b>{{ roleLabel(g.dept) }}</b> {{ count(g.tasks.length, 'tarea', 'tareas') }}</td></tr>
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
    </template>
  </PanelFrame>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.filters .cap { margin-right: 2px; }
.filters .gap { width: 14px; }
.filters button { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; font: 11px var(--font); color: var(--text-secondary); background: var(--bg); border: 2px solid var(--border); text-transform: capitalize; }
.filters button b { font-weight: 700; color: var(--text-primary); }
.filters button.on { border-color: var(--accent); color: var(--text-primary); background: var(--surface-2); }
.filters .sq { width: 8px; height: 8px; background: var(--c); }
.none { margin: 0; padding: 20px 0; }
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

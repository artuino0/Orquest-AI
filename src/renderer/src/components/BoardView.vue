<script setup lang="ts">
import { computed } from 'vue'
import { useStudio } from '../stores/studio'
import { DEPARTMENTS, departmentFor } from '../world/layout'
import { LOOKS } from '../world/behavior'

/** Vista compacta del proyecto, siempre a un clic: quién, dónde y en qué estado. */
const studio = useStudio()
const byDept = computed(() =>
  DEPARTMENTS.map((d) => ({ dept: d, people: studio.employees.filter((e) => departmentFor(e.role) === d) })).filter(
    (g) => g.people.length,
  ),
)
</script>

<template>
  <div class="sheet">
    <header>
      <h2>Tablero</h2>
      <button class="x" @click="studio.overlay = null">✕</button>
    </header>
    <p v-if="!byDept.length" class="muted">Sin empleados todavía.</p>
    <section v-for="g in byDept" :key="g.dept">
      <h3>{{ g.dept }}</h3>
      <table>
        <tr v-for="e in g.people" :key="e.id" @click="studio.select(e.id)">
          <td class="who">{{ e.provider }}<small v-if="e.model"> · {{ e.model }}</small></td>
          <td><span class="pill" :class="e.state">{{ LOOKS[e.state].label }}</span></td>
          <td class="muted">sin tarea asignada</td>
          <td class="muted">—</td>
        </tr>
      </table>
    </section>
    <p class="muted foot">Tareas y dependencias llegan con el jefe (fase 2).</p>
  </div>
</template>

<style scoped>
.sheet { position: absolute; top: 64px; right: 12px; width: min(520px, calc(100% - 24px)); max-height: calc(100% - 80px); overflow: auto; background: var(--panel); border: 3px solid var(--line); box-shadow: 6px 6px 0 #000; padding: 16px; }
header { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; }
h3 { font-size: 12px; text-transform: uppercase; color: var(--accent); margin: 12px 0 4px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
tr { cursor: pointer; }
tr:hover { background: var(--line); }
td { padding: 4px; }
.muted { color: var(--muted); }
.foot { font-size: 11px; margin: 12px 0 0; }
.x { padding: 0 6px; }
.pill { font-size: 11px; padding: 1px 6px; color: #111; }
.pill.starting { background: var(--starting); }
.pill.working { background: var(--working); }
.pill.blocked { background: var(--blocked); color: #fff; }
.pill.idle { background: var(--idle); }
.pill.exited { background: var(--exited); color: #fff; }
</style>

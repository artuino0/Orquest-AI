<script setup lang="ts">
import { ref } from 'vue'
import { useStudio } from '../stores/studio'
import { DEPARTMENTS } from '../world/layout'
import type { CliStatus } from '../../../shared/ipc'

/**
 * Contratación por plantilla: una fila por puesto con proveedor, modelo y
 * esfuerzo. En la fase 2 la propuesta la arma el jefe; por ahora se parte de
 * una plantilla base que el usuario ajusta.
 */
interface Row {
  role: string
  provider: CliStatus['id']
  model: string
  effort: '' | 'low' | 'medium' | 'high'
}

const studio = useStudio()
const first = studio.usable[0]?.id ?? 'claude'
const rows = ref<Row[]>(
  ['backend', 'frontend', 'qa'].map((role) => ({ role, provider: first, model: '', effort: '' })),
)
const busy = ref(false)

function add() {
  rows.value.push({ role: 'desarrollo', provider: first, model: '', effort: '' })
}

async function hireAll() {
  busy.value = true
  const pending = [...rows.value]
  for (const r of pending) {
    const ok = await studio.hire({
      provider: r.provider,
      role: r.role,
      model: r.model || undefined,
      effort: r.effort || undefined,
    })
    if (!ok) break
    rows.value.splice(rows.value.indexOf(r), 1)
  }
  busy.value = false
  if (!rows.value.length) studio.overlay = null
}

const status = (id: string) => studio.clis.find((c) => c.id === id)
</script>

<template>
  <div class="sheet">
    <header>
      <h2>Plantilla propuesta</h2>
      <button class="x" @click="studio.overlay = null">✕</button>
    </header>
    <p class="note">
      Elige proveedor, modelo y esfuerzo para cada puesto. Cada contratado entra por Recepción y camina a su
      departamento.
    </p>

    <table>
      <thead>
        <tr><th>Puesto</th><th>Proveedor</th><th>Modelo</th><th>Esfuerzo</th><th /></tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i">
          <td>
            <select v-model="r.role"><option v-for="d in DEPARTMENTS" :key="d">{{ d }}</option></select>
          </td>
          <td>
            <select v-model="r.provider">
              <option v-for="c in studio.usable" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <small>{{ status(r.provider)?.version }}</small>
          </td>
          <td><input v-model="r.model" placeholder="por defecto" /></td>
          <td>
            <select v-model="r.effort">
              <option value="">por defecto</option>
              <option value="low">bajo</option>
              <option value="medium">medio</option>
              <option value="high">alto</option>
            </select>
          </td>
          <td><button class="x" title="Quitar puesto" @click="rows.splice(i, 1)">✕</button></td>
        </tr>
      </tbody>
    </table>

    <p v-if="studio.error" class="err">{{ studio.error }}</p>
    <footer>
      <button @click="add">+ Puesto</button>
      <button class="primary" :disabled="!rows.length || !studio.canHire || busy" @click="hireAll">
        {{ busy ? 'Contratando…' : `Contratar ${rows.length}` }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.sheet { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); width: min(720px, calc(100% - 32px)); background: var(--panel); border: 3px solid var(--line); box-shadow: 6px 6px 0 #000; padding: 16px; display: grid; gap: 12px; }
header, footer { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; }
.note { margin: 0; color: var(--muted); font-size: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; color: var(--muted); font-weight: normal; font-size: 11px; padding: 4px; }
td { padding: 4px; vertical-align: top; }
td select, td input { width: 100%; }
td small { color: var(--muted); font-size: 10px; }
.x { padding: 0 6px; }
.err { color: var(--blocked); font-size: 12px; margin: 0; }
.primary { background: var(--accent); color: #1b1a24; border-color: #000; font-weight: bold; }
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStudio } from '../stores/studio'
import { DEPARTMENTS } from '../world/layout'
import type { Check, ProviderId, SlotEdit } from '../../../shared/ipc'

/**
 * El jefe propone la plantilla; aquí la apruebas tal cual o con tus cambios
 * (proveedor, modelo, esfuerzo, quitar o añadir puestos). Al aprobar, el jefe
 * levanta a cada empleado.
 */
interface Row extends SlotEdit {
  reason?: string
}

const studio = useStudio()
const rows = ref<Row[]>([])
const busy = ref(false)

watch(
  () => studio.proposal.map((s) => s.id).join(),
  () => {
    rows.value = studio.proposal.map((s) => ({ id: s.id, role: s.role, provider: s.provider, model: s.model ?? '', effort: s.effort, reason: s.reason }))
  },
  { immediate: true },
)

// Expedientes: cada fila se revisa al cambiar; lo prohibido no se puede aprobar.
const checks = ref<Check[]>([])
watch(
  () => rows.value.map((r) => `${r.provider}|${r.model}|${r.role}`).join(),
  async () => {
    checks.value = await window.orquest.checkSlots(rows.value.map((r) => ({ provider: r.provider, model: r.model || undefined, role: r.role })))
  },
  { immediate: true },
)
const blocked = computed(() => checks.value.some((c) => !c.ok))
const checkText = (c?: Check) => (!c ? '' : c.ok ? c.warning ?? '' : c.reason)

const staffed = computed(() => studio.board?.slots.filter((s) => s.status !== 'proposed') ?? [])
const first = (): ProviderId => studio.usable[0]?.id ?? 'claude'

function add() {
  rows.value.push({ role: 'desarrollo', provider: first(), model: '' })
}

async function approve() {
  busy.value = true
  const ok = await studio.approveTemplate(rows.value.map(({ reason: _r, ...r }) => ({ ...r, model: r.model || undefined, effort: r.effort || undefined })))
  busy.value = false
  if (ok) studio.overlay = null
}

async function askBoss() {
  await studio.sayToBoss('Propón la plantilla para el proyecto.')
}
</script>

<template>
  <div class="sheet">
    <header>
      <h2>Plantilla</h2>
      <button class="x" @click="studio.overlay = null">✕</button>
    </header>

    <template v-if="rows.length">
      <p class="note">El jefe propone. Ajusta lo que quieras y aprueba; él levanta a cada empleado.</p>
      <table>
        <thead>
          <tr><th>Puesto</th><th>Proveedor</th><th>Modelo</th><th>Esfuerzo</th><th /></tr>
        </thead>
        <tbody>
          <template v-for="(r, i) in rows" :key="r.id ?? i">
            <tr>
              <td><select v-model="r.role"><option v-for="d in DEPARTMENTS" :key="d">{{ d }}</option></select></td>
              <td>
                <select v-model="r.provider">
                  <option v-for="c in studio.usable" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </td>
              <td><input v-model="r.model" placeholder="por defecto" /></td>
              <td>
                <select v-model="r.effort">
                  <option :value="undefined">por defecto</option>
                  <option value="low">bajo</option>
                  <option value="medium">medio</option>
                  <option value="high">alto</option>
                </select>
              </td>
              <td><button class="x" title="Quitar puesto" @click="rows.splice(i, 1)">✕</button></td>
            </tr>
            <tr v-if="r.reason" class="reason"><td colspan="5">“{{ r.reason }}”</td></tr>
            <tr v-if="checkText(checks[i])" class="check" :class="checks[i]?.ok ? 'warn' : 'block'"><td colspan="5">{{ checks[i]?.ok ? '⚠' : '⛔' }} {{ checkText(checks[i]) }}</td></tr>
          </template>
        </tbody>
      </table>
      <p v-if="studio.error" class="err">{{ studio.error }}</p>
      <footer>
        <button @click="add">+ Puesto</button>
        <button class="primary" :disabled="busy || blocked" @click="approve">Aprobar {{ rows.length }}</button>
      </footer>
    </template>

    <template v-else>
      <p class="note">
        {{ studio.bossOnline ? 'El jefe aún no propone plantilla.' : 'Primero contrata al jefe: él propone la plantilla.' }}
      </p>
      <button v-if="studio.bossOnline" @click="askBoss">Pedírsela</button>
      <button v-else class="primary" @click="studio.overlay = 'boss'">Contratar al jefe</button>
    </template>

    <section v-if="staffed.length">
      <h3>Aprobados</h3>
      <ul>
        <li v-for="s in staffed" :key="s.id">
          {{ s.role }} · {{ s.provider }}{{ s.model ? ' · ' + s.model : '' }}
          <small>{{ s.status === 'hired' ? 'contratado' : 'por levantar' }}</small>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.sheet { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); width: min(720px, calc(100% - 32px)); max-height: calc(100% - 80px); overflow: auto; background: var(--panel); border: 3px solid var(--line); box-shadow: 6px 6px 0 #000; padding: 16px; display: grid; gap: 12px; }
header, footer { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; }
h3 { font-size: 12px; text-transform: uppercase; color: var(--muted); margin: 0 0 4px; }
.note { margin: 0; color: var(--muted); font-size: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; color: var(--muted); font-weight: normal; font-size: 11px; padding: 4px; }
td { padding: 4px; vertical-align: top; }
td select, td input { width: 100%; }
.check td { font-size: 11px; padding-top: 0; }
.check.warn td { color: var(--accent); }
.check.block td { color: var(--blocked); }
.reason td { color: var(--muted); font-size: 11px; padding-top: 0; font-style: italic; }
ul { list-style: none; margin: 0; padding: 0; font-size: 12px; display: grid; gap: 2px; }
small { color: var(--muted); margin-left: 6px; }
.x { padding: 0 6px; }
.err { color: var(--blocked); font-size: 12px; margin: 0; }
.primary { background: var(--accent); color: #1b1a24; border-color: #000; font-weight: bold; }
</style>

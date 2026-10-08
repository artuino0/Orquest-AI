<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Ban, Check as CheckIcon, Pencil, Plus, Trash2, Users } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import { DEPARTMENTS } from '../world/layout'
import { EFFORT_LABEL, LOOK, lookOf } from '../status'
import type { Check, ProviderId, SlotEdit } from '../../../shared/ipc'
import PanelFrame from './PanelFrame.vue'

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
    rows.value = studio.proposal.map((s) => ({ id: s.id, name: s.name, role: s.role, provider: s.provider, model: s.model ?? '', effort: s.effort, reason: s.reason }))
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
const forbidden = computed(() => checks.value.filter((c) => !c.ok).length)
/** Cómo sale la regla del expediente de una fila. */
function rule(c: Check | undefined, r: Row) {
  const cli = cliName(r.provider)
  if (!c) return { kind: 'ok', chip: 'Permitido', text: '' }
  if (!c.ok) return { kind: 'no', chip: 'Prohibido', text: c.reason }
  if (c.warning) return { kind: 'warn', chip: 'Aviso', text: c.warning }
  return { kind: 'ok', chip: 'Permitido', text: `${cli} puede ocupar ${r.role}.` }
}

const cliName = (id: ProviderId) => studio.clis.find((c) => c.id === id)?.name ?? id
const first = (): ProviderId => studio.usable[0]?.id ?? 'claude'
const cliOf = (id: ProviderId) => studio.clis.find((c) => c.id === id)

function add() {
  rows.value.push({ name: '', role: 'desarrollo', provider: first(), model: '' })
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

/** Ya contratados: lo que dice el tablero, con el estado vivo de su terminal. */
const staff = computed(() =>
  (studio.board?.staff ?? []).map((m) => {
    const e = studio.employees.find((x) => x.id === m.id)
    const look = LOOK[e ? lookOf(e, studio.board?.hints) : 'exited']
    const slot = studio.board?.slots.find((s) => s.employeeId === m.id)
    return { ...m, look, effort: slot?.effort ?? e?.effort, context: Math.round(studio.board?.context[m.id] ?? e?.context ?? 0) }
  }),
)
const subtitle = computed(() => {
  const n = rows.value.length
  return n ? `Propuesta de ${studio.nameOf('jefe')} · ${n} ${n === 1 ? 'puesto' : 'puestos'} por aprobar` : `${staff.value.length} en la plantilla`
})
</script>

<template>
  <PanelFrame title="Plantilla" :subtitle="subtitle">
    <template v-if="rows.length">
      <table class="tbl proposal">
        <thead>
          <tr><th>Nombre</th><th>Puesto</th><th>Proveedor</th><th>Modelo</th><th>Esf.</th><th>Motivo del jefe</th><th>Regla del expediente</th><th /></tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="r.id ?? i" :class="rule(checks[i], r).kind">
            <td><label class="name"><input v-model="r.name" placeholder="se asigna solo" /><Pencil /></label></td>
            <td>
              <select v-model="r.role" class="plain"><option v-for="d in DEPARTMENTS" :key="d">{{ d }}</option></select>
            </td>
            <td>
              <span class="pv"><i :style="{ background: `var(--pv-${r.provider})` }" />
                <select v-model="r.provider" class="plain">
                  <option v-for="c in studio.usable" :key="c.id" :value="c.id">{{ c.name }}</option>
                  <option v-if="!studio.usable.some((c) => c.id === r.provider)" :value="r.provider">{{ cliName(r.provider) }}</option>
                </select>
              </span>
            </td>
            <td>
              <input v-model="r.model" class="plain" placeholder="por defecto" :list="`models-${r.provider}`" />
              <datalist :id="`models-${r.provider}`"><option v-for="m in cliOf(r.provider)?.models ?? []" :key="m" :value="m" /></datalist>
            </td>
            <td>
              <select v-model="r.effort" class="plain" :disabled="!cliOf(r.provider)?.efforts?.length" :title="cliOf(r.provider)?.efforts?.length ? '' : 'Esta CLI no recibe esfuerzo'">
                <option :value="undefined">—</option>
                <option v-for="f in cliOf(r.provider)?.efforts ?? []" :key="f" :value="f">{{ EFFORT_LABEL[f].toLowerCase() }}</option>
                <option v-if="r.effort && !cliOf(r.provider)?.efforts?.includes(r.effort)" :value="r.effort">{{ EFFORT_LABEL[r.effort].toLowerCase() }} (no lo recibe)</option>
              </select>
            </td>
            <td class="dim why">{{ r.reason || '—' }}</td>
            <td class="rule">
              <span class="chip">{{ rule(checks[i], r).chip }}</span>
              <p>{{ rule(checks[i], r).text }}</p>
            </td>
            <td><button class="trash" title="Quitar puesto" @click="rows.splice(i, 1)"><Trash2 /></button></td>
          </tr>
        </tbody>
      </table>
      <div class="actions">
        <button class="btn" @click="add"><Plus /> Añadir puesto</button>
        <span class="grow" />
        <span v-if="forbidden" class="stop"><Ban /> {{ forbidden }} {{ forbidden === 1 ? 'fila prohibida' : 'filas prohibidas' }}: cambia su proveedor o quítala para poder aprobar.</span>
        <span v-if="studio.error" class="stop">{{ studio.error }}</span>
        <button class="btn primary" :disabled="busy || !!forbidden" @click="approve"><CheckIcon /> {{ busy ? 'Aprobando…' : `Aprobar ${rows.length}` }}</button>
      </div>
    </template>

    <div v-else-if="!staff.length" class="blank">
      <Users />
      <h2>Aún no hay plantilla</h2>
      <p v-if="studio.bossOnline">El jefe todavía no propone puestos. Pídeselo y aparecerán aquí para que los apruebes.</p>
      <p v-else>Primero contrata al jefe: él lee el proyecto y propone quién hace falta.</p>
      <button v-if="studio.bossOnline" class="btn primary" @click="askBoss">Pedir propuesta al Jefe</button>
      <button v-else class="btn primary" @click="studio.overlay = 'boss'">Contratar jefe</button>
    </div>

    <template v-if="staff.length">
      <span class="cap">Ya contratados · {{ staff.length }}</span>
      <table class="tbl">
        <thead>
          <tr><th>Nombre</th><th>Puesto</th><th>Proveedor</th><th>Modelo</th><th>Esf.</th><th>Estado</th><th>Contexto</th></tr>
        </thead>
        <tbody>
          <tr v-for="m in staff" :key="m.id" class="pick" @click="studio.select(m.id)">
            <td class="strong">{{ m.name }}</td>
            <td>{{ m.role }}</td>
            <td><span class="pv"><i :style="{ background: `var(--pv-${m.provider})` }" />{{ cliName(m.provider) }}</span></td>
            <td class="dim">{{ m.model ?? '—' }}</td>
            <td>{{ m.effort ? EFFORT_LABEL[m.effort].toLowerCase() : '—' }}</td>
            <td><span class="chip" :style="{ color: `var(--st-${m.look.color})` }">■ {{ m.look.label }}</span></td>
            <td><span class="meter" :class="{ hot: m.context >= (studio.board?.burnoutAt ?? 80) }"><i><b :style="{ width: `${m.context}%` }" /></i>{{ m.context }}%</span></td>
          </tr>
        </tbody>
      </table>
    </template>
  </PanelFrame>
</template>

<style scoped>
.proposal tr.warn td { background: var(--tint-warn); }
.proposal tr.no td { background: var(--tint-danger); }
.name { display: flex; align-items: center; gap: 6px; padding: 0 8px; background: var(--surface); border: 2px solid var(--border-light); width: 112px; }
.name input { flex: 1; min-width: 0; border: 0; background: none; padding: 5px 0; font: 700 12px var(--font); color: var(--text-primary); outline: none; }
.name svg { width: 12px; height: 12px; color: var(--text-secondary); flex: none; }
.plain { border: 0; background: none; padding: 2px 0; font: 12px var(--font); color: var(--text-primary); outline: none; max-width: 130px; }
select.plain { cursor: pointer; }
select.plain option { background: var(--surface); }
.why { line-height: 1.5; max-width: 280px; }
.rule { max-width: 260px; }
.rule p { margin: 4px 0 0; font-size: 11px; line-height: 1.5; color: var(--text-secondary); }
tr.ok .chip { color: var(--st-idle); }
tr.warn .chip, tr.warn .rule p { color: var(--accent); }
tr.no .chip, tr.no .rule p { color: var(--st-block); }
.chip { text-transform: uppercase; }
.trash { border: 0; background: none; padding: 4px; color: var(--text-secondary); display: grid; }
.trash svg { width: 16px; height: 16px; }
.trash:hover { color: var(--st-block); }
.actions { display: flex; align-items: center; gap: 12px; }
.grow { flex: 1; }
.stop { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--st-block); }
.stop svg { width: 14px; height: 14px; }
.pick { cursor: pointer; }
.pick:hover td { background: var(--surface); }
.tbl .chip { text-transform: none; }
.proposal .chip { text-transform: uppercase; }
</style>

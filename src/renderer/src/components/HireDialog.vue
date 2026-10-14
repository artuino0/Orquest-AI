<script lang="ts">
/** Lo que el usuario lleva ajustado de la propuesta en curso: el panel se desmonta al cerrarse y esto no. */
let kept: { key: string; rows: unknown[] } | null = null
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Ban, Check as CheckIcon, Pencil, Plus, Trash2, Users, X } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import { DEPARTMENTS } from '../world/layout'
import { EFFORT_LABEL, LOOK, lookOf, roleLabel } from '../status'
import type { Account } from '../../../core/accounts'
import type { Check, Effort, ProviderId, SlotEdit } from '../../../shared/ipc'
import PanelFrame from './PanelFrame.vue'
import { T } from '../../../core/i18n'

/**
 * El jefe propone la plantilla; aquí la apruebas tal cual o con tus cambios
 * (proveedor, modelo, esfuerzo, quitar o añadir puestos). Al aprobar, el jefe
 * levanta a cada empleado.
 */
interface Row extends SlotEdit {
  reason?: string
  /** El modelo se escribe a mano en vez de elegirse de la lista. */
  custom?: boolean
}

const studio = useStudio()
const rows = ref<Row[]>([])
const busy = ref(false)
// Cuentas de cada CLI: solo se ofrece elegir cuando un proveedor tiene más de una.
const accounts = ref<Account[]>([])
void window.orquest.accounts().then((a) => (accounts.value = a), () => {})
const accountsOf = (provider: string) => accounts.value.filter((a) => a.provider === provider)

watch(
  () => studio.proposal.map((s) => s.id).join(),
  (key) => {
    // Lo que ya ajustaste de esta misma propuesta se conserva aunque cierres el panel y vuelvas.
    rows.value = kept?.key === key ? (kept.rows as Row[]) : studio.proposal.map((s) => ({ id: s.id, name: s.name, role: s.role, provider: s.provider, model: s.model ?? '', effort: s.effort, account: s.account ?? '', reason: s.reason }))
  },
  { immediate: true },
)
watch(rows, (r) => (kept = { key: studio.proposal.map((s) => s.id).join(), rows: r }), { deep: true })

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
  if (!c) return { kind: 'ok', chip: T`Permitido`, text: '' }
  if (!c.ok) return { kind: 'no', chip: T`Prohibido`, text: c.reason }
  if (c.warning) return { kind: 'warn', chip: T`Aviso`, text: c.warning }
  return { kind: 'ok', chip: T`Permitido`, text: T`${cli} puede ocupar ${r.role}.` }
}

const cliName = (id: ProviderId) => studio.clis.find((c) => c.id === id)?.name ?? id
const first = (): ProviderId => studio.usable[0]?.id ?? 'claude'
const cliOf = (id: ProviderId) => studio.clis.find((c) => c.id === id)

const modelsOf = (id: ProviderId) => cliOf(id)?.models ?? []
/** Al cambiar de proveedor, el modelo y el esfuerzo del anterior ya no valen. */
function providerChanged(r: Row) {
  if (r.model && !modelsOf(r.provider).includes(r.model)) r.model = ''
  if (r.effort && !cliOf(r.provider)?.efforts?.includes(r.effort)) r.effort = undefined
  r.custom = false
}
/** «Escribir otro…» en la lista de modelos: esa fila pasa a escribirse a mano. */
function pickModel(r: Row, value: string) {
  if (value === OTHER) {
    r.custom = true
    r.model = ''
  } else r.model = value
}
const OTHER = '\u0000otro'

function add() {
  rows.value.push({ name: '', role: 'desarrollo', provider: first(), model: '' })
}

async function approve() {
  busy.value = true
  const ok = await studio.approveTemplate(rows.value.map(({ reason: _r, custom: _c, ...r }) => ({ ...r, model: r.model || undefined, effort: r.effort || undefined, account: accountsOf(r.provider).some((a) => !a.main && a.dir === r.account) ? r.account : undefined })))
  busy.value = false
  if (ok) {
    kept = null
    studio.overlay = null
  }
}

async function askBoss() {
  await studio.sayToBoss(T`Propón la plantilla para el proyecto.`)
}

/** Ya contratados: lo que dice el tablero, con el estado vivo de su terminal. */
const staff = computed(() =>
  (studio.board?.staff ?? []).map((m) => {
    const e = studio.employees.find((x) => x.id === m.id)
    const look = LOOK[e ? lookOf(e, studio.board?.hints) : 'exited']
    const slot = studio.board?.slots.find((s) => s.employeeId === m.id)
    // De quien ya no está, el contexto es el que llevaba al irse.
    const context = e ? studio.board?.context[m.id] ?? e.context : m.leftContext
    return { ...m, look, out: !e, known: context !== undefined, context: Math.round(context ?? 0), effort: slot?.effort ?? e?.effort }
  }),
)
// Filtros de los ya contratados: por área (su puesto) y por estado.
const area = ref('')
const state = ref('')
const areas = computed(() => [...new Set(staff.value.map((m) => m.role))])
const states = computed(() => [...new Set(staff.value.filter((m) => showGone.value || !m.gone).map((m) => (m.gone ? T`Despedido` : m.look.label)))])
// Los despedidos no salen si no se piden: ya no son parte de la plantilla.
const showGone = ref(false)
const goneCount = computed(() => staff.value.filter((m) => m.gone).length)

/** El jefe va arriba de la tabla: es el único al que también se le cambia el proveedor. */
const bossRow = computed(() => {
  const b = studio.board?.boss
  if (!b) return null
  const e = studio.employees.find((x) => x.id === 'jefe')
  const context = studio.board?.context.jefe ?? e?.context
  return { id: 'jefe', name: studio.nameOf('jefe'), provider: b.provider, model: b.model, effort: b.effort, look: LOOK[e ? lookOf(e, studio.board?.hints) : 'exited'], out: !e, known: context !== undefined, context: Math.round(context ?? 0) }
})

// Cambiar modelo y esfuerzo de quien ya trabaja: se elige en la fila y se aplica con su botón,
// porque aplicar le pide su traspaso y lo hace entrar de nuevo.
interface Tune { provider: ProviderId; model: string; effort?: Effort; custom?: boolean }
type Tunable = { id: string; provider: ProviderId; model?: string; effort?: Effort }
const tunes = ref<Record<string, Tune>>({})
const tuneOf = (m: Tunable): Tune => tunes.value[m.id] ?? { provider: m.provider, model: m.model ?? '', effort: m.effort }
function edit(m: Tunable, patch: Partial<Tune>) {
  tunes.value = { ...tunes.value, [m.id]: { ...tuneOf(m), ...patch } }
}
const tuned = (m: Tunable) => {
  const t = tunes.value[m.id]
  return !!t && (t.provider !== m.provider || t.model !== (m.model ?? '') || (t.effort ?? '') !== (m.effort ?? ''))
}
function forget(m: Tunable) {
  const next = { ...tunes.value }
  delete next[m.id]
  tunes.value = next
}
function tuneModel(m: Tunable, value: string) {
  if (value === OTHER) edit(m, { custom: true, model: '' })
  else edit(m, { model: value })
}
function tuneProvider(m: Tunable, provider: ProviderId) {
  const t = tuneOf(m)
  edit(m, { provider, model: modelsOf(provider).includes(t.model) ? t.model : '', effort: t.effort && cliOf(provider)?.efforts?.includes(t.effort) ? t.effort : undefined, custom: false })
}
const applying = ref('')
async function applyTune(m: Tunable) {
  const t = tunes.value[m.id]
  if (!t) return
  applying.value = m.id
  const ok = await studio.retune(m.id, { provider: m.id === 'jefe' ? t.provider : undefined, model: t.model || undefined, effort: t.effort })
  applying.value = ''
  if (ok) forget(m)
}
const shownStaff = computed(() => staff.value.filter((m) => (showGone.value || !m.gone) && (!area.value || m.role === area.value) && (!state.value || (m.gone ? T`Despedido` : m.look.label) === state.value)))

const subtitle = computed(() => {
  const n = rows.value.length
  if (!n) return T`${staff.value.length} en la plantilla`
  return n === 1 ? T`Propuesta de ${studio.nameOf('jefe')} · ${n} puesto por aprobar` : T`Propuesta de ${studio.nameOf('jefe')} · ${n} puestos por aprobar`
})
</script>

<template>
  <PanelFrame :title="T`Plantilla`" :subtitle="subtitle">
    <template v-if="rows.length">
      <table class="tbl proposal">
        <thead>
          <tr><th>{{ T`Nombre` }}</th><th>{{ T`Puesto` }}</th><th>{{ T`Proveedor` }}</th><th>{{ T`Modelo` }}</th><th>{{ T`Esf.` }}</th><th>{{ T`Motivo del jefe` }}</th><th>{{ T`Regla del expediente` }}</th><th /></tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="r.id ?? i" :class="rule(checks[i], r).kind">
            <td><label class="name"><input v-model="r.name" :placeholder="T`se asigna solo`" /><Pencil /></label></td>
            <td>
              <select v-model="r.role" class="plain"><option v-for="d in DEPARTMENTS" :key="d" :value="d">{{ roleLabel(d) }}</option></select>
            </td>
            <td>
              <span class="pv"><i :style="{ background: `var(--pv-${r.provider})` }" />
                <select v-model="r.provider" class="plain" @change="providerChanged(r)">
                  <option v-for="c in studio.usable" :key="c.id" :value="c.id">{{ c.name }}</option>
                  <option v-if="!studio.usable.some((c) => c.id === r.provider)" :value="r.provider">{{ cliName(r.provider) }}</option>
                </select>
              </span>
              <select v-if="accountsOf(r.provider).length > 1" v-model="r.account" class="plain account" :title="T`Con qué cuenta trabaja`">
                <option v-for="a in accountsOf(r.provider)" :key="a.dir" :value="a.main ? '' : a.dir">{{ a.usage?.windows[0] ? T`cuenta ${a.label.toLowerCase()} · ${Math.round(a.usage.windows[0].used)}%` : T`cuenta ${a.label.toLowerCase()}` }}</option>
              </select>
            </td>
            <td>
              <!-- Una lista de verdad: se ve entera al abrirla. Si la CLI no dice sus modelos, o se elige «Escribir otro…», se escribe. -->
              <select v-if="modelsOf(r.provider).length && !r.custom" class="plain" :value="r.model ?? ''" @change="pickModel(r, ($event.target as HTMLSelectElement).value)">
                <option value="">{{ T`por defecto` }}</option>
                <option v-for="m in modelsOf(r.provider)" :key="m" :value="m">{{ m }}</option>
                <option v-if="r.model && !modelsOf(r.provider).includes(r.model)" :value="r.model">{{ r.model }}</option>
                <option :value="OTHER">{{ T`Escribir otro…` }}</option>
              </select>
              <span v-else class="typed">
                <input v-model="r.model" class="plain" :placeholder="T`por defecto`" />
                <button v-if="modelsOf(r.provider).length" class="trash" :title="T`Volver a la lista`" @click="r.custom = false; r.model = ''"><X /></button>
              </span>
            </td>
            <td>
              <select v-model="r.effort" class="plain" :disabled="!cliOf(r.provider)?.efforts?.length" :title="cliOf(r.provider)?.efforts?.length ? '' : T`Esta CLI no recibe esfuerzo`">
                <option :value="undefined">—</option>
                <option v-for="f in cliOf(r.provider)?.efforts ?? []" :key="f" :value="f">{{ EFFORT_LABEL[f].toLowerCase() }}</option>
                <option v-if="r.effort && !cliOf(r.provider)?.efforts?.includes(r.effort)" :value="r.effort">{{ T`${EFFORT_LABEL[r.effort].toLowerCase()} (no lo recibe)` }}</option>
              </select>
            </td>
            <td class="dim why">{{ r.reason || '—' }}</td>
            <td class="rule">
              <span class="chip">{{ rule(checks[i], r).chip }}</span>
              <p>{{ rule(checks[i], r).text }}</p>
            </td>
            <td><button class="trash" :title="T`Quitar puesto`" @click="rows.splice(i, 1)"><Trash2 /></button></td>
          </tr>
        </tbody>
      </table>
      <div class="actions">
        <button class="btn" @click="add"><Plus /> {{ T`Añadir puesto` }}</button>
        <span class="grow" />
        <span v-if="forbidden" class="stop"><Ban /> {{ forbidden === 1 ? T`${forbidden} fila prohibida: cambia su proveedor o quítala para poder aprobar.` : T`${forbidden} filas prohibidas: cambia su proveedor o quítala para poder aprobar.` }}</span>
        <span v-if="studio.error" class="stop">{{ studio.error }}</span>
        <button class="btn primary" :disabled="busy || !!forbidden" @click="approve"><CheckIcon /> {{ busy ? T`Aprobando…` : T`Aprobar ${rows.length}` }}</button>
      </div>
    </template>

    <div v-else-if="!staff.length" class="blank">
      <Users />
      <h2>{{ T`Aún no hay plantilla` }}</h2>
      <p v-if="studio.bossOnline">{{ T`El jefe todavía no propone puestos. Pídeselo y aparecerán aquí para que los apruebes.` }}</p>
      <p v-else>{{ T`Primero contrata al jefe: él lee el proyecto y propone quién hace falta.` }}</p>
      <button v-if="studio.bossOnline" class="btn primary" @click="askBoss">{{ T`Pedir propuesta al Jefe` }}</button>
      <button v-else class="btn primary" @click="studio.overlay = 'boss'">{{ T`Contratar jefe` }}</button>
    </div>

    <p v-if="studio.error && !rows.length" class="stop">{{ studio.error }}</p>
    <template v-if="staff.length">
      <div class="filters">
        <span class="cap">{{ shownStaff.length !== staff.length ? T`Ya contratados · ${shownStaff.length} de ${staff.length}` : T`Ya contratados · ${shownStaff.length}` }}</span>
        <i class="gap" />
        <span class="cap">{{ T`Área` }}</span>
        <button :class="{ on: !area }" @click="area = ''">{{ T`Todas` }}</button>
        <button v-for="a in areas" :key="a" :class="{ on: area === a }" @click="area = area === a ? '' : a">{{ roleLabel(a) }}</button>
        <i class="gap" />
        <span class="cap">{{ T`Estado` }}</span>
        <button :class="{ on: !state }" @click="state = ''">{{ T`Todos` }}</button>
        <button v-for="st in states" :key="st" :class="{ on: state === st }" @click="state = state === st ? '' : st">{{ st }}</button>
        <template v-if="goneCount">
          <i class="gap" />
          <button :class="{ on: showGone }" @click="showGone = !showGone; if (!showGone && state === T`Despedido`) state = ''">{{ showGone ? T`Ocultar despedidos · ${goneCount}` : T`Mostrar despedidos · ${goneCount}` }}</button>
        </template>
      </div>
      <table class="tbl">
        <thead>
          <tr><th>{{ T`Nombre` }}</th><th>{{ T`Puesto` }}</th><th>{{ T`Proveedor` }}</th><th>{{ T`Modelo` }}</th><th>{{ T`Esf.` }}</th><th>{{ T`Estado` }}</th><th>{{ T`Contexto` }}</th><th /></tr>
        </thead>
        <tbody>
          <!-- El jefe: se le cambia hasta el proveedor; aplicar lo releva (deja su traspaso y entra otro con lo nuevo). -->
          <tr v-if="bossRow && !area && !state" class="boss pick" @click="studio.select('jefe')">
            <td class="strong">{{ bossRow.name }}</td>
            <td>{{ T`jefe` }}</td>
            <td @click.stop>
              <span class="pv"><i :style="{ background: `var(--pv-${tuneOf(bossRow).provider})` }" />
                <select class="plain" :value="tuneOf(bossRow).provider" @change="tuneProvider(bossRow, ($event.target as HTMLSelectElement).value as ProviderId)">
                  <option v-for="c in studio.usable" :key="c.id" :value="c.id">{{ c.name }}</option>
                  <option v-if="!studio.usable.some((c) => c.id === tuneOf(bossRow!).provider)" :value="tuneOf(bossRow).provider">{{ cliName(tuneOf(bossRow).provider) }}</option>
                </select>
              </span>
            </td>
            <td @click.stop>
              <select v-if="modelsOf(tuneOf(bossRow).provider).length && !tuneOf(bossRow).custom" class="plain" :value="tuneOf(bossRow).model" @change="tuneModel(bossRow, ($event.target as HTMLSelectElement).value)">
                <option value="">{{ T`por defecto` }}</option>
                <option v-for="x in modelsOf(tuneOf(bossRow).provider)" :key="x" :value="x">{{ x }}</option>
                <option v-if="tuneOf(bossRow).model && !modelsOf(tuneOf(bossRow).provider).includes(tuneOf(bossRow).model)" :value="tuneOf(bossRow).model">{{ tuneOf(bossRow).model }}</option>
                <option :value="OTHER">{{ T`Escribir otro…` }}</option>
              </select>
              <input v-else class="plain" :value="tuneOf(bossRow).model" :placeholder="T`por defecto`" @input="edit(bossRow, { model: ($event.target as HTMLInputElement).value })" />
            </td>
            <td @click.stop>
              <select class="plain" :value="tuneOf(bossRow).effort ?? ''" :disabled="!cliOf(tuneOf(bossRow).provider)?.efforts?.length" @change="edit(bossRow, { effort: (($event.target as HTMLSelectElement).value || undefined) as Effort | undefined })">
                <option value="">—</option>
                <option v-for="f in cliOf(tuneOf(bossRow).provider)?.efforts ?? []" :key="f" :value="f">{{ EFFORT_LABEL[f].toLowerCase() }}</option>
              </select>
            </td>
            <td><span class="chip" :style="{ color: `var(--st-${bossRow.look.color})` }">■ {{ bossRow.look.label }}</span></td>
            <td>
              <span v-if="bossRow.known" class="meter" :class="{ hot: bossRow.context >= (studio.board?.burnoutAt ?? 80) }"><i><b :style="{ width: `${bossRow.context}%` }" /></i>{{ bossRow.context }}%</span>
              <span v-else class="dim">{{ T`sin dato` }}</span>
            </td>
            <td class="acts" @click.stop>
              <template v-if="tuned(bossRow)">
                <button class="btn primary" :disabled="applying === 'jefe'" :title="T`El jefe deja su traspaso y entra el relevo con lo nuevo`" @click="applyTune(bossRow)">{{ T`Relevar` }}</button>
                <button class="btn" @click="forget(bossRow)">{{ T`Cancelar` }}</button>
              </template>
              <button v-else class="btn danger" :title="T`Deja su traspaso y se va; luego contratas a otro jefe`" @click="studio.fire('jefe')">{{ T`Despedir` }}</button>
            </td>
          </tr>
          <tr v-for="m in shownStaff" :key="m.id" :class="{ pick: !m.out, out: m.out }" @click="!m.out && studio.select(m.id)">
            <td class="strong">{{ m.name }}</td>
            <td>{{ roleLabel(m.role) }}</td>
            <td><span class="pv"><i :style="{ background: `var(--pv-${m.provider})` }" />{{ cliName(m.provider) }}</span></td>
            <!-- Modelo y esfuerzo se cambian aquí; el proveedor de un empleado no. -->
            <td v-if="m.gone" class="dim">{{ m.model ?? '—' }}</td>
            <td v-else @click.stop>
              <select v-if="modelsOf(m.provider).length && !tuneOf(m).custom" class="plain" :value="tuneOf(m).model" @change="tuneModel(m, ($event.target as HTMLSelectElement).value)">
                <option value="">{{ T`por defecto` }}</option>
                <option v-for="x in modelsOf(m.provider)" :key="x" :value="x">{{ x }}</option>
                <option v-if="tuneOf(m).model && !modelsOf(m.provider).includes(tuneOf(m).model)" :value="tuneOf(m).model">{{ tuneOf(m).model }}</option>
                <option :value="OTHER">{{ T`Escribir otro…` }}</option>
              </select>
              <input v-else class="plain" :value="tuneOf(m).model" :placeholder="T`por defecto`" @input="edit(m, { model: ($event.target as HTMLInputElement).value })" />
            </td>
            <td v-if="m.gone">{{ m.effort ? EFFORT_LABEL[m.effort].toLowerCase() : '—' }}</td>
            <td v-else @click.stop>
              <select class="plain" :value="tuneOf(m).effort ?? ''" :disabled="!cliOf(m.provider)?.efforts?.length" @change="edit(m, { effort: (($event.target as HTMLSelectElement).value || undefined) as Effort | undefined })">
                <option value="">—</option>
                <option v-for="f in cliOf(m.provider)?.efforts ?? []" :key="f" :value="f">{{ EFFORT_LABEL[f].toLowerCase() }}</option>
              </select>
            </td>
            <td>
              <span class="chip" :style="{ color: `var(--st-${m.look.color})` }">■ {{ m.gone ? T`Despedido` : m.look.label }}</span>
              <button v-if="m.out && !m.gone" class="btn back" :title="T`Su CLI se cerró: vuelve a abrirla en su misma oficina`" @click.stop="studio.bringBack(m.id)">{{ T`Traer de vuelta` }}</button>
            </td>
            <td>
              <span v-if="m.known" class="meter" :class="{ hot: m.context >= (studio.board?.burnoutAt ?? 80) }" :title="m.gone ? T`Contexto usado cuando se fue` : T`Contexto usado`"><i><b :style="{ width: `${m.context}%` }" /></i>{{ m.context }}%<template v-if="m.gone"> {{ T`al irse` }}</template></span>
              <span v-else class="dim">{{ m.gone ? T`sin dato al irse` : T`sin dato` }}</span>
            </td>
            <td class="acts" @click.stop>
              <template v-if="!m.gone && tuned(m)">
                <button class="btn primary" :disabled="applying === m.id" :title="T`Deja su traspaso y vuelve a entrar con lo nuevo`" @click="applyTune(m)">{{ T`Aplicar` }}</button>
                <button class="btn" @click="forget(m)">{{ T`Cancelar` }}</button>
              </template>
            </td>
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
.typed { display: inline-flex; align-items: center; gap: 4px; }
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
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.filters .gap { width: 12px; }
.filters button { padding: 4px 9px; font: 11px var(--font); color: var(--text-secondary); background: var(--bg); border: 2px solid var(--border); }
.filters button.on { border-color: var(--accent); color: var(--text-primary); background: var(--surface-2); }
.out td { color: var(--text-secondary); }
.back { margin-left: 8px; padding: 3px 8px; font-size: 11px; }
.pick { cursor: pointer; }
.boss td { background: var(--surface); }
.boss td:first-child { box-shadow: inset 3px 0 var(--accent); }
.acts { white-space: nowrap; text-align: right; }
.acts .btn { padding: 4px 10px; margin-left: 6px; }
.pick:hover td { background: var(--surface); }
.tbl .chip { text-transform: none; }
.proposal .chip { text-transform: uppercase; }
.account { display: block; margin-top: 2px; font-size: 10px; color: var(--text-secondary); }
</style>

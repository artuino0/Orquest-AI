<script setup lang="ts">
/**
 * Tareas: encargos que el usuario da directo a un agente, sin el jefe. Aquí
 * se crean y se ve en qué anda cada una; su chat y sus cambios van en su
 * propio panel (ErrandPanel). La lógica vive en el núcleo (core/errands.ts y
 * Studio): este panel solo pide y muestra.
 */
import { computed, ref, watch } from 'vue'
import { GitBranch, GitMerge, ListChecks, Play, Plus, ShieldAlert, Trash2, X } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import type { Account } from '../../../core/accounts'
import type { Effort, Errand, ErrandKind, ProviderId } from '../../../shared/ipc'
import { useCanvas } from '../stores/canvas'
import { useStudio } from '../stores/studio'
import { EFFORT_LABEL } from '../status'
import { KIND_LOOK, STATUS_LOOK, isOpenErrand } from '../errands'
import PanelFrame from './PanelFrame.vue'

const studio = useStudio()
const canvas = useCanvas()

const errands = computed<Errand[]>(() => studio.board?.errands ?? [])
const open = computed(() => errands.value.filter(isOpenErrand).sort((a, b) => b.createdAt - a.createdAt))
const closed = computed(() => errands.value.filter((e) => !isOpenErrand(e)).sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)).slice(0, 12))
const ready = computed(() => open.value.filter((e) => e.status === 'ready').length)
const cliName = (id: ProviderId) => studio.clis.find((c) => c.id === id)?.name ?? id
const when = (at?: number) => (at ? new Date(at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '')
const lastLine = (e: Errand) => [...e.log].reverse().find((l) => l.by !== 'user')?.text ?? ''

// ── Nueva tarea ────────────────────────────────────────────────────────────
const creating = ref(false)
const busy = ref(false)
const error = ref('')
const tried = ref(false)
const form = ref({ title: '', brief: '', kind: 'feature' as ErrandKind, provider: '' as ProviderId | '', model: '', effort: '' as Effort | '', account: '', repo: '', base: '' })
const branches = ref<string[]>([])
const accounts = ref<Account[]>([])
const repos = computed(() => studio.board?.repos ?? [])

const cliOf = (id: string) => studio.clis.find((c) => c.id === id)
const modelsOf = (id: string) => cliOf(id)?.models ?? []
const accountsOf = (id: string) => accounts.value.filter((a) => a.provider === id)
const accountLabel = (a: Account) => T`cuenta ${a.label.toLowerCase()}`
const KINDS: { kind: ErrandKind; label: string }[] = [
  { kind: 'feature', label: T`Función` },
  { kind: 'fix', label: T`Corrección` },
  { kind: 'hotfix', label: T`Urgente` },
  { kind: 'chore', label: T`Mantenimiento` },
]

async function startForm() {
  error.value = ''
  tried.value = false
  creating.value = true
  form.value = { title: '', brief: '', kind: 'feature', provider: studio.usable[0]?.id ?? '', model: '', effort: '', account: '', repo: repos.value[0]?.name ?? '', base: '', }
  void window.orquest.accounts().then((a) => (accounts.value = a), () => {})
  await loadBranches()
}

async function loadBranches() {
  branches.value = []
  try {
    const r = await window.orquest.branches(repos.value.length ? form.value.repo : undefined)
    branches.value = r.branches
  } catch (e) {
    error.value = (e as Error).message
  }
}
watch(() => form.value.repo, () => creating.value && loadBranches())
watch(() => form.value.provider, (p) => {
  if (form.value.model && !modelsOf(p).includes(form.value.model)) form.value.model = ''
  if (form.value.effort && !cliOf(p)?.efforts?.includes(form.value.effort)) form.value.effort = ''
  form.value.account = ''
})

const missing = computed(() => ({ title: !form.value.title.trim(), brief: !form.value.brief.trim(), base: !form.value.base, provider: !form.value.provider }))

async function create() {
  tried.value = true
  error.value = ''
  if (Object.values(missing.value).some(Boolean)) return
  busy.value = true
  try {
    const f = form.value
    const e = await window.orquest.createErrand({
      title: f.title,
      brief: f.brief,
      kind: f.kind,
      provider: f.provider as ProviderId,
      model: f.model || undefined,
      effort: (f.effort || undefined) as Effort | undefined,
      account: f.account || undefined,
      repo: repos.value.length ? f.repo : undefined,
      base: f.base,
    })
    creating.value = false
    canvas.open('errand', e.id)
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PanelFrame :title="T`Tareas`" :subtitle="T`encargos fuera del jefe`">
    <!-- Formulario de una tarea nueva -->
    <div v-if="creating" class="form">
      <label class="field">
        <span class="cap">{{ T`Título · de aquí sale el nombre de la rama` }}</span>
        <input v-model="form.title" :class="{ bad: tried && missing.title }" :placeholder="T`Exportar pedidos a CSV`" />
      </label>
      <label class="field">
        <span class="cap">{{ T`Qué hay que hacer` }}</span>
        <textarea v-model="form.brief" rows="4" :class="{ bad: tried && missing.brief }" :placeholder="T`Que la lista de pedidos se pueda exportar a CSV, con las columnas que se ven en pantalla.`" />
      </label>
      <div class="field">
        <span class="cap">{{ T`Tipo` }}</span>
        <div class="kinds">
          <button v-for="k in KINDS" :key="k.kind" :class="{ on: form.kind === k.kind }" @click="form.kind = k.kind">{{ k.label }}</button>
        </div>
      </div>
      <div class="field">
        <span class="cap">{{ T`Quién la resuelve` }}</span>
        <div class="row">
          <select v-model="form.provider" :class="{ bad: tried && missing.provider }">
            <option v-if="!studio.usable.length" value="">{{ T`No hay CLIs con sesión` }}</option>
            <option v-for="c in studio.usable" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <select v-if="modelsOf(form.provider).length" v-model="form.model">
            <option value="">{{ T`Modelo por defecto` }}</option>
            <option v-for="m in modelsOf(form.provider)" :key="m" :value="m">{{ m }}</option>
          </select>
          <input v-else v-model="form.model" :placeholder="T`Modelo (opcional)`" />
        </div>
        <div class="row">
          <select v-model="form.effort" :disabled="!cliOf(form.provider)?.efforts?.length">
            <option value="">{{ T`Esfuerzo por defecto` }}</option>
            <option v-for="x in cliOf(form.provider)?.efforts ?? []" :key="x" :value="x">{{ T`Esfuerzo ${EFFORT_LABEL[x].toLowerCase()}` }}</option>
          </select>
          <select v-if="accountsOf(form.provider).length > 1" v-model="form.account">
            <option v-for="a in accountsOf(form.provider)" :key="a.dir" :value="a.main ? '' : a.dir">{{ accountLabel(a) }}</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="cap">{{ T`Dónde` }}</span>
        <div class="row">
          <select v-if="repos.length" v-model="form.repo">
            <option v-for="r in repos" :key="r.name" :value="r.name">{{ r.name }}</option>
          </select>
          <select v-model="form.base" :class="{ bad: tried && missing.base }">
            <option value="" disabled>{{ T`Rama de origen…` }}</option>
            <option v-for="b in branches" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>
        <p v-if="tried && missing.base" class="warn">{{ T`Elige de qué rama sale. La tarea crea su rama desde ahí y, al aprobarla, se une de vuelta a esa misma rama.` }}</p>
      </div>
      <div class="note">
        <ShieldAlert />
        <p>{{ T`Trabaja sin pedirte permisos. Lo prohibido sigue bloqueado (git push, reset --hard, cambiar de rama); la lista se edita en Expedientes → Manuales → Tareas.` }}</p>
      </div>
      <p v-if="error" class="warn">{{ error }}</p>
      <div class="actions">
        <span class="grow" />
        <button class="btn" :disabled="busy" @click="creating = false"><X /> {{ T`Cancelar` }}</button>
        <button class="btn primary" :disabled="busy" @click="create"><Play /> {{ busy ? T`Creando…` : T`Crear tarea` }}</button>
      </div>
    </div>

    <!-- Lista -->
    <div v-else class="list">
      <div class="bar">
        <button class="btn primary" @click="startForm"><Plus /> {{ T`Nueva tarea` }}</button>
        <span class="grow" />
        <span class="dim">{{ open.length === 1 ? T`${open.length} abierta` : T`${open.length} abiertas` }}<template v-if="ready"> · {{ T`${ready} por aprobar` }}</template></span>
      </div>

      <p v-if="!errands.length" class="empty">
        <ListChecks />
        {{ T`Una tarea es un encargo corto que no pasa por el jefe: eliges quién la resuelve y de qué rama sale, la ves avanzar en su chat y la apruebas para unirla.` }}
      </p>

      <button v-for="e in open" :key="e.id" class="card" :class="{ ready: e.status === 'ready', stopped: e.status === 'stopped' }" @click="canvas.open('errand', e.id)">
        <span class="head">
          <span class="kind" :style="{ color: `var(--${KIND_LOOK[e.kind].color})`, borderColor: `var(--${KIND_LOOK[e.kind].color})` }">{{ KIND_LOOK[e.kind].tag }}</span>
          <b>{{ e.title }}</b>
        </span>
        <span class="meta"><GitBranch /> {{ e.branch }} → {{ e.base }} · {{ cliName(e.provider) }}</span>
        <span class="state">
          <span class="badge" :style="{ color: `var(--${STATUS_LOOK[e.status].color})`, borderColor: `var(--${STATUS_LOOK[e.status].color})` }"><i :style="{ background: `var(--${STATUS_LOOK[e.status].color})` }" />{{ STATUS_LOOK[e.status].label }}</span>
          <span class="last">{{ e.status === 'stopped' ? '' : lastLine(e) }}</span>
        </span>
        <span v-if="e.status === 'stopped' && e.stopReason" class="reason">{{ e.stopReason }}</span>
      </button>

      <template v-if="closed.length">
        <span class="cap">{{ T`Cerradas` }}</span>
        <button v-for="e in closed" :key="e.id" class="closed" @click="canvas.open('errand', e.id)">
          <GitMerge v-if="e.status === 'merged'" class="ok" /><Trash2 v-else />
          <span class="grow">{{ e.title }}</span>
          <span class="dim">{{ e.status === 'merged' ? T`integrada a ${e.base}` : T`descartada` }} · {{ when(e.closedAt) }}</span>
        </button>
      </template>
    </div>
  </PanelFrame>
</template>

<style scoped>
.list, .form { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow: auto; height: 100%; }
.bar, .actions, .row { display: flex; align-items: center; gap: 8px; }
.grow { flex: 1; min-width: 0; }
.dim { font-size: 10px; color: var(--text-secondary); }
.cap { font: 700 10px var(--font); letter-spacing: 1px; text-transform: uppercase; color: var(--text-secondary); margin-top: 6px; }
.empty { display: flex; gap: 10px; align-items: flex-start; font-size: 12px; line-height: 1.6; color: var(--text-secondary); margin: 8px 0; }
.empty svg { width: 16px; height: 16px; flex: none; color: var(--accent); margin-top: 2px; }
.card { display: flex; flex-direction: column; gap: 6px; text-align: left; background: var(--bg); border: 2px solid var(--border); padding: 10px; color: var(--text-primary); font: 12px var(--font); cursor: pointer; }
.card:hover { border-color: var(--border-light); }
.card.ready { border-color: var(--st-review); }
.head { display: flex; gap: 8px; align-items: flex-start; }
.head b { font-size: 12px; line-height: 16px; }
.kind { flex: none; border: 2px solid; padding: 1px 6px; font: 700 10px var(--font); }
.meta { display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--text-secondary); line-height: 16px; }
.meta svg { width: 12px; height: 12px; flex: none; }
.state { display: flex; align-items: center; gap: 8px; min-width: 0; }
.badge { display: inline-flex; align-items: center; gap: 6px; border: 2px solid; padding: 2px 8px; background: var(--bg); font: 700 11px var(--font); white-space: nowrap; }
.badge i { width: 8px; height: 8px; }
.last { font-size: 10px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.reason { font-size: 10px; line-height: 16px; color: var(--st-block); }
.closed { display: flex; align-items: center; gap: 8px; padding: 4px 2px; background: none; border: 0; color: var(--text-primary); font: 11px var(--font); cursor: pointer; text-align: left; }
.closed svg { width: 12px; height: 12px; flex: none; color: var(--text-secondary); }
.closed svg.ok { color: var(--st-idle); }
.field { display: flex; flex-direction: column; gap: 6px; }
.field .row { flex-wrap: wrap; }
.field .row > * { flex: 1; min-width: 140px; }
input, textarea, select { font: 12px var(--font); color: var(--text-primary); background: var(--bg); border: 2px solid var(--border-light); padding: 8px 10px; outline: none; resize: vertical; }
input:focus, textarea:focus, select:focus { border-color: var(--accent); }
.bad { border-color: var(--st-block); }
.kinds { display: flex; flex-wrap: wrap; }
.kinds button { border: 2px solid var(--border); background: var(--surface-2); color: var(--text-secondary); padding: 6px 12px; font: 700 12px var(--font); cursor: pointer; }
.kinds button.on { background: var(--accent); color: var(--on-accent); }
.warn { margin: 0; font-size: 10px; line-height: 16px; color: var(--st-block); }
.note { display: flex; gap: 10px; align-items: flex-start; background: var(--tint-warn); border: 2px solid var(--st-review); padding: 10px 12px; }
.note svg { width: 14px; height: 14px; flex: none; color: var(--st-review); margin-top: 1px; }
.note p { margin: 0; font-size: 10px; line-height: 16px; }
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Ban, Bell, Check, FileText, Save } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import type { DossierView, Manual, Role } from '../../../shared/ipc'
import PanelFrame from './PanelFrame.vue'

/**
 * Expedientes (por proveedor y modelo) y manuales de puesto. Viven en el
 * estudio y se reusan entre proyectos; el jefe los lee al proponer.
 */
const ROLES: Role[] = ['desarrollo', 'backend', 'frontend', 'dba', 'infra', 'qa']
const ROLE_NAME: Record<Role, [string, string]> = {
  desarrollo: ['Desarrollo', 'generalista'],
  backend: ['Backend', 'API y servicios'],
  frontend: ['Frontend', 'interfaz y capturas'],
  dba: ['DBA', 'esquema y migraciones'],
  infra: ['Infra', 'CI y despliegue'],
  qa: ['QA', 'veredictos'],
}
type Row = DossierView & { allRoles: boolean }

const studio = useStudio()
const tab = ref<'expedientes' | 'manuales'>('expedientes')
const dossiers = ref<Row[]>([])
const manuals = ref<Manual[]>([])
const picked = ref('') // proveedor::modelo
const role = ref<Role>('backend')
const saved = ref<string | null>(null)
const newModel = ref('')

const name = (p: string) => studio.clis.find((c) => c.id === p)?.name ?? p
const available = (p: string) => studio.usable.some((c) => c.id === p)
const key = (d: Pick<Row, 'provider' | 'model'>) => `${d.provider}::${d.model}`

async function load() {
  const lib = await window.orquest.library()
  dossiers.value = lib.dossiers
    .map((d) => ({ ...d, allowedRoles: d.allowedRoles ?? [...ROLES], allRoles: d.allowedRoles === null }))
    .sort((a, b) => Number(available(b.provider)) - Number(available(a.provider)) || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model))
  manuals.value = lib.manuals
  if (!dossiers.value.some((d) => key(d) === picked.value)) picked.value = dossiers.value[0] ? key(dossiers.value[0]) : ''
  if (!manuals.value.some((m) => m.role === role.value) && manuals.value[0]) role.value = manuals.value[0].role
}
onMounted(load)

function flash(k: string) {
  saved.value = k
  setTimeout(() => saved.value === k && (saved.value = null), 1500)
}

// ── Expedientes ───────────────────────────────────────────────────────────
const dossier = computed(() => dossiers.value.find((d) => key(d) === picked.value))
const models = computed(() => dossiers.value.filter((d) => d.provider === dossier.value?.provider && d.model).map((d) => d.model))
const summary = (d: Row) => {
  const blocked = ROLES.length - (d.allRoles ? ROLES.length : (d.allowedRoles ?? []).length)
  if (d.model && blocked) return `${blocked} ${blocked === 1 ? 'puesto bloqueado' : 'puestos bloqueados'}`
  return d.stats.aprobadas_a_la_primera === null ? 'sin historial' : `${d.stats.aprobadas_a_la_primera} % a la primera`
}
function toggleRole(d: Row, r: Role) {
  const list = new Set(d.allowedRoles ?? [])
  if (list.has(r)) list.delete(r)
  else list.add(r)
  d.allowedRoles = ROLES.filter((x) => list.has(x))
  d.allRoles = d.allowedRoles.length === ROLES.length
}
const byRole = computed(() =>
  Object.entries(dossier.value?.stats.por_puesto ?? {})
    .map(([r, s]) => ({ role: ROLE_NAME[r as Role]?.[0] ?? r, ...s, pct: s.integradas ? Math.round((s.a_la_primera / s.integradas) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct),
)

async function saveDossier() {
  const d = dossier.value
  if (!d) return
  const all = d.allRoles || (d.allowedRoles ?? []).length === ROLES.length
  if (await studio.attempt(() => window.orquest.saveDossier({ provider: d.provider, model: d.model, allowedRoles: all ? null : d.allowedRoles, enforce: d.enforce, notes: d.notes }))) {
    flash('expediente')
    await load()
  }
}

function addModel() {
  const base = dossiers.value.find((d) => d.provider === dossier.value?.provider && !d.model)
  const model = newModel.value.trim()
  if (!base || !model || dossiers.value.some((d) => d.provider === base.provider && d.model === model)) return
  const row: Row = { ...base, model, notes: '', stats: { entregas: 0, integradas: 0, a_la_primera: 0, rechazos_qa: 0, regresadas: 0, aprobadas_a_la_primera: null, por_puesto: {} } }
  const at = dossiers.value.map((d) => d.provider).lastIndexOf(base.provider)
  dossiers.value.splice(at + 1, 0, row)
  picked.value = key(row)
  newModel.value = ''
}

// ── Manuales ──────────────────────────────────────────────────────────────
const manual = computed(() => manuals.value.find((m) => m.role === role.value))
const lines = (v: string[]) => v.join('\n')
const split = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean)
const users = computed(() => {
  const who = (studio.board?.staff ?? []).filter((m) => m.role.toLowerCase() === role.value).map((m) => m.name)
  if (!who.length) return 'nadie lo usa todavía'
  return `lo ${who.length === 1 ? 'usa' : 'usan'} ${who.length === 1 ? who[0] : `${who.slice(0, -1).join(', ')} y ${who.at(-1)}`}`
})

async function saveManual() {
  if (manual.value && (await studio.attempt(() => window.orquest.saveManual(JSON.parse(JSON.stringify(manual.value)))))) flash('manual')
}
</script>

<template>
  <PanelFrame title="Expedientes y manuales" :subtitle="tab === 'expedientes' ? 'Reglas por proveedor y modelo · alimentan la Plantilla' : 'Qué recibe cada empleado al ocupar su puesto'">
    <nav class="tabs">
      <button :class="{ on: tab === 'expedientes' }" @click="tab = 'expedientes'">Expedientes</button>
      <button :class="{ on: tab === 'manuales' }" @click="tab = 'manuales'">Manuales de puesto</button>
    </nav>
    <p v-if="studio.error" class="err">{{ studio.error }}</p>

    <!-- Expedientes -->
    <div v-if="tab === 'expedientes'" class="split">
      <ul class="list">
        <li v-for="d in dossiers" :key="key(d)" :class="{ on: key(d) === picked, sub: d.model, off: !available(d.provider) }" @click="picked = key(d)">
          <i v-if="!d.model" class="sq" :style="{ background: `var(--pv-${d.provider})` }" />
          <div><b>{{ d.model || name(d.provider) }}</b><small>{{ summary(d) }}</small></div>
        </li>
      </ul>

      <section v-if="dossier" class="detail">
        <header>
          <i class="sq big" :style="{ background: `var(--pv-${dossier.provider})` }" />
          <h2 class="title-pixel">{{ name(dossier.provider) }}</h2>
          <span class="dim grow">{{ dossier.model || 'todos los modelos' }}<template v-if="!dossier.model && models.length"> · {{ models.join(', ') }} {{ models.length === 1 ? 'hereda' : 'heredan' }} estas reglas</template></span>
          <form v-if="!dossier.model" class="add" @submit.prevent="addModel"><input v-model="newModel" placeholder="+ regla para un modelo" /></form>
          <button class="btn primary" @click="saveDossier"><Check v-if="saved === 'expediente'" /><Save v-else /> {{ saved === 'expediente' ? 'Guardado' : 'Guardar' }}</button>
        </header>

        <div class="rules">
          <div>
            <span class="cap">Puestos permitidos</span>
            <div class="checks">
              <label v-for="r in ROLES" :key="r" class="check"><input type="checkbox" :checked="(dossier.allowedRoles ?? []).includes(r)" @change="toggleRole(dossier, r)" /><i><Check /></i>{{ ROLE_NAME[r][0] }}</label>
            </div>
          </div>
          <div>
            <span class="cap">Si no se permite</span>
            <div class="segments">
              <button :class="{ on: dossier.enforce === 'block', danger: true }" @click="dossier.enforce = 'block'"><Ban /> Bloquear</button>
              <button :class="{ on: dossier.enforce === 'warn' }" @click="dossier.enforce = 'warn'"><Bell /> Avisar</button>
            </div>
          </div>
        </div>

        <label class="field"><span class="cap">Notas</span><textarea v-model="dossier.notes" rows="2" placeholder="Lo que has visto de este proveedor: el jefe lo lee al proponer" /></label>

        <div class="cards">
          <div class="card">
            <h3 class="title-pixel you">Contigo</h3>
            <div class="figures">
              <div><b class="you">{{ dossier.stats.aprobadas_a_la_primera ?? '—' }}<template v-if="dossier.stats.aprobadas_a_la_primera !== null"> %</template></b><small>integradas a la primera</small></div>
              <div><b class="good">{{ dossier.stats.integradas }}</b><small>integradas</small></div>
              <div><b class="bad">{{ dossier.stats.rechazos_qa }}</b><small>rechazos de QA</small></div>
            </div>
            <span class="cap">Por puesto <small>· integradas a la primera</small></span>
            <p v-if="!byRole.length" class="dim">Sin historial contigo todavía.</p>
            <div v-for="r in byRole" :key="r.role" class="bar">
              <span>{{ r.role }}</span>
              <i><b :style="{ width: `${r.pct}%`, background: r.pct >= 70 ? 'var(--st-idle)' : 'var(--accent)' }" /></i>
              <small :class="{ bad: !r.a_la_primera }">{{ r.a_la_primera }} de {{ r.integradas }}</small>
            </div>
          </div>
          <div class="card">
            <h3 class="title-pixel market">En el mercado</h3>
            <p class="dim">Todavía no hay reporte de mercado. Cuando exista el reporte semanal, aquí saldrán sus posiciones y la opinión pública de este proveedor.</p>
          </div>
        </div>
      </section>
    </div>

    <!-- Manuales de puesto -->
    <div v-else class="split">
      <ul class="list">
        <li v-for="m in manuals" :key="m.role" :class="{ on: m.role === role }" @click="role = m.role">
          <div><b>{{ ROLE_NAME[m.role]?.[0] ?? m.role }}</b><small>{{ ROLE_NAME[m.role]?.[1] }}</small></div>
        </li>
      </ul>

      <section v-if="manual" class="detail">
        <header>
          <h2 class="title-pixel grow">Manual · {{ ROLE_NAME[manual.role]?.[0] ?? manual.role }}</h2>
          <span class="dim">{{ users }}</span>
          <button class="btn primary" @click="saveManual"><Check v-if="saved === 'manual'" /><Save v-else /> {{ saved === 'manual' ? 'Guardado' : 'Guardar' }}</button>
        </header>

        <div class="two">
          <label class="field"><span class="cap">Prompt del puesto</span><textarea v-model="manual.prompt" rows="5" /></label>
          <div class="side">
            <label class="field"><span class="cap"><FileText /> Documentación <small>· una ruta por línea</small></span>
              <textarea :value="lines(manual.docs)" rows="2" placeholder="docs/convenciones.md" @change="manual.docs = split(($event.target as HTMLTextAreaElement).value)" />
            </label>
            <label class="field"><span class="cap">Skills <small>· una por línea</small></span>
              <textarea class="skills" :value="lines(manual.skills)" rows="2" @change="manual.skills = split(($event.target as HTMLTextAreaElement).value)" />
            </label>
          </div>
        </div>

        <span class="cap">Permisos</span>
        <div class="perms">
          <div class="perm edit">
            <span class="cap">Puede editar</span>
            <label class="check"><input v-model="manual.permissions.edit" type="checkbox" /><i><Check /></i>Archivos de su oficina, sin pedir permiso</label>
          </div>
          <label class="perm allow">
            <span class="cap">Comandos permitidos</span>
            <textarea :value="lines(manual.permissions.allow)" rows="4" placeholder="npm test" @change="manual.permissions.allow = split(($event.target as HTMLTextAreaElement).value)" />
          </label>
          <label class="perm deny">
            <span class="cap">Comandos prohibidos</span>
            <textarea :value="lines(manual.permissions.deny)" rows="4" placeholder="git push" @change="manual.permissions.deny = split(($event.target as HTMLTextAreaElement).value)" />
          </label>
        </div>

        <div class="two">
          <label class="field"><span class="cap">Formato de entrega</span><textarea v-model="manual.delivery" rows="5" /></label>
          <div class="side">
            <span class="cap">Capturas obligatorias</span>
            <label class="check"><input v-model="manual.requireScreenshots" type="checkbox" /><i><Check /></i>Exigir capturas para entregar</label>
          </div>
        </div>
      </section>
    </div>
  </PanelFrame>
</template>

<style scoped>
.tabs { display: flex; gap: 4px; border-bottom: 3px solid var(--border); margin-bottom: -2px; }
.tabs button { border: 2px solid var(--border); border-bottom: 0; background: var(--surface-2); color: var(--text-secondary); padding: 8px 14px; font: 700 12px var(--font); }
.tabs button.on { background: var(--accent); color: var(--on-accent); }
.err { margin: 0; font-size: 12px; color: var(--st-block); }
.split { flex: 1; min-height: 0; display: grid; grid-template-columns: 232px 1fr; gap: 16px; }
.list { margin: 0; padding: 0; list-style: none; overflow: auto; background: var(--bg); border: 2px solid var(--border); }
.list li { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-bottom: 2px solid var(--surface); border-left: 4px solid transparent; cursor: pointer; }
.list li.sub { padding-left: 26px; }
.list li.sub b { font-weight: 400; }
.list li.on { background: var(--surface-2); border-left-color: var(--accent); }
.list li.on b { color: var(--accent); }
.list li.off { opacity: 0.55; }
.list b { display: block; font-size: 12px; }
.list small { display: block; margin-top: 2px; font-size: 10px; color: var(--text-secondary); }
.sq { width: 10px; height: 10px; flex: none; outline: 1px solid var(--ink); }
.sq.big { width: 16px; height: 16px; }
.detail { min-width: 0; overflow: auto; display: flex; flex-direction: column; gap: 14px; padding-right: 2px; }
.detail header { display: flex; align-items: center; gap: 10px; }
.grow { flex: 1; min-width: 0; }
.dim { font-size: 11px; color: var(--text-secondary); margin: 0; line-height: 1.6; }
.add input { width: 190px; font: 11px var(--font); color: var(--text-primary); background: var(--bg); border: 2px solid var(--border); padding: 7px 10px; outline: none; }
.rules { display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.checks { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 8px; }
.check { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; }
.check input { position: absolute; opacity: 0; pointer-events: none; }
.check i { width: 16px; height: 16px; display: grid; place-items: center; background: var(--bg); border: 2px solid var(--border-light); }
.check i svg { width: 12px; height: 12px; opacity: 0; color: var(--on-accent); stroke-width: 3; }
.check input:checked + i { background: var(--accent); border-color: var(--border); }
.check input:checked + i svg { opacity: 1; }
.segments { display: flex; margin-top: 8px; border: 2px solid var(--border); background: var(--bg); }
.segments button { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 8px 14px; font: 700 12px var(--font); color: var(--text-secondary); }
.segments svg { width: 13px; height: 13px; }
.segments button.on { background: var(--accent); color: var(--on-accent); }
.segments button.on.danger { background: var(--st-block); color: var(--on-danger); }
.field { display: flex; flex-direction: column; gap: 6px; }
.cap { display: inline-flex; align-items: center; gap: 6px; }
.cap svg { width: 12px; height: 12px; }
.cap small { font-size: 10px; letter-spacing: 0.5px; text-transform: none; }
textarea { width: 100%; font: 12px/1.6 var(--font); color: var(--text-primary); background: var(--bg); border: 2px solid var(--border); padding: 10px 12px; resize: vertical; outline: none; }
textarea:focus { border-color: var(--accent); }
.skills { color: var(--st-dep); }
.cards { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; min-height: 200px; }
.card { background: var(--bg); border: 2px solid var(--border); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.card h3 { font-size: 16px; }
.you { color: var(--accent); }
.market { color: var(--st-dep); }
.good { color: var(--st-idle); }
.bad { color: var(--st-block); }
.figures { display: flex; gap: 36px; }
.figures b { display: block; font: 700 24px var(--font-pixel); }
.figures small { font-size: 10px; color: var(--text-secondary); }
.bar { display: grid; grid-template-columns: 96px 1fr 60px; align-items: center; gap: 10px; font-size: 12px; }
.bar i { height: 12px; background: var(--surface); border: 2px solid var(--border); }
.bar i b { display: block; height: 100%; }
.bar small { text-align: right; font-size: 11px; color: var(--text-secondary); }
.bar small.bad { color: var(--st-block); }
.two { display: grid; grid-template-columns: 1fr 360px; gap: 16px; }
.side { display: flex; flex-direction: column; gap: 10px; }
.perms { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.perm { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--bg); border-top: 3px solid; }
.perm textarea { border: 0; padding: 0; background: none; resize: none; }
.perm.edit { border-color: var(--st-work); } .perm.edit .cap { color: var(--st-work); }
.perm.allow { border-color: var(--st-idle); } .perm.allow .cap { color: var(--st-idle); }
.perm.deny { border-color: var(--st-block); } .perm.deny .cap { color: var(--st-block); }
</style>

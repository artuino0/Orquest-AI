<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useStudio } from '../stores/studio'
import type { DossierView, Manual, Role } from '../../../shared/ipc'

/**
 * Expedientes (por proveedor y modelo) y manuales de puesto. Viven en el
 * estudio y se reusan entre proyectos; el jefe los lee al proponer.
 */
const ROLES: Role[] = ['desarrollo', 'backend', 'frontend', 'dba', 'infra', 'qa']
const studio = useStudio()
const tab = ref<'expedientes' | 'manuales'>('expedientes')
const dossiers = ref<(DossierView & { allRoles: boolean })[]>([])
const manuals = ref<Manual[]>([])
const role = ref<Role>('backend')
const saved = ref<string | null>(null)
const newModel = ref<Record<string, string>>({})

const name = (p: string) => studio.clis.find((c) => c.id === p)?.name ?? p
const available = (p: string) => studio.usable.some((c) => c.id === p)

async function load() {
  const lib = await window.orquest.library()
  dossiers.value = lib.dossiers
    .map((d) => ({ ...d, allowedRoles: d.allowedRoles ?? [...ROLES], allRoles: d.allowedRoles === null }))
    .sort((a, b) => Number(available(b.provider)) - Number(available(a.provider)) || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model))
  manuals.value = lib.manuals
}
onMounted(load)

function flash(key: string) {
  saved.value = key
  setTimeout(() => saved.value === key && (saved.value = null), 1500)
}

async function saveDossier(d: (typeof dossiers.value)[number]) {
  const all = d.allRoles || (d.allowedRoles ?? []).length === ROLES.length
  if (
    await studio.attempt(() =>
      window.orquest.saveDossier({ provider: d.provider, model: d.model, allowedRoles: all ? null : d.allowedRoles, enforce: d.enforce, notes: d.notes }),
    )
  ) {
    flash(`${d.provider}::${d.model}`)
    await load()
  }
}

function addModel(provider: DossierView['provider']) {
  const model = newModel.value[provider]?.trim()
  if (!model || dossiers.value.some((d) => d.provider === provider && d.model === model)) return
  const base = dossiers.value.find((d) => d.provider === provider && !d.model)!
  dossiers.value.push({ ...base, model, notes: '', stats: { entregas: 0, integradas: 0, a_la_primera: 0, rechazos_qa: 0, regresadas: 0, aprobadas_a_la_primera: null, por_puesto: {} } })
  newModel.value[provider] = ''
}

const manual = computed(() => manuals.value.find((m) => m.role === role.value)!)
const lines = (v: string[]) => v.join('\n')
const split = (v: string) => v.split('\n')

async function saveManual() {
  if (await studio.attempt(() => window.orquest.saveManual(JSON.parse(JSON.stringify(manual.value))))) flash(`manual:${role.value}`)
}
</script>

<template>
  <div class="sheet">
    <header>
      <h2>Estudio</h2>
      <nav>
        <button :class="{ on: tab === 'expedientes' }" @click="tab = 'expedientes'">Expedientes</button>
        <button :class="{ on: tab === 'manuales' }" @click="tab = 'manuales'">Manuales de puesto</button>
      </nav>
      <button class="x" @click="studio.overlay = null">✕</button>
    </header>
    <p v-if="studio.error" class="err">{{ studio.error }}</p>

    <template v-if="tab === 'expedientes'">
      <p class="note">Qué puestos permites a cada proveedor, tus notas y cómo le ha ido contigo. El jefe lo lee al proponer.</p>
      <article v-for="d in dossiers" :key="d.provider + '::' + d.model" :class="{ off: !available(d.provider) }">
        <h3>
          {{ name(d.provider) }}<span v-if="d.model" class="model"> · {{ d.model }}</span>
          <small v-if="!available(d.provider)">no disponible</small>
        </h3>
        <div class="cols">
          <section>
            <h4>Puestos permitidos</h4>
            <label class="inline"><input v-model="d.allRoles" type="checkbox" /> todos</label>
            <div v-if="!d.allRoles" class="roles">
              <label v-for="r in ROLES" :key="r" class="inline"><input v-model="d.allowedRoles" type="checkbox" :value="r" /> {{ r }}</label>
            </div>
            <label>Si no se permite
              <select v-model="d.enforce">
                <option value="block">el juego no deja</option>
                <option value="warn">deja, con aviso</option>
              </select>
            </label>
            <label>Notas <textarea v-model="d.notes" rows="2" placeholder="Para qué sirve y para qué no" /></label>
          </section>
          <section>
            <h4>Contigo</h4>
            <p v-if="!d.stats.entregas && !d.stats.integradas" class="muted">Sin historial todavía.</p>
            <template v-else>
              <p><b>{{ d.stats.aprobadas_a_la_primera ?? '—' }}%</b> integradas a la primera</p>
              <p class="muted">{{ d.stats.integradas }} integradas · {{ d.stats.entregas }} entregas · {{ d.stats.rechazos_qa }} rechazos de QA · {{ d.stats.regresadas }} regresadas</p>
              <p v-for="(v, r) in d.stats.por_puesto" :key="r" class="muted">{{ r }}: {{ v.a_la_primera }}/{{ v.integradas }} a la primera</p>
            </template>
            <h4>En el mercado</h4>
            <p class="muted">Llega con el reporte semanal de rankings.</p>
          </section>
        </div>
        <footer>
          <span v-if="!d.model" class="add">
            <input v-model="newModel[d.provider]" placeholder="expediente por modelo…" @keyup.enter="addModel(d.provider)" />
            <button @click="addModel(d.provider)">+</button>
          </span>
          <span v-else />
          <span>
            <small v-if="saved === d.provider + '::' + d.model" class="ok">guardado</small>
            <button class="primary" @click="saveDossier(d)">Guardar</button>
          </span>
        </footer>
      </article>
    </template>

    <template v-else-if="manual">
      <p class="note">Lo que carga cada empleado al entrar. Contratar = proveedor + modelo + esfuerzo + este manual.</p>
      <nav class="roles-nav">
        <button v-for="r in ROLES" :key="r" :class="{ on: role === r }" @click="role = r">{{ r }}</button>
      </nav>
      <label>Prompt del rol <textarea v-model="manual.prompt" rows="3" /></label>
      <div class="cols">
        <label>Documentación (una ruta por línea)
          <textarea :value="lines(manual.docs)" rows="3" placeholder="docs/arquitectura.md" @input="manual.docs = split(($event.target as HTMLTextAreaElement).value)" />
        </label>
        <label>Skills (una por línea)
          <textarea :value="lines(manual.skills)" rows="3" @input="manual.skills = split(($event.target as HTMLTextAreaElement).value)" />
        </label>
      </div>
      <h4>Permisos</h4>
      <label class="inline"><input v-model="manual.permissions.edit" type="checkbox" /> puede editar archivos sin pedir permiso</label>
      <div class="cols">
        <label>Comandos permitidos (prefijos)
          <textarea :value="lines(manual.permissions.allow)" rows="5" @input="manual.permissions.allow = split(($event.target as HTMLTextAreaElement).value)" />
        </label>
        <label>Comandos prohibidos
          <textarea :value="lines(manual.permissions.deny)" rows="5" @input="manual.permissions.deny = split(($event.target as HTMLTextAreaElement).value)" />
        </label>
      </div>
      <label>Formato de entrega <textarea v-model="manual.delivery" rows="2" /></label>
      <label class="inline"><input v-model="manual.requireScreenshots" type="checkbox" /> la entrega exige capturas</label>
      <footer>
        <span class="muted">Aplica a los que se contraten desde ahora.</span>
        <span>
          <small v-if="saved === 'manual:' + role" class="ok">guardado</small>
          <button class="primary" @click="saveManual">Guardar manual</button>
        </span>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.sheet { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); width: min(820px, calc(100% - 32px)); max-height: calc(100% - 80px); overflow: auto; background: var(--panel); border: 3px solid var(--line); box-shadow: 6px 6px 0 #000; padding: 16px; display: grid; gap: 12px; align-content: start; }
header { display: flex; align-items: center; gap: 12px; }
header nav { margin-left: auto; display: flex; gap: 4px; }
nav .on { border-color: var(--accent); }
h2 { margin: 0; }
h3 { margin: 0; font-size: 14px; display: flex; align-items: center; gap: 6px; }
h3 small { color: var(--muted); font-weight: normal; font-size: 11px; }
.model { color: var(--accent); }
h4 { margin: 6px 0 4px; font-size: 11px; text-transform: uppercase; color: var(--muted); }
article { border-top: 2px solid var(--line); padding-top: 10px; display: grid; gap: 8px; }
article.off { opacity: 0.6; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
label { display: grid; gap: 2px; font-size: 12px; color: var(--muted); }
label.inline { display: flex; align-items: center; gap: 6px; color: var(--text); }
.roles { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 4px 0; }
textarea { font: inherit; font-size: 12px; color: var(--text); background: var(--bg); border: 2px solid var(--line); padding: 6px; resize: vertical; }
p { margin: 0 0 2px; font-size: 12px; }
.note, .muted { color: var(--muted); font-size: 12px; margin: 0; }
footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.add { display: flex; gap: 4px; }
.add input { width: 200px; font-size: 12px; }
.roles-nav { display: flex; flex-wrap: wrap; gap: 4px; }
.x { padding: 0 6px; }
.ok { color: var(--idle); margin-right: 8px; }
.err { color: var(--blocked); font-size: 12px; margin: 0; }
.primary { background: var(--accent); color: #1b1a24; border-color: #000; font-weight: bold; }
</style>

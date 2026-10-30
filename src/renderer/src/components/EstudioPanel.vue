<script setup lang="ts">
/**
 * El panel Estudio: el editor de Trazo con el diseño del proyecto. La primera
 * vez pregunta dónde va el diseño y, si no hay diseñador, ofrece contratarlo
 * aquí mismo, sin el jefe: el diseño va y viene con el usuario y no puede
 * pasar por el jefe en cada cambio. El editor corre en un iframe y pide todo
 * por postMessage (assets/trazo/orquest/puente.js); el proceso principal
 * decide qué puede leer y escribir.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FilePlus2, FolderOpen, PenTool, UserPlus } from 'lucide-vue-next'
import type { DesignState, Effort, ProviderId } from '../../../shared/ipc'
import { useStudio } from '../stores/studio'
import { useCanvas } from '../stores/canvas'
import { EFFORT_LABEL } from '../status'
import { getLang, T } from '../../../core/i18n'

const studio = useStudio()
const canvas = useCanvas()
const state = ref<DesignState | null>(null)
const error = ref('')
const busy = ref(false)
/** El usuario quiso diseñar sin agente por ahora: no se le vuelve a ofrecer en esta sesión del panel. */
const solo = ref(false)
const frame = ref<HTMLIFrameElement>()

async function load() {
  try {
    state.value = await window.orquest.designState()
  } catch (e) {
    error.value = (e as Error).message
  }
}
onMounted(load)
// Contratado o despedido desde otro lado: el panel se pone al día.
watch(() => studio.board?.staff.filter((m) => m.role === 'diseno' && !m.gone).map((m) => m.id).join(), load)

async function choose(how: 'create' | 'open') {
  error.value = ''
  try {
    const file = how === 'create' ? await window.orquest.designCreate() : await window.orquest.designOpen()
    if (file) await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

// ── Contratar al diseñador ─────────────────────────────────────────────────
const form = ref<{ name: string; provider: ProviderId; model: string; effort?: Effort }>({ name: '', provider: studio.usable[0]?.id ?? 'claude', model: '' })
const cli = computed(() => studio.clis.find((c) => c.id === form.value.provider))
watch(
  () => form.value.provider,
  () => {
    if (form.value.model && !cli.value?.models?.includes(form.value.model)) form.value.model = ''
    if (form.value.effort && !cli.value?.efforts?.includes(form.value.effort)) form.value.effort = undefined
  },
)

async function hire() {
  busy.value = true
  error.value = ''
  try {
    const f = form.value
    await window.orquest.hireDesigner({ provider: f.provider, name: f.name.trim() || undefined, model: f.model || undefined, effort: f.effort })
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

// ── El editor ──────────────────────────────────────────────────────────────
const src = computed(() => {
  const s = state.value
  if (!s?.editorUrl) return ''
  const q = new URLSearchParams({ lang: getLang() })
  if (s.designer) {
    q.set('disenador', s.designer.name)
    q.set('detalle', s.designer.detail)
  }
  return `${s.editorUrl}?${q}`
})
const origin = computed(() => (state.value?.editorUrl ? new URL(state.value.editorUrl).origin : ''))
const showEditor = computed(() => !!state.value?.file && !!src.value && (!!state.value.designer || solo.value))

type Ask = { op: string; args?: Record<string, any> }
async function answer({ op, args = {} }: Ask): Promise<unknown> {
  const o = window.orquest
  switch (op) {
    case 'diseno':
      return o.designLaunch()
    case 'leer':
      return o.designRead(args.path, args.kind)
    case 'escribir':
      return o.designWrite(args.path, args.bytes, args.kind)
    case 'guardarComo':
      return o.designAskSave(args.defaultPath, args.filters ?? [])
    case 'elegir':
      return o.designPick(args.filters ?? [])
    case 'confirmar':
      return o.designConfirm(String(args.message ?? ''))
    case 'decir': {
      const d = state.value?.designer
      if (!d) throw new Error(T`No hay diseñador en el proyecto.`)
      return o.say(d.id, String(args.prompt ?? ''))
    }
    case 'detener': {
      const d = state.value?.designer
      return d ? o.stopEmployee(d.id) : undefined
    }
  }
  throw new Error(T`El editor pidió algo que Orquest no conoce: ${op}`)
}

function onMessage(e: MessageEvent) {
  if (!frame.value || e.source !== frame.value.contentWindow || e.origin !== origin.value) return
  const m = e.data
  if (m?.trazo === 'toque') canvas.front('estudio')
  if (m?.trazo !== 'pedir') return
  const reply = (r: Record<string, unknown>) => frame.value?.contentWindow?.postMessage({ trazo: 'respuesta', id: m.id, ...r }, origin.value)
  answer(m).then(
    (valor) => reply({ valor }),
    (err) => reply({ error: (err as Error).message }),
  )
}
onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <div class="estudio">
    <p v-if="!state && !error" class="center dim">{{ T`Abriendo el Estudio…` }}</p>

    <div v-else-if="state && !state.editorUrl" class="center">
      <PenTool />
      <h2>{{ T`No se pudo abrir el editor de Trazo` }}</h2>
      <p class="dim">{{ T`Falta el editor en esta instalación de Orquest.` }}</p>
    </div>

    <div v-else-if="state && !state.file" class="center">
      <PenTool />
      <h2>{{ T`¿Dónde va el diseño de este proyecto?` }}</h2>
      <p class="dim">{{ T`Un archivo .trazo por proyecto. Si lo guardas dentro del proyecto, va en git con el código y cada agente lo tiene en su oficina; fuera del proyecto, solo lo leen con leer_diseno.` }}</p>
      <div class="row">
        <button class="btn primary" @click="choose('create')"><FilePlus2 /> {{ T`Crear diseño nuevo…` }}</button>
        <button class="btn" @click="choose('open')"><FolderOpen /> {{ T`Abrir un .trazo que ya tengo…` }}</button>
      </div>
    </div>

    <div v-else-if="state && !state.designer && !solo" class="center">
      <UserPlus />
      <h2>{{ T`Contrata a tu diseñador` }}</h2>
      <p class="dim">{{ T`Trabaja contigo directo en este panel, sin pasar por el jefe. Los demás construyen a partir de su diseño.` }}</p>
      <div class="form">
        <label>{{ T`Nombre` }}<input v-model="form.name" :placeholder="T`se asigna solo`" /></label>
        <label>{{ T`Proveedor` }}
          <select v-model="form.provider">
            <option v-for="c in studio.usable" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label>{{ T`Modelo` }}
          <select v-if="cli?.models?.length" v-model="form.model">
            <option value="">{{ T`por defecto` }}</option>
            <option v-for="m in cli.models" :key="m" :value="m">{{ m }}</option>
          </select>
          <input v-else v-model="form.model" :placeholder="T`por defecto`" />
        </label>
        <label>{{ T`Esfuerzo` }}
          <select v-model="form.effort" :disabled="!cli?.efforts?.length">
            <option :value="undefined">—</option>
            <option v-for="f in cli?.efforts ?? []" :key="f" :value="f">{{ EFFORT_LABEL[f].toLowerCase() }}</option>
          </select>
        </label>
      </div>
      <div class="row">
        <button class="btn primary" :disabled="busy || !studio.usable.length" @click="hire"><UserPlus /> {{ busy ? T`Contratando…` : T`Contratar diseñador` }}</button>
        <button class="btn" @click="solo = true">{{ T`Por ahora diseño yo` }}</button>
      </div>
    </div>

    <iframe v-if="showEditor" ref="frame" :key="src" :src="src" :title="T`Editor de Trazo`" />
    <p v-if="error" class="stop">{{ error }}</p>
  </div>
</template>

<style scoped>
.estudio { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--bg); }
iframe { flex: 1; width: 100%; border: 0; display: block; background: #0f0c14; }
.center { margin: auto; max-width: 560px; padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
.center > svg { width: 32px; height: 32px; color: var(--accent); }
.center h2 { margin: 0; font-size: 16px; }
.center p { margin: 0; font-size: 12px; line-height: 1.5; }
.dim { color: var(--text-secondary); }
.row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 6px; }
.form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; margin-top: 6px; text-align: left; }
.form label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-secondary); }
.form input, .form select { font: inherit; font-size: 12px; color: var(--text-primary); background: var(--surface); border: 2px solid var(--border); padding: 6px 8px; }
.stop { margin: 0; padding: 8px 12px; font-size: 12px; color: var(--danger, #f0524f); }
</style>

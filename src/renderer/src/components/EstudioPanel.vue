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
import type { TrazoRequest, TrazoResponse } from '../../../core/trazomcp'
import { serveTrazo } from '../trazo'

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

/** El diseñador quedó fuera (al reabrir la app, si no lo trajiste): vuelve a su escritorio. */
async function bringBack() {
  const d = state.value?.designer
  if (!d) return
  busy.value = true
  await studio.bringBack(d.id)
  busy.value = false
  await load()
}
// Llegó o se fue: el aviso de arriba se pone al día.
watch(() => studio.employees.some((e) => e.id === state.value?.designer?.id), load)

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
      if (!studio.employees.some((e) => e.id === d.id)) throw new Error(T`${d.name} no está en su escritorio: tráelo de vuelta desde el aviso de arriba.`)
      await o.say(d.id, String(args.prompt ?? ''))
      turn = { started: Date.now(), worked: false }
      return
    }
    case 'mcpEstado':
      return o.trazoStatus()
    case 'detener': {
      const d = state.value?.designer
      if (!d) return
      await o.stopEmployee(d.id)
      endTurn(null)
      return
    }
  }
  throw new Error(T`El editor pidió algo que Orquest no conoce: ${op}`)
}

// ── El chat de Trazo: lo que hace y dice el diseñador ──────────────────────
// Su CLI corre en su terminal y no da salida JSON: el chat recibe eventos con la forma del stream-json de
// Claude Code, armados con lo que sí pasa por aquí (sus llamadas al editor, lo que contesta con
// responder_al_usuario y cuándo vuelve a quedar quieto).
/** El pedido en curso: desde que el usuario le escribe hasta que termina su turno. */
let turn: { started: number; worked: boolean } | null = null
const run = () => state.value?.designer?.name ?? ''
function emit(ev: Record<string, unknown>) {
  frame.value?.contentWindow?.postMessage({ trazo: 'evento', tipo: 'salida', datos: { run: run(), stream: 'stdout', line: JSON.stringify(ev) } }, origin.value)
}
function endTurn(code: number | null) {
  if (!turn) return
  if (code === 0) emit({ type: 'result', subtype: 'success', is_error: false })
  turn = null
  frame.value?.contentWindow?.postMessage({ trazo: 'evento', tipo: 'fin', datos: { run: run(), code } }, origin.value)
}
/** Una llamada al editor sale en el chat como herramienta; si falla, con su error; si es una captura, con su miniatura. */
function toolEvents(req: TrazoRequest, res: TrazoResponse) {
  if (req.method !== 'tools/call' || req.run !== state.value?.designer?.id) return
  const use = `orquest-${req.id}`
  const p = req.params as { name?: string; arguments?: unknown }
  emit({ type: 'assistant', message: { content: [{ type: 'tool_use', id: use, name: `mcp__trazo__${p.name ?? ''}`, input: p.arguments ?? {} }] } })
  const result = 'result' in res ? (res.result as { isError?: boolean; content?: { type: string; text?: string; data?: string; mimeType?: string }[] }) : null
  const failed = !result || result.isError
  const text = 'error' in res ? res.error.message : (result?.content ?? []).map((c) => c.text ?? '').join(' ')
  const image = result?.content?.find((c) => c.type === 'image' && c.data)
  const content = image ? [{ type: 'image', source: { type: 'base64', media_type: image.mimeType ?? 'image/png', data: image.data } }] : [{ type: 'text', text }]
  emit({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: use, is_error: failed, content: failed ? [{ type: 'text', text }] : content }] } })
}
// Lo que el diseñador le contesta al usuario (responder_al_usuario), una vez cada mensaje.
// Lo anterior a abrir el panel ya no se repite: se parte de lo último que había.
let said: number | null = null
watch(
  () => (studio.board?.messages ?? []).filter((m) => m.from === state.value?.designer?.id && m.to === 'usuario'),
  (list) => {
    if (!state.value?.designer) return
    const last = list.at(-1)?.at ?? 0
    if (said === null) said = last
    for (const m of list.filter((x) => x.at > said!)) emit({ type: 'assistant', message: { content: [{ type: 'text', text: m.text }] } })
    said = Math.max(said, last)
  },
  { immediate: true },
)
// Fin del turno: estuvo trabajando y volvió a quedar quieto (estado en calma: no cuenta la pausa entre paso y paso).
watch(
  () => {
    const e = studio.employees.find((x) => x.id === state.value?.designer?.id)
    return e ? studio.calmStateOf(e) : 'offline'
  },
  (now) => {
    if (!turn) return
    if (now === 'working') turn.worked = true
    else if (now === 'offline') endTurn(1)
    else if (turn.worked && now === 'idle') endTurn(0)
  },
)

// ── El MCP «trazo»: el editor atiende lo que pide el diseñador ──────────────
let mcpSeq = 0
const mcpWaiting = new Map<number, (r: TrazoResponse) => void>()
let unserve: (() => void) | undefined
function serve() {
  unserve?.()
  unserve = serveTrazo(
    (req) =>
      new Promise((ok) => {
        const win = frame.value?.contentWindow
        if (!win) return ok({ error: { code: -32603, message: T`El editor de Trazo no está abierto.` } })
        const id = ++mcpSeq
        mcpWaiting.set(id, (res) => {
          toolEvents(req, res)
          ok(res)
        })
        win.postMessage({ trazo: 'mcp', id, req: JSON.parse(JSON.stringify(req)) }, origin.value)
      }),
  )
}
function unserveAll() {
  unserve?.()
  unserve = undefined
  // Lo que quedó esperando no se contesta ya: el proceso principal tiene su tiempo límite, pero mejor decirlo.
  for (const done of mcpWaiting.values()) done({ error: { code: -32603, message: T`Se cerró el editor de Trazo.` } })
  mcpWaiting.clear()
}
const offSessions = window.orquest.onTrazoSessions((sessions) => frame.value?.contentWindow?.postMessage({ trazo: 'evento', tipo: 'sesiones', datos: JSON.parse(JSON.stringify(sessions)) }, origin.value))
// Otro diseño o el editor recargado: el anterior ya no atiende.
watch(src, unserveAll)

function onMessage(e: MessageEvent) {
  if (!frame.value || e.source !== frame.value.contentWindow || e.origin !== origin.value) return
  const m = e.data
  if (m?.trazo === 'toque') canvas.front('estudio')
  if (m?.trazo === 'servir') serve()
  if (m?.trazo === 'dejar') unserveAll()
  if (m?.trazo === 'mcp-respuesta') {
    mcpWaiting.get(m.id)?.(m.res)
    mcpWaiting.delete(m.id)
  }
  if (m?.trazo !== 'pedir') return
  const reply = (r: Record<string, unknown>) => frame.value?.contentWindow?.postMessage({ trazo: 'respuesta', id: m.id, ...r }, origin.value)
  answer(m).then(
    (valor) => reply({ valor }),
    (err) => reply({ error: (err as Error).message }),
  )
}
onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  offSessions()
  unserveAll()
})
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

    <p v-if="showEditor && state?.designer && !state.designer.live" class="away">
      {{ T`${state.designer.name} no está en su escritorio: no recibe lo que le escribas.` }}
      <button class="btn" :disabled="busy" @click="bringBack">{{ T`Traerlo de vuelta` }}</button>
    </p>
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
.away { margin: 0; padding: 8px 12px; display: flex; align-items: center; gap: 10px; font-size: 12px; background: var(--surface); border-bottom: 2px solid var(--border); }
.stop { margin: 0; padding: 8px 12px; font-size: 12px; color: var(--danger, #f0524f); }
</style>

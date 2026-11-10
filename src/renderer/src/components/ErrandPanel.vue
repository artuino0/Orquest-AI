<script setup lang="ts">
/**
 * Una Tarea: a la izquierda su chat (lo que le encargaste, lo que va contando
 * su agente y lo que le escribes) y a la derecha lo que cambia respecto de su
 * rama de origen, con su línea para el registro de cambios y los botones para
 * aprobarla (se une a esa rama) o descartarla. Angosto, van en pestañas.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { AlertTriangle, CheckCircle2, GitBranch, GitMerge, Hand, Send, SquareTerminal, Trash2 } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import type { Errand, ErrandChange } from '../../../shared/ipc'
import { useCanvas } from '../stores/canvas'
import { useStudio } from '../stores/studio'
import { KIND_LOOK, STATUS_LOOK, isOpenErrand } from '../errands'
import PanelFrame from './PanelFrame.vue'

const props = defineProps<{ id: string }>()
const studio = useStudio()
const canvas = useCanvas()

const errand = computed<Errand | undefined>(() => studio.board?.errands?.find((e) => e.id === props.id))
const agent = computed(() => studio.employees.find((e) => e.id === props.id))
const working = computed(() => agent.value?.state === 'working')
const blocked = computed(() => agent.value?.state === 'blocked')
const cliName = computed(() => (errand.value ? (studio.clis.find((c) => c.id === errand.value!.provider)?.name ?? errand.value.provider) : ''))
const subtitle = computed(() => {
  const e = errand.value
  if (!e) return ''
  return [T`tarea`, e.kind, cliName.value, e.model].filter(Boolean).join(' · ')
})

const tab = ref<'chat' | 'changes'>('chat')

// ── Chat ────────────────────────────────────────────────────────────────────
const draft = ref('')
const sending = ref(false)
const error = ref('')
const log = ref<HTMLElement>()
watch(() => errand.value?.log.length, async () => {
  await nextTick()
  log.value?.scrollTo({ top: log.value.scrollHeight })
}, { immediate: true })

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value) return
  sending.value = true
  error.value = ''
  try {
    await window.orquest.errandSay(props.id, text)
    draft.value = ''
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    sending.value = false
  }
}
function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault()
    void send()
  }
}
async function stop() {
  error.value = ''
  try {
    const r = await window.orquest.stopErrand(props.id)
    if (r.restored && !draft.value) draft.value = r.restored
  } catch (e) {
    error.value = (e as Error).message
  }
}
const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

// ── Cambios ─────────────────────────────────────────────────────────────────
const changes = ref<ErrandChange[]>([])
const picked = ref('')
const diff = ref('')
const added = computed(() => changes.value.reduce((n, c) => n + c.added, 0))
const removed = computed(() => changes.value.reduce((n, c) => n + c.removed, 0))

async function loadChanges() {
  if (!errand.value || !isOpenErrand(errand.value)) {
    changes.value = []
    picked.value = ''
    diff.value = ''
    return
  }
  try {
    changes.value = await window.orquest.errandChanges(props.id)
    if (!changes.value.some((c) => c.path === picked.value)) picked.value = changes.value[0]?.path ?? ''
    await loadDiff()
  } catch {
    // La carpeta puede estar a medio crear o recién quitada: la próxima vuelta se intenta de nuevo.
  }
}
async function loadDiff() {
  diff.value = picked.value ? await window.orquest.errandDiff(props.id, picked.value).catch(() => '') : ''
}
watch(picked, () => void loadDiff())
watch(() => [errand.value?.status, errand.value?.log.length, agent.value?.state].join(), () => void loadChanges(), { immediate: true })
// Mientras trabaja, sus archivos cambian sin que cambie nada más: se revisan cada tanto.
const timer = setInterval(() => working.value && void loadChanges(), 5000)
onBeforeUnmount(() => clearInterval(timer))

const diffLines = computed(() =>
  diff.value
    .split('\n')
    .filter((l) => !/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode)/.test(l))
    .map((l) => ({ text: l, kind: l.startsWith('@@') ? 'hunk' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : 'ctx' })),
)

// ── Aprobar y descartar ─────────────────────────────────────────────────────
const confirming = ref<'' | 'approve' | 'discard'>('')
const acting = ref(false)
async function approve() {
  if (confirming.value !== 'approve') return void (confirming.value = 'approve')
  confirming.value = ''
  acting.value = true
  error.value = ''
  try {
    const r = await window.orquest.approveErrand(props.id)
    if (!r.merged && r.reason) error.value = r.reason
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    acting.value = false
  }
}
async function discard() {
  if (confirming.value !== 'discard') return void (confirming.value = 'discard')
  confirming.value = ''
  acting.value = true
  error.value = ''
  try {
    await window.orquest.discardErrand(props.id)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <PanelFrame :title="errand?.title ?? T`Tarea`" :subtitle="subtitle">
    <div v-if="!errand" class="gone">{{ T`Esta tarea ya no existe.` }}</div>
    <div v-else class="errand">
      <div class="branch">
        <GitBranch />
        <b>{{ errand.branch }}</b>
        <span class="dim">{{ T`sale de ${errand.base} y vuelve a ${errand.base}` }}</span>
        <span class="grow" />
        <button v-if="agent && isOpenErrand(errand)" class="link" :title="T`Ver su terminal`" @click="canvas.open('employee', id)"><SquareTerminal /> {{ T`Terminal` }}</button>
        <span class="kind" :style="{ color: `var(--${KIND_LOOK[errand.kind].color})`, borderColor: `var(--${KIND_LOOK[errand.kind].color})` }">{{ KIND_LOOK[errand.kind].tag }}</span>
        <span class="badge" :style="{ color: `var(--${STATUS_LOOK[errand.status].color})`, borderColor: `var(--${STATUS_LOOK[errand.status].color})` }"><i :style="{ background: `var(--${STATUS_LOOK[errand.status].color})` }" />{{ STATUS_LOOK[errand.status].label }}</span>
      </div>

      <div class="tabs">
        <button :class="{ on: tab === 'chat' }" @click="tab = 'chat'">{{ T`Chat` }}</button>
        <button :class="{ on: tab === 'changes' }" @click="tab = 'changes'">{{ T`Cambios` }} <small>{{ changes.length }}</small></button>
      </div>

      <div class="cols" :class="`show-${tab}`">
        <!-- Chat -->
        <section class="chat">
          <div v-if="blocked" class="alert">
            <AlertTriangle />
            <span class="grow">{{ T`Su CLI te pregunta algo en su terminal.` }}</span>
            <button class="btn" @click="canvas.open('employee', id)"><SquareTerminal /> {{ T`Ver terminal` }}</button>
          </div>
          <div ref="log" class="log">
            <template v-for="(l, i) in errand.log" :key="i">
              <div v-if="l.by === 'user'" class="msg user">
                <span class="who">{{ T`Tú` }} · {{ time(l.at) }}</span>
                <p>{{ l.text }}</p>
              </div>
              <div v-else-if="l.kind === 'done'" class="msg done">
                <CheckCircle2 />
                <p>{{ l.text }}</p>
              </div>
              <div v-else-if="l.kind === 'stop'" class="msg stop">
                <Hand />
                <p>{{ l.text }}</p>
              </div>
              <div v-else class="msg step" :class="l.by">
                <i />
                <p>{{ l.text }}</p>
              </div>
            </template>
            <div v-if="working" class="msg thinking"><i /><p>{{ T`Trabajando…` }}</p></div>
          </div>
          <div v-if="isOpenErrand(errand)" class="compose">
            <textarea v-model="draft" rows="1" :placeholder="errand.status === 'ready' ? T`Pídele un ajuste antes de aprobar…` : T`Escríbele a la tarea…`" @keydown="onKey" />
            <button v-if="working" class="btn" :title="T`Detenerla`" @click="stop"><Hand /></button>
            <button class="btn" :disabled="!draft.trim() || sending" @click="send"><Send /> {{ T`Enviar` }}</button>
          </div>
        </section>

        <!-- Cambios -->
        <section class="changes">
          <ul class="files">
            <li v-if="!changes.length" class="dim">{{ isOpenErrand(errand) ? T`Todavía no cambia nada.` : T`Cerrada: su rama ya no está.` }}</li>
            <li v-for="c in changes" :key="c.path" :class="{ on: c.path === picked }" @click="picked = c.path">
              <b :class="`st-${c.status}`">{{ c.status }}</b>
              <span class="grow">{{ c.path }}</span>
              <small class="add">+{{ c.added }}</small><small class="del">−{{ c.removed }}</small>
            </li>
          </ul>
          <div class="diff">
            <div v-for="(l, i) in diffLines" :key="i" :class="l.kind">{{ l.text || ' ' }}</div>
          </div>
          <div v-if="errand.changelog || errand.status === 'merged'" class="changelog">
            <span class="cap">{{ T`Registro de cambios · sin publicar` }}</span>
            <p>{{ errand.changelog || errand.title }}</p>
          </div>
          <p v-if="isOpenErrand(errand)" class="dim">
            {{ T`Aprobar une la rama a ${errand.base}, agrega esa línea al registro y cierra la tarea.` }}
            <template v-if="changes.length"> · <span class="add">+{{ added }}</span> <span class="del">−{{ removed }}</span></template>
          </p>
          <p v-if="error" class="warn">{{ error }}</p>
          <div v-if="isOpenErrand(errand)" class="actions">
            <button class="btn" :class="{ danger: confirming === 'discard' }" :disabled="acting" @click="discard"><Trash2 /> {{ confirming === 'discard' ? T`¿Descartarla?` : T`Descartar` }}</button>
            <span class="grow" />
            <button class="btn primary" :disabled="acting || working || !changes.length" :title="working ? T`Espera a que termine o detenla` : ''" @click="approve">
              <GitMerge /> {{ acting ? T`Integrando…` : confirming === 'approve' ? T`¿Unir a ${errand.base}?` : T`Aprobar e integrar` }}
            </button>
          </div>
        </section>
      </div>
    </div>
  </PanelFrame>
</template>

<style scoped>
.gone { padding: 16px; font-size: 12px; color: var(--text-secondary); }
.errand { container-type: inline-size; display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 8px; }
.branch { display: flex; align-items: center; gap: 8px; font-size: 11px; min-width: 0; }
.branch > svg { width: 12px; height: 12px; color: var(--text-secondary); flex: none; }
.branch b { white-space: nowrap; }
.dim { font-size: 10px; color: var(--text-secondary); margin: 0; line-height: 16px; }
.branch .dim { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grow { flex: 1; min-width: 0; }
.link { display: inline-flex; align-items: center; gap: 4px; background: none; border: 0; color: var(--text-secondary); font: 10px var(--font); cursor: pointer; }
.link:hover { color: var(--text-primary); }
.link svg { width: 12px; height: 12px; }
.kind { flex: none; border: 2px solid; padding: 1px 6px; font: 700 10px var(--font); }
.badge { display: inline-flex; align-items: center; gap: 6px; border: 2px solid; padding: 2px 8px; background: var(--bg); font: 700 11px var(--font); white-space: nowrap; }
.badge i { width: 8px; height: 8px; }
.tabs { display: flex; }
.tabs button { border: 2px solid var(--border); background: var(--surface-2); color: var(--text-secondary); padding: 5px 12px; font: 700 11px var(--font); cursor: pointer; }
.tabs button.on { background: var(--accent); color: var(--on-accent); }
.cols { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr; gap: 12px; }
.cols.show-chat .changes, .cols.show-changes .chat { display: none; }
@container (min-width: 860px) {
  .tabs { display: none; }
  .cols { grid-template-columns: minmax(0, 1fr) minmax(320px, 0.75fr); }
  .cols.show-chat .changes, .cols.show-changes .chat { display: flex; }
}
.chat, .changes { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.alert { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--tint-danger); border: 2px solid var(--st-block); font-size: 11px; }
.alert > svg { width: 14px; height: 14px; color: var(--st-block); flex: none; }
.log { flex: 1; min-height: 0; overflow: auto; background: var(--term-bg); padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.msg p { margin: 0; font-size: 12px; line-height: 20px; white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.user { background: var(--surface-2); padding: 10px 12px; }
.who { display: block; font: 700 10px var(--font); letter-spacing: 1px; text-transform: uppercase; color: var(--accent); margin-bottom: 4px; }
.msg.step, .msg.thinking { display: flex; gap: 10px; align-items: flex-start; }
.msg.step i, .msg.thinking i { width: 8px; height: 8px; flex: none; margin-top: 6px; background: var(--st-idle); }
.msg.step.orquest i { background: var(--text-secondary); }
.msg.step.orquest p { color: var(--text-secondary); }
.msg.thinking i { background: var(--st-work); animation: pulse 1s steps(2) infinite; }
.msg.thinking p { color: var(--text-secondary); }
@keyframes pulse { 50% { opacity: 0.2; } }
.msg.done, .msg.stop { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 2px solid; }
.msg.done { background: var(--tint-warn); border-color: var(--st-review); }
.msg.done p { font-weight: 700; }
.msg.stop { background: var(--tint-danger); border-color: var(--st-block); }
.msg.done svg, .msg.stop svg { width: 14px; height: 14px; flex: none; margin-top: 3px; }
.msg.done svg { color: var(--st-review); }
.msg.stop svg { color: var(--st-block); }
.compose { display: flex; gap: 8px; align-items: flex-end; }
.compose textarea { flex: 1; min-height: 36px; max-height: 140px; font: 12px var(--font); color: var(--text-primary); background: var(--bg); border: 2px solid var(--border-light); padding: 8px 10px; outline: none; resize: vertical; }
.compose textarea:focus { border-color: var(--accent); }
.files { margin: 0; padding: 0; list-style: none; max-height: 160px; overflow: auto; }
.files li { display: flex; align-items: center; gap: 8px; padding: 4px 6px; font-size: 11px; cursor: pointer; }
.files li.on { background: var(--surface-2); }
.files li b { width: 12px; color: var(--accent); }
.files li b.st-A { color: var(--st-idle); }
.files li b.st-D { color: var(--st-block); }
.files li span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.add { color: var(--st-idle); }
.del { color: var(--st-block); }
small.add, small.del { font: 700 10px var(--font); }
.diff { flex: 1; min-height: 80px; overflow: auto; background: var(--term-bg); border: 2px solid var(--border-light); padding: 2px; font: 10px/16px var(--font); }
.diff div { padding: 0 8px; white-space: pre; }
.diff .add { background: var(--tint-ok); color: var(--text-primary); }
.diff .del { background: var(--tint-danger); color: var(--text-primary); }
.diff .hunk { color: var(--st-dep); }
.diff .ctx { color: var(--text-secondary); }
.changelog { background: var(--bg); border: 2px solid var(--border-light); padding: 10px; }
.changelog p { margin: 4px 0 0; font-size: 11px; line-height: 16px; }
.cap { font: 700 10px var(--font); letter-spacing: 1px; text-transform: uppercase; color: var(--text-secondary); }
.warn { margin: 0; font-size: 10px; line-height: 16px; color: var(--st-block); }
.actions { display: flex; align-items: center; gap: 8px; }
</style>

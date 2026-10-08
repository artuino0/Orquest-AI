<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { AlertTriangle, ChevronDown, Crown, Inbox, Pencil, Send, Target, Terminal, Users } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import type { ProviderId } from '../../../shared/ipc'
import PanelFrame from './PanelFrame.vue'
import { CHARACTERS, charUrl } from '../characters'

/** Contratar al jefe y hablar con él. El jefe es tu único interlocutor. */
const studio = useStudio()
// Solo estos saben conectarse a las herramientas de Orquest.
const CAN_LEAD: ProviderId[] = ['claude', 'codex']
const ready = (id: ProviderId) => studio.usable.some((c) => c.id === id)
const canLead = (id: ProviderId) => CAN_LEAD.includes(id) && ready(id)
const leaders = computed(() => studio.clis.filter((c) => canLead(c.id)))

const provider = ref<ProviderId>(leaders.value[0]?.id ?? 'claude')
const model = ref('')
const effort = ref<'low' | 'medium' | 'high'>('high')
const goal = ref(studio.board?.goal ?? '')
const message = ref('')
const busy = ref(false)
const EFFORTS = [['low', 'Bajo'], ['medium', 'Medio'], ['high', 'Alto']] as const

async function hire() {
  busy.value = true
  const ok = await studio.hireBoss({ provider: provider.value, model: model.value.trim() || undefined, effort: effort.value, goal: goal.value })
  busy.value = false
  if (ok) studio.overlay = null
}

async function send() {
  if (!message.value.trim()) return
  if (await studio.sayToBoss(message.value.trim())) message.value = ''
}

// ── Conversación ──────────────────────────────────────────────────────────
const boss = computed(() => studio.employees.find((e) => e.id === 'jefe'))
const chat = computed(() =>
  (studio.board?.messages ?? [])
    .filter((m) => m.from === 'jefe' || m.to === 'jefe')
    .map((m) => ({
      ...m,
      mine: m.from === 'usuario',
      who: m.from === 'usuario' ? 'Tú' : m.from === 'jefe' ? (m.to === 'usuario' ? 'Jefe' : `Jefe → ${studio.nameOf(m.to)}`) : studio.nameOf(m.from),
    })),
)
const hour = (at: number) => new Date(at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
const log = ref<HTMLDivElement>()
watch(() => chat.value.length, () => nextTick(() => log.value?.scrollTo(0, log.value.scrollHeight)), { immediate: true })

const STATE: Record<string, [string, string]> = { working: ['Trabajando', 'work'], blocked: ['Te necesita', 'block'], idle: ['En espera', 'idle'], starting: ['Llegando', 'arrive'], exited: ['Fuera', 'arrive'] }
const context = computed(() => Math.round(studio.board?.context.jefe ?? boss.value?.context ?? 0))
const cli = computed(() => studio.clis.find((c) => c.id === boss.value?.provider)?.name ?? boss.value?.provider ?? '')

/** Lo que está detenido hasta que hagas algo. */
const pending = computed(() => {
  const list: { icon: 'warn' | 'team' | 'inbox'; text: string; label: string; go: () => void }[] = []
  for (const e of studio.employees) {
    if (e.state === 'blocked' && e.id !== 'jefe') list.push({ icon: 'warn', text: `${studio.nameOf(e.id)} necesita un permiso`, label: `Ver a ${studio.nameOf(e.id)}`, go: () => studio.select(e.id) })
  }
  const n = studio.proposal.length
  if (n) list.push({ icon: 'team', text: `Aprobar plantilla: ${n} ${n === 1 ? 'puesto' : 'puestos'}`, label: 'Plantilla', go: () => (studio.overlay = 'hire') })
  const d = studio.inbox.length
  if (d) list.push({ icon: 'inbox', text: `${d} ${d === 1 ? 'entrega lista' : 'entregas listas'} para integrar`, label: 'Entregas', go: () => (studio.overlay = 'inbox') })
  return list
})
</script>

<template>
  <!-- Sin jefe: contratarlo -->
  <PanelFrame v-if="!studio.bossOnline" title="Contratar al Jefe" subtitle="Todavía no hay jefe en este proyecto" narrow>
    <p class="lead">
      El jefe es tu único interlocutor: recibe el objetivo, propone la plantilla, reparte tareas y revisa las entregas
      antes de que lleguen a tu bandeja.
    </p>
    <label class="field">
      <span>Objetivo del proyecto</span>
      <textarea v-model="goal" rows="4" placeholder="Qué quieres construir y para cuándo" />
    </label>
    <div class="field">
      <span>Proveedor <small>· solo CLIs listas en esta máquina</small></span>
      <div class="providers">
        <button
          v-for="c in studio.clis" :key="c.id" type="button" class="prov" :class="{ on: provider === c.id }"
          :disabled="!canLead(c.id)" :title="canLead(c.id) ? '' : ready(c.id) ? 'Todavía no puede ser jefe' : 'No está lista en esta máquina'"
          @click="provider = c.id"
        >
          <i :style="{ background: `var(--pv-${c.id})` }" />{{ c.name }}
        </button>
      </div>
    </div>
    <div class="row">
      <label class="field grow">
        <span>Modelo</span>
        <div class="select"><input v-model="model" placeholder="el de la CLI por defecto" /><ChevronDown /></div>
      </label>
      <div class="field">
        <span>Esfuerzo</span>
        <div class="segments">
          <button v-for="[id, label] in EFFORTS" :key="id" type="button" :class="{ on: effort === id }" @click="effort = id">{{ label }}</button>
        </div>
      </div>
    </div>
    <div class="field">
      <span>Personaje <small>· así se verá en la oficina</small></span>
      <div class="cast">
        <button v-for="n in CHARACTERS" :key="n" type="button" :class="{ on: studio.bossCharacter === n }" :title="`Personaje ${n}`" @click="studio.setBossCharacter(n)">
          <img :src="charUrl(n)" alt="" />
        </button>
      </div>
    </div>
    <p v-if="!leaders.length" class="err">Ninguna CLI lista puede ser jefe todavía (Claude Code o Codex con sesión).</p>
    <p v-if="studio.error" class="err">{{ studio.error }}</p>
    <template #footer>
      <span class="foot">Entrará por la puerta y caminará a la oficina del jefe.</span>
      <button class="btn primary" :disabled="!goal.trim() || !leaders.length || busy" @click="hire">
        <Crown /> {{ busy ? 'Contratando…' : 'Contratar jefe' }}
      </button>
    </template>
  </PanelFrame>

  <!-- Con jefe: la conversación -->
  <PanelFrame v-else title="Jefe" :subtitle="`${studio.nameOf('jefe')} · tu único interlocutor`">
    <div class="talk">
      <div class="main">
        <div class="goal">
          <Target />
          <div><span class="cap">Objetivo</span><p>{{ studio.board?.goal || 'Sin objetivo escrito.' }}</p></div>
          <button class="btn" title="Díselo al jefe para cambiarlo" @click="message = `Cambia el objetivo a: ${studio.board?.goal ?? ''}`"><Pencil /> Editar</button>
        </div>
        <div ref="log" class="log">
          <div class="spacer" />
          <p v-if="!chat.length" class="empty">Aún no hay mensajes. Escríbele al jefe abajo.</p>
          <div v-for="(m, i) in chat" :key="i" class="msg" :class="{ mine: m.mine }">
            <span class="who">{{ m.who }} · {{ hour(m.at) }}</span>
            <p>{{ m.text }}</p>
          </div>
        </div>
        <form class="say" @submit.prevent="send">
          <input v-model="message" placeholder="Háblale al Jefe…" />
          <button type="submit" class="btn primary"><Send /> Enviar</button>
        </form>
        <p v-if="studio.error" class="err">{{ studio.error }}</p>
      </div>

      <aside>
        <div class="card who-card">
          <img :src="charUrl(studio.bossCharacter)" alt="" />
          <div>
            <h3 class="title-pixel">{{ studio.nameOf('jefe') }}</h3>
            <p class="dim">{{ cli }}<template v-if="boss?.model"> · {{ boss.model }}</template><template v-if="boss?.effort"> · esfuerzo {{ boss.effort }}</template></p>
            <span v-if="boss" class="chip" :style="{ color: `var(--st-${STATE[boss.state][1]})` }">■ {{ STATE[boss.state][0] }}</span>
            <span class="meter" :class="{ hot: context >= (studio.board?.burnoutAt ?? 80) }"><i><b :style="{ width: `${context}%` }" /></i>{{ context }}%</span>
          </div>
        </div>
        <button class="btn open" @click="studio.select('jefe')"><Terminal /> Abrir terminal del jefe</button>
        <div class="card waits">
          <span class="cap">El jefe espera de ti</span>
          <p v-if="!pending.length" class="dim">Nada por ahora.</p>
          <div v-for="(p, i) in pending" :key="i" class="wait">
            <AlertTriangle v-if="p.icon === 'warn'" class="warn" /><Users v-else-if="p.icon === 'team'" /><Inbox v-else />
            <span>{{ p.text }}</span>
            <button class="btn" @click="p.go">{{ p.label }}</button>
          </div>
        </div>
      </aside>
    </div>
  </PanelFrame>
</template>

<style scoped>
.lead { margin: 0; font-size: 12px; line-height: 1.6; color: var(--text-secondary); }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.field > span, .cap { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-secondary); }
.field small { font-size: 10px; letter-spacing: 0.5px; text-transform: none; }
textarea, input { width: 100%; font: 12px/1.6 var(--font); color: var(--text-primary); background: var(--bg); border: 2px solid var(--border); padding: 10px 12px; resize: none; outline: none; }
textarea:focus, input:focus { border-color: var(--accent); }
.providers { display: flex; flex-wrap: wrap; gap: 6px; }
.prov { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; font: 700 12px var(--font); color: var(--text-primary); background: var(--bg); border: 2px solid var(--border); }
.prov i { width: 10px; height: 10px; }
.prov.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.prov:disabled { opacity: 0.35; }
.row { display: flex; gap: 14px; align-items: flex-end; }
.grow { flex: 1; }
.select { position: relative; }
.select svg { position: absolute; right: 10px; top: 50%; translate: 0 -50%; width: 14px; height: 14px; color: var(--text-secondary); pointer-events: none; }
.segments { display: flex; border: 2px solid var(--border); background: var(--bg); }
.segments button { border: 0; background: none; padding: 9px 16px; font: 700 12px var(--font); color: var(--text-secondary); }
.segments button.on { background: var(--accent); color: var(--on-accent); }
.cast { display: flex; flex-wrap: wrap; gap: 6px; }
.cast button { width: 60px; height: 62px; display: grid; place-items: center; padding: 0; background: var(--bg); border: 2px solid var(--border); }
.cast button.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); background: var(--surface-2); }
.cast img { height: 46px; image-rendering: pixelated; }
.foot { flex: 1; font-size: 11px; color: var(--text-secondary); }
.err { margin: 0; font-size: 12px; color: var(--st-block); }

.talk { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 332px; gap: 14px; }
.main { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.goal { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--bg); border: 2px solid var(--accent); }
.goal > svg { width: 18px; height: 18px; color: var(--accent); flex: none; }
.goal div { flex: 1; min-width: 0; }
.goal p { margin: 2px 0 0; font-size: 12px; line-height: 1.5; }
.log { flex: 1; min-height: 120px; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 10px; background: var(--bg); border: 2px solid var(--border); }
.spacer { flex: 1; }
.empty, .dim { margin: 0; font-size: 11px; color: var(--text-secondary); }
.msg { align-self: flex-start; max-width: 70%; padding: 8px 12px; background: var(--surface); border-left: 3px solid var(--pv-claude); }
.msg.mine { align-self: flex-end; border-left: 0; border-right: 3px solid var(--border-light); }
.msg .who { font-size: 10px; font-weight: 700; color: var(--pv-claude); }
.msg.mine .who { color: var(--text-secondary); }
.msg p { margin: 4px 0 0; font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
.say { display: flex; gap: 8px; }
.say input { flex: 1; }

aside { min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.card { background: var(--bg); border: 2px solid var(--border); padding: 12px; }
.who-card { display: flex; gap: 12px; }
.who-card img { width: 48px; height: 56px; object-fit: contain; image-rendering: pixelated; background: var(--surface-2); border: 2px solid var(--border); padding: 4px; }
.who-card h3 { font-size: 18px; }
.who-card .dim { margin: 4px 0 6px; line-height: 1.5; }
.who-card .meter { display: flex; margin-top: 8px; }
.open { align-self: flex-start; }
.waits { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: auto; }
.wait { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 2px solid var(--surface-2); font-size: 12px; }
.wait svg { width: 16px; height: 16px; flex: none; color: var(--accent); }
.wait svg.warn { color: var(--st-block); }
.wait span { flex: 1; }
</style>

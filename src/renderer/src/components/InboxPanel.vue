<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, ChevronDown, ChevronRight, Crown, GitMerge, Inbox, Undo2 } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import { qaOf } from './taskLabels'
import PanelFrame from './PanelFrame.vue'

/** Lo que el jefe aprobó y espera tu decisión: integrar a la rama principal o regresar. */
const studio = useStudio()
const open = ref<string | null>(null)
const diffs = ref<Record<string, string>>({})
const notes = ref<Record<string, string>>({})
const busy = ref<string | null>(null)
/** Por qué no se pudo integrar cada una (lo dice git), hasta que se resuelva. */
const conflicts = ref<Record<string, string>>({})

// Siempre hay una abierta: la primera que llegue.
watch(
  () => studio.inbox.map((t) => t.id).join(),
  () => {
    if (!studio.inbox.some((t) => t.id === open.value)) show(studio.inbox[0]?.id ?? null)
  },
  { immediate: true },
)

async function show(id: string | null) {
  open.value = id
  if (id && diffs.value[id] === undefined) diffs.value[id] = await window.orquest.taskDiff(id).catch(() => '')
}

async function merge(id: string) {
  busy.value = id
  if (await studio.mergeTask(id)) {
    delete conflicts.value[id]
    studio.notice(`${id} integrada.`)
  } else if (studio.error) {
    conflicts.value[id] = studio.error
    studio.error = null
  }
  busy.value = null
}

async function sendBack(id: string, why?: string) {
  const n = (why ?? notes.value[id] ?? '').trim()
  if (!n) return
  busy.value = id
  if (await studio.returnTask(id, n)) {
    notes.value[id] = ''
    delete conflicts.value[id]
  }
  busy.value = null
}

const askBoss = (id: string) => studio.sayToBoss(`No se pudo integrar ${id}: ${conflicts.value[id]}. Resuélvelo.`)

const member = (id: string) => studio.board?.staff.find((m) => m.id === id)
const cli = (id: string) => studio.clis.find((c) => c.id === member(id)?.provider)?.name ?? member(id)?.provider ?? ''
/** El diff partido por archivo, con sus cuentas. */
function parse(text: string) {
  const files: { name: string; lines: string[] }[] = []
  let added = 0
  let removed = 0
  for (const l of text.split('\n')) {
    const head = /^diff --git a\/(.+?) b\//.exec(l)
    if (head) files.push({ name: head[1], lines: [] })
    else if (/^(index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(l)) continue
    else if (files.length) {
      files.at(-1)!.lines.push(l)
      if (l.startsWith('+')) added++
      else if (l.startsWith('-')) removed++
    }
  }
  return { files, added, removed }
}
const parsed = computed(() => (open.value ? parse(diffs.value[open.value] ?? '') : null))
const mark = (l: string) => (l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hunk' : '')
const count = computed(() => studio.inbox.length)
</script>

<template>
  <PanelFrame title="Entregas" :subtitle="count ? `${count} ${count === 1 ? 'entrega aprobada por el jefe espera' : 'entregas aprobadas por el jefe esperan'} tu decisión` : 'Nada pendiente'">
    <div v-if="!count" class="blank">
      <Inbox />
      <h2>Bandeja vacía</h2>
      <p>Aquí llega lo que el jefe ya aprobó. Cuando alguien haga fila frente a su oficina, lo verás aquí.</p>
    </div>

    <template v-for="t in studio.inbox" :key="t.id">
      <!-- Abierta: reporte, veredicto de QA y diff -->
      <article v-if="open === t.id" class="card open" :class="{ conflict: conflicts[t.id] }">
        <header>
          <div class="who">
            <h2><span class="id">{{ t.id }}</span> {{ t.title }} <span class="chip" :style="{ color: qaOf(t).color ? `var(--st-${qaOf(t).color})` : 'var(--text-secondary)' }">{{ qaOf(t).text }}</span></h2>
            <p class="dim"><i class="sq" :style="{ background: `var(--pv-${member(t.assignee)?.provider ?? 'grok'})` }" />{{ studio.nameOf(t.assignee) }} · {{ member(t.assignee)?.role }} · {{ cli(t.assignee) }}<template v-if="t.returns"> · regresó {{ t.returns }}×</template></p>
          </div>
          <button class="btn" :disabled="busy === t.id || !notes[t.id]?.trim()" title="Escribe abajo qué falta" @click="sendBack(t.id)"><Undo2 /> Regresar</button>
          <button class="btn primary" :disabled="busy === t.id" @click="merge(t.id)"><GitMerge /> {{ conflicts[t.id] ? 'Reintentar' : 'Integrar' }}</button>
        </header>

        <div v-if="conflicts[t.id]" class="problem">
          <AlertTriangle />
          <div>
            <b>No se pudo integrar</b>
            <p>{{ conflicts[t.id] }} No se integró nada; la rama sigue intacta.</p>
            <button class="btn" @click="askBoss(t.id)"><Crown /> Pedir al jefe que lo resuelva</button>
            <button class="btn" @click="sendBack(t.id, `No se pudo integrar: ${conflicts[t.id]}`)"><Undo2 /> Regresar a {{ studio.nameOf(t.assignee) }} con el conflicto</button>
          </div>
        </div>

        <div class="reports">
          <div><span class="cap">Reporte de {{ studio.nameOf(t.assignee) }}</span><p>{{ t.delivery?.report || 'Sin reporte.' }}</p></div>
          <div v-if="t.qa"><span class="cap">Veredicto de QA</span><p :class="t.qa.verdict === 'fail' ? 'bad' : 'good'">{{ t.qa.report }}</p></div>
        </div>

        <template v-if="parsed">
          <p class="diff-head">
            <ChevronDown /> <b>Diff · {{ parsed.files.length }} {{ parsed.files.length === 1 ? 'archivo' : 'archivos' }}</b>
            <span class="good">+{{ parsed.added }}</span> <span class="bad">-{{ parsed.removed }}</span>
            <span class="dim">{{ parsed.files.map((f) => f.name).join(' · ') || t.delivery?.diffStat }}</span>
          </p>
          <div v-if="parsed.files.length" class="diff">
            <template v-for="f in parsed.files" :key="f.name">
              <b class="file">{{ f.name }}</b>
              <pre><span v-for="(l, i) in f.lines" :key="i" :class="mark(l)">{{ l || ' ' }}
</span></pre>
            </template>
          </div>
        </template>

        <input v-model="notes[t.id]" class="notes" :placeholder="`Notas si la regresas (las recibe ${studio.nameOf(t.assignee)} por medio del jefe)…`" />
        <p v-if="studio.error" class="bad">{{ studio.error }}</p>
      </article>

      <!-- Cerrada: una línea -->
      <article v-else class="card row" @click="show(t.id)">
        <ChevronRight />
        <span class="id">{{ t.id }}</span>
        <b>{{ t.title }}</b>
        <span class="dim grow">{{ studio.nameOf(t.assignee) }}<template v-if="t.delivery?.diffStat"> · {{ t.delivery.diffStat.trim() }}</template></span>
        <span class="chip" :style="{ color: qaOf(t).color ? `var(--st-${qaOf(t).color})` : 'var(--text-secondary)' }">{{ qaOf(t).text }}</span>
        <button class="btn primary" :disabled="busy === t.id" @click.stop="merge(t.id)"><GitMerge /> Integrar</button>
      </article>
    </template>
  </PanelFrame>
</template>

<style scoped>
.card { background: var(--bg); border: 3px solid var(--border); }
.card.open { flex: none; display: flex; flex-direction: column; gap: 12px; padding: 14px; border-color: var(--accent); }
.card.open.conflict { border-color: var(--st-block); }
.card.row { flex: none; display: flex; align-items: center; gap: 10px; padding: 10px 14px; font-size: 12px; cursor: pointer; }
.card.row > svg { width: 14px; height: 14px; color: var(--text-secondary); flex: none; }
header { display: flex; align-items: center; gap: 10px; }
.who { flex: 1; min-width: 0; }
h2 { margin: 0; font: 700 16px var(--font-pixel); color: var(--text-primary); text-transform: none; letter-spacing: 0; display: flex; align-items: center; gap: 10px; }
.id { font: 700 12px var(--font); color: var(--accent); white-space: nowrap; }
.chip { text-transform: uppercase; font-family: var(--font); }
.who p { margin: 6px 0 0; font-size: 11px; display: flex; align-items: center; gap: 6px; }
.sq { width: 10px; height: 10px; }
.grow { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.problem { display: flex; gap: 12px; padding: 12px 14px; background: var(--tint-danger); border: 2px solid var(--st-block); font-size: 12px; }
.problem > svg { width: 18px; height: 18px; color: var(--st-block); flex: none; }
.problem b { color: var(--st-block); }
.problem p { margin: 6px 0 10px; line-height: 1.5; }
.problem .btn { margin-right: 8px; }
.reports { display: grid; grid-template-columns: 1fr 330px; gap: 20px; padding-bottom: 12px; border-bottom: 2px solid var(--surface-2); }
.reports p { margin: 6px 0 0; font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
.good { color: var(--st-idle); }
.bad { color: var(--st-block); }
.diff-head { margin: 0; display: flex; align-items: center; gap: 10px; font-size: 12px; }
.diff-head svg { width: 14px; height: 14px; color: var(--accent); }
.diff-head span { font-weight: 700; }
.diff-head .dim { font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diff { max-height: 300px; overflow: auto; background: var(--term-bg); border: 2px solid var(--border); }
.file { display: block; padding: 6px 10px; font-size: 12px; background: var(--surface-2); border-bottom: 2px solid var(--border); position: sticky; top: 0; }
pre { margin: 0; font: 12px/1.6 var(--font); }
pre span { display: block; padding: 0 10px; white-space: pre; }
pre .add { background: var(--tint-ok); }
pre .del { background: var(--tint-danger); }
pre .hunk { color: var(--text-secondary); }
.notes { width: 100%; font: 12px var(--font); color: var(--text-primary); background: var(--surface); border: 2px solid var(--border); padding: 10px 12px; outline: none; }
.notes:focus { border-color: var(--accent); }
p.bad { margin: 0; font-size: 12px; }
</style>

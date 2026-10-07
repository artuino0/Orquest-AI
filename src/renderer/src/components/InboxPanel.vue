<script setup lang="ts">
import { ref } from 'vue'
import { useStudio } from '../stores/studio'

/** Lo que el jefe aprobó y espera tu decisión: integrar a la rama principal o regresar. */
const studio = useStudio()
const open = ref<string | null>(null)
const diff = ref('')
const notes = ref<Record<string, string>>({})
const busy = ref<string | null>(null)

async function toggleDiff(id: string) {
  if (open.value === id) {
    open.value = null
    return
  }
  open.value = id
  diff.value = await window.orquest.taskDiff(id)
}

async function merge(id: string) {
  busy.value = id
  if (await studio.mergeTask(id)) studio.notice(`${id} integrada.`)
  busy.value = null
}

async function sendBack(id: string) {
  const n = notes.value[id]?.trim()
  if (!n) return
  busy.value = id
  if (await studio.returnTask(id, n)) notes.value[id] = ''
  busy.value = null
}

const lineClass = (l: string) => (l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hunk' : '')
</script>

<template>
  <div class="sheet">
    <header>
      <h2>Bandeja de entregas</h2>
      <button class="x" @click="studio.overlay = null">✕</button>
    </header>
    <p v-if="!studio.inbox.length" class="muted">Nada que aprobar. Lo que el jefe apruebe llega aquí para que decidas si se integra.</p>
    <p v-if="studio.error" class="err">{{ studio.error }}</p>
    <article v-for="t in studio.inbox" :key="t.id">
      <h3>{{ t.id }} · {{ t.title }}</h3>
      <p class="muted">{{ studio.nameOf(t.assignee) }}<span v-if="t.returns"> · regresó {{ t.returns }}×</span></p>
      <p class="report">{{ t.delivery?.report }}</p>
      <p v-if="t.qa" class="qa" :class="t.qa.verdict">QA {{ t.qa.verdict === 'pass' ? 'pasa' : 'no pasa' }}: {{ t.qa.report }}</p>
      <pre v-if="t.delivery?.diffStat" class="stat">{{ t.delivery.diffStat }}</pre>
      <button class="link" @click="toggleDiff(t.id)">{{ open === t.id ? 'Ocultar diff' : 'Ver diff' }}</button>
      <pre v-if="open === t.id" class="diff"><span v-for="(l, i) in diff.split('\n')" :key="i" :class="lineClass(l)">{{ l }}
</span></pre>
      <footer>
        <input v-model="notes[t.id]" placeholder="Qué falta (para regresarla)" />
        <button :disabled="busy === t.id || !notes[t.id]?.trim()" @click="sendBack(t.id)">Regresar</button>
        <button class="primary" :disabled="busy === t.id" @click="merge(t.id)">Integrar</button>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.sheet { position: absolute; top: 64px; right: 12px; width: min(640px, calc(100% - 24px)); max-height: calc(100% - 80px); overflow: auto; background: var(--panel); border: 3px solid var(--line); box-shadow: 6px 6px 0 #000; padding: 16px; display: grid; gap: 12px; }
header { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; }
article { border-top: 2px solid var(--line); padding-top: 10px; display: grid; gap: 6px; }
h3 { margin: 0; font-size: 14px; }
p { margin: 0; font-size: 12px; }
.muted { color: var(--muted); }
.report { white-space: pre-wrap; }
.qa.pass { color: var(--idle); }
.qa.fail { color: var(--blocked); }
.stat, .diff { margin: 0; font-size: 11px; background: var(--bg); padding: 8px; overflow: auto; max-height: 300px; }
.add { color: #81c784; }
.del { color: #e57373; }
.hunk { color: #64b5f6; }
footer { display: flex; gap: 6px; }
footer input { flex: 1; }
.link { justify-self: start; font-size: 11px; padding: 0 6px; }
.x { padding: 0 6px; }
.err { color: var(--blocked); font-size: 12px; }
.primary { background: var(--accent); color: #1b1a24; border-color: #000; font-weight: bold; }
</style>

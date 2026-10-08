<script setup lang="ts">
/**
 * Planes y documentos del proyecto: lo que el jefe (o quien sea) deja escrito
 * en el repo. Se listan lo más reciente primero y se leen aquí mismo.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FileText, RefreshCw } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import { ago } from '../format'
import type { ProjectDocument } from '../../../shared/ipc'
import PanelFrame from './PanelFrame.vue'

const studio = useStudio()
const docs = ref<ProjectDocument[]>([])
const picked = ref('')
const text = ref('')
const only = ref<'todos' | 'recientes'>('recientes')
const now = ref(Date.now())

async function load() {
  now.value = Date.now()
  docs.value = await window.orquest.documents().catch(() => [])
  if (!docs.value.some((d) => d.path === picked.value)) picked.value = shown.value[0]?.path ?? docs.value[0]?.path ?? ''
}
/** "Recientes": lo nuevo o cambiado desde el último commit, que es lo que el jefe acaba de escribir. */
const shown = computed(() => (only.value === 'recientes' && docs.value.some((d) => d.status) ? docs.value.filter((d) => d.status) : docs.value))
const recent = computed(() => docs.value.filter((d) => d.status).length)

watch(picked, async (path) => {
  text.value = path ? await window.orquest.documentText(path).catch((e) => `No se pudo abrir: ${e instanceof Error ? e.message : e}`) : ''
}, { immediate: true })

// Mientras está abierto se vuelve a mirar: el jefe puede estar escribiendo ahora mismo.
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  timer = setInterval(async () => {
    await load()
    if (picked.value) text.value = await window.orquest.documentText(picked.value).catch(() => text.value)
  }, 5000)
})
onBeforeUnmount(() => clearInterval(timer))

/** El texto por renglones, con su tipo, para darle forma sin interpretar HTML. */
const lines = computed(() =>
  text.value.split('\n').map((raw) => {
    const h = /^(#{1,4})\s+(.*)/.exec(raw)
    if (h) return { kind: `h${h[1].length}`, text: h[2] }
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)/.exec(raw)
    if (li) return { kind: 'li', text: li[3], mark: /\d/.test(li[2]) ? li[2] : '•', pad: li[1].length }
    if (/^\s*(```|---|\*\*\*)\s*$/.test(raw)) return { kind: 'rule', text: '' }
    return { kind: raw.trim() ? 'p' : 'gap', text: raw }
  }),
)
</script>

<template>
  <PanelFrame title="Planes y documentos" :subtitle="docs.length ? `${docs.length} en el proyecto · ${recent} ${recent === 1 ? 'nuevo o cambiado' : 'nuevos o cambiados'} desde el último commit` : 'Lo que el jefe deja escrito en el repo'">
    <template #actions><button class="btn" @click="load"><RefreshCw /> Actualizar</button></template>

    <div v-if="!docs.length" class="blank">
      <FileText />
      <h2>Aún no hay documentos</h2>
      <p>Cuando el jefe escriba un plan o unas notas en el repo (archivos .md o .txt), aparecen aquí. Pídeselo: «escribe el plan en docs/plan.md».</p>
    </div>

    <div v-else class="split">
      <div class="side">
        <div class="segments">
          <button :class="{ on: only === 'recientes' }" @click="only = 'recientes'">Recientes</button>
          <button :class="{ on: only === 'todos' }" @click="only = 'todos'">Todos</button>
        </div>
        <ul class="list">
          <li v-for="d in shown" :key="d.path" :class="{ on: d.path === picked }" @click="picked = d.path">
            <b>{{ d.path.split('/').pop() }}</b>
            <small>{{ d.path.includes('/') ? d.path.slice(0, d.path.lastIndexOf('/')) + ' · ' : '' }}{{ ago(d.at, now) }}</small>
            <span v-if="d.status" class="chip" :class="d.status">{{ d.status }}</span>
          </li>
        </ul>
      </div>
      <article class="doc">
        <header><FileText /> <b>{{ picked }}</b></header>
        <div class="text">
          <template v-for="(l, i) in lines" :key="i">
            <hr v-if="l.kind === 'rule'" />
            <br v-else-if="l.kind === 'gap'" />
            <p v-else-if="l.kind === 'li'" class="li" :style="{ paddingLeft: `${(l.pad ?? 0) * 6 + 22}px` }"><i>{{ l.mark }}</i>{{ l.text }}</p>
            <p v-else :class="l.kind">{{ l.text }}</p>
          </template>
        </div>
      </article>
    </div>
  </PanelFrame>
</template>

<style scoped>
.split { flex: 1; min-height: 0; display: grid; grid-template-columns: 280px 1fr; gap: 16px; }
.side { min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.segments { display: flex; border: 2px solid var(--border); background: var(--bg); align-self: flex-start; }
.segments button { border: 0; background: none; padding: 6px 12px; font: 700 11px var(--font); color: var(--text-secondary); }
.segments button.on { background: var(--accent); color: var(--on-accent); }
.list { flex: 1; margin: 0; padding: 0; list-style: none; overflow: auto; background: var(--bg); border: 2px solid var(--border); }
.list li { position: relative; padding: 9px 12px; border-bottom: 2px solid var(--surface); border-left: 4px solid transparent; cursor: pointer; }
.list li.on { background: var(--surface-2); border-left-color: var(--accent); }
.list li.on b { color: var(--accent); }
.list b { display: block; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 70px; }
.list small { display: block; margin-top: 2px; font-size: 10px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list .chip { position: absolute; right: 8px; top: 8px; text-transform: uppercase; font-size: 9px; padding: 1px 5px; }
.chip.nuevo { color: var(--st-idle); }
.chip.cambiado { color: var(--accent); }
.doc { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--bg); border: 2px solid var(--border); }
.doc header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; background: var(--surface-2); border-bottom: 2px solid var(--border); }
.doc header svg { width: 14px; height: 14px; color: var(--accent); }
.text { flex: 1; overflow: auto; padding: 16px 20px; font-size: 12px; line-height: 1.7; }
.text p { margin: 0; white-space: pre-wrap; word-break: break-word; }
.text .h1 { font: 700 20px/1.4 var(--font-pixel); color: var(--accent); margin: 6px 0 8px; }
.text .h2 { font: 700 16px/1.4 var(--font-pixel); color: var(--text-primary); margin: 14px 0 6px; padding-bottom: 4px; border-bottom: 2px solid var(--surface-2); }
.text .h3, .text .h4 { font-weight: 700; color: var(--st-work); margin: 10px 0 4px; }
.text .li { position: relative; }
.text .li i { position: absolute; margin-left: -18px; color: var(--accent); font-style: normal; font-weight: 700; }
.text hr { border: 0; border-top: 2px solid var(--surface-2); margin: 10px 0; }
</style>

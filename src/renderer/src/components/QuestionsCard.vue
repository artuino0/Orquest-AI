<script setup lang="ts">
/**
 * Lo que el jefe le preguntó al usuario y sigue sin respuesta. Mientras haya
 * alguna, el trabajo depende de él: se quedan a la vista, con las respuestas
 * que sugiere el jefe y un campo para contestar otra cosa. Las reglas (qué es
 * una pregunta válida, cuándo se cierra) viven en el tablero.
 */
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { CircleHelp, Send, Star } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import { ago } from '../format'
import type { Question } from '../../../core/board'

const studio = useStudio()
const open = computed(() => (studio.board?.questions ?? []).filter((q) => q.status === 'open'))
const drafts = reactive<Record<string, string>>({})
/** La que se está mandando: sus botones se apagan para no contestar dos veces. */
const sending = ref('')
const now = ref(Date.now())
const timer = setInterval(() => (now.value = Date.now()), 30000)
onBeforeUnmount(() => clearInterval(timer))

async function answer(q: Question, text: string | undefined) {
  const t = (text ?? '').trim()
  if (!t || sending.value) return
  sending.value = q.id
  const ok = await studio.answerQuestion(q.id, t)
  sending.value = ''
  if (ok) delete drafts[q.id]
}
</script>

<template>
  <section v-if="open.length" class="asks">
    <header>
      <CircleHelp />
      <b>El jefe espera por ti</b>
      <span>{{ open.length }} {{ open.length === 1 ? 'pregunta sin contestar' : 'preguntas sin contestar' }}</span>
    </header>
    <div class="list">
      <article v-for="q in open" :key="q.id" :class="{ busy: sending === q.id }">
        <p class="q"><b>{{ q.id }}</b>{{ q.text }}</p>
        <p class="meta">
          <template v-if="q.blocks">Detiene: {{ q.blocks }} · </template>
          <template v-if="q.tasks.length">espera{{ q.tasks.length === 1 ? '' : 'n' }} {{ q.tasks.join(', ') }} · </template>
          preguntó {{ ago(q.askedAt, now) }}
        </p>
        <div v-if="q.options.length" class="opts">
          <button v-for="o in q.options" :key="o" type="button" class="btn" :class="{ rec: o === q.recommended }" :disabled="!!sending" :title="o === q.recommended ? 'La que recomienda el jefe' : ''" @click="answer(q, o)">
            <Star v-if="o === q.recommended" />{{ o }}
          </button>
        </div>
        <form @submit.prevent="answer(q, drafts[q.id])">
          <input v-model="drafts[q.id]" :placeholder="q.options.length ? 'Otra respuesta…' : 'Tu respuesta…'" :disabled="!!sending" />
          <button type="submit" class="btn" :disabled="!!sending || !drafts[q.id]?.trim()"><Send /> Contestar</button>
        </form>
      </article>
    </div>
  </section>
</template>

<style scoped>
.asks { flex: none; display: flex; flex-direction: column; max-height: 46%; background: var(--tint-warn); border: 2px solid var(--accent); }
header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 12px; color: var(--accent); border-bottom: 2px solid var(--border); }
header svg { width: 16px; height: 16px; }
header span { margin-left: auto; font-size: 11px; color: var(--text-secondary); }
.list { display: flex; flex-direction: column; overflow: auto; }
article { display: flex; flex-direction: column; gap: 6px; padding: 10px; }
article + article { border-top: 2px solid var(--border); }
article.busy { opacity: .6; }
.q { margin: 0; font-size: 13px; line-height: 1.45; }
.q b { margin-right: 8px; padding: 0 5px; font-size: 11px; color: var(--on-accent); background: var(--accent); }
.meta { margin: 0; font-size: 10px; color: var(--text-secondary); }
.opts { display: flex; flex-wrap: wrap; gap: 6px; }
.opts .btn { font-size: 12px; text-align: left; }
.opts .btn.rec { border-color: var(--accent); color: var(--accent); }
.opts svg { width: 12px; height: 12px; }
form { display: flex; gap: 6px; }
form input { flex: 1; min-width: 0; }
</style>

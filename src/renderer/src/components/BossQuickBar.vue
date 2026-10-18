<script setup lang="ts">
/**
 * Hablarle al jefe sin buscar su panel: una caja abajo al centro del lienzo.
 * Al enviar, te lleva a su panel para ver qué contesta. Comparte borrador y la
 * mano de detener con su chat (`bossSay.ts`).
 */
import { computed } from 'vue'
import { Crown, Hand, Loader2, Send } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import { useBossSay } from '../bossSay'
import { useCanvas } from '../stores/canvas'
import { useStudio } from '../stores/studio'

const studio = useStudio()
const canvas = useCanvas()
const { message, canStop, stopping, send, stop } = useBossSay()
const boss = computed(() => studio.employees.find((e) => e.id === 'jefe'))
const working = computed(() => !!boss.value && studio.calmStateOf(boss.value) === 'working')
const doing = computed(() => (working.value ? studio.doing.jefe : undefined))

async function submit() {
  if (await send()) canvas.open('boss')
}
</script>

<template>
  <form class="quick" @submit.prevent="submit">
    <span class="who" :class="{ working }" :title="doing ? `${doing.label}… ${doing.detail ?? ''}` : studio.nameOf('jefe')">
      <Loader2 v-if="working" class="spin" /><Crown v-else />
    </span>
    <input v-model="message" :placeholder="doing ? T`${studio.nameOf('jefe')}: ${doing.label}… escribe y le llega al terminar` : T`Háblale a ${studio.nameOf('jefe')}…`" />
    <button v-if="canStop" type="button" class="stop" :disabled="stopping" :aria-label="T`Detener`" :title="T`Lo detiene (Esc en su terminal), por si le pediste algo por error. Si recién lo enviaste, tu mensaje vuelve aquí para corregirlo.`" @click="stop"><Hand /></button>
    <button type="submit" class="send" :disabled="!message.trim()" :title="T`Enviar y ver su panel`"><Send /></button>
  </form>
</template>

<style scoped>
.quick { display: flex; align-items: center; gap: 6px; width: min(560px, calc(100vw - 640px)); min-width: 300px; padding: 4px; background: var(--surface); border: 3px solid var(--border); box-shadow: 3px 3px 0 var(--shadow); }
.quick:focus-within { border-color: var(--accent); }
.who { width: 30px; height: 30px; flex: none; display: grid; place-items: center; color: var(--accent); background: var(--bg); border: 2px solid var(--border); }
.who.working { color: var(--st-work); }
.who svg { width: 16px; height: 16px; }
input { flex: 1; min-width: 0; height: 30px; padding: 0 8px; font: 12px var(--font); color: var(--text-primary); background: transparent; border: 0; outline: none; }
input::placeholder { color: var(--text-secondary); }
.stop, .send { width: 30px; height: 30px; flex: none; display: grid; place-items: center; padding: 0; border: 2px solid var(--border); cursor: pointer; }
.stop { background: var(--surface-2); color: var(--st-block); }
.stop:hover { background: var(--st-block); color: var(--on-danger); }
.send { background: var(--accent); color: var(--on-accent); }
.send:disabled { opacity: 0.4; cursor: default; }
.stop svg, .send svg { width: 15px; height: 15px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>

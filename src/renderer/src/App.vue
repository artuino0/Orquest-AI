<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useStudio } from './stores/studio'
import './theme'
import HomeScreen from './components/HomeScreen.vue'
import OfficeScreen from './components/OfficeScreen.vue'
import TitleBar from './components/TitleBar.vue'

const studio = useStudio()
onMounted(() => studio.detect())

// Al cerrar la ventana, la app espera a que cada agente deje su corte.
const closing = ref<{ asked: string[]; done: string[] } | null>(null)
window.orquest.onClosing((p) => (closing.value = p))
const closeNow = () => window.orquest.closeNow()
</script>

<template>
  <div class="shell">
    <TitleBar />
    <div class="view">
      <HomeScreen v-if="studio.screen === 'home'" />
      <OfficeScreen v-else />
    </div>
  </div>
  <div v-if="closing" class="closing">
    <section class="panel">
      <h1 class="title-pixel">Cerrando Orquest</h1>
      <p v-if="closing.asked.length">
        Cada agente está dejando su corte para retomar después.
        <b>{{ closing.done.length }} de {{ closing.asked.length }}</b> listos.
      </p>
      <p v-else>Nadie está trabajando. Cerrando…</p>
      <ul>
        <li v-for="n in closing.asked" :key="n" :class="{ ok: closing.done.includes(n) }">{{ closing.done.includes(n) ? '✓' : '…' }} {{ n }}</li>
      </ul>
      <button class="btn danger" @click="closeNow">Cerrar ya, sin esperar</button>
    </section>
  </div>
</template>

<style scoped>
.shell { height: 100vh; display: flex; flex-direction: column; background: var(--bg); }
.view { flex: 1; min-height: 0; overflow: auto; }
.closing { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: var(--veil); }
.closing .panel { width: 420px; max-width: calc(100% - 32px); padding: 22px 26px; display: flex; flex-direction: column; gap: 12px; }
.closing p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--text-secondary); }
.closing b { color: var(--text-primary); }
.closing ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary); }
.closing li.ok { color: var(--st-idle); }
.closing .btn { align-self: flex-end; }
</style>

<script setup lang="ts">
import { useStudio } from '../stores/studio'

const studio = useStudio()
const LABEL: Record<string, string> = {
  starting: 'llegando',
  working: 'trabajando',
  blocked: 'bloqueado',
  idle: 'esperando instrucción',
  exited: 'se fue',
}
</script>

<template>
  <section>
    <h2>Oficina</h2>
    <p v-if="!studio.employees.length" class="empty">
      Nadie trabaja aún. Elige un repositorio y contrata al primer empleado.
    </p>
    <div class="floor">
      <button
        v-for="e in studio.employees"
        :key="e.id"
        class="desk"
        :class="[e.state, { active: studio.selected === e.id }]"
        @click="studio.selected = e.id"
      >
        <span class="avatar">{{ e.provider.slice(0, 2).toUpperCase() }}</span>
        <span class="bubble" v-if="e.state === 'blocked'">!</span>
        <strong>{{ e.role }}</strong>
        <small>{{ e.provider }}{{ e.model ? ' · ' + e.model : '' }}</small>
        <span class="state">{{ LABEL[e.state] }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.empty { color: var(--muted); }
.floor { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.desk { position: relative; display: grid; gap: 4px; justify-items: start; padding: 12px; text-align: left; border-width: 3px; }
.desk.active { border-color: var(--accent); }
.avatar { width: 40px; height: 40px; display: grid; place-items: center; background: var(--line); font-weight: bold; image-rendering: pixelated; }
.desk.working .avatar { animation: bob 0.6s steps(2) infinite; }
.bubble { position: absolute; top: 6px; left: 44px; background: var(--blocked); color: #fff; padding: 0 6px; font-weight: bold; animation: blink 1s steps(2) infinite; }
small { color: var(--muted); font-size: 11px; }
.state { font-size: 11px; padding: 1px 6px; color: #111; }
.starting .state { background: var(--starting); }
.working .state { background: var(--working); }
.blocked .state { background: var(--blocked); color: #fff; }
.idle .state { background: var(--idle); }
.exited .state { background: var(--exited); color: #fff; }
@keyframes bob { 50% { transform: translateY(-3px); } }
@keyframes blink { 50% { opacity: 0.3; } }
</style>

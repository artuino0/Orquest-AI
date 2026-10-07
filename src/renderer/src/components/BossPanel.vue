<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStudio } from '../stores/studio'
import type { ProviderId } from '../../../shared/ipc'

/** Contratar al jefe y hablar con él. El jefe es tu único interlocutor. */
const studio = useStudio()
// Solo estos saben conectarse a las herramientas de Orquest.
const CAN_LEAD: ProviderId[] = ['claude', 'codex']
const leaders = computed(() => studio.usable.filter((c) => CAN_LEAD.includes(c.id)))

const provider = ref<ProviderId>(leaders.value[0]?.id ?? 'claude')
const model = ref('')
const effort = ref<'' | 'low' | 'medium' | 'high'>('')
const goal = ref(studio.board?.goal ?? '')
const message = ref('')
const busy = ref(false)

async function hire() {
  busy.value = true
  const ok = await studio.hireBoss({ provider: provider.value, model: model.value || undefined, effort: effort.value || undefined, goal: goal.value })
  busy.value = false
  if (ok) studio.overlay = null
}

async function send() {
  if (!message.value.trim()) return
  if (await studio.sayToBoss(message.value.trim())) message.value = ''
}
</script>

<template>
  <div class="sheet">
    <header>
      <h2>{{ studio.bossOnline ? 'Jefe' : 'Contratar al jefe' }}</h2>
      <button class="x" @click="studio.overlay = null">✕</button>
    </header>

    <template v-if="!studio.bossOnline">
      <p class="note">
        El jefe analiza el proyecto, propone la plantilla, reparte tareas y revisa entregas. Tú apruebas la plantilla y
        cada integración.
      </p>
      <label>Objetivo del proyecto
        <textarea v-model="goal" rows="3" placeholder="Qué quieres construir" />
      </label>
      <div class="row">
        <label>Proveedor
          <select v-model="provider">
            <option v-for="c in leaders" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label>Modelo <input v-model="model" placeholder="por defecto" /></label>
        <label>Esfuerzo
          <select v-model="effort">
            <option value="">por defecto</option>
            <option value="low">bajo</option>
            <option value="medium">medio</option>
            <option value="high">alto</option>
          </select>
        </label>
      </div>
      <p v-if="!leaders.length" class="err">Ninguna CLI instalada puede ser jefe todavía (Claude Code o Codex).</p>
      <p v-if="studio.error" class="err">{{ studio.error }}</p>
      <footer>
        <span />
        <button class="primary" :disabled="!goal.trim() || !leaders.length || busy" @click="hire">
          {{ busy ? 'Contratando…' : 'Contratar al jefe' }}
        </button>
      </footer>
    </template>

    <template v-else>
      <p class="note">Objetivo: {{ studio.board?.goal }}</p>
      <form class="say" @submit.prevent="send">
        <input v-model="message" placeholder="Dile algo al jefe…" />
        <button type="submit" class="primary">Enviar</button>
      </form>
      <p v-if="studio.error" class="err">{{ studio.error }}</p>
      <button @click="studio.select('jefe')">Abrir su terminal</button>
    </template>
  </div>
</template>

<style scoped>
.sheet { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); width: min(620px, calc(100% - 32px)); background: var(--panel); border: 3px solid var(--line); box-shadow: 6px 6px 0 #000; padding: 16px; display: grid; gap: 12px; }
header, footer { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; }
.note { margin: 0; color: var(--muted); font-size: 12px; }
label { display: grid; gap: 2px; font-size: 12px; color: var(--muted); }
textarea { font: inherit; color: var(--text); background: var(--bg); border: 2px solid var(--line); padding: 6px; resize: vertical; }
.row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.say { display: flex; gap: 6px; }
.say input { flex: 1; }
.x { padding: 0 6px; }
.err { color: var(--blocked); font-size: 12px; margin: 0; }
.primary { background: var(--accent); color: #1b1a24; border-color: #000; font-weight: bold; }
</style>

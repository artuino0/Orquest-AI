<script setup lang="ts">
import { ref, watch } from 'vue'
import { useStudio } from '../stores/studio'
import type { CliStatus } from '../../../shared/ipc'

const studio = useStudio()
const ROLES = ['desarrollo', 'backend', 'frontend', 'dba', 'infra', 'qa']

const provider = ref<CliStatus['id'] | ''>('')
const role = ref('backend')
const model = ref('')
const effort = ref<'' | 'low' | 'medium' | 'high'>('')
const busy = ref(false)

watch(
  () => studio.usable,
  (u) => {
    if (!provider.value && u.length) provider.value = u[0].id
  },
)

async function submit() {
  if (!provider.value) return
  busy.value = true
  await studio.hire({
    provider: provider.value,
    role: role.value,
    model: model.value || undefined,
    effort: effort.value || undefined,
  })
  busy.value = false
}
</script>

<template>
  <section>
    <h2>Contratar</h2>
    <button class="repo" @click="studio.pickRepo()">{{ studio.repo ?? 'Elegir repositorio…' }}</button>
    <form @submit.prevent="submit">
      <label>Puesto
        <select v-model="role"><option v-for="r in ROLES" :key="r">{{ r }}</option></select>
      </label>
      <label>Proveedor
        <select v-model="provider">
          <option v-for="c in studio.usable" :key="c.id" :value="c.id">{{ c.name }}</option>
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
      <button type="submit" :disabled="!studio.canHire || !provider || busy">Contratar</button>
    </form>
    <p v-if="studio.error" class="err">{{ studio.error }}</p>
  </section>
</template>

<style scoped>
form { display: grid; gap: 8px; margin-top: 8px; }
label { display: grid; gap: 2px; font-size: 12px; color: var(--muted); }
.repo { width: 100%; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.err { color: var(--blocked); font-size: 12px; }
</style>

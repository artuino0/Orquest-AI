<script setup lang="ts">
/**
 * Marco de los paneles que se abren sobre la oficina (Jefe, Plantilla,
 * Tablero, Entregas, Expedientes): velo sobre el mapa, título en píxel,
 * subtítulo y "Volver a la oficina".
 */
import { X } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'

defineProps<{ title: string; subtitle?: string; narrow?: boolean }>()
const studio = useStudio()
</script>

<template>
  <div class="veil" @click.self="studio.overlay = null">
    <section class="panel frame" :class="{ narrow }">
      <header>
        <div class="titles">
          <h1 class="title-pixel">{{ title }}</h1>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <slot name="actions" />
        <button class="btn" @click="studio.overlay = null"><X /> Volver a la oficina</button>
      </header>
      <div class="body"><slot /></div>
      <footer v-if="$slots.footer"><slot name="footer" /></footer>
    </section>
  </div>
</template>

<style scoped>
.veil { position: absolute; inset: 0; background: var(--veil); display: flex; justify-content: center; padding: 16px; z-index: 5; }
.frame { flex: 1; max-width: 1248px; min-height: 0; display: flex; flex-direction: column; }
.frame.narrow { flex: none; width: 744px; max-width: 100%; align-self: center; height: min(624px, 100%); }
header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--surface-2); border-bottom: 3px solid var(--border); }
.titles { flex: 1; min-width: 0; }
.title-pixel { color: var(--accent); }
.titles p { margin: 2px 0 0; font-size: 11px; color: var(--text-secondary); }
.body { flex: 1; min-height: 0; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
footer { display: flex; align-items: center; gap: 10px; padding: 12px 16px; }
</style>

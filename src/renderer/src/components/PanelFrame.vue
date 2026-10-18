<script setup lang="ts">
/**
 * Marco de los paneles (Jefe, Plantilla, Tablero, Entregas, Expedientes…).
 * Dentro del lienzo es solo su contenido: el título y el subtítulo van al
 * encabezado del panel que lo lleva. Fuera de él (vista de demostración),
 * velo sobre la oficina, título en píxel y "Volver a la oficina".
 */
import { inject, onBeforeUnmount, watchEffect } from 'vue'
import { X } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import { IN_CANVAS } from '../canvas/inject'
import { useStudio } from '../stores/studio'

const props = defineProps<{ title: string; subtitle?: string; narrow?: boolean }>()
const studio = useStudio()
const panel = inject(IN_CANVAS, null)
if (panel) {
  watchEffect(() => {
    panel.head.title = props.title
    panel.head.subtitle = props.subtitle
  })
  onBeforeUnmount(() => {
    panel.head.title = undefined
    panel.head.subtitle = undefined
  })
}
</script>

<template>
  <div v-if="panel" class="inpanel">
    <div v-if="$slots.actions" class="tools"><slot name="actions" /></div>
    <div class="body"><slot /></div>
    <footer v-if="$slots.footer"><slot name="footer" /></footer>
  </div>
  <div v-else class="veil" @click.self="studio.overlay = null">
    <section class="panel frame" :class="{ narrow }">
      <header>
        <div class="titles">
          <h1 class="title-pixel">{{ title }}</h1>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <slot name="actions" />
        <button class="btn" @click="studio.overlay = null"><X /> {{ T`Volver a la oficina` }}</button>
      </header>
      <div class="body"><slot /></div>
      <footer v-if="$slots.footer"><slot name="footer" /></footer>
    </section>
  </div>
</template>

<style scoped>
.inpanel { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.tools { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; padding: 8px 12px; border-bottom: 3px solid var(--border); background: var(--surface); }
.veil { position: absolute; inset: 0; background: var(--veil); display: flex; justify-content: center; padding: 16px; z-index: 5; }
.frame { flex: 1; max-width: 1248px; min-height: 0; display: flex; flex-direction: column; }
.frame.narrow { flex: none; width: 744px; max-width: 100%; align-self: center; height: min(700px, 100%); }
header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--surface-2); border-bottom: 3px solid var(--border); }
.titles { flex: 1; min-width: 0; }
.title-pixel { color: var(--accent); }
.titles p { margin: 2px 0 0; font-size: 11px; color: var(--text-secondary); }
.body { flex: 1; min-height: 0; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
footer { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-top: 3px solid var(--border); }
</style>

<script setup lang="ts">
/**
 * El fondo del lienzo: liso con el color del tema o una escena en píxel (o una
 * imagen tuya), atenuado para que los paneles se lean, y las guías: una
 * cuadrícula de puntos que se mueve con la cámara.
 */
import { computed, ref, watch } from 'vue'
import { backdropUrl } from '../canvas/backdrops'
import { GRID } from '../canvas/layout'
import { useCanvas } from '../stores/canvas'

const canvas = useCanvas()
const url = ref<string | null>(null)
watch(
  () => [canvas.backdrop.kind, canvas.image] as const,
  async ([kind, image]) => {
    url.value = kind === 'image' ? image : ((await backdropUrl(kind)) ?? null)
  },
  { immediate: true },
)
const scene = computed(() => (canvas.backdrop.kind !== 'plain' && url.value ? { backgroundImage: `url("${url.value}")` } : null))
/** Un punto cada 4 casillas; con zoom chico, más separados para que no se vuelvan ruido. */
const guides = computed(() => {
  const { x, y, zoom } = canvas.camera
  const step = GRID * 4 * zoom * (zoom < 0.5 ? 2 : 1)
  return { backgroundSize: `${step}px ${step}px`, backgroundPosition: `${x}px ${y}px` }
})
</script>

<template>
  <div class="backdrop">
    <div v-if="scene" class="scene" :class="{ photo: canvas.backdrop.kind === 'image' }" :style="scene" />
    <div v-if="scene" class="dim" :style="{ opacity: canvas.backdrop.dim }" />
    <div v-if="canvas.backdrop.guides" class="guides" :class="{ over: !!scene }" :style="guides" />
  </div>
</template>

<style scoped>
.backdrop { position: absolute; inset: 0; background: var(--bg); pointer-events: none; }
.scene { position: absolute; inset: 0; background-size: cover; background-position: center bottom; image-rendering: pixelated; }
.scene.photo { image-rendering: auto; }
.dim { position: absolute; inset: 0; background: var(--bg); }
.guides { position: absolute; inset: 0; background-image: radial-gradient(circle, var(--border-light) 1.4px, transparent 1.6px); opacity: 0.55; }
.guides.over { background-image: radial-gradient(circle, rgb(255 255 255 / 0.35) 1.4px, transparent 1.6px); opacity: 0.6; }
</style>

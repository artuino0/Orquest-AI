<script setup lang="ts">
/**
 * «Su versión»: lo que un empleado levantó para revisión, visto dentro del
 * lienzo, junto a su panel. Con botón para abrirla en el navegador de siempre.
 * La página no puede mover la ventana de Orquest ni abrir otras (sandbox).
 */
import { computed, ref, watch } from 'vue'
import { ExternalLink, Globe, Loader2, MonitorPlay, RotateCw } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import { useStudio } from '../stores/studio'

const props = defineProps<{ id: string }>()
const studio = useStudio()
const review = computed(() => studio.board?.reviews?.find((r) => r.employeeId === props.id))
const urls = computed(() => (review.value?.status === 'ready' ? review.value.urls : []))
const url = ref<string | null>(null)
watch(urls, (list) => {
  if (!url.value || !list.includes(url.value)) url.value = list[0] ?? null
}, { immediate: true })
/** Volver a cargar: cambia la llave del marco. */
const reload = ref(0)
/** Solo páginas de esta máquina o https: lo mismo que la app deja abrir. */
const allowed = (u: string) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u)
const open = (u: string) => window.orquest.openExternal(u)
</script>

<template>
  <div class="version">
    <div class="bar">
      <div class="address" :title="url ?? ''"><Globe />{{ url ?? T`sin dirección` }}</div>
      <select v-if="urls.length > 1" v-model="url" :title="T`Levantó varias direcciones`">
        <option v-for="u in urls" :key="u" :value="u">{{ u }}</option>
      </select>
      <button class="btn icon" :disabled="!url" :title="T`Volver a cargar`" @click="reload++"><RotateCw /></button>
      <button class="btn icon" :disabled="!url" :title="T`Abrir en el navegador`" @click="url && open(url)"><ExternalLink /></button>
      <button v-if="review" class="btn" :title="review.stop ? T`Le pide apagarla: ${review.stop}` : T`Le pide apagar lo que levantó`" @click="studio.stopReview(id)">{{ review.status === 'ready' ? T`Ya la vi, apágala` : T`Cancelar` }}</button>
    </div>
    <iframe v-if="url && allowed(url)" :key="`${url}:${reload}`" :src="url" :title="T`Su versión`" sandbox="allow-scripts allow-same-origin allow-forms allow-modals" />
    <div v-else class="empty">
      <template v-if="review?.status === 'requested'"><Loader2 class="spin" /><p>{{ T`Levantando su versión… avisa cuando esté arriba.` }}</p></template>
      <template v-else-if="url">
        <p>{{ T`Esa dirección no es de esta máquina: ábrela en tu navegador.` }}</p>
        <button class="btn" @click="open(url)"><ExternalLink /> {{ T`Abrir en el navegador` }}</button>
      </template>
      <template v-else>
        <MonitorPlay />
        <p>{{ T`${studio.nameOf(id)} no tiene una versión levantada.` }}</p>
        <button class="btn primary" @click="studio.requestReview(id)"><MonitorPlay /> {{ T`Ver su versión` }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.version { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.bar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 3px solid var(--border); }
.address { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 5px 8px; font-size: 12px; color: var(--text-secondary); background: var(--bg); border: 2px solid var(--border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.address svg { width: 13px; height: 13px; flex: none; }
select { max-width: 160px; font: 12px var(--font); padding: 4px; background: var(--bg); color: var(--text-primary); border: 2px solid var(--border); }
.btn { padding: 4px 10px; }
.btn.icon { padding: 4px 6px; }
.btn svg { width: 14px; height: 14px; }
iframe { flex: 1; min-height: 0; width: 100%; border: 0; background: #fff; }
.empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; text-align: center; color: var(--text-secondary); font-size: 12px; }
.empty > svg { width: 28px; height: 28px; color: var(--accent); }
.empty p { margin: 0; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>

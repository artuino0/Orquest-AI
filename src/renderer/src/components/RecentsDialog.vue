<script setup lang="ts">
/**
 * Todos los proyectos recientes (Inicio enseña los últimos cinco): se abren de
 * aquí o se quitan de la lista. Quitar no toca la carpeta.
 */
import { onBeforeUnmount } from 'vue'
import { FolderGit2, X } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import { ago } from '../format'
import { useStudio } from '../stores/studio'

defineProps<{ locked: boolean }>()
const emit = defineEmits<{ close: []; open: [path: string] }>()
const studio = useStudio()
const now = Date.now()
const name = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p
const when = (at: number) => (at ? new Date(at).toLocaleString() : '')
const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && emit('close')
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="veil" @click.self="emit('close')">
    <section class="panel box" role="dialog" :aria-label="T`Proyectos recientes`">
      <header>
        <h2 class="title-pixel">{{ T`Proyectos recientes` }}</h2>
        <span class="count">{{ studio.recents.length }}</span>
        <span class="grow" />
        <button class="btn" @click="emit('close')"><X />{{ T`Cerrar` }}</button>
      </header>
      <ul>
        <li v-for="r in studio.recents" :key="r.path">
          <button class="open" :disabled="locked" @click="emit('open', r.path)">
            <FolderGit2 />
            <span class="data"><strong>{{ name(r.path) }}</strong><small>{{ r.path }}</small></span>
            <span class="at" :title="when(r.at)">{{ r.at ? T`abierto ${ago(r.at, now)}` : '' }}</span>
          </button>
          <button class="forget" :title="T`Quitar de la lista (la carpeta no se toca)`" @click="studio.removeRecent(r.path)"><X /></button>
        </li>
        <li v-if="!studio.recents.length" class="empty">{{ T`Aún no abres ningún proyecto.` }}</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: var(--veil); }
.box { width: 600px; max-width: 100%; display: flex; flex-direction: column; gap: 12px; padding: 18px 20px; }
header { display: flex; align-items: center; gap: 10px; }
h2 { margin: 0; font-size: 18px; }
.count { padding: 0 6px; font: 700 11px/18px var(--font); background: var(--bg); border: 2px solid var(--border); }
.grow { flex: 1; }
/* Siete a la vista; el resto, recorriendo la lista. */
ul { list-style: none; margin: 0; padding: 0; max-height: calc(7 * 58px); overflow-y: auto; border-top: 2px solid var(--border-light); }
li { display: flex; align-items: stretch; border-bottom: 2px solid var(--border-light); }
.open { flex: 1; min-width: 0; height: 56px; display: flex; align-items: center; gap: 12px; padding: 0 12px; background: none; border: 0; color: inherit; text-align: left; cursor: pointer; }
.open:hover:not(:disabled) { background: var(--surface-2); }
.open > svg { width: 18px; height: 18px; flex: none; color: var(--accent); }
.data { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.data strong, .data small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.data small { font-size: 10px; color: var(--text-secondary); }
.at { flex: none; font-size: 11px; color: var(--text-secondary); }
.forget { flex: none; width: 40px; display: grid; place-items: center; background: none; border: 0; color: var(--text-secondary); cursor: pointer; }
.forget svg { width: 14px; height: 14px; }
.forget:hover { color: var(--on-danger); background: var(--st-block); }
.empty { padding: 16px 12px; font-size: 12px; color: var(--text-secondary); border: 0; }
</style>

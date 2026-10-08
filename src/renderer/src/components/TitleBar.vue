<script setup lang="ts">
/**
 * Encabezado de la ventana, en píxel: la app no usa el marco ni el menú del
 * sistema. Se arrastra de aquí; los tres botones hacen lo de siempre.
 */
import { computed, ref } from 'vue'
import { useStudio } from '../stores/studio'

const studio = useStudio()
const project = computed(() => (studio.screen === 'office' ? studio.repo?.split(/[\\/]/).filter(Boolean).pop() : null))
const maximized = ref(false)
window.orquest.onWindowState((s) => (maximized.value = s.maximized))
const control = (action: 'minimize' | 'maximize' | 'close') => window.orquest.windowControl(action)
</script>

<template>
  <header class="titlebar">
    <span class="mark" />
    <b class="app">Orquest AI</b>
    <template v-if="project"><i class="sep" /><span class="project">{{ project }}</span></template>
    <span class="grow" />
    <button title="Minimizar" @click="control('minimize')">
      <svg viewBox="0 0 10 10" shape-rendering="crispEdges"><rect x="1" y="7" width="8" height="2" /></svg>
    </button>
    <button :title="maximized ? 'Restaurar' : 'Maximizar'" @click="control('maximize')">
      <svg v-if="!maximized" viewBox="0 0 10 10" shape-rendering="crispEdges"><path d="M1 1h8v8h-8z M2 3v5h6v-5z" fill-rule="evenodd" /></svg>
      <svg v-else viewBox="0 0 10 10" shape-rendering="crispEdges"><path d="M3 1h6v6h-2v-1h1v-3h-4v-1h-1z M1 3h6v6h-6z M2 5v3h4v-3z" fill-rule="evenodd" /></svg>
    </button>
    <button class="close" title="Cerrar" @click="control('close')">
      <svg viewBox="0 0 10 10" shape-rendering="crispEdges">
        <path d="M1 1h2v2h-2z M3 3h2v2h-2z M5 5h2v2h-2z M7 7h2v2h-2z M7 1h2v2h-2z M5 3h2v2h-2z M3 5h2v2h-2z M1 7h2v2h-2z" />
      </svg>
    </button>
  </header>
</template>

<style scoped>
.titlebar { height: 32px; flex: none; display: flex; align-items: center; gap: 8px; padding-left: 10px; background: var(--border); color: var(--text-secondary); -webkit-app-region: drag; user-select: none; border-bottom: 2px solid var(--border); }
:root[data-theme='light'] .titlebar { color: #cdd9e2; }
.mark { width: 10px; height: 10px; background: var(--accent); box-shadow: 2px 2px 0 #00000080; }
.app { font: 700 14px var(--font-pixel); color: var(--accent); letter-spacing: 0.5px; }
.sep { width: 2px; height: 12px; background: currentColor; opacity: 0.4; }
.project { font: 700 13px var(--font-pixel); color: #f4eadb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grow { flex: 1; }
button { -webkit-app-region: no-drag; width: 40px; height: 100%; display: grid; place-items: center; padding: 0; border: 0; border-left: 2px solid #ffffff14; background: none; color: #f4eadb; }
button svg { width: 12px; height: 12px; fill: currentColor; image-rendering: pixelated; }
button:hover { background: #ffffff1f; border-color: #ffffff14; }
button.close:hover { background: var(--st-block); color: #fff; }
</style>

<script setup lang="ts">
/** El panel Editor del lienzo: el explorador del proyecto a la izquierda y sus archivos abiertos a la derecha. */
import { T } from '../../../core/i18n'
import { useIde } from '../stores/ide'
import ProjectEditor from './ProjectEditor.vue'
import ProjectFiles from './ProjectFiles.vue'

const ide = useIde()
</script>

<template>
  <div class="editor-panel">
    <ProjectFiles class="tree" />
    <div class="right">
      <ProjectEditor v-if="ide.tabs.length" />
      <p v-else class="empty">{{ T`Elige un archivo en el explorador para abrirlo.` }}</p>
    </div>
  </div>
</template>

<style scoped>
.editor-panel { flex: 1; min-height: 0; display: flex; }
.tree { width: 240px; flex: none; }
.right { flex: 1; min-width: 0; position: relative; background: var(--term-bg); }
.empty { margin: 0; padding: 24px; font-size: 12px; color: var(--text-secondary); }
</style>

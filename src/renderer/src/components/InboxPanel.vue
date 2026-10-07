<script setup lang="ts">
import { useStudio } from '../stores/studio'
const studio = useStudio()
</script>

<template>
  <div class="sheet">
    <header>
      <h2>Bandeja de entregas</h2>
      <button class="x" @click="studio.overlay = null">✕</button>
    </header>
    <p class="muted">
      Aquí llega lo que te traen para aprobar: diff, capturas y reporte de QA. Al terminar, el empleado camina a la
      oficina del jefe con su entrega.
    </p>
    <p class="muted small">Las entregas llegan con el jefe (fase 2).</p>
  </div>
</template>

<style scoped>
.sheet { position: absolute; top: 64px; right: 12px; width: min(420px, calc(100% - 24px)); background: var(--panel); border: 3px solid var(--line); box-shadow: 6px 6px 0 #000; padding: 16px; }
header { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; }
.muted { color: var(--muted); font-size: 13px; }
.small { font-size: 11px; }
.x { padding: 0 6px; }
</style>

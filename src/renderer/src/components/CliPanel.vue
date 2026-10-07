<script setup lang="ts">
import { useStudio } from '../stores/studio'
const studio = useStudio()
</script>

<template>
  <section>
    <h2>CLIs <button class="mini" @click="studio.detect()">↻</button></h2>
    <ul>
      <li v-for="c in studio.clis" :key="c.id" :class="{ off: !c.installed }">
        <span class="dot" :class="c.installed ? (c.session === false ? 'nosession' : 'ok') : 'missing'" />
        {{ c.name }}
        <small v-if="!c.installed">no instalada</small>
        <small v-else-if="c.session === false">sin sesión</small>
        <small v-else>{{ c.version }}</small>
      </li>
    </ul>
    <p v-if="studio.clis.length && !studio.usable.length" class="warn">
      Instala e inicia sesión en al menos una CLI para poder contratar.
    </p>
  </section>
</template>

<style scoped>
ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; }
li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
li.off { color: var(--muted); }
small { margin-left: auto; color: var(--muted); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 8px; height: 8px; }
.ok { background: var(--idle); }
.nosession { background: var(--accent); }
.missing { background: var(--exited); }
.mini { padding: 0 6px; font-size: 11px; float: right; }
.warn { color: var(--blocked); font-size: 12px; }
</style>

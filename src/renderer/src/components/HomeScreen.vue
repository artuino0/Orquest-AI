<script setup lang="ts">
import { useStudio } from '../stores/studio'

const studio = useStudio()
const name = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p
</script>

<template>
  <div class="home">
    <header>
      <h1>Orquest AI</h1>
      <p>Tu estudio de agentes de código.</p>
    </header>

    <div class="cols">
      <section class="card">
        <h2>Proyectos recientes</h2>
        <ul v-if="studio.recents.length" class="recents">
          <li v-for="r in studio.recents" :key="r">
            <button class="project" :disabled="!studio.usable.length" @click="studio.openProject(r)">
              <strong>{{ name(r) }}</strong>
              <small>{{ r }}</small>
            </button>
          </li>
        </ul>
        <p v-else class="muted">Aún no abres ningún proyecto.</p>
        <button class="primary" :disabled="!studio.usable.length" @click="studio.pickProject()">
          Abrir repositorio…
        </button>
      </section>

      <section class="card">
        <h2>
          Agentes en esta máquina
          <button class="mini" :disabled="studio.detecting" @click="studio.detect()">revisar</button>
        </h2>
        <ul class="clis">
          <li v-for="c in studio.clis" :key="c.id">
            <span class="led" :class="!c.installed ? 'off' : c.session === false ? 'warn' : 'ok'" />
            <span>{{ c.name }}</span>
            <small v-if="!c.installed">no instalada</small>
            <small v-else-if="c.session === false">sin sesión</small>
            <small v-else>{{ c.version ?? 'lista' }}</small>
          </li>
        </ul>
        <p v-if="studio.clis.length && !studio.usable.length" class="blocker">
          Instala e inicia sesión en al menos una CLI para poder contratar.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.home { min-height: 100vh; padding: 48px 24px; display: grid; align-content: start; justify-items: center; gap: 32px; }
header { text-align: center; }
h1 { color: var(--accent); font-size: 32px; margin: 0; letter-spacing: 2px; text-shadow: 3px 3px 0 #000; }
header p { color: var(--muted); margin: 4px 0 0; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; width: min(860px, 100%); }
.card { background: var(--panel); border: 3px solid var(--line); box-shadow: 4px 4px 0 #000; padding: 16px; display: grid; gap: 12px; align-content: start; }
h2 { display: flex; justify-content: space-between; align-items: center; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.project { width: 100%; display: grid; text-align: left; gap: 2px; }
.project small, .clis small, .muted { color: var(--muted); font-size: 11px; }
.project small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clis li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.clis small { margin-left: auto; }
.led { width: 8px; height: 8px; }
.led.ok { background: var(--idle); }
.led.warn { background: var(--accent); }
.led.off { background: var(--exited); }
.primary { background: var(--accent); color: #1b1a24; border-color: #000; font-weight: bold; }
.mini { font-size: 11px; padding: 0 6px; }
.blocker { color: var(--blocked); font-size: 12px; margin: 0; }
</style>

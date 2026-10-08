<script setup lang="ts">
/** Qué hacer con cada CLI que no está lista: el comando para instalarla o iniciar sesión y su página. */
import { ExternalLink, X } from 'lucide-vue-next'
import type { CliStatus } from '../../../shared/ipc'

defineProps<{ clis: CliStatus[] }>()
const emit = defineEmits<{ close: [] }>()
const open = (url: string) => window.orquest.openExternal(url)
</script>

<template>
  <div class="veil" @click.self="emit('close')">
    <section class="panel guide">
      <header>
        <h2 class="title-pixel">Guía de instalación</h2>
        <button class="btn" @click="emit('close')"><X />Cerrar</button>
      </header>
      <p class="intro">Instala o inicia sesión desde una terminal y luego usa «Volver a detectar». Orquest no instala nada por ti.</p>
      <article v-for="c in clis" :key="c.id">
        <i class="color" :style="{ background: `var(--pv-${c.id})` }" />
        <div class="body">
          <strong>{{ c.name }}</strong>
          <template v-if="c.installed">
            <small>Instalada, sin sesión.</small>
            <code v-if="c.login && !c.login.startsWith('abre')">{{ c.login }}</code>
            <small v-else-if="c.login">Para iniciarla, {{ c.login }}.</small>
          </template>
          <template v-else>
            <small>No se encontró en el PATH.</small>
            <code v-if="c.install?.command">{{ c.install.command }}</code>
          </template>
        </div>
        <button v-if="c.install" class="btn" @click="open(c.install.url)"><ExternalLink />Página oficial</button>
      </article>
      <p v-if="!clis.length" class="intro">Todas las CLIs conocidas están listas.</p>
    </section>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; background: var(--veil); display: grid; place-items: center; z-index: 50; }
.guide { width: min(680px, calc(100vw - 48px)); max-height: calc(100vh - 80px); overflow: auto; padding: 20px; display: grid; gap: 10px; }
header { display: flex; justify-content: space-between; align-items: center; }
.intro { margin: 0; font-size: 12px; line-height: 1.5; color: var(--text-secondary); }
article { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-top: 2px solid var(--border-light); }
.color { width: 14px; height: 14px; flex: none; border: 2px solid var(--border); }
.body { flex: 1; min-width: 0; display: grid; gap: 4px; }
.body strong { font-size: 13px; }
.body small { font-size: 11px; color: var(--text-secondary); }
code { font: 12px var(--font); background: var(--term-bg); color: var(--text-primary); border: 2px solid var(--border-light); padding: 4px 8px; user-select: all; overflow-x: auto; white-space: nowrap; }
</style>

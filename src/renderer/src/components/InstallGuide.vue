<script setup lang="ts">
/** Qué hacer con cada CLI que no está lista: el comando para instalarla o iniciar sesión y su página. */
import { ExternalLink, Headset, UserPlus, X } from 'lucide-vue-next'
import type { CliStatus } from '../../../shared/ipc'
import { getLang, T } from '../../../core/i18n'

defineProps<{ clis: CliStatus[] }>()
const emit = defineEmits<{ close: [] }>()
const open = (url: string) => window.orquest.openExternal(url)
/** La sección «Apoya el proyecto» de la página web, en el idioma de la app. */
const supportUrl = () => `https://orquest.dydasites.com/${getLang() === 'en' ? 'en/' : ''}#apoyo`
</script>

<template>
  <div class="veil" @click.self="emit('close')">
    <section class="panel guide">
      <header>
        <h2 class="title-pixel">{{ T`Guía de instalación` }}</h2>
        <button class="btn" @click="emit('close')"><X />{{ T`Cerrar` }}</button>
      </header>
      <p class="intro">{{ T`Instala o inicia sesión desde una terminal y luego usa «Volver a detectar». Orquest no instala nada por ti.` }}</p>
      <p class="intro help">
        {{ T`¿Prefieres que te acompañe a instalarlo? Hay asesoría 1 a 1 por videollamada.` }}
        <button class="btn" @click="open(supportUrl())"><Headset />{{ T`Ver la asesoría` }}</button>
      </p>
      <article v-for="c in clis" :key="c.id">
        <i class="color" :style="{ background: `var(--pv-${c.id})` }" />
        <div class="body">
          <strong>{{ c.name }}</strong>
          <template v-if="c.installed">
            <small>{{ T`Instalada, sin sesión.` }}</small>
            <code v-if="c.login && !c.manualLogin">{{ c.login }}</code>
            <small v-else-if="c.login">{{ T`Para iniciarla, ${c.login}.` }}</small>
          </template>
          <template v-else>
            <small>{{ T`No se encontró en el PATH.` }}</small>
            <code v-if="c.install?.command">{{ c.install.command }}</code>
          </template>
        </div>
        <div class="links">
          <button v-if="c.install" class="btn" @click="open(c.install.url)"><ExternalLink />{{ T`Página oficial` }}</button>
          <button v-if="c.signup" class="btn" :title="c.signup.referral ? T`Enlace de referido del autor de Orquest AI` : ''" @click="open(c.signup.url)"><UserPlus />{{ T`Crear cuenta` }}</button>
        </div>
      </article>
      <p v-if="clis.some((c) => c.signup?.referral)" class="intro">{{ T`«Crear cuenta» de ${clis.filter((c) => c.signup?.referral).map((c) => c.name).join(T` y `)} usa el enlace de referido del autor: a ti no te cuesta más y ayuda a sostener Orquest AI.` }}</p>
      <p v-if="!clis.length" class="intro">{{ T`Todas las CLIs conocidas están listas.` }}</p>
    </section>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; background: var(--veil); display: grid; place-items: center; z-index: 50; }
.guide { width: min(680px, calc(100vw - 48px)); max-height: calc(100vh - 80px); overflow: auto; padding: 20px; display: grid; gap: 10px; }
header { display: flex; justify-content: space-between; align-items: center; }
.help { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.intro { margin: 0; font-size: 12px; line-height: 1.5; color: var(--text-secondary); }
article { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-top: 2px solid var(--border-light); }
.color { width: 14px; height: 14px; flex: none; border: 2px solid var(--border); }
.links { display: grid; gap: 6px; flex: none; }
.body { flex: 1; min-width: 0; display: grid; gap: 4px; }
.body strong { font-size: 13px; }
.body small { font-size: 11px; color: var(--text-secondary); }
code { font: 12px var(--font); background: var(--term-bg); color: var(--text-primary); border: 2px solid var(--border-light); padding: 4px 8px; user-select: all; overflow-x: auto; white-space: nowrap; }
</style>

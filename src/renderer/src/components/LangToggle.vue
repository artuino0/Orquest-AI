<script setup lang="ts">
/** Cambia entre español e inglés. Lo elegido se guarda; sin elegir, manda el idioma del sistema. */
import { getLang, T } from '../../../core/i18n'
import { switchLanguage } from '../lang'

const lang = getLang()
</script>

<template>
  <button class="btn lang" :title="T`Cambiar idioma (ahora: español)`" @click="switchLanguage">{{ lang.toUpperCase() }}</button>
</template>

<style scoped>
.lang { padding: 7px 9px; font-weight: 700; }
</style>

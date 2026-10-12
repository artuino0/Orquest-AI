<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import { theme, toggleTheme } from '../theme'
</script>

<template>
  <button class="btn theme" :title="theme === 'dark' ? T`Cambiar a tema claro` : T`Cambiar a tema oscuro`" @click="toggleTheme">
    <Sun v-if="theme === 'dark'" />
    <Moon v-else />
  </button>
</template>

<style scoped>
.theme { padding: 7px 9px; }
</style>

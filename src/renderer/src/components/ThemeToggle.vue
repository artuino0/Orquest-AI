<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { theme, toggleTheme } from '../theme'
</script>

<template>
  <button class="btn theme" :title="theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'" @click="toggleTheme">
    <Sun v-if="theme === 'dark'" />
    <Moon v-else />
  </button>
</template>

<style scoped>
.theme { padding: 7px 9px; }
</style>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useStudio } from './stores/studio'
import './theme'
import HomeScreen from './components/HomeScreen.vue'
import OfficeScreen from './components/OfficeScreen.vue'

const studio = useStudio()
onMounted(() => studio.detect())
</script>

<template>
  <HomeScreen v-if="studio.screen === 'home'" />
  <OfficeScreen v-else />
</template>

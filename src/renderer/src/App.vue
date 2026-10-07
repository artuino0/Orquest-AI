<script setup lang="ts">
import { onMounted } from 'vue'
import { useStudio } from './stores/studio'
import CliPanel from './components/CliPanel.vue'
import HirePanel from './components/HirePanel.vue'
import OfficeFloor from './components/OfficeFloor.vue'
import EmployeeDrawer from './components/EmployeeDrawer.vue'

const studio = useStudio()
onMounted(() => studio.detect())
</script>

<template>
  <div class="layout">
    <aside>
      <h1>Orquest AI</h1>
      <CliPanel />
      <HirePanel />
    </aside>
    <main>
      <OfficeFloor />
    </main>
    <EmployeeDrawer v-if="studio.selected" :id="studio.selected" />
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: 300px 1fr; height: 100vh; }
aside { border-right: 2px solid var(--line); padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; }
h1 { font-size: 18px; margin: 0; color: var(--accent); }
main { overflow: auto; padding: 16px; }
</style>

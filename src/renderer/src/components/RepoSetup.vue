<script setup lang="ts">
/**
 * La carpeta elegida no se puede abrir tal cual: no es un repositorio, o lo es
 * pero sin ningún commit. En vez de mandar al usuario a la terminal, se le dice
 * qué falta y la app lo hace si él quiere. Si lo que tiene son repositorios
 * dentro, se abre como un solo proyecto con todos, o uno solo de ellos.
 */
import { computed, ref } from 'vue'
import { FolderGit2, FolderTree, GitBranch, X } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import { useStudio } from '../stores/studio'

const studio = useStudio()
const issue = computed(() => studio.repoIssue!)
const busy = ref(false)
const name = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p
/** Repositorios de dentro que aún no tienen commits: con uno así la carpeta no se abre como un solo proyecto. */
const empty = computed(() => issue.value.group?.empty ?? [])

async function openGroup() {
  busy.value = true
  await studio.openProject(issue.value.path, true)
  busy.value = false
}

async function prepare() {
  busy.value = true
  await studio.prepareAndOpen()
  busy.value = false
}
</script>

<template>
  <div class="veil" @click.self="studio.repoIssue = null">
    <section class="panel setup">
      <header>
        <h2 class="title-pixel">{{ issue.inside.length ? T`Esta carpeta agrupa repositorios` : issue.state === 'no-commits' ? T`Este repositorio aún no tiene commits` : T`Esta carpeta no es un repositorio` }}</h2>
        <button class="btn" @click="studio.repoIssue = null"><X />{{ T`Cancelar` }}</button>
      </header>
      <code class="path">{{ issue.path }}</code>

      <!-- Carpeta que agrupa repositorios: se abre entera como un solo proyecto (no se le pone git a ella), o uno solo. -->
      <template v-if="issue.inside.length">
        <p>{{ T`Ábrela como un solo proyecto: el jefe trabaja en esta carpeta, cada tarea pertenece a uno de sus repositorios y cada empleado recibe copia solo de los que le tocan. Las entregas se integran en el repositorio de cada tarea; a esta carpeta no se le pone git.` }}</p>
        <p v-if="empty.length" class="err">{{ empty.length === 1 ? T`Todavía no se puede: ${empty[0]} no tiene ningún commit. Haz el primero ahí y vuelve a elegir la carpeta.` : T`Todavía no se puede: ${empty.join(', ')} no tienen ningún commit. Haz el primero en cada uno y vuelve a elegir la carpeta.` }}</p>
        <button class="btn primary whole" :disabled="busy || !!empty.length" @click="openGroup"><FolderTree />{{ issue.inside.length === 1 ? T`Abrir como un solo proyecto (1 repositorio)` : T`Abrir como un solo proyecto (${issue.inside.length} repositorios)` }}</button>
        <p>{{ T`O abre solo uno:` }}</p>
        <div class="list">
          <button v-for="r in issue.inside" :key="r" class="project" @click="studio.openProject(r)"><FolderGit2 /><strong>{{ name(r) }}</strong></button>
        </div>
      </template>

      <template v-else>
        <p>{{ T`Cada empleado trabaja en su propia copia del proyecto y sus entregas se integran a tu rama. Para eso hace falta un repositorio de git con al menos un commit.` }}</p>
        <ul>
          <li v-if="issue.state === 'no-repo'">{{ T`Orquest inicia el repositorio en esta carpeta.` }}</li>
          <li v-if="!issue.gitignore">{{ T`Como no hay .gitignore, crea uno básico para dejar fuera dependencias, compilados y archivos .env.` }}</li>
          <li>{{ T`Guarda un primer commit con lo que hay en la carpeta.` }}</li>
        </ul>
        <p v-if="studio.error" class="err">{{ studio.error }}</p>
        <footer>
          <button class="btn primary" :disabled="busy" @click="prepare"><GitBranch />{{ busy ? T`Preparando…` : issue.state === 'no-repo' ? T`Iniciar repositorio y abrir` : T`Guardar el primer commit y abrir` }}</button>
        </footer>
      </template>
    </section>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; background: var(--veil); display: grid; place-items: center; z-index: 50; }
.setup { width: min(620px, calc(100vw - 48px)); max-height: calc(100vh - 80px); overflow: auto; padding: 20px; display: grid; gap: 12px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.path { font: 12px var(--font); background: var(--term-bg); border: 2px solid var(--border-light); padding: 6px 8px; overflow-wrap: anywhere; }
p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--text-secondary); }
ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 12px; line-height: 1.6; }
.err { color: var(--st-block); }
.list { display: grid; gap: 6px; }
.whole { justify-self: start; }
.project { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--surface-2); border: 2px solid var(--border); color: var(--text-primary); font: 13px var(--font); text-align: left; cursor: pointer; }
.project:hover { border-color: var(--accent); }
.project svg { width: 16px; height: 16px; color: var(--accent); }
footer { display: flex; justify-content: flex-end; }
</style>

/** Tema de la interfaz (oscuro o claro). Se recuerda entre sesiones. */
import { ref } from 'vue'

export type Theme = 'dark' | 'light'
const KEY = 'orquest.theme'

function saved(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export const theme = ref<Theme>(saved())

function apply() {
  document.documentElement.dataset.theme = theme.value
}
apply()

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  apply()
  try {
    localStorage.setItem(KEY, theme.value)
  } catch {
    // Sin almacenamiento el tema solo dura esta sesión.
  }
}

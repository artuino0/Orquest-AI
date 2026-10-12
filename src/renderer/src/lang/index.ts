/**
 * El idioma de la interfaz. Se fija antes de cargar las pantallas (ver
 * `main.ts`): el proceso principal dice cuál toca, que es el que eligió el
 * usuario o, si no ha elegido, el de su sistema. Cambiarlo recarga la ventana.
 */
import { addDictionary, getLang, setLang, type Lang } from '../../../core/i18n'
import en from './en'

export async function startLanguage(): Promise<Lang> {
  addDictionary('en', en)
  const { lang } = await window.orquest.language().catch(() => ({ lang: 'es' as Lang }))
  setLang(lang)
  document.documentElement.lang = lang
  return lang
}

/** Pasa al otro idioma, lo guarda como elección del usuario y vuelve a pintar todo. */
export async function switchLanguage() {
  await window.orquest.setLanguage(getLang() === 'es' ? 'en' : 'es')
  location.reload()
}

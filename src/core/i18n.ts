/**
 * Idiomas. El texto se escribe en español en el código y ese mismo texto es su
 * clave: T`Contratar jefe` o, con valores, T`No existe el empleado ${ref}.`
 * (clave: "No existe el empleado {0}."). Si el idioma activo trae esa clave en
 * su diccionario, sale traducido con los valores en su lugar; si no, sale en
 * español. Así el código se sigue leyendo y lo que falte traducir no rompe nada.
 *
 * El idioma es uno para todo el proceso. T se evalúa al usarse: un texto
 * guardado en una constante al cargar el módulo se queda en el idioma que
 * había en ese momento, así que esos van dentro de una función.
 *
 * Los diccionarios viven en `core/lang` y `renderer/src/lang`;
 * `test/i18n.test.ts` revisa que no falte ninguna clave.
 */
export type Lang = 'es' | 'en'
export const LANGS: readonly Lang[] = ['es', 'en']

let current: Lang = 'es'
const dictionaries: Record<Lang, Record<string, string>> = { es: {}, en: {} }

export const getLang = (): Lang => current
export function setLang(lang: Lang) {
  current = lang
}
export function addDictionary(lang: Lang, entries: Record<string, string>) {
  Object.assign(dictionaries[lang], entries)
}

/** De los idiomas que prefiere el sistema, el primero que la app habla; si ninguno, inglés. */
export function pickLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0]
    if (base === 'es' || base === 'en') return base
  }
  return 'en'
}

const fill = (text: string, values: readonly unknown[]) =>
  values.length ? text.replace(/\{(\d+)\}/g, (hole, i) => (Number(i) < values.length ? String(values[Number(i)]) : hole)) : text

/** La clave de una plantilla: su texto con `{0}`, `{1}`… donde van los valores. */
export const keyOf = (strings: readonly string[]) => strings.reduce((out, s, i) => `${out}{${i - 1}}${s}`)

/** Texto en el idioma activo. Se usa como plantilla etiquetada: T`Hola ${nombre}`. */
export function T(strings: TemplateStringsArray, ...values: unknown[]): string {
  const key = keyOf(strings)
  return fill(dictionaries[current][key] ?? key, values)
}

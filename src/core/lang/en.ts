/**
 * Diccionario en inglés del núcleo: lo que Orquest les dice a los agentes y al
 * usuario desde `src/core` y `src/main`. La clave es el texto en español tal
 * cual está en el código (ver `core/i18n.ts`); los `{0}`, `{1}`… son los
 * valores y van también en la traducción.
 */
import agentes from './en/agentes.js'
import nucleo from './en/nucleo.js'

const en: Record<string, string> = { ...nucleo, ...agentes }

export default en

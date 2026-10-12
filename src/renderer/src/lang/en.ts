/**
 * Diccionario en inglés de la interfaz. La clave es el texto en español tal
 * cual está en el código (ver `core/i18n.ts`); los `{0}`, `{1}`… son los
 * valores y van también en la traducción. Un archivo por grupo de pantallas.
 */
import biblioteca from './en/biblioteca'
import empleado from './en/empleado'
import jefe from './en/jefe'
import oficina from './en/oficina'

const en: Record<string, string> = { ...oficina, ...jefe, ...empleado, ...biblioteca }

export default en

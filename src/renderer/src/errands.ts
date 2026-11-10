/**
 * Cómo se ven las Tareas: etiqueta y color de cada tipo y de cada estado.
 * Los nombres salen al usarse (T), no al cargar el módulo.
 */
import { T } from '../../core/i18n'
import type { Errand, ErrandKind } from '../../shared/ipc'

export const isOpenErrand = (e: Pick<Errand, 'status'>) => e.status === 'working' || e.status === 'ready' || e.status === 'stopped'

/** Etiqueta corta y color (ficha de style.css) de cada tipo, como en el diseño. */
export const KIND_LOOK: Record<ErrandKind, { tag: string; color: string }> = {
  feature: { tag: 'FEATURE', color: 'st-work' },
  fix: { tag: 'FIX', color: 'st-block' },
  hotfix: { tag: 'HOTFIX', color: 'st-block' },
  chore: { tag: 'CHORE', color: 'st-dep' },
}

export const STATUS_LOOK: Record<Errand['status'], { readonly label: string; color: string }> = {
  working: { get label() { return T`Trabajando` }, color: 'st-work' },
  ready: { get label() { return T`Lista para revisar` }, color: 'st-review' },
  stopped: { get label() { return T`Detenida` }, color: 'st-block' },
  merged: { get label() { return T`Integrada` }, color: 'st-idle' },
  discarded: { get label() { return T`Descartada` }, color: 'text-secondary' },
}

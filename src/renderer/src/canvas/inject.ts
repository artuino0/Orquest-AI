/**
 * Lo que un panel del lienzo le pasa a lo que lleva dentro: dónde poner su
 * título (los paneles de antes lo traen en su `PanelFrame`), cómo preguntar si
 * se puede cerrar (un archivo sin guardar) y su ancho, para acomodarse.
 */
import type { InjectionKey, Ref } from 'vue'

export interface PanelContext {
  head: { title?: string; subtitle?: string }
  guard: { canClose?: () => boolean }
  width: Ref<number>
}

export const IN_CANVAS: InjectionKey<PanelContext> = Symbol('lienzo')

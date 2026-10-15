import type { Task } from '../../../shared/ipc'
import { T } from '../../../core/i18n'

export const TASK_STATUS: Record<Task['status'], string> = {
  waiting: T`esperando dependencia`,
  ready: T`lista`,
  in_progress: T`en curso`,
  delivered: T`entregada`,
  in_qa: T`en QA`,
  approved: T`espera tu aprobación`,
  merged: T`integrada`,
  done: T`terminada`,
  discarded: T`descartada`,
}

/** Ficha de color (`--st-<color>`) del estado de una tarea. */
export const TASK_COLOR: Record<Task['status'], string> = {
  waiting: 'dep',
  ready: 'idle',
  in_progress: 'work',
  delivered: 'review',
  in_qa: 'play',
  approved: 'block',
  merged: 'idle',
  done: 'idle',
  discarded: 'dep',
}

export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Qué dijo QA de una tarea, para su etiqueta. */
export function qaOf(t: Task): { text: string; color: string } {
  if (t.status === 'in_qa') return { text: T`En QA`, color: 'play' }
  if (t.qa?.verdict === 'pass') return { text: T`QA aprobó`, color: 'idle' }
  if (t.qa?.verdict === 'fail') return { text: T`QA rechazó`, color: 'block' }
  return { text: T`Sin QA`, color: '' }
}

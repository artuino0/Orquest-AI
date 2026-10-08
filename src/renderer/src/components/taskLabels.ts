import type { Task } from '../../../shared/ipc'

export const TASK_STATUS: Record<Task['status'], string> = {
  waiting: 'esperando dependencia',
  ready: 'lista',
  in_progress: 'en curso',
  delivered: 'entregada',
  in_qa: 'en QA',
  approved: 'espera tu aprobación',
  merged: 'integrada',
  done: 'terminada',
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
}

export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Qué dijo QA de una tarea, para su etiqueta. */
export function qaOf(t: Task): { text: string; color: string } {
  if (t.status === 'in_qa') return { text: 'En QA', color: 'play' }
  if (t.qa?.verdict === 'pass') return { text: 'QA aprobó', color: 'idle' }
  if (t.qa?.verdict === 'fail') return { text: 'QA rechazó', color: 'block' }
  return { text: 'Sin QA', color: '' }
}

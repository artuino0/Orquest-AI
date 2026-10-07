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

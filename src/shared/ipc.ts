/** Contrato entre el proceso principal y los paneles. La UI solo pide y muestra. */
import type { Slot, Task } from '../core/board.js'
import type { CliStatus } from '../core/detect.js'
import type { Employee } from '../core/employees.js'
import type { Effort, ProviderId } from '../core/providers.js'
import type { EmployeeState } from '../core/state.js'
import type { StudioSnapshot } from '../core/studio.js'
import type { FileChange } from '../core/worktree.js'

export type { CliStatus, Effort, Employee, EmployeeState, FileChange, ProviderId, Slot, StudioSnapshot, Task }

export interface BossRequest {
  provider: ProviderId
  model?: string
  effort?: Effort
  goal: string
}

export type SlotEdit = Partial<Slot> & Pick<Slot, 'role' | 'provider'>

export interface OrquestApi {
  detectClis(): Promise<CliStatus[]>
  pickRepo(): Promise<string | null>

  // Proyecto, jefe y tablero.
  openProject(repo: string): Promise<StudioSnapshot>
  hireBoss(req: BossRequest): Promise<void>
  sayToBoss(text: string): Promise<void>
  approveTemplate(slots: SlotEdit[]): Promise<void>
  mergeTask(id: string): Promise<void>
  returnTask(id: string, notes: string): Promise<void>
  taskDiff(id: string): Promise<string>
  onBoard(cb: (s: StudioSnapshot) => void): () => void
  onNotice(cb: (text: string) => void): () => void

  // Empleados vivos.
  fire(id: string): Promise<void>
  list(): Promise<Employee[]>
  scrollback(id: string): Promise<string>
  changes(id: string): Promise<FileChange[]>
  diff(id: string, path: string): Promise<string>
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  onData(cb: (id: string, data: string) => void): () => void
  onState(cb: (id: string, state: EmployeeState) => void): () => void
  onHired(cb: (e: Employee) => void): () => void
}

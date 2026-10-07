/** Contrato entre el proceso principal y los paneles. */
import type { CliStatus } from '../core/detect.js'
import type { Employee, HireRequest } from '../core/employees.js'
import type { EmployeeState } from '../core/state.js'
import type { FileChange } from '../core/worktree.js'

export type { CliStatus, Employee, EmployeeState, FileChange, HireRequest }

export interface OrquestApi {
  detectClis(): Promise<CliStatus[]>
  pickRepo(): Promise<string | null>
  hire(req: HireRequest): Promise<Employee>
  fire(id: string, removeOffice: boolean): Promise<void>
  list(): Promise<Employee[]>
  scrollback(id: string): Promise<string>
  changes(id: string): Promise<FileChange[]>
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  onData(cb: (id: string, data: string) => void): () => void
  onState(cb: (id: string, state: EmployeeState) => void): () => void
  onHired(cb: (e: Employee) => void): () => void
}

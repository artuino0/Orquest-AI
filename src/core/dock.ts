/**
 * El dock de proyectos: los que están abiertos en esta compu, con lo justo
 * para vigilarlos sin entrar a ellos (cuántos trabajan y cuántas cosas esperan
 * al usuario). El lienzo los lista a la izquierda y un clic cambia de proyecto.
 */

export interface OpenProject {
  /** Carpeta del proyecto: lo identifica. */
  root: string
  /** El nombre de su carpeta. */
  name: string
  /** Cuántos están trabajando ahora. */
  working: number
  /**
   * Cuántas cosas esperan al usuario: alguien detenido o que no puede trabajar,
   * preguntas del jefe sin contestar y entregas listas para integrar.
   */
  needs: number
}

/** La entrada de un proyecto abierto, a partir de su foto y de las terminales de su gente. */
export function dockEntry(
  root: string,
  snap: { tasks: { status: string }[]; questions: { status: string }[] },
  employees: { state: string; problem?: string }[],
): OpenProject {
  const stuck = employees.filter((e) => e.state === 'blocked' || (!!e.problem && e.state !== 'working' && e.state !== 'exited')).length
  const asks = snap.questions.filter((q) => q.status === 'open').length
  const deliveries = snap.tasks.filter((t) => t.status === 'approved').length
  return {
    root,
    name: root.split(/[\\/]/).filter(Boolean).pop() ?? root,
    working: employees.filter((e) => e.state === 'working').length,
    needs: stuck + asks + deliveries,
  }
}

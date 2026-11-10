/**
 * Los carriles del grafo de commits del panel Historial, como GitKraken. Puro,
 * sin Node: lo usa el núcleo (`history.ts`) y la vista previa del panel.
 */

/**
 * Un renglón del grafo: en qué columna va el punto del commit y qué líneas
 * cruzan su renglón. Cada renglón se dibuja de su borde de arriba a su borde de
 * abajo, con el punto a la mitad.
 */
export interface GraphRow {
  /** Columna del punto. */
  col: number
  /** Llega una línea desde arriba a su punto, por su misma columna (un hijo lo esperaba). */
  top: boolean
  /** Sale una línea hacia abajo por su columna (su primer padre sigue ahí). */
  bottom: boolean
  /** Columnas que pasan de largo, de arriba a abajo, sin tocarlo. */
  through: number[]
  /** Columnas que llegan desde arriba y se juntan en su punto (dos hijos del mismo commit). */
  ins: number[]
  /** Columnas a las que sale desde su punto hacia abajo (los otros padres de un merge). */
  outs: number[]
}

/**
 * Los carriles del grafo. Los commits van de los más nuevos a los más viejos y
 * cada hijo antes que sus padres (`git log --topo-order`). `first` es el commit
 * que se queda en la columna 0 (la punta de la rama actual), para que la rama
 * donde se integra sea siempre la primera línea.
 *
 * Cada columna "espera" a un commit: al llegar a él se dibuja ahí su punto y la
 * columna pasa a esperar a su primer padre; sus otros padres toman una columna
 * libre (o la de quien ya los espera). Si dos columnas esperaban al mismo, la
 * segunda se junta en el punto y queda libre.
 */
export function graphLanes(commits: { sha: string; parents: string[] }[], first?: string): { rows: GraphRow[]; width: number } {
  const active: (string | null)[] = first ? [first] : []
  const rows: GraphRow[] = []
  let width = 0
  const free = () => {
    const i = active.indexOf(null)
    return i >= 0 ? i : active.length
  }
  for (const c of commits) {
    let col = active.indexOf(c.sha)
    const top = col >= 0
    if (col < 0) col = free()
    // Otras columnas que también lo esperaban: se juntan aquí.
    const ins: number[] = []
    active.forEach((s, i) => {
      if (s === c.sha && i !== col) ins.push(i)
    })
    const before = active.slice()
    for (const i of ins) active[i] = null
    active[col] = c.parents[0] ?? null
    const outs: number[] = []
    for (const p of c.parents.slice(1)) {
      const waiting = active.indexOf(p)
      if (waiting >= 0) {
        if (waiting !== col) outs.push(waiting)
        continue
      }
      const slot = free()
      active[slot] = p
      outs.push(slot)
    }
    // Lo que pasa de largo: columnas que ya esperaban algo antes de este renglón y lo siguen esperando.
    const through: number[] = []
    before.forEach((s, i) => {
      if (s !== null && i !== col && !ins.includes(i) && active[i] === s) through.push(i)
    })
    rows.push({ col, top, bottom: !!c.parents[0], through, ins, outs })
    while (active.length && active[active.length - 1] === null) active.pop()
    width = Math.max(width, col + 1, before.length, active.length, ...outs.map((o) => o + 1))
  }
  return { rows, width }
}

/** Un diff de git partido por archivo, con sus cuentas, para mostrarlo (Entregas, Historial). */
export interface ParsedDiff {
  files: { name: string; lines: string[] }[]
  added: number
  removed: number
}

export function parseDiff(text: string): ParsedDiff {
  const files: ParsedDiff['files'] = []
  let added = 0
  let removed = 0
  for (const l of text.split('\n')) {
    const head = /^diff --git a\/(.+?) b\//.exec(l)
    if (head) files.push({ name: head[1], lines: [] })
    else if (/^(index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(l)) continue
    else if (files.length) {
      files.at(-1)!.lines.push(l)
      if (l.startsWith('+')) added++
      else if (l.startsWith('-')) removed++
    }
  }
  return { files, added, removed }
}

/** La clase de un renglón del diff: agregado, quitado o encabezado de bloque. */
export const diffMark = (l: string) => (l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hunk' : '')

/**
 * Avisos al celular: qué cambió en un proyecto que necesita al usuario, y
 * mandarlo por el servicio de avisos de Expo (lo entrega por Apple o Google; la
 * app móvil está hecha con Expo). Son los mismos momentos que suenan en el
 * escritorio (ver renderer/src/attention.ts): una entrega para integrar, una
 * pregunta del jefe, una versión lista para revisar, alguien detenido, alguien
 * que no puede trabajar.
 *
 * El aviso sale de esta compu hacia un servicio de fuera: de fábrica dice solo
 * quién y qué pasa («Lupita te necesita»). El detalle (la pregunta, el título de
 * la entrega, lo que dice su terminal) solo si el usuario lo pide; lo ve al
 * abrir la app de todas formas.
 */
import { T } from './i18n.js'

/** Lo que el aviso necesita de un proyecto. */
export interface ProjectView {
  /** Carpeta del proyecto: identifica a cuál lleva el aviso. */
  root: string
  /** Su nombre, para el título. */
  project: string
  tasks: { id: string; status: string; title: string; assignee: string }[]
  questions: { id: string; status: string; text: string }[]
  reviews: { employeeId: string; status: string }[]
  employees: { id: string; state: string; problem?: string }[]
  names: Record<string, string>
}

export interface Alert {
  /** Para no repetir el mismo aviso. */
  key: string
  title: string
  body: string
  /** A qué pantalla lleva al tocarlo. */
  to: { root: string; screen: 'question' | 'inbox' | 'employee' | 'boss'; id?: string }
  /** Esperar antes de mandarlo y ver si sigue: alguien detenido puede ser autorizado por el jefe en un momento. */
  hold?: number
}

/** La foto para los avisos, a partir de la del estudio y sus terminales. */
export function projectView(
  root: string,
  project: string,
  snap: { tasks: ProjectView['tasks']; questions: ProjectView['questions']; reviews?: ProjectView['reviews']; staff: { id: string; name: string }[]; boss?: { name?: string } },
  employees: ProjectView['employees'],
): ProjectView {
  return {
    root,
    project,
    tasks: snap.tasks.map((t) => ({ id: t.id, status: t.status, title: t.title, assignee: t.assignee })),
    questions: snap.questions.map((q) => ({ id: q.id, status: q.status, text: q.text })),
    reviews: (snap.reviews ?? []).map((r) => ({ employeeId: r.employeeId, status: r.status })),
    employees: employees.map((e) => ({ id: e.id, state: e.state, ...(e.problem ? { problem: e.problem } : {}) })),
    names: { jefe: snap.boss?.name || T`El jefe`, ...Object.fromEntries(snap.staff.map((m) => [m.id, m.name])) },
  }
}

/** Cuánto se espera a que el jefe autorice a alguien detenido antes de avisar. */
export const BLOCKED_HOLD_MS = 4000

/** Lo que pasó entre dos fotos de un proyecto que necesita al usuario. Sin foto anterior (recién abierto), nada. */
export function alertsBetween(before: ProjectView | undefined, after: ProjectView, detail = false): Alert[] {
  if (!before) return []
  const out: Alert[] = []
  const name = (id: string) => after.names[id] ?? id
  const root = after.root
  const was = <X>(list: X[], pick: (x: X) => boolean) => list.some(pick)

  for (const t of after.tasks) {
    if (t.status !== 'approved' || was(before.tasks, (x) => x.id === t.id && x.status === 'approved')) continue
    out.push({ key: `inbox:${t.id}`, title: T`Entrega lista para integrar`, body: detail ? T`${t.id} de ${name(t.assignee)}: ${t.title}` : T`${t.id} de ${name(t.assignee)} · ${after.project}`, to: { root, screen: 'inbox', id: t.id } })
  }
  for (const q of after.questions) {
    if (q.status !== 'open' || was(before.questions, (x) => x.id === q.id)) continue
    out.push({ key: `question:${q.id}`, title: T`${name('jefe')} te pregunta algo`, body: detail ? q.text : after.project, to: { root, screen: 'question', id: q.id } })
  }
  for (const r of after.reviews) {
    if (r.status !== 'ready' || was(before.reviews, (x) => x.employeeId === r.employeeId && x.status === 'ready')) continue
    out.push({ key: `review:${r.employeeId}`, title: T`La versión de ${name(r.employeeId)} está lista para verla`, body: after.project, to: { root, screen: 'employee', id: r.employeeId } })
  }
  for (const e of after.employees) {
    const prev = before.employees.find((x) => x.id === e.id)
    const screen = e.id === 'jefe' ? 'boss' : 'employee'
    if (e.problem && e.problem !== prev?.problem) {
      out.push({ key: `problem:${e.id}:${e.problem}`, title: T`${name(e.id)} no puede trabajar`, body: detail ? e.problem : after.project, to: { root, screen, id: e.id } })
    } else if (e.state === 'blocked' && prev && prev.state !== 'blocked') {
      out.push({ key: `blocked:${e.id}`, title: T`${name(e.id)} te necesita`, body: after.project, to: { root, screen, id: e.id }, hold: BLOCKED_HOLD_MS })
    }
  }
  return out
}

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send'

/**
 * Manda los avisos a esos celulares por Expo. Devuelve los tokens que Expo dice
 * que ya no existen (la app se desinstaló), para dejar de usarlos. Un fallo de
 * red no rompe nada: el aviso se pierde y en la app sigue todo a la vista.
 */
export async function sendExpo(tokens: string[], alerts: Alert[], post: typeof fetch = fetch): Promise<{ gone: string[]; error?: string }> {
  if (!tokens.length || !alerts.length) return { gone: [] }
  const messages = alerts.flatMap((a) => tokens.map((to) => ({ to, title: a.title, body: a.body, sound: 'default', data: a.to })))
  try {
    const res = await post(EXPO_PUSH, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(messages) })
    const json = (await res.json().catch(() => ({}))) as { data?: { status?: string; details?: { error?: string } }[] }
    const gone = new Set<string>()
    ;(json.data ?? []).forEach((ticket, i) => {
      if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') gone.add(messages[i].to)
    })
    return { gone: [...gone], ...(res.ok ? {} : { error: `HTTP ${res.status}` }) }
  } catch (err) {
    return { gone: [], error: (err as Error).message }
  }
}

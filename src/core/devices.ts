/**
 * Los celulares emparejados con esta compu, para la app móvil. Emparejar es de
 * una vez: el escritorio muestra un código (y su QR) que dura unos minutos; el
 * celular lo manda y recibe su propio token, con el que entra de ahí en
 * adelante. Del token solo se guarda su huella (sha256): quien lea el archivo
 * no puede hacerse pasar por el celular. Quitar un dispositivo lo deja fuera.
 *
 * Vive en `<userData>/dispositivos.json`. El código, solo en memoria.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { RuleError } from './board.js'
import { T } from './i18n.js'

export interface Device {
  id: string
  /** Como se llama el celular («iPhone de Arturo»), para reconocerlo en la lista. */
  name: string
  /** Huella del token (sha256 en hex); el token no se guarda. */
  tokenHash: string
  /** A dónde mandarle avisos (token de Expo), si los aceptó. */
  pushToken?: string
  pairedAt: number
  lastSeen?: number
}

/** Lo que se muestra de un dispositivo: nunca su huella ni su token de avisos. */
export interface DeviceView {
  id: string
  name: string
  pairedAt: number
  lastSeen?: number
  /** Recibe avisos. */
  push: boolean
}

/** Cuánto dura un código de emparejar. */
export const CODE_TTL_MS = 5 * 60_000
/** Intentos fallidos antes de que el código deje de servir. */
export const CODE_TRIES = 5
/** Sin letras que se confundan (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const PUSH_TOKEN = /^Expo(nent)?PushToken\[[\w-]+\]$/

export class Devices {
  private list: Device[] | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private code: { value: string; expiresAt: number; misses: number } | null = null

  constructor(
    private file: string,
    private now: () => number = Date.now,
  ) {}

  private async load(): Promise<Device[]> {
    if (this.list) return this.list
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as unknown
      this.list = (Array.isArray(raw) ? raw : []).filter((d): d is Device => !!d && typeof d.id === 'string' && typeof d.tokenHash === 'string')
    } catch {
      this.list = []
    }
    return this.list
  }

  private change<R>(fn: (list: Device[]) => { list: Device[]; result: R }): Promise<R> {
    const next = this.chain.then(async () => {
      const { list, result } = fn(await this.load())
      this.list = list
      await mkdir(dirname(this.file), { recursive: true })
      // Se escribe aparte y se reemplaza: un corte a la mitad no deja el archivo roto.
      const tmp = `${this.file}.tmp`
      await writeFile(tmp, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
      await rename(tmp, this.file)
      return result
    })
    this.chain = next.catch(() => {})
    return next
  }

  /** Un código nuevo para emparejar; el anterior deja de servir. */
  newCode(): { code: string; expiresAt: number } {
    const bytes = randomBytes(6)
    const value = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
    this.code = { value, expiresAt: this.now() + CODE_TTL_MS, misses: 0 }
    return { code: value, expiresAt: this.code.expiresAt }
  }

  /** El código vigente, si lo hay (para volver a mostrarlo). */
  currentCode(): { code: string; expiresAt: number } | undefined {
    if (!this.code || this.now() > this.code.expiresAt) return undefined
    return { code: this.code.value, expiresAt: this.code.expiresAt }
  }

  /** El celular manda el código: si sirve, queda emparejado y recibe su token (solo esta vez). */
  async pair(code: string, name: string, pushToken?: string): Promise<{ id: string; token: string }> {
    const c = this.code
    const typed = String(code ?? '').trim().toUpperCase().replace(/[\s-]/g, '')
    if (!c || this.now() > c.expiresAt) throw new RuleError(T`El código venció. Genera otro en la compu.`)
    const ok = typed.length === c.value.length && timingSafeEqual(Buffer.from(typed), Buffer.from(c.value))
    if (!ok) {
      // Unos cuantos intentos y ya: con un código corto, probar al azar no debe salir.
      if (++c.misses >= CODE_TRIES) this.code = null
      throw new RuleError(T`El código no es correcto.`)
    }
    this.code = null
    const token = randomBytes(32).toString('base64url')
    const device: Device = {
      id: randomUUID(),
      name: String(name ?? '').trim().slice(0, 60) || T`Celular`,
      tokenHash: hash(token),
      ...(pushToken && PUSH_TOKEN.test(pushToken) ? { pushToken } : {}),
      pairedAt: this.now(),
    }
    await this.change((list) => ({ list: [...list, device], result: undefined }))
    return { id: device.id, token }
  }

  /** ¿De quién es este token? undefined si no es de nadie (o se quitó). */
  async authenticate(token: string | undefined): Promise<Device | undefined> {
    if (!token) return undefined
    const h = Buffer.from(hash(token))
    const d = (await this.load()).find((x) => x.tokenHash.length === h.length && timingSafeEqual(Buffer.from(x.tokenHash), h))
    if (d) d.lastSeen = this.now()
    return d
  }

  /** El celular dice a dónde mandarle avisos (o que ya no quiere: sin token). */
  async setPush(id: string, pushToken: string | undefined): Promise<void> {
    if (pushToken && !PUSH_TOKEN.test(pushToken)) throw new RuleError(T`Ese token de avisos no es válido.`)
    return this.change((list) => ({ list: list.map((d) => (d.id === id ? { ...d, pushToken: pushToken || undefined } : d)), result: undefined }))
  }

  /** Expo dice que ese token de avisos ya no existe (la app se desinstaló): se deja de usar. */
  forgetPush(pushToken: string): Promise<void> {
    return this.change((list) => ({ list: list.map((d) => (d.pushToken === pushToken ? { ...d, pushToken: undefined } : d)), result: undefined }))
  }

  /** Lo deja fuera: su token ya no entra. */
  revoke(id: string): Promise<void> {
    return this.change((list) => ({ list: list.filter((d) => d.id !== id), result: undefined }))
  }

  async all(): Promise<DeviceView[]> {
    await this.chain
    return (await this.load()).map((d) => ({ id: d.id, name: d.name, pairedAt: d.pairedAt, lastSeen: d.lastSeen, push: !!d.pushToken }))
  }

  /** A dónde mandar los avisos. */
  async pushTokens(): Promise<string[]> {
    await this.chain
    return (await this.load()).flatMap((d) => (d.pushToken ? [d.pushToken] : []))
  }
}

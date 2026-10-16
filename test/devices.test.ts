import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CODE_TRIES, CODE_TTL_MS, Devices } from '../src/core/devices.js'

const file = () => join(mkdtempSync(join(tmpdir(), 'orquest-dispositivos-')), 'dispositivos.json')

describe('emparejar un celular', () => {
  it('con el código queda emparejado; su token entra y del token solo se guarda la huella', async () => {
    const path = file()
    const d = new Devices(path)
    const { code } = d.newCode()
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    const { id, token } = await d.pair(code.toLowerCase().replace(/(...)/, '$1-'), 'iPhone de Arturo', 'ExponentPushToken[abc123]')
    expect((await d.authenticate(token))?.id).toBe(id)
    expect(await d.authenticate('otro')).toBeUndefined()
    expect(readFileSync(path, 'utf8')).not.toContain(token)
    expect(await d.all()).toEqual([expect.objectContaining({ id, name: 'iPhone de Arturo', push: true })])
    expect(await d.pushTokens()).toEqual(['ExponentPushToken[abc123]'])
    // El código ya se usó.
    await expect(d.pair(code, 'otro')).rejects.toThrow(/venció/)
    // Lo recuerda al reabrir la app.
    expect((await new Devices(path).authenticate(token))?.id).toBe(id)
  })

  it('el código vence y, tras unos intentos fallidos, deja de servir', async () => {
    let now = 1000
    const d = new Devices(file(), () => now)
    const { code } = d.newCode()
    now += CODE_TTL_MS + 1
    await expect(d.pair(code, 'x')).rejects.toThrow(/venció/)
    const again = d.newCode().code
    for (let i = 0; i < CODE_TRIES; i++) await expect(d.pair('ZZZZZZ', 'x')).rejects.toThrow()
    await expect(d.pair(again, 'x')).rejects.toThrow(/venció/)
  })

  it('quitarlo lo deja fuera; los avisos se prenden y apagan; un token de avisos raro no se acepta', async () => {
    const d = new Devices(file())
    const { id, token } = await d.pair(d.newCode().code, 'Pixel', 'no-es-de-expo')
    expect(await d.pushTokens()).toEqual([])
    await d.setPush(id, 'ExpoPushToken[x-1]')
    expect(await d.pushTokens()).toEqual(['ExpoPushToken[x-1]'])
    await expect(d.setPush(id, 'http://malo')).rejects.toThrow()
    await d.revoke(id)
    expect(await d.authenticate(token)).toBeUndefined()
    expect(await d.all()).toEqual([])
  })
})

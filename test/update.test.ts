import { describe, expect, it } from 'vitest'
import { checkUpdate, isNewer, pickUpdate, selfUpdates, type Release } from '../src/core/update.js'

const release = (tag: string, files: string[] = ['Orquest-AI-x-instalador.exe', 'Orquest-AI-x-arm64.dmg', 'Orquest-AI-x-x86_64.AppImage'], draft = false): Release => ({
  tag_name: tag,
  draft,
  html_url: `https://github.com/artuino0/Orquest-AI/releases/tag/${tag}`,
  assets: files.map((name) => ({ name, browser_download_url: `https://descargas/${tag}/${name}` })),
})

describe('aviso de versión nueva', () => {
  it('compara versiones por número, no por texto', () => {
    expect(isNewer('0.2.10', '0.2.9')).toBe(true)
    expect(isNewer('v0.3.0', '0.2.9')).toBe(true)
    expect(isNewer('0.2.1', '0.2.1')).toBe(false)
    expect(isNewer('0.2.0', '0.2.1')).toBe(false)
    expect(isNewer('1.0', '0.9.9')).toBe(true)
  })

  it('ofrece la más nueva de las publicadas, con el instalador de este sistema', () => {
    const published = [release('v0.2.1'), release('v0.2.2'), release('v0.3.0', [], true), release('v0.2.0')]
    expect(pickUpdate(published, '0.2.1', 'win32')).toEqual({ version: '0.2.2', url: 'https://descargas/v0.2.2/Orquest-AI-x-instalador.exe' })
    expect(pickUpdate(published, '0.2.1', 'darwin')?.url).toMatch(/\.dmg$/)
    expect(pickUpdate(published, '0.2.1', 'linux')?.url).toMatch(/\.AppImage$/)
    // Al día, o más adelante que lo publicado (una copia de desarrollo): sin aviso.
    expect(pickUpdate(published, '0.2.2', 'win32')).toBeNull()
    expect(pickUpdate(published, '0.9.0', 'win32')).toBeNull()
    expect(pickUpdate([], '0.2.1', 'win32')).toBeNull()
  })

  it('si la versión no trae instalador para este sistema, manda a su página', () => {
    expect(pickUpdate([release('v0.2.2', ['Orquest-AI-x-arm64.dmg'])], '0.2.1', 'win32')).toEqual({ version: '0.2.2', url: 'https://github.com/artuino0/Orquest-AI/releases/tag/v0.2.2' })
  })

  it('sin red o con un error de GitHub no hay aviso ni falla nada', async () => {
    expect(await checkUpdate('0.2.1', (async () => { throw new Error('sin red') }) as unknown as typeof fetch)).toBeNull()
    expect(await checkUpdate('0.2.1', (async () => new Response('límite', { status: 403 })) as unknown as typeof fetch)).toBeNull()
    const ok = (async () => new Response(JSON.stringify([release('v9.0.0')]), { status: 200 })) as unknown as typeof fetch
    expect((await checkUpdate('0.2.1', ok))?.version).toBe('9.0.0')
  })
})

describe('actualizarse sola', () => {
  it('Windows y Linux (AppImage o .deb) sí; macOS y la app de desarrollo no', () => {
    expect(selfUpdates('win32', { packaged: true })).toBe(true)
    expect(selfUpdates('linux', { packaged: true, appImage: '/home/u/Orquest-AI-0.8.1-x86_64.AppImage' })).toBe(true)
    expect(selfUpdates('linux', { packaged: true, packageType: 'deb' })).toBe(true)
    expect(selfUpdates('linux', { packaged: true, packageType: null })).toBe(false)
    expect(selfUpdates('linux', { packaged: true, packageType: 'rpm' })).toBe(false)
    expect(selfUpdates('darwin', { packaged: true })).toBe(false)
    expect(selfUpdates('win32', { packaged: false })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { langOf, paint } from '../src/renderer/src/highlight.js'

describe('colores de sintaxis del visor', () => {
  it('reconoce el lenguaje por el nombre del archivo', () => {
    expect(langOf('src/main.ts')).toBe('typescript')
    expect(langOf('src\\components\\Cart.vue')).toBe('xml')
    expect(langOf('package.json')).toBe('json')
    expect(langOf('README.MD')).toBe('markdown')
    expect(langOf('Makefile')).toBe('makefile')
    expect(langOf('.env.local')).toBe('ini')
    expect(langOf('LICENSE')).toBeUndefined()
    expect(langOf('logo.png')).toBeUndefined()
  })

  it('pinta palabras clave, textos y comentarios', () => {
    const html = paint("// saludo\nexport const hola = 'mundo'\n", 'a.ts')
    expect(html).toContain('<span class="hljs-comment">// saludo</span>')
    expect(html).toContain('<span class="hljs-keyword">const</span>')
    expect(html).toContain('<span class="hljs-string">&#x27;mundo&#x27;</span>')
  })

  it('lo que trae el archivo nunca sale como HTML vivo', () => {
    const evil = '<img src=x onerror=alert(1)>'
    expect(paint(evil, 'notas.txt')).toBe('&lt;img src=x onerror=alert(1)&gt;')
    expect(paint(`const a = "${evil}"`, 'a.js')).not.toContain('<img')
    expect(paint(evil, 'pagina.html')).not.toContain('<img')
    // Un archivo enorme no se pinta, pero igual se escapa.
    expect(paint(`${'x'.repeat(200_001)}<b>`, 'a.ts')).toContain('&lt;b&gt;')
  })
})

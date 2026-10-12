/**
 * El editor de archivos del panel (Monaco, el de VS Code). Pesa, así que nadie
 * lo importa directo: `CodeView.vue` lo pide con `import()` al abrir el primer
 * archivo. Aquí va lo que se le configura una sola vez.
 */
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

// Sus procesos auxiliares van como archivos aparte (la CSP no deja crearlos de un texto).
self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  },
}

// Se ve un archivo suelto, sin su proyecto alrededor: cada import saldría marcado como error. Sin avisos.
const quiet = { noSemanticValidation: true, noSyntaxValidation: true, noSuggestionDiagnostics: true }
monaco.typescript.typescriptDefaults.setDiagnosticsOptions(quiet)
monaco.typescript.javascriptDefaults.setDiagnosticsOptions(quiet)
monaco.json.jsonDefaults.setDiagnosticsOptions({ validate: false })
for (const css of [monaco.css.cssDefaults, monaco.css.scssDefaults, monaco.css.lessDefaults]) css.setOptions({ validate: false })

// Lo que Monaco no reconoce por su nombre y se parece a algo que sí.
monaco.languages.register({ id: 'html', extensions: ['.vue', '.svelte', '.astro'] })
monaco.languages.register({ id: 'ini', extensions: ['.toml', '.conf', '.cfg', '.env'], filenames: ['.env', '.npmrc', '.editorconfig', '.gitconfig'], filenamePatterns: ['.env.*'] })

/** El tema del editor sale de las fichas de color de la app (`style.css`), así sigue al oscuro y al claro. */
export function applyTheme(): void {
  const css = getComputedStyle(document.documentElement)
  const hex = (name: string) => css.getPropertyValue(name).trim().replace('#', '')
  const background = `#${hex('--term-bg')}`
  monaco.editor.defineTheme('orquest', {
    base: document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: hex('--code-comment'), fontStyle: 'italic' },
      { token: 'keyword', foreground: hex('--code-keyword') },
      { token: 'string', foreground: hex('--code-string') },
      { token: 'regexp', foreground: hex('--code-string') },
      { token: 'attribute.value', foreground: hex('--code-string') },
      { token: 'number', foreground: hex('--code-number') },
      { token: 'constant', foreground: hex('--code-number') },
      { token: 'type', foreground: hex('--code-type') },
      { token: 'attribute.name', foreground: hex('--code-attr') },
      { token: 'string.key.json', foreground: hex('--code-attr') },
      { token: 'variable', foreground: hex('--code-attr') },
      { token: 'tag', foreground: hex('--code-tag') },
      { token: 'metatag', foreground: hex('--code-tag') },
      { token: 'annotation', foreground: hex('--code-tag') },
    ],
    colors: { 'editor.background': background, 'editorGutter.background': background, 'minimap.background': background },
  })
  monaco.editor.setTheme('orquest')
}

export { monaco }

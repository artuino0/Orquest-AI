import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Las pruebas usan git, terminales y procesos de verdad: con todos los archivos corriendo a
    // la vez en una máquina ocupada, los 5 s de siempre no alcanzan y fallan sin haber fallado.
    testTimeout: 20_000,
  },
})

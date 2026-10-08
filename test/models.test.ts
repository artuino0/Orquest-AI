import { describe, expect, it } from 'vitest'
import { EFFORTS, modelIds, PROVIDERS } from '../src/core/providers.js'

describe('modelos y esfuerzo por proveedor', () => {
  it('saca los ids del listado de una CLI y se salta títulos y avisos', () => {
    const agy = 'Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n'
    expect(modelIds(agy)).toEqual(['gemini-3.8-flash-high', 'claude-sonnet-4-6'])
    const cmd = 'Available models  ·  82 models\n\nOpen Source\n\ndeepseek/deepseek-v4-pro   hybrid-attention long-context reasoning\ndeepseek/deepseek-v4-pro   repetido\n'
    expect(modelIds(cmd)).toEqual(['deepseek/deepseek-v4-pro'])
    expect(modelIds('')).toEqual([])
  })

  it('el modelo por defecto de Codex sale de su config', () => {
    const read = PROVIDERS.codex.models.file!.read
    expect(read('model = "gpt-x"\nmodel_reasoning_effort = "high"\n')).toEqual(['gpt-x'])
    expect(read('approval_policy = "never"\n')).toEqual([])
  })

  it('cada CLI recibe solo sus niveles de esfuerzo', () => {
    for (const p of Object.values(PROVIDERS)) for (const e of p.efforts) expect(EFFORTS).toContain(e)
    expect(PROVIDERS.claude.buildArgs({ effort: 'max' })).toEqual(['--effort', 'max'])
    // Codex no conoce "max": no lo manda y avisa.
    expect(PROVIDERS.codex.buildArgs({ effort: 'max' })).toEqual([])
    expect(PROVIDERS.codex.unsupported({ effort: 'max' })[0]).toMatch(/max/)
    expect(PROVIDERS.codex.buildArgs({ effort: 'low' })).toEqual(['-c', 'model_reasoning_effort=low'])
    expect(PROVIDERS.grok.buildArgs({ model: 'm', effort: 'high' })).toEqual(['--model', 'm', '--reasoning-effort', 'high'])
    // Antigravity lleva el esfuerzo en el id del modelo.
    expect(PROVIDERS.antigravity.efforts).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { claudeModels, EFFORTS, modelIds, PROVIDERS } from '../src/core/providers.js'

describe('modelos y esfuerzo por proveedor', () => {
  it('saca los ids del listado de una CLI y se salta títulos y avisos', () => {
    const agy = 'Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n'
    expect(modelIds(agy)).toEqual(['gemini-3.8-flash-high', 'claude-sonnet-4-6'])
    const cmd = 'Available models  ·  82 models\n\nOpen Source\n\ndeepseek/deepseek-v4-pro   hybrid-attention long-context reasoning\ndeepseek/deepseek-v4-pro   repetido\n'
    expect(modelIds(cmd)).toEqual(['deepseek/deepseek-v4-pro'])
    expect(modelIds('')).toEqual([])
  })

  it('los modelos de Codex salen de su config y de la lista que guarda', () => {
    const [config, cache] = PROVIDERS.codex.models.files!
    expect(config.read('model = "gpt-x"\nmodel_reasoning_effort = "high"\n')).toEqual(['gpt-x'])
    expect(config.read('approval_policy = "never"\n')).toEqual([])
    const lista = JSON.stringify({ models: [{ slug: 'gpt-a', visibility: 'list' }, { slug: 'gpt-oculto', visibility: 'hide' }, { slug: 'gpt-b', visibility: 'list' }] })
    expect(cache.read(lista)).toEqual(['gpt-a', 'gpt-b'])
    expect(cache.read('no es json')).toEqual([])
  })

  it('de los modelos que trae Claude Code quedan los vigentes, lo más nuevo primero', () => {
    const found = ['claude-opus-4-1', 'claude-sonnet-4-6', 'claude-opus-5-5', 'claude-haiku-4-5', 'claude-sonnet-3-7', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5']
    expect(claudeModels(found)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-sonnet-4-6', 'claude-haiku-4-5'])
    const { pattern } = PROVIDERS.claude.models.scan!
    // Las versiones con fecha no cuentan: son la misma con otro nombre.
    expect('x claude-opus-4-8" claude-haiku-4-5-20251001 claude-sonnet-5-5,'.match(pattern)).toEqual(['claude-opus-4-8', 'claude-sonnet-5-5'])
  })

  it('cada CLI recibe solo sus niveles de esfuerzo', () => {
    for (const p of Object.values(PROVIDERS)) for (const e of p.efforts) expect(EFFORTS).toContain(e)
    expect(PROVIDERS.claude.buildArgs({ effort: 'max' })).toEqual(['--effort', 'max'])
    // Grok no conoce "max": no lo manda y avisa.
    expect(PROVIDERS.grok.buildArgs({ effort: 'max' })).toEqual([])
    expect(PROVIDERS.grok.unsupported({ effort: 'max' })[0]).toMatch(/max/)
    expect(PROVIDERS.codex.buildArgs({ effort: 'max' })).toEqual(['-c', 'model_reasoning_effort=max'])
    expect(PROVIDERS.codex.buildArgs({ effort: 'low' })).toEqual(['-c', 'model_reasoning_effort=low'])
    expect(PROVIDERS.grok.buildArgs({ model: 'm', effort: 'high' })).toEqual(['--model', 'm', '--reasoning-effort', 'high'])
    // Antigravity lleva el esfuerzo en el id del modelo.
    expect(PROVIDERS.antigravity.efforts).toEqual([])
  })
})

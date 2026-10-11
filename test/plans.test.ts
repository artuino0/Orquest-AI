import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RuleError } from '../src/core/board.js'
import { listPlans, savePlan } from '../src/core/plans.js'
import { bossPrompt } from '../src/core/prompts.js'

const BODY = '1. Backend arma la API de productos.\n2. Frontend la consume cuando esté integrada.'

describe('planes del jefe', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orquest-planes-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('guarda cada plan como Markdown con su título y los lista del más reciente al más viejo', async () => {
    expect(await listPlans(root)).toEqual([])
    const plan = await savePlan(root, '  Plan de la   tienda ', BODY)
    expect(plan).toMatchObject({ file: '.orquest/planes/plan-de-la-tienda.md', title: 'Plan de la tienda' })
    expect(await readFile(join(root, plan.file), 'utf8')).toBe(`# Plan de la tienda\n\n${BODY}\n`)

    // Si ya trae su encabezado, se respeta.
    const own = await savePlan(root, 'Fase 2', `# Fase 2: pagos\n\n${BODY}`)
    expect(own.title).toBe('Fase 2: pagos')
    expect((await listPlans(root)).map((p) => p.file).sort()).toEqual(['.orquest/planes/fase-2.md', '.orquest/planes/plan-de-la-tienda.md'])
  })

  it('guardar otra vez con el mismo título lo reemplaza', async () => {
    await savePlan(root, 'Plan de la tienda', BODY)
    await savePlan(root, 'Plan de la tienda', `${BODY}\n3. QA revisa el flujo completo.`)
    const plans = await listPlans(root)
    expect(plans).toHaveLength(1)
    expect(await readFile(join(root, plans[0].file), 'utf8')).toContain('3. QA revisa')
  })

  it('no acepta un plan sin título o casi vacío', async () => {
    await expect(savePlan(root, ' ', BODY)).rejects.toThrow(RuleError)
    await expect(savePlan(root, 'Plan', 'luego veo')).rejects.toThrow(RuleError)
    await expect(savePlan(root, 'x'.repeat(90), BODY)).rejects.toThrow(RuleError)
    expect(await listPlans(root)).toEqual([])
  })

  it('al jefe se le dice cómo se llama y que guarde sus planes', () => {
    const prompt = bossPrompt('Tienda', undefined, 'mcp', 'Jhonny')
    expect(prompt).toContain('te llamas Jhonny')
    expect(prompt).toContain('guardar_plan')
    expect(bossPrompt('Tienda')).not.toContain('te llamas')
  })
})

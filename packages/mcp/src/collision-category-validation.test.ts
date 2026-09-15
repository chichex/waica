import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject, type ValidationFinding } from './validation.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const CATEGORY_CODES = new Set([
  'invalid-collision-layer',
  'invalid-collision-mask',
  'duplicate-collision-mask-entry',
])

function categoryFindings(findings: ValidationFinding[]): ValidationFinding[] {
  return findings.filter((finding) => CATEGORY_CODES.has(finding.code))
}

describe('validateProject collision categories', () => {
  it('reports exact prefab, inline, changed override, and params-file findings', async () => {
    const project = await makeProject({
      'src/objects/bad.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [{
          type: 'Hitbox',
          props: {
            layer: '*',
            collidesWith: ['enemy', 'enemy', 'Enemy', 7],
          },
        }],
      }),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          { name: 'Plain', prefab: 'objects/bad' },
          {
            name: 'Override',
            prefab: 'objects/bad',
            overrides: { Hitbox: { layer: 'AgainBad' } },
          },
          {
            name: 'Inline',
            components: [{
              type: 'Hitbox',
              props: { layer: 'enemy_one', collidesWith: 'enemy' },
            }],
          },
        ],
      }),
      'public/waica.params.json': JSON.stringify({
        'Runtime-only name': {
          Hitbox: { layer: '*', collidesWith: [null, '*', '*'] },
        },
      }),
    })
    roots.push(project)

    const result = await validateProject(project)
    const findings = categoryFindings(result.findings)

    expect(findings).toHaveLength(10)
    expect(findings.filter((finding) => finding.file === 'src/objects/bad.object.json')).toHaveLength(4)
    expect(findings.filter((finding) => finding.file === 'src/scenes/main.scene.json')).toHaveLength(3)
    expect(findings.filter((finding) => finding.file === 'public/waica.params.json')).toHaveLength(3)
    expect(findings.filter((finding) => finding.ref?.includes('Plain'))).toEqual([])
    expect(findings.filter((finding) => finding.ref?.includes('Override'))).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'invalid-collision-layer',
        file: 'src/scenes/main.scene.json',
      }),
    ])
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', code: 'invalid-collision-layer' }),
      expect.objectContaining({ severity: 'error', code: 'invalid-collision-mask' }),
      expect.objectContaining({ severity: 'warning', code: 'duplicate-collision-mask-entry' }),
    ]))
    expect(result.summary.errors).toBeGreaterThanOrEqual(7)
    expect(result.summary.warnings).toBeGreaterThanOrEqual(2)
    expect(result.ok).toBe(false)
  })

  it('accepts defaults, empty/wildcard masks, and unknown valid layer names', async () => {
    const project = await makeProject({
      'src/objects/default.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [{ type: 'Hitbox' }],
      }),
      'src/objects/valid.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [{
          type: 'Hitbox',
          props: { layer: 'unknown-valid-9', collidesWith: [] },
        }],
      }),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          { name: 'Default', prefab: 'objects/default' },
          { name: 'Valid', prefab: 'objects/valid', overrides: { Hitbox: { collidesWith: ['*'] } } },
          { name: 'Inline', components: [{ type: 'Hitbox', props: { collidesWith: ['unknown-valid-9'] } }] },
        ],
      }),
      'public/waica.params.json': JSON.stringify({
        MissingAtRuntime: { Hitbox: { layer: 'also-valid', collidesWith: ['*'] } },
      }),
    })
    roots.push(project)

    const result = await validateProject(project)

    expect(categoryFindings(result.findings)).toEqual([])
  })

  it('emits duplicate entries as warnings without turning valid controls into errors', async () => {
    const project = await makeProject({
      'src/objects/duplicate.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [{
          type: 'Hitbox',
          props: { layer: 'enemy', collidesWith: ['player', 'player', '*', '*'] },
        }],
      }),
    })
    roots.push(project)

    const findings = categoryFindings((await validateProject(project)).findings)

    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'duplicate-collision-mask-entry',
      }),
      expect.objectContaining({
        severity: 'warning',
        code: 'duplicate-collision-mask-entry',
      }),
    ])
  })
})

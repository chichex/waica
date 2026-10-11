import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'

// A checkout without built @waica dists compiles the package sources once per
// process before its first project-component load (project-component-fallbacks.ts).
beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const THREE_D = { render: { space: '3d' }, camera: { kind: 'perspective' } }

async function simulationFindings(scene: Record<string, unknown>) {
  const project = await makeProject({
    'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, entities: [], ...scene }),
  })
  roots.push(project)
  const { findings } = await validateProject(project)
  return findings.filter((finding) => finding.code === 'invalid-scene-simulation')
}

describe('validate_project on the simulation block (issue #159 CA-12)', () => {
  it('accepts a 3d scene with no block, an empty block and a valid gravity', async () => {
    expect(await simulationFindings(THREE_D)).toEqual([])
    expect(await simulationFindings({ ...THREE_D, simulation: {} })).toEqual([])
    expect(await simulationFindings({ ...THREE_D, simulation: { gravity: [0, -1.62, 0] } })).toEqual([])
  })

  it('reports a gravity that is not three finite numbers as invalid-scene-simulation on simulation.gravity', async () => {
    const findings = await simulationFindings({ ...THREE_D, simulation: { gravity: [0, 'down', 0] } })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      severity: 'error',
      code: 'invalid-scene-simulation',
      file: 'src/scenes/main.scene.json',
      ref: 'simulation.gravity',
    })
    expect(findings[0]?.message).toContain('three finite numbers')
    expect(await simulationFindings({ ...THREE_D, simulation: { gravity: [0, -9.81] } })).toHaveLength(1)
  })

  it('reports any simulation block in a 2d scene', async () => {
    const findings = await simulationFindings({ simulation: { gravity: [0, -9.81, 0] } })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ severity: 'error', ref: 'simulation' })
    expect(findings[0]?.message).toContain("render.space '3d'")
  })
})

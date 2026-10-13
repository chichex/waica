import { afterEach, beforeAll, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'

// Issue #181 CA-5: validate_project over a perspective camera that follows an entity.

beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const FILE = 'src/scenes/main.scene.json'
const CODES = new Set(['invalid-scene-camera', 'camera-follow-unknown-entity'])

async function cameraFindings(camera: Record<string, unknown>): Promise<Array<{ severity: string; code: string; ref?: string }>> {
  const scene = { waicaScene: 3, render: { space: '3d' }, camera: { kind: 'perspective', ...camera }, entities: [{ name: 'Player' }] }
  const project = await makeProject({ [FILE]: JSON.stringify(scene) })
  roots.push(project)
  const result = await validateProject(project)
  return result.findings.filter((finding) => CODES.has(finding.code)).map(({ severity, code, ref }) => ({ severity, code, ref }))
}

it('accepts a perspective camera following an entity of the scene (CA-5)', async () => {
  expect(await cameraFindings({ follow: 'Player', distance: 5, minPitch: -20, maxPitch: 60 })).toEqual([])
})

it('reports a follow target the scene does not have, as for an orthographic camera (CA-5)', async () => {
  expect(await cameraFindings({ follow: 'Ghost' })).toEqual([
    { severity: 'warning', code: 'camera-follow-unknown-entity', ref: 'Ghost' },
  ])
})

it('reports inverted ranges and a pitch outside (-89, 89) as invalid-scene-camera (CA-5)', async () => {
  const findings = await cameraFindings({ follow: 'Player', minDistance: 9, maxDistance: 4, minPitch: 30, maxPitch: 20, pitch: -90 })

  expect(findings).toEqual([
    { severity: 'error', code: 'invalid-scene-camera', ref: 'camera.pitch' },
    { severity: 'error', code: 'invalid-scene-camera', ref: 'camera.minDistance' },
    { severity: 'error', code: 'invalid-scene-camera', ref: 'camera.minPitch' },
  ])
})

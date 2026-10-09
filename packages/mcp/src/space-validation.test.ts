import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'

// A checkout without built @waica dists compiles the package sources once per
// process before its first project-component load (project-component-fallbacks.ts).
beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const SPACE_CODES = new Set(['invalid-scene-render', 'invalid-scene-camera', 'invalid-entity-transform', 'component-space-mismatch'])
const FILE = 'src/scenes/main.scene.json'

interface SceneInput {
  render?: unknown
  camera?: unknown
  entities?: unknown[]
}

async function spaceFindings(scene: SceneInput, files: Record<string, string> = {}): Promise<Array<{ severity: string; code: string; ref?: string; message: string }>> {
  const project = await makeProject({
    [FILE]: JSON.stringify({ waicaScene: 3, entities: [], ...scene }),
    ...files,
  })
  roots.push(project)
  const result = await validateProject(project)
  return result.findings
    .filter((finding) => SPACE_CODES.has(finding.code))
    .map(({ severity, code, ref, message }) => ({ severity, code, ref, message }))
}

const refs = (findings: Array<{ ref?: string }>): Array<string | undefined> => findings.map((finding) => finding.ref)

describe('render.space and the camera block (CA-13)', () => {
  it('accepts a 2d scene, and a 3d scene with a valid perspective camera', async () => {
    expect(await spaceFindings({})).toEqual([])
    expect(await spaceFindings({ render: { space: '2d' }, camera: { zoom: 12 } })).toEqual([])
    expect(
      await spaceFindings({
        render: { space: '3d' },
        camera: { kind: 'perspective', position: [0, 5, 10], target: [0, 0, 0], fov: 60, near: 0.1, far: 100 },
      }),
    ).toEqual([])
    expect(await spaceFindings({ render: { space: '3d' } })).toEqual([])
  })

  it('reports a space outside 2d | 3d as an error on render.space', async () => {
    const findings = await spaceFindings({ render: { space: '4d' } })
    expect(findings).toEqual([
      { severity: 'error', code: 'invalid-scene-render', ref: 'render.space', message: "render.space must be '2d' or '3d'; got \"4d\"." },
    ])
  })

  it('reports fov outside (0, 180), near <= 0, far <= near and non-triple position/target', async () => {
    const findings = await spaceFindings({
      render: { space: '3d' },
      camera: { kind: 'perspective', fov: 180, near: 0, far: 0.05, position: [1, 2], target: [0, 'up', 0] },
    })
    expect(findings.every((finding) => finding.severity === 'error' && finding.code === 'invalid-scene-camera')).toBe(true)
    expect(refs(findings)).toEqual(['camera.position', 'camera.target', 'camera.fov', 'camera.near', 'camera.far'])
  })

  it('reports a perspective camera in a 2d scene and an orthographic camera in a 3d scene', async () => {
    const inTwoD = await spaceFindings({ camera: { kind: 'perspective' } })
    expect(inTwoD).toHaveLength(1)
    expect(inTwoD[0]).toMatchObject({ severity: 'error', code: 'invalid-scene-camera', ref: 'camera.kind' })
    const inThreeD = await spaceFindings({ render: { space: '3d' }, camera: { kind: 'orthographic', zoom: 8 } })
    expect(inThreeD).toHaveLength(1)
    expect(inThreeD[0]).toMatchObject({ severity: 'error', code: 'invalid-scene-camera', ref: 'camera.kind' })
    expect(await spaceFindings({ render: { space: '3d' }, camera: { zoom: 8 } })).toHaveLength(1)
  })

})

describe('perspective camera fields and 2D-only render options (CA-13, CA-14)', () => {
  it('reports the 2D camera fields on a perspective block', async () => {
    const findings = await spaceFindings({ render: { space: '3d' }, camera: { kind: 'perspective', follow: 'Player', zoom: 9 } })
    expect(refs(findings)).toEqual(['camera.follow', 'camera.zoom'])
  })

  it('reports render.sort, render.projection and render.batch in a 3d scene, and none in a 2d one', async () => {
    const findings = await spaceFindings({ render: { space: '3d', sort: 'y', projection: 'isometric', batch: false }, camera: { kind: 'perspective' } })
    expect(refs(findings)).toEqual(['render.sort', 'render.projection', 'render.batch'])
    expect(await spaceFindings({ render: { sort: 'y', projection: 'isometric', batch: false } })).toEqual([])
  })
})

describe('entity transforms (CA-13)', () => {
  it('accepts a position of 2 or 3 numbers, rotation and scale of 3', async () => {
    expect(
      await spaceFindings({
        entities: [
          { name: 'A', position: [1, 2] },
          { name: 'B', position: [1, 2, 3], rotation: [0, 90, 0], scale: [1, 1, 2] },
        ],
      }),
    ).toEqual([])
  })

  it('rejects a position of 1 or 4 numbers, and a rotation or scale that is not 3 finite numbers', async () => {
    const findings = await spaceFindings({
      entities: [
        { name: 'A', position: [1] },
        { name: 'B', position: [1, 2, 3, 4] },
        { name: 'C', rotation: [0, 90], scale: [1, 1, 'x'] },
      ],
    })
    expect(findings.every((finding) => finding.severity === 'error' && finding.code === 'invalid-entity-transform')).toBe(true)
    expect(refs(findings)).toEqual(['A', 'B', 'C', 'C'])
    expect(findings.map((finding) => finding.message)).toEqual([
      expect.stringContaining('Entity "A": position'),
      expect.stringContaining('Entity "B": position'),
      expect.stringContaining('Entity "C": rotation'),
      expect.stringContaining('Entity "C": scale'),
    ])
  })
})

describe('components per space (CA-14)', () => {
  const THREE_D = { render: { space: '3d' }, camera: { kind: 'perspective' } }

  it('reports every 2D component on an entity of a 3d scene, naming entity, component and space', async () => {
    const types = ['Sprite', 'AnimatedSprite', 'Tilemap', 'Solid', 'DynamicBody', 'Hitbox', 'Light', 'ParticleEmitter']
    const findings = await spaceFindings({ ...THREE_D, entities: [{ name: 'Crate', components: types.map((type) => ({ type })) }] })
    const mismatches = findings.filter((finding) => finding.code === 'component-space-mismatch')
    expect(mismatches).toHaveLength(types.length)
    expect(mismatches.every((finding) => finding.severity === 'error')).toBe(true)
    for (const type of types) {
      expect(mismatches.some((finding) => finding.message.includes('"Crate"') && finding.message.includes(`"${type}"`) && finding.message.includes('3d'))).toBe(true)
    }
  })

  it('reports a 2D component that comes from the entity prefab', async () => {
    const findings = await spaceFindings(
      { ...THREE_D, entities: [{ name: 'Barrel', prefab: 'objects/barrel' }] },
      { 'src/objects/barrel.object.json': JSON.stringify({ waicaPrefab: 1, type: 'object', components: [{ type: 'Sprite' }] }) },
    )
    const mismatches = findings.filter((finding) => finding.code === 'component-space-mismatch')
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]?.message).toContain('"Barrel"')
    expect(mismatches[0]?.message).toContain('"Sprite"')
  })

  it('reports a 3D component on an entity of a 2d scene', async () => {
    const findings = await spaceFindings({ entities: [{ name: 'Lamp', components: [{ type: 'Model' }, { type: 'Sun' }, { type: 'PointLight' }] }] })
    const mismatches = findings.filter((finding) => finding.code === 'component-space-mismatch')
    expect(mismatches).toHaveLength(3)
    expect(mismatches[0]?.message).toContain('2d')
  })

  it('leaves StateMachine and project-owned components alone in both spaces', async () => {
    const entities = [{ name: 'Brain', components: [{ type: 'StateMachine' }, { type: 'MyThing' }] }]
    expect((await spaceFindings({ ...THREE_D, entities })).filter((finding) => finding.code === 'component-space-mismatch')).toEqual([])
    expect((await spaceFindings({ entities })).filter((finding) => finding.code === 'component-space-mismatch')).toEqual([])
  })

  it('reports nothing for a 2D component in a 2d scene', async () => {
    expect(await spaceFindings({ entities: [{ name: 'Crate', components: [{ type: 'Sprite' }] }] })).toEqual([])
  })
})

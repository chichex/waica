import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { colliderParamFindings, rigidBodyParamFindings } from './physics-param-validation.js'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'

// A checkout without built @waica dists compiles the package sources once per
// process before its first project-component load (project-component-fallbacks.ts).
beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const FILE = 'src/scenes/main.scene.json'

const refs = (props: unknown): Array<string | undefined> => colliderParamFindings(props, FILE, 'Wall').map((finding) => finding.ref)

describe('colliderParamFindings (issue #159 CA-13)', () => {
  it('accepts the defaults, every shape and the documented ranges', () => {
    expect(colliderParamFindings(undefined, FILE, 'Wall')).toEqual([])
    expect(colliderParamFindings({}, FILE, 'Wall')).toEqual([])
    expect(colliderParamFindings({ shape: 'sphere', radius: 0.5 }, FILE, 'Wall')).toEqual([])
    expect(colliderParamFindings({ shape: 'capsule', radius: 0.4, height: 1.8, offset: [0, 0.9, 0] }, FILE, 'Wall')).toEqual([])
    expect(colliderParamFindings({ friction: 0, restitution: 1, layer: 'wall', collidesWith: ['*'] }, FILE, 'Wall')).toEqual([])
  })

  it('reports an unknown shape', () => {
    const findings = colliderParamFindings({ shape: 'cylinder' }, FILE, 'Wall')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ severity: 'error', code: 'invalid-collider-param', file: FILE, ref: 'Wall:Collider.shape' })
    expect(findings[0]?.message).toContain('"cylinder"')
  })
})

describe('colliderParamFindings: ranges and layers (issue #159 CA-13)', () => {
  it('reports a dimension that is not a positive number', () => {
    expect(refs({ size: [1, 0, 1] })).toEqual(['Wall:Collider.size'])
    expect(refs({ size: [1, 1] })).toEqual(['Wall:Collider.size'])
    expect(refs({ size: [1, 'x', 1] })).toEqual(['Wall:Collider.size'])
    expect(refs({ radius: -1 })).toEqual(['Wall:Collider.radius'])
    expect(refs({ height: Number.NaN })).toEqual(['Wall:Collider.height'])
    expect(refs({ radius: 0, height: 0 })).toEqual(['Wall:Collider.radius', 'Wall:Collider.height'])
  })

  it('reports an offset that is not three finite numbers', () => {
    expect(refs({ offset: [0, 1] })).toEqual(['Wall:Collider.offset'])
    expect(refs({ offset: [0, Number.POSITIVE_INFINITY, 0] })).toEqual(['Wall:Collider.offset'])
  })

})

describe('colliderParamFindings: the ranges the class declares (PR #161 review)', () => {
  it('reports a radius or height under the minimum the inspector declares, and a capsule shorter than twice its radius', () => {
    expect(refs({ radius: 0.005 })).toEqual(['Wall:Collider.radius'])
    expect(refs({ height: 0.001 })).toEqual(['Wall:Collider.height'])
    expect(refs({ shape: 'capsule', radius: 0.5, height: 0.6 })).toEqual(['Wall:Collider.height'])
    expect(refs({ shape: 'capsule', radius: 1 })).toEqual(['Wall:Collider.height'])
    expect(refs({ shape: 'capsule', height: 1.2 })).toEqual([])
    expect(refs({ shape: 'capsule', height: 0.8 })).toEqual(['Wall:Collider.height'])
    expect(refs({ shape: 'sphere', radius: 1, height: 0.6 })).toEqual([])
    expect(colliderParamFindings({ shape: 'capsule', radius: 0.5, height: 0.6 }, FILE, 'Wall')[0]?.message).toContain('twice')
  })
})

describe('colliderParamFindings: ranges and layers, continued (issue #159 CA-13)', () => {
  it('reports friction and restitution outside [0, 1]', () => {
    expect(refs({ friction: 1.5 })).toEqual(['Wall:Collider.friction'])
    expect(refs({ friction: -0.1, restitution: 2 })).toEqual(['Wall:Collider.friction', 'Wall:Collider.restitution'])
    expect(refs({ restitution: 'bouncy' })).toEqual(['Wall:Collider.restitution'])
  })

  it('reports an invalid layer or mask through the shared collision-category checks, as Collider params', () => {
    const findings = colliderParamFindings({ layer: 'Wall!', collidesWith: ['ok', 'Bad', 7] }, FILE, 'Wall')
    expect(findings.map((finding) => [finding.code, finding.ref])).toEqual([
      ['invalid-collider-param', 'Wall:Collider.layer'],
      ['invalid-collider-param', 'Wall:Collider.collidesWith[1]'],
      ['invalid-collider-param', 'Wall:Collider.collidesWith[2]'],
    ])
    expect(findings[0]?.message).toContain('Collider.layer')
    expect(colliderParamFindings({ collidesWith: 'all' }, FILE, 'Wall').map((finding) => finding.ref)).toEqual(['Wall:Collider.collidesWith'])
  })

  it('keeps a duplicated mask entry a warning', () => {
    const findings = colliderParamFindings({ collidesWith: ['pickup', 'pickup'] }, FILE, 'Wall')
    expect(findings.map((finding) => [finding.severity, finding.code])).toEqual([['warning', 'duplicate-collision-mask-entry']])
  })
})

const bodyRefs = (props: unknown): Array<string | undefined> => rigidBodyParamFindings(props, FILE, 'Crate').map((finding) => finding.ref)

describe('rigidBodyParamFindings (PR #161 review)', () => {
  it('accepts the defaults and every documented type', () => {
    expect(rigidBodyParamFindings(undefined, FILE, 'Crate')).toEqual([])
    expect(rigidBodyParamFindings({}, FILE, 'Crate')).toEqual([])
    expect(bodyRefs({ type: 'kinematic', mass: 2, gravityScale: 0, linearDamping: 0, angularDamping: 1, lockRotations: true, velocity: [1, 0, -1] })).toEqual([])
  })

  it('reports a type that is not dynamic or kinematic instead of letting it fall as dynamic', () => {
    const findings = rigidBodyParamFindings({ type: 'static' }, FILE, 'Crate')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ severity: 'error', code: 'invalid-rigid-body-param', file: FILE, ref: 'Crate:RigidBody.type' })
    expect(findings[0]?.message).toContain('"static"')
    expect(findings[0]?.message).toContain('dynamic, kinematic')
  })

  it('reports the ranges RigidBody.params declare and a velocity that is not three finite numbers', () => {
    expect(bodyRefs({ mass: 0 })).toEqual(['Crate:RigidBody.mass'])
    expect(bodyRefs({ mass: 'heavy', linearDamping: -1, angularDamping: Number.NaN })).toEqual([
      'Crate:RigidBody.mass',
      'Crate:RigidBody.linearDamping',
      'Crate:RigidBody.angularDamping',
    ])
    expect(bodyRefs({ gravityScale: 'none' })).toEqual(['Crate:RigidBody.gravityScale'])
    expect(bodyRefs({ velocity: { x: 0, y: 5, z: 0 } })).toEqual(['Crate:RigidBody.velocity'])
    expect(bodyRefs({ velocity: [0, 5] })).toEqual(['Crate:RigidBody.velocity'])
    expect(bodyRefs({ velocity: [0, Number.POSITIVE_INFINITY, 0] })).toEqual(['Crate:RigidBody.velocity'])
  })
})

const THREE_D = { render: { space: '3d' }, camera: { kind: 'perspective' } }

async function findingsOf(entities: unknown[], files: Record<string, string> = {}) {
  const project = await makeProject({
    'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, ...THREE_D, entities }),
    ...files,
  })
  roots.push(project)
  const { findings } = await validateProject(project)
  return findings.filter((finding) =>
    [
      'invalid-collider-param',
      'invalid-rigid-body-param',
      'rigid-body-without-collider',
      'character-motor-without-body',
      'component-space-mismatch',
      'unknown-component',
    ].includes(finding.code),
  )
}

describe('validate_project on Collider and RigidBody (issue #159 CA-13, CA-14)', () => {
  it('accepts a Collider alone and a Collider with a RigidBody', async () => {
    expect(
      await findingsOf([
        { name: 'Floor', components: [{ type: 'Collider', props: { size: [10, 1, 10] } }] },
        { name: 'Crate', components: [{ type: 'Collider' }, { type: 'RigidBody' }] },
      ]),
    ).toEqual([])
  })

  it('reports a bad Collider param on a scene entity', async () => {
    const findings = await findingsOf([{ name: 'Floor', components: [{ type: 'Collider', props: { shape: 'cone' } }] }])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ severity: 'error', code: 'invalid-collider-param', ref: 'Floor:Collider.shape' })
  })

})

describe('validate_project on RigidBody params (PR #161 review)', () => {
  it('reports a bad RigidBody param on a scene entity, a prefab and an entity override', async () => {
    const findings = await findingsOf(
      [
        { name: 'Crate', components: [{ type: 'Collider' }, { type: 'RigidBody', props: { type: 'static' } }] },
        { name: 'FromPrefab', prefab: 'objects/ball' },
        { name: 'Overridden', prefab: 'objects/good', overrides: { RigidBody: { velocity: { x: 0, y: 5, z: 0 } } } },
      ],
      {
        'src/objects/ball.object.json': JSON.stringify({ waicaPrefab: 1, type: 'object', components: [{ type: 'Collider' }, { type: 'RigidBody', props: { mass: 0 } }] }),
        'src/objects/good.object.json': JSON.stringify({ waicaPrefab: 1, type: 'object', components: [{ type: 'Collider' }, { type: 'RigidBody' }] }),
      },
    )
    expect(findings.map((finding) => [finding.code, finding.ref])).toEqual([
      ['invalid-rigid-body-param', 'objects/ball:RigidBody.mass'],
      ['invalid-rigid-body-param', 'Crate:RigidBody.type'],
      ['invalid-rigid-body-param', 'Overridden:RigidBody.velocity'],
    ])
  })
})

describe('validate_project on Collider and RigidBody: prefabs and composition (issue #159 CA-14)', () => {
  it('reports a bad Collider param on a prefab and in an entity override', async () => {
    const prefab = JSON.stringify({ waicaPrefab: 1, type: 'object', components: [{ type: 'Collider', props: { radius: -2, shape: 'sphere' } }] })
    const findings = await findingsOf(
      [
        { name: 'FromPrefab', prefab: 'objects/orb' },
        { name: 'Overridden', prefab: 'objects/good', overrides: { Collider: { friction: 5 } } },
      ],
      {
        'src/objects/orb.object.json': prefab,
        'src/objects/good.object.json': JSON.stringify({ waicaPrefab: 1, type: 'object', components: [{ type: 'Collider' }] }),
      },
    )
    expect(findings.map((finding) => [finding.code, finding.ref])).toEqual([
      ['invalid-collider-param', 'objects/orb:Collider.radius'],
      ['invalid-collider-param', 'Overridden:Collider.friction'],
    ])
  })
})

describe('validate_project on a RigidBody without a Collider (issue #159 CA-14)', () => {
  it('reports a RigidBody with no Collider on the same entity, from the entity or its prefab', async () => {
    const findings = await findingsOf(
      [
        { name: 'Ghost', components: [{ type: 'RigidBody' }] },
        { name: 'Whole', components: [{ type: 'Collider' }, { type: 'RigidBody' }] },
        { name: 'Completed', prefab: 'objects/bare', components: [{ type: 'Collider' }] },
        { name: 'Bare', prefab: 'objects/bare' },
      ],
      { 'src/objects/bare.object.json': JSON.stringify({ waicaPrefab: 1, type: 'object', components: [{ type: 'RigidBody' }] }) },
    )
    expect(findings.map((finding) => [finding.code, finding.ref])).toEqual([
      ['rigid-body-without-collider', 'Ghost'],
      ['rigid-body-without-collider', 'Bare'],
    ])
    expect(findings[0]).toMatchObject({ severity: 'error' })
    expect(findings[0]?.message).toContain('"Ghost"')
  })

  it('reports both in a 2d scene as space mismatches, not as physics findings', async () => {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [{ name: 'Crate', components: [{ type: 'Collider' }, { type: 'RigidBody' }] }, { name: 'Ghost', components: [{ type: 'RigidBody' }] }],
      }),
    })
    roots.push(project)
    const { findings } = await validateProject(project)
    expect(findings.filter((finding) => finding.code === 'component-space-mismatch').map((finding) => finding.message)).toEqual([
      expect.stringContaining('"Collider"'),
      expect.stringContaining('"RigidBody"'),
      expect.stringContaining('"RigidBody"'),
    ])
    expect(findings.filter((finding) => finding.code === 'rigid-body-without-collider')).toEqual([])
  })
})

describe('validate_project on a CharacterMotor without its body (issue #159 CA-20)', () => {
  const KINEMATIC = [{ type: 'Collider' }, { type: 'RigidBody', props: { type: 'kinematic' } }]

  it('accepts a motor beside a Collider and a kinematic RigidBody', async () => {
    expect(await findingsOf([{ name: 'Player', components: [...KINEMATIC, { type: 'CharacterMotor' }] }])).toEqual([])
  })

  it('reports a motor with no RigidBody, no Collider, or a dynamic RigidBody', async () => {
    const findings = await findingsOf([
      { name: 'NoBody', components: [{ type: 'Collider' }, { type: 'CharacterMotor' }] },
      { name: 'NoCollider', components: [{ type: 'RigidBody', props: { type: 'kinematic' } }, { type: 'CharacterMotor' }] },
      { name: 'Dynamic', components: [{ type: 'Collider' }, { type: 'RigidBody' }, { type: 'CharacterMotor' }] },
    ])
    const motor = findings.filter((finding) => finding.code === 'character-motor-without-body')
    expect(motor.map((finding) => [finding.severity, finding.ref])).toEqual([
      ['error', 'NoBody'],
      ['error', 'NoCollider'],
      ['error', 'Dynamic'],
    ])
    expect(motor[0]?.message).toContain('kinematic RigidBody')
  })

  it('reads the body type through the prefab and an override', async () => {
    const prefab = JSON.stringify({ waicaPrefab: 1, type: 'character', components: [...KINEMATIC, { type: 'CharacterMotor' }] })
    const findings = await findingsOf(
      [
        { name: 'Kinematic', prefab: 'characters/hero' },
        { name: 'MadeDynamic', prefab: 'characters/hero', overrides: { RigidBody: { type: 'dynamic' } } },
      ],
      { 'src/characters/hero.character.json': prefab },
    )
    expect(findings.filter((finding) => finding.code === 'character-motor-without-body').map((finding) => finding.ref)).toEqual(['MadeDynamic'])
  })
})

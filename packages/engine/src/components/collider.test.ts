// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { authoringDefaults } from '../authoring-defaults.js'
import { loadScene } from '../scene.js'
import { ready3dGame, registryOf, use3dTestEnvironment } from '../test-game-3d.js'
import { crate, FLOOR, physicsFixture, worldOf } from '../test-physics-3d.js'
import { defined } from '../test-support.js'
import { Collider } from './collider.js'

use3dTestEnvironment()

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Collider (CA-13)', () => {
  it('declares the 3D space and the documented defaults', () => {
    expect(Collider.space).toBe('3d')
    expect(Collider.params.shape.options).toEqual(['box', 'sphere', 'capsule'])
    expect(authoringDefaults(Collider)).toEqual({
      shape: 'box',
      size: [1, 1, 1],
      radius: 0.5,
      height: 1.8,
      offset: [0, 0, 0],
      sensor: false,
      layer: 'default',
      collidesWith: ['*'],
      friction: 0.5,
      restitution: 0,
    })
  })
})

describe('Collider as a fixed body (CA-13)', () => {
  it('alone on an entity is a fixed body at the entity pose, scaled by the entity', async () => {
    const { game, step } = await physicsFixture([
      {
        name: 'Wall',
        position: [3, 2, -1],
        rotation: [0, 90, 0],
        scale: [2, 3, 4],
        components: [{ type: 'Collider', props: { shape: 'box', size: [1, 1, 0.5], friction: 0.25, restitution: 0.5 } }],
      },
    ])

    const record = defined(worldOf(game).recordOf(defined(game.find('Wall'))))
    expect(record.kind).toBe('fixed')
    expect(record.body.translation()).toEqual({ x: 3, y: 2, z: -1 })
    const half = defined(record.shape.halfExtents())
    expect([half.x, half.y, half.z]).toEqual([1, 1.5, 1])
    expect(record.shape.friction()).toBe(0.25)
    expect(record.shape.restitution()).toBe(0.5)
    expect(record.shape.isSensor()).toBe(false)
    const q = record.body.rotation()
    expect(q.y).toBeCloseTo(Math.SQRT1_2, 6)
    expect(q.w).toBeCloseTo(Math.SQRT1_2, 6)

    game.find('Wall')?.position.set(50, 50, 50)
    step(5)

    expect(record.body.translation()).toEqual({ x: 3, y: 2, z: -1 })
  })
})

describe('Collider shapes and placement (CA-13)', () => {
  it('builds a sphere and a capsule with explicit sizes, scaled by the largest relevant axis (inference 9, 10)', async () => {
    const { game } = await physicsFixture([
      { name: 'Ball', scale: [1, 2, 3], components: [{ type: 'Collider', props: { shape: 'sphere', radius: 0.5 } }] },
      { name: 'Capsule', scale: [2, 3, 1], components: [{ type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } }] },
      { name: 'Plain', components: [{ type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } }] },
    ])

    const world = worldOf(game)
    const ball = defined(world.recordOf(defined(game.find('Ball'))))
    expect(ball.shape.radius()).toBeCloseTo(1.5, 6)
    const capsule = defined(world.recordOf(defined(game.find('Capsule'))))
    expect(capsule.shape.radius()).toBeCloseTo(0.8, 6)
    expect(capsule.shape.halfHeight()).toBeCloseTo((1.8 * 3) / 2 - 0.8, 6)
    const plain = defined(world.recordOf(defined(game.find('Plain'))))
    // Total end-to-end height 1.8 = a straight part of 1.8 - 2 * 0.4 capped by two hemispheres.
    expect(plain.shape.halfHeight()).toBeCloseTo(0.5, 6)
  })

  it('places the shape at its offset in the entity local frame', async () => {
    const { game } = await physicsFixture([
      { name: 'Shifted', position: [0, 0, 0], scale: [2, 2, 2], components: [{ type: 'Collider', props: { offset: [0, 0.5, 1] } }] },
    ])

    const record = defined(worldOf(game).recordOf(defined(game.find('Shifted'))))
    expect(record.shape.translationWrtParent()).toEqual({ x: 0, y: 1, z: 2 })
  })
})

describe('Collider lifecycle (CA-13)', () => {
  it('creates nothing in a 2D scene', async () => {
    const { game } = await ready3dGame()
    loadScene(game, { waicaScene: 3, entities: [{ name: 'Wall', components: [{ type: 'Collider' }] }] }, registryOf({ Collider }))
    await game.assets.ready()

    expect(game.physics.world).toBeNull()
    expect(game.assets.status).toEqual({ pending: 0, loaded: 0, failed: 0 })
  })
})

describe('Collider that creates no body (CA-13)', () => {
  it('creates no body for a dimension Rapier cannot take, and says so once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game } = await physicsFixture([
      { name: 'Flat', components: [{ type: 'Collider', props: { size: [1, 0, 1] } }] },
      { name: 'Ball', components: [{ type: 'Collider', props: { shape: 'sphere', radius: -1 } }] },
      FLOOR,
    ])

    const world = worldOf(game)
    expect(world.recordOf(defined(game.find('Flat')))).toBeUndefined()
    expect(world.recordOf(defined(game.find('Ball')))).toBeUndefined()
    expect(world.recordOf(defined(game.find('Floor')))).toBeDefined()
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringContaining('Collider on "Flat" creates no body'),
      expect.stringContaining('Collider on "Ball" creates no body'),
    ])
  })

  it('removes its body and collider when the entity is destroyed', async () => {
    const { game, step } = await physicsFixture([FLOOR, crate('Crate', 2)])
    const world = worldOf(game)
    const bodies = vi.spyOn(world.raw, 'removeRigidBody')

    game.find('Crate')?.destroy()
    step(2)

    expect(bodies).toHaveBeenCalledTimes(1)
    expect(world.bodiesOf(game.entities).map((record) => record.entity.name)).toEqual(['Floor'])
  })

  it('creates a body for an entity spawned into a ready scene (a prefab at runtime)', async () => {
    const { game, registry } = await physicsFixture([FLOOR])

    const spawned = game.spawn('Late')
    spawned.position.set(0, 4, 0)
    spawned.add(Collider)

    expect(worldOf(game).recordOf(spawned)?.kind).toBe('fixed')
    expect(registry.components.Collider).toBe(Collider)
  })
})

describe('Collider params the runtime refuses (PR #161 review)', () => {
  it('says it once when the Collider and a RigidBody beside it share the invalid shape', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game } = await physicsFixture([{ name: 'Flat', components: [{ type: 'Collider', props: { size: [1, 0, 1] } }, { type: 'RigidBody' }] }])

    expect(worldOf(game).recordOf(defined(game.find('Flat')))).toBeUndefined()
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([expect.stringContaining('Collider on "Flat" creates no body')])
  })

  it('creates no body for a capsule shorter than twice its radius, or a friction or restitution outside 0..1', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game } = await physicsFixture([
      { name: 'Squat', components: [{ type: 'Collider', props: { shape: 'capsule', radius: 0.5, height: 0.6 } }] },
      { name: 'Slick', components: [{ type: 'Collider', props: { friction: 'high' } }] },
      { name: 'Bouncy', components: [{ type: 'Collider', props: { restitution: 2 } }] },
      { name: 'Ball', components: [{ type: 'Collider', props: { shape: 'capsule', radius: 0.5, height: 1 } }] },
    ])

    const world = worldOf(game)
    for (const name of ['Squat', 'Slick', 'Bouncy']) expect(world.recordOf(defined(game.find(name))), name).toBeUndefined()
    expect(world.recordOf(defined(game.find('Ball')))?.shape.halfHeight()).toBe(0)
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringContaining('Collider on "Squat" creates no body: a capsule needs a height of at least twice its radius'),
      expect.stringContaining('Collider on "Slick" creates no body: friction and restitution need numbers from 0 to 1'),
      expect.stringContaining('Collider on "Bouncy" creates no body: friction and restitution need numbers from 0 to 1'),
    ])
  })

})

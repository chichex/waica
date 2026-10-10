// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { authoringDefaults } from '../authoring-defaults.js'
import { use3dTestEnvironment } from '../test-game-3d.js'
import { crate, FLOOR, physicsFixture, worldOf } from '../test-physics-3d.js'
import { defined } from '../test-support.js'
import { RigidBody } from './rigid-body.js'

use3dTestEnvironment()

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RigidBody (CA-14)', () => {
  it('declares the 3D space and the documented defaults', () => {
    expect(RigidBody.space).toBe('3d')
    expect(RigidBody.params.type.options).toEqual(['dynamic', 'kinematic'])
    expect(authoringDefaults(RigidBody)).toEqual({
      type: 'dynamic',
      mass: 1,
      gravityScale: 1,
      linearDamping: 0,
      angularDamping: 0,
      lockRotations: false,
      velocity: [0, 0, 0],
    })
  })

  it('lets a dynamic box fall onto a static box and rest on it', async () => {
    const { game, step } = await physicsFixture([FLOOR, crate('Crate', 3)])
    const body = defined(game.find('Crate')?.get(RigidBody))

    step(120)

    const velocity = body.linearVelocity
    expect(Math.hypot(velocity.x, velocity.y, velocity.z)).toBeLessThan(1e-3)
    expect(game.find('Crate')?.position.y).toBeCloseTo(0.5, 2)
    expect(game.find('Crate')?.position.x).toBeCloseTo(0, 1)
  })
})

describe('RigidBody pose and forces (CA-14)', () => {
  it('writes the body pose to the entity position and rotation every step', async () => {
    const { game, step } = await physicsFixture([
      FLOOR,
      { name: 'Edge', position: [0, 1.5, 0], rotation: [0, 0, 40], components: [{ type: 'Collider' }, { type: 'RigidBody' }] },
    ])
    const edge = defined(game.find('Edge'))
    expect(edge.node.rotation.z).toBeCloseTo((40 * Math.PI) / 180, 6)

    step(180)

    // Toppled off its edge: lying flat means a rotation about z of a multiple of 90 degrees.
    const quarterTurns = edge.node.rotation.z / (Math.PI / 2)
    expect(Math.abs(quarterTurns - Math.round(quarterTurns))).toBeLessThan(0.02)
    expect(edge.position.y).toBeCloseTo(0.5, 1)
    const record = defined(worldOf(game).recordOf(edge))
    const q = record.body.rotation()
    expect(edge.node.quaternion.toArray()).toEqual([q.x, q.y, q.z, q.w])
  })

  it('honors gravityScale, damping, an initial velocity and the scene gravity', async () => {
    const { game, step } = await physicsFixture(
      [
        { name: 'Floater', position: [0, 10, -4], components: [{ type: 'Collider' }, { type: 'RigidBody', props: { gravityScale: 0 } }] },
        { name: 'Thrown', position: [0, 10, 0], components: [{ type: 'Collider' }, { type: 'RigidBody', props: { velocity: [6, 0, 0] } }] },
        { name: 'Heavy', position: [0, 10, 4], components: [{ type: 'Collider' }, { type: 'RigidBody', props: { velocity: [6, 0, 0], linearDamping: 4 } }] },
      ],
      { simulation: { gravity: [0, -9.81, 0] } },
    )

    step(60)

    expect(game.find('Floater')?.position.y).toBeCloseTo(10, 4)
    expect(game.find('Thrown')?.position.x).toBeCloseTo(6, 1)
    expect(game.find('Thrown')?.position.y).toBeCloseTo(10 - 0.5 * 9.81, 0)
    expect(defined(game.find('Heavy')).position.x).toBeLessThan(2)
    expect(defined(game.find('Heavy')).position.x).toBeGreaterThan(0)
  })

  it('floats everything in a scene without gravity', async () => {
    const { game, step } = await physicsFixture([crate('Crate', 4)], { simulation: { gravity: [0, 0, 0] } })

    step(60)

    expect(game.find('Crate')?.position.y).toBe(4)
  })
})

describe('RigidBody velocity and impulses (CA-14)', () => {
  it('keeps a body upright when its rotations are locked', async () => {
    const { game, step } = await physicsFixture([
      FLOOR,
      { name: 'Post', position: [0, 1.5, 0], rotation: [0, 0, 45], components: [{ type: 'Collider' }, { type: 'RigidBody', props: { lockRotations: true } }] },
    ])

    step(120)

    expect(game.find('Post')?.node.rotation.z).toBeCloseTo(Math.PI / 4, 4)
  })

  it('reads and sets the linear velocity and applies impulses to a dynamic body', async () => {
    const { game, step } = await physicsFixture([crate('Crate', 4)], { simulation: { gravity: [0, 0, 0] } })
    const body = defined(game.find('Crate')?.get(RigidBody))
    expect(body.linearVelocity).toEqual({ x: 0, y: 0, z: 0 })

    body.linearVelocity = { x: 1, y: 2, z: 3 }
    expect(body.linearVelocity).toEqual({ x: 1, y: 2, z: 3 })
    body.applyImpulse({ x: 0, y: 0, z: -3 })

    expect(body.linearVelocity.z).toBeCloseTo(0, 5)
    step(60)
    expect(game.find('Crate')?.position.x).toBeCloseTo(1, 1)
    expect(game.find('Crate')?.position.y).toBeCloseTo(4 + 2, 1)
    expect(body.grounded).toBe(false)
  })

  it('uses the mass: the same impulse moves a heavier body less', async () => {
    const { game } = await physicsFixture(
      [
        { name: 'Light', components: [{ type: 'Collider' }, { type: 'RigidBody', props: { mass: 1 } }] },
        { name: 'Heavy', components: [{ type: 'Collider' }, { type: 'RigidBody', props: { mass: 4 } }] },
      ],
      { simulation: { gravity: [0, 0, 0] } },
    )
    const light = defined(game.find('Light')?.get(RigidBody))
    const heavy = defined(game.find('Heavy')?.get(RigidBody))

    light.applyImpulse({ x: 4, y: 0, z: 0 })
    heavy.applyImpulse({ x: 4, y: 0, z: 0 })

    expect(light.linearVelocity.x).toBeCloseTo(4, 4)
    expect(heavy.linearVelocity.x).toBeCloseTo(1, 4)
  })
})

describe('RigidBody needs a Collider (CA-14)', () => {
  it('without a Collider creates no body and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game, step } = await physicsFixture([{ name: 'Ghost', position: [0, 5, 0], components: [{ type: 'RigidBody' }] }])

    step(5)

    const ghost = defined(game.find('Ghost'))
    expect(worldOf(game).recordOf(ghost)).toBeUndefined()
    expect(ghost.position.y).toBe(5)
    expect(defined(ghost.get(RigidBody)).linearVelocity).toEqual({ x: 0, y: 0, z: 0 })
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringContaining('RigidBody on "Ghost" needs a Collider'),
    ])
  })

  it('builds the body whichever order its two components were added in', async () => {
    const { game, step } = await physicsFixture([
      FLOOR,
      { name: 'Reversed', position: [0, 3, 0], components: [{ type: 'RigidBody' }, { type: 'Collider' }] },
    ])
    const warn = vi.spyOn(console, 'warn')

    step(120)

    expect(worldOf(game).recordOf(defined(game.find('Reversed')))?.kind).toBe('dynamic')
    expect(game.find('Reversed')?.position.y).toBeCloseTo(0.5, 2)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('RigidBody params Rapier cannot take (PR #161 review)', () => {
  it('creates no body and says why, once, for an unknown type, a malformed velocity, a non-positive mass or a non-finite scale', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game, step } = await physicsFixture([
      { name: 'Static', position: [0, 5, 0], components: [{ type: 'Collider' }, { type: 'RigidBody', props: { type: 'static' } }] },
      { name: 'Thrown', position: [2, 5, 0], components: [{ type: 'Collider' }, { type: 'RigidBody', props: { velocity: { x: 0, y: 5, z: 0 } } }] },
      { name: 'Weightless', position: [4, 5, 0], components: [{ type: 'Collider' }, { type: 'RigidBody', props: { mass: 0 } }] },
      { name: 'Scaled', position: [6, 5, 0], components: [{ type: 'Collider' }, { type: 'RigidBody', props: { gravityScale: 'none' } }] },
      { name: 'Fine', position: [8, 5, 0], components: [{ type: 'Collider' }, { type: 'RigidBody' }] },
    ])

    step(5)

    const world = worldOf(game)
    for (const name of ['Static', 'Thrown', 'Weightless', 'Scaled']) {
      expect(world.recordOf(defined(game.find(name))), name).toBeUndefined()
      expect(game.find(name)?.position.y, name).toBe(5)
    }
    expect(game.find('Fine')?.position.y).toBeLessThan(5)
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringContaining('RigidBody on "Static" creates no body: type must be dynamic or kinematic; got "static"'),
      expect.stringContaining('RigidBody on "Thrown" creates no body: velocity must be three finite numbers'),
      expect.stringContaining('RigidBody on "Weightless" creates no body: mass must be at least 0.001'),
      expect.stringContaining('RigidBody on "Scaled" creates no body: gravityScale must be a finite number'),
    ])
  })
})

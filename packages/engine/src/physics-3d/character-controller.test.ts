// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { RigidBody } from '../components/rigid-body.js'
import type { SceneEntityJson } from '../scene.js'
import { use3dTestEnvironment } from '../test-game-3d.js'
import { FLOOR, physicsFixture, type PhysicsFixture } from '../test-physics-3d.js'
import { defined } from '../test-support.js'

use3dTestEnvironment()

/** A kinematic capsule of radius 0.4 and height 1.8 standing on the floor (its centre 0.9 above y = 0). */
function walker(extra: Record<string, unknown> = {}, at: [number, number, number] = [0, 0.9, 0]): SceneEntityJson {
  return {
    name: 'Walker',
    position: at,
    components: [
      { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } },
      { type: 'RigidBody', props: { type: 'kinematic', ...extra } },
    ],
  }
}

/** A static box of the given full size, its bottom on the floor, centred at x (and z = 0). */
function block(name: string, size: [number, number, number], x: number): SceneEntityJson {
  return { name, position: [x, size[1] / 2, 0], components: [{ type: 'Collider', props: { size } }] }
}

const bodyOf = (fixture: PhysicsFixture): RigidBody => defined(fixture.game.find('Walker')?.get(RigidBody))
const positionOf = (fixture: PhysicsFixture): { x: number; y: number; z: number } => {
  const { x, y, z } = defined(fixture.game.find('Walker')).position
  return { x, y, z }
}

describe('a kinematic body on the floor (CA-19)', () => {
  it('stays at the same height and grounded for 120 steps', async () => {
    const fixture = await physicsFixture([FLOOR, walker()])
    // The floor was spawned with the walker: it already holds it up on the very first step.
    fixture.step(1)
    expect(positionOf(fixture).y).toBeGreaterThanOrEqual(0.9)
    fixture.step(19)
    const settled = positionOf(fixture).y

    fixture.step(100)

    expect(positionOf(fixture).y).toBeCloseTo(settled, 3)
    expect(positionOf(fixture).y).toBeCloseTo(0.9, 1)
    expect(bodyOf(fixture).grounded).toBe(true)
  })

  it('stops after falling onto the floor', async () => {
    const fixture = await physicsFixture([FLOOR, walker({}, [0, 5, 0])])
    expect(bodyOf(fixture).grounded).toBe(false)

    fixture.step(120)

    expect(positionOf(fixture).y).toBeCloseTo(0.9, 1)
    expect(bodyOf(fixture).grounded).toBe(true)
  })

  it('floats with a gravity scale of 0', async () => {
    const fixture = await physicsFixture([walker({ gravityScale: 0 }, [0, 5, 0])])

    fixture.step(60)

    expect(positionOf(fixture).y).toBe(5)
    expect(bodyOf(fixture).grounded).toBe(false)
  })

  it('has no rotation of its own: rotations are locked', async () => {
    const fixture = await physicsFixture([FLOOR, { ...walker(), rotation: [0, 0, 30] }])

    fixture.step(60)

    expect(defined(fixture.game.find('Walker')).node.rotation.z).toBeCloseTo((30 * Math.PI) / 180, 4)
  })
})

describe('walking (CA-19)', () => {
  it('moves at the desired velocity along x and z', async () => {
    const fixture = await physicsFixture([FLOOR, walker()])
    fixture.step(20)
    const start = positionOf(fixture)
    bodyOf(fixture).desiredVelocity = { x: 6, z: -3 }

    fixture.step(60)

    expect(positionOf(fixture).x - start.x).toBeCloseTo(6, 1)
    expect(positionOf(fixture).z - start.z).toBeCloseTo(-3, 1)
    expect(positionOf(fixture).y).toBeCloseTo(start.y, 2)
  })

  it('stops at the face of a wall one unit high', async () => {
    const fixture = await physicsFixture([FLOOR, block('Wall', [0.3, 1, 3], 3), walker()])
    bodyOf(fixture).desiredVelocity = { x: 6, z: 0 }

    fixture.step(180)

    // The wall face is at x = 2.85 and the capsule radius is 0.4; Rapier keeps a 0.01 skin.
    expect(positionOf(fixture).x).toBeGreaterThan(2.85 - 0.4 - 0.02)
    expect(positionOf(fixture).x).toBeLessThan(2.85 - 0.4 + 0.001)
  })
})

describe('walking into obstacles (CA-19)', () => {
  it('climbs a step of 0.3 and is stopped by one of 1.0', async () => {
    const low = await physicsFixture([FLOOR, block('Step', [2, 0.3, 4], 3), walker()])
    bodyOf(low).desiredVelocity = { x: 6, z: 0 }
    low.step(30)
    expect(positionOf(low).x).toBeGreaterThan(2.2)
    expect(positionOf(low).y).toBeCloseTo(0.3 + 0.9, 1)

    const high = await physicsFixture([FLOOR, block('Step', [2, 1, 4], 3), walker()])
    bodyOf(high).desiredVelocity = { x: 6, z: 0 }
    high.step(180)
    expect(positionOf(high).x).toBeLessThan(2 - 0.4 + 0.001)
    expect(positionOf(high).y).toBeCloseTo(0.9, 1)
  })

  it('is not blocked by a sensor volume', async () => {
    const zone: SceneEntityJson = {
      name: 'Zone',
      position: [3, 1, 0],
      components: [{ type: 'Collider', props: { sensor: true, size: [1, 2, 4] } }],
    }
    const fixture = await physicsFixture([FLOOR, zone, walker()])
    bodyOf(fixture).desiredVelocity = { x: 6, z: 0 }

    fixture.step(120)

    expect(positionOf(fixture).x).toBeGreaterThan(8)
  })
})

describe('jumping (CA-19)', () => {
  it('rises above the start and lands grounded within 90 steps', async () => {
    const fixture = await physicsFixture([FLOOR, walker()])
    fixture.step(20)
    const start = positionOf(fixture).y

    bodyOf(fixture).jump(6)
    fixture.step(20)
    expect(positionOf(fixture).y).toBeGreaterThan(start + 1)
    expect(bodyOf(fixture).grounded).toBe(false)

    fixture.step(70)
    expect(bodyOf(fixture).grounded).toBe(true)
    expect(positionOf(fixture).y).toBeCloseTo(start, 1)
  })

  it('does nothing in the air', async () => {
    const fixture = await physicsFixture([FLOOR, walker({}, [0, 5, 0])])
    fixture.step(5)
    const before = bodyOf(fixture).linearVelocity.y

    bodyOf(fixture).jump(6)
    fixture.step(1)

    expect(bodyOf(fixture).linearVelocity.y).toBeLessThan(before)
    expect(bodyOf(fixture).grounded).toBe(false)
  })

  it('stops rising when it hits a ceiling', async () => {
    const ceiling: SceneEntityJson = { name: 'Ceiling', position: [0, 2.6, 0], components: [{ type: 'Collider', props: { size: [4, 1, 4] } }] }
    const fixture = await physicsFixture([FLOOR, ceiling, walker()])
    fixture.step(20)

    bodyOf(fixture).jump(6)
    let highest = 0
    for (let frame = 0; frame < 40; frame += 1) {
      fixture.step(1)
      highest = Math.max(highest, positionOf(fixture).y)
    }

    // The ceiling's underside is at 2.1 and the capsule is 0.9 above its centre: no higher than 1.2 (plus the skin).
    expect(highest).toBeGreaterThan(1)
    expect(highest).toBeLessThan(1.2 + 0.05)
    // It fell back: the ceiling cut the jump short instead of holding it against the ceiling.
    expect(bodyOf(fixture).grounded).toBe(true)
  })
})

describe('kinematic bodies among others (CA-19)', () => {
  it('pushes a dynamic crate it walks into', async () => {
    const crate: SceneEntityJson = {
      name: 'Crate',
      position: [2, 0.5, 0],
      components: [{ type: 'Collider' }, { type: 'RigidBody' }],
    }
    const fixture = await physicsFixture([FLOOR, crate, walker()])
    bodyOf(fixture).desiredVelocity = { x: 3, z: 0 }

    fixture.step(120)

    expect(defined(fixture.game.find('Crate')).position.x).toBeGreaterThan(3)
  })

  it('follows the entity when game code teleports it', async () => {
    const fixture = await physicsFixture([FLOOR, walker()])
    fixture.step(10)

    defined(fixture.game.find('Walker')).position.set(10, 0.95, -4)
    fixture.step(30)

    expect(positionOf(fixture).x).toBeCloseTo(10, 2)
    expect(positionOf(fixture).z).toBeCloseTo(-4, 2)
    expect(positionOf(fixture).y).toBeCloseTo(0.9, 1)
  })
})

describe('kinematic bodies in the Runtime Snapshot and among dynamic ones (CA-19)', () => {
  it('reports its measured velocity and grounded state in the Runtime Snapshot', async () => {
    const fixture = await physicsFixture([FLOOR, walker()])
    fixture.step(20)
    bodyOf(fixture).desiredVelocity = { x: 6, z: 0 }

    fixture.step(10)

    const [, body] = defined(fixture.snapshot().physics).bodies
    expect(body).toMatchObject({ entity: 'Walker', type: 'kinematic', grounded: true })
    expect(body?.velocity[0]).toBeCloseTo(6, 1)
    expect(body?.velocity[1]).toBeCloseTo(0, 1)
  })

  it('ignores the controller params and desired velocity on a dynamic body', async () => {
    const crate: SceneEntityJson = { name: 'Walker', position: [0, 0.5, 0], components: [{ type: 'Collider' }, { type: 'RigidBody' }] }
    const fixture = await physicsFixture([FLOOR, crate])
    bodyOf(fixture).desiredVelocity = { x: 6, z: 0 }
    bodyOf(fixture).jump(6)

    fixture.step(60)

    expect(positionOf(fixture).x).toBeCloseTo(0, 1)
    expect(positionOf(fixture).y).toBeCloseTo(0.5, 1)
  })
})

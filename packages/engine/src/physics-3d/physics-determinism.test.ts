// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import type { SceneEntityJson } from '../scene.js'
import { use3dTestEnvironment } from '../test-game-3d.js'
import { md5 } from '../test-md5.js'
import { FLOOR, physicsFixture, worldOf, type PhysicsFixture } from '../test-physics-3d.js'

use3dTestEnvironment()

/** Ten stacks of twenty unit boxes standing on the floor: tall enough to wobble, topple and settle. */
function stackedBoxes(): SceneEntityJson[] {
  const boxes = Array.from({ length: 200 }, (_, index): SceneEntityJson => ({
    name: `Box${index}`,
    position: [(index % 10) * 1.2 - 5.4, 0.5 + Math.floor(index / 10) * 1.05, ((index * 7) % 5) * 0.03],
    components: [{ type: 'Collider' }, { type: 'RigidBody' }],
  }))
  return [FLOOR, ...boxes]
}

/** Every body's translation and rotation, in spawn order, exactly as Rapier holds them. */
function poses(fixture: PhysicsFixture): number[][] {
  return worldOf(fixture.game)
    .bodiesOf(fixture.game.entities)
    .map(({ body }) => {
      const t = body.translation()
      const q = body.rotation()
      return [t.x, t.y, t.z, q.x, q.y, q.z, q.w]
    })
}

/** md5 of every body's translation rounded to 1e-6, in spawn order. */
function positionHash(fixture: PhysicsFixture): string {
  const rounded = (value: number): string => (Math.round(value * 1e6) / 1e6).toFixed(6)
  return md5(
    worldOf(fixture.game)
      .bodiesOf(fixture.game.entities)
      .map(({ body }) => {
        const { x, y, z } = body.translation()
        return `${rounded(x)},${rounded(y)},${rounded(z)}`
      })
      .join(';'),
  )
}

describe('the simulation is deterministic (CA-11)', () => {
  it('gives two Games loading the same scene bit-identical bodies after 300 steps', async () => {
    const first = await physicsFixture(stackedBoxes())
    const second = await physicsFixture(stackedBoxes())

    first.step(300)
    second.step(300)

    expect(poses(first)).toEqual(poses(second))
    expect(poses(first)).toHaveLength(201)
    // The simulation actually ran: the top box of the first stack fell onto the stack below it.
    expect(first.game.find('Box190')?.position.y).toBeLessThan(0.5 + 19 * 1.05 - 0.5)
  })

  it('reaches the committed position hash on every platform: 200 stacked boxes, 300 steps', async () => {
    const fixture = await physicsFixture(stackedBoxes())

    fixture.step(300)

    expect(positionHash(fixture)).toBe('f3f6d146e88130818f3548d17ba253bb')
  })
})

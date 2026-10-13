// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import type { QueryVolume3d } from './index.js'
import type { SceneEntityJson } from './scene.js'
import { use3dTestEnvironment } from './test-game-3d.js'
import { physicsFixture } from './test-physics-3d.js'

// Issue #181 CA-16: a yawed box and the solid colliders, so a 3D melee strike finds bodies through game.query.area.

use3dTestEnvironment()

function block(name: string, at: [number, number, number], sensor = false): SceneEntityJson {
  return { name, position: at, components: [{ type: 'Collider', props: { size: [0.5, 0.5, 0.5], sensor } }] }
}

const names = (entities: { name: string }[]): string[] => entities.map((entity) => entity.name)

it('reads sensors only by default and every collider with colliders: all (CA-16)', async () => {
  const { game } = await physicsFixture([block('Solid', [0, 0, 1]), block('Trigger', [0, 0, -1], true)])
  const center = { x: 0, y: 0, z: 0 }
  const size = { x: 1, y: 1, z: 3 }

  expect(names(game.query.area({ shape: 'box', center, size }))).toEqual(['Trigger'])
  expect(names(game.query.area({ shape: 'box', center, size, colliders: 'all' }))).toEqual(['Solid', 'Trigger'])
  expect(names(game.query.area({ shape: 'sphere', center, radius: 1.2, colliders: 'all' }))).toEqual(['Solid', 'Trigger'])
})

it('turns a box by its yaw in degrees about +y (CA-16)', async () => {
  const { game } = await physicsFixture([block('East', [2, 0, 0]), block('South', [0, 0, 2])])
  const long = { shape: 'box' as const, center: { x: 0, y: 0, z: 0 }, size: { x: 0.6, y: 1, z: 5 }, colliders: 'all' as const }

  expect(names(game.query.area(long))).toEqual(['South'])
  expect(names(game.query.area({ ...long, yaw: 90 }))).toEqual(['East'])
})

it('finds nothing for a malformed yaw or collider domain (CA-16)', async () => {
  const { game } = await physicsFixture([block('Solid', [0, 0, 0])])
  const box = { shape: 'box' as const, center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }

  expect(game.query.area({ ...box, yaw: Number.NaN, colliders: 'all' as const })).toEqual([])
  expect(game.query.area({ ...box, colliders: 'solids' } as unknown as QueryVolume3d)).toEqual([])
})

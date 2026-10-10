// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Component } from './component.js'
import { Collider } from './components/collider.js'
import type { Entity } from './entity.js'
import type { Point3d, QueryVolume3d, RayHit3d } from './index.js'
import { loadScene } from './scene.js'
import type { SceneEntityJson } from './scene.js'
import type { EntityWith } from './spatial-query.js'
import { ready3dGame, registryOf, use3dTestEnvironment } from './test-game-3d.js'
import { FLOOR, physicsFixture } from './test-physics-3d.js'
import { defined } from './test-support.js'

use3dTestEnvironment()

class Tagged extends Component {
  static override componentName = 'Tagged'
}

const DOWN = { x: 0, y: -1, z: 0 }

function zone(name: string, at: [number, number, number], options: { size?: [number, number, number]; extra?: SceneEntityJson['components'] } = {}): SceneEntityJson {
  const { size = [2, 2, 2], extra = [] } = options
  return { name, position: at, components: [{ type: 'Collider', props: { sensor: true, size } }, ...(extra ?? [])] }
}

function solid(name: string, at: [number, number, number]): SceneEntityJson {
  return { name, position: at, components: [{ type: 'Collider' }] }
}

describe('game.query.ray in a 3D scene (CA-21)', () => {
  it('hits the first solid collider with its entity, distance, point and normal', async () => {
    const { game } = await physicsFixture([FLOOR, solid('Block', [0, 2.5, 0])])

    const hit = game.query.ray({ x: 0, y: 6, z: 0 }, DOWN, 10)

    expect(hit?.entity.name).toBe('Block')
    expect(hit?.collider).toBe(game.find('Block')?.get(Collider))
    expect(hit?.distance).toBeCloseTo(3, 5)
    expect(hit?.point).toMatchObject({ x: 0, y: 3, z: 0 })
    expect(hit?.normal).toMatchObject({ x: 0, y: 1, z: 0 })
  })

  it('misses beyond maxDistance, in the other direction and with no direction', async () => {
    const { game } = await physicsFixture([FLOOR])

    expect(game.query.ray({ x: 0, y: 6, z: 0 }, DOWN, 5)).toBeNull()
    expect(game.query.ray({ x: 0, y: 6, z: 0 }, { x: 0, y: 1, z: 0 }, 50)).toBeNull()
    expect(game.query.ray({ x: 0, y: 6, z: 0 }, { x: 0, y: 0, z: 0 }, 50)).toBeNull()
    expect(game.query.ray({ x: 0, y: 6, z: 0 }, DOWN, Number.NaN)).toBeNull()
  })

  it('measures in world units whatever the length of the direction', async () => {
    const { game } = await physicsFixture([FLOOR])

    expect(game.query.ray({ x: 0, y: 6, z: 0 }, { x: 0, y: -4, z: 0 }, 10)?.distance).toBeCloseTo(6, 5)
  })

  it('passes through sensors, which a ray never sees', async () => {
    const { game } = await physicsFixture([FLOOR, zone('Zone', [0, 3, 0])])

    expect(game.query.ray({ x: 0, y: 6, z: 0 }, DOWN, 10)?.entity.name).toBe('Floor')
  })

  it('applies the shared filter: with, without, exclude and where', async () => {
    const tagged: SceneEntityJson = { name: 'Tagged', position: [0, 2.5, 0], components: [{ type: 'Collider' }, { type: 'Tagged' }] }
    const { game } = await physicsFixture([FLOOR, tagged], { components: { Tagged } })
    const from = { x: 0, y: 6, z: 0 }

    expect(game.query.ray(from, DOWN, 10, { with: [Tagged] })?.entity.name).toBe('Tagged')
    expect(game.query.ray(from, DOWN, 10, { without: [Tagged] })?.entity.name).toBe('Floor')
    expect(game.query.ray(from, DOWN, 10, { exclude: game.find('Tagged') })?.entity.name).toBe('Floor')
    expect(game.query.ray(from, DOWN, 10, { where: (entity) => entity.name === 'Floor' })?.distance).toBeCloseTo(6, 5)
  })
})

describe('game.query.area and point in a 3D scene (CA-21)', () => {
  it('area returns the entities whose sensor colliders intersect a box or a sphere, in entity order', async () => {
    const { game } = await physicsFixture([zone('Near', [0, 1, 0]), zone('Far', [10, 1, 0]), solid('Solid', [0, 1, 1]), zone('Also', [1, 1, 0])])

    const inBox = game.query.area({ shape: 'box', center: { x: 0, y: 1, z: 0 }, size: { x: 4, y: 4, z: 4 } })
    const inBall = game.query.area({ shape: 'sphere', center: { x: 10, y: 1, z: 0 }, radius: 0.5 })

    expect(inBox.map((entity) => entity.name)).toEqual(['Near', 'Also'])
    expect(inBall.map((entity) => entity.name)).toEqual(['Far'])
    expect(game.query.area({ shape: 'box', center: { x: 50, y: 1, z: 0 }, size: { x: 1, y: 1, z: 1 } })).toEqual([])
  })

  it('area and point apply the shared filter', async () => {
    const tagged: SceneEntityJson = zone('Tagged', [0, 1, 0], { extra: [{ type: 'Tagged' }] })
    const { game } = await physicsFixture([zone('Plain', [0, 1, 0]), tagged], { components: { Tagged } })
    const volume = { shape: 'sphere', center: { x: 0, y: 1, z: 0 }, radius: 3 } as const

    expect(game.query.area(volume, { with: [Tagged] }).map((entity) => entity.name)).toEqual(['Tagged'])
    expect(game.query.area(volume, { without: [Tagged] }).map((entity) => entity.name)).toEqual(['Plain'])
    expect(game.query.point({ x: 0, y: 1, z: 0 }, { exclude: game.find('Plain') }).map((entity) => entity.name)).toEqual(['Tagged'])
  })

  it('point returns the entities whose sensor colliders contain it', async () => {
    const { game } = await physicsFixture([zone('Zone', [0, 1, 0]), solid('Solid', [5, 1, 0])])

    expect(game.query.point({ x: 0.5, y: 1.5, z: -0.5 }).map((entity) => entity.name)).toEqual(['Zone'])
    expect(game.query.point({ x: 3, y: 1, z: 0 })).toEqual([])
    expect(game.query.point({ x: 5, y: 1, z: 0 })).toEqual([])
  })
})

describe('game.query.nearest in a 3D scene (CA-21)', () => {
  it('finds the closest entity by transform, z included', async () => {
    const { game } = await physicsFixture([
      { name: 'Left', position: [-3, 0, 0] },
      { name: 'Behind', position: [0, 0, -2] },
      { name: 'High', position: [0, 1.5, 0] },
    ])

    expect(game.query.nearest({ x: 0, y: 0, z: 0 })?.name).toBe('High')
    expect(game.query.nearest({ x: 0, y: 0, z: -3 })?.name).toBe('Behind')
    expect(game.query.nearest({ x: -4, y: 0, z: 0 })?.name).toBe('Left')
  })

  it('honors maxDistance, the shared filter and a where predicate with the distance', async () => {
    const { game } = await physicsFixture([{ name: 'A', position: [3, 0, 4] }, { name: 'B', position: [0, 0, 20] }])
    const at = { x: 0, y: 0, z: 0 }

    expect(game.query.nearest(at, { maxDistance: 4 })).toBeNull()
    expect(game.query.nearest(at, { maxDistance: 5 })?.name).toBe('A')
    expect(game.query.nearest(at, { exclude: game.find('A') })?.name).toBe('B')
    expect(game.query.nearest(at, { where: (entity, { distance }) => entity.name === 'A' && distance === 5 })?.name).toBe('A')
  })
})

describe('the two forms of game.query stay in their space (CA-21)', () => {
  it('rejects a 3D form in a 2D scene with an error naming the space', async () => {
    const { game } = await ready3dGame()
    loadScene(game, { waicaScene: 3, entities: [] }, registryOf({}))

    expect(() => game.query.ray({ x: 0, y: 0, z: 0 }, DOWN, 1)).toThrow(/3D form.*2d/)
    expect(() => game.query.point({ x: 0, y: 0, z: 0 })).toThrow(/3D form.*2d/)
    expect(() => game.query.nearest({ x: 0, y: 0, z: 0 })).toThrow(/3D form.*2d/)
    expect(() => game.query.area({ shape: 'sphere', center: { x: 0, y: 0, z: 0 }, radius: 1 })).toThrow(/3D form.*2d/)
  })

  it('rejects a 2D form in a 3D scene with an error naming the space', async () => {
    const { game } = await physicsFixture([FLOOR])

    expect(() => game.query.ray(0, 5, 0, -1, 10)).toThrow(/2D form.*3d/)
    expect(() => game.query.point(0, 0)).toThrow(/2D form.*3d/)
    expect(() => game.query.nearest(0, 0)).toThrow(/2D form.*3d/)
    expect(() => game.query.area({ x: 0, y: 0, width: 1, height: 1, shape: 'rectangle' })).toThrow(/2D form.*3d/)
  })

  it('answers with nothing, not an error, while the physics module still loads', async () => {
    const { game } = await physicsFixture([zone('Zone', [0, 1, 0])], { game: { physics: () => new Promise(() => {}) }, settle: false })

    expect(game.query.point({ x: 0, y: 1, z: 0 })).toEqual([])
    expect(game.query.ray({ x: 0, y: 5, z: 0 }, DOWN, 10)).toBeNull()
    expect(defined(game.find('Zone'))).toBeDefined()
  })
})

describe('game.query.area validates its volume (PR #163 finding 5)', () => {
  it('answers with nothing, not an error, for a volume that is not a finite box or sphere', async () => {
    const { game } = await physicsFixture([zone('Zone', [0, 1, 0])])
    const center = { x: 0, y: 1, z: 0 }
    const bad: unknown[] = [
      { shape: 'box', center },
      { shape: 'cone', center, radius: 1 },
      { shape: 'sphere', center: { x: Number.NaN, y: 1, z: 0 }, radius: 1 },
      { shape: 'box', center, size: { x: -1, y: 1, z: 1 } },
      { shape: 'sphere', center, radius: 0 },
      { shape: 'sphere', center, radius: Number.POSITIVE_INFINITY },
    ]
    for (const volume of bad) expect(game.query.area(volume as QueryVolume3d), JSON.stringify(volume)).toEqual([])
    expect(game.query.area({ shape: 'sphere', center, radius: 1 }).map((entity) => entity.name)).toEqual(['Zone'])
  })
})

describe('the where predicate runs outside Rapier (PR #163 finding 4)', () => {
  it('may destroy an entity with a collider and the world stays usable', async () => {
    const { game } = await physicsFixture([FLOOR, zone('A', [0, 1, 0]), zone('B', [0, 1, 0]), solid('Block', [0, 2.5, 0])])
    const at = { x: 0, y: 1, z: 0 }

    const found = game.query.point(at, {
      where: (entity) => {
        game.find('B')?.destroy()
        return entity.alive
      },
    })
    expect(found.map((entity) => entity.name)).toEqual(['A'])
    expect(game.find('B')).toBeUndefined()

    const hit = game.query.ray({ x: 0, y: 6, z: 0 }, DOWN, 10, {
      where: (entity) => {
        game.find('Block')?.destroy()
        return entity.alive
      },
    })
    expect(hit?.entity.name).toBe('Floor')
    expect(game.find('Block')).toBeUndefined()
    expect(game.query.area({ shape: 'sphere', center: at, radius: 2 }).map((entity) => entity.name)).toEqual(['A'])
  })

  it('lets an error in the predicate reach the caller, and the world stays usable', async () => {
    const { game } = await physicsFixture([FLOOR, zone('Zone', [0, 1, 0])])
    const boom = (): boolean => {
      throw new Error('a bug in where')
    }

    expect(() => game.query.ray({ x: 0, y: 6, z: 0 }, DOWN, 10, { where: boom })).toThrow('a bug in where')
    expect(() => game.query.point({ x: 0, y: 1, z: 0 }, { where: boom })).toThrow('a bug in where')
    expect(() => game.query.area({ shape: 'sphere', center: { x: 0, y: 1, z: 0 }, radius: 1 }, { where: boom })).toThrow('a bug in where')
    expect(game.query.ray({ x: 0, y: 6, z: 0 }, DOWN, 10)?.entity.name).toBe('Floor')
    expect(game.query.point({ x: 0, y: 1, z: 0 }).map((entity) => entity.name)).toEqual(['Zone'])
  })
})

describe('the 3D forms narrow through a type guard like the 2D ones (PR #163 finding 8)', () => {
  it('returns the guarded type from ray, area, point and nearest', async () => {
    const tagged: SceneEntityJson = { name: 'Tagged', position: [0, 2.5, 0], components: [{ type: 'Collider' }, { type: 'Tagged' }] }
    const { game } = await physicsFixture([FLOOR, tagged, zone('Zone', [0, 1, 0], { extra: [{ type: 'Tagged' }] })], { components: { Tagged } })
    const isTagged = (entity: Entity): entity is EntityWith<[typeof Tagged]> => entity.has(Tagged)
    const origin: Point3d = { x: 0, y: 6, z: 0 }

    const hit: RayHit3d<EntityWith<[typeof Tagged]>> | null = game.query.ray(origin, DOWN, 10, { where: isTagged })
    const inVolume: EntityWith<[typeof Tagged]>[] = game.query.area({ shape: 'sphere', center: { x: 0, y: 1, z: 0 }, radius: 1 }, { where: isTagged })
    const atPoint: EntityWith<[typeof Tagged]>[] = game.query.point({ x: 0, y: 1, z: 0 }, { where: isTagged })
    const closest: EntityWith<[typeof Tagged]> | null = game.query.nearest({ x: 0, y: 2.5, z: 0 }, { where: isTagged })

    expect(hit?.entity.get(Tagged)).toBeInstanceOf(Tagged)
    expect(inVolume.map((entity) => entity.name)).toEqual(['Zone'])
    expect(atPoint.map((entity) => entity.name)).toEqual(['Zone'])
    expect(closest?.name).toBe('Tagged')
  })
})

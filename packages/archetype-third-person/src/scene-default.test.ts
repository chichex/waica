import { expect, it } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
import { THIRD_PERSON_PREFABS } from './prefabs'
import { THIRD_PERSON_BLANK_SCENE, THIRD_PERSON_SCENE } from './scene-default'

// Issue #181 CA-26: the blank scene and the dungeon courtyard demo.

const byPrefab = (entities: SceneEntityJson[], prefab: string): SceneEntityJson[] => entities.filter((entity) => entity.prefab === prefab)
const heightOf = (entity: SceneEntityJson): number => Number(entity.scale?.[1] ?? 1) * 2

it('builds the courtyard from level pieces: walls, a step, a raised platform, columns and floor (CA-26)', () => {
  const { entities } = THIRD_PERSON_SCENE
  expect(byPrefab(entities, 'tiles/wall').length).toBeGreaterThanOrEqual(16)
  expect(byPrefab(entities, 'tiles/floor').length).toBeGreaterThanOrEqual(16)
  expect(byPrefab(entities, 'tiles/column').length).toBeGreaterThanOrEqual(1)
  const blocks = byPrefab(entities, 'tiles/step')
  const step = blocks.find((entity) => heightOf(entity) <= 0.3)
  const platform = blocks.find((entity) => heightOf(entity) > 0.3)
  // A body climbs 0.3 at a time (RigidBody.stepHeight): the step reaches the platform, the platform the chest.
  expect(step && heightOf(step)).toBeCloseTo(0.25, 6)
  expect(platform && heightOf(platform)).toBeCloseTo(0.5, 6)
})

it('places three skeletons, two checkpoints, at least two torches and one goal chest on the platform (CA-26)', () => {
  const { entities } = THIRD_PERSON_SCENE
  expect(byPrefab(entities, 'characters/skeleton')).toHaveLength(3)
  expect(byPrefab(entities, 'objects/checkpoint')).toHaveLength(2)
  expect(byPrefab(entities, 'tiles/torch').length).toBeGreaterThanOrEqual(2)
  const chests = byPrefab(entities, 'objects/goal-chest')
  expect(chests).toHaveLength(1)
  const platform = entities.find((entity) => entity.name === 'Platform')
  expect(chests[0]?.position?.[0]).toBe(platform?.position?.[0])
  expect(chests[0]?.position?.[1]).toBeCloseTo(0.5, 6)
  expect(byPrefab(entities, 'characters/player')).toHaveLength(1)
})

it('gives the blank scene a ground plane, a Sun, the player and the following camera (CA-26)', () => {
  const { entities, camera } = THIRD_PERSON_BLANK_SCENE
  const types = (entity: SceneEntityJson): string[] => (entity.components ?? []).map((component) => component.type)
  expect(entities.map((entity) => entity.name)).toEqual(['Ground', 'Sun', 'Player'])
  expect(types(entities[0] ?? { name: '' })).toEqual(['Model', 'Collider'])
  expect(types(entities[1] ?? { name: '' })).toEqual(['Sun'])
  expect(entities[2]?.prefab).toBe('characters/player')
  expect(camera).toMatchObject({ kind: 'perspective', follow: 'Player' })
})

/** A skeleton's patrol rail on xz (its Patrol, prefab props under the entity's overrides) and its Chaser.range. */
function railOf(skeleton: SceneEntityJson): { from: [number, number]; to: [number, number]; range: number } {
  const prefab = THIRD_PERSON_PREFABS[skeleton.prefab ?? '']
  const props = (type: string): Record<string, unknown> => ({
    ...(prefab?.components.find((component) => component.type === type)?.props ?? {}),
    ...(skeleton.overrides?.[type] ?? {}),
  })
  const patrol = props('Patrol')
  const [x = 0, , z = 0] = skeleton.position ?? []
  const reach = Number(patrol.distance ?? 3)
  const vertical = patrol.axis === 'vertical'
  return {
    from: vertical ? [x, z - reach] : [x - reach, z],
    to: vertical ? [x, z + reach] : [x + reach, z],
    range: Number(props('Chaser').range ?? 0),
  }
}

/** The nearest a point gets to a segment on xz. */
function distanceToRail([px, pz]: [number, number], { from: [ax, az], to: [bx, bz] }: { from: [number, number]; to: [number, number] }): number {
  const length = (bx - ax) ** 2 + (bz - az) ** 2
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / length))
  return Math.hypot(px - (ax + t * (bx - ax)), pz - (az + t * (bz - az)))
}

it('starts calm: no skeleton patrols within Chaser.range of the spawn or of either checkpoint (CA-26)', () => {
  const { entities } = THIRD_PERSON_SCENE
  const xz = (entity: SceneEntityJson): [number, number] => [entity.position?.[0] ?? 0, entity.position?.[2] ?? 0]
  const quiet = [defined(entities.find((entity) => entity.name === 'Player')), ...byPrefab(entities, 'objects/checkpoint')]

  for (const skeleton of byPrefab(entities, 'characters/skeleton')) {
    const rail = railOf(skeleton)
    expect(rail.range, skeleton.name).toBeGreaterThan(0)
    for (const place of quiet) {
      expect(distanceToRail(xz(place), rail), `${skeleton.name} to ${place.name}`).toBeGreaterThan(rail.range)
    }
  }
})

function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value')
  return value
}

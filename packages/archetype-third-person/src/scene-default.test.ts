import { expect, it } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
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

// Issue #204 CA-14 / I-6: one spot over the courtyard centre, in addition to the four torches.
const SHADOW_PARAMS = ['castShadows', 'shadowMapSize', 'shadowMaxDistance', 'shadowBias', 'shadowNormalBias', 'shadowRadius']
const spotsOf = (entities: SceneEntityJson[]): SceneEntityJson[] =>
  entities.filter((entity) => entity.components?.some((component) => component.type === 'SpotLight'))

it('lights the courtyard centre with one spot pointing down, with a finite reach and default shadows (CA-14)', () => {
  const spots = spotsOf(THIRD_PERSON_SCENE.entities)
  expect(spots.map((entity) => entity.name)).toEqual(['Courtyard Spot'])
  const spot = spots[0]
  const [x, y, z] = spot?.position ?? []
  const props = spot?.components?.find((component) => component.type === 'SpotLight')?.props ?? {}
  // Centred over the yard (its walls stand on +-10), clear of the 4-high walls and columns.
  expect([x, z]).toEqual([0, 0])
  expect(y).toBeGreaterThan(4)
  expect(props.direction).toEqual([0, -1, 0])
  // A finite distance is what the editor draws as a cone; it reaches the floor it hangs over.
  expect(props.distance).toBeGreaterThan(Number(y))
  expect(props.intensity).toBeGreaterThan(0)
  // Shadows stay at the scene's policy: nothing overrides them on the entity.
  for (const key of SHADOW_PARAMS) expect(props, key).not.toHaveProperty(key)
  expect(spot?.prefab).toBeUndefined()
  expect(spot?.overrides).toBeUndefined()
})

it('keeps the four torches next to the spot and gives the blank scene no spot (CA-14)', () => {
  expect(byPrefab(THIRD_PERSON_SCENE.entities, 'tiles/torch').map((entity) => entity.name)).toEqual(['Torch NW', 'Torch NE', 'Torch SW', 'Torch SE'])
  expect(spotsOf(THIRD_PERSON_BLANK_SCENE.entities)).toEqual([])
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

// The calm-start invariant lives in scene-checkpoints.test.ts, measured where the Player stands.

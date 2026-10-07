import { expect, it } from 'vitest'
import { lightVisibility, type LightField, type OccluderGrid, type SceneEntityJson } from '@waica/engine'
import { ARCHETYPE } from './manifest'
import { ISOMETRIC_PREFABS } from './prefabs'
import { ISOMETRIC_DUNGEON_SCENE } from './dungeon'
import { ISOMETRIC_CAVE_SCENE, ISOMETRIC_SCENE } from './scene-default'
import { defined } from '../../engine/src/test-support'

interface GroundOverride {
  mapWidth: number
  mapHeight: number
  cells: number[]
}

function componentProps(prefab: string, type: string): Record<string, unknown> {
  return defined(defined(defined(ISOMETRIC_PREFABS[prefab]).components.find((c) => c.type === type)).props)
}

function torches(): SceneEntityJson[] {
  return ISOMETRIC_DUNGEON_SCENE.entities.filter((entity) => entity.prefab === 'objects/torch')
}

/** The dungeon ground's solid cells as the light-map sees them (cell size 1, origin 0). */
function dungeonGrid(): OccluderGrid {
  const ground = defined(ISOMETRIC_DUNGEON_SCENE.entities.find((entity) => entity.name === 'Ground'))
  const map = ground.overrides?.['Tilemap'] as unknown as GroundOverride
  const solidTiles = new Set(componentProps('tiles/ground', 'Tilemap')['solidTiles'] as number[])
  return {
    originX: 0,
    originY: 0,
    cellSize: 1,
    columns: map.mapWidth,
    rows: map.mapHeight,
    solid: Uint8Array.from(map.cells, (tile) => (solidTiles.has(tile) ? 1 : 0)),
  }
}

function torchLight(entity: SceneEntityJson): LightField {
  const props = componentProps('objects/torch', 'Light')
  const [x, y] = defined(entity.position)
  return {
    x,
    y,
    radius: props['radius'] as number,
    color: [1, 1, 1],
    intensity: 1,
    bands: 0,
    softness: 0,
    castShadows: true,
  }
}

it('dungeon (CA-14): is an extra scene of the archetype, lit with a low Ambient Light and a vignette', () => {
  expect(ARCHETYPE.extraScenes).toEqual({ cave: ISOMETRIC_CAVE_SCENE, dungeon: ISOMETRIC_DUNGEON_SCENE })
  const render = defined(ISOMETRIC_DUNGEON_SCENE.render)
  expect(render.projection).toBe('isometric')
  expect(defined(render.lighting?.ambient?.intensity)).toBeLessThan(0.5)
  expect(render.post?.vignette).toBeDefined()
  for (const entity of ISOMETRIC_DUNGEON_SCENE.entities) {
    expect(ISOMETRIC_PREFABS[defined(entity.prefab)], entity.name).toBeDefined()
  }
})

it('dungeon (CA-14): has at least two torches, each a Light with an Emissive flame', () => {
  expect(torches().length).toBeGreaterThanOrEqual(2)
  expect(componentProps('objects/torch', 'Light')['radius']).toBeGreaterThan(0)
  expect(componentProps('objects/torch', 'Sprite')['emissive']).toBe(true)
})

it('dungeon (CA-14): puts solid wall tiles between its torches and a chamber behind them', () => {
  const grid = dungeonGrid()
  const lights = torches().map(torchLight)
  // A point every torch reaches by distance but no torch sees: the wall is what darkens it.
  const shadowed = { x: 6.5, y: 4.5 }
  for (const light of lights) {
    expect(Math.hypot(shadowed.x - light.x, shadowed.y - light.y)).toBeLessThan(light.radius)
    expect(lightVisibility(grid, light, shadowed)).toBe(0)
  }
  const lit = { x: 3.5, y: 4.5 }
  expect(lights.some((light) => lightVisibility(grid, light, lit) === 1)).toBe(true)
})

it('dungeon (CA-14): is reached from the cave by a Scene Transition and leads back to it', () => {
  const caveDoors = ISOMETRIC_CAVE_SCENE.entities.filter((entity) => entity.prefab === 'objects/door')
  expect(caveDoors.map((door) => door.overrides?.['SceneTransition'])).toContainEqual({ scene: 'dungeon' })
  const back = ISOMETRIC_DUNGEON_SCENE.entities.filter((entity) => entity.prefab === 'objects/door')
  expect(back.map((door) => door.overrides?.['SceneTransition'])).toEqual([{ scene: 'cave' }])
})

it('dungeon (CA-14): leaves main and cave unlit, with no Post Effect', () => {
  for (const scene of [ISOMETRIC_SCENE, ISOMETRIC_CAVE_SCENE]) {
    expect(scene.render).toEqual({ sort: 'y', projection: 'isometric' })
  }
})

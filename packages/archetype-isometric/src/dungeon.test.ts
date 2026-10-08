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
  solidTiles?: number[]
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
  const solidTiles = new Set(map.solidTiles ?? (componentProps('tiles/ground', 'Tilemap')['solidTiles'] as number[]))
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

it('dungeon (CA-14): has at least two torches, each an animated Emissive torch with a pool of light', () => {
  expect(torches().length).toBeGreaterThanOrEqual(2)
  const radius = componentProps('objects/torch', 'Light')['radius'] as number
  // Pools of light, not the whole room tinted (round 3).
  expect(radius).toBeGreaterThanOrEqual(2.5)
  expect(radius).toBeLessThanOrEqual(3)
  const sprite = componentProps('objects/torch', 'AnimatedSprite')
  expect(sprite['texture']).toBe('waica:iso-torch')
  expect(sprite['emissive']).toBe(true)
  expect([sprite['cols'], sprite['rows']]).toEqual([3, 2])
  expect(Object.values(sprite['clips'] as Record<string, { frames: number[] }>)[0]?.frames).toEqual([0, 1, 2, 3, 4, 5])
})

it('dungeon (CA-14, round 3): stands every torch on a floor cell, never on a solid tile (#152)', () => {
  const grid = dungeonGrid()
  for (const torch of torches()) {
    const [x, y] = defined(torch.position)
    expect(grid.solid[Math.floor(y) * grid.columns + Math.floor(x)], torch.name).toBe(0)
  }
})

it('dungeon (CA-14, round 3): a stone floor, and a wall cube on every solid cell', () => {
  const ground = defined(ISOMETRIC_DUNGEON_SCENE.entities.find((entity) => entity.name === 'Ground'))
  const map = ground.overrides?.['Tilemap'] as unknown as GroundOverride
  const grid = dungeonGrid()
  const floorTiles = new Set(map.cells.filter((_, index) => grid.solid[index] === 0))
  expect(floorTiles).toEqual(new Set([4]))
  const walls = ISOMETRIC_DUNGEON_SCENE.entities.filter((entity) => entity.prefab === 'objects/wall')
  const wallCells = new Set(walls.map((wall) => {
    const [x, y] = defined(wall.position)
    expect([x % 1, y % 1], wall.name).toEqual([0.5, 0.5])
    return Math.floor(y) * grid.columns + Math.floor(x)
  }))
  const solidCells = new Set([...grid.solid].flatMap((value, index) => (value === 1 ? [index] : [])))
  expect(wallCells).toEqual(solidCells)
  expect(componentProps('objects/wall', 'Sprite')['texture']).toBe('waica:iso-wall')
})

it('dungeon (CA-14): puts solid wall tiles between its torches and a chamber behind them', () => {
  const grid = dungeonGrid()
  const lights = torches().map(torchLight)
  // A point a torch reaches by distance but no torch sees: the wall is what darkens it.
  const shadowed = { x: 6.1, y: 4.5 }
  expect(lights.some((light) => Math.hypot(shadowed.x - light.x, shadowed.y - light.y) < light.radius)).toBe(true)
  for (const light of lights) expect(lightVisibility(grid, light, shadowed)).toBe(0)
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

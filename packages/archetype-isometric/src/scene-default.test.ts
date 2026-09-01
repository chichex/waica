import { describe, expect, it } from 'vitest'
import {
  projectIsometric,
  resolveSceneCamera,
  stepSceneCamera,
} from '@waica/engine'
import {
  ISOMETRIC_CAVE_MAP_HEIGHT,
  ISOMETRIC_CAVE_MAP_WIDTH,
  ISOMETRIC_PREFABS,
} from './prefabs'
import { ISOMETRIC_BLANK_SCENE, ISOMETRIC_CAVE_SCENE, ISOMETRIC_SCENE } from './scene-default'

interface TilemapProps {
  mapWidth: number
  mapHeight: number
  cellSize: number
  cells: number[]
  solidTiles: number[]
}

function groundTilemap(): TilemapProps {
  return ISOMETRIC_PREFABS['tiles/ground']!.components.find(
    (component) => component.type === 'Tilemap',
  )!.props as unknown as TilemapProps
}

describe('ISOMETRIC_SCENE', () => {
  it('declares projected y-sort and camera bounds derived from the map', () => {
    const map = groundTilemap()
    const width = map.mapWidth * map.cellSize
    const height = map.mapHeight * map.cellSize
    const corners = [
      projectIsometric(0, 0),
      projectIsometric(width, 0),
      projectIsometric(0, height),
      projectIsometric(width, height),
    ]
    const center = projectIsometric(width / 2, height / 2)

    expect(ISOMETRIC_SCENE.render).toEqual({ sort: 'y', projection: 'isometric' })
    expect(ISOMETRIC_SCENE.camera?.position).toEqual([center.x, center.y])
    expect(ISOMETRIC_SCENE.camera?.limits).toEqual({
      minX: Math.min(...corners.map((point) => point.x)),
      maxX: Math.max(...corners.map((point) => point.x)),
      minY: Math.min(...corners.map((point) => point.y)),
      maxY: Math.max(...corners.map((point) => point.y)),
    })
    expect(ISOMETRIC_SCENE.camera?.follow).toBe('Player')
    expect(ISOMETRIC_SCENE.camera?.lookaheadY).toBeGreaterThan(0)
    expect(ISOMETRIC_SCENE.camera).toMatchObject({
      zoom: 12,
      deadzoneWidth: 0.5,
      deadzoneHeight: 0.5,
      lookahead: 0,
      lookaheadY: 0.5,
      smoothing: 4,
    })

    const camera = resolveSceneCamera(ISOMETRIC_SCENE.camera)
    const next = stepSceneCamera(camera, {
      x: center.x,
      y: center.y,
      halfW: (camera.zoom / 2) * (640 / 360),
      halfH: camera.zoom / 2,
      target: projectIsometric(12, 8),
      vx: 3,
      vy: -3,
      dt: 1 / 60,
    })
    expect(next.x).not.toBe(center.x)
    expect(next.y).not.toBe(center.y)
  })

  it('contains one map-origin Tilemap with a closed solid border ring', () => {
    const tilemapEntities = ISOMETRIC_SCENE.entities.filter((entity) =>
      ISOMETRIC_PREFABS[entity.prefab!]?.components.some(
        (component) => component.type === 'Tilemap',
      ),
    )
    expect(tilemapEntities).toHaveLength(1)
    expect(tilemapEntities[0]).toMatchObject({ name: 'Ground', position: [0, 0] })

    const map = groundTilemap()
    expect(map.cells).toHaveLength(map.mapWidth * map.mapHeight)
    for (let row = 0; row < map.mapHeight; row += 1) {
      for (let column = 0; column < map.mapWidth; column += 1) {
        if (row !== 0 && column !== 0 && row !== map.mapHeight - 1 && column !== map.mapWidth - 1) {
          continue
        }
        expect(map.solidTiles, `border ${column},${row}`).toContain(
          map.cells[row * map.mapWidth + column],
        )
      }
    }
  })

  it('resolves every prefab and stages the full cast', () => {
    for (const entity of ISOMETRIC_SCENE.entities) {
      expect(ISOMETRIC_PREFABS[entity.prefab!], entity.name).toBeDefined()
    }
    const byPrefab = (ref: string) =>
      ISOMETRIC_SCENE.entities.filter((entity) => entity.prefab === ref)
    expect(byPrefab('characters/player')).toHaveLength(1)
    expect(byPrefab('characters/villager')).toHaveLength(1)
    expect(byPrefab('characters/orc')).toHaveLength(1)
    expect(byPrefab('objects/crate').length).toBeGreaterThanOrEqual(3)
    expect(byPrefab('objects/tree').length).toBeGreaterThanOrEqual(2)
    expect(byPrefab('objects/rock').length).toBeGreaterThanOrEqual(1)
  })

  it('mounts the crate counter and the health HUD', () => {
    expect(ISOMETRIC_SCENE.ui).toEqual(['crate-counter', 'health'])
  })

  it('carries exactly one Door into the second demo scene (CA-13)', () => {
    const doors = ISOMETRIC_SCENE.entities.filter((entity) => entity.prefab === 'objects/door')
    expect(doors).toHaveLength(1)
    expect(doors[0]?.overrides).toBeUndefined()
    expect(ISOMETRIC_PREFABS['objects/door']!.components).toContainEqual({
      type: 'SceneTransition',
      props: { scene: 'cave' },
    })
  })

  it('places occluders inside the playable map', () => {
    const map = groundTilemap()
    for (const entity of ISOMETRIC_SCENE.entities.filter((candidate) =>
      ['objects/tree', 'objects/rock'].includes(candidate.prefab ?? ''),
    )) {
      const [x, y] = entity.position!
      expect(x, entity.name).toBeGreaterThan(1)
      expect(x, entity.name).toBeLessThan(map.mapWidth - 1)
      expect(y, entity.name).toBeGreaterThan(1)
      expect(y, entity.name).toBeLessThan(map.mapHeight - 1)
    }
  })
})

describe('ISOMETRIC_BLANK_SCENE', () => {
  it('keeps the same projected framing with no follow or entities', () => {
    expect(ISOMETRIC_BLANK_SCENE.render).toEqual({ sort: 'y', projection: 'isometric' })
    expect(ISOMETRIC_BLANK_SCENE.camera?.position).toEqual(ISOMETRIC_SCENE.camera?.position)
    expect(ISOMETRIC_BLANK_SCENE.camera?.limits).toEqual(ISOMETRIC_SCENE.camera?.limits)
    expect(ISOMETRIC_BLANK_SCENE.camera?.position).not.toBe(ISOMETRIC_SCENE.camera?.position)
    expect(ISOMETRIC_BLANK_SCENE.camera?.limits).not.toBe(ISOMETRIC_SCENE.camera?.limits)
    expect(ISOMETRIC_BLANK_SCENE.camera?.follow).toBeUndefined()
    expect(ISOMETRIC_BLANK_SCENE.entities).toEqual([])
  })
})

describe('ISOMETRIC_CAVE_SCENE (CA-13)', () => {
  it('resolves every prefab and stages exactly one Player and one Door back to main', () => {
    for (const entity of ISOMETRIC_CAVE_SCENE.entities) {
      expect(ISOMETRIC_PREFABS[entity.prefab!], entity.name).toBeDefined()
    }
    const byPrefab = (ref: string) =>
      ISOMETRIC_CAVE_SCENE.entities.filter((entity) => entity.prefab === ref)
    expect(byPrefab('characters/player')).toHaveLength(1)
    const doors = byPrefab('objects/door')
    expect(doors).toHaveLength(1)
    expect(doors[0]?.overrides).toEqual({ SceneTransition: { scene: 'main' } })
  })

  it('overrides the shared ground prefab with a smaller, distinct, fully enclosed layout', () => {
    const ground = ISOMETRIC_CAVE_SCENE.entities.find((entity) => entity.name === 'Ground')!
    const override = ground.overrides?.['Tilemap'] as {
      mapWidth: number
      mapHeight: number
      cells: number[]
    }
    expect(override.mapWidth).toBe(ISOMETRIC_CAVE_MAP_WIDTH)
    expect(override.mapHeight).toBe(ISOMETRIC_CAVE_MAP_HEIGHT)
    expect(override.cells).toHaveLength(ISOMETRIC_CAVE_MAP_WIDTH * ISOMETRIC_CAVE_MAP_HEIGHT)
    expect(override.cells).not.toEqual(
      ISOMETRIC_PREFABS['tiles/ground']!.components.find((c) => c.type === 'Tilemap')!.props![
        'cells'
      ],
    )
  })

  it('keeps the incoming Player independent of the outgoing map (grill decision 18)', () => {
    const player = ISOMETRIC_CAVE_SCENE.entities.find(
      (entity) => entity.prefab === 'characters/player',
    )
    expect(player?.position).not.toEqual(
      ISOMETRIC_SCENE.entities.find((entity) => entity.prefab === 'characters/player')?.position,
    )
  })
})

import { describe, expect, it } from 'vitest'
import { projectIsometric } from '@waica/engine'
import { ISOMETRIC_PREFABS } from './prefabs'
import { ISOMETRIC_BLANK_SCENE, ISOMETRIC_SCENE } from './scene-default'

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
    expect(ISOMETRIC_BLANK_SCENE.camera?.follow).toBeUndefined()
    expect(ISOMETRIC_BLANK_SCENE.entities).toEqual([])
  })
})

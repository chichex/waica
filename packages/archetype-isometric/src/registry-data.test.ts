import { describe, expect, it } from 'vitest'
import { authoringDefaults } from '@waica/engine'
import { ISOMETRIC_PREFABS } from './prefabs'
import { ISOMETRIC_PALETTE, ISOMETRIC_REGISTRY_DATA } from './registry-data'

const RECTANGLE_TRIANGLE = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0, 0.5],
]

const EXPECTED_DEFAULTS: Record<string, Record<string, unknown>> = {
  Sprite: {
    pixelArt: false,
    width: 1,
    height: 1,
    color: 0xffffff,
    offsetX: 0,
    offsetY: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    layer: 0,
    shape: 'rectangle',
  },
  AnimatedSprite: {
    texture: '',
    cols: 1,
    rows: 1,
    gridOffsetX: 0,
    gridOffsetY: 0,
    spacingX: 0,
    spacingY: 0,
    cellWidth: 0,
    cellHeight: 0,
    cells: [],
    extraSheets: [],
    pixelArt: true,
    clips: {},
    width: 1,
    height: 1,
    offsetX: 0,
    offsetY: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    layer: 0,
  },
  Tilemap: {
    texture: '',
    color: 0xffffff,
    cols: 1,
    rows: 1,
    gridOffsetX: 0,
    gridOffsetY: 0,
    spacingX: 0,
    spacingY: 0,
    cellWidth: 0,
    cellHeight: 0,
    pixelArt: true,
    mapWidth: 1,
    mapHeight: 1,
    cellSize: 1,
    cells: [],
    solidTiles: [],
    layer: 0,
  },
  Solid: {
    shape: 'rectangle',
    width: 1,
    height: 1,
    offsetX: 0,
    offsetY: 0,
    points: RECTANGLE_TRIANGLE,
  },
  Hitbox: {
    shape: 'rectangle',
    width: 1,
    height: 1,
    offsetX: 0,
    offsetY: 0,
    points: RECTANGLE_TRIANGLE,
  },
  StateMachine: { role: '', initial: '', states: {} },
  IsoMotor: {
    moveSpeed: 6,
    acceleration: 60,
    deceleration: 80,
    walkThreshold: 0.5,
    hitboxWidth: 0.9,
    hitboxHeight: 0.6,
  },
  Interactable: { line: 'Hello, traveler!', radius: 1.5 },
  Collectible: { value: 1, stat: 'points' },
  Patrol: { axis: 'horizontal', distance: 3, speed: 2 },
  Chaser: {
    mode: 'walker',
    range: 6,
    speed: 3,
    gravity: 42,
  },
  Hazard: {
    stompable: true,
    bounce: 10,
    stompDamage: 1,
    contactDamage: 1,
  },
  Health: { max: 3, invulnerability: 0 },
  Respawnable: {},
  Lifetime: { seconds: 1 },
}

describe('ISOMETRIC_REGISTRY_DATA', () => {
  it('reports only the authorable defaults for its exact component set', () => {
    expect(Object.keys(ISOMETRIC_REGISTRY_DATA.components).sort()).toEqual(
      Object.keys(EXPECTED_DEFAULTS).sort(),
    )
    for (const [name, expected] of Object.entries(EXPECTED_DEFAULTS)) {
      expect(authoringDefaults(ISOMETRIC_REGISTRY_DATA.components[name]!), name).toEqual(expected)
    }
  })

  it('derives one palette piece per prefab with matching categories', () => {
    expect(ISOMETRIC_PALETTE).toHaveLength(Object.keys(ISOMETRIC_PREFABS).length)
    for (const piece of ISOMETRIC_PALETTE) {
      const made = piece.make()
      expect(made.prefab).toBeTruthy()
      expect(piece.category).toBe(ISOMETRIC_PREFABS[made.prefab!]!.type)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { authoringDefaults } from '@waica/engine'
import { TOPDOWN_REGISTRY_DATA } from './registry-data.js'

const RECTANGLE_TRIANGLE = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0, 0.5],
]

/** Hand-written expected authoring surface per registry component. */
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
  StateMachine: {
    role: '',
    initial: '',
    states: {},
  },
  TopDownMotor: {
    moveSpeed: 6,
    acceleration: 60,
    deceleration: 80,
    walkThreshold: 0.5,
    hitboxWidth: 0.9,
    hitboxHeight: 0.6,
  },
  Interactable: {
    line: 'Hello, traveler!',
    radius: 1.5,
  },
  Collectible: {
    value: 1,
    stat: 'points',
  },
  Patrol: {
    axis: 'horizontal',
    distance: 3,
    speed: 2,
  },
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
  Health: {
    max: 3,
    invulnerability: 0,
  },
  Respawnable: {},
  Lifetime: {
    seconds: 1,
  },
}

describe('TOPDOWN_REGISTRY_DATA authoring defaults', () => {
  it('covers exactly the 15 registered components', () => {
    expect(Object.keys(TOPDOWN_REGISTRY_DATA.components).sort()).toEqual(
      Object.keys(EXPECTED_DEFAULTS).sort(),
    )
  })

  it.each(Object.entries(EXPECTED_DEFAULTS))('%s reports only its authorable defaults', (name, expected) => {
    const Class = TOPDOWN_REGISTRY_DATA.components[name]!
    expect(authoringDefaults(Class)).toEqual(expected)
  })
})

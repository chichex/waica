import { describe, expect, it } from 'vitest'
import { authoringDefaults } from '@waica/engine'
import { PLATFORMER_REGISTRY_DATA } from './registry-data.js'

const RECTANGLE_TRIANGLE = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0, 0.5],
]

/** Hand-written expected authoring surface per registry component — issue #21 CA-2. */
const EXPECTED_DEFAULTS: Record<string, Record<string, unknown>> = {
  Sprite: {
    pixelArt: false,
    width: 1,
    height: 1,
    color: 0xffffff,
    offsetX: 0,
    offsetY: 0,
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
  DynamicBody: {
    vx: 0,
    vy: 0,
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
  PlatformerMotor: {
    moveSpeed: 9,
    acceleration: 60,
    deceleration: 80,
    jumpVelocity: 14,
    gravity: 42,
    maxFallSpeed: 22,
    coyoteTime: 0.1,
    jumpBuffer: 0.12,
    jumpCutStrength: 2.5,
    runThreshold: 0.5,
    squashStretch: true,
    hitboxWidth: 0.9,
    hitboxHeight: 0.95,
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
  // Nothing authorable left: the remembered spawn is transient, and the
  // kill height moved out to OutOfBounds.
  Respawnable: {},
  OutOfBounds: {
    minY: -12,
  },
  Lifetime: {
    seconds: 1,
  },
}

describe('PLATFORMER_REGISTRY_DATA authoring defaults', () => {
  it('covers exactly the 15 registered components', () => {
    expect(Object.keys(PLATFORMER_REGISTRY_DATA.components).sort()).toEqual(
      Object.keys(EXPECTED_DEFAULTS).sort(),
    )
  })

  it.each(Object.entries(EXPECTED_DEFAULTS))('%s reports only its authorable defaults', (name, expected) => {
    const Class = PLATFORMER_REGISTRY_DATA.components[name]!
    expect(authoringDefaults(Class)).toEqual(expected)
  })
})

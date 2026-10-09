import { describe, expect, it } from 'vitest'
import { authoringDefaults } from '@waica/engine'
import { HEALTH_UI } from '@waica/behaviors'
import { ISOMETRIC_PREFABS } from './prefabs'
import { ISOMETRIC_PALETTE, ISOMETRIC_REGISTRY_DATA } from './registry-data'
import { defined } from '../../engine/src/test-support'

const RECTANGLE_TRIANGLE = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0, 0.5],
]

const EXPECTED_DEFAULTS: Record<string, Record<string, unknown>> = {
  // Issue #78 CA-4: every archetype registers the Light.
  Light: {
    radius: 4,
    color: 0xffffff,
    intensity: 1,
    bands: 0,
    softness: 0,
    castShadows: true,
    offsetX: 0,
    offsetY: 0,
  },
  // Issue #154 CA-10: every archetype registers the 3D components; validation keeps them out of 2D scenes.
  Model: { src: '', shape: 'box', color: 0xffffff, size: 1 },
  Sun: { direction: [-1, -2, -1], color: 0xffffff, intensity: 1 },
  PointLight: {
    color: 0xffffff,
    intensity: 1,
    distance: 0,
    decay: 2,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
  },
  // Issue #159 CA-18: every archetype registers the 3D physics components; validation keeps them out of 2D scenes.
  Collider: {
    shape: 'box',
    size: [1, 1, 1],
    radius: 0.5,
    height: 1.8,
    offset: [0, 0, 0],
    sensor: false,
    layer: 'default',
    collidesWith: ['*'],
    friction: 0.5,
    restitution: 0,
  },
  RigidBody: {
    type: 'dynamic',
    mass: 1,
    gravityScale: 1,
    linearDamping: 0,
    angularDamping: 0,
    lockRotations: false,
    velocity: [0, 0, 0],
    stepHeight: 0.3,
    maxSlope: 45,
    snapDistance: 0.2,
  },
  // Issue #159 CA-20: every archetype registers the 3D character motor too.
  CharacterMotor: {
    speed: 6,
    jumpSpeed: 6,
    leftAction: 'left',
    rightAction: 'right',
    forwardAction: 'up',
    backAction: 'down',
    jumpAction: 'jump',
  },
  ParticleEmitter: {
    rate: 0,
    emitting: true,
    lifetime: 1,
    positionSpread: [0, 0],
    velocity: [0, 0],
    velocitySpread: [0, 0],
    gravity: [0, 0],
    space: 'world',
    seed: 1,
    capacity: 256,
    overflow: 'recycle-oldest',
    destroyMode: 'clear',
    width: 1,
    height: 1,
    startScale: 1,
    endScale: 1,
    startColor: 0xffffff,
    endColor: 0xffffff,
    startAlpha: 1,
    endAlpha: 0,
    texture: '',
    pixelArt: false,
    blend: 'normal',
    layer: 0,
    // Issue #78 CA-10.
    emissive: false,
  },
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
    // Issue #78 CA-10.
    emissive: false,
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
    // Issue #78 CA-10.
    emissive: false,
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
    layer: 'default',
    collidesWith: ['*'],
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
    knockbackSpeed: 8,
    hitboxWidth: 0.9,
    hitboxHeight: 0.9,
  },
  MeleeAttack: { damage: 1, range: 1, width: 1, swingSound: '' },
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
  Health: { max: 3, invulnerability: 0, stat: '', hurtSound: '', damageNumber: '', healthBar: '' },
  Respawnable: {},
  Lifetime: { seconds: 1 },
  SwingSparks: { state: 'attack', count: 14 },
  DamagePuff: { count: 10 },
  SceneTransition: { scene: '', trigger: 'overlap', fadeSeconds: 0, fadeColor: 'black' },
  ClickToMove: {
    arrivalTolerance: 0.2,
    markerWidth: 0.5,
    markerHeight: 0.25,
    markerColor: 0xffffff,
    markerTexture: '',
  },
}

describe('ISOMETRIC_REGISTRY_DATA', () => {
  it('reports only the authorable defaults for its exact component set', () => {
    expect(Object.keys(ISOMETRIC_REGISTRY_DATA.components).sort()).toEqual(
      Object.keys(EXPECTED_DEFAULTS).sort(),
    )
    for (const [name, expected] of Object.entries(EXPECTED_DEFAULTS)) {
      expect(authoringDefaults(defined(ISOMETRIC_REGISTRY_DATA.components[name])), name).toEqual(expected)
    }
  })

  it('ships the HUD, the Interactable pieces and the stock Health pieces (issue #72, CA-18)', () => {
    expect(Object.keys(ISOMETRIC_REGISTRY_DATA.ui ?? {}).sort()).toEqual([
      'crate-counter',
      'damage-number',
      'health',
      'health-bar',
      'interact-prompt',
      'npc-bubble',
      'npc-line',
    ])
    for (const piece of ['damage-number', 'health-bar']) {
      expect(ISOMETRIC_REGISTRY_DATA.ui?.[piece], piece).toBe(HEALTH_UI[piece])
    }
  })

  it('derives one palette piece per prefab with matching categories', () => {
    expect(ISOMETRIC_PALETTE).toHaveLength(Object.keys(ISOMETRIC_PREFABS).length)
    for (const piece of ISOMETRIC_PALETTE) {
      const made = piece.make()
      expect(made.prefab).toBeTruthy()
      expect(piece.category).toBe(defined(ISOMETRIC_PREFABS[defined(made.prefab)]).type)
    }
  })
})

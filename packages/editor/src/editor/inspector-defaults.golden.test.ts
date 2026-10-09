import { describe, expect, it } from 'vitest'
import type { SceneComponentJson } from '@waica/engine'
import { resolveArchetype } from '../project/archetype'
import { componentDefaults, componentKeys } from './Inspector'

/**
 * Golden captured from main before list-components-authoring-defaults touched
 * any defaults logic (issue #21). For each platformer registry component,
 * with no props set, this is the exact row set componentKeys +
 * componentDefaults resolve to today. Must stay byte-identical afterwards —
 * see CA-5 of .sdd/specs/list-components-authoring-defaults (issue body).
 * Issue #22 added Health and OutOfBounds and emptied Respawnable. The
 * isometric foundations spec intentionally adds anchorX/anchorY to both
 * appearance components; every other pre-existing row remains untouched.
 * The archetype particle effects added DustPuffs, a new row. Issue #78
 * added the Light component and an `emissive` row to the three drawables.
 * Issue #154 added the 3D components Model, Sun and PointLight; issue #159
 * the physics components Collider and RigidBody.
 */
const GOLDEN: Record<string, Record<string, unknown>> = {
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
    emissive: false,
  },
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
  },
  Sprite: { offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 0.5, layer: 0, emissive: false },
  AnimatedSprite: { offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 0.5, layer: 0, emissive: false },
  Solid: { offsetX: 0, offsetY: 0 },
  Hitbox: { layer: 'default', collidesWith: ['*'], offsetX: 0, offsetY: 0 },
  DynamicBody: {
    vx: 0,
    vy: 0,
    shape: 'rectangle',
    width: 1,
    height: 1,
    offsetX: 0,
    offsetY: 0,
    points: [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0, 0.5],
    ],
  },
  StateMachine: { role: '' },
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
  },
  Collectible: { value: 1, stat: 'points' },
  Patrol: { axis: 'horizontal', distance: 3, speed: 2 },
  Chaser: { mode: 'walker', range: 6, speed: 3, gravity: 42 },
  Hazard: { stompable: true, bounce: 10, stompDamage: 1, contactDamage: 1 },
  Health: { max: 3, invulnerability: 0, stat: '', hurtSound: '', damageNumber: '', healthBar: '' },
  Respawnable: {},
  OutOfBounds: { minY: -12 },
  Lifetime: { seconds: 1 },
  DustPuffs: { jumpCount: 5, landCount: 12 },
  SceneTransition: { scene: '', trigger: 'overlap', fadeSeconds: 0, fadeColor: 'black' },
}

describe('Inspector component rows (golden, behavior preservation)', () => {
  const archetype = resolveArchetype('platformer')

  it('lists exactly the 22 platformer registry components in the golden', () => {
    expect(Object.keys(archetype.registry.components).sort()).toEqual(
      Object.keys(GOLDEN).sort(),
    )
  })

  it.each(Object.keys(GOLDEN))('%s renders its declared golden rows', (type) => {
    const comp: SceneComponentJson = { type, props: {} }
    const keys = componentKeys(comp, archetype)
    const defaults = componentDefaults(comp, archetype)
    const resolved = Object.fromEntries(
      keys.map((key) => [key, (comp.props ?? {})[key] ?? defaults[key] ?? 0]),
    )
    expect(resolved).toEqual(GOLDEN[type])
  })
})

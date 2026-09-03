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
 */
const GOLDEN: Record<string, Record<string, unknown>> = {
  Sprite: { offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 0.5, layer: 0 },
  AnimatedSprite: { offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 0.5, layer: 0 },
  Solid: { offsetX: 0, offsetY: 0 },
  Hitbox: { offsetX: 0, offsetY: 0 },
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
  Health: { max: 3, invulnerability: 0, stat: '' },
  Respawnable: {},
  OutOfBounds: { minY: -12 },
  Lifetime: { seconds: 1 },
  SceneTransition: { scene: '', trigger: 'overlap' },
}

describe('Inspector component rows (golden, behavior preservation)', () => {
  const archetype = resolveArchetype('platformer')

  it('lists exactly the 16 platformer registry components in the golden', () => {
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

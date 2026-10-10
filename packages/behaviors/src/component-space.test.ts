import { describe, expect, it } from 'vitest'
import { COMPONENT_SPACES, componentSpaceOf, type ComponentSpace } from '@waica/engine'
import * as behaviors from './index.js'

interface ExportedComponent {
  componentName: string
  space?: ComponentSpace
}

function isComponentSpace(value: unknown): value is ComponentSpace {
  return typeof value === 'string' && (COMPONENT_SPACES as readonly string[]).includes(value)
}

/** A package export that is a component class: a function with its own `componentName` and a marker in the union, or none. */
function isExportedComponent(value: unknown): value is ExportedComponent {
  if (typeof value !== 'function' || !Object.hasOwn(value, 'componentName')) return false
  const space: unknown = Reflect.get(value, 'space')
  return typeof Reflect.get(value, 'componentName') === 'string' && (space === undefined || isComponentSpace(space))
}

/** Every behavior component class the package exports. */
function exportedComponents(): ExportedComponent[] {
  const classes: ExportedComponent[] = []
  for (const value of Object.values<unknown>(behaviors)) {
    if (isExportedComponent(value)) classes.push(value)
  }
  return classes
}

/**
 * The rule (issue #159 CA-2): a behavior is `'2d'` when it reads or moves
 * x/y as the orthographic plane (the motors, `Chaser`, `Patrol`, `Hazard`'s
 * stomp, `Interactable`'s 2D nearest scan), or when it requires a 2D sibling
 * component to work (the particle cues need a `ParticleEmitter`). One that
 * only reacts to an overlap (`Collectible`, `SceneTransition`), reads y as
 * "up" (`OutOfBounds`) or stores a whole position (`Respawnable`) runs in
 * both spaces and declares nothing.
 */
const TWO_D_BEHAVIORS = [
  'Chaser',
  'ClickToMove',
  'DamagePuff',
  'DustPuffs',
  'DustTrail',
  'Hazard',
  'Interactable',
  'IsoMotor',
  'MeleeAttack',
  'Patrol',
  'PlatformerMotor',
  'SwingSparks',
  'TopDownMotor',
]

const NEUTRAL_BEHAVIORS = ['Collectible', 'Health', 'Lifetime', 'OutOfBounds', 'Respawnable', 'SceneTransition']

describe('behavior component space markers (CA-2)', () => {
  it('tags exactly the 2D-only behaviors', () => {
    const tagged = exportedComponents()
      .filter((Class) => Class.space === '2d')
      .map((Class) => Class.componentName)
      .sort()
    expect(tagged).toEqual(TWO_D_BEHAVIORS)
  })

  it('leaves every other behavior space-neutral', () => {
    const neutral = exportedComponents().filter((Class) => Class.space !== '2d')
    expect(neutral.map((Class) => Class.space)).toEqual(neutral.map(() => undefined))
    expect(neutral.map((Class) => Class.componentName).sort()).toEqual(NEUTRAL_BEHAVIORS)
  })

  it('reads as 2d or both through the engine helper', () => {
    for (const Class of exportedComponents()) {
      const expected = TWO_D_BEHAVIORS.includes(Class.componentName) ? '2d' : 'both'
      expect(componentSpaceOf(Class), Class.componentName).toBe(expected)
    }
  })
})

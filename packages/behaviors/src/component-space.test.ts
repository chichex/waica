import { describe, expect, it } from 'vitest'
import { componentSpaceOf } from '@waica/engine'
import * as behaviors from './index.js'

interface ExportedComponent {
  componentName: string
  space: unknown
}

/** Every behavior component class the package exports. */
function exportedComponents(): ExportedComponent[] {
  const classes: ExportedComponent[] = []
  for (const value of Object.values(behaviors)) {
    if (typeof value !== 'function' || !Object.hasOwn(value, 'componentName')) continue
    const name: unknown = Reflect.get(value, 'componentName')
    if (typeof name !== 'string') continue
    classes.push({ componentName: name, space: Reflect.get(value, 'space') })
  }
  return classes
}

/** Behaviors that assume the orthographic x/y world (inference 2, issue #159). */
const TWO_D_BEHAVIORS = [
  'Chaser',
  'ClickToMove',
  'Collectible',
  'Hazard',
  'Interactable',
  'IsoMotor',
  'MeleeAttack',
  'OutOfBounds',
  'Patrol',
  'PlatformerMotor',
  'Respawnable',
  'SceneTransition',
  'TopDownMotor',
]

describe('behavior component space markers (CA-2)', () => {
  it('tags exactly the 2D-only behaviors', () => {
    const tagged = exportedComponents()
      .filter((Class) => Class.space === '2d')
      .map((Class) => Class.componentName)
      .sort()
    expect(tagged).toEqual(TWO_D_BEHAVIORS)
  })

  it('tags the 3D behaviors', () => {
    const tagged = exportedComponents().filter((Class) => Class.space === '3d')
    expect(tagged.map((Class) => Class.componentName)).toEqual(['CharacterMotor'])
  })

  it('leaves every other behavior space-neutral', () => {
    const neutral = exportedComponents().filter((Class) => Class.space !== '2d' && Class.space !== '3d')
    expect(neutral.map((Class) => Class.space)).toEqual(neutral.map(() => undefined))
    expect(neutral.map((Class) => Class.componentName).sort()).toEqual([
      'DamagePuff',
      'DustPuffs',
      'DustTrail',
      'Health',
      'Lifetime',
      'SwingSparks',
    ])
  })

  it('reads as 2d through the engine helper', () => {
    for (const Class of exportedComponents()) {
      const expected = TWO_D_BEHAVIORS.includes(Class.componentName) ? '2d' : 'both'
      expect(componentSpaceOf({ space: Class.space === '2d' ? '2d' : undefined }), Class.componentName).toBe(expected)
    }
  })
})

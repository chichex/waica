import { describe, expect, it } from 'vitest'
import {
  AnimatedSprite,
  DynamicBody,
  StateMachine,
  resolveComponentUpdateSchedule,
} from '@waica/engine'
import { Health, Lifetime, OutOfBounds } from '@waica/behaviors'
import { PLATFORMER_PREFABS } from './prefabs'
import { PLATFORMER_REGISTRY_DATA } from './registry-data'

function representativePermutations(names: readonly string[]): string[][] {
  if (names.length === 0) return [[]]
  return [
    names.slice(),
    names.slice().reverse(),
    [...names.slice(1), names[0]!],
    names.slice().sort(),
  ]
}

describe('shipped component update schedules', () => {
  it('declares exactly the confirmed read-after-write relations', () => {
    expect(AnimatedSprite.updateAfter).toEqual(['StateMachine'])
    expect(Health.updateAfter).toEqual(['StateMachine'])
    expect(OutOfBounds.updateAfter).toEqual(['DynamicBody', 'Health', 'StateMachine'])

    expect(DynamicBody.updateAfter).toBeUndefined()
    expect(Lifetime.updateAfter).toBeUndefined()
    expect(StateMachine.updateAfter).toBeUndefined()
  })

  it('resolves every stock prefab without issues and independently of component-array order', () => {
    const expected: Record<string, string[]> = {
      'characters/player': ['StateMachine', 'AnimatedSprite', 'Health', 'OutOfBounds'],
      'characters/slime': ['StateMachine', 'AnimatedSprite', 'Health'],
      'objects/coin': ['AnimatedSprite'],
      'tiles/platform': [],
      'tiles/block': [],
      'tiles/decor': [],
    }

    for (const [ref, prefab] of Object.entries(PLATFORMER_PREFABS)) {
      const names = prefab.components.map((component) => component.type)
      for (const source of representativePermutations(names)) {
        expect(resolveComponentUpdateSchedule(source, PLATFORMER_REGISTRY_DATA.components)).toEqual({
          ok: true,
          order: expected[ref],
          issues: [],
        })
      }
    }
  })
})

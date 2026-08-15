import { describe, expect, it } from 'vitest'
import {
  AnimatedSprite,
  StateMachine,
  resolveComponentUpdateSchedule,
} from '@waica/engine'
import { Health, Interactable, Lifetime, TopDownMotor } from '@waica/behaviors'
import { TOPDOWN_PREFABS } from './prefabs'
import { TOPDOWN_REGISTRY_DATA } from './registry-data'

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

    expect(StateMachine.updateAfter).toBeUndefined()
    expect(Lifetime.updateAfter).toBeUndefined()
    expect(TopDownMotor.updateAfter).toBeUndefined()
    expect(Interactable.updateAfter).toBeUndefined()
  })

  it('resolves every stock prefab without issues and independently of component-array order', () => {
    const expected: Record<string, string[]> = {
      'characters/player': ['StateMachine', 'AnimatedSprite', 'Health'],
      'characters/villager': ['StateMachine', 'AnimatedSprite'],
      'characters/blob': ['StateMachine', 'AnimatedSprite'],
      'objects/potion': ['AnimatedSprite'],
      'tiles/meadow': [],
      'tiles/grass': [],
      'tiles/path': [],
      'tiles/water': [],
      'tiles/fence': [],
      'tiles/tree': [],
    }

    for (const [ref, prefab] of Object.entries(TOPDOWN_PREFABS)) {
      const names = prefab.components.map((component) => component.type)
      for (const source of representativePermutations(names)) {
        expect(resolveComponentUpdateSchedule(source, TOPDOWN_REGISTRY_DATA.components)).toEqual({
          ok: true,
          order: expected[ref],
          issues: [],
        })
      }
    }
  })
})

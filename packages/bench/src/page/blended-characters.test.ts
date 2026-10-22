import { describe, expect, it } from 'vitest'
import type { Game, SceneEntityJson } from '@waica/engine'
import { blendedCharacters, characterSpeed } from './blended-characters.ts'

// Issue #205 CA-25: n rigs each mixing two of three clips through a phase-synced blend.

const CHARACTER_NAME = /^Character-\d+$/
const charactersOf = (entities: readonly SceneEntityJson[]): SceneEntityJson[] => entities.filter((entity) => CHARACTER_NAME.test(entity.name))
const componentTypes = (entity: SceneEntityJson | undefined): string[] => (entity?.components ?? []).map((component) => component.type)

/** The rig's three clips on `speed`: idle at 0, walk at 1, jump at 2, with no smoothing. */
const MOVE = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }, { clip: 'jump', at: 2 }], smoothing: 0 }

/** A stand-in Game that records each character's setParam calls. */
function recordingGame(): { game: Game; calls: Array<[string, string, number]> } {
  const calls: Array<[string, string, number]> = []
  const fake = { find: (name: string) => ({ get: () => ({ setParam: (param: string, value: number) => calls.push([name, param, value]) }) }) }
  return { game: fake as unknown as Game, calls }
}

describe('blendedCharacters (issue #205 CA-25)', () => {
  it('is a 3D scene under a perspective camera and a Sun, run for 60 Simulation Steps, with the rig preloaded', () => {
    const plan = blendedCharacters(50)

    expect(plan.scene.render?.space).toBe('3d')
    expect(plan.scene.camera?.kind).toBe('perspective')
    expect(plan.steps).toBe(60)
    expect(plan.preload).toHaveLength(1)
    expect(plan.preload[0]).toMatch(/rig/)
    expect(componentTypes(plan.scene.entities.find((entity) => entity.name === 'Daylight'))).toEqual(['Sun'])
    expect(Object.keys(plan.registry.components).sort()).toEqual(['Animator', 'Model', 'StateMachine', 'Sun'])
  })

  it('holds `n` characters on a grid, each a Model of the rig with an Animator playing the Move blend from the start', () => {
    for (const n of [50, 200]) {
      const plan = blendedCharacters(n)
      const characters = charactersOf(plan.scene.entities)
      expect(characters).toHaveLength(n)
      expect(new Set(characters.map((character) => (character.position ?? []).join(','))).size).toBe(n)
      for (const character of characters) {
        expect(componentTypes(character)).toEqual(['Model', 'Animator'])
        expect(character.components?.[0]?.props?.src).toBe(plan.preload[0])
        expect(character.components?.[1]?.props).toEqual({ initialClip: 'Move', blends: { Move: MOVE } })
      }
    }
  })

})

describe('blendedCharacters’ per-step work (issue #205 CA-25)', () => {
  it('sets each character’s speed to 0.5, 1 or 1.5 in turn on the first step, and only then', () => {
    expect([0, 1, 2, 3, 4, 5].map(characterSpeed)).toEqual([0.5, 1, 1.5, 0.5, 1, 1.5])
    const { game, calls } = recordingGame()
    const { perStep } = blendedCharacters(4)
    perStep?.(game, 1)
    perStep?.(game, 2)

    expect(calls).toEqual([
      ['Character-0', 'speed', 0.5],
      ['Character-1', 'speed', 1],
      ['Character-2', 'speed', 1.5],
      ['Character-3', 'speed', 0.5],
    ])
  })

  it('is deterministic: the same size gives the same plan', () => {
    expect(blendedCharacters(50).scene).toEqual(blendedCharacters(50).scene)
  })
})

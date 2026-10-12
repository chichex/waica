import { describe, expect, it } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
import { skinnedCharacters } from './skinned-characters.ts'

const CHARACTER_NAME = /^Character-\d+$/
const charactersOf = (entities: readonly SceneEntityJson[]): SceneEntityJson[] => entities.filter((entity) => CHARACTER_NAME.test(entity.name))
const componentTypes = (entity: SceneEntityJson | undefined): string[] => (entity?.components ?? []).map((component) => component.type)

describe('skinnedCharacters (issue #166 CA-19)', () => {
  it('is a 3D scene under a perspective camera and a Sun, run for 60 Simulation Steps, with the rig preloaded', () => {
    const plan = skinnedCharacters(50)

    expect(plan.scene.render?.space).toBe('3d')
    expect(plan.scene.camera?.kind).toBe('perspective')
    expect(plan.steps).toBe(60)
    expect(plan.perStep).toBeUndefined()
    expect(plan.preload).toHaveLength(1)
    expect(plan.preload[0]).toMatch(/rig/)
    expect(componentTypes(plan.scene.entities.find((entity) => entity.name === 'Daylight'))).toEqual(['Sun'])
  })

  it('holds `n` characters on a grid, each a Model of the rig with an Animator walking from the start', () => {
    for (const n of [50, 200]) {
      const characters = charactersOf(skinnedCharacters(n).scene.entities)
      expect(characters).toHaveLength(n)
      const keys = new Set(characters.map((character) => (character.position ?? []).join(',')))
      expect(keys.size).toBe(n)
      for (const character of characters) {
        expect(componentTypes(character)).toEqual(['Model', 'Animator'])
        expect(character.components?.[0]?.props?.src).toBe(skinnedCharacters(n).preload[0])
        expect(character.components?.[1]?.props).toEqual({ initialClip: 'walk' })
      }
    }
  })

  it('registers exactly the components it uses, StateMachine included (an Animator updates after it)', () => {
    expect(Object.keys(skinnedCharacters(50).registry.components).sort()).toEqual(['Animator', 'Model', 'StateMachine', 'Sun'])
  })

  it('is deterministic: the same size gives the same plan', () => {
    expect(skinnedCharacters(50).scene).toEqual(skinnedCharacters(50).scene)
  })
})

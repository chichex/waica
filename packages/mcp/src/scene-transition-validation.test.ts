import { describe, expect, it } from 'vitest'
import type { PrefabJson } from '@waica/engine'
import {
  validateEntitySceneTransition,
  validatePrefabSceneTransition,
} from './scene-transition-validation.js'

const KNOWN = new Set(['main', 'cave'])

describe('validatePrefabSceneTransition (CA-16)', () => {
  it('warns naming the prefab when its SceneTransition targets an unknown scene', () => {
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'object',
      components: [{ type: 'SceneTransition', props: { scene: 'dungeon' } }],
    }

    const findings = validatePrefabSceneTransition(prefab, 'src/objects/door.object.json', 'objects/door', KNOWN)

    expect(findings).toEqual([
      {
        severity: 'warning',
        code: 'unknown-scene-transition-target',
        message: 'SceneTransition on "objects/door" names unknown scene "dungeon".',
        file: 'src/objects/door.object.json',
        ref: 'dungeon',
      },
    ])
  })

  it('is silent when the target scene exists, or the component is missing/misconfigured', () => {
    const known: PrefabJson = {
      waicaPrefab: 1,
      type: 'object',
      components: [{ type: 'SceneTransition', props: { scene: 'cave' } }],
    }
    expect(validatePrefabSceneTransition(known, 'f.json', 'ref', KNOWN)).toEqual([])

    const noTarget: PrefabJson = {
      waicaPrefab: 1,
      type: 'object',
      components: [{ type: 'SceneTransition', props: {} }],
    }
    expect(validatePrefabSceneTransition(noTarget, 'f.json', 'ref', KNOWN)).toEqual([])

    const noTransition: PrefabJson = { waicaPrefab: 1, type: 'object', components: [] }
    expect(validatePrefabSceneTransition(noTransition, 'f.json', 'ref', KNOWN)).toEqual([])
  })
})

describe('validateEntitySceneTransition (CA-16)', () => {
  it('warns naming the entity for an inline SceneTransition targeting an unknown scene', () => {
    const findings = validateEntitySceneTransition(
      { components: [{ type: 'SceneTransition', props: { scene: 'dungeon' } }] },
      'Door',
      'src/scenes/main.scene.json',
      KNOWN,
    )

    expect(findings).toEqual([
      {
        severity: 'warning',
        code: 'unknown-scene-transition-target',
        message: 'SceneTransition on "Door" names unknown scene "dungeon".',
        file: 'src/scenes/main.scene.json',
        ref: 'dungeon',
      },
    ])
  })

  it('warns for a scene override that redirects a prefab door to an unknown scene', () => {
    const findings = validateEntitySceneTransition(
      { overrides: { SceneTransition: { scene: 'dungeon' } } },
      'Door',
      'src/scenes/cave.scene.json',
      KNOWN,
    )

    expect(findings).toEqual([
      {
        severity: 'warning',
        code: 'unknown-scene-transition-target',
        message: 'SceneTransition on "Door" names unknown scene "dungeon".',
        file: 'src/scenes/cave.scene.json',
        ref: 'dungeon',
      },
    ])
  })

  it('is silent for a plain prefab instance with no override (the prefab check already covers it)', () => {
    const findings = validateEntitySceneTransition(
      { overrides: { Sprite: { width: 2 } } },
      'Door',
      'src/scenes/main.scene.json',
      KNOWN,
    )
    expect(findings).toEqual([])
  })

  it('is silent when the target scene exists', () => {
    const findings = validateEntitySceneTransition(
      { components: [{ type: 'SceneTransition', props: { scene: 'cave' } }] },
      'Door',
      'src/scenes/main.scene.json',
      KNOWN,
    )
    expect(findings).toEqual([])
  })
})

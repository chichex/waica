import { afterEach, describe, expect, it } from 'vitest'
import type { PrefabJson } from '@waica/engine'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'
import {
  validateEntitySceneTransition,
  validatePrefabSceneTransition,
} from './scene-transition-validation.js'

const KNOWN = new Set(['main', 'cave'])
const NO_PREFABS = new Map<string, PrefabJson>()

describe('validatePrefabSceneTransition (CA-16, unknown target)', () => {
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

describe('validatePrefabSceneTransition (interact needs a sibling Interactable)', () => {
  it('is silent when a trigger:"interact" SceneTransition has a sibling Interactable', () => {
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'object',
      components: [
        { type: 'SceneTransition', props: { scene: 'cave', trigger: 'interact' } },
        { type: 'Interactable', props: {} },
      ],
    }
    expect(validatePrefabSceneTransition(prefab, 'src/objects/door.object.json', 'objects/door', KNOWN)).toEqual([])
  })

  it('warns when a trigger:"interact" SceneTransition has no sibling Interactable', () => {
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'object',
      components: [{ type: 'SceneTransition', props: { scene: 'cave', trigger: 'interact' } }],
    }

    const findings = validatePrefabSceneTransition(prefab, 'src/objects/door.object.json', 'objects/door', KNOWN)

    expect(findings).toEqual([
      {
        severity: 'warning',
        code: 'scene-transition-missing-interactable',
        message:
          'SceneTransition on "objects/door" has trigger:"interact" but no sibling Interactable; it will never fire.',
        file: 'src/objects/door.object.json',
        ref: 'objects/door',
      },
    ])
  })
})

describe('validateEntitySceneTransition (CA-16, unknown target)', () => {
  it('warns naming the entity for an inline SceneTransition targeting an unknown scene', () => {
    const findings = validateEntitySceneTransition(
      { components: [{ type: 'SceneTransition', props: { scene: 'dungeon' } }] },
      'Door',
      'src/scenes/main.scene.json',
      NO_PREFABS,
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
      NO_PREFABS,
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
      NO_PREFABS,
      KNOWN,
    )
    expect(findings).toEqual([])
  })

  it('is silent when the target scene exists', () => {
    const findings = validateEntitySceneTransition(
      { components: [{ type: 'SceneTransition', props: { scene: 'cave' } }] },
      'Door',
      'src/scenes/main.scene.json',
      NO_PREFABS,
      KNOWN,
    )
    expect(findings).toEqual([])
  })
})

describe('validateEntitySceneTransition (interact needs a sibling Interactable)', () => {
  const doorPrefabWithInteractable = new Map<string, PrefabJson>([
    [
      'objects/door',
      {
        waicaPrefab: 1,
        type: 'object',
        components: [{ type: 'Interactable', props: {} }],
      },
    ],
  ])
  const doorPrefabWithoutInteractable = new Map<string, PrefabJson>([
    [
      'objects/door',
      {
        waicaPrefab: 1,
        type: 'object',
        components: [{ type: 'SceneTransition', props: { scene: 'cave' } }],
      },
    ],
  ])

  it('is silent for an inline trigger:"interact" SceneTransition when the prefab supplies the Interactable', () => {
    const findings = validateEntitySceneTransition(
      {
        prefab: 'objects/door',
        components: [{ type: 'SceneTransition', props: { scene: 'cave', trigger: 'interact' } }],
      },
      'Door',
      'src/scenes/main.scene.json',
      doorPrefabWithInteractable,
      KNOWN,
    )
    expect(findings).toEqual([])
  })

  it('warns for a trigger override to "interact" over a prefab with no Interactable', () => {
    const findings = validateEntitySceneTransition(
      { prefab: 'objects/door', overrides: { SceneTransition: { trigger: 'interact' } } },
      'Door',
      'src/scenes/main.scene.json',
      doorPrefabWithoutInteractable,
      KNOWN,
    )

    expect(findings).toEqual([
      {
        severity: 'warning',
        code: 'scene-transition-missing-interactable',
        message: 'SceneTransition on "Door" has trigger:"interact" but no sibling Interactable; it will never fire.',
        file: 'src/scenes/main.scene.json',
        ref: 'Door',
      },
    ])
  })

  it('is silent when trigger is absent (default "overlap") even without a sibling Interactable', () => {
    const findings = validateEntitySceneTransition(
      { components: [{ type: 'SceneTransition', props: { scene: 'cave' } }] },
      'Door',
      'src/scenes/main.scene.json',
      NO_PREFABS,
      KNOWN,
    )
    expect(findings).toEqual([])
  })
})

/**
 * validateProject wires validateScene's real prefab map (built from files
 * on disk, not a literal test Map) into validateEntitySceneTransition — the
 * plumbing change this rule needed. One full-pipeline case for each side of
 * the trap: a prefab-supplied Interactable clearing an inline interact
 * trigger, and a trigger override with no Interactable anywhere warning.
 */
describe('validateProject (interact needs a sibling Interactable, full pipeline)', () => {
  const roots: string[] = []
  afterEach(async () => cleanup(...roots.splice(0)))

  it('threads the real prefab map into the entity-level Interactable check', async () => {
    const project = await makeProject({
      // Interactable is on topdown's registry, not platformer's (registry-data.ts).
      'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'topdown' }),
      'src/objects/door.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [{ type: 'Interactable', props: {} }],
      }),
      'src/objects/gate.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [{ type: 'SceneTransition', props: { scene: 'cave' } }],
      }),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          {
            // Inline interact-trigger SceneTransition; the sibling
            // Interactable comes from the prefab, not this entity.
            name: 'Door',
            prefab: 'objects/door',
            components: [{ type: 'SceneTransition', props: { scene: 'cave', trigger: 'interact' } }],
          },
          {
            // Override turns the prefab's default overlap trigger into
            // interact; the prefab has no Interactable at all.
            name: 'Gate',
            prefab: 'objects/gate',
            overrides: { SceneTransition: { trigger: 'interact' } },
          },
        ],
      }),
      'src/scenes/cave.scene.json': JSON.stringify({ waicaScene: 3, entities: [] }),
    })
    roots.push(project)

    const result = await validateProject(project)

    expect(
      result.findings.filter((finding) => finding.code === 'scene-transition-missing-interactable'),
    ).toEqual([
      {
        severity: 'warning',
        code: 'scene-transition-missing-interactable',
        message: 'SceneTransition on "Gate" has trigger:"interact" but no sibling Interactable; it will never fire.',
        file: 'src/scenes/main.scene.json',
        ref: 'Gate',
      },
    ])
  })
})

import { describe, expect, it } from 'vitest'
import type { PrefabJson, SceneComponentJson } from '@waica/engine'
import { availableRefTargets, type RefProjectState } from './ref-targets'

const project: RefProjectState = {
  prefabs: {
    'tiles/wall': { waicaPrefab: 1, type: 'tile', components: [] } as PrefabJson,
    'objects/bullet': { waicaPrefab: 1, type: 'object', components: [] } as PrefabJson,
  },
  stats: { points: 0, lives: 3 },
  actions: { shoot: ['KeyF'], jump: [], left: ['ArrowLeft'] },
  sounds: [
    { value: 'src/art/swing.ogg', label: 'swing.ogg' },
    { value: 'src/art/hurt.ogg', label: 'hurt.ogg' },
  ],
  uiPieces: ['npc-line', 'health-bar', 'damage-number'],
}

const entityComponents: SceneComponentJson[] = [
  { type: 'RefComponent', props: { target: 'idle' } },
  {
    type: 'AnimatedSprite',
    props: { clips: { run: { frames: [1] }, idle: { frames: [0] } } },
  },
]

describe('availableRefTargets', () => {
  it('returns sorted prefab refs', () => {
    expect(availableRefTargets(project, 'prefab', { components: entityComponents })).toEqual([
      { value: 'objects/bullet', label: 'objects/bullet' },
      { value: 'tiles/wall', label: 'tiles/wall' },
    ])
  })

  it('returns sorted stat keys', () => {
    expect(availableRefTargets(project, 'stat', { components: entityComponents })).toEqual([
      { value: 'lives', label: 'lives' },
      { value: 'points', label: 'points' },
    ])
  })

  it('returns every action, labeling ones with no key bindings as unbound rather than hiding them', () => {
    // Kept selectable (not filtered out): validate_project treats an unbound
    // action reference as a warning, not an unknown one, so the picker must
    // not contradict it by refusing to offer the value at all.
    expect(availableRefTargets(project, 'action', { components: entityComponents })).toEqual([
      { value: 'jump', label: 'jump (unbound)' },
      { value: 'left', label: 'left' },
      { value: 'shoot', label: 'shoot' },
    ])
  })

  it('returns sound targets sorted by label, ignoring the caller-supplied order', () => {
    // The Inspector's project.sounds comes pre-filtered to kind 'sound' by
    // the caller (Inspector.tsx) — this module only sorts and shapes it.
    expect(availableRefTargets(project, 'sound')).toEqual([
      { value: 'src/art/hurt.ogg', label: 'hurt.ogg' },
      { value: 'src/art/swing.ogg', label: 'swing.ogg' },
    ])
  })

  it('CA-17: returns the project UI piece names sorted', () => {
    expect(availableRefTargets(project, 'ui')).toEqual([
      { value: 'damage-number', label: 'damage-number' },
      { value: 'health-bar', label: 'health-bar' },
      { value: 'npc-line', label: 'npc-line' },
    ])
  })

  it('CA-17: constrains a ui ref to zero targets, not free text, when the project has no pieces', () => {
    expect(availableRefTargets({ ...project, uiPieces: [] }, 'ui')).toEqual([])
  })

  it('returns clip names from the sibling AnimatedSprite', () => {
    expect(availableRefTargets(project, 'clip', { components: entityComponents })).toEqual([
      { value: 'idle', label: 'idle' },
      { value: 'run', label: 'run' },
    ])
  })

  it('distinguishes no constraint (no AnimatedSprite) from an empty, constrained clip set', () => {
    // No entity context at all, and an entity with no AnimatedSprite sibling,
    // both mean "no constraint available" — validate_project skips the clip
    // check the same way, so the Inspector must not invent a false "missing"
    // marker by treating this the same as zero declared clips.
    expect(availableRefTargets(project, 'clip')).toBeUndefined()
    expect(availableRefTargets(project, 'clip', { components: [] })).toBeUndefined()
    expect(
      availableRefTargets(project, 'clip', {
        components: [{ type: 'AnimatedSprite', props: { clips: {} } }],
      }),
    ).toEqual([])
  })

  it('returns no targets for an empty project and absent entity context', () => {
    const empty: RefProjectState = { prefabs: {}, stats: {}, actions: {}, sounds: [], uiPieces: [] }

    expect(availableRefTargets(empty, 'prefab')).toEqual([])
    expect(availableRefTargets(empty, 'stat')).toEqual([])
    expect(availableRefTargets(empty, 'action')).toEqual([])
    expect(availableRefTargets(empty, 'sound')).toEqual([])
    expect(availableRefTargets(empty, 'clip')).toBeUndefined()
  })
})

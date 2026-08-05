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
      'objects/bullet',
      'tiles/wall',
    ])
  })

  it('returns sorted stat keys', () => {
    expect(availableRefTargets(project, 'stat', { components: entityComponents })).toEqual([
      'lives',
      'points',
    ])
  })

  it('returns merged action names, including actions that currently have no key', () => {
    expect(availableRefTargets(project, 'action', { components: entityComponents })).toEqual([
      'jump',
      'left',
      'shoot',
    ])
  })

  it('returns clip names from the sibling AnimatedSprite only', () => {
    expect(availableRefTargets(project, 'clip', { components: entityComponents })).toEqual([
      'idle',
      'run',
    ])
    expect(availableRefTargets(project, 'clip', { components: [] })).toEqual([])
  })

  it('returns no targets for an empty project and absent entity context', () => {
    const empty: RefProjectState = { prefabs: {}, stats: {}, actions: {} }

    expect(availableRefTargets(empty, 'prefab')).toEqual([])
    expect(availableRefTargets(empty, 'stat')).toEqual([])
    expect(availableRefTargets(empty, 'action')).toEqual([])
    expect(availableRefTargets(empty, 'clip')).toEqual([])
  })
})

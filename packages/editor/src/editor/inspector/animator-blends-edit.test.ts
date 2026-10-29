import { describe, expect, it } from 'vitest'
import type { SceneComponentJson } from '@waica/engine'
import {
  blendRenamePatches,
  renameBlendReferences,
  renamedClipOverrides,
  renamedInitialClip,
  renamedMachineStates,
} from './animator-blends-edit'

const FULL_COMPONENTS: SceneComponentJson[] = [
  {
    type: 'Animator',
    props: {
      blends: {
        Move: { param: 'speed', points: [] },
        Sneak: { param: 'stealth', points: [] },
      },
      initialClip: 'Move',
      clips: {
        Move: { loop: false, speed: 1.5, fade: 0.2 },
        walk: { speed: 1.2 },
      },
    },
  },
  {
    type: 'StateMachine',
    props: {
      role: 'player',
      initial: 'idle',
      states: {
        idle: { clip: 'Move' },
        walk: { clip: 'Move' },
        jump: { clip: 'jump' },
      },
    },
  },
]

const UNREFERENCED_COMPONENTS: SceneComponentJson[] = [
  {
    type: 'Animator',
    props: {
      blends: {
        Move: { param: 'speed', points: [] },
        Sneak: { param: 'stealth', points: [] },
      },
      initialClip: 'idle',
      clips: { walk: { speed: 1.2 } },
    },
  },
  {
    type: 'StateMachine',
    props: {
      role: 'player',
      initial: 'idle',
      states: { idle: { clip: 'idle' }, jump: { clip: 'jump' } },
    },
  },
]

describe('renamedClipOverrides (issue #245 CA-1)', () => {
  it('renames an override key in place and preserves its properties', () => {
    const clips = { Move: { loop: false, speed: 1.5, fade: 0.2 }, walk: { speed: 1.2 } }
    const result = renamedClipOverrides(clips, 'Move', 'Stride')
    expect(result).toEqual({ Stride: { loop: false, speed: 1.5, fade: 0.2 }, walk: { speed: 1.2 } })
    expect(Object.keys(result)).toEqual(['Stride', 'walk'])
  })

  it('keeps clips unchanged when from is not present', () => {
    const clips = { walk: { speed: 1.2 } }
    expect(renamedClipOverrides(clips, 'Move', 'Stride')).toEqual({ walk: { speed: 1.2 } })
  })

  it('replaces a pre-existing orphan clips[to] with the renamed entry in from position', () => {
    const clips = { Move: { speed: 1.5 }, Stride: { speed: 0.5 }, walk: { speed: 1.2 } }
    const result = renamedClipOverrides(clips, 'Move', 'Stride')
    expect(result).toEqual({ Stride: { speed: 1.5 }, walk: { speed: 1.2 } })
    expect(Object.keys(result)).toEqual(['Stride', 'walk'])
  })
})

describe('renamedInitialClip (issue #245 CA-1)', () => {
  it('updates initialClip when it matches from and leaves other values untouched', () => {
    expect(renamedInitialClip('Move', 'Move', 'Stride')).toBe('Stride')
    expect(renamedInitialClip('idle', 'Move', 'Stride')).toBe('idle')
    expect(renamedInitialClip(undefined, 'Move', 'Stride')).toBeUndefined()
  })
})

describe('renamedMachineStates (issue #245 CA-2)', () => {
  it('updates clip to to in all states pointing to from and preserves others', () => {
    const states = { idle: { clip: 'Move', speed: 1 }, walk: { clip: 'Move', speed: 1.2 }, jump: { clip: 'jump', loop: false } }
    const result = renamedMachineStates(states, 'Move', 'Stride')
    expect(result).toEqual({ idle: { clip: 'Stride', speed: 1 }, walk: { clip: 'Stride', speed: 1.2 }, jump: { clip: 'jump', loop: false } })
    expect(Object.keys(result)).toEqual(['idle', 'walk', 'jump'])
  })

  it('leaves states unchanged when no state points to from', () => {
    const states = { idle: { clip: 'idle' }, walk: { clip: 'walk' } }
    expect(renamedMachineStates(states, 'Move', 'Stride')).toBe(states)
  })
})

describe('renameBlendReferences and blendRenamePatches (issue #245 CA-1, CA-2)', () => {
  it('computes rewrites and ordered patches when referenced', () => {
    const rewrites = renameBlendReferences(FULL_COMPONENTS, 'Move', 'Stride')
    expect(Object.keys(rewrites.blends)).toEqual(['Stride', 'Sneak'])
    expect(rewrites.initialClip).toBe('Stride')
    expect(blendRenamePatches(FULL_COMPONENTS, 'Move', 'Stride')).toEqual([
      { componentType: 'Animator', key: 'blends', value: rewrites.blends },
      { componentType: 'Animator', key: 'initialClip', value: 'Stride' },
      { componentType: 'Animator', key: 'clips', value: rewrites.clips },
      { componentType: 'StateMachine', key: 'states', value: rewrites.states },
    ])
  })

  it('omits initialClip, clips and states when from is not referenced', () => {
    const rewrites = renameBlendReferences(UNREFERENCED_COMPONENTS, 'Move', 'Stride')
    expect(rewrites.initialClip).toBeUndefined()
    expect(rewrites.clips).toBeUndefined()
    expect(rewrites.states).toBeUndefined()
    expect(blendRenamePatches(UNREFERENCED_COMPONENTS, 'Move', 'Stride')).toEqual([
      { componentType: 'Animator', key: 'blends', value: rewrites.blends },
    ])
  })
})

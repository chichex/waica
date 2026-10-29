import { describe, expect, it } from 'vitest'
import type { SceneComponentJson } from '@waica/engine'
import {
  blendRenamePatches,
  renamedClipOverrides,
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
        Move: { transitions: [] },
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

describe('renamedMachineStates (issue #245 CA-2)', () => {
  it('updates clip to to in states pointing to from explicitly or implicitly by state name', () => {
    const states = {
      idle: { clip: 'Move', speed: 1 },
      Move: { transitions: [] },
      jump: { clip: 'jump', loop: false },
    }
    const result = renamedMachineStates(states, 'Move', 'Stride')
    expect(result).toEqual({
      idle: { clip: 'Stride', speed: 1 },
      Move: { transitions: [], clip: 'Stride' },
      jump: { clip: 'jump', loop: false },
    })
    expect(Object.keys(result)).toEqual(['idle', 'Move', 'jump'])
  })

  it('leaves states unchanged when no state points to from', () => {
    const states = { idle: { clip: 'idle' }, Move: { clip: 'walk' } }
    expect(renamedMachineStates(states, 'Move', 'Stride')).toBe(states)
  })
})

describe('blendRenamePatches (issue #245 CA-1, CA-2)', () => {
  it('returns ordered patches for Animator and StateMachine props when referenced', () => {
    expect(blendRenamePatches(FULL_COMPONENTS, 'Move', 'Stride')).toEqual([
      {
        componentType: 'Animator',
        key: 'blends',
        value: { Stride: { param: 'speed', points: [] }, Sneak: { param: 'stealth', points: [] } },
      },
      { componentType: 'Animator', key: 'initialClip', value: 'Stride' },
      {
        componentType: 'Animator',
        key: 'clips',
        value: { Stride: { loop: false, speed: 1.5, fade: 0.2 }, walk: { speed: 1.2 } },
      },
      {
        componentType: 'StateMachine',
        key: 'states',
        value: { idle: { clip: 'Stride' }, Move: { transitions: [], clip: 'Stride' }, jump: { clip: 'jump' } },
      },
    ])
  })

  it('omits initialClip, clips and states when from is not referenced', () => {
    expect(blendRenamePatches(UNREFERENCED_COMPONENTS, 'Move', 'Stride')).toEqual([
      {
        componentType: 'Animator',
        key: 'blends',
        value: { Stride: { param: 'speed', points: [] }, Sneak: { param: 'stealth', points: [] } },
      },
    ])
  })
})

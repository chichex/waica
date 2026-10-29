// @vitest-environment happy-dom
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { PrefabJson, SceneComponentJson, SceneEntityJson } from '@waica/engine'
import rig from '../../../engine/fixtures/rig.glb?inline'
import { MemFS } from '../fs/project-fs'
import { GlbClipCache } from './glb-clips'
import { renderInspectorWithClips } from './inspector-test-support'

// Issue #245 CA-1, CA-2, CA-3, CA-5: renaming an Animator blend rewrites its references.

afterEach(cleanup)

const RIG_PATH = 'src/art/rig.glb'
const MOVE = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }] }
const SNEAK = { param: 'stealth', points: [] }
const CLIPS_BEFORE = { Move: { loop: false, speed: 1.5, fade: 0.2 }, walk: { speed: 1.2 } }
const CLIPS_AFTER = { Stride: { loop: false, speed: 1.5, fade: 0.2 }, walk: { speed: 1.2 } }
const STATES_BEFORE = { idle: { clip: 'Move' }, Move: { transitions: [] }, jump: { clip: 'jump' } }
const STATES_AFTER = { idle: { clip: 'Stride' }, Move: { transitions: [], clip: 'Stride' }, jump: { clip: 'jump' } }
const FULL_PATCHES = [
  { componentType: 'Animator', key: 'blends', value: { Stride: MOVE, Sneak: SNEAK } },
  { componentType: 'Animator', key: 'initialClip', value: 'Stride' },
  { componentType: 'Animator', key: 'clips', value: CLIPS_AFTER },
  { componentType: 'StateMachine', key: 'states', value: STATES_AFTER },
]
const SINGLE_BLEND_PATCHES = [
  { componentType: 'Animator', key: 'blends', value: { Stride: MOVE } },
  { componentType: 'Animator', key: 'initialClip', value: 'Stride' },
  { componentType: 'Animator', key: 'clips', value: { Stride: { speed: 1.5 } } },
  { componentType: 'StateMachine', key: 'states', value: STATES_AFTER },
]

function bytesOf(dataUri: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(',') + 1)), (char) => char.charCodeAt(0))
}

async function rigCache(): Promise<GlbClipCache> {
  const fs = new MemFS('blend-rename-inspector', {})
  await fs.writeFile(RIG_PATH, bytesOf(rig))
  return new GlbClipCache(fs)
}

function machineWithStates(states: Record<string, unknown>): SceneComponentJson {
  return { type: 'StateMachine', props: { role: 'player', initial: 'idle', states } }
}

function hero(animator: Record<string, unknown>, states: Record<string, unknown> = STATES_BEFORE): SceneEntityJson {
  return {
    name: 'Hero',
    position: [0, 0, 0],
    components: [{ type: 'Model', props: { src: RIG_PATH } }, { type: 'Animator', props: animator }, machineWithStates(states)],
  }
}

const selectionOf = (entity: SceneEntityJson) => ({ kind: 'entity' as const, entity, sceneName: 'main', space: '3d' as const })

async function inspect(entity: SceneEntityJson) {
  const view = renderInspectorWithClips(selectionOf(entity), await rigCache())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return view
}

const blends = (): HTMLElement => screen.getByRole('group', { name: 'Blends' })
const card = (name: string): HTMLElement => within(blends()).getByRole('group', { name: `Blend ${name}` })
const nameInputOf = (name: string): HTMLElement => within(card(name)).getByRole('textbox', { name: 'name' })
const optionsOf = (select: HTMLElement): string[] => within(select).getAllByRole('option').map((option) => option.textContent ?? '')

describe('renaming an entity blend rewrites its references (issue 245 CA-1, CA-2)', () => {
  it('rewrites blends, initialClip, clip overrides and StateMachine states on Enter without missing warnings', async () => {
    const initial = hero({ blends: { Move: MOVE, Sneak: SNEAK }, initialClip: 'Move', clips: CLIPS_BEFORE })
    const { props, rerender } = await inspect(initial)
    const user = userEvent.setup()

    await user.clear(nameInputOf('Move'))
    await user.type(nameInputOf('Move'), 'Stride{Enter}')

    expect(props.onPatchProps).toHaveBeenCalledTimes(1)
    expect(props.onPatchProps).toHaveBeenCalledWith('Hero', FULL_PATCHES)

    rerender(selectionOf(hero({ blends: { Stride: MOVE, Sneak: SNEAK }, initialClip: 'Stride', clips: CLIPS_AFTER }, STATES_AFTER)))
    expect(screen.getByRole('combobox', { name: 'Initial clip' })).toHaveProperty('value', 'Stride')
    expect(optionsOf(screen.getByRole('combobox', { name: 'Initial clip' }))).not.toContain('Move — missing ⚠')
    expect(screen.queryByText(/Move — missing/)).toBeNull()
    expect(screen.queryByTitle(/no clip named/)).toBeNull()
    expect(screen.queryByTitle(/No animation for this state/)).toBeNull()
  })

  it('also rewrites references when the blend name input commits on blur', async () => {
    const { props } = await inspect(hero({ blends: { Move: MOVE }, initialClip: 'Move', clips: { Move: { speed: 1.5 } } }))
    const user = userEvent.setup()

    await user.clear(nameInputOf('Move'))
    await user.type(nameInputOf('Move'), 'Stride')
    await user.tab()

    expect(props.onPatchProps).toHaveBeenCalledTimes(1)
    expect(props.onPatchProps).toHaveBeenCalledWith('Hero', SINGLE_BLEND_PATCHES)
  })

  it('only patches Animator.blends when no other property references the renamed blend', async () => {
    const { props } = await inspect(hero({ blends: { Move: MOVE }, initialClip: 'idle', clips: { walk: { speed: 1.2 } } }, { idle: { clip: 'idle' } }))
    const user = userEvent.setup()

    await user.clear(nameInputOf('Move'))
    await user.type(nameInputOf('Move'), 'Stride{Enter}')

    expect(props.onPatchProps).toHaveBeenCalledTimes(1)
    expect(props.onPatchProps).toHaveBeenCalledWith('Hero', [
      { componentType: 'Animator', key: 'blends', value: { Stride: MOVE } },
    ])
  })
})

const HERO_PREFAB: PrefabJson = {
  waicaPrefab: 1,
  type: 'object',
  components: [
    { type: 'Model', props: { src: RIG_PATH } },
    { type: 'Animator', props: { blends: { Move: MOVE }, initialClip: 'Move', clips: { Move: { speed: 1.5 } } } },
    machineWithStates(STATES_BEFORE),
  ],
}

describe('renaming a prefab blend and instance overrides (issue 245 CA-3)', () => {

  it('rewrites all blend references on a prefab when inspecting a prefab', async () => {
    const { props } = renderInspectorWithClips({ kind: 'prefab', ref: 'objects/hero', prefab: HERO_PREFAB }, await rigCache())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const user = userEvent.setup()

    await user.clear(nameInputOf('Move'))
    await user.type(nameInputOf('Move'), 'Stride{Enter}')

    expect(props.onPrefabPatchProps).toHaveBeenCalledTimes(1)
    expect(props.onPrefabPatchProps).toHaveBeenCalledWith('objects/hero', SINGLE_BLEND_PATCHES)
  })

  it('routes machine edits to the entity and offers reset/apply when StateMachine.states is overridden on an instance', async () => {
    const instance: SceneEntityJson = {
      name: 'Hero 1',
      prefab: 'objects/hero',
      overrides: { StateMachine: { states: STATES_AFTER } },
    }
    const { props } = renderInspectorWithClips(selectionOf(instance), await rigCache(), { prefabs: { 'objects/hero': HERO_PREFAB } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'idle' }))
    expect(props.onEditState).toHaveBeenCalledWith({ kind: 'entity', name: 'Hero 1', state: 'idle' })
    await user.click(screen.getByTitle("Reset to the prefab's value"))
    expect(props.onResetProp).toHaveBeenCalledWith('Hero 1', 'StateMachine', 'states')
  })

})

describe('blend rename edge cases and removal (issue 245 CA-5)', () => {
  it('does not rewrite references when removing a blend or submitting an invalid name', async () => {
    const { props } = await inspect(hero({ blends: { Move: MOVE, Sneak: SNEAK }, initialClip: 'Move', clips: { Move: { speed: 1.5 } } }))
    const user = userEvent.setup()

    await user.clear(nameInputOf('Move'))
    await user.type(nameInputOf('Move'), '   {Enter}')
    expect(nameInputOf('Move')).toHaveProperty('value', 'Move')
    await user.clear(nameInputOf('Move'))
    await user.type(nameInputOf('Move'), 'Sneak{Enter}')
    expect(props.onPatchProps).not.toHaveBeenCalled()

    await user.click(within(card('Move')).getByRole('button', { name: 'Remove the Move blend' }))
    expect(props.onProp).toHaveBeenCalledTimes(1)
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'blends', { Sneak: SNEAK })
  })
})

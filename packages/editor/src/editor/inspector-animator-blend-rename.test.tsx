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
const STATES_BEFORE = { idle: { clip: 'Move' }, walk: { clip: 'Move' }, jump: { clip: 'jump' } }
const STATES_AFTER = { idle: { clip: 'Stride' }, walk: { clip: 'Stride' }, jump: { clip: 'jump' } }

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

    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'blends', { Stride: MOVE, Sneak: SNEAK })
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'initialClip', 'Stride')
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'clips', CLIPS_AFTER)
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'StateMachine', 'states', STATES_AFTER)

    rerender(selectionOf(hero({ blends: { Stride: MOVE, Sneak: SNEAK }, initialClip: 'Stride', clips: CLIPS_AFTER }, STATES_AFTER)))
    expect(screen.getByRole('combobox', { name: 'Initial clip' })).toHaveProperty('value', 'Stride')
    expect(optionsOf(screen.getByRole('combobox', { name: 'Initial clip' }))).not.toContain('Move — missing ⚠')
    expect(screen.queryByText(/Move — missing/)).toBeNull()
    expect(screen.queryByTitle(/no clip named/)).toBeNull()
  })

  it('also rewrites references when the blend name input commits on blur', async () => {
    const { props } = await inspect(hero({ blends: { Move: MOVE }, initialClip: 'Move', clips: { Move: { speed: 1.5 } } }))
    const user = userEvent.setup()

    await user.clear(nameInputOf('Move'))
    await user.type(nameInputOf('Move'), 'Stride')
    await user.tab()

    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'blends', { Stride: MOVE })
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'initialClip', 'Stride')
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'clips', { Stride: { speed: 1.5 } })
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'StateMachine', 'states', STATES_AFTER)
  })

  it('only updates Animator.blends when no other property references the renamed blend', async () => {
    const { props } = await inspect(hero({ blends: { Move: MOVE }, initialClip: 'idle', clips: { walk: { speed: 1.2 } } }, { idle: { clip: 'idle' } }))
    const user = userEvent.setup()

    await user.clear(nameInputOf('Move'))
    await user.type(nameInputOf('Move'), 'Stride{Enter}')

    expect(props.onProp).toHaveBeenCalledTimes(1)
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'blends', { Stride: MOVE })
  })
})

describe('renaming a prefab blend and edge cases (issue 245 CA-3, CA-5)', () => {
  it('rewrites all blend references on a prefab when inspecting a prefab', async () => {
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'object',
      components: [
        { type: 'Model', props: { src: RIG_PATH } },
        { type: 'Animator', props: { blends: { Move: MOVE }, initialClip: 'Move', clips: { Move: { speed: 1.5 } } } },
        machineWithStates(STATES_BEFORE),
      ],
    }
    const { props } = renderInspectorWithClips({ kind: 'prefab', ref: 'objects/hero', prefab }, await rigCache())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const user = userEvent.setup()

    await user.clear(nameInputOf('Move'))
    await user.type(nameInputOf('Move'), 'Stride{Enter}')

    expect(props.onPrefabProp).toHaveBeenCalledWith('objects/hero', 'Animator', 'blends', { Stride: MOVE })
    expect(props.onPrefabProp).toHaveBeenCalledWith('objects/hero', 'Animator', 'initialClip', 'Stride')
    expect(props.onPrefabProp).toHaveBeenCalledWith('objects/hero', 'Animator', 'clips', { Stride: { speed: 1.5 } })
    expect(props.onPrefabProp).toHaveBeenCalledWith('objects/hero', 'StateMachine', 'states', STATES_AFTER)
  })

  it('does not rewrite references when removing a blend or submitting an invalid name', async () => {
    const { props } = await inspect(hero({ blends: { Move: MOVE, Sneak: SNEAK }, initialClip: 'Move', clips: { Move: { speed: 1.5 } } }))
    const user = userEvent.setup()

    await user.clear(nameInputOf('Move'))
    await user.type(nameInputOf('Move'), '   {Enter}')
    expect(nameInputOf('Move')).toHaveProperty('value', 'Move')
    await user.clear(nameInputOf('Move'))
    await user.type(nameInputOf('Move'), 'Sneak{Enter}')
    expect(props.onProp).not.toHaveBeenCalled()

    await user.click(within(card('Move')).getByRole('button', { name: 'Remove the Move blend' }))
    expect(props.onProp).toHaveBeenCalledTimes(1)
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'blends', { Sneak: SNEAK })
  })
})

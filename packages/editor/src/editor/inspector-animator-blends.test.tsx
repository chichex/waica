// @vitest-environment happy-dom
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { PrefabJson, SceneComponentJson, SceneEntityJson } from '@waica/engine'
import rig from '../../../engine/fixtures/rig.glb?inline'
import { MemFS } from '../fs/project-fs'
import { GlbClipCache } from './glb-clips'
import { renderInspectorWithClips } from './inspector-test-support'

// Issue 205 CA-19, CA-20: the Animator's Blends section, and blend names offered as clips.

afterEach(cleanup)

const RIG_PATH = 'src/art/rig.glb'
/** A blend over the rig's idle and walk. */
const MOVE = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }] }

/** A file's bytes, from the data URI Vite inlines it as. */
function bytesOf(dataUri: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(',') + 1)), (char) => char.charCodeAt(0))
}

/** The rig fixture at src/art/rig.glb, read through a clip cache. */
async function rigCache(): Promise<GlbClipCache> {
  const fs = new MemFS('blends', {})
  await fs.writeFile(RIG_PATH, bytesOf(rig))
  return new GlbClipCache(fs)
}

/** A 3D character drawing `src`, with an Animator of the given props and, optionally, a machine. */
function hero(animator: Record<string, unknown>, src = RIG_PATH, machine?: SceneComponentJson): SceneEntityJson {
  return { name: 'Hero', position: [0, 0, 0], components: [{ type: 'Model', props: { src } }, { type: 'Animator', props: animator }, ...(machine ? [machine] : [])] }
}

/** The Inspector's selection of `entity` in a 3D scene. */
const selectionOf = (entity: SceneEntityJson) => ({ kind: 'entity' as const, entity, sceneName: 'main', space: '3d' as const })

/** The Inspector on the hero, once the rig's clips are read (or found unreadable). */
async function inspect(entity: SceneEntityJson) {
  const view = renderInspectorWithClips(selectionOf(entity), await rigCache())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return view
}

const blends = (): HTMLElement => screen.getByRole('group', { name: 'Blends' })
const card = (name: string): HTMLElement => within(blends()).getByRole('group', { name: `Blend ${name}` })
const optionsOf = (select: HTMLElement): string[] => within(select).getAllByRole('option').map((option) => option.textContent ?? '')

describe('the Blends section lists and adds blends (issue 205 CA-19)', () => {
  it('shows one card per blend, and an empty section with its add button without any', async () => {
    await inspect(hero({ blends: { Move: MOVE, Sneak: { param: 'stealth', points: [] } } }))
    expect(within(blends()).getAllByRole('group', { name: /^Blend / }).map((group) => group.getAttribute('aria-label'))).toEqual(['Blend Move', 'Blend Sneak'])
    cleanup()

    const { props } = await inspect(hero({}))
    expect(within(blends()).queryAllByRole('group', { name: /^Blend / })).toEqual([])
    await userEvent.setup().click(within(blends()).getByRole('button', { name: 'Add blend' }))
    expect(props.onProp).toHaveBeenCalledTimes(1)
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'blends', { Blend: { param: 'speed', points: [] } })
  })

  it('renames a blend on Enter, keeping its place, and removes one', async () => {
    const { props } = await inspect(hero({ blends: { Move: MOVE, Sneak: { param: 'stealth', points: [] } } }))
    const user = userEvent.setup()
    const name = within(card('Move')).getByRole('textbox', { name: 'name' })

    await user.clear(name)
    await user.type(name, 'Stride{Enter}')
    expect(props.onProp).toHaveBeenCalledTimes(1)
    expect(Object.keys(props.onProp.mock.lastCall?.[3] ?? {})).toEqual(['Stride', 'Sneak'])
    await user.click(within(card('Sneak')).getByRole('button', { name: 'Remove the Sneak blend' }))
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', { Move: MOVE })
  })
})

describe('editing a blend card (issue 205 CA-19)', () => {
  it('writes the param and the smoothing into the whole blends object, one change at a time', async () => {
    const { props } = await inspect(hero({ blends: { Move: MOVE } }))
    const user = userEvent.setup()

    await user.type(within(card('Move')).getByRole('textbox', { name: 'param' }), 'X')
    expect(props.onProp).toHaveBeenCalledTimes(1)
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', { Move: { ...MOVE, param: 'speedX' } })
    const smoothing = within(card('Move')).getByRole('spinbutton', { name: 'smoothing' })
    expect(smoothing).toHaveProperty('value', '0.15')
    await user.clear(smoothing)
    await user.type(smoothing, '0.3')
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', { Move: { ...MOVE, smoothing: 0.3 } })
  })

  it('adds, edits and removes points, picking clips of the glb only and saving the points in threshold order', async () => {
    const { props, rerender } = await inspect(hero({ blends: { Move: MOVE, Other: MOVE } }))
    const user = userEvent.setup()
    const points = within(card('Move')).getByRole('group', { name: 'Move points' })

    await user.click(within(points).getByRole('button', { name: 'Add point' }))
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', { Move: { ...MOVE, points: [...MOVE.points, { clip: 'jump', at: 2 }] }, Other: MOVE })
    const first = within(points).getByRole('group', { name: 'point 1' })
    expect(optionsOf(within(first).getByRole('combobox', { name: 'clip' }))).toEqual(['idle', 'walk', 'jump'])
    await user.selectOptions(within(first).getByRole('combobox', { name: 'clip' }), 'jump')
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', { Move: { ...MOVE, points: [{ clip: 'jump', at: 0 }, { clip: 'walk', at: 1 }] }, Other: MOVE })
    const at = within(first).getByRole('spinbutton', { name: 'at' })
    await user.clear(at)
    await user.type(at, '3')
    // Typed in place; the points go in threshold order once the field is left.
    const typed = { Move: { ...MOVE, points: [{ clip: 'idle', at: 3 }, { clip: 'walk', at: 1 }] }, Other: MOVE }
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', typed)
    rerender(selectionOf(hero({ blends: typed })))
    await user.tab()
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', { Move: { ...MOVE, points: [{ clip: 'walk', at: 1 }, { clip: 'idle', at: 3 }] }, Other: MOVE })
    rerender()
    await user.click(within(points).getByRole('button', { name: 'Remove point 2' }))
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', { Move: { ...MOVE, points: [{ clip: 'idle', at: 0 }] }, Other: MOVE })
  })
})

describe('typing a point’s threshold (issue 205 CA-19)', () => {
  it('keeps every keystroke on the point being typed, the same clip twice included, and orders the points once the field is left', async () => {
    const twice = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'idle', at: 1 }] }
    const { props, rerender } = await inspect(hero({ blends: { Move: twice } }))
    // The Editor commits each keystroke and renders the saved blends again.
    props.onProp.mockImplementation((...[, , , value]: unknown[]) => rerender(selectionOf(hero({ blends: value }))))
    const user = userEvent.setup()
    const at = within(within(card('Move')).getByRole('group', { name: 'point 1' })).getByRole('spinbutton', { name: 'at' })

    await user.clear(at)
    await user.type(at, '50')
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', { Move: { ...twice, points: [{ clip: 'idle', at: 50 }, { clip: 'idle', at: 1 }] } })
    await user.tab()
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', { Move: { ...twice, points: [{ clip: 'idle', at: 1 }, { clip: 'idle', at: 50 }] } })
  })
})

describe('blend points the glb cannot answer for (issue 205 CA-19)', () => {
  it('marks a stored clip the glb lacks and keeps it through another edit', async () => {
    const stored = { param: 'speed', points: [{ clip: 'run', at: 0 }, { clip: 'walk', at: 1 }] }
    const { props } = await inspect(hero({ blends: { Move: stored } }))
    const first = within(card('Move')).getByRole('group', { name: 'point 1' })
    const clip = within(first).getByRole('combobox', { name: 'clip' })

    expect(clip).toHaveProperty('value', 'run')
    expect(optionsOf(clip)).toEqual(['run — missing ⚠', 'idle', 'walk', 'jump'])
    expect(clip.className).toContain('is-missing')
    expect(props.onProp).not.toHaveBeenCalled()
    await userEvent.setup().type(within(card('Move')).getByRole('textbox', { name: 'param' }), 's')
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', { Move: { ...stored, param: 'speeds' } })
  })

  it('takes a typed clip while the glb clips are unreadable', async () => {
    const { props } = await inspect(hero({ blends: { Move: MOVE } }, 'src/art/missing.glb'))
    const first = within(card('Move')).getByRole('group', { name: 'point 1' })

    await userEvent.setup().type(within(first).getByRole('textbox', { name: 'clip' }), 'X')
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'blends', { Move: { ...MOVE, points: [{ clip: 'idleX', at: 0 }, { clip: 'walk', at: 1 }] } })
  })
})

describe('the Blends section on prefabs and prefab instances (issue 205 CA-19)', () => {
  const prefab: PrefabJson = { waicaPrefab: 1, type: 'object', components: [{ type: 'Model', props: { src: RIG_PATH } }, { type: 'Animator', props: { blends: { Move: MOVE } } }] }

  it('marks an instance override of the blends and resets or applies it', async () => {
    const entity: SceneEntityJson = { name: 'Hero 1', prefab: 'objects/hero', overrides: { Animator: { blends: {} } } }
    const { props } = renderInspectorWithClips({ kind: 'entity', entity, sceneName: 'main', space: '3d' }, await rigCache(), { prefabs: { 'objects/hero': prefab } })
    const user = userEvent.setup()

    await user.click(within(blends()).getByTitle("Reset to the prefab's value"))
    expect(props.onResetProp).toHaveBeenCalledWith('Hero 1', 'Animator', 'blends')
    await user.click(within(blends()).getByTitle('Apply to the prefab — every instance gets this value'))
    expect(props.onApplyProp).toHaveBeenCalledWith('Hero 1', 'Animator', 'blends')
  })

  it('edits a prefab’s blends through the prefab', async () => {
    const { props } = renderInspectorWithClips({ kind: 'prefab', ref: 'objects/hero', prefab }, await rigCache())

    await userEvent.setup().click(within(card('Move')).getByRole('button', { name: 'Remove the Move blend' }))
    expect(props.onPrefabProp).toHaveBeenCalledWith('objects/hero', 'Animator', 'blends', {})
  })
})

describe('blend names offered as clips (issue 205 CA-20)', () => {
  it('lists the blends after the glb clips in the initial clip select and the clip overrides picker', async () => {
    await inspect(hero({ blends: { Move: MOVE } }))

    expect(optionsOf(screen.getByRole('combobox', { name: 'Initial clip' }))).toEqual(['(none)', 'idle', 'walk', 'jump', 'Move'])
    expect(optionsOf(screen.getByRole('combobox', { name: 'Add override' }))).toEqual(['add override…', 'idle', 'walk', 'jump', 'Move'])
  })

  it('offers a blend named like a glb clip once, and no blend that is not an object', async () => {
    await inspect(hero({ blends: { walk: MOVE, Bad: 5, Move: MOVE } }))

    expect(optionsOf(screen.getByRole('combobox', { name: 'Initial clip' }))).toEqual(['(none)', 'idle', 'walk', 'jump', 'Move'])
    expect(optionsOf(screen.getByRole('combobox', { name: 'Add override' }))).toEqual(['add override…', 'idle', 'walk', 'jump', 'Move'])
  })

  it('does not warn about a state that plays a blend', async () => {
    const machine: SceneComponentJson = { type: 'StateMachine', props: { role: 'player', initial: 'idle', states: { idle: { clip: 'Move' }, run: { clip: 'Run' } } } }
    await inspect(hero({ blends: { Move: MOVE } }, RIG_PATH, machine))

    expect(screen.getByTitle(/no clip named "Run"/)).toBeDefined()
    expect(screen.queryByTitle(/no clip named "Move"/)).toBeNull()
  })
})

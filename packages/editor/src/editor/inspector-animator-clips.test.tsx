// @vitest-environment happy-dom
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PrefabJson, SceneComponentJson, SceneEntityJson } from '@waica/engine'
import knight from '../../../archetype-third-person/assets/knight.glb?inline'
import rig from '../../../engine/fixtures/rig.glb?inline'
import { MemFS } from '../fs/project-fs'
import { GlbClipCache, observeWrites } from './glb-clips'
import { knownClips } from './inspector/component-meta'
import { renderInspectorWithClips, section } from './inspector-test-support'

/** The third-person archetype Knight's clips, in file order (issue #181 CA-24). */
const KNIGHT_CLIPS = ['1H_Melee_Attack_Chop', 'Death_A', 'Dodge_Forward', 'Idle', 'Jump_Idle', 'Jump_Start', 'Running_A', 'Walking_A']

afterEach(cleanup)

const RIG_PATH = 'src/art/rig.glb'

/** A file's bytes, from the data URI Vite inlines it as. */
function bytesOf(dataUri: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(',') + 1)), (char) => char.charCodeAt(0))
}

/** A project holding the rig fixture at src/art/rig.glb and a text file posing as a glb. */
async function rigProject(): Promise<MemFS> {
  const fs = new MemFS('clips', { 'src/art/notes.glb': 'not a glb' })
  await fs.writeFile(RIG_PATH, bytesOf(rig))
  return fs
}

/** A 3D character drawing `src`, with an Animator of the given props and, optionally, a machine. */
function hero(src: string, animator: Record<string, unknown> = {}, machine?: SceneComponentJson): SceneEntityJson {
  return {
    name: 'Hero',
    position: [0, 0, 0],
    components: [
      { type: 'Model', props: { src } },
      { type: 'Animator', props: animator },
      ...(machine ? [machine] : []),
    ],
  }
}

function inspectHero(entity: SceneEntityJson, cache: GlbClipCache) {
  return renderInspectorWithClips({ kind: 'entity', entity, sceneName: 'main', space: '3d' }, cache)
}

const optionsOf = (select: HTMLElement): string[] => within(select).getAllByRole('option').map((option) => option.textContent ?? '')

/** Lets the cache's read settle and React render its result. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('reading a Model glb clips (issue #173 CA-4)', () => {
  it('reads the bytes once through ProjectFS.readFile, however often the Inspector renders', async () => {
    const fs = await rigProject()
    const readFile = vi.spyOn(fs, 'readFile')
    const view = inspectHero(hero(RIG_PATH), new GlbClipCache(fs))

    const select = await screen.findByRole('combobox', { name: 'Initial clip' })
    view.rerender()
    await settle()

    expect(optionsOf(select)).toEqual(['(none)', 'idle', 'walk', 'jump'])
    expect(readFile).toHaveBeenCalledTimes(1)
    expect(readFile).toHaveBeenCalledWith(RIG_PATH)
  })

  it('reads the file again once it is written, and shows its new clips', async () => {
    const fs = await rigProject()
    const cache = new GlbClipCache(fs)
    const writes = observeWrites(fs, (path) => cache.invalidate(path))
    const readFile = vi.spyOn(fs, 'readFile')
    inspectHero(hero(RIG_PATH), cache)
    await screen.findByRole('combobox', { name: 'Initial clip' })

    await act(async () => writes.writeFile(RIG_PATH, bytesOf(knight)))

    await vi.waitFor(() =>
      expect(optionsOf(screen.getByRole('combobox', { name: 'Initial clip' }))).toEqual(['(none)', ...KNIGHT_CLIPS]),
    )
    expect(readFile).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['an external url', 'https://example.com/hero.glb'],
    ["an archetype's own model", 'waica:hero'],
    ['a missing file', 'src/art/missing.glb'],
    ['a file that is not a glb', 'src/art/notes.glb'],
  ])('treats %s as unreadable: the initial clip stays free text', async (_case, src) => {
    const fs = await rigProject()
    inspectHero(hero(src, { initialClip: 'Idle' }), new GlbClipCache(fs))
    await settle()
    await settle()

    expect(screen.getByRole('textbox', { name: 'Initial clip' })).toHaveProperty('value', 'Idle')
    expect(screen.queryByRole('combobox', { name: 'Initial clip' })).toBeNull()
  })
})

describe('the initial clip select (issue #173 CA-5)', () => {
  it('offers "(none)" then the glb clips, and writes the one picked', async () => {
    const fs = await rigProject()
    const { props } = inspectHero(hero(RIG_PATH, { initialClip: 'idle' }), new GlbClipCache(fs))
    const select = await screen.findByRole('combobox', { name: 'Initial clip' })
    expect(select).toHaveProperty('value', 'idle')

    await userEvent.setup().selectOptions(select, 'walk')

    expect(props.onProp).toHaveBeenCalledTimes(1)
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'initialClip', 'walk')
  })
})

describe('a glb written while the Inspector shows it (PR #175 findings 1 and 6)', () => {
  it('reads a path that was missing once a file is written there, though nothing it shows changed', async () => {
    const fs = await rigProject()
    const cache = new GlbClipCache(fs)
    const writes = observeWrites(fs, (path) => cache.invalidate(path))
    inspectHero(hero('src/art/late.glb', { initialClip: 'idle' }), cache)
    await screen.findByRole('textbox', { name: 'Initial clip' })
    await settle()

    await act(async () => writes.writeFile('src/art/late.glb', bytesOf(rig)))

    expect(await screen.findByRole('combobox', { name: 'Initial clip' })).toBeDefined()
  })

  it('keeps showing the previous clips while a written file is read again', async () => {
    const fs = await rigProject()
    const cache = new GlbClipCache(fs)
    const writes = observeWrites(fs, (path) => cache.invalidate(path))
    inspectHero(hero(RIG_PATH), cache)
    await screen.findByRole('combobox', { name: 'Initial clip' })
    const read = fs.readFile.bind(fs)
    let release = (): void => {}
    vi.spyOn(fs, 'readFile').mockImplementation(async (path) => {
      await new Promise<void>((resolve) => (release = resolve))
      return read(path)
    })

    await act(async () => writes.writeFile(RIG_PATH, bytesOf(knight)))

    expect(screen.getByRole('combobox', { name: 'Initial clip' })).toBeDefined()
    expect(screen.queryByRole('textbox', { name: 'Initial clip' })).toBeNull()
    await act(async () => {
      release()
      await settle()
    })
    await vi.waitFor(() => expect(optionsOf(screen.getByRole('combobox', { name: 'Initial clip' }))).toContain('Walking_A'))
  })
})

const overrides = (): HTMLElement => screen.getByRole('group', { name: 'Clip overrides' })

describe('the clip overrides row (issue #173 CA-6)', () => {
  it('lists each override with its loop checkbox and speed field', async () => {
    const fs = await rigProject()
    inspectHero(hero(RIG_PATH, { clips: { walk: { loop: false, speed: 1.5 }, jump: {} } }), new GlbClipCache(fs))
    await screen.findByRole('combobox', { name: 'Initial clip' })

    const walk = within(overrides()).getByRole('group', { name: 'walk' })
    expect(within(walk).getByRole('checkbox', { name: 'loop' })).toHaveProperty('checked', false)
    expect(within(walk).getByRole('spinbutton', { name: 'speed' })).toHaveProperty('value', '1.5')
    const jump = within(overrides()).getByRole('group', { name: 'jump' })
    expect(within(jump).getByRole('checkbox', { name: 'loop' })).toHaveProperty('checked', true)
    expect(within(jump).getByRole('spinbutton', { name: 'speed' })).toHaveProperty('value', '1')
  })

  it('adds an override for a readable clip not overridden yet', async () => {
    const fs = await rigProject()
    const { props } = inspectHero(hero(RIG_PATH, { clips: { walk: { speed: 2 } } }), new GlbClipCache(fs))
    await screen.findByRole('combobox', { name: 'Initial clip' })
    const add = within(overrides()).getByRole('combobox', { name: 'Add override' })
    expect(optionsOf(add)).toEqual(['add override…', 'idle', 'jump'])

    await userEvent.setup().selectOptions(add, 'jump')

    expect(props.onProp).toHaveBeenCalledTimes(1)
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'clips', { walk: { speed: 2 }, jump: {} })
  })

})

describe('the clip overrides row on a prefab instance (PR #175 finding 2)', () => {
  it('marks the override and resets or applies it', async () => {
    const fs = await rigProject()
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'object',
      components: [
        { type: 'Model', props: { src: RIG_PATH } },
        { type: 'Animator', props: { initialClip: 'idle' } },
      ],
    }
    const entity: SceneEntityJson = { name: 'Hero 1', prefab: 'objects/hero', overrides: { Animator: { clips: { walk: {} } } } }
    const { props } = renderInspectorWithClips({ kind: 'entity', entity, sceneName: 'main', space: '3d' }, new GlbClipCache(fs), {
      prefabs: { 'objects/hero': prefab },
    })
    await screen.findByRole('combobox', { name: 'Initial clip' })
    const user = userEvent.setup()

    await user.click(within(overrides()).getByTitle("Reset to the prefab's value"))
    expect(props.onResetProp).toHaveBeenCalledWith('Hero 1', 'Animator', 'clips')
    await user.click(within(overrides()).getByTitle('Apply to the prefab — every instance gets this value'))
    expect(props.onApplyProp).toHaveBeenCalledWith('Hero 1', 'Animator', 'clips')
  })
})

describe('editing the clip overrides row (issue #173 CA-6)', () => {
  it('writes the loop and speed of an override, and removes it, one change at a time', async () => {
    const fs = await rigProject()
    const { props } = inspectHero(hero(RIG_PATH, { clips: { walk: { speed: 2 } } }), new GlbClipCache(fs))
    await screen.findByRole('combobox', { name: 'Initial clip' })
    const user = userEvent.setup()
    const walk = within(overrides()).getByRole('group', { name: 'walk' })

    await user.click(within(walk).getByRole('checkbox', { name: 'loop' }))
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'clips', { walk: { speed: 2, loop: false } })
    const speed = within(walk).getByRole('spinbutton', { name: 'speed' })
    await user.clear(speed)
    await user.type(speed, '3')
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'clips', { walk: { speed: 3 } })
    await user.click(within(walk).getByRole('button', { name: 'Remove the walk override' }))
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'clips', {})
  })

  it('takes a typed clip name when the glb clips are unreadable', async () => {
    const fs = await rigProject()
    const { props } = inspectHero(hero('src/art/missing.glb', { clips: { walk: {} } }), new GlbClipCache(fs))
    await settle()
    const add = within(overrides()).getByRole('textbox', { name: 'Add override' })

    await userEvent.setup().type(add, 'Run{Enter}')

    expect(props.onProp).toHaveBeenCalledTimes(1)
    expect(props.onProp).toHaveBeenCalledWith('Hero', 'Animator', 'clips', { walk: {}, Run: {} })
  })
})

describe('state clips against the glb (issue #173 CA-7)', () => {
  const machine: SceneComponentJson = {
    type: 'StateMachine',
    props: { role: 'player', initial: 'idle', states: { idle: {}, run: { clip: 'Run' } } },
  }

  it('knownClips gives the glb clips beside a Model that names a file, and null while they are unknown', () => {
    const components = hero(RIG_PATH, {}, machine).components ?? []
    expect(knownClips(null, components, ['idle', 'walk', 'jump'])).toEqual(['idle', 'walk', 'jump'])
    expect(knownClips(null, components, null)).toBeNull()
    expect(knownClips({ type: 'AnimatedSprite', props: { clips: { idle: {} } } }, [machine], null)).toEqual(['idle'])
  })

  it('warns on a state whose clip the readable glb lacks, and not on one it has', async () => {
    const fs = await rigProject()
    inspectHero(hero(RIG_PATH, {}, machine), new GlbClipCache(fs))
    await screen.findByRole('combobox', { name: 'Initial clip' })

    expect(screen.getByTitle(/no clip named "Run"/)).toBeDefined()
    expect(screen.queryByTitle(/no clip named "idle"/)).toBeNull()
  })

  it('warns on nothing while the glb clips are unreadable', async () => {
    const fs = await rigProject()
    inspectHero(hero('src/art/missing.glb', {}, machine), new GlbClipCache(fs))
    await settle()

    expect(screen.queryByTitle(/has no clip named/)).toBeNull()
  })
})

describe('stored clip names missing from the glb (issue #173 CA-8)', () => {
  it('keeps a missing initial clip selected and marks a missing override, writing nothing', async () => {
    const fs = await rigProject()
    const view = inspectHero(hero(RIG_PATH, { initialClip: 'Run', clips: { Fly: { speed: 2 }, walk: {} } }), new GlbClipCache(fs))
    const select = await screen.findByRole('combobox', { name: 'Initial clip' })
    view.rerender()
    await settle()

    expect(select).toHaveProperty('value', 'Run')
    expect(optionsOf(select)).toEqual(['(none)', 'Run — missing ⚠', 'idle', 'walk', 'jump'])
    expect(select.className).toContain('is-missing')
    const overrides = section('Behaviours')
    expect(within(overrides).getByRole('group', { name: 'Fly — missing ⚠' })).toBeDefined()
    expect(within(overrides).getByRole('group', { name: 'walk' })).toBeDefined()
    cleanup()
    expect(view.props.onProp).not.toHaveBeenCalled()
  })
})

describe('the fade of a clip override (issue 205 CA-18)', () => {
  it('writes the fade into the whole clips object, drops it when emptied, and hints the inherited fade', async () => {
    const fs = await rigProject()
    const { props } = inspectHero(hero(RIG_PATH, { fade: 0.2, clips: { walk: { speed: 2 } } }), new GlbClipCache(fs))
    await screen.findByRole('combobox', { name: 'Initial clip' })
    const user = userEvent.setup()
    const walk = within(section('Behaviours')).getByRole('group', { name: 'walk' })
    const fade = within(walk).getByRole('spinbutton', { name: 'fade' })

    expect(fade).toHaveProperty('value', '')
    expect(fade).toHaveProperty('placeholder', '0.2')
    expect(fade.title).toBe('Empty: inherits the Animator fade, 0.2 s')
    await user.type(fade, '0.05')
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'clips', { walk: { speed: 2, fade: 0.05 } })
    const calls = props.onProp.mock.calls.length
    await user.clear(fade)
    expect(props.onProp).toHaveBeenCalledTimes(calls + 1)
    expect(props.onProp).toHaveBeenLastCalledWith('Hero', 'Animator', 'clips', { walk: { speed: 2 } })
  })

  it('hints the default fade when the Animator sets none', async () => {
    const fs = await rigProject()
    inspectHero(hero(RIG_PATH, { clips: { jump: { fade: 0 } } }), new GlbClipCache(fs))
    await screen.findByRole('combobox', { name: 'Initial clip' })
    const fade = within(within(section('Behaviours')).getByRole('group', { name: 'jump' })).getByRole('spinbutton', { name: 'fade' })

    expect(fade).toHaveProperty('value', '0')
    expect(fade).toHaveProperty('placeholder', '0.15')
  })
})

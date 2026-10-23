// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SceneEntityJson, SceneJson } from '@waica/engine'
import rig from '../../../engine/fixtures/rig.glb?inline'
import { MemFS } from '../fs/project-fs'
import { installEditorGlobals, MAIN, openEditor, readScene, viewportEntities } from './test-editor-harness'
import { saveWorkspace } from './workspace'

vi.mock('./Viewport', async () => (await import('./test-editor-stubs')).viewportStubModule())
vi.mock('@monaco-editor/react', async () => (await import('./test-editor-stubs')).monacoStubModule())
vi.mock('./play-runner', async () => (await import('./test-editor-stubs')).playRunnerStubModule())

installEditorGlobals()

/** A file's bytes, from the data URI Vite inlines it as. */
function bytesOf(dataUri: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(',') + 1)), (char) => char.charCodeAt(0))
}

/** The rig character: its glb Model, an Animator and a machine whose `run` state names a clip the rig lacks. */
function hero(src: string, animator: Record<string, unknown>): SceneEntityJson {
  return {
    name: 'Hero',
    position: [0, 0, 0],
    components: [
      { type: 'Model', props: { src } },
      { type: 'Animator', props: animator },
      { type: 'StateMachine', props: { role: 'player', initial: 'idle', states: { idle: {}, run: { clip: 'Run' } } } },
    ],
  }
}

function scene3d(entity: SceneEntityJson): SceneJson {
  return { waicaScene: 3, render: { space: '3d' }, entities: [entity, { name: 'Box', position: [2, 0, 0] }] }
}

/** A 3D project whose main scene holds `entity`, with the rig fixture at src/art/rig.glb. */
async function rigProject(entity: SceneEntityJson): Promise<MemFS> {
  const fs = new MemFS('glb-clips', {
    'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'platformer', resolution: { mode: 'fill', width: 640, height: 360 }, pixelsPerUnit: 16 }),
    [MAIN]: JSON.stringify(scene3d(entity)),
  })
  await fs.writeFile('src/art/rig.glb', bytesOf(rig))
  return fs
}

/** The Editor on the main scene with Hero selected. */
async function openOnHero(fs: MemFS) {
  saveWorkspace(fs.name, MAIN, { kind: 'scene', path: MAIN })
  const opened = openEditor(fs)
  await vi.waitFor(() => expect(viewportEntities()).toEqual(['Hero', 'Box']))
  await opened.user.click(screen.getByRole('button', { name: /Hero$/ }))
  return opened
}

const optionsOf = (select: HTMLElement): string[] => within(select).getAllByRole('option').map((option) => option.textContent ?? '')

async function savedAnimator(fs: MemFS): Promise<Record<string, unknown> | undefined> {
  const saved = await readScene(fs, MAIN)
  return saved.entities[0]?.components?.find((component) => component.type === 'Animator')?.props
}

describe('glb clips in the Editor (issue #173 CA-5, CA-6)', () => {
  it('writes the initial clip picked from the dropdown as one undoable commit', async () => {
    const fs = await rigProject(hero('src/art/rig.glb', { initialClip: 'idle' }))
    const { user } = await openOnHero(fs)
    const select = await screen.findByRole('combobox', { name: 'Initial clip' })

    await user.selectOptions(select, 'walk')
    await vi.waitFor(async () => expect((await savedAnimator(fs))?.initialClip).toBe('walk'))
    await user.keyboard('{Control>}z{/Control}')

    expect(screen.getByRole('combobox', { name: 'Initial clip' })).toHaveProperty('value', 'idle')
    await vi.waitFor(async () => expect((await savedAnimator(fs))?.initialClip).toBe('idle'))
  })

  it('adds a clip override as one undoable commit', async () => {
    const fs = await rigProject(hero('src/art/rig.glb', { initialClip: 'idle' }))
    const { user } = await openOnHero(fs)
    await screen.findByRole('combobox', { name: 'Initial clip' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Add override' }), 'walk')
    await vi.waitFor(async () => expect((await savedAnimator(fs))?.clips).toEqual({ walk: {} }))
    await user.keyboard('{Control>}z{/Control}')

    await vi.waitFor(async () => expect((await savedAnimator(fs))?.clips).toBeUndefined())
    expect(within(screen.getByRole('group', { name: 'Clip overrides' })).queryByRole('group', { name: 'walk' })).toBeNull()
  })
})

describe('the state modal against the glb (issue #173 CA-7)', () => {
  it("lists the glb's clips in a state's animation select", async () => {
    const fs = await rigProject(hero('src/art/rig.glb', {}))
    const { user } = await openOnHero(fs)
    await screen.findByRole('combobox', { name: 'Initial clip' })

    await user.click(screen.getByRole('button', { name: 'run', description: 'Edit this state (clip, transitions, code)' }))

    const animation = screen.getByRole('combobox', { name: 'animation' })
    expect(optionsOf(animation)).toEqual(['same name (run) — missing', 'Run — missing ⚠', 'idle', 'walk', 'jump'])
    expect(animation).toHaveProperty('value', 'Run')
  })

  it('keeps the clip free text, with no warning, while the glb clips are unreadable', async () => {
    const fs = await rigProject(hero('src/art/missing.glb', {}))
    const { user } = await openOnHero(fs)
    await screen.findByRole('textbox', { name: 'Initial clip' })

    await user.click(screen.getByRole('button', { name: 'run', description: 'Edit this state (clip, transitions, code)' }))

    expect(screen.getByRole('textbox', { name: 'animation' })).toHaveProperty('value', 'Run')
    expect(screen.queryByText(/No animation for this state/)).toBeNull()
  })
})

describe('stored clip names the glb lacks (issue #173 CA-8)', () => {
  it('opening, viewing and closing the Inspector leaves the scene file untouched', async () => {
    const entity = hero('src/art/rig.glb', { initialClip: 'Gone', clips: { Fly: { speed: 2 } } })
    const fs = await rigProject(entity)
    const before = await readScene(fs, MAIN)
    const { user, unmount } = await openOnHero(fs)
    const select = await screen.findByRole('combobox', { name: 'Initial clip' })
    expect(select).toHaveProperty('value', 'Gone')

    await user.click(screen.getByRole('button', { name: /Box$/ }))
    await user.click(screen.getByRole('button', { name: /Hero$/ }))
    await screen.findByRole('combobox', { name: 'Initial clip' })
    unmount()

    expect(await readScene(fs, MAIN)).toEqual(before)
  })
})

describe('blend names in the state modal (issue 205 CA-20)', () => {
  it("lists the Animator's blends in a state's animation select, and does not warn about a state that plays one", async () => {
    const entity = hero('src/art/rig.glb', { blends: { Move: { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }] } } })
    const machine = entity.components?.find((component) => component.type === 'StateMachine')
    if (machine) machine.props = { role: 'player', initial: 'idle', states: { idle: { clip: 'Move' }, run: { clip: 'Run' } } }
    const fs = await rigProject(entity)
    const { user } = await openOnHero(fs)
    await screen.findByRole('combobox', { name: 'Initial clip' })

    await user.click(screen.getByRole('button', { name: 'idle', description: 'Edit this state (clip, transitions, code)' }))

    const animation = screen.getByRole('combobox', { name: 'animation' })
    expect(optionsOf(animation)).toEqual(['same name (idle)', 'idle', 'walk', 'jump', 'Move'])
    expect(animation).toHaveProperty('value', 'Move')
    expect(screen.queryByText(/No animation for this state/)).toBeNull()
  })
})

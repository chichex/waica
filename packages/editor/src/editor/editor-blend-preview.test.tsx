// @vitest-environment happy-dom
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrefabJson, SceneEntityJson, SceneJson } from '@waica/engine'
import rig from '../../../engine/fixtures/rig.glb?inline'
import { MemFS } from '../fs/project-fs'
import { installEditorGlobals, MAIN, openEditor, readScene, viewportEntities } from './test-editor-harness'
import { stubViewportHandle } from './test-editor-stubs'
import { saveWorkspace } from './workspace'

vi.mock('./Viewport', async () => (await import('./test-editor-stubs')).viewportStubModule())
vi.mock('@monaco-editor/react', async () => (await import('./test-editor-stubs')).monacoStubModule())
vi.mock('./play-runner', async () => (await import('./test-editor-stubs')).playRunnerStubModule())

// Issue 205 CA-21: the Inspector previews a blend through the stage's handle, never through a commit.

installEditorGlobals()
beforeEach(() => stubViewportHandle.reset())

const MOVE = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }, { clip: 'jump', at: 2 }] }
const LEAN = { param: 'lean', points: [{ clip: 'idle', at: -1 }, { clip: 'walk', at: 1 }] }

/** A file's bytes, from the data URI Vite inlines it as. */
function bytesOf(dataUri: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(',') + 1)), (char) => char.charCodeAt(0))
}

const HERO: SceneEntityJson = {
  name: 'Hero',
  position: [0, 0, 0],
  components: [{ type: 'Model', props: { src: 'src/art/rig.glb' } }, { type: 'Animator', props: { initialClip: 'idle', blends: { Move: MOVE, Lean: LEAN } } }],
}

/** A project whose main scene, of `space`, holds the rigged Hero and a Box. */
async function rigProject(space: '2d' | '3d' = '3d'): Promise<MemFS> {
  const scene: SceneJson = { waicaScene: 3, ...(space === '3d' ? { render: { space: '3d' } } : {}), entities: [HERO, { name: 'Box', position: [2, 0, 0] }] }
  const fs = new MemFS('blend-preview', {
    'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'platformer', resolution: { mode: 'fill', width: 640, height: 360 }, pixelsPerUnit: 16 }),
    [MAIN]: JSON.stringify(scene),
  })
  await fs.writeFile('src/art/rig.glb', bytesOf(rig))
  return fs
}

async function openOn(fs: MemFS, name: string) {
  saveWorkspace(fs.name, MAIN, { kind: 'scene', path: MAIN })
  const opened = openEditor(fs)
  await vi.waitFor(() => expect(viewportEntities()).toEqual(['Hero', 'Box']))
  await opened.user.click(screen.getByRole('button', { name: new RegExp(`${name}$`) }))
  return opened
}

const card = (name = 'Move'): HTMLElement => within(screen.getByRole('group', { name: 'Blends' })).getByRole('group', { name: `Blend ${name}` })
const slider = (): HTMLElement => within(card()).getByRole('slider', { name: 'Preview speed' })
const leanSlider = (): HTMLElement => within(card('Lean')).getByRole('slider', { name: 'Preview lean' })

describe('the blend preview in the Editor (issue 205 CA-21)', () => {
  it('drives the live Animator through the stage handle, never the scene file or the history, and ends with the selection', async () => {
    const fs = await rigProject()
    const before = await readScene(fs, MAIN)
    const { user } = await openOn(fs, 'Hero')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Initial clip' }), 'walk')

    expect(slider()).toHaveProperty('disabled', false)
    fireEvent.change(slider(), { target: { value: '1.5' } })
    fireEvent.change(slider(), { target: { value: '2' } })
    expect(stubViewportHandle.previews).toEqual([['Hero', 'Move', 'speed', 1.5], ['Hero', 'Move', 'speed', 2]])
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.getByRole('combobox', { name: 'Initial clip' })).toHaveProperty('value', 'idle')
    await vi.waitFor(async () => expect(await readScene(fs, MAIN)).toEqual(before))

    await user.click(screen.getByRole('button', { name: /Box$/ }))
    expect(stubViewportHandle.stops).toEqual([['Hero', 'Move']])
    await user.click(screen.getByRole('button', { name: /Hero$/ }))
    expect(slider()).toHaveProperty('value', '0')
  })
})

describe('one blend preview at a time in the Editor (issue 205 CA-21)', () => {
  it('moves the other cards’ sliders back to rest when one starts, and a card leaving ends only its own preview', async () => {
    const { user } = await openOn(await rigProject(), 'Hero')
    fireEvent.change(await vi.waitFor(() => slider()), { target: { value: '1.5' } })
    fireEvent.change(leanSlider(), { target: { value: '0.5' } })

    expect(stubViewportHandle.previews).toEqual([['Hero', 'Move', 'speed', 1.5], ['Hero', 'Lean', 'lean', 0.5]])
    expect(slider()).toHaveProperty('value', '0')
    expect(leanSlider()).toHaveProperty('value', '0.5')
    await user.click(within(card()).getByRole('button', { name: 'Remove the Move blend' }))
    expect(stubViewportHandle.stops).toEqual([])
    expect(leanSlider()).toHaveProperty('value', '0.5')
  })
})

describe('when the blend preview is off in the Editor (issue 205 CA-21)', () => {
  it('says why while the stage’s Animator has not loaded, and tries again on the next move', async () => {
    stubViewportHandle.refusal = 'not-loaded'
    await openOn(await rigProject(), 'Hero')
    fireEvent.change(await vi.waitFor(() => slider()), { target: { value: '1' } })

    expect(within(card()).getByText('No live Animator to preview on: its model has not loaded.')).toBeDefined()
    expect(slider()).toHaveProperty('disabled', false)
    stubViewportHandle.refusal = null
    fireEvent.change(slider(), { target: { value: '1.5' } })
    expect(stubViewportHandle.previews).toEqual([['Hero', 'Move', 'speed', 1], ['Hero', 'Move', 'speed', 1.5]])
    expect(within(card()).queryByText(/has not loaded/)).toBeNull()
    expect(slider()).toHaveProperty('value', '1.5')
  })

  it('disables the slider, saying to rebuild the stage, for a blend the stage’s Animator was built without', async () => {
    stubViewportHandle.refusal = 'not-built'
    await openOn(await rigProject(), 'Hero')
    fireEvent.change(await vi.waitFor(() => slider()), { target: { value: '1' } })

    expect(slider()).toHaveProperty('disabled', true)
    expect(within(card()).getByText('The stage was built before this blend or its param: press Play and Stop to rebuild it, then preview.')).toBeDefined()
  })

  it('disables the slider in a 2D scene, where an Animator creates nothing', async () => {
    await openOn(await rigProject('2d'), 'Hero')

    expect(await vi.waitFor(() => slider())).toHaveProperty('disabled', true)
    expect(within(card()).getByText('A 2D scene has no live Animator to preview on.')).toBeDefined()
    expect(stubViewportHandle.previews).toEqual([])
  })

  it('ends a running preview on Play, and keeps the slider off while the game plays', async () => {
    const { user } = await openOn(await rigProject(), 'Hero')
    fireEvent.change(await vi.waitFor(() => slider()), { target: { value: '1' } })
    expect(stubViewportHandle.previews).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '▶ Play' }))
    expect(await screen.findByText('viewport mode: play')).toBeDefined()
    expect(stubViewportHandle.stops).toEqual([['Hero', 'Move']])
    await user.click(screen.getByRole('button', { name: /Hero$/ }))
    expect(slider()).toHaveProperty('disabled', true)
    expect(within(card()).getByText('Preview runs in edit mode.')).toBeDefined()
  })
})

const HERO_PREFAB: PrefabJson = {
  waicaPrefab: 1,
  type: 'object',
  components: [
    { type: 'Model', props: { src: 'src/art/rig.glb' } },
    {
      type: 'Animator',
      props: {
        initialClip: 'Move',
        clips: { Move: { loop: false, speed: 1.5, fade: 0.2 }, walk: { speed: 1.2 } },
        blends: { Move: MOVE, Lean: LEAN },
      },
    },
    {
      type: 'StateMachine',
      props: {
        role: 'player',
        initial: 'idle',
        states: { idle: { clip: 'Move' }, walk: { clip: 'Move' }, jump: { clip: 'jump' } },
      },
    },
  ],
}

const EXPECTED_OVERRIDES = {
  Animator: {
    blends: { Stride: MOVE, Lean: LEAN },
    initialClip: 'Stride',
    clips: { Stride: { loop: false, speed: 1.5, fade: 0.2 }, walk: { speed: 1.2 } },
  },
  StateMachine: {
    states: { idle: { clip: 'Stride' }, walk: { clip: 'Stride' }, jump: { clip: 'jump' } },
  },
}

async function prefabInstanceProject(): Promise<MemFS> {
  const scene: SceneJson = {
    waicaScene: 3,
    render: { space: '3d' },
    entities: [
      { name: 'Hero', prefab: 'objects/hero', position: [0, 0, 0] },
      { name: 'Box', position: [2, 0, 0] },
    ],
  }
  const fs = new MemFS('blend-rename', {
    'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'platformer', resolution: { mode: 'fill', width: 640, height: 360 }, pixelsPerUnit: 16 }),
    [MAIN]: JSON.stringify(scene),
    'src/objects/hero.object.json': JSON.stringify(HERO_PREFAB),
  })
  await fs.writeFile('src/art/rig.glb', bytesOf(rig))
  return fs
}

async function readHeroPrefab(fs: MemFS): Promise<PrefabJson> {
  return JSON.parse((await fs.readText('src/objects/hero.object.json')) ?? '{}') as PrefabJson
}

describe('renaming a blend in the Editor (issue 245 CA-3, CA-4)', () => {
  it('writes all blend rename updates to entity overrides without mutating the prefab, in a single undo/redo step', async () => {
    const fs = await prefabInstanceProject()
    const beforeScene = await readScene(fs, MAIN)
    const beforePrefabText = await fs.readText('src/objects/hero.object.json')
    const { user } = await openOn(fs, 'Hero')
    const nameInput = await vi.waitFor(() => within(card('Move')).getByRole('textbox', { name: 'name' }))

    await user.clear(nameInput)
    await user.type(nameInput, 'Stride{Enter}')
    await vi.waitFor(async () => {
      const hero = (await readScene(fs, MAIN)).entities.find((e) => e.name === 'Hero')
      expect(hero?.overrides).toEqual(EXPECTED_OVERRIDES)
    })
    expect(await fs.readText('src/objects/hero.object.json')).toBe(beforePrefabText)

    await user.keyboard('{Control>}z{/Control}')
    await vi.waitFor(async () => expect(await readScene(fs, MAIN)).toEqual(beforeScene))
    await user.keyboard('{Control>}y{/Control}')
    await vi.waitFor(async () => {
      const hero = (await readScene(fs, MAIN)).entities.find((e) => e.name === 'Hero')
      expect(hero?.overrides).toEqual(EXPECTED_OVERRIDES)
    })
  })

})

describe('renaming a prefab blend in the Editor (issue 245 CA-3, CA-4)', () => {
  it('writes all blend rename updates on the prefab in a single undoable commit when inspecting a prefab', async () => {
    const fs = await prefabInstanceProject()
    const beforePrefab = await readHeroPrefab(fs)
    const { user } = await openOn(fs, 'Hero')
    await user.click(screen.getByRole('button', { name: '▣ hero' }))
    const nameInput = await vi.waitFor(() => within(card('Move')).getByRole('textbox', { name: 'name' }))

    await user.clear(nameInput)
    await user.type(nameInput, 'Stride{Enter}')
    await vi.waitFor(async () => {
      const saved = await readHeroPrefab(fs)
      const anim = saved.components.find((c) => c.type === 'Animator')
      const machine = saved.components.find((c) => c.type === 'StateMachine')
      expect(anim?.props?.initialClip).toBe('Stride')
      expect(machine?.props?.states).toEqual(EXPECTED_OVERRIDES.StateMachine.states)
    })

    await user.keyboard('{Control>}z{/Control}')
    await vi.waitFor(async () => expect(await readHeroPrefab(fs)).toEqual(beforePrefab))
  })
})

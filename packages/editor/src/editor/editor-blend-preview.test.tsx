// @vitest-environment happy-dom
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneEntityJson, SceneJson } from '@waica/engine'
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

/** A file's bytes, from the data URI Vite inlines it as. */
function bytesOf(dataUri: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(',') + 1)), (char) => char.charCodeAt(0))
}

const HERO: SceneEntityJson = {
  name: 'Hero',
  position: [0, 0, 0],
  components: [{ type: 'Model', props: { src: 'src/art/rig.glb' } }, { type: 'Animator', props: { initialClip: 'idle', blends: { Move: MOVE } } }],
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

const card = (): HTMLElement => within(screen.getByRole('group', { name: 'Blends' })).getByRole('group', { name: 'Blend Move' })
const slider = (): HTMLElement => within(card()).getByRole('slider', { name: 'Preview speed' })

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
    expect(stubViewportHandle.stops).toBe(1)
    await user.click(screen.getByRole('button', { name: /Hero$/ }))
    expect(slider()).toHaveProperty('value', '0')
  })

})

describe('when the blend preview is off in the Editor (issue 205 CA-21)', () => {
  it('disables the slider, saying why, when the stage has no live Animator to play the blend', async () => {
    stubViewportHandle.live = false
    await openOn(await rigProject(), 'Hero')
    fireEvent.change(await vi.waitFor(() => slider()), { target: { value: '1' } })

    expect(slider()).toHaveProperty('disabled', true)
    expect(within(card()).getByText('No live Animator to preview on: its model has not loaded.')).toBeDefined()
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
    expect(stubViewportHandle.stops).toBe(1)
    await user.click(screen.getByRole('button', { name: /Hero$/ }))
    expect(slider()).toHaveProperty('disabled', true)
    expect(within(card()).getByText('Preview runs in edit mode.')).toBeDefined()
  })
})

// @vitest-environment happy-dom
import { fireEvent, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { SceneJson } from '@waica/engine'
import { MemFS } from '../fs/project-fs'
import { section } from './inspector-test-support'
import { installEditorGlobals, MAIN, openEditor, readScene, viewportEntities } from './test-editor-harness'
import { saveWorkspace } from './workspace'

vi.mock('./Viewport', async () => (await import('./test-editor-stubs')).viewportStubModule())
vi.mock('@monaco-editor/react', async () => (await import('./test-editor-stubs')).monacoStubModule())
vi.mock('./play-runner', async () => (await import('./test-editor-stubs')).playRunnerStubModule())

installEditorGlobals()

// Issue #181 CA-33: the Follow section edits the scene JSON through the history.

const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 4, 10], target: [0, 1, 0], fov: 55 },
  entities: [{ name: 'Player', position: [0, 0, 0] }],
}

async function openOnCamera() {
  const fs = new MemFS('camera-follow', {
    'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'third-person', resolution: { mode: 'fill', width: 640, height: 360 }, pixelsPerUnit: 16 }),
    [MAIN]: JSON.stringify(SCENE),
  })
  saveWorkspace(fs.name, MAIN, { kind: 'scene', path: MAIN })
  const opened = openEditor(fs)
  await vi.waitFor(() => expect(viewportEntities()).toEqual(['Player']))
  await opened.user.click(screen.getByRole('button', { name: '🎥 Camera' }))
  return { fs, ...opened }
}

it('writes follow and an orbit number into the scene, and Ctrl+Z undoes each (CA-33)', async () => {
  const { fs, user } = await openOnCamera()
  const follow = within(section('Follow')).getByRole('combobox', { name: 'follow' })

  fireEvent.change(follow, { target: { value: 'Player' } })
  await vi.waitFor(async () => expect((await readScene(fs, MAIN)).camera).toMatchObject({ follow: 'Player' }))
  fireEvent.change(within(section('Follow')).getByRole('slider', { name: /^Distance/ }), { target: { value: '9' } })
  await vi.waitFor(async () => expect((await readScene(fs, MAIN)).camera).toMatchObject({ follow: 'Player', distance: 9 }))

  await user.keyboard('{Control>}z{/Control}')
  await vi.waitFor(async () => expect((await readScene(fs, MAIN)).camera).not.toHaveProperty('distance'))
  await user.keyboard('{Control>}z{/Control}')
  await vi.waitFor(async () => expect((await readScene(fs, MAIN)).camera).toEqual(SCENE.camera))
})

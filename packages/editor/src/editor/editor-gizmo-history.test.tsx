// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SceneJson } from '@waica/engine'
import { defined } from '../../../engine/src/test-support'
import { MemFS } from '../fs/project-fs'
import { installEditorGlobals, MAIN, openEditor, readScene, viewportEntities } from './test-editor-harness'
import { saveWorkspace } from './workspace'

vi.mock('./Viewport', async () => (await import('./test-editor-stubs')).viewportStubModule())
vi.mock('@monaco-editor/react', async () => (await import('./test-editor-stubs')).monacoStubModule())
vi.mock('./play-runner', async () => (await import('./test-editor-stubs')).playRunnerStubModule())

installEditorGlobals()

const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  entities: [
    { name: 'Knight', position: [0, 0, 0] },
    { name: 'Crate', position: [4, 0, 0], scale: [2, 2, 2] },
  ],
}

async function openOnKnight() {
  const fs = new MemFS('gizmo', {
    'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'platformer', resolution: { mode: 'fill', width: 640, height: 360 }, pixelsPerUnit: 16 }),
    [MAIN]: JSON.stringify(SCENE),
  })
  saveWorkspace(fs.name, MAIN, { kind: 'scene', path: MAIN })
  const opened = openEditor(fs)
  await vi.waitFor(() => expect(viewportEntities()).toEqual(['Knight', 'Crate']))
  await opened.user.click(screen.getByRole('button', { name: /Knight$/ }))
  return { fs, ...opened }
}

/** The X, Y and Z fields of an Inspector transform row. */
const fieldsOf = (label: string): string[] =>
  within(defined(screen.getByText(label, { selector: 'span' }).parentElement, `the ${label} row`))
    .getAllByRole<HTMLInputElement>('spinbutton')
    .map((field) => field.value)

describe('a released gizmo drag in the Editor (issue #173 CA-19, CA-21)', () => {
  it('writes every dragged transform, shows it in the Inspector, and one Ctrl+Z undoes the whole drag', async () => {
    const { fs, user } = await openOnKnight()

    await user.click(screen.getByRole('button', { name: 'gizmo drag' }))

    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      // setEntityTransform leaves an identity rotation or scale out of the JSON.
      expect(saved.entities.map((entity) => [entity.position, entity.rotation, entity.scale])).toEqual([
        [[1.5, 2, -3], [0, 90, 0], undefined],
        [[3.5, 2, -3], undefined, undefined],
      ])
    })
    expect(fieldsOf('position')).toEqual(['1.5', '2', '-3'])
    expect(fieldsOf('rotation')).toEqual(['0', '90', '0'])

    await user.keyboard('{Control>}z{/Control}')

    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      expect(saved.entities).toEqual(SCENE.entities)
    })
    expect(fieldsOf('position')).toEqual(['0', '0', '0'])
  })
})

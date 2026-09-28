// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { defined } from '../../../engine/src/test-support'
import {
  installEditorGlobals,
  MAIN,
  openAtMainScene,
  openEditor,
  project,
  readScene,
  viewportEntities,
} from './test-editor-harness'

vi.mock('./Viewport', async () => (await import('./test-editor-stubs')).viewportStubModule())
vi.mock('@monaco-editor/react', async () => (await import('./test-editor-stubs')).monacoStubModule())
vi.mock('./play-runner', async () => (await import('./test-editor-stubs')).playRunnerStubModule())

installEditorGlobals()

describe('Editor characterization: toolbar and workspace', () => {
  it('shows the project in the toolbar and asks to pick something without a saved workspace', async () => {
    openEditor(project())

    expect(await screen.findByText('in-memory demo')).toBeDefined()
    expect(screen.getByText('select something on the left to open it')).toBeDefined()
    const picker = screen.getByRole('combobox', { name: 'Scene to play' })
    await vi.waitFor(() =>
      expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'scene…',
        'level-2',
        'main',
      ]),
    )
    expect(screen.getByRole('button', { name: '▶ Play' })).toHaveProperty('disabled', true)
    expect(screen.getByText('saved ✓')).toBeDefined()
  })

  it('reopens the saved scene with its breadcrumb and entities', async () => {
    await openAtMainScene()

    expect(screen.getByRole('combobox')).toHaveProperty('value', MAIN)
    expect(screen.getByText('viewport mode: edit')).toBeDefined()
    expect(screen.getByRole('button', { name: '▶ Play' })).toHaveProperty('disabled', false)
  })

})

describe('Editor characterization: entity history', () => {
  it('adds an entity, undoes and redoes it from the keyboard, and saves the result', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { description: 'New entity' }))
    expect(viewportEntities()).toEqual(['Hero', 'Box', 'Entity'])
    expect(screen.getByText('saving…')).toBeDefined()

    await user.keyboard('{Control>}z{/Control}')
    expect(viewportEntities()).toEqual(['Hero', 'Box'])

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(viewportEntities()).toEqual(['Hero', 'Box', 'Entity'])

    unmount()
    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      expect(saved.entities.map((e) => e.name)).toEqual(['Hero', 'Box', 'Entity'])
    })
  })

})

describe('Editor characterization: viewport edits', () => {
  it('writes a viewport move into the scene file', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: 'move first entity' }))
    unmount()

    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      expect(saved.entities[0]?.position).toEqual([3, 4])
    })
  })

  it('drops a prefab from the library into the scene, rounded and selected', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: 'drop crate' }))
    expect(viewportEntities()).toEqual(['Hero', 'Box', 'Crate'])
    unmount()

    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      expect(saved.entities[2]).toEqual({
        name: 'Crate',
        prefab: 'objects/crate',
        position: [1.23, 2.35],
      })
    })
  })

  it('duplicates the selected entity with Ctrl+D', async () => {
    const { user } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: /Hero$/ }))
    await user.keyboard('{Control>}d{/Control}')

    expect(viewportEntities()).toHaveLength(3)
    expect(viewportEntities()[2]).toMatch(/^Hero/)
  })

})

describe('Editor characterization: entity selection edits', () => {
  it('groups the selected entity into a new folder with Ctrl+G', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: /Hero$/ }))
    await user.keyboard('{Control>}g{/Control}')
    unmount()

    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      expect(saved.entities.find((e) => e.name === 'Hero')?.folder).toBe('Group')
    })
  })

  it('moves the selected entity from the inspector position field', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: /Hero$/ }))
    const [x] = screen.getAllByRole('spinbutton')
    await user.clear(defined(x, 'the x field'))
    await user.type(defined(x, 'the x field'), '7')
    unmount()

    await vi.waitFor(async () => {
      const saved = await readScene(fs, MAIN)
      expect(saved.entities[0]?.position).toEqual([7, 0])
    })
  })

  it('renames an entity from the explorer', async () => {
    const { user } = await openAtMainScene()

    await user.dblClick(screen.getByRole('button', { name: /Hero$/ }))
    // The rename field takes focus with its text selected: typing replaces it.
    await user.keyboard('Player{Enter}')

    expect(viewportEntities()).toEqual(['Player', 'Box'])
  })

})

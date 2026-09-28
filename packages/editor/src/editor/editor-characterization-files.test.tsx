// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PrefabJson } from '@waica/engine'
import { defined } from '../../../engine/src/test-support'
import {
  alertStub,
  confirmStub,
  installEditorGlobals,
  LEVEL,
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

describe('Editor characterization: scene files', () => {
  it('creates a new scene file and opens it', async () => {
    const { fs, user } = await openAtMainScene()

    await user.click(screen.getByRole('button', { description: 'New scene' }))

    await vi.waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveProperty('value', 'src/scenes/scene-1.scene.json'),
    )
    expect(await readScene(fs, 'src/scenes/scene-1.scene.json')).toEqual({
      waicaScene: 3,
      entities: [],
    })
  })

  it('switches scenes from the toolbar picker', async () => {
    const { user } = await openAtMainScene()

    await user.selectOptions(screen.getByRole('combobox'), LEVEL)

    await vi.waitFor(() => expect(viewportEntities()).toEqual(['Door']))
  })

  it('deletes a scene after confirming, and undo brings the file back', async () => {
    const { fs, user } = await openAtMainScene()

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /level-2$/ }),
    })
    await user.click(screen.getByRole('menuitem', { name: /Delete/ }))

    expect(confirmStub).toHaveBeenCalledWith('Delete level-2.scene.json?')
    await vi.waitFor(async () => expect(await fs.readText(LEVEL)).toBeNull())

    await user.keyboard('{Control>}z{/Control}')
    await vi.waitFor(async () => expect(await fs.readText(LEVEL)).not.toBeNull())
    await vi.waitFor(() => expect(viewportEntities()).toEqual(['Door']))
  })

})

describe('Editor characterization: prefab creation', () => {
  it('creates an object prefab and opens it with the prefab breadcrumb', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { description: 'New object' }))

    expect(screen.getByText('objects / object-1')).toBeDefined()
    expect(screen.getByText('edits reach every instance')).toBeDefined()
    unmount()
    await vi.waitFor(async () =>
      expect(await fs.readText('src/objects/object-1.object.json')).not.toBeNull(),
    )
  })

  it('creates a character through the role picker', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { description: 'New character' }))
    expect(screen.getByText('New character — what is it?')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(screen.queryByText('New character — what is it?')).toBeNull()
    expect(screen.getByText('characters / character-1')).toBeDefined()
    unmount()
    await vi.waitFor(async () => {
      const text = defined(await fs.readText('src/characters/character-1.character.json'))
      const prefab = JSON.parse(text) as PrefabJson
      expect(prefab.type).toBe('character')
      const machine = prefab.components.find((c) => c.type === 'StateMachine')
      expect(machine?.props?.role).toBe('player')
    })
  })

})

describe('Editor characterization: prefab renames', () => {
  it('renames a prefab and rewrites every scene that uses it', async () => {
    const { fs, user } = await openAtMainScene()

    await user.dblClick(screen.getByRole('button', { name: '▣ crate' }))
    await user.keyboard('barrel{Enter}')

    await vi.waitFor(async () =>
      expect(await fs.readText('src/objects/crate.object.json')).toBeNull(),
    )
    expect(await fs.readText('src/objects/barrel.object.json')).not.toBeNull()
    expect((await readScene(fs, MAIN)).entities[1]?.prefab).toBe('objects/barrel')
    expect((await readScene(fs, LEVEL)).entities[0]?.prefab).toBe('objects/barrel')
    expect(screen.getByText('saved ✓')).toBeDefined()
  })

  it('refuses a prefab name with invalid characters', async () => {
    const { fs, user } = await openAtMainScene()

    await user.dblClick(screen.getByRole('button', { name: '▣ crate' }))
    await user.keyboard('bad name{Enter}')

    expect(alertStub).toHaveBeenCalledWith(
      'Prefab names must start with a letter or number and use only letters, numbers, dashes, or underscores.',
    )
    expect(await fs.readText('src/objects/crate.object.json')).not.toBeNull()
  })

})

describe('Editor characterization: UI pieces', () => {
  it('creates a UI piece and saves its edits', async () => {
    const { fs, user, unmount } = await openAtMainScene()

    await user.click(screen.getByRole('button', { description: 'New UI piece' }))
    expect(screen.getByRole('button', { name: /ui-1$/ })).toBeDefined()
    const source = screen.getByRole('textbox', { name: 'code source' })
    await user.clear(source)
    await user.type(source, '<b>hi</b>')
    unmount()

    await vi.waitFor(async () => expect(await fs.readText('src/ui/ui-1.html')).toBe('<b>hi</b>'))
  })

})

describe('Editor characterization: views, play and exit', () => {
  it('opens the project settings views with the file they save to', async () => {
    const { user } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: /controls$/ }))
    expect(await screen.findByText('saved to src/controls.json')).toBeDefined()
    await user.click(screen.getByRole('button', { name: /stats$/ }))
    expect(await screen.findByText('saved to src/stats.json')).toBeDefined()
    await user.click(screen.getByRole('button', { name: /game$/ }))
    expect(await screen.findByText('saved to src/game.json')).toBeDefined()

    await user.click(screen.getByRole('button', { name: /← .*main/ }))
    expect(screen.getByRole('region', { name: 'viewport' })).toBeDefined()
  })

  it('plays the open scene and stops back to edit mode', async () => {
    const { user } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: '▶ Play' }))
    expect(await screen.findByText('viewport mode: play')).toBeDefined()
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', true)

    await user.click(screen.getByRole('button', { name: '⏹ Stop' }))
    expect(screen.getByText('viewport mode: edit')).toBeDefined()
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', false)
  })

  it('goes back to the projects list', async () => {
    const { user, onClose } = await openAtMainScene()

    await user.click(screen.getByRole('button', { name: '← projects' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

})

describe('Editor characterization: failures', () => {
  it('shows an unknown archetype as an alert with a way back', async () => {
    const fs = project({
      'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'no-such-archetype' }),
    })
    const { user, onClose } = openEditor(fs)

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.getByRole('alert').textContent).toMatch(/no-such-archetype/)
    await user.click(screen.getByRole('button', { name: '← projects' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

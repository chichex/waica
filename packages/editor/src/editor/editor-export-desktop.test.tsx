// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { installEditorGlobals, openEditor, project } from './test-editor-harness'

vi.mock('./Viewport', async () => (await import('./test-editor-stubs')).viewportStubModule())
vi.mock('@monaco-editor/react', async () => (await import('./test-editor-stubs')).monacoStubModule())
vi.mock('./play-runner', async () => (await import('./test-editor-stubs')).playRunnerStubModule())

installEditorGlobals()

const STEAM_GAME = JSON.stringify({
  waicaGame: 1,
  archetype: 'platformer',
  resolution: { mode: 'fill', width: 640, height: 360 },
  pixelsPerUnit: 16,
  desktop: { steam: { appId: 480, achievements: [], stats: [] } },
})

describe('the Export desktop button (issue 200 CA-23)', () => {
  it('sits right after the scene picker and opens the export modal', async () => {
    const { user } = openEditor(project())
    const picker = await screen.findByRole('combobox', { name: 'Scene to play' })
    const button = screen.getByRole('button', { name: 'Export desktop' })
    expect(picker.nextElementSibling).toBe(button)
    expect(screen.queryByRole('dialog', { name: 'Export desktop' })).toBeNull()
    await user.click(button)
    expect(screen.getByRole('dialog', { name: 'Export desktop' })).toBeDefined()
  })
})

describe('the export modal in the editor (issue 200 CA-24, CA-25)', () => {
  it("offers Steam with game.json's app id, and writes nothing", async () => {
    const fs = project({ 'src/game.json': STEAM_GAME })
    const { user } = openEditor(fs)
    await user.click(await screen.findByRole('button', { name: 'Export desktop' }))
    const dialog = screen.getByRole('dialog', { name: 'Export desktop' })
    await vi.waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Include Steamworks (app 480)' })).toBeDefined())
    await user.click(within(dialog).getByRole('checkbox', { name: 'Include Steamworks (app 480)' }))
    expect(within(dialog).getByRole('textbox')).toHaveProperty('value', 'npx @waica/cli export desktop . --no-steam')
    expect(await fs.readText('src/game.json')).toBe(STEAM_GAME)
  })

  it('closes on Escape and gives the focus back to the toolbar button', async () => {
    const { user } = openEditor(project())
    const button = await screen.findByRole('button', { name: 'Export desktop' })
    await user.click(button)
    await user.click(screen.getByRole('checkbox', { name: 'macOS' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Export desktop' })).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})

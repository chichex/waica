// @vitest-environment happy-dom
import { fireEvent, screen, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MemFS } from '../fs/project-fs'
import { installEditorGlobals, openAtMainScene, project } from './test-editor-harness'

vi.mock('./Viewport', async () => (await import('./test-editor-stubs')).viewportStubModule())
vi.mock('@monaco-editor/react', async () => (await import('./test-editor-stubs')).monacoStubModule())
vi.mock('./play-runner', async () => (await import('./test-editor-stubs')).playRunnerStubModule())

installEditorGlobals()

/** game.json as the editor reads it on open: one key (`title`) it knows nothing about, no desktop block. */
const OPENED = {
  waicaGame: 1,
  title: 'Hero Quest',
  archetype: 'platformer',
  resolution: { mode: 'fill', width: 640, height: 360 },
  pixelsPerUnit: 16,
}
const DESKTOP = { fullscreen: true, steam: { appId: 480, achievements: ['first-kill'], stats: ['kills'] } }

/** What configure_desktop does while the editor is open: it adds a desktop block to game.json as it is now. */
async function configureDesktopMeanwhile(fs: MemFS): Promise<void> {
  const current = JSON.parse((await fs.readText('src/game.json')) ?? '{}') as Record<string, unknown>
  await fs.writeText('src/game.json', `${JSON.stringify({ ...current, desktop: DESKTOP }, null, 2)}\n`)
}

async function setArtScale(user: ReturnType<typeof userEvent.setup>, value: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: /game$/ }))
  fireEvent.change(await screen.findByRole('spinbutton', { name: 'pixels per unit' }), { target: { value } })
}

async function savedGame(fs: MemFS): Promise<unknown> {
  return JSON.parse((await fs.readText('src/game.json')) ?? 'null')
}

/**
 * Review of PRs 217 and 218: the editor is not the only writer of
 * src/game.json. Saving its game settings rewrites only what it edits, over
 * the file as it is at that moment, so a desktop block configure_desktop
 * wrote after the editor opened, and any key the editor does not know, live on.
 */
describe("the editor's game.json saves keep what it does not edit", () => {
  it('keeps a desktop block written after the project opened, and unknown keys', async () => {
    const { fs, user } = await openAtMainScene(project({ 'src/game.json': JSON.stringify(OPENED) }))
    await configureDesktopMeanwhile(fs)
    await setArtScale(user, '32')
    await vi.waitFor(async () => expect(await savedGame(fs)).toEqual({ ...OPENED, pixelsPerUnit: 32, desktop: DESKTOP }))
  })

  it('keeps them through undo', async () => {
    const { fs, user } = await openAtMainScene(project({ 'src/game.json': JSON.stringify(OPENED) }))
    await setArtScale(user, '32')
    await vi.waitFor(async () => expect(await savedGame(fs)).toMatchObject({ pixelsPerUnit: 32 }))
    await configureDesktopMeanwhile(fs)
    expect(await savedGame(fs)).toMatchObject({ pixelsPerUnit: 32, desktop: DESKTOP })
    await user.click(document.body)
    await user.keyboard('{Control>}z{/Control}')
    await vi.waitFor(async () => expect(await savedGame(fs)).toEqual({ ...OPENED, desktop: DESKTOP }))
  })
})

describe('the export modal reads Steam from disk when it opens (review of PR 218)', () => {
  it('offers the Steam toggle for a desktop.steam written after the project opened', async () => {
    const { fs, user } = await openAtMainScene(project({ 'src/game.json': JSON.stringify(OPENED) }))
    await configureDesktopMeanwhile(fs)
    await user.click(screen.getByRole('button', { name: 'Export desktop' }))
    const dialog = screen.getByRole('dialog', { name: 'Export desktop' })
    expect(await within(dialog).findByRole('checkbox', { name: 'Include Steamworks (app 480)' })).toBeDefined()
  })
})

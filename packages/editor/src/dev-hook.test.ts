// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Game } from '@waica/engine'
import type { ProjectFS } from './fs/project-fs'
import { installEditorDevHook, registerViewportGame, type EditorDevHook } from './dev-hook'

afterEach(() => {
  Reflect.deleteProperty(window, '__waicaEditor')
})

/** The installed hook, read back off the window. */
function hook(): EditorDevHook {
  const installed = window.__waicaEditor
  if (!installed) throw new Error('no __waicaEditor on the window')
  return installed
}

describe('the editor DEV hook (issue #173 inference 19)', () => {
  it('opens an in-memory project of text and base64 files, and reads its files back', async () => {
    const open = vi.fn<(fs: ProjectFS) => void>()
    const uninstall = installEditorDevHook(open)

    await hook().openMemoryProject('smoke', { 'src/game.json': '{"waicaGame":1}', 'src/art/a.glb': { base64: btoa('glTF') } })

    expect(open).toHaveBeenCalledTimes(1)
    const fs = open.mock.calls[0]?.[0]
    expect(fs?.name).toBe('smoke')
    expect(fs?.kind).toBe('memory')
    expect(await fs?.readText('src/game.json')).toBe('{"waicaGame":1}')
    expect(new TextDecoder().decode((await fs?.readFile('src/art/a.glb')) ?? new Uint8Array())).toBe('glTF')
    await fs?.writeText('src/scenes/main.scene.json', '{}')
    expect(await hook().readText('src/scenes/main.scene.json')).toBe('{}')

    uninstall()
    expect(Reflect.get(window, '__waicaEditor')).toBeUndefined()
  })

  it('answers the live viewport Game while one is registered', () => {
    installEditorDevHook(() => {})
    expect(hook().viewportGame()).toBeNull()
    const game = {} as Game
    const unregister = registerViewportGame(() => game)
    expect(hook().viewportGame()).toBe(game)
    unregister()
    expect(hook().viewportGame()).toBeNull()
  })
})

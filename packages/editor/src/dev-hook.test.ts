// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Game } from '@waica/engine'
import type { ProjectFS } from './fs/project-fs'
import { installEditorDevHook, registerViewportGame, useDevViewportGame, useEditorDevHook, type EditorDevHook } from './dev-hook'

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

describe('the editor DEV hook as React hooks under StrictMode', () => {
  it('useEditorDevHook installs the hook, opens projects through the latest open, and removes it on unmount', async () => {
    const first = vi.fn<(fs: ProjectFS) => void>()
    const second = vi.fn<(fs: ProjectFS) => void>()
    const { rerender, unmount } = renderHook(({ open }) => useEditorDevHook(open), { reactStrictMode: true, initialProps: { open: first } })
    expect(Reflect.get(window, '__waicaEditor')).toBeDefined()

    rerender({ open: second })
    await hook().openMemoryProject('later', { 'src/game.json': '{}' })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(second.mock.calls[0]?.[0].name).toBe('later')

    unmount()
    expect(Reflect.get(window, '__waicaEditor')).toBeUndefined()
  })

  it('useDevViewportGame answers the Game while mounted and forgets it on unmount', () => {
    const game = {} as Game
    const { unmount } = renderHook(() => {
      useEditorDevHook(() => {})
      useDevViewportGame(() => game)
    }, { reactStrictMode: true })
    expect(hook().viewportGame()).toBe(game)

    const hookBeforeUnmount = hook()
    unmount()
    expect(hookBeforeUnmount.viewportGame()).toBeNull()
  })
})

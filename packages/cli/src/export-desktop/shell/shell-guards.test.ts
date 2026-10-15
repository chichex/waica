// What a shipped game's window refuses (issue #200, review of PRs #215 and
// #216): Electron's default macOS menu, leaving app://game/, opening windows,
// IPC from any other page, a size past the screen, and a window gone mid-change.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupShellDirs, gameEvent, KEY, listener, started } from './test-shell.js'

afterEach(async () => {
  vi.useRealTimers()
  await cleanupShellDirs()
})

describe('the macOS menu (review of #215)', () => {
  it('is only the app and window menus: no View menu, so no Reload, DevTools or zoom', async () => {
    const { calls, window } = await started({ platform: 'darwin' })
    expect(window.menuRemoved).toBe(false)
    expect(calls).toContainEqual(['Menu.setApplicationMenu', { template: [{ role: 'appMenu' }, { role: 'windowMenu' }] }])
  })

  it('is removed with the window menu bar on Linux and Windows', async () => {
    for (const platform of ['linux', 'win32'] as const) {
      const { calls, window } = await started({ platform })
      expect(window.menuRemoved).toBe(true)
      expect(calls.filter(([call]) => call === 'Menu.setApplicationMenu')).toEqual([])
    }
  })
})

/** Navigates the window to `url` as a link would, returning whether the shell stopped it. */
function navigate(window: Awaited<ReturnType<typeof started>>['window'], url: string): boolean {
  let prevented = false
  listener(window.listeners, 'webContents:will-navigate')({ url, preventDefault: () => (prevented = true) }, KEY)
  return prevented
}

describe('navigation away from the game (review of #215)', () => {
  it('stays on app://game/ and opens a web link in the browser instead', async () => {
    const { calls, window } = await started()
    expect(navigate(window, 'app://game/index.html#menu')).toBe(false)
    expect(navigate(window, 'https://store.steampowered.com/app/480')).toBe(true)
    expect(navigate(window, 'file:///etc/passwd')).toBe(true)
    expect(calls.filter(([call]) => call === 'shell.openExternal')).toEqual([['shell.openExternal', 'https://store.steampowered.com/app/480']])
  })

  it('opens no second window: window.open and target=_blank go to the browser, for web links only', async () => {
    const { calls, window } = await started()
    const open = window.openHandler
    expect(open?.({ url: 'https://example.com/wishlist' })).toEqual({ action: 'deny' })
    expect(open?.({ url: 'app://game/other.html' })).toEqual({ action: 'deny' })
    expect(calls.filter(([call]) => call === 'shell.openExternal')).toEqual([['shell.openExternal', 'https://example.com/wishlist']])
  })
})

describe('IPC from a page that is not the game (review of #215)', () => {
  it('quits, reads and sets nothing for a frame outside app://game/', async () => {
    const { ipc, calls, window } = await started()
    const foreign = { returnValue: undefined as unknown, senderFrame: { url: 'https://evil.example/' } }
    listener(ipc, 'on:waica:quit')(foreign)
    expect(calls).not.toContainEqual(['app.quit'])
    await listener(ipc, 'handle:waica:set-fullscreen')(foreign, true)
    expect(window.fullscreen).toBe(false)
    window.fullscreen = true
    listener(ipc, 'on:waica:is-fullscreen')(foreign)
    expect(foreign.returnValue).toBe(false)
    listener(ipc, 'on:waica:quit')({ returnValue: undefined, senderFrame: null })
    expect(calls).not.toContainEqual(['app.quit'])
  })
})

describe('the window size on a small screen (review of #215)', () => {
  it("fits resolution × scale inside the screen's work area, keeping the aspect", async () => {
    const config = { name: 'Big', desktop: { fullscreen: false, scale: 2 }, resolution: { width: 1920, height: 1080 }, steam: null }
    const { window } = await started({ config, screen: { workAreaSize: { width: 1920, height: 1040 } } })
    expect(window.options).toMatchObject({ width: 1664, height: 936 })
  })
})

describe('a window destroyed while fullscreen settles (review of #215 and #216)', () => {
  it('resolves set-fullscreen without touching the destroyed window', async () => {
    const { ipc, window } = await started()
    vi.useFakeTimers()
    window.setFullScreen = () => {}
    const settling = listener(ipc, 'handle:waica:set-fullscreen')(gameEvent(), true)
    window.destroyed = true
    await vi.advanceTimersByTimeAsync(100)
    await expect(settling).resolves.toBeUndefined()
  })

  it('reads a destroyed window as not fullscreen', async () => {
    const { ipc, window } = await started()
    window.destroyed = true
    const event = gameEvent()
    listener(ipc, 'on:waica:is-fullscreen')(event)
    expect(event.returnValue).toBe(false)
  })
})

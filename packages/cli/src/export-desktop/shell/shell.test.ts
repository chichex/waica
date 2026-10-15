import path from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { startShell } from './shell.js'
import { appDir, cleanupShellDirs, fakeElectron, KEY, listener, started } from './test-shell.js'

afterEach(cleanupShellDirs)

describe('the shell main process (issue #200 CA-9, CA-10)', () => {
  it('registers app:// as privileged before the app is ready, then serves dist/ through it', async () => {
    const fake = fakeElectron()
    const dir = await appDir()
    const running = startShell(fake.electron, { appDir: dir, platform: 'linux', loadSteamworks: () => ({}), warn: () => {} })
    expect(fake.calls).toEqual([
      ['registerSchemesAsPrivileged', [{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]],
    ])
    fake.ready()
    await running
    const handler = fake.protocolHandlers.get('app')
    const index = await handler?.(new Request('app://game/'))
    expect(index?.status).toBe(200)
    expect(index?.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await index?.text()).toContain('<title>made with Waica</title>')
    const params = await handler?.(new Request('app://game/waica.params.json'))
    expect(await params?.json()).toEqual({ Player: {} })
    expect((await handler?.(new Request('app://game/%2e%2e/waica-desktop.json')))?.status).toBe(404)
  })

  it('opens one window with the computed options on app://game/', async () => {
    const { window, dir } = await started()
    expect(window.options).toMatchObject({ width: 1280, height: 720, title: 'Hero Quest', webPreferences: { preload: path.join(dir, 'preload.js') } })
    expect(window.loaded).toEqual(['app://game/'])
  })

})

describe('the shell window (issue #200 CA-10)', () => {
  it('removes the menu bar on Linux and Windows, and keeps the macOS menu (Cmd+Q)', async () => {
    expect((await started({ platform: 'linux' })).window.menuRemoved).toBe(true)
    expect((await started({ platform: 'win32' })).window.menuRemoved).toBe(true)
    expect((await started({ platform: 'darwin' })).window.menuRemoved).toBe(false)
  })

  it("keeps the game's name as the window title", async () => {
    const { window } = await started()
    let prevented = false
    listener(window.listeners, 'page-title-updated')({ preventDefault: () => (prevented = true) }, KEY)
    expect(prevented).toBe(true)
  })

  it('toggles fullscreen on F11 and Alt+Enter, and lets other keys through', async () => {
    const { window } = await started()
    const onInput = listener(window.listeners, 'webContents:before-input-event')
    const press = (input: Partial<typeof KEY>) => {
      let prevented = false
      onInput({ preventDefault: () => (prevented = true) }, { ...KEY, ...input })
      return prevented
    }
    expect(press({ key: 'F11' })).toBe(true)
    expect(window.fullscreen).toBe(true)
    expect(press({ key: 'Enter', alt: true })).toBe(true)
    expect(window.fullscreen).toBe(false)
    expect(press({ key: 'a' })).toBe(false)
    expect(window.fullscreen).toBe(false)
  })

})

describe('the shell IPC (issue #200 CA-2, CA-3)', () => {
  it('answers the preload: quit, set and read fullscreen', async () => {
    const { ipc, calls, window } = await started()
    listener(ipc, 'on:waica:quit')({})
    expect(calls).toContainEqual(['app.quit'])
    await listener(ipc, 'handle:waica:set-fullscreen')({}, true)
    expect(window.fullscreen).toBe(true)
    const event: { returnValue?: unknown } = {}
    listener(ipc, 'on:waica:is-fullscreen')(event)
    expect(event.returnValue).toBe(true)
  })

  it('quits when the window closes, on every platform', async () => {
    const { ipc, calls } = await started({ platform: 'darwin' })
    listener(ipc, 'app:window-all-closed')()
    expect(calls).toContainEqual(['app.quit'])
  })
})

describe('the staged shell modules (issue #200 CA-8)', () => {
  it('import only each other, node: builtins and electron, since nothing else is staged beside them', async () => {
    const dir = import.meta.dirname
    // Test support (test-*.ts) is excluded from the build, so it is never staged either.
    const sources = (await readdir(dir)).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('test-'))
    expect(sources).toContain('main.ts')
    for (const file of sources) {
      const source = await readFile(path.join(dir, file), 'utf8')
      for (const [, specifier] of source.matchAll(/^import (?!type )[^'"]*['"]([^'"]+)['"]/gm)) {
        const allowed = specifier === 'electron' || specifier?.startsWith('node:') || /^\.\/[a-z-]+\.js$/.test(specifier ?? '')
        expect(allowed, `${file} imports ${specifier ?? ''}`).toBe(true)
      }
    }
  })
})

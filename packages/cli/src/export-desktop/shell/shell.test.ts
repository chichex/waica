import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import type { DesktopShellConfig } from '../desktop-config.js'
import { writeTree } from '../test-export.js'
import { startShell, type PreventableEvent, type ShellElectron, type ShellWindow } from './shell.js'
import type { ShortcutInput } from './window-options.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const CONFIG: DesktopShellConfig = {
  name: 'Hero Quest',
  desktop: { fullscreen: false, scale: 2 },
  resolution: { width: 640, height: 360 },
  steam: null,
}

async function appDir(config: DesktopShellConfig = CONFIG): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'waica-shell-'))
  roots.push(root)
  await writeTree(root, {
    'waica-desktop.json': JSON.stringify(config),
    'dist/index.html': '<!doctype html><title>made with Waica</title>',
    'dist/waica.params.json': '{"Player":{}}',
  })
  return root
}

type Listener = (...args: unknown[]) => unknown
type WindowListener = (event: PreventableEvent, input: ShortcutInput) => void

class FakeWindow implements ShellWindow {
  static created: FakeWindow[] = []
  fullscreen = false
  menuRemoved = false
  loaded: string[] = []
  readonly listeners = new Map<string, WindowListener>()
  readonly webContents = {
    on: (event: string, listener: WindowListener) => {
      this.listeners.set(`webContents:${event}`, listener)
    },
  }
  constructor(readonly options: Record<string, unknown>) {
    FakeWindow.created.push(this)
  }
  loadURL(url: string): Promise<void> {
    this.loaded.push(url)
    return Promise.resolve()
  }
  setFullScreen(on: boolean): void {
    this.fullscreen = on
  }
  isFullScreen(): boolean {
    return this.fullscreen
  }
  removeMenu(): void {
    this.menuRemoved = true
  }
  on(event: string, listener: WindowListener): void {
    this.listeners.set(event, listener)
  }
}

function fakeElectron() {
  const calls: unknown[][] = []
  const ipc = new Map<string, Listener>()
  let ready: () => void = () => {}
  const whenReady = new Promise<void>((resolve) => {
    ready = resolve
  })
  const protocolHandlers = new Map<string, (request: Request) => Promise<Response>>()
  FakeWindow.created = []
  const electron: ShellElectron = {
    app: {
      whenReady: () => whenReady,
      quit: () => calls.push(['app.quit']),
      on: (event, listener) => ipc.set(`app:${event}`, listener),
    },
    protocol: {
      registerSchemesAsPrivileged: (schemes) => calls.push(['registerSchemesAsPrivileged', schemes]),
      handle: (scheme, handler) => protocolHandlers.set(scheme, handler),
    },
    ipcMain: {
      on: (channel, listener) => ipc.set(`on:${channel}`, listener as Listener),
      handle: (channel, listener) => ipc.set(`handle:${channel}`, listener),
    },
    BrowserWindow: FakeWindow,
  }
  return { electron, calls, ipc, protocolHandlers, ready: () => ready() }
}

async function started(platform: NodeJS.Platform = 'linux', config: DesktopShellConfig = CONFIG) {
  const fake = fakeElectron()
  const dir = await appDir(config)
  const running = startShell(fake.electron, { appDir: dir, platform })
  fake.ready()
  await running
  const window = FakeWindow.created[0]
  if (!window) throw new Error('the shell opened no window')
  return { ...fake, dir, window }
}

function listener<L>(map: Map<string, L>, key: string): L {
  const found = map.get(key)
  if (!found) throw new Error(`nothing listens on ${key}`)
  return found
}

const KEY: ShortcutInput = { type: 'keyDown', key: '', alt: false, control: false, shift: false, meta: false, isAutoRepeat: false }

describe('the shell main process (issue #200 CA-9, CA-10)', () => {
  it('registers app:// as privileged before the app is ready, then serves dist/ through it', async () => {
    const fake = fakeElectron()
    const dir = await appDir()
    const running = startShell(fake.electron, { appDir: dir, platform: 'linux' })
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
    expect((await started('linux')).window.menuRemoved).toBe(true)
    expect((await started('win32')).window.menuRemoved).toBe(true)
    expect((await started('darwin')).window.menuRemoved).toBe(false)
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
    const press = (input: Partial<ShortcutInput>) => {
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
    const { ipc, calls } = await started('darwin')
    listener(ipc, 'app:window-all-closed')()
    expect(calls).toContainEqual(['app.quit'])
  })
})

describe('the staged shell modules (issue #200 CA-8)', () => {
  it('import only each other, node: builtins and electron, since nothing else is staged beside them', async () => {
    const dir = import.meta.dirname
    const sources = (await readdir(dir)).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
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

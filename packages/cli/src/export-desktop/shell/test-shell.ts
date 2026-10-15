// Test support for the shell's main process, excluded from builds and never
// staged: a fake Electron (app, protocol, ipcMain, BrowserWindow), a staged
// app directory, and the renderer side of IPC wired to the fake main process.
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { DesktopShellConfig } from '../desktop-config.js'
import { writeTree } from '../test-export.js'
import type { BridgeIpc } from './desktop-bridge.js'
import { startShell, type PreventableEvent, type ShellElectron, type ShellHost, type ShellWindow } from './shell.js'
import type { ShortcutInput } from './window-options.js'

const roots: string[] = []

export async function cleanupShellDirs(): Promise<void> {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
}

export const CONFIG: DesktopShellConfig = {
  name: 'Hero Quest',
  desktop: { fullscreen: false, scale: 2 },
  resolution: { width: 640, height: 360 },
  steam: null,
}

/** A staged resources/app: waica-desktop.json and a tiny dist/. */
export async function appDir(config: DesktopShellConfig = CONFIG): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'waica-shell-'))
  roots.push(root)
  await writeTree(root, {
    'waica-desktop.json': JSON.stringify(config),
    'dist/index.html': '<!doctype html><title>made with Waica</title>',
    'dist/waica.params.json': '{"Player":{}}',
  })
  return root
}

export type Listener = (...args: unknown[]) => unknown
type WindowListener = (event: PreventableEvent, input: ShortcutInput) => void

export class FakeWindow implements ShellWindow {
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

export function fakeElectron() {
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

export function listener<L>(map: Map<string, L>, key: string): L {
  const found = map.get(key)
  if (!found) throw new Error(`nothing listens on ${key}`)
  return found
}

/** The renderer's ipcRenderer, answered by whatever the fake main process registered. */
export function rendererIpc(ipc: Map<string, Listener>): BridgeIpc {
  return {
    send: (channel, ...args) => {
      listener(ipc, `on:${channel}`)({ returnValue: undefined }, ...args)
    },
    sendSync: (channel, ...args) => {
      const event: { returnValue?: unknown } = {}
      listener(ipc, `on:${channel}`)(event, ...args)
      return event.returnValue
    },
    invoke: (channel, ...args) => Promise.resolve(listener(ipc, `handle:${channel}`)({}, ...args)),
  }
}

export interface StartOptions {
  platform?: NodeJS.Platform
  config?: DesktopShellConfig
  loadSteamworks?: ShellHost['loadSteamworks']
}

/** A started shell over the fake Electron: its window, IPC and warnings. */
export async function started(options: StartOptions = {}) {
  const fake = fakeElectron()
  const dir = await appDir(options.config)
  const warnings: string[] = []
  const running = startShell(fake.electron, {
    appDir: dir,
    platform: options.platform ?? 'linux',
    loadSteamworks: options.loadSteamworks ?? (() => ({})),
    warn: (line) => warnings.push(line),
  })
  fake.ready()
  await running
  const window = FakeWindow.created[0]
  if (!window) throw new Error('the shell opened no window')
  return { ...fake, dir, window, warnings }
}

export const KEY: ShortcutInput = { type: 'keyDown', key: '', alt: false, control: false, shift: false, meta: false, isAutoRepeat: false }

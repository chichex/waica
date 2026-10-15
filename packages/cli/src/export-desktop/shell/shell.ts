// The Electron main process of an exported game (ADR 0032), written against
// the slice of Electron it uses so tests drive it with a fake. main.ts hands
// it the real modules. Staged beside main.js in resources/app, it may import
// only its sibling shell modules, node: builtins and electron.
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { DesktopShellConfig, SteamSettings } from '../desktop-config.js'
import { APP_ORIGIN, APP_SCHEME, APP_SCHEME_PRIVILEGES, resolveAppRequest } from './app-protocol.js'
import { startSteam, type SteamBridge } from './steam.js'
import { keepOnGame, sentByGame, setGameMenu, type GuardedContents, type IpcEvent, type ShellMenu } from './window-guards.js'
import { fullscreenShortcut, windowOptions, type ShortcutInput, type WorkArea } from './window-options.js'

export interface PreventableEvent {
  preventDefault(): void
}

/** The slice of Electron's BrowserWindow the shell uses. */
export interface ShellWindow {
  loadURL(url: string): Promise<void>
  setFullScreen(on: boolean): void
  isFullScreen(): boolean
  /** True once the window closed: every other method throws then. */
  isDestroyed(): boolean
  removeMenu(): void
  on(event: 'page-title-updated', listener: (event: PreventableEvent) => void): unknown
  webContents: GuardedContents & {
    on(event: 'before-input-event', listener: (event: PreventableEvent, input: ShortcutInput) => void): unknown
  }
}

/** The slice of Electron's main-process modules the shell uses. */
export interface ShellElectron {
  app: {
    whenReady(): Promise<unknown>
    quit(): void
    on(event: 'window-all-closed', listener: () => void): unknown
  }
  protocol: {
    registerSchemesAsPrivileged(schemes: { scheme: string; privileges: typeof APP_SCHEME_PRIVILEGES }[]): void
    handle(scheme: string, handler: (request: Request) => Promise<Response>): void
  }
  ipcMain: {
    on(channel: string, listener: (event: IpcEvent & { returnValue: unknown }, ...args: unknown[]) => void): unknown
    handle(channel: string, listener: (event: IpcEvent, ...args: unknown[]) => Promise<unknown>): void
  }
  BrowserWindow: new (options: ReturnType<typeof windowOptions>) => ShellWindow
  Menu: ShellMenu
  screen: { getPrimaryDisplay(): { workAreaSize: WorkArea } }
  shell: { openExternal(url: string): Promise<void> }
}

export interface ShellHost {
  /** resources/app: dist/, preload.js and waica-desktop.json. */
  appDir: string
  platform: NodeJS.Platform
  /** Loads steamworks.js from resources/app/node_modules; only an export with Steam calls it. */
  loadSteamworks: () => unknown
  /** The main process's warnings (the terminal that launched the game). */
  warn: (line: string) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** waica-desktop.json was written by the export; a broken one stops the app with its name. */
function parseShellConfig(text: string, file: string): DesktopShellConfig {
  const parsed: unknown = JSON.parse(text)
  if (!isRecord(parsed) || typeof parsed['name'] !== 'string' || !isRecord(parsed['desktop'])) {
    throw new Error(`${file} is not a waica desktop config`)
  }
  const { fullscreen, scale } = parsed['desktop']
  const resolution = isRecord(parsed['resolution']) ? parsed['resolution'] : null
  return {
    name: parsed['name'],
    desktop: { fullscreen: fullscreen === true, scale: typeof scale === 'number' && scale > 0 ? scale : 1 },
    resolution:
      typeof resolution?.['width'] === 'number' && typeof resolution['height'] === 'number'
        ? { width: resolution['width'], height: resolution['height'] }
        : null,
    steam: parseSteam(parsed['steam']),
  }
}

function idList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

function parseSteam(value: unknown): SteamSettings | null {
  if (!isRecord(value) || typeof value['appId'] !== 'number') return null
  return { appId: value['appId'], achievements: idList(value['achievements']), stats: idList(value['stats']) }
}

async function serveApp(dist: string, request: Request): Promise<Response> {
  const resolved = resolveAppRequest(dist, request.url)
  if (resolved.status === 404) return new Response('not found', { status: 404 })
  return new Response(await readFile(resolved.file), { status: 200, headers: { 'content-type': resolved.mimeType } })
}

/** How long a fullscreen change may take: macOS animates it, over more than a second on a slow machine. */
const FULLSCREEN_SETTLE_MS = 5000

/**
 * Resolves once the window reached `on`, or after FULLSCREEN_SETTLE_MS if the
 * platform never says so, or as soon as the window is gone (a `quit()` right
 * after the request, or the player closing it mid-animation).
 */
function settleFullscreen(window: ShellWindow, on: boolean): Promise<void> {
  if (window.isDestroyed()) return Promise.resolve()
  window.setFullScreen(on)
  return new Promise((resolve) => {
    const started = Date.now()
    const poll = (): void => {
      if (window.isDestroyed() || window.isFullScreen() === on || Date.now() - started > FULLSCREEN_SETTLE_MS) resolve()
      else setTimeout(poll, 16)
    }
    poll()
  })
}

/**
 * The preload's achievements (CA-18): availability is read once,
 * synchronously, as the page loads. Only the game's own page reaches Steam.
 */
function wireSteam(electron: ShellElectron, steam: SteamBridge): void {
  electron.ipcMain.on('waica:steam-available', (event) => {
    event.returnValue = sentByGame(event) && steam.available
  })
  electron.ipcMain.on('waica:achievement-unlock', (event, id) => {
    if (sentByGame(event)) steam.unlock(id)
  })
  electron.ipcMain.on('waica:stat-set', (event, id, value) => {
    if (sentByGame(event)) steam.setStat(id, value)
  })
  electron.ipcMain.handle('waica:stat-get', (event, id) => Promise.resolve(sentByGame(event) ? steam.getStat(id) : undefined))
}

function wireWindow(electron: ShellElectron, window: ShellWindow, host: ShellHost): void {
  setGameMenu(electron.Menu, window, host.platform)
  keepOnGame(window.webContents, (url) => electron.shell.openExternal(url), host.warn)
  window.on('page-title-updated', (event) => event.preventDefault())
  window.webContents.on('before-input-event', (event, input) => {
    if (!fullscreenShortcut(input)) return
    event.preventDefault()
    window.setFullScreen(!window.isFullScreen())
  })
  electron.ipcMain.on('waica:quit', (event) => {
    if (sentByGame(event)) electron.app.quit()
  })
  electron.ipcMain.on('waica:is-fullscreen', (event) => {
    event.returnValue = sentByGame(event) && !window.isDestroyed() && window.isFullScreen()
  })
  electron.ipcMain.handle('waica:set-fullscreen', (event, on) =>
    sentByGame(event) ? settleFullscreen(window, on === true) : Promise.resolve(),
  )
}

/**
 * Registers app:// and connects Steam before Electron is ready (the overlay
 * adds command-line switches, which only count before then), then opens the
 * game's window on app://game/.
 */
export async function startShell(electron: ShellElectron, host: ShellHost): Promise<void> {
  electron.protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: APP_SCHEME_PRIVILEGES }])
  const configFile = path.join(host.appDir, 'waica-desktop.json')
  const config = parseShellConfig(readFileSync(configFile, 'utf8'), configFile)
  wireSteam(electron, startSteam(config.steam, host.loadSteamworks, host.warn))
  await electron.app.whenReady()
  const dist = path.join(host.appDir, 'dist')
  electron.protocol.handle(APP_SCHEME, (request) => serveApp(dist, request))
  electron.app.on('window-all-closed', () => electron.app.quit())
  const window = new electron.BrowserWindow(windowOptions(config, host.appDir, electron.screen.getPrimaryDisplay().workAreaSize))
  wireWindow(electron, window, host)
  await window.loadURL(`${APP_ORIGIN}/`)
}

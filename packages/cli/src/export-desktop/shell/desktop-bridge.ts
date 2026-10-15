// The preload side of the shell (ADR 0032). The sandboxed preload cannot
// import modules of its own, so preload.js is generated at export time from
// createDesktopApi's source: the function must stay self-contained, reading
// nothing outside its own body.

/** The slice of Electron's ipcRenderer the bridge uses. */
export interface BridgeIpc {
  send(channel: string, ...args: unknown[]): void
  sendSync(channel: string, ...args: unknown[]): unknown
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

/** The `window.waicaDesktop` object: the shape the engine's DesktopBridge expects. */
export interface DesktopApi {
  quit(): void
  setFullscreen(on: boolean): Promise<void>
  isFullscreen(): boolean
  achievements: {
    available: boolean
    unlock(id: string): void
    setStat(id: string, value: number): void
    getStat(id: string): Promise<number | undefined>
  }
}

/** Builds `window.waicaDesktop` over the renderer's IPC; every call reaches the main process. */
export function createDesktopApi(ipc: BridgeIpc): DesktopApi {
  return {
    quit: () => ipc.send('waica:quit'),
    setFullscreen: (on) => ipc.invoke('waica:set-fullscreen', on === true).then(() => undefined),
    isFullscreen: () => ipc.sendSync('waica:is-fullscreen') === true,
    achievements: {
      // Whether the main process reached Steam, asked once as the page loads.
      available: ipc.sendSync('waica:steam-available') === true,
      unlock: (id) => ipc.send('waica:achievement-unlock', String(id)),
      setStat: (id, value) => ipc.send('waica:stat-set', String(id), Number(value)),
      getStat: (id) => ipc.invoke('waica:stat-get', String(id)).then((value) => (typeof value === 'number' ? value : undefined)),
    },
  }
}

/** preload.js: exposes createDesktopApi(ipcRenderer) as `window.waicaDesktop` through contextBridge. */
export function preloadSource(): string {
  return [
    "'use strict'",
    "const { contextBridge, ipcRenderer } = require('electron')",
    `const createDesktopApi = ${createDesktopApi.toString()}`,
    "contextBridge.exposeInMainWorld('waicaDesktop', createDesktopApi(ipcRenderer))",
    '',
  ].join('\n')
}

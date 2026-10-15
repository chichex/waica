// What a shipped game's window refuses (issue #200; Electron's security
// checklist, items 13, 14 and 17): leaving app://game/, opening a second
// window, IPC from a page that is not the game, and on macOS Electron's
// default menu, whose View menu reloads the page, opens DevTools and zooms.
import { APP_ORIGIN } from './app-protocol.js'
import type { PreventableEvent } from './shell.js'

/** The part of an Electron IPC event the shell checks: the frame that sent it. */
export interface IpcEvent {
  readonly senderFrame?: { readonly url: string } | null
}

/** The slice of Electron's webContents the guards use. */
export interface GuardedContents {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void
  on(event: 'will-navigate', listener: (event: PreventableEvent & { url: string }) => void): unknown
}

/** The slice of Electron's Menu the shell uses. */
export interface ShellMenu {
  buildFromTemplate(template: { role: 'appMenu' | 'windowMenu' }[]): unknown
  setApplicationMenu(menu: unknown): void
}

/** macOS keeps the app menu (Cmd+Q, Cmd+H) and the window menu (Cmd+M), and nothing else. */
const MAC_GAME_MENU: { role: 'appMenu' | 'windowMenu' }[] = [{ role: 'appMenu' }, { role: 'windowMenu' }]

function isGameUrl(url: string): boolean {
  return url.startsWith(`${APP_ORIGIN}/`)
}

/** True only for a message from the game's own page on app://game/. */
export function sentByGame(event: IpcEvent): boolean {
  return typeof event.senderFrame?.url === 'string' && isGameUrl(event.senderFrame.url)
}

/**
 * A shipped game has no File/Edit/View menu (and Alt would toggle one on
 * Linux and Windows): the window drops its menu bar there, and macOS keeps
 * only its app and window menus.
 */
export function setGameMenu(menu: ShellMenu, window: { removeMenu(): void }, platform: NodeJS.Platform): void {
  if (platform === 'darwin') menu.setApplicationMenu(menu.buildFromTemplate(MAC_GAME_MENU))
  else window.removeMenu()
}

/**
 * Keeps the window on app://game/: a link elsewhere, `target="_blank"` and
 * `window.open` never load in the game's window (which has no way back) or in
 * a new one (which would get the preload's bridge). A web link opens in the
 * player's browser instead, like a "Wishlist on Steam" button expects.
 */
export function keepOnGame(
  contents: GuardedContents,
  openExternal: (url: string) => Promise<void>,
  warn: (line: string) => void,
): void {
  const openOutside = (url: string): void => {
    if (!/^https?:\/\//i.test(url)) return
    openExternal(url).catch((error: unknown) => {
      warn(`[waica] could not open ${url} in the browser (${error instanceof Error ? error.message : String(error)})`)
    })
  }
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event) => {
    if (isGameUrl(event.url)) return
    event.preventDefault()
    openOutside(event.url)
  })
}

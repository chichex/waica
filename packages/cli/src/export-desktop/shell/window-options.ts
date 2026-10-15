import path from 'node:path'
import type { DesktopShellConfig } from '../desktop-config.js'

/** The fields of Electron's `Input` (before-input-event) the shortcut reads. */
export interface ShortcutInput {
  type: string
  key: string
  alt: boolean
  control: boolean
  shift: boolean
  meta: boolean
  isAutoRepeat: boolean
}

/** The window size when game.json declares no resolution (issue #200 inference 5). */
const FALLBACK_SIZE = { width: 1280, height: 720 }

/** The usable part of a display (Electron's `workAreaSize`): the screen minus taskbars, docks and panels. */
export interface WorkArea {
  width: number
  height: number
}

/** A window takes at most this share of the work area, so its frame and title bar stay on screen too. */
const WORK_AREA_SHARE = 0.9

/** `size` scaled down, keeping its aspect, to fit WORK_AREA_SHARE of the work area; never scaled up. */
function fitWorkArea(size: WorkArea, workArea: WorkArea | undefined): WorkArea {
  if (!workArea) return size
  const factor = Math.min(1, (workArea.width * WORK_AREA_SHARE) / size.width, (workArea.height * WORK_AREA_SHARE) / size.height)
  return { width: Math.round(size.width * factor), height: Math.round(size.height * factor) }
}

/**
 * The BrowserWindow options for the game (CA-10): resolution × scale (inside
 * the screen's work area when it is given), resizable, and the page cut off
 * from Node.
 */
export function windowOptions(config: DesktopShellConfig, appDir: string, workArea?: WorkArea) {
  const { resolution, desktop } = config
  const size = resolution
    ? { width: Math.round(resolution.width * desktop.scale), height: Math.round(resolution.height * desktop.scale) }
    : FALLBACK_SIZE
  return {
    ...fitWorkArea(size, workArea),
    useContentSize: true,
    fullscreen: desktop.fullscreen,
    // macOS: Electron makes a window created with `fullscreen: false` non-fullscreenable unless this is set.
    fullscreenable: true,
    resizable: true,
    title: config.name,
    icon: path.join(appDir, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(appDir, 'preload.js'),
    },
  }
}

/** F11 and Alt+Enter toggle fullscreen (H-10): a key press, never its auto-repeat or release. */
export function fullscreenShortcut(input: ShortcutInput): boolean {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return false
  if (input.key === 'F11') return !input.alt && !input.control && !input.meta
  return input.key === 'Enter' && input.alt && !input.control && !input.meta && !input.shift
}

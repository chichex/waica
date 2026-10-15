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

/** The BrowserWindow options for the game (CA-10): resolution × scale, resizable, and the page cut off from Node. */
export function windowOptions(config: DesktopShellConfig, appDir: string) {
  const { resolution, desktop } = config
  const size = resolution
    ? { width: Math.round(resolution.width * desktop.scale), height: Math.round(resolution.height * desktop.scale) }
    : FALLBACK_SIZE
  return {
    ...size,
    useContentSize: true,
    fullscreen: desktop.fullscreen,
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

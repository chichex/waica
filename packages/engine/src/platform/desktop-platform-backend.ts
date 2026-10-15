import {
  NO_ACHIEVEMENTS,
  WebPlatformBackend,
  type DesktopBridge,
  type PlatformAchievements,
  type PlatformBackend,
} from './platform-backend.js'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAchievements(value: unknown): value is PlatformAchievements {
  return (
    isObject(value) &&
    typeof value['available'] === 'boolean' &&
    typeof value['unlock'] === 'function' &&
    typeof value['setStat'] === 'function' &&
    typeof value['getStat'] === 'function'
  )
}

/** `window.waicaDesktop` is page-reachable data: only the shape the shell exposes counts as the bridge. */
export function isDesktopBridge(value: unknown): value is DesktopBridge {
  return (
    isObject(value) &&
    typeof value['quit'] === 'function' &&
    typeof value['setFullscreen'] === 'function' &&
    typeof value['isFullscreen'] === 'function' &&
    (value['achievements'] === undefined || isAchievements(value['achievements']))
  )
}

/** The shell's achievements with `getStat` never rejecting: a stat the client cannot read is `undefined`. */
function forwardedAchievements(shell: PlatformAchievements): PlatformAchievements {
  return {
    available: true,
    unlock: (id) => shell.unlock(id),
    setStat: (id, value) => shell.setStat(id, value),
    getStat: (id) => shell.getStat(id).catch(() => undefined),
  }
}

/** The packaged desktop app as a platform: every call goes to the shell's main process. */
export class DesktopPlatformBackend implements PlatformBackend {
  readonly canQuit = true
  readonly achievements: PlatformAchievements

  constructor(private readonly bridge: DesktopBridge) {
    const shell = bridge.achievements
    this.achievements = shell?.available === true ? forwardedAchievements(shell) : NO_ACHIEVEMENTS
  }

  quit(): void {
    this.bridge.quit()
  }

  async setFullscreen(on: boolean): Promise<void> {
    try {
      await this.bridge.setFullscreen(on)
    } catch {
      // The window is gone or the shell refused: the state stays what isFullscreen() reports.
    }
  }

  isFullscreen(): boolean {
    return this.bridge.isFullscreen()
  }
}

/** The desktop backend inside the shell (`window.waicaDesktop` exists), the web one everywhere else. */
export function defaultPlatformBackend(): PlatformBackend {
  const candidate: unknown = Reflect.get(globalThis, 'waicaDesktop')
  return isDesktopBridge(candidate) ? new DesktopPlatformBackend(candidate) : new WebPlatformBackend()
}

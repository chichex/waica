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

const BRIDGE_METHODS = ['quit', 'setFullscreen', 'isFullscreen'] as const

/** The members a `window.waicaDesktop` lacks (or has with the wrong type) to be the shell's bridge. */
function bridgeGaps(value: unknown): string[] {
  if (!isObject(value)) return ['every member']
  const gaps: string[] = BRIDGE_METHODS.filter((name) => typeof value[name] !== 'function')
  if (value['achievements'] !== undefined && !isAchievements(value['achievements'])) gaps.push('achievements')
  return gaps
}

/** `window.waicaDesktop` is page-reachable data: only the shape the shell exposes counts as the bridge. */
export function isDesktopBridge(value: unknown): value is DesktopBridge {
  return bridgeGaps(value).length === 0
}

/** A throw from the bridge (say, the window closing after `quit()`) stays here instead of reaching the game's script. */
function callShell(call: () => void): void {
  try {
    call()
  } catch {
    // The shell is gone or refused: an achievement call is fire-and-forget.
  }
}

/**
 * The shell's achievements, held to the contract the engine documents: no
 * call throws, and `getStat` resolves a number or `undefined`, whatever the
 * bridge does.
 */
function forwardedAchievements(shell: PlatformAchievements): PlatformAchievements {
  return {
    available: true,
    unlock: (id) => callShell(() => shell.unlock(id)),
    setStat: (id, value) => callShell(() => shell.setStat(id, value)),
    getStat: async (id) => {
      try {
        const value: unknown = await shell.getStat(id)
        return typeof value === 'number' ? value : undefined
      } catch {
        return undefined
      }
    },
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
    try {
      return this.bridge.isFullscreen() === true
    } catch {
      // The window is gone: it is not fullscreen.
      return false
    }
  }
}

/**
 * The desktop backend inside the shell (`window.waicaDesktop` exists), the
 * web one everywhere else. A `window.waicaDesktop` of another shape (an
 * engine and a shell from versions that disagree) falls back to the web
 * backend and says what it lacks, so a missing Quit has a cause in the console.
 */
export function defaultPlatformBackend(): PlatformBackend {
  const candidate: unknown = Reflect.get(globalThis, 'waicaDesktop')
  if (isDesktopBridge(candidate)) return new DesktopPlatformBackend(candidate)
  if (candidate !== undefined) {
    console.warn(
      `[waica] window.waicaDesktop is not the desktop shell's bridge (${bridgeGaps(candidate).join(', ')} missing or wrong): the game runs without quit, native fullscreen or achievements`,
    )
  }
  return new WebPlatformBackend()
}

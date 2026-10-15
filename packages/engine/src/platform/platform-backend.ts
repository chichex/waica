/**
 * Store achievements and stats, whichever store the game ships on (issue #200).
 * Unavailable on the web and in a desktop build without a store client, where
 * every call is a no-op and `getStat` resolves `undefined`.
 */
export interface PlatformAchievements {
  /** True only while a store client is connected (the desktop shell with Steam). */
  readonly available: boolean
  /** Activates an achievement by its store id. */
  unlock(id: string): void
  /** Sets an integer stat by its store id and stores it. */
  setStat(id: string, value: number): void
  /** A stat's stored value; `undefined` where none can be read. */
  getStat(id: string): Promise<number | undefined>
}

/**
 * Everything Game needs from the host it runs in (ADR 0032): the browser, or
 * the desktop shell's preload bridge. The web implementation is the default;
 * the desktop one is picked when `window.waicaDesktop` exists; a project's
 * own tests replace either through `GameOptions.platform`.
 */
export interface PlatformBackend {
  /** Whether `quit()` can close the game: false where a page cannot close itself. */
  readonly canQuit: boolean
  /** Closes the game where `canQuit` is true; a no-op elsewhere. */
  quit(): void
  /** Enters or leaves fullscreen. Never rejects: a refused request leaves `isFullscreen()` as it was. */
  setFullscreen(on: boolean): Promise<void>
  /**
   * Whether the game is fullscreen now. In the desktop shell this is a
   * synchronous round trip to the main process, which blocks the page until
   * it answers: read it when a key is pressed or a menu opens, not every frame.
   */
  isFullscreen(): boolean
  readonly achievements: PlatformAchievements
}

/** Achievements where no store client is connected: unavailable, and every call a no-op. */
export const NO_ACHIEVEMENTS: PlatformAchievements = Object.freeze({
  available: false,
  unlock: () => {},
  setStat: () => {},
  getStat: () => Promise.resolve(undefined),
})

/**
 * What the desktop shell's preload exposes as `window.waicaDesktop` through
 * `contextBridge` (ADR 0032). `achievements` is absent or unavailable without
 * Steam.
 */
export interface DesktopBridge {
  quit(): void
  setFullscreen(on: boolean): Promise<void>
  isFullscreen(): boolean
  achievements?: PlatformAchievements
}

/**
 * The browser as a platform (ADR 0032): a page cannot close itself, fullscreen
 * is the Fullscreen API, and there is no store, so no achievements.
 */
export class WebPlatformBackend implements PlatformBackend {
  readonly canQuit = false
  readonly achievements: PlatformAchievements = NO_ACHIEVEMENTS

  /**
   * @param fullscreenTarget The element `setFullscreen(true)` asks to fill the
   * screen: the whole page by default. A host that shows the game inside a
   * larger page, like the editor's Viewport, passes the game's own surface.
   */
  constructor(private readonly fullscreenTarget: () => Element = () => document.documentElement) {}

  quit(): void {
    // A page cannot close its own tab; canQuit tells the game not to offer it.
  }

  async setFullscreen(on: boolean): Promise<void> {
    try {
      if (on) await this.fullscreenTarget().requestFullscreen()
      else await document.exitFullscreen()
    } catch {
      // Refused (no user gesture, an iframe without permission) or no Fullscreen API at all.
    }
  }

  isFullscreen(): boolean {
    // `undefined` where the page has no Fullscreen API: never fullscreen there.
    return Boolean(document.fullscreenElement)
  }
}

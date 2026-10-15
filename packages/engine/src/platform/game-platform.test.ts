// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Game, WebPlatformBackend, type GameOptions, type PlatformAchievements, type PlatformBackend } from '../index.js'
import { lastFakeRenderer, resetFakeRendering } from '../test-renderer.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(extra: Partial<GameOptions> = {}): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  return new Game({ canvas, ...extra })
}

/** A test double for the whole seam: every call is recorded, nothing reaches the browser. */
class FakePlatform implements PlatformBackend {
  readonly calls: unknown[][] = []
  readonly canQuit = true
  readonly achievements: PlatformAchievements = {
    available: true,
    unlock: (id) => {
      this.calls.push(['unlock', id])
    },
    setStat: (id, value) => {
      this.calls.push(['setStat', id, value])
    },
    getStat: (id) => {
      this.calls.push(['getStat', id])
      return Promise.resolve(7)
    },
  }
  quit(): void {
    this.calls.push(['quit'])
  }
  setFullscreen(on: boolean): Promise<void> {
    this.calls.push(['setFullscreen', on])
    return Promise.resolve()
  }
  isFullscreen(): boolean {
    this.calls.push(['isFullscreen'])
    return true
  }
}

/** What the desktop shell's preload exposes, with every function a spy. */
function stubDesktopBridge(steam: boolean) {
  const bridge = {
    quit: vi.fn(),
    setFullscreen: vi.fn(() => Promise.resolve()),
    isFullscreen: vi.fn(() => true),
    achievements: {
      available: steam,
      unlock: vi.fn(),
      setStat: vi.fn(),
      getStat: vi.fn(() => Promise.resolve(3)),
    },
  }
  vi.stubGlobal('waicaDesktop', bridge)
  return bridge
}

/** happy-dom has no Fullscreen API: install one whose element is set by a granted request. */
function stubFullscreenApi(request: () => Promise<void>) {
  let element: Element | null = null
  const requestFullscreen = vi.fn(async () => {
    await request()
    element = document.documentElement
  })
  const exitFullscreen = vi.fn(() => {
    element = null
    return Promise.resolve()
  })
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: requestFullscreen })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen })
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element })
  return { requestFullscreen, exitFullscreen }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetFakeRendering()
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
  Reflect.deleteProperty(document, 'exitFullscreen')
  Reflect.deleteProperty(document, 'fullscreenElement')
})

describe('the platform seam (issue #200 CA-1)', () => {
  it('is public: PlatformBackend and the web backend come from the package index', () => {
    expect(WebPlatformBackend).toBeTypeOf('function')
    expectTypeOf<GameOptions['platform']>().toEqualTypeOf<PlatformBackend | undefined>()
    expectTypeOf(new WebPlatformBackend()).toMatchTypeOf<PlatformBackend>()
  })

  it('defaults to the web backend when no desktop bridge exists', () => {
    const game = makeGame()
    expect(game.canQuit).toBe(false)
    expect(game.achievements.available).toBe(false)
  })

  it('defaults to the desktop backend when window.waicaDesktop exists', () => {
    const bridge = stubDesktopBridge(false)
    const game = makeGame()
    expect(game.canQuit).toBe(true)
    game.quit()
    expect(bridge.quit).toHaveBeenCalledTimes(1)
  })

  it('ignores a window.waicaDesktop that is not the bridge the shell exposes', () => {
    vi.stubGlobal('waicaDesktop', { quit: 'not a function' })
    expect(makeGame().canQuit).toBe(false)
  })

})

describe('GameOptions.platform (issue #200 CA-1)', () => {
  it('hands every call to a fake passed as GameOptions.platform', async () => {
    const platform = new FakePlatform()
    const game = makeGame({ platform })

    expect(game.canQuit).toBe(true)
    game.quit()
    await game.setFullscreen(true)
    expect(game.isFullscreen()).toBe(true)
    game.achievements.unlock('first-kill')
    game.achievements.setStat('kills', 3)
    await expect(game.achievements.getStat('kills')).resolves.toBe(7)
    expect(game.achievements.available).toBe(true)

    expect(platform.calls).toEqual([
      ['quit'],
      ['setFullscreen', true],
      ['isFullscreen'],
      ['unlock', 'first-kill'],
      ['setStat', 'kills', 3],
      ['getStat', 'kills'],
    ])
  })
})

describe('game.quit() and game.canQuit (issue #200 CA-2)', () => {
  it('on the web cannot quit, and quit() leaves the running loop alone without throwing', () => {
    const game = makeGame()
    game.start()
    expect(game.canQuit).toBe(false)
    expect(() => game.quit()).not.toThrow()
    return vi.waitFor(() => expect(lastFakeRenderer().loop).not.toBeNull())
  })

  it('on the desktop asks the shell to quit exactly once per call', () => {
    const bridge = stubDesktopBridge(false)
    const game = makeGame()
    expect(game.canQuit).toBe(true)
    game.quit()
    expect(bridge.quit).toHaveBeenCalledTimes(1)
    expect(bridge.quit).toHaveBeenCalledWith()
  })
})

describe('game.setFullscreen(on) and game.isFullscreen() on the web (issue #200 CA-3)', () => {
  it('on the web goes through the browser Fullscreen API', async () => {
    const api = stubFullscreenApi(() => Promise.resolve())
    const game = makeGame()
    expect(game.isFullscreen()).toBe(false)

    await game.setFullscreen(true)
    expect(api.requestFullscreen).toHaveBeenCalledTimes(1)
    expect(game.isFullscreen()).toBe(true)

    await game.setFullscreen(false)
    expect(api.exitFullscreen).toHaveBeenCalledTimes(1)
    expect(game.isFullscreen()).toBe(false)
  })

  it('on the web resolves without throwing when the browser refuses (no user gesture)', async () => {
    const api = stubFullscreenApi(() => Promise.reject(new TypeError('Permissions check failed')))
    const game = makeGame()
    await expect(game.setFullscreen(true)).resolves.toBeUndefined()
    expect(api.requestFullscreen).toHaveBeenCalledTimes(1)
    expect(game.isFullscreen()).toBe(false)
  })

  it('on the web resolves without throwing when the page has no Fullscreen API at all', async () => {
    const game = makeGame()
    await expect(game.setFullscreen(true)).resolves.toBeUndefined()
    expect(game.isFullscreen()).toBe(false)
  })

})

describe('game.setFullscreen(on) and game.isFullscreen() on the desktop (issue #200 CA-3)', () => {
  it('on the desktop goes to the shell for both calls', async () => {
    const bridge = stubDesktopBridge(false)
    const game = makeGame()
    await game.setFullscreen(true)
    expect(bridge.setFullscreen).toHaveBeenCalledWith(true)
    expect(game.isFullscreen()).toBe(true)
    expect(bridge.isFullscreen).toHaveBeenCalledTimes(1)
  })

  it('on the desktop resolves without throwing when the shell rejects', async () => {
    const bridge = stubDesktopBridge(false)
    bridge.setFullscreen.mockImplementation(() => Promise.reject(new Error('no window')))
    const game = makeGame()
    await expect(game.setFullscreen(true)).resolves.toBeUndefined()
  })
})

describe('game.achievements (issue #200 CA-4)', () => {
  it('on the web is unavailable and every call is a no-op', async () => {
    const game = makeGame()
    expect(game.achievements.available).toBe(false)
    expect(() => {
      game.achievements.unlock('first-kill')
      game.achievements.setStat('kills', 3)
    }).not.toThrow()
    await expect(game.achievements.getStat('kills')).resolves.toBeUndefined()
  })

  it('on the desktop without Steam is unavailable and forwards nothing', async () => {
    const bridge = stubDesktopBridge(false)
    const game = makeGame()
    expect(game.achievements.available).toBe(false)
    game.achievements.unlock('first-kill')
    game.achievements.setStat('kills', 3)
    await expect(game.achievements.getStat('kills')).resolves.toBeUndefined()
    expect(bridge.achievements.unlock).not.toHaveBeenCalled()
    expect(bridge.achievements.setStat).not.toHaveBeenCalled()
    expect(bridge.achievements.getStat).not.toHaveBeenCalled()
  })

  it('on the desktop with Steam is available and forwards each call to the shell', async () => {
    const bridge = stubDesktopBridge(true)
    const game = makeGame()
    expect(game.achievements.available).toBe(true)
    game.achievements.unlock('first-kill')
    game.achievements.setStat('kills', 3)
    await expect(game.achievements.getStat('kills')).resolves.toBe(3)
    expect(bridge.achievements.unlock).toHaveBeenCalledWith('first-kill')
    expect(bridge.achievements.setStat).toHaveBeenCalledWith('kills', 3)
    expect(bridge.achievements.getStat).toHaveBeenCalledWith('kills')
  })

  it('on the desktop resolves undefined when the shell cannot read a stat', async () => {
    const bridge = stubDesktopBridge(true)
    bridge.achievements.getStat.mockImplementation(() => Promise.reject(new Error('steam went away')))
    await expect(makeGame().achievements.getStat('kills')).resolves.toBeUndefined()
  })
})

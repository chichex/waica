// @vitest-environment happy-dom
// The platform seam's edges (issue #200, review of PR #214): a desktop bridge
// that throws or resolves junk never reaches the game's script, a malformed
// `window.waicaDesktop` says why it was ignored, and the web backend can
// fullscreen the game's own surface instead of the whole page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Game, WebPlatformBackend, type GameOptions, type PlatformAchievements, type PlatformBackend } from '../index.js'
import { resetFakeRendering } from '../test-renderer.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(extra: Partial<GameOptions> = {}): Game {
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  return new Game({ canvas, ...extra })
}

function failing(): never {
  throw new Error('Object has been destroyed')
}

/** A bridge whose achievements misbehave the way a broken or closing shell would. */
function stubJunkBridge() {
  const bridge = {
    quit: vi.fn(),
    setFullscreen: vi.fn(() => Promise.resolve()),
    isFullscreen: vi.fn(failing),
    achievements: {
      available: true,
      unlock: vi.fn(failing),
      setStat: vi.fn(failing),
      getStat: vi.fn((): unknown => Promise.resolve(null)),
    },
  }
  vi.stubGlobal('waicaDesktop', bridge)
  return bridge
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetFakeRendering()
})

describe('a desktop bridge that misbehaves never reaches the game (review of #214)', () => {
  it('reads isFullscreen() as false when the bridge throws', () => {
    stubJunkBridge()
    expect(makeGame().isFullscreen()).toBe(false)
  })

  it('keeps unlock and setStat from throwing into the game', () => {
    const bridge = stubJunkBridge()
    const game = makeGame()
    expect(() => game.achievements.unlock('first-kill')).not.toThrow()
    expect(() => game.achievements.setStat('kills', 3)).not.toThrow()
    expect(bridge.achievements.unlock).toHaveBeenCalledWith('first-kill')
  })

  it('resolves getStat undefined when the shell resolves something other than a number', async () => {
    stubJunkBridge()
    await expect(makeGame().achievements.getStat('kills')).resolves.toBeUndefined()
  })

  it('resolves getStat undefined when the shell throws instead of rejecting', async () => {
    const bridge = stubJunkBridge()
    bridge.achievements.getStat.mockImplementation(failing)
    await expect(makeGame().achievements.getStat('kills')).resolves.toBeUndefined()
  })
})

describe('a window.waicaDesktop of another shape (review of #214)', () => {
  it('warns which members are missing, then runs on the web platform', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('waicaDesktop', { quit: () => {}, isFullscreen: 'yes' })
    expect(makeGame().canQuit).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/waicaDesktop.*setFullscreen, isFullscreen/)
  })

  it('says nothing on a plain web page', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    makeGame()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('the web backend fullscreens the element it is given (review of #214)', () => {
  it('asks the given element, not the whole page', async () => {
    const surface = document.createElement('div')
    const requestFullscreen = vi.fn(() => Promise.resolve())
    Object.defineProperty(surface, 'requestFullscreen', { configurable: true, value: requestFullscreen })
    await new WebPlatformBackend(() => surface).setFullscreen(true)
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })
})

describe('game.achievements follows its backend (review of #214)', () => {
  it('reads the backend live, like canQuit', () => {
    const later: PlatformAchievements = { available: true, unlock: () => {}, setStat: () => {}, getStat: () => Promise.resolve(1) }
    const platform: PlatformBackend = {
      canQuit: false,
      quit: () => {},
      setFullscreen: () => Promise.resolve(),
      isFullscreen: () => false,
      achievements: new WebPlatformBackend().achievements,
    }
    const game = makeGame({ platform })
    Object.assign(platform, { achievements: later })
    expect(game.achievements).toBe(later)
  })
})

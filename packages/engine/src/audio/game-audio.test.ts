// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class WebGLRenderer {
    readonly domElement: HTMLCanvasElement
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.domElement = canvas
    }
    setPixelRatio(): void {}
    setSize(): void {}
    setViewport(): void {}
    setScissor(): void {}
    setScissorTest(): void {}
    setClearColor(): void {}
    clear(): void {}
    render(): void {}
    setAnimationLoop(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import { Game, RUNTIME_BRIDGE_SYMBOL, type RuntimeBridge, type RuntimeBridgeActivation } from '../index.js'
import { FakeAudioBackend, flush } from './test-helpers.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(backend?: FakeAudioBackend): { game: Game; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  const game = new Game(backend ? { canvas, audio: backend } : { canvas })
  return { game, canvas }
}

/** Reaches the private per-frame loop directly, the same seam CA-4's test uses. */
function runFrameOf(game: Game): (dt: number) => void {
  return (game as unknown as { runFrame(dt: number): void }).runFrame.bind(game)
}

function unlock(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
}

function installActivation(): {
  activation: RuntimeBridgeActivation
  registered: RuntimeBridge[]
  unregistered: RuntimeBridge[]
} {
  const registered: RuntimeBridge[] = []
  const unregistered: RuntimeBridge[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => registered.push(bridge),
    unregister: (bridge) => unregistered.push(bridge),
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, {
    configurable: true,
    value: activation,
  })
  return { activation, registered, unregistered }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('game.audio wiring', () => {
  it('exists on a freshly constructed Game, before any input', () => {
    const { game } = makeGame(new FakeAudioBackend())
    expect(game.audio).toBeDefined()
    expect(game.audio.channels()).toEqual(['music', 'sfx'])
    game.dispose()
  })

  it('is safe with the real default backend under happy-dom: no AudioContext, no throw, one graceful warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game } = makeGame()

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(() => game.audio.play('hit.ogg')).not.toThrow()
    await flush()

    expect(warn).toHaveBeenCalledTimes(1)
    game.dispose()
  })
})

describe('CA-1 — resolves uris through the session-scoped scene catalog registry', () => {
  it('resolves play() and preload() through registerSceneCatalog\'s registry', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    unlock()
    game.registerSceneCatalog({
      scenes: {},
      registry: { components: {}, resolveAsset: (uri) => (uri === 'waica:theme' ? '/resolved/theme.ogg' : uri) },
    })

    await game.audio.preload(['waica:theme'])
    game.audio.play('waica:theme', { channel: 'music' })
    await flush()

    expect(backend.loadCalls).toEqual([{ uri: '/resolved/theme.ogg' }])
    expect(backend.playCalls).toEqual([{ resource: '/resolved/theme.ogg', channel: 'music', volume: 1, loop: false }])
    game.dispose()
  })

  it('ignores game.registry entirely, and keeps resolving through the catalog after unloadScene() clears it', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    unlock()
    game.registerSceneCatalog({
      scenes: {},
      registry: { components: {}, resolveAsset: (uri) => (uri === 'waica:theme' ? '/resolved/theme.ogg' : uri) },
    })
    // A live scene's own registry can differ from the catalog's (or lack a
    // resolver entirely) — resolution must ignore it, using only the
    // catalog registered via registerSceneCatalog.
    game.registry = { components: {} }

    game.audio.play('waica:theme', { channel: 'music' })
    await flush()
    expect(backend.playCalls[0]).toEqual({
      resource: '/resolved/theme.ogg',
      channel: 'music',
      volume: 1,
      loop: false,
    })

    // unloadScene() nulls game.registry but must never touch sceneCatalog —
    // a { scope: 'session' } music bed needs its resolver to survive the
    // scene it started next to.
    game.unloadScene()
    expect(game.registry).toBeNull()

    game.audio.play('waica:theme', { channel: 'music', scope: 'session' })
    await flush()
    expect(backend.playCalls[1]).toEqual({
      resource: '/resolved/theme.ogg',
      channel: 'music',
      volume: 1,
      loop: false,
    })
    game.dispose()
  })

  it('passes uris through unchanged when no catalog is registered', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    unlock()

    game.audio.play('waica:theme', { channel: 'music' })
    await flush()

    expect(backend.playCalls).toEqual([{ resource: 'waica:theme', channel: 'music', volume: 1, loop: false }])
    game.dispose()
  })
})

describe('CA-3 — the mixer does not persist', () => {
  it('a fresh Game reports master and every factory channel at defaults, regardless of a previous Game', () => {
    // Nothing in AudioSubsystem/WebAudioBackend ever touches localStorage,
    // sessionStorage or waica.params.json (grep the two source files: no
    // such reference exists) — the only thing to prove dynamically is that
    // state genuinely doesn't cross Game instances.
    const { game: first } = makeGame(new FakeAudioBackend())
    first.audio.master = 0.3
    first.audio.setChannelVolume('music', 0.6)
    first.audio.setChannelMuted('sfx', true)
    first.dispose()

    const { game: second } = makeGame(new FakeAudioBackend())
    expect(second.audio.master).toBe(1)
    expect(second.audio.channelState('music')).toEqual({ volume: 1, muted: false })
    expect(second.audio.channelState('sfx')).toEqual({ volume: 1, muted: false })
    second.dispose()
  })
})

describe('CA-4 — the editor pause suspends audio', () => {
  it('suspends on simulate=false and resumes on simulate=true, without stopping or restarting in-flight sounds', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    const runFrame = (game as unknown as { runFrame(dt: number): void }).runFrame.bind(game)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(backend.resumeCalls).toBe(1)

    const handle = game.audio.play('bed.ogg', { channel: 'music', loop: true })
    await flush()

    game.simulate = false
    runFrame(0.016)
    expect(backend.suspendCalls).toBe(1)
    expect(backend.resumeCalls).toBe(1)

    game.simulate = true
    runFrame(0.016)
    expect(backend.resumeCalls).toBe(2)
    expect(backend.suspendCalls).toBe(1)

    // The sound itself was never touched by the pause/resume cycle.
    expect(backend.playbacks[0]?.stops).toEqual([])
    expect(handle.playing).toBe(true)

    game.dispose()
  })
})

describe('CA-5 — a registered Runtime Bridge silences output but not the model', () => {
  it('registering the bridge silences output; play() still registers; unregistering restores output', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    installActivation()

    // No real keydown/pointerdown ever happens under MCP-driven automation —
    // registering the bridge is what unlocks (the game is not autoplaying to
    // real speakers either way; suspend() below keeps it that way).
    game.start()
    expect(backend.resumeCalls).toBe(0)
    expect(backend.suspendCalls).toBe(0)

    const handle = game.audio.play('swing.ogg', { channel: 'sfx' })
    await flush()

    expect(backend.playCalls).toEqual([{ resource: 'swing.ogg', channel: 'sfx', volume: 1, loop: false }])
    expect(game.audio.liveSounds()).toEqual([{ uri: 'swing.ogg', channel: 'sfx', scope: 'scene' }])
    expect(handle.playing).toBe(true)
    handle.stop()
    expect(handle.playing).toBe(false)

    window.dispatchEvent(new Event('pagehide'))
    expect(backend.resumeCalls).toBe(1)

    game.dispose()
  })
})

describe('CA-10 — teardown', () => {
  it('stops every live sound, including session-scoped ones, and closes the backend', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))

    const sceneScoped = game.audio.play('hit.ogg')
    const sessionScoped = game.audio.play('bed.ogg', { channel: 'music', scope: 'session' })
    await flush()

    game.dispose()

    expect(sceneScoped.playing).toBe(false)
    expect(sessionScoped.playing).toBe(false)
    expect(game.audio.liveSounds()).toEqual([])
    expect(backend.closeCalls).toBe(1)
  })
})

describe('CA-7 — scene scope (ADR 0012)', () => {
  it('unloadScene stops a sound started without a scope', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    unlock()
    const handle = game.audio.play('hit.ogg')
    await flush()

    game.unloadScene()

    expect(handle.playing).toBe(false)
    expect(backend.playbacks[0]?.stops).toEqual([{ fadeMs: undefined }])
    expect(game.audio.liveSounds()).toEqual([])
    game.dispose()
  })

  it('unloadScene leaves a { scope: "session" } sound playing, its handle still reporting playing', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    unlock()
    const handle = game.audio.play('bed.ogg', { channel: 'music', scope: 'session' })
    await flush()

    game.unloadScene()

    expect(handle.playing).toBe(true)
    expect(backend.playbacks[0]?.stops).toEqual([])
    expect(game.audio.liveSounds()).toEqual([{ uri: 'bed.ogg', channel: 'music', scope: 'session' }])
    game.dispose()
  })

  it('one unloadScene stops the scene-scoped sound and leaves the session-scoped one, together', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    unlock()
    const music = game.audio.play('bed.ogg', { channel: 'music', scope: 'session' })
    const swing = game.audio.play('swing.ogg', { channel: 'sfx' })
    await flush()

    game.unloadScene()

    expect(music.playing).toBe(true)
    expect(swing.playing).toBe(false)
    expect(game.audio.liveSounds()).toEqual([{ uri: 'bed.ogg', channel: 'music', scope: 'session' }])
    game.dispose()
  })

  it('drops a scene-scoped sound still loading when unloadScene runs, before it ever reaches the backend', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    unlock()
    const handle = game.audio.play('hit.ogg') // no flush yet: load() is still pending

    game.unloadScene()
    await flush()

    expect(handle.playing).toBe(false)
    expect(backend.playCalls).toEqual([])
    game.dispose()
  })
})

describe('CA-8 — positional audio', () => {
  it('a flat sound (no `at`) never receives a pan or an attenuation-driven volume update', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    const runFrame = runFrameOf(game)
    unlock()
    game.audio.play('ambience.ogg', { volume: 0.7 })
    await flush()

    // Move the "listener" far away — a positional sound would react; a flat one must not.
    game.camera.position.x = 1000
    runFrame(0.016)
    runFrame(0.016)

    expect(backend.playbacks[0]?.setVolumeCalls).toEqual([])
    expect(backend.playbacks[0]?.setPanCalls).toEqual([])
    game.dispose()
  })

  it('is at full volume at or inside the reference distance, and silent beyond the max distance', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    const runFrame = runFrameOf(game)
    unlock()
    const near = game.audio.play('near.ogg', { at: { x: 1, y: 0 } })
    const far = game.audio.play('far.ogg', { at: { x: 20, y: 0 } })
    await flush()

    runFrame(0.016)

    expect(near.playing).toBe(true)
    expect(far.playing).toBe(true) // silenced by distance, not stopped
    expect(backend.playbacks[0]?.setVolumeCalls.at(-1)).toBe(1)
    expect(backend.playbacks[1]?.setVolumeCalls.at(-1)).toBe(0)
    game.dispose()
  })

  it('attenuates a mid-range source to a fraction strictly between full volume and silence', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    const runFrame = runFrameOf(game)
    unlock()
    game.audio.play('mid.ogg', { at: { x: 8, y: 0 } })
    await flush()

    runFrame(0.016)

    const volume = backend.playbacks[0]?.setVolumeCalls.at(-1)
    expect(volume).toBeCloseTo(8 / 13, 5)
    game.dispose()
  })

  it('pans right for a source to the screen-right of the listener, left for one to the left', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    const runFrame = runFrameOf(game)
    unlock()
    game.audio.play('right.ogg', { at: { x: 4, y: 0 } })
    game.audio.play('left.ogg', { at: { x: -4, y: 0 } })
    await flush()

    runFrame(0.016)

    const panRight = backend.playbacks[0]?.setPanCalls.at(-1)
    const panLeft = backend.playbacks[1]?.setPanCalls.at(-1)
    expect(panRight).toBeGreaterThan(0)
    expect(panLeft).toBeLessThan(0)
    expect(panRight).toBeCloseTo(-panLeft!, 5)
    game.dispose()
  })

  it('play(uri, { at: entity }) recomputes placement every frame as the entity moves', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    const runFrame = runFrameOf(game)
    unlock()
    const source = game.spawn('Source')
    const handle = game.audio.play('follow.ogg', { at: source })
    await flush()

    source.position.x = 1
    runFrame(0.016)
    const closeVolume = backend.playbacks[0]?.setVolumeCalls.at(-1)

    source.position.x = 20
    runFrame(0.016)
    const farVolume = backend.playbacks[0]?.setVolumeCalls.at(-1)

    expect(closeVolume).toBe(1)
    expect(farVolume).toBe(0)
    expect(handle.playing).toBe(true)
    game.dispose()
  })

  it('play(uri, { at: {x, y} }) fixes the placement: it does not track anything and stays constant', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    const runFrame = runFrameOf(game)
    unlock()
    game.audio.play('fixed.ogg', { at: { x: 1, y: 0 } })
    await flush()

    runFrame(0.016)
    const first = backend.playbacks[0]?.setVolumeCalls.at(-1)
    runFrame(0.016)
    const second = backend.playbacks[0]?.setVolumeCalls.at(-1)

    expect(first).toBe(1)
    expect(second).toBe(1)
    game.dispose()
  })

  it('under projection "isometric", two sources at equal LOGICAL distance in different compass directions get equal attenuation despite unequal render-space distances', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    const runFrame = runFrameOf(game)
    game.setSceneRender({ projection: 'isometric' })
    unlock()

    // Both 8 logical units from the origin (the listener, since the camera
    // is untouched at its default (0,0)): one purely along the logical X
    // axis, one along the logical diagonal. Isometric projection is NOT a
    // similarity transform, so these land at very different render-space
    // distances from the listener — a buggy implementation that measured
    // distance in render space instead of logical space would tell them
    // apart. See ADR 0012 / CA-8 and the "Riesgos" note in the spec.
    const axisAligned = game.audio.play('axis.ogg', { at: { x: 8, y: 0 } })
    const diagonal = game.audio.play('diagonal.ogg', { at: { x: 8 / Math.SQRT2, y: 8 / Math.SQRT2 } })
    await flush()

    runFrame(0.016)

    const axisVolume = backend.playbacks[0]?.setVolumeCalls.at(-1)
    const diagonalVolume = backend.playbacks[1]?.setVolumeCalls.at(-1)
    expect(axisVolume).toBeCloseTo(8 / 13, 5)
    expect(diagonalVolume).toBeCloseTo(8 / 13, 5)

    // The two directions really are different on screen: the axis-aligned
    // source reads to the right, the diagonal one reads dead center.
    const axisPan = backend.playbacks[0]?.setPanCalls.at(-1)
    const diagonalPan = backend.playbacks[1]?.setPanCalls.at(-1)
    expect(axisPan).toBeGreaterThan(0)
    expect(diagonalPan).toBeCloseTo(0, 5)

    expect(axisAligned.playing).toBe(true)
    expect(diagonal.playing).toBe(true)
    game.dispose()
  })
})

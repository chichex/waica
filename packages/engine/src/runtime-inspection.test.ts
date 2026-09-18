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

import {
  Game,
  RUNTIME_BRIDGE_SYMBOL,
  type RuntimeBridge,
  type RuntimeBridgeActivation,
} from './index'
import { FakeAudioBackend, flush } from './audio/test-helpers.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(backend?: FakeAudioBackend): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game(backend ? { canvas, audio: backend } : { canvas })
}

function installActivation(): { registered: RuntimeBridge[] } {
  const registered: RuntimeBridge[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => registered.push(bridge),
    unregister: () => {},
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, {
    configurable: true,
    value: activation,
  })
  return { registered }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
})

describe('RuntimeSnapshot.scene (CA-9)', () => {
  it('is null with no scene loaded', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.scene).toBeNull()
    game.dispose()
  })

  it('reports the live scene name alongside stats', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.registerSceneCatalog({
      scenes: { cave: { waicaScene: 3, entities: [{ name: 'Torch' }] } },
      registry: { components: {} },
    })
    game.loadSceneByName('cave')
    game.start()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.scene).toBe('cave')
    expect(snapshot.stats).toEqual({})
    game.dispose()
  })
})

describe('RuntimeSnapshot.audio (CA-15)', () => {
  it('reports master and every factory channel at their defaults, and no live sounds, on a fresh Game', () => {
    const { registered } = installActivation()
    const game = makeGame(new FakeAudioBackend())
    game.start()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.audio).toEqual({
      master: 1,
      channels: { music: { volume: 1, muted: false }, sfx: { volume: 1, muted: false } },
      playing: [],
    })
    game.dispose()
  })

  it('reflects mixer changes and lists every live sound with its channel and scope, sorted by uri', async () => {
    const { registered } = installActivation()
    const game = makeGame(new FakeAudioBackend())
    game.start() // a registered Runtime Bridge satisfies the unlock (CA-5)

    game.audio.master = 0.5
    game.audio.setChannelMuted('music', true)
    game.audio.play('zzz.ogg', { channel: 'sfx' })
    game.audio.play('aaa.ogg', { channel: 'music', scope: 'session' })
    await flush()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.audio).toEqual({
      master: 0.5,
      channels: { music: { volume: 1, muted: true }, sfx: { volume: 1, muted: false } },
      playing: [
        { uri: 'aaa.ogg', channel: 'music', scope: 'session' },
        { uri: 'zzz.ogg', channel: 'sfx', scope: 'scene' },
      ],
    })
    game.dispose()
  })

  it('reports the resolved uri in `playing`, not the raw one passed to play() (CA-1)', async () => {
    const { registered } = installActivation()
    const game = makeGame(new FakeAudioBackend())
    game.registerSceneCatalog({
      scenes: {},
      registry: { components: {}, resolveAsset: (uri) => (uri === 'waica:theme' ? '/resolved/theme.ogg' : uri) },
    })
    game.start()

    game.audio.play('waica:theme', { channel: 'music' })
    await flush()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.audio.playing).toEqual([{ uri: '/resolved/theme.ogg', channel: 'music', scope: 'scene' }])
    game.dispose()
  })

  it('sorts channel names alphabetically regardless of creation order', async () => {
    const { registered } = installActivation()
    const game = makeGame(new FakeAudioBackend())
    game.start()

    game.audio.play('bell.ogg', { channel: 'zeta' })
    await flush()

    const snapshot = registered[0]!.inspect()

    expect(Object.keys(snapshot.audio.channels)).toEqual(['music', 'sfx', 'zeta'])
    game.dispose()
  })
})

describe('RuntimeSnapshot.time (CA-10)', () => {
  it('reports pending 0 and nextInSteps null with nothing scheduled', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.time).toEqual({ pending: 0, nextInSteps: null })
    game.dispose()
  })

  it('after(0.1): pending 1, nextInSteps 6, then 1 after five steps, then null after the sixth, callback run once', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    const callback = vi.fn()
    game.time.after(0.1, callback)

    expect(registered[0]!.inspect().time).toEqual({ pending: 1, nextInSteps: 6 })

    registered[0]!.control({ operation: 'step', frames: 5 })
    expect(registered[0]!.inspect().time).toEqual({ pending: 1, nextInSteps: 1 })

    registered[0]!.control({ operation: 'step', frames: 1 })
    expect(registered[0]!.inspect().time).toEqual({ pending: 0, nextInSteps: null })
    expect(callback).toHaveBeenCalledOnce()
    game.dispose()
  })

  it('every(0.25): nextInSteps 15', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    game.time.every(0.25, () => {})

    expect(registered[0]!.inspect().time).toEqual({ pending: 1, nextInSteps: 15 })
    game.dispose()
  })

  it('a 0.5s tween: nextInSteps 30', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    game.time.tween({ from: 0, to: 1, seconds: 0.5, onUpdate: () => {} })

    expect(registered[0]!.inspect().time).toEqual({ pending: 1, nextInSteps: 30 })
    game.dispose()
  })

  it('is present on entity- and component-filtered snapshots too', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    game.spawn('Subject')
    game.time.after(0.1, () => {})

    const filtered = registered[0]!.inspect({ entity_names: ['Subject'] })

    expect(filtered.time).toEqual({ pending: 1, nextInSteps: 6 })
    game.dispose()
  })
})

describe('RuntimeSnapshot.ui (issue #72 CA-9)', () => {
  // makeGame's 640×360 canvas at viewHeight 10: 36 px per world unit, the
  // camera at (0, 0) framing x ∈ [-80/9, 80/9] and y ∈ [-5, 5].
  function stepFrames(bridge: RuntimeBridge, frames: number): void {
    bridge.control({ operation: 'step', frames })
  }

  it('reports no shown pieces and no anchored instances on a fresh Game', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()

    expect(registered[0]!.inspect().ui).toEqual({ shown: [], anchored: [] })
    game.dispose()
  })

  it('lists the screen pieces whose visibility flag is on, sorted by name', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    game.ui.defineAll({ zeta: '<i>z</i>', alpha: '<i>a</i>', mid: '<i>m</i>', menu: '<i>menu</i>' })

    game.ui.show('zeta')
    game.ui.show('alpha')
    game.ui.show('mid')
    game.ui.hide('mid')
    game.ui.element('menu')

    expect(registered[0]!.inspect().ui.shown).toEqual(['alpha', 'zeta'])
    game.dispose()
  })

  it('lists live instances in creation order with their placement, clipped flag and own values after every set', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    game.ui.defineAll({ bar: '<i>{{current}}</i>', tag: '<i>tag</i>' })
    game.stats.set('current', 99)
    const bat = game.spawn('Bat')
    bat.position.x = 20
    const orc = game.spawn('Orc')
    game.ui.attach('tag', bat, { offset: [0, 1] })
    const bar = game.ui.attach('bar', orc, { offset: [0, 1], values: { current: 7, max: 10 } })
    game.ui.attach('tag', orc)
    bar.set('current', 6)
    bar.set('label', 'orc')

    stepFrames(registered[0]!, 1)

    expect(registered[0]!.inspect().ui.anchored).toEqual([
      // Render (20, 1): 1040 px across a 640 px viewport.
      { piece: 'tag', entity: 'Bat', x: 1040, y: 144, clipped: true, values: {} },
      { piece: 'bar', entity: 'Orc', x: 320, y: 144, clipped: false, values: { current: 6, max: 10, label: 'orc' } },
      { piece: 'tag', entity: 'Orc', x: 320, y: 180, clipped: false, values: {} },
    ])
    game.dispose()
  })

  it('reports the coordinates used for placement: a move shows only after the next frame', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    game.ui.define('tag', '<i>tag</i>')
    const orc = game.spawn('Orc')

    // Not placed yet: reported where the next frame will place it.
    game.ui.attach('tag', orc, { offset: [0, 1] })
    expect(registered[0]!.inspect().ui.anchored[0]).toMatchObject({ x: 320, y: 144 })

    stepFrames(registered[0]!, 1)
    orc.position.x = 1
    expect(registered[0]!.inspect().ui.anchored[0]).toMatchObject({ x: 320, y: 144 })

    stepFrames(registered[0]!, 1)
    expect(registered[0]!.inspect().ui.anchored[0]).toMatchObject({ x: 356, y: 144 })
    game.dispose()
  })

  it('keeps reporting a lingering instance under its destroyed entity\'s name until it expires', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    game.ui.define('hit', '<b>-{{amount}}</b>')
    const orc = game.spawn('Orc')
    game.ui.attach('hit', orc, { seconds: 0.8, values: { amount: 3 } })
    stepFrames(registered[0]!, 1)

    orc.destroy()
    const snapshot = registered[0]!.inspect()

    expect(snapshot.entities).toEqual([])
    expect(snapshot.ui.anchored).toEqual([
      { piece: 'hit', entity: 'Orc', x: 320, y: 180, clipped: false, values: { amount: 3 } },
    ])
    stepFrames(registered[0]!, 47)
    expect(registered[0]!.inspect().ui.anchored).toEqual([])
    game.dispose()
  })

  it('is present on entity- and component-filtered snapshots too', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    game.ui.define('tag', '<i>tag</i>')
    game.ui.show('tag')
    game.ui.attach('tag', game.spawn('Orc'))
    stepFrames(registered[0]!, 1)

    const byName = registered[0]!.inspect({ entity_names: ['Nobody'] })
    const byComponent = registered[0]!.inspect({ component_types: ['Missing'] })

    for (const filtered of [byName, byComponent]) {
      expect(filtered.entities).toEqual([])
      expect(filtered.ui.shown).toEqual(['tag'])
      expect(filtered.ui.anchored).toHaveLength(1)
    }
    game.dispose()
  })
})

describe('RuntimeSnapshot.ui within the projection limits (issue #72 CA-9)', () => {
  const serializedBytes = (snapshot: unknown): number =>
    new TextEncoder().encode(JSON.stringify(snapshot)).byteLength

  it('truncates an anchored string value over 4 KiB like any projected string, so a snapshot with no entities stays within 1 MiB', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    game.ui.define('hit', '<b>{{label}}</b>')
    const orc = game.spawn('Orc')
    game.ui.attach('hit', orc, { seconds: 5, values: { label: 'x'.repeat(1_048_576), amount: 3 } })
    orc.destroy()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.entities).toEqual([])
    expect(serializedBytes(snapshot)).toBeLessThanOrEqual(1_048_576)
    expect(snapshot.ui.anchored[0]!.values).toEqual({
      amount: 3,
      label: {
        $waica: 'truncated',
        reason: 'string',
        preview: 'x'.repeat(4_096),
        originalLength: 1_048_576,
        originalBytes: 1_048_576,
      },
    })
    expect(snapshot.projectionIssues).toEqual([{ path: 'ui.anchored[0].values.label', marker: 'truncated' }])
    game.dispose()
  })

  it('keeps the first 100 of an instance\'s values by name and marks the record truncated, like any projected record', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    game.ui.define('tag', '<i>tag</i>')
    const name = (index: number): string => `v${String(index).padStart(3, '0')}`
    game.ui.attach('tag', game.spawn('Orc'), {
      values: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [name(index), index])),
    })

    const snapshot = registered[0]!.inspect()

    expect(snapshot.ui.anchored[0]!.values).toEqual({
      $waica: 'truncated',
      reason: 'entries',
      omitted: 1,
      value: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [name(index), index])),
    })
    expect(snapshot.projectionIssues).toEqual([{ path: 'ui.anchored[0].values', marker: 'truncated' }])
    game.dispose()
  })

  it('drops anchored instances from the end, once every entity is gone, until the snapshot fits in 1 MiB', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    game.ui.define('tag', '<i>tag</i>')
    // Sixty 4 KiB strings each: about 246 KB per instance, so four fit in 1 MiB and five do not.
    for (let index = 0; index < 5; index += 1) {
      game.ui.attach('tag', game.spawn(`E${index}`), {
        values: Object.fromEntries(
          Array.from({ length: 60 }, (_, field) => [`f${field}`, String(index).padEnd(4_096, 'x')]),
        ),
      })
    }

    const snapshot = registered[0]!.inspect()

    expect(serializedBytes(snapshot)).toBeLessThanOrEqual(1_048_576)
    expect(snapshot.entities).toEqual([])
    expect(snapshot.ui.anchored.map(({ entity }) => entity)).toEqual(['E0', 'E1', 'E2', 'E3'])
    expect(snapshot.projectionIssues).toEqual([
      { path: 'entities[0]', marker: 'truncated', omitted: 5 },
      { path: 'ui.anchored[4]', marker: 'truncated', omitted: 1 },
    ])
    game.dispose()
  })
})

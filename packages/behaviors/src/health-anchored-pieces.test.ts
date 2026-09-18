// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// @waica/engine resolves its own nested `three` copy, so the mock has to
// target that exact module — same technique as navigation-grid.test.ts.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.module.js', import.meta.url).pathname,
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
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
  },
)

import {
  Game,
  RUNTIME_BRIDGE_SYMBOL,
  Sprite,
  StateMachine,
  type Entity,
  type RuntimeBridge,
  type RuntimeBridgeActivation,
  type RuntimeSnapshotUi,
} from '@waica/engine'
import { Health } from './health'
import { HEALTH_UI } from './health-ui'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

interface Harness {
  game: Game
  /** The live Anchored Pieces, as the Runtime Snapshot reports them. */
  anchored(): RuntimeSnapshotUi['anchored']
  /** Runs `frames` render frames of one Simulation Step each. */
  step(frames?: number): void
  /** Runs `hit` inside the next Simulation Step (step k of CA-5), then finishes that step. */
  duringStep(hit: () => void): void
}

const games: Game[] = []

/**
 * A real Game on a 640×360 canvas at viewHeight 10 — 36 CSS px per world
 * unit, the camera at (0, 0) framing y ∈ [-5, 5] — driven and inspected
 * through the Runtime Bridge, as the browser e2e does.
 */
function makeHarness(): Harness {
  const registered: RuntimeBridge[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => registered.push(bridge),
    unregister: () => {},
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, { configurable: true, value: activation })
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  const game = new Game({ canvas })
  games.push(game)
  game.ui.defineAll(HEALTH_UI)
  game.start()
  const bridge = registered[0]!
  const step = (frames = 1): void => {
    bridge.control({ operation: 'step', frames })
  }
  return {
    game,
    anchored: () => bridge.inspect().ui.anchored,
    step,
    duringStep(hit) {
      const off = game.onUpdate(() => {
        off()
        hit()
      })
      step()
    },
  }
}

/**
 * An orc like the isometric demo's: a sprite box 2 tall anchored at its
 * feet, 9/16 down — its Anchored Pieces sit at 1.6375 world units, which
 * at (0, 0) is y = (5 − 1.6375) × 36 ≈ 121 px from the viewport's top.
 */
function spawnOrc(game: Game, health: Partial<Health>, withDeathState = false): { orc: Entity; health: Health } {
  const orc = game.spawn('Orc')
  orc.add(Sprite, { width: 2, height: 2, anchorY: 0, offsetY: -9 / 16 })
  if (withDeathState) {
    orc.add(StateMachine, {
      initial: 'idle',
      states: { idle: {}, dead: {}, '*': { transitions: [{ on: 'signal:death', to: 'dead' }] } },
    })
  }
  return { orc, health: orc.add(Health, health) }
}

function pieces(harness: Harness, piece: string): RuntimeSnapshotUi['anchored'] {
  return harness.anchored().filter((instance) => instance.piece === piece)
}

function waicaWarnings(warn: { mock: { calls: unknown[][] } }): unknown[][] {
  return warn.mock.calls.filter((call) => String(call[0]).startsWith('[waica]'))
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  for (const game of games.splice(0)) game.dispose()
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Health damage numbers (issue #72, CA-13)', () => {
  it('attaches the named piece above the struck entity with the hit amount', () => {
    const harness = makeHarness()
    const { health } = spawnOrc(harness.game, { max: 3, damageNumber: 'damage-number' })

    harness.duringStep(() => health.damage(1))

    expect(harness.anchored()).toEqual([
      { piece: 'damage-number', entity: 'Orc', x: 320, y: 121, clipped: false, values: { amount: 1 } },
    ])
  })

  it('removes the number 48 steps after the hit', () => {
    const harness = makeHarness()
    const { health } = spawnOrc(harness.game, { max: 3, damageNumber: 'damage-number' })

    harness.duringStep(() => health.damage(1))
    harness.step(47)
    expect(pieces(harness, 'damage-number')).toHaveLength(1)

    harness.step()
    expect(pieces(harness, 'damage-number')).toEqual([])
  })

  it('attaches one number per accepted hit, and none for a hit the invulnerability window rejects', () => {
    const harness = makeHarness()
    const { health } = spawnOrc(harness.game, { max: 5, invulnerability: 1, damageNumber: 'damage-number' })

    harness.duringStep(() => {
      health.damage(2)
      health.damage(1) // inside the window the first hit opened: rejected
    })

    expect(health.current).toBe(3)
    expect(pieces(harness, 'damage-number').map((instance) => instance.values)).toEqual([{ amount: 2 }])
  })

  it('attaches nothing for a non-finite amount, which still applies', () => {
    const harness = makeHarness()
    const { orc, health } = spawnOrc(harness.game, { max: 3, damageNumber: 'damage-number' }, true)

    harness.duringStep(() => health.damage(Infinity))

    expect(health.current).toBe(0)
    expect(orc.alive).toBe(true) // the death state keeps it: the number's absence is not the entity's
    expect(harness.anchored()).toEqual([])
  })

  it('attaches nothing on heal', () => {
    const harness = makeHarness()
    const { health } = spawnOrc(harness.game, { max: 3, damageNumber: 'damage-number' })
    harness.duringStep(() => health.damage(2))
    harness.step(48)
    expect(harness.anchored()).toEqual([])

    harness.duringStep(() => health.heal(1))

    expect(health.current).toBe(2)
    expect(harness.anchored()).toEqual([])
  })

  it('outlives the entity a killing blow destroys, frozen where it stood, until 48 steps after the hit', () => {
    const harness = makeHarness()
    const { orc, health } = spawnOrc(harness.game, { max: 1, damageNumber: 'damage-number' })

    harness.duringStep(() => health.damage(1))

    expect(orc.alive).toBe(false)
    expect(harness.anchored()).toEqual([
      { piece: 'damage-number', entity: 'Orc', x: 320, y: 121, clipped: false, values: { amount: 1 } },
    ])
    harness.step(47)
    expect(pieces(harness, 'damage-number')).toHaveLength(1)
    harness.step()
    expect(harness.anchored()).toEqual([])
  })

  it('attaches nothing and logs nothing when damageNumber is empty (the default)', () => {
    const warn = vi.spyOn(console, 'warn')
    const harness = makeHarness()
    const { health } = spawnOrc(harness.game, { max: 3 })

    harness.duringStep(() => health.damage(1))

    expect(health.current).toBe(2)
    expect(harness.anchored()).toEqual([])
    expect(waicaWarnings(warn)).toEqual([])
  })
})

describe('Health bar (issue #72, CA-15)', () => {
  it('shows no bar while health is full', () => {
    const harness = makeHarness()
    spawnOrc(harness.game, { max: 2, healthBar: 'health-bar' })

    harness.step()

    expect(harness.anchored()).toEqual([])
  })

  it('attaches the bar above the entity on the first damage that leaves it below max', () => {
    const harness = makeHarness()
    const { health } = spawnOrc(harness.game, { max: 2, healthBar: 'health-bar' })

    harness.duringStep(() => health.damage(1))

    expect(harness.anchored()).toEqual([
      { piece: 'health-bar', entity: 'Orc', x: 320, y: 121, clipped: false, values: { current: 1, max: 2 } },
    ])
  })

  it('keeps that one bar up to date through later damage and healing', () => {
    const harness = makeHarness()
    const attach = vi.spyOn(harness.game.ui, 'attach')
    const { health } = spawnOrc(harness.game, { max: 4, healthBar: 'health-bar' })
    const barValues = () => pieces(harness, 'health-bar').map((instance) => instance.values)

    harness.duringStep(() => health.damage(1))
    expect(barValues()).toEqual([{ current: 3, max: 4 }])
    harness.duringStep(() => health.damage(2))
    expect(barValues()).toEqual([{ current: 1, max: 4 }])
    harness.duringStep(() => health.heal(1))
    expect(barValues()).toEqual([{ current: 2, max: 4 }])

    // The same instance throughout, updated in place rather than re-attached.
    expect(attach.mock.calls.filter(([piece]) => piece === 'health-bar')).toHaveLength(1)
    expect(attach.mock.results[0]!.value.alive).toBe(true)
  })

  it.each([
    ['a partial heal back to max', (health: Health) => health.heal(1)],
    ['a full restore', (health: Health) => health.heal(Infinity)],
  ])('removes the bar when %s brings health back to max', (_label, heal) => {
    const harness = makeHarness()
    const { health } = spawnOrc(harness.game, { max: 2, healthBar: 'health-bar' })
    harness.duringStep(() => health.damage(1))
    expect(pieces(harness, 'health-bar')).toHaveLength(1)

    harness.duringStep(() => heal(health))

    expect(health.current).toBe(2)
    expect(harness.anchored()).toEqual([])
  })

  it.each([
    ['a death state keeps the entity alive', true],
    ['no death state destroys the entity', false],
  ])('removes the bar before death is emitted when %s', (_label, withDeathState) => {
    const harness = makeHarness()
    const { orc, health } = spawnOrc(harness.game, { max: 2, healthBar: 'health-bar' }, withDeathState)
    harness.duringStep(() => health.damage(1))
    expect(pieces(harness, 'health-bar')).toHaveLength(1)
    const barsAtDeath: unknown[] = []
    harness.game.events.on('death', () => barsAtDeath.push(pieces(harness, 'health-bar')))

    harness.duringStep(() => health.damage(1))

    expect(barsAtDeath).toEqual([[]])
    expect(orc.alive).toBe(withDeathState)
    expect(harness.anchored()).toEqual([])
  })

  it('attaches nothing when healthBar is empty (the default)', () => {
    const harness = makeHarness()
    const { health } = spawnOrc(harness.game, { max: 2 })

    harness.duringStep(() => health.damage(1))

    expect(health.current).toBe(1)
    expect(harness.anchored()).toEqual([])
  })
})

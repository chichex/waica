// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three', async (importOriginal) => {
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
})

import {
  Component,
  Game,
  RUNTIME_BRIDGE_CAPABILITIES,
  RUNTIME_BRIDGE_SYMBOL,
  type RuntimeBridge,
  type RuntimeBridgeActivation,
  type RuntimeControlRequest,
} from './index'
import { defined } from './test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

/** What behaviors read from the right Action on each Simulation Step. */
class AxisProbe extends Component {
  static override componentName = 'AxisProbe'
  axes!: number[]
  override onUpdate(): void {
    this.axes.push(this.game.input.axis('left', 'right'))
  }
}

let game: Game | null = null

function startBridge(): { bridge: RuntimeBridge; axes: number[] } {
  const registered: RuntimeBridge[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => registered.push(bridge),
    unregister: () => undefined,
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, { configurable: true, value: activation })
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  game = new Game({ canvas, bindings: { left: ['KeyA'], right: ['KeyD'], jump: ['Space'] } })
  const axes: number[] = []
  game.spawn('Subject').add(AxisProbe, { axes })
  game.start()
  return { bridge: defined(registered[0]), axes }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  game?.dispose()
  game = null
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
})

describe('Runtime Bridge analog hold (issue #75 CA-12)', () => {
  it('announces the analog-actions capability', () => {
    expect(RUNTIME_BRIDGE_CAPABILITIES).toContain('analog-actions')
    expect(startBridge().bridge.metadata().capabilities).toContain('analog-actions')
  })

  it('holds an Action at a value, and at 1 without one, exactly as before', () => {
    const { bridge, axes } = startBridge()

    bridge.control({ operation: 'hold', action: 'right', value: 0.5 })
    bridge.control({ operation: 'step' })
    bridge.control({ operation: 'hold', action: 'right' })
    bridge.control({ operation: 'step' })

    expect(axes).toEqual([0.5, 1])
  })

  it('holds below 0.5 as a value that moves the Action without holding it', () => {
    const { bridge, axes } = startBridge()

    const held = bridge.control({ operation: 'hold', action: 'right', value: 0.3 })
    bridge.control({ operation: 'step' })

    expect(held.heldActions).toEqual([])
    expect(axes).toEqual([0.3])
  })

  it.each([0, -0.2, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a hold value of %s with no state change',
    (value) => {
      const { bridge } = startBridge()
      expect(() => bridge.control({ operation: 'hold', action: 'right', value })).toThrowError(
        expect.objectContaining({ code: 'runtime-operation-failed', stage: 'control' }),
      )
      expect(bridge.control({ operation: 'pause' }).heldActions).toEqual([])
    },
  )

  it.each(['press', 'release'] as const)('rejects a value on %s', (operation) => {
    const { bridge } = startBridge()
    const request = { operation, action: 'jump', value: 0.5 } as RuntimeControlRequest
    expect(() => bridge.control(request)).toThrowError(`${operation} does not accept a value; only hold does.`)
    expect(() => bridge.control(request)).toThrowError(
      expect.objectContaining({ code: 'runtime-operation-failed' }),
    )
    expect(bridge.control({ operation: 'pause' }).heldActions).toEqual([])
  })
})

describe('Runtime Bridge action values (issue #75 CA-13)', () => {
  it('reports the value of every held Action beside heldActions', () => {
    const { bridge } = startBridge()

    bridge.control({ operation: 'hold', action: 'right', value: 0.5 })
    const result = bridge.control({ operation: 'hold', action: 'jump' })

    expect(result.heldActions).toEqual(['jump', 'right'])
    expect(result.actionValues).toEqual({ jump: 1, right: 0.5 })
    expect(bridge.control({ operation: 'release', action: 'right' }).actionValues).toEqual({ jump: 1 })
  })
})

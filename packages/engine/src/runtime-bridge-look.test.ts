// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { resetFakeRendering } from './test-renderer'
import {
  Component,
  Game,
  RUNTIME_BRIDGE_CAPABILITIES,
  RUNTIME_BRIDGE_SYMBOL,
  type RuntimeBridge,
  type RuntimeControlRequest,
} from './index'
import { defined } from './test-support'

/** Records the mouse movement each Simulation Step reads. */
class LookProbe extends Component {
  static override componentName = 'LookProbe'
  log!: string[]
  override onUpdate(): void {
    const { x, y } = this.game.input.mouseMovement()
    this.log.push(`${x},${y}`)
  }
}

const games: Game[] = []

function startedBridge(log: string[]): RuntimeBridge {
  const registered: RuntimeBridge[] = []
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, {
    configurable: true,
    value: { protocolVersion: 1, register: (bridge: RuntimeBridge) => registered.push(bridge), unregister: () => {} },
  })
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  const game = new Game({ canvas })
  games.push(game)
  game.spawn('Probe').add(LookProbe, { log })
  game.start()
  return defined(registered[0], 'a registered bridge')
}

beforeEach(() => {
  resetFakeRendering()
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  for (const game of games.splice(0)) game.dispose()
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
})

it('lands a look delta in the next step as locked mouse movement, with no lock (CA-4)', () => {
  const log: string[] = []
  const bridge = startedBridge(log)

  const result = bridge.control({ operation: 'look', dx: 30, dy: -12 })
  bridge.control({ operation: 'look', dx: 5, dy: 2 })
  expect(result.frame).toBe(0)
  bridge.control({ operation: 'step', frames: 2 })

  expect(log).toEqual(['35,-10', '0,0'])
  expect(RUNTIME_BRIDGE_CAPABILITIES).toContain('look')
  expect(bridge.metadata().capabilities).toContain('look')
})

it('rejects a look with a non-finite or missing delta, and applies none of it (CA-4)', () => {
  const log: string[] = []
  const bridge = startedBridge(log)
  const failed = { code: 'runtime-operation-failed', stage: 'control' }
  const invalid = [
    { operation: 'look', dx: Number.NaN, dy: 0 },
    { operation: 'look', dx: 1, dy: Number.POSITIVE_INFINITY },
    { operation: 'look', dx: 1 },
  ] as unknown as RuntimeControlRequest[]

  for (const request of invalid) {
    expect(() => bridge.control(request)).toThrowError(expect.objectContaining(failed))
  }
  bridge.control({ operation: 'step' })
  expect(log).toEqual(['0,0'])
})

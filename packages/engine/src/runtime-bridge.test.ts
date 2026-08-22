// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import enginePackage from '../package.json' with { type: 'json' }

const renderer = vi.hoisted(() => ({
  loop: null as ((time: number) => void) | null,
  renders: 0,
}))

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
    render(): void {
      renderer.renders += 1
    }
    setAnimationLoop(loop: ((time: number) => void) | null): void {
      renderer.loop = loop
    }
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import {
  Component,
  Game,
  loadScene,
  RUNTIME_BRIDGE_PROTOCOL_VERSION,
  RUNTIME_BRIDGE_SYMBOL,
  type RuntimeBridge,
  type RuntimeBridgeActivation,
} from './index'

class UpdateProbe extends Component {
  static override componentName = 'UpdateProbe'
  calls!: string[]
  override onUpdate(dt: number): void {
    this.calls.push(`component:${dt}`)
  }
}

interface ObservedInput {
  held: boolean
  justPressed: boolean
  consumed: boolean
}

class InputProbe extends Component {
  static override componentName = 'InputProbe'
  observations!: ObservedInput[]
  override onUpdate(): void {
    this.observations.push({
      held: this.game.input.held('jump'),
      justPressed: this.game.input.justPressed('jump'),
      consumed: this.game.input.consumed('jump'),
    })
    if (this.game.input.justPressed('jump')) this.game.input.consume('jump')
  }
}

class PassiveProbe extends Component {
  static override componentName = 'PassiveProbe'
  value = 1
}

class DiscoveryProbe extends Component {
  static override componentName = 'DiscoveryProbe'
  static override transient = ['runtimeOnly']
  visible = 1
  runtimeOnly = 9
  _speed = 3
  ignored = (): void => {}

  get speed(): number {
    return this._speed
  }
  set speed(value: number) {
    this._speed = value
  }

  get broken(): number {
    throw new Error('getter boom')
  }
  set broken(_value: number) {}

  get getterOnly(): string {
    throw new Error('must not be invoked')
  }
}

class OverrideProbe extends Component {
  static override componentName = 'OverrideProbe'
  automatic = 'excluded'
  inspectState(): unknown {
    return { custom: 42 }
  }
}

class ConfigurableProjectionProbe extends Component {
  static override componentName = 'ConfigurableProjectionProbe'
  state: unknown = null
  inspectState(): unknown {
    return this.state
  }
}

class TypedProjectionProbe extends Component {
  static override componentName = 'TypedProjectionProbe'
  toJsonCalls = 0

  inspectState(): unknown {
    const cycle: Record<string, unknown> = { label: 'cycle' }
    cycle.self = cycle
    return {
      big: 12n,
      cycle,
      date: new Date('2026-08-07T12:34:56.000Z'),
      map: new Map<unknown, unknown>([['key', 4]]),
      nan: Number.NaN,
      set: new Set<unknown>(['a', 2]),
      toJson: {
        value: 3,
        toJSON: () => {
          this.toJsonCalls += 1
          return 'must not run'
        },
      },
      undefined,
    }
  }
}

class ThrowingOverrideProbe extends Component {
  static override componentName = 'ThrowingOverrideProbe'
  inspectState(): unknown {
    throw new Error('override boom')
  }
}

class SnapshotProbe extends Component {
  static override componentName = 'SnapshotProbe'
  score = 7
  label = 'ready'
  _private = 'hidden'
  callback = (): void => {}
}

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(bindings: Record<string, string[]> = {}): Game {
  const host = document.createElement('main')
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  host.append(canvas)
  document.body.append(host)
  return new Game({ canvas, bindings })
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
  renderer.loop = null
  renderer.renders = 0
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
})

describe('Runtime Bridge protocol', () => {
  it('registers a fully constructed Game at a paused frame-zero baseline', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.spawn('Ready')

    game.start()

    expect(RUNTIME_BRIDGE_PROTOCOL_VERSION).toBe(1)
    expect(registered).toHaveLength(1)
    expect(registered[0]?.metadata()).toEqual({
      bridgeVersion: 1,
      engineVersion: enginePackage.version,
      mode: 'paused',
      frame: 0,
      simulationTime: 0,
    })
    expect(registered[0]?.surface).toBe(document.querySelector('canvas'))
    expect(renderer.loop).toBeNull()
    expect(renderer.renders).toBe(1)
    game.dispose()
  })

  it('leaves ordinary execution on its existing real-time loop with no global endpoint', () => {
    const game = makeGame()

    game.start()

    expect(Object.prototype.hasOwnProperty.call(globalThis, RUNTIME_BRIDGE_SYMBOL)).toBe(false)
    expect(renderer.loop).not.toBeNull()
    renderer.loop?.(16)
    expect(renderer.renders).toBe(1)
    game.dispose()
  })

  it('unregisters on unload or dispose and allows a later replacement Game', () => {
    const { registered, unregistered } = installActivation()
    const first = makeGame()
    first.start()

    window.dispatchEvent(new Event('pagehide'))
    expect(unregistered).toEqual([registered[0]])
    first.dispose()
    expect(unregistered).toHaveLength(1)

    const replacement = makeGame()
    replacement.start()
    expect(registered).toHaveLength(2)
    replacement.dispose()
    expect(unregistered).toEqual([registered[0], registered[1]])
  })

  it('steps the ordinary ordered frame pipeline without advancing while paused', () => {
    const { registered } = installActivation()
    const game = makeGame()
    const calls: string[] = []
    game.spawn('Subject').add(UpdateProbe, { calls })
    game.onUpdate((dt) => calls.push(`game:${dt}`))

    game.start()
    expect(calls).toEqual([])

    const result = registered[0]?.control({ operation: 'step', dt: 0.05, frames: 2 })

    expect(calls).toEqual([
      'component:0.05',
      'game:0.05',
      'component:0.05',
      'game:0.05',
    ])
    expect(result).toMatchObject({
      bridgeVersion: 1,
      mode: 'paused',
      frame: 2,
      simulationTime: 0.1,
    })
    expect(renderer.renders).toBe(3)
    expect(renderer.loop).toBeNull()
    game.dispose()
  })

  it('resumes and pauses idempotently without wall-clock catch-up', () => {
    const { registered } = installActivation()
    const game = makeGame()
    const calls: number[] = []
    game.onUpdate((dt) => calls.push(dt))
    game.start()
    const bridge = registered[0]!

    expect(bridge.control({ operation: 'resume' }).mode).toBe('real-time')
    const firstLoop = renderer.loop
    expect(firstLoop).not.toBeNull()
    expect(bridge.control({ operation: 'resume' }).mode).toBe('real-time')
    expect(renderer.loop).toBe(firstLoop)

    firstLoop?.(1_000)
    firstLoop?.(1_016)
    expect(calls).toEqual([0, 0.016])
    expect(bridge.metadata()).toMatchObject({ frame: 2, simulationTime: 0.016 })

    expect(bridge.control({ operation: 'pause' }).mode).toBe('paused')
    expect(renderer.loop).toBeNull()
    bridge.control({ operation: 'pause' })
    expect(renderer.loop).toBeNull()

    bridge.control({ operation: 'resume' })
    renderer.loop?.(50_000)
    expect(calls).toEqual([0, 0.016, 0])
    expect(bridge.metadata()).toMatchObject({
      mode: 'real-time',
      frame: 3,
      simulationTime: 0.016,
    })
    game.dispose()
  })

  it('rejects invalid step bounds and real-time stepping with stable errors', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()
    const bridge = registered[0]!

    for (const request of [
      { operation: 'step' as const, dt: 0 },
      { operation: 'step' as const, dt: Number.POSITIVE_INFINITY },
      { operation: 'step' as const, dt: 0.100_001 },
      { operation: 'step' as const, frames: 0 },
      { operation: 'step' as const, frames: 601 },
      { operation: 'step' as const, frames: 1.5 },
    ]) {
      expect(() => bridge.control(request)).toThrowError(
        expect.objectContaining({ code: 'runtime-operation-failed', stage: 'control' }),
      )
    }

    bridge.control({ operation: 'resume' })
    expect(() => bridge.control({ operation: 'step' })).toThrowError(
      expect.objectContaining({ code: 'runtime-invalid-state', stage: 'control' }),
    )
    game.dispose()
  })

  it('queues semantic actions while paused and rejects unknown names', () => {
    const { registered } = installActivation()
    const game = makeGame({ jump: ['Space'] })
    const observations: ObservedInput[] = []
    game.spawn('Subject').add(InputProbe, { observations })
    game.start()
    const bridge = registered[0]!

    expect(bridge.control({ operation: 'press', action: 'jump' }).heldActions).toEqual(['jump'])
    expect(observations).toEqual([])
    expect(bridge.control({ operation: 'step' }).heldActions).toEqual([])
    expect(observations).toEqual([{ held: true, justPressed: true, consumed: false }])

    bridge.control({ operation: 'hold', action: 'jump' })
    bridge.control({ operation: 'step', frames: 2 })
    expect(observations.slice(1)).toEqual([
      { held: true, justPressed: true, consumed: false },
      { held: true, justPressed: false, consumed: false },
    ])
    expect(bridge.control({ operation: 'release', action: 'jump' }).heldActions).toEqual([])

    expect(() => bridge.control({ operation: 'press', action: 'missing' })).toThrowError(
      expect.objectContaining({
        code: 'runtime-operation-failed',
        stage: 'control',
        availableActions: ['jump'],
      }),
    )
    game.dispose()
  })

  it('inspects stable entity identity, transforms, stats and public component state', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.stats.set('zeta', 2)
    game.stats.set('alpha', 1)
    const entity = game.spawn('Duplicate')
    entity.position.set(2, 3, 4)
    entity.node.rotation.set(0.1, 0.2, 0.3, 'ZYX')
    entity.scale.set(2, 2, 1)
    entity.add(SnapshotProbe)
    game.start()
    const bridge = registered[0]!

    const first = bridge.inspect()
    const second = bridge.inspect()

    expect(Object.keys(first.stats)).toEqual(['alpha', 'zeta'])
    expect(first).toMatchObject({
      bridgeVersion: 1,
      mode: 'paused',
      frame: 0,
      simulationTime: 0,
      stats: { alpha: 1, zeta: 2 },
      projectionIssues: [],
      entities: [
        {
          id: expect.any(String),
          name: 'Duplicate',
          transform: {
            position: { x: 2, y: 3, z: 4 },
            rotation: { x: 0.1, y: 0.2, z: 0.3, order: 'ZYX' },
            scale: { x: 2, y: 2, z: 1 },
          },
          components: [
            {
              type: 'SnapshotProbe',
              index: 0,
              state: { label: 'ready', score: 7 },
            },
          ],
        },
      ],
    })
    expect(second.entities[0]?.id).toBe(first.entities[0]?.id)
    game.dispose()
  })

  it('reports logical transform positions for projected scenes', () => {
    const { registered } = installActivation()
    const game = makeGame()
    loadScene(
      game,
      {
        waicaScene: 3,
        render: { projection: 'isometric' },
        entities: [{ name: 'Logical', position: [2, 1] }],
      },
      { components: {} },
    )

    game.start()

    expect(game.find('Logical')!.node.position.toArray()).toEqual([1, -1.5, 0])
    expect(registered[0]!.inspect().entities[0]?.transform.position).toEqual({
      x: 2,
      y: 1,
      z: 0,
    })
    game.dispose()
  })

  it('filters without changing live order and never reuses destroyed ids', () => {
    const { registered } = installActivation()
    const game = makeGame()
    const first = game.spawn('Duplicate')
    first.add(SnapshotProbe)
    const second = game.spawn('Duplicate')
    second.add(PassiveProbe)
    const third = game.spawn('Other')
    third.add(SnapshotProbe)
    third.add(PassiveProbe)
    game.start()
    const bridge = registered[0]!
    const baseline = bridge.inspect()
    const [firstId, secondId, thirdId] = baseline.entities.map(({ id }) => id)

    expect(
      bridge.inspect({ entity_names: ['Duplicate'], component_types: ['SnapshotProbe'] }).entities
        .map(({ id }) => id),
    ).toEqual([firstId])
    expect(
      bridge.inspect({ entity_ids: [secondId!], entity_names: ['Other'] }).entities,
    ).toEqual([])
    expect(
      bridge.inspect({
        entity_ids: [firstId!, thirdId!],
        component_types: ['PassiveProbe', 'SnapshotProbe'],
      }).entities.map(({ id, components }) => ({
        id,
        components: components.map(({ type }) => type),
      })),
    ).toEqual([
      { id: firstId, components: ['SnapshotProbe'] },
      { id: thirdId, components: ['SnapshotProbe', 'PassiveProbe'] },
    ])

    first.destroy()
    const replacement = game.spawn('Duplicate')
    replacement.add(SnapshotProbe)
    const after = bridge.inspect()
    expect(after.entities.map(({ id }) => id)).toEqual([secondId, thirdId, expect.any(String)])
    expect(after.entities[2]?.id).not.toBe(firstId)
    game.dispose()
  })

  it('discovers safe state and turns getter or override failures into markers', () => {
    const { registered } = installActivation()
    const game = makeGame()
    const entity = game.spawn('Projection')
    entity.add(DiscoveryProbe)
    entity.add(OverrideProbe)
    entity.add(ThrowingOverrideProbe)
    game.start()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.entities[0]?.components.map(({ state }) => state)).toEqual([
      {
        broken: { $waica: 'error', message: 'getter boom' },
        runtimeOnly: 9,
        speed: 3,
        visible: 1,
      },
      { custom: 42 },
      { $waica: 'error', message: 'override boom' },
    ])
    expect(snapshot.projectionIssues).toEqual([
      { path: 'entities[entity-1].components[0].state.broken', marker: 'error' },
      { path: 'entities[entity-1].components[2].state', marker: 'error' },
    ])
    game.dispose()
  })

  it('projects typed values and markers without invoking toJSON', () => {
    const { registered } = installActivation()
    const game = makeGame()
    const probe = game.spawn('Typed').add(TypedProjectionProbe)
    game.start()

    const snapshot = registered[0]!.inspect()
    const state = snapshot.entities[0]?.components[0]?.state

    expect(state).toEqual({
      big: { $waica: 'bigint', value: '12' },
      cycle: {
        label: 'cycle',
        self: {
          $waica: 'cycle',
          path: 'entities[entity-1].components[0].state.cycle',
        },
      },
      date: { $waica: 'date', value: '2026-08-07T12:34:56.000Z' },
      map: { $waica: 'map', entries: [['key', 4]] },
      nan: { $waica: 'unsupported', type: 'non-finite-number' },
      set: { $waica: 'set', values: ['a', 2] },
      toJson: {
        toJSON: { $waica: 'unsupported', type: 'function' },
        value: 3,
      },
      undefined: { $waica: 'unsupported', type: 'undefined' },
    })
    expect(probe.toJsonCalls).toBe(0)
    expect(snapshot.projectionIssues).toEqual([
      {
        path: 'entities[entity-1].components[0].state.cycle.self',
        marker: 'cycle',
      },
      { path: 'entities[entity-1].components[0].state.nan', marker: 'unsupported' },
      {
        path: 'entities[entity-1].components[0].state.toJson.toJSON',
        marker: 'unsupported',
      },
      { path: 'entities[entity-1].components[0].state.undefined', marker: 'unsupported' },
    ])
    game.dispose()
  })

  it('truncates depth, collection entries and UTF-8 strings at deterministic limits', () => {
    const { registered } = installActivation()
    const game = makeGame()
    const record = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`key-${String(index).padStart(3, '0')}`, index]),
    )
    const deep = { one: { two: { three: { four: { five: { six: 'too deep' } } } } } }
    const probe = game.spawn('Limits').add(ConfigurableProjectionProbe)
    probe.state = {
      array: Array.from({ length: 101 }, (_, index) => index),
      deep,
      long: 'x'.repeat(4_097),
      map: new Map(Object.entries(record)),
      record,
      set: new Set(Array.from({ length: 101 }, (_, index) => index)),
    }
    game.start()

    const snapshot = registered[0]!.inspect()
    const state = snapshot.entities[0]?.components[0]?.state as Record<string, unknown>

    expect(state.long).toEqual({
      $waica: 'truncated',
      reason: 'string',
      preview: 'x'.repeat(4_096),
      originalLength: 4_097,
      originalBytes: 4_097,
    })
    expect(state.array).toEqual([
      ...Array.from({ length: 100 }, (_, index) => index),
      { $waica: 'truncated', reason: 'entries', omitted: 1 },
    ])
    expect(state.record).toMatchObject({
      $waica: 'truncated',
      reason: 'entries',
      omitted: 1,
      value: expect.objectContaining({ 'key-000': 0, 'key-099': 99 }),
    })
    expect(state.deep).toMatchObject({
      one: { two: { three: { four: { five: { $waica: 'truncated', reason: 'depth' } } } } },
    })
    expect(state.map).toMatchObject({
      $waica: 'map',
      entries: expect.arrayContaining([['key-000', 0], ['key-099', 99]]),
      truncated: { $waica: 'truncated', reason: 'entries', omitted: 1 },
    })
    expect(state.set).toMatchObject({
      $waica: 'set',
      values: expect.arrayContaining([0, 99]),
      truncated: { $waica: 'truncated', reason: 'entries', omitted: 1 },
    })
    expect(snapshot.projectionIssues.map(({ path, marker }) => ({ path, marker }))).toEqual([
      { path: 'entities[entity-1].components[0].state.array', marker: 'truncated' },
      {
        path: 'entities[entity-1].components[0].state.deep.one.two.three.four.five',
        marker: 'truncated',
      },
      { path: 'entities[entity-1].components[0].state.long', marker: 'truncated' },
      { path: 'entities[entity-1].components[0].state.map', marker: 'truncated' },
      { path: 'entities[entity-1].components[0].state.record', marker: 'truncated' },
      { path: 'entities[entity-1].components[0].state.set', marker: 'truncated' },
    ])
    game.dispose()
  })

  it('caps each serialized component state at 64 KiB', () => {
    const { registered } = installActivation()
    const game = makeGame()
    const entity = game.spawn('Component cap')
    const within = entity.add(ConfigurableProjectionProbe)
    within.state = Object.fromEntries(
      Array.from({ length: 15 }, (_, index) => [`field-${index}`, 'x'.repeat(4_096)]),
    )
    const over = entity.add(ConfigurableProjectionProbe)
    over.state = Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => [`field-${index}`, 'x'.repeat(4_096)]),
    )
    game.start()

    const snapshot = registered[0]!.inspect()
    const [withinState, overState] = snapshot.entities[0]!.components.map(({ state }) => state)

    expect(withinState).not.toHaveProperty('$waica')
    expect(overState).toMatchObject({
      $waica: 'truncated',
      reason: 'component-size',
      limit: 65_536,
      path: 'entities[entity-1].components[1].state',
      originalBytes: expect.any(Number),
    })
    expect((overState as { originalBytes: number }).originalBytes).toBeGreaterThan(65_536)
    expect(snapshot.projectionIssues).toContainEqual({
      path: 'entities[entity-1].components[1].state',
      marker: 'truncated',
    })
    game.dispose()
  })

  it('caps the serialized snapshot at 1 MiB and reports omitted entities', () => {
    const { registered } = installActivation()
    const game = makeGame()
    for (let entityIndex = 0; entityIndex < 18; entityIndex += 1) {
      const probe = game.spawn(`Large-${entityIndex}`).add(ConfigurableProjectionProbe)
      probe.state = Object.fromEntries(
        Array.from({ length: 15 }, (_, fieldIndex) => [
          `field-${fieldIndex}`,
          String(entityIndex).padEnd(4_096, 'x'),
        ]),
      )
    }
    game.start()

    const snapshot = registered[0]!.inspect()
    const serializedBytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength
    const truncation = snapshot.projectionIssues.at(-1)

    expect(serializedBytes).toBeLessThanOrEqual(1_048_576)
    expect(snapshot.entities.length).toBeGreaterThan(0)
    expect(snapshot.entities.length).toBeLessThan(18)
    expect(snapshot.entities.map(({ name }) => name)).toEqual(
      Array.from({ length: snapshot.entities.length }, (_, index) => `Large-${index}`),
    )
    expect(truncation).toMatchObject({
      path: `entities[${snapshot.entities.length}]`,
      marker: 'truncated',
      omitted: 18 - snapshot.entities.length,
    })
    game.dispose()
  })
})

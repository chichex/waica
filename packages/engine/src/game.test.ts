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

import { Component } from './component'
import { Hitbox } from './components/hitbox'
import type { Entity } from './entity'
import { Game } from './game'
import { loadScene, type SceneRegistry } from './scene'
import { defineStates, resetRegistries } from './state/hooks'
import { StateMachine } from './state/state-machine'

const observers: ResizeObserverStub[] = []

class ResizeObserverStub {
  readonly disconnect = vi.fn()
  constructor() {
    observers.push(this)
  }
  observe(): void {}
}

class VelocityProbe extends Component {
  vx = 5
}

class CollisionProbe extends Component {
  readonly hits: Entity[] = []
  override onCollide(other: Entity): void {
    this.hits.push(other)
  }
}

class PrefabProbe extends Component {
  static override componentName = 'PrefabProbe'
  texture = ''
  amount = 0
}

/** Stands in for project code that throws where the engine constructs it. */
class ThrowingProbe extends Component {
  static override componentName = 'ThrowingProbe'
  constructor() {
    super()
    throw new Error('ctor boom')
  }
}

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas })
}

beforeEach(() => {
  observers.length = 0
  document.body.innerHTML = ''
  resetRegistries()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Game glue characterization', () => {
  it('discovers camera velocity through the mover component vx seam', () => {
    const game = makeGame()
    const target = game.spawn('Player')
    target.add(VelocityProbe)
    game.setSceneCamera({ follow: 'Player', lookahead: 2, smoothing: 20 })

    ;(game as unknown as { updateSceneCamera(dt: number): void }).updateSceneCamera(0.1)

    expect(game.camera.position.x).toBeGreaterThan(target.position.x)
    game.dispose()
  })

  it('dispatches an overlap to components on both live entities', () => {
    const game = makeGame()
    const first = game.spawn('First')
    const second = game.spawn('Second')
    first.add(Hitbox)
    second.add(Hitbox)
    const firstProbe = first.add(CollisionProbe)
    const secondProbe = second.add(CollisionProbe)

    ;(game as unknown as { dispatchCollisions(): void }).dispatchCollisions()

    expect(firstProbe.hits).toEqual([second])
    expect(secondProbe.hits).toEqual([first])
    game.dispose()
  })

  it('bridges a Hitbox overlap into the current state and wildcard collision hooks', () => {
    const calls: Array<{ phase: string; entity: Entity; other: Entity; fsm: StateMachine }> = []
    defineStates('collision-probe', {
      '*': {
        onCollide(ctx, other) {
          calls.push({ phase: 'wildcard', entity: ctx.entity, other, fsm: ctx.fsm })
        },
      },
      active: {
        onCollide(ctx, other) {
          calls.push({ phase: 'current', entity: ctx.entity, other, fsm: ctx.fsm })
        },
      },
    })
    const game = makeGame()
    const first = game.spawn('First')
    const second = game.spawn('Second')
    first.add(Hitbox)
    second.add(Hitbox)
    const machine = first.add(StateMachine, {
      role: 'collision-probe',
      initial: 'active',
      states: { active: {} },
    })

    ;(game as unknown as { dispatchCollisions(): void }).dispatchCollisions()

    expect(calls).toEqual([
      { phase: 'wildcard', entity: first, other: second, fsm: machine },
      { phase: 'current', entity: first, other: second, fsm: machine },
    ])
    game.dispose()
  })

  it('spawns a retained prefab with resolved assets, position and per-name param overrides', () => {
    const game = makeGame()
    const registry: SceneRegistry = {
      components: { PrefabProbe },
      prefabs: {
        'objects/coin': {
          waicaPrefab: 1,
          type: 'object',
          components: [{ type: 'PrefabProbe', props: { texture: 'waica:coin', amount: 1 } }],
        },
      },
      resolveAsset: (uri) => (uri === 'waica:coin' ? '/coin.png' : uri),
    }
    game.paramOverrides = { RuntimeCoin: { PrefabProbe: { amount: 9 } } }
    loadScene(game, { waicaScene: 3, entities: [] }, registry)

    const spawned = game.spawnPrefab('objects/coin', {
      name: 'RuntimeCoin',
      position: [3, 4],
    })

    expect(game.registry).toBe(registry)
    expect(spawned?.position.toArray()).toEqual([3, 4, 0])
    expect(spawned?.get(PrefabProbe)).toMatchObject({ texture: '/coin.png', amount: 9 })
    expect(game.entities).toContain(spawned)
    game.dispose()
  })

  it('warns and returns null when runtime prefab spawning has no matching registry entry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = makeGame()

    expect(game.spawnPrefab('objects/missing')).toBeNull()
    loadScene(game, { waicaScene: 3, entities: [] }, { components: {}, prefabs: {} })
    expect(game.spawnPrefab('objects/missing')).toBeNull()

    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0]?.[0]).toContain('before loadScene')
    expect(warn.mock.calls[1]?.[0]).toContain('objects/missing')
    warn.mockRestore()
    game.dispose()
  })

  it('reports a throwing project component and keeps loading the rest of the scene', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const game = makeGame()

    loadScene(
      game,
      {
        waicaScene: 3,
        entities: [
          { name: 'Broken', components: [{ type: 'ThrowingProbe' }, { type: 'PrefabProbe' }] },
          { name: 'Later', components: [{ type: 'PrefabProbe' }] },
        ],
      },
      { components: { ThrowingProbe, PrefabProbe } },
    )

    // The broken component is the only casualty: its siblings, its entity and
    // every later entity still load.
    expect(game.find('Broken')?.get(ThrowingProbe)).toBeUndefined()
    expect(game.find('Broken')?.get(PrefabProbe)).toBeDefined()
    expect(game.find('Later')?.get(PrefabProbe)).toBeDefined()
    expect(error).toHaveBeenCalledOnce()
    expect(error.mock.calls[0]?.[0]).toContain('ThrowingProbe')
    error.mockRestore()
    game.dispose()
  })

  it('reads prototype keys as missing rather than as Object members', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = makeGame()

    loadScene(
      game,
      { waicaScene: 3, entities: [{ name: 'Odd', components: [{ type: 'toString' }] }] },
      { components: {}, prefabs: {} },
    )

    expect(game.spawnPrefab('constructor')).toBeNull()
    expect(game.find('Odd')?.components).toEqual([])
    expect(warn.mock.calls.some((call) => String(call[0]).includes('toString'))).toBe(true)
    warn.mockRestore()
    game.dispose()
  })

  it('disconnects the constructor ResizeObserver on dispose', () => {
    const game = makeGame()
    const observer = observers[0]

    game.dispose()

    expect(observer?.disconnect).toHaveBeenCalledOnce()
  })
})

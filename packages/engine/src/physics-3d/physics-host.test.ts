// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Component } from '../component.js'
import { RUNTIME_BRIDGE_SYMBOL, type RuntimeBridgeActivation, type RuntimeBridgeFailure } from '../runtime-bridge.js'
import { loadScene } from '../scene.js'
import { match } from '../test-support.js'
import { ready3dGame, registryOf, scene3d, use3dTestEnvironment } from '../test-game-3d.js'
import { crate, FLOOR, physicsFixture, worldOf } from '../test-physics-3d.js'
import { Collider } from '../components/collider.js'
import { loadRapier, type RapierModule } from './rapier-module.js'

use3dTestEnvironment()

afterEach(() => {
  Reflect.deleteProperty(globalThis, RUNTIME_BRIDGE_SYMBOL)
  vi.restoreAllMocks()
})

/** A backend the test releases by hand, to hold the module "loading". */
function heldBackend(): { backend: () => Promise<RapierModule>; calls: () => number; release: () => Promise<void> } {
  let resolve: (module: RapierModule) => void = () => {}
  const promise = new Promise<RapierModule>((done) => {
    resolve = done
  })
  let count = 0
  return {
    backend: () => {
      count += 1
      return promise
    },
    calls: () => count,
    release: async () => {
      resolve(await loadRapier())
      await promise
    },
  }
}

class Ticker extends Component {
  static override componentName = 'Ticker'
  static ticks = 0
  override onUpdate(): void {
    Ticker.ticks += 1
  }
}

const TWO_D_SCENE = { waicaScene: 3 as const, entities: [{ name: 'Lone' }] }

describe('the physics module is loaded by a 3D scene only (CA-8)', () => {
  it('never touches the backend for a 2D scene and leaves the asset counters alone', async () => {
    const backend = vi.fn(loadRapier)
    const { game } = await ready3dGame(undefined, undefined, { physics: backend })

    loadScene(game, TWO_D_SCENE, registryOf({}))
    await game.assets.ready()
    await game.ready()

    expect(backend).not.toHaveBeenCalled()
    expect(game.assets.status).toEqual({ pending: 0, loaded: 0, failed: 0 })
    expect(game.physics.world).toBeNull()
  })

  it('counts the load as one pending asset, so Assets Ready waits for it', async () => {
    const held = heldBackend()
    const { game } = await ready3dGame(undefined, undefined, { physics: held.backend })

    loadScene(game, scene3d([FLOOR]), registryOf({ Collider }))
    expect(game.assets.status).toEqual({ pending: 1, loaded: 0, failed: 0 })
    let ready = false
    const assetsReady = game.assets.ready().then(() => {
      ready = true
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(ready).toBe(false)

    await held.release()
    await assetsReady

    expect(ready).toBe(true)
    expect(game.assets.status).toEqual({ pending: 0, loaded: 1, failed: 0 })
    expect(game.physics.state).toBe('ready')
  })
})

describe('the physics module readiness (CA-8)', () => {
  it('resolves game.ready() of a Game whose live scene is 3D only after the module is ready', async () => {
    const held = heldBackend()
    const { game } = await ready3dGame(undefined, undefined, { physics: held.backend })
    loadScene(game, scene3d([]), registryOf({}))

    let settled = false
    const ready = game.ready().then(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(settled).toBe(false)

    await held.release()
    await ready

    expect(settled).toBe(true)
  })

  it('loads once per Game: a second 3D scene reuses the module and gets its world at once', async () => {
    const held = heldBackend()
    const { game } = await ready3dGame(undefined, undefined, { physics: held.backend })
    loadScene(game, scene3d([FLOOR]), registryOf({ Collider }))
    await held.release()
    await game.assets.ready()

    loadScene(game, scene3d([FLOOR]), registryOf({ Collider }))

    expect(held.calls()).toBe(1)
    expect(game.physics.world).not.toBeNull()
    expect(game.assets.status.pending).toBe(0)
  })
})

describe('the physics module failing to load (CA-8)', () => {
  it('records a failed load as a failed asset, rejects game.ready() naming the package and tells the bridge', async () => {
    const failures: RuntimeBridgeFailure[] = []
    const activation: RuntimeBridgeActivation = {
      protocolVersion: 1,
      register: () => {},
      unregister: () => {},
      fail: (failure) => failures.push(failure),
    }
    Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, { configurable: true, value: activation })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game } = await ready3dGame(undefined, undefined, { physics: () => Promise.reject(new Error('wasm blocked')) })
    Ticker.ticks = 0

    loadScene(game, scene3d([{ name: 'Ticker', components: [{ type: 'Ticker' }] }]), registryOf({ Ticker }))
    await game.assets.ready()

    expect(game.assets.status).toEqual({ pending: 0, loaded: 0, failed: 1 })
    await expect(game.ready()).rejects.toThrow(/@dimforge\/rapier3d-deterministic-compat/)
    expect(failures).toEqual([
      { code: 'physics-backend-failed', message: match.stringContaining('@dimforge/rapier3d-deterministic-compat') },
    ])
    expect(game.physics.state).toBe('failed')
    expect(game.physics.world).toBeNull()
  })
})

describe('steps taken before the world exists lose nothing (CA-9)', () => {
  it('runs every component update while the module loads, then creates the bodies in entity order', async () => {
    const held = heldBackend()
    const { game, step, snapshot } = await physicsFixture([FLOOR, crate('Crate', 5), { name: 'Ticker', components: [{ type: 'Ticker' }] }], {
      components: { Ticker },
      game: { physics: held.backend },
      settle: false,
    })
    Ticker.ticks = 0

    step(10)

    expect(Ticker.ticks).toBe(10)
    expect(game.find('Crate')?.position.y).toBe(5)
    expect(snapshot().physics).toMatchObject({ state: 'loading', bodies: [] })

    await held.release()
    await game.assets.ready()

    expect(snapshot().physics?.state).toBe('ready')
    expect(snapshot().physics?.bodies.map((body) => body.entity)).toEqual(['Floor', 'Crate'])
    step(10)
    expect(Ticker.ticks).toBe(20)
    expect(game.find('Crate')?.position.y).toBeLessThan(5)
  })
})

describe('one world per live 3D scene (CA-10)', () => {
  it('is created with the scene at the fixed step and the scene gravity', async () => {
    const { game } = await physicsFixture([FLOOR], { simulation: { gravity: [0, -1.62, 0] } })

    const world = game.physics.world
    // Rapier keeps the timestep as an f32.
    expect(world?.raw.timestep).toBe(Math.fround(1 / 60))
    expect(world?.gravity).toEqual([0, -1.62, 0])
  })

  it('defaults to earth gravity when the scene declares no simulation', async () => {
    const { game } = await physicsFixture([FLOOR])

    expect(game.physics.world?.gravity).toEqual([0, -9.81, 0])
  })
})

describe('world lifetime (CA-10)', () => {
  it('frees the world after the entities are destroyed, and again has none for a 2D scene loaded after', async () => {
    const { game, registry } = await physicsFixture([FLOOR, crate('Crate', 2)])
    const world = worldOf(game)
    const order: string[] = []
    vi.spyOn(world.raw, 'removeRigidBody').mockImplementation(() => {
      order.push('removeRigidBody')
    })
    vi.spyOn(world.raw, 'free').mockImplementation(() => {
      order.push('free')
    })

    loadScene(game, TWO_D_SCENE, registry)

    expect(order).toEqual(['removeRigidBody', 'removeRigidBody', 'free'])
    expect(game.physics.world).toBeNull()
  })

  it('frees the world on dispose', async () => {
    const { game } = await physicsFixture([FLOOR])
    const free = vi.spyOn(worldOf(game).raw, 'free')

    game.dispose()

    expect(free).toHaveBeenCalledTimes(1)
    expect(game.physics.world).toBeNull()
  })

  it('takes one world.step() per Simulation Step, after the components and before the triggers', async () => {
    const { game, step } = await physicsFixture([FLOOR, crate('Crate', 3), { name: 'Ticker', components: [{ type: 'Ticker' }] }], {
      components: { Ticker },
    })
    const calls: string[] = []
    vi.spyOn(worldOf(game).raw, 'step').mockImplementation(() => {
      calls.push('step')
    })
    Ticker.ticks = 0
    game.onUpdate(() => calls.push('host'))

    step(3)

    expect(calls).toEqual(['step', 'host', 'step', 'host', 'step', 'host'])
    expect(Ticker.ticks).toBe(3)
  })
})

describe('physics keeps its component updates in the schedule (CA-10)', () => {
  it('lets a component read last step\'s body pose, not the one being computed', async () => {
    const seen: number[] = []
    class Probe extends Component {
      static override componentName = 'Probe'
      override onUpdate(): void {
        seen.push(this.entity.position.y)
      }
    }
    const { game, step } = await physicsFixture(
      [FLOOR, { name: 'Crate', position: [0, 5, 0], components: [{ type: 'Collider' }, { type: 'RigidBody' }, { type: 'Probe' }] }],
      { components: { Probe } },
    )

    step(1)
    const afterOne = game.find('Crate')?.position.y
    step(1)

    expect(seen[0]).toBe(5)
    expect(seen[1]).toBe(afterOne)
    expect(afterOne).toBeLessThan(5)
  })
})

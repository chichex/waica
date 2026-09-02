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

import type { CameraVelocity, CameraVelocityProvider } from './camera'
import { Component, type SolidContact } from './component'
import { DynamicBody } from './components/dynamic-body'
import { Hitbox } from './components/hitbox'
import { Solid } from './components/solid'
import { Sprite } from './components/sprite'
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

class VelocityProviderProbe extends Component implements CameraVelocityProvider {
  vx = 5
  vy = 5
  getCameraVelocity(): CameraVelocity {
    return { vx: this.vx, vy: this.vy }
  }
}

/** The pre-provider duck shape: a bare vx field with no provider method. */
class BareVxProbe extends Component {
  vx = 5
}

class CollisionProbe extends Component {
  readonly hits: Entity[] = []
  override onCollide(other: Entity): void {
    this.hits.push(other)
  }
}

class PhysicalAndTriggerProbe extends CollisionProbe {
  readonly contacts: SolidContact[] = []

  override onContact(contact: SolidContact): void {
    this.contacts.push(contact)
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
  it('keeps logical and render position as the same Vector3 in an unprojected scene', () => {
    const game = makeGame()
    loadScene(
      game,
      { waicaScene: 3, entities: [{ name: 'Pinned', position: [2, -3] }] },
      { components: {} },
    )
    const entity = game.find('Pinned')!

    expect(entity.position).toBe(entity.node.position)
    expect(entity.position.toArray()).toEqual([2, -3, 0])

    game.dispose()
  })

  it('discovers camera velocity through the CameraVelocityProvider seam', () => {
    const game = makeGame()
    const target = game.spawn('Player')
    target.add(VelocityProviderProbe)
    game.setSceneCamera({ follow: 'Player', lookahead: 2, smoothing: 20 })

    ;(game as unknown as { updateSceneCamera(dt: number): void }).updateSceneCamera(0.1)

    expect(game.camera.position.x).toBeGreaterThan(target.position.x)
    game.dispose()
  })

  it('feeds provider vy into the vertical lookahead', () => {
    const game = makeGame()
    const target = game.spawn('Player')
    target.add(VelocityProviderProbe)
    game.setSceneCamera({ follow: 'Player', lookaheadY: 2, smoothing: 20 })

    ;(game as unknown as { updateSceneCamera(dt: number): void }).updateSceneCamera(0.1)

    expect(game.camera.position.y).toBeGreaterThan(target.position.y)
    game.dispose()
  })

  it('ignores a component that only exposes a bare vx field', () => {
    const game = makeGame()
    game.spawn('Player').add(BareVxProbe)
    game.setSceneCamera({ follow: 'Player', lookahead: 2, smoothing: 20 })

    ;(game as unknown as { updateSceneCamera(dt: number): void }).updateSceneCamera(0.1)

    // Target and camera both sit at the origin: any drift could only come
    // from lookahead, which must not fire off the retired duck-typed seam.
    expect(game.camera.position.x).toBe(0)
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

  it('keeps DynamicBody contacts independent from Hitbox trigger overlaps (CA-6)', () => {
    const game = makeGame()
    const mover = game.spawn('Mover')
    mover.add(Hitbox)
    const body = mover.add(DynamicBody, { vx: 10 })
    const probe = mover.add(PhysicalAndTriggerProbe)
    const wall = game.spawn('Wall')
    wall.position.x = 1
    wall.add(Solid, { width: 0.5, height: 2 })
    const trigger = game.spawn('Trigger')
    trigger.position.x = 0.25
    trigger.add(Hitbox)

    body.onUpdate(0.1)

    expect(probe.contacts).toHaveLength(1)
    expect(probe.contacts[0]).toMatchObject({ entity: wall, solid: wall.get(Solid), axis: 'x' })
    expect(probe.hits).toEqual([])

    ;(game as unknown as { dispatchCollisions(): void }).dispatchCollisions()

    expect(probe.contacts).toHaveLength(1)
    expect(probe.hits).toEqual([trigger])
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

  it('constructs DynamicBody from prefab JSON and applies every supported property (CA-8)', () => {
    const game = makeGame()
    const points = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0, 0.5],
    ]
    loadScene(
      game,
      {
        waicaScene: 3,
        entities: [{ name: 'Mover', prefab: 'objects/mover' }],
      },
      {
        components: { DynamicBody },
        prefabs: {
          'objects/mover': {
            waicaPrefab: 1,
            type: 'object',
            components: [
              {
                type: 'DynamicBody',
                props: {
                  vx: 4,
                  vy: -2,
                  shape: 'polygon',
                  width: 2,
                  height: 3,
                  offsetX: 0.25,
                  offsetY: -0.5,
                  points,
                },
              },
            ],
          },
        },
      },
    )

    expect(game.find('Mover')?.get(DynamicBody)).toMatchObject({
      vx: 4,
      vy: -2,
      shape: 'polygon',
      width: 2,
      height: 3,
      offsetX: 0.25,
      offsetY: -0.5,
      points,
    })
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

describe('y-sort render mode', () => {
  const meshZ = (game: Game, name: string): number => {
    const entity = game.entities.find((e) => e.name === name)!
    return (entity.node.children[0] as { position: { z: number } }).position.z
  }

  const step = (game: Game): void => {
    ;(game as unknown as { runFrame(dt: number): void }).runFrame(1 / 60)
  }

  const spriteAt = (name: string, y: number, layer: number, props = {}) => ({
    name,
    position: [0, y] as [number, number],
    components: [{ type: 'Sprite', props: { layer, ...props } }],
  })

  const registry: SceneRegistry = { components: { Sprite } }

  it('keeps the exact layer-only z for scenes without a render block', () => {
    const game = makeGame()
    loadScene(
      game,
      { waicaScene: 3, entities: [spriteAt('A', 2, 1), spriteAt('B', -2, 1)] },
      registry,
    )
    step(game)
    expect(meshZ(game, 'A')).toBe(0.01)
    expect(meshZ(game, 'B')).toBe(0.01)
    game.dispose()
  })

  it('orders same-layer sprites by world Y and flips on crossing', () => {
    const game = makeGame()
    loadScene(
      game,
      {
        waicaScene: 3,
        render: { sort: 'y' },
        entities: [spriteAt('A', 2, 0), spriteAt('B', -2, 0)],
      },
      registry,
    )
    step(game)
    // Lower Y renders in front: B (y -2) above A (y 2).
    expect(meshZ(game, 'B')).toBeGreaterThan(meshZ(game, 'A'))

    game.entities.find((e) => e.name === 'A')!.position.y = -5
    step(game)
    expect(meshZ(game, 'A')).toBeGreaterThan(meshZ(game, 'B'))
    game.dispose()
  })

  it('keeps a higher layer in front regardless of Y', () => {
    const game = makeGame()
    loadScene(
      game,
      {
        waicaScene: 3,
        render: { sort: 'y' },
        entities: [spriteAt('Front', 10, 2), spriteAt('Back', -10, 1)],
      },
      registry,
    )
    step(game)
    expect(meshZ(game, 'Front')).toBeGreaterThan(meshZ(game, 'Back'))
    game.dispose()
  })

  it('sorts on entity Y: a sprite offsetY does not shift the key', () => {
    const game = makeGame()
    loadScene(
      game,
      {
        waicaScene: 3,
        render: { sort: 'y' },
        entities: [spriteAt('Offset', 0, 0, { offsetY: -10 }), spriteAt('Lower', -1, 0)],
      },
      registry,
    )
    step(game)
    // Entity Y decides: Lower (y -1) in front of Offset (y 0), however far
    // the offset visually drops the Offset quad.
    expect(meshZ(game, 'Lower')).toBeGreaterThan(meshZ(game, 'Offset'))
    game.dispose()
  })

  it('does not shift the entity y-sort key for a bottom-anchored sprite', () => {
    const game = makeGame()
    loadScene(
      game,
      {
        waicaScene: 3,
        render: { sort: 'y' },
        entities: [
          spriteAt('Anchored', 0, 0, { height: 4, anchorY: 0 }),
          spriteAt('Lower', -1, 0),
        ],
      },
      registry,
    )

    step(game)

    expect(meshZ(game, 'Lower')).toBeGreaterThan(meshZ(game, 'Anchored'))
    game.dispose()
  })

  it('sorts any component that opts into the y-sort seam, not just stock sprites', () => {
    class DepthMarker extends Component {
      static override componentName = 'DepthMarker'
      layer = 0
      sortZ: number | null = null
      setSortZ(z: number): void {
        this.sortZ = z
      }
    }
    const game = makeGame()
    loadScene(
      game,
      {
        waicaScene: 3,
        render: { sort: 'y' },
        entities: [
          spriteAt('Above', 2, 0),
          { name: 'Marker', position: [0, -2], components: [{ type: 'DepthMarker' }] },
        ],
      },
      { components: { Sprite, DepthMarker } },
    )
    step(game)
    const marker = game.entities.find((e) => e.name === 'Marker')!.get(DepthMarker)!
    // The marker shares the band with the sprite: lower Y sorts in front.
    expect(marker.sortZ).not.toBeNull()
    expect(marker.sortZ!).toBeGreaterThan(meshZ(game, 'Above'))
    game.dispose()
  })
})

describe('Scene unload and swap', () => {
  const step = (game: Game): void => {
    ;(game as unknown as { runFrame(dt: number): void }).runFrame(1 / 60)
  }

  it('destroys every entity through Entity.destroy(), splicing entities in place (CA-1)', () => {
    class TrackDestroy extends Component {
      static override componentName = 'TrackDestroy'
      override onDestroy(): void {
        destroyed.push(this.entity.name)
      }
    }
    const destroyed: string[] = []
    const game = makeGame()
    loadScene(
      game,
      {
        waicaScene: 3,
        entities: [
          { name: 'A', components: [{ type: 'TrackDestroy' }] },
          { name: 'B', components: [{ type: 'TrackDestroy' }] },
        ],
      },
      { components: { TrackDestroy } },
    )
    const entitiesRef = game.entities

    game.unloadScene()

    expect(destroyed.sort()).toEqual(['A', 'B'])
    expect(game.entities).toEqual([])
    // Spliced in place: the Pointer holds this exact array by reference.
    expect(game.entities).toBe(entitiesRef)
    game.dispose()
  })

  it('leaves the Game as newly constructed, keeping session-scoped state (CA-2)', () => {
    const game = makeGame()
    game.paramOverrides = { Foo: { Bar: { x: 1 } } }
    game.stats.set('score', 5)
    loadScene(
      game,
      {
        waicaScene: 3,
        render: { sort: 'y', projection: 'isometric' },
        camera: { position: [0, 0], zoom: 6 },
        entities: [{ name: 'P' }],
      },
      { components: {} },
    )
    expect(game.registry).not.toBeNull()
    expect(game.projection).toBe('isometric')
    expect(game.view).toBe(6)

    game.unloadScene()

    expect(game.registry).toBeNull()
    expect(game.projection).toBeNull()
    expect(game.view).toBe(10)
    // Session-scoped: unaffected by the unload.
    expect(game.paramOverrides).toEqual({ Foo: { Bar: { x: 1 } } })
    expect(game.stats.get('score')).toBe(5)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(game.spawnPrefab('anything')).toBeNull()
    expect(warn.mock.calls[0]?.[0]).toContain('before loadScene')
    warn.mockRestore()

    // y-sort is off: a reload without render.sort renders flat (layer-only z).
    loadScene(
      game,
      {
        waicaScene: 3,
        entities: [
          { name: 'X', position: [0, 5], components: [{ type: 'Sprite', props: { layer: 1 } }] },
          { name: 'Y', position: [0, -5], components: [{ type: 'Sprite', props: { layer: 1 } }] },
        ],
      },
      { components: { Sprite } },
    )
    step(game)
    const meshZ = (name: string): number =>
      (game.find(name)!.node.children[0] as { position: { z: number } }).position.z
    expect(meshZ('X')).toBe(0.01)
    expect(meshZ('Y')).toBe(0.01)

    game.dispose()
  })

  it('keeps event and onUpdate subscriptions across a swap, firing exactly once (CA-4)', () => {
    const game = makeGame()
    loadScene(game, { waicaScene: 3, entities: [] }, { components: {} })
    const events: number[] = []
    const updates: number[] = []
    game.events.on('ping', () => events.push(1))
    game.onUpdate(() => updates.push(1))

    loadScene(game, { waicaScene: 3, entities: [] }, { components: {} })
    game.events.emit('ping')
    step(game)

    expect(events).toEqual([1])
    expect(updates).toEqual([1])
    game.dispose()
  })

  it('restores the constructor viewHeight with no camera block, and frames a later block (CA-6)', () => {
    const game = makeGame()
    loadScene(
      game,
      { waicaScene: 3, camera: { position: [0, 0], zoom: 6 }, entities: [] },
      { components: {} },
    )
    expect(game.view).toBe(6)

    loadScene(game, { waicaScene: 3, entities: [] }, { components: {} })
    expect(game.view).toBe(10)

    loadScene(
      game,
      { waicaScene: 3, camera: { position: [0, 0], zoom: 4 }, entities: [] },
      { components: {} },
    )
    expect(game.view).toBe(4)
    game.dispose()
  })

  it('defers a mid-frame scene swap to the next frame (CA-7)', () => {
    const game = makeGame()
    class SwapOnCollide extends Component {
      static override componentName = 'SwapOnCollide'
      override onCollide(): void {
        game.loadSceneByName('next')
      }
    }
    game.registerSceneCatalog({
      scenes: { next: { waicaScene: 3, entities: [{ name: 'Room2' }] } },
      registry: { components: { Hitbox, SwapOnCollide } },
    })
    loadScene(
      game,
      {
        waicaScene: 3,
        entities: [
          { name: 'A', components: [{ type: 'Hitbox' }, { type: 'SwapOnCollide' }] },
          { name: 'B', components: [{ type: 'Hitbox' }] },
        ],
      },
      { components: { Hitbox, SwapOnCollide } },
    )

    step(game) // dispatches the collision: onCollide enqueues the swap
    expect(game.find('A')).toBeDefined()
    expect(game.find('Room2')).toBeUndefined()

    step(game) // flushes the enqueued swap at this frame's start
    expect(game.find('A')).toBeUndefined()
    expect(game.find('Room2')).toBeDefined()
    expect(game.sceneName).toBe('next')
    game.dispose()
  })

  it('resolves loadSceneByName through the registered catalog (CA-8, CA-9)', () => {
    const game = makeGame()
    expect(game.sceneName).toBeNull()
    game.registerSceneCatalog({
      scenes: { cave: { waicaScene: 3, entities: [{ name: 'Torch' }] } },
      registry: { components: {} },
    })
    loadScene(game, { waicaScene: 3, entities: [{ name: 'Player' }] }, { components: {} })

    expect(game.loadSceneByName('cave')).toBe(true)
    expect(game.find('Torch')).toBeDefined()
    expect(game.sceneName).toBe('cave')

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(game.loadSceneByName('nope')).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('nope')
    // Unknown name: no unload, no partial state — the live scene is untouched.
    expect(game.sceneName).toBe('cave')
    expect(game.find('Torch')).toBeDefined()
    warn.mockRestore()
    game.dispose()
  })

  it('lets the first mid-frame swap of a frame win, and says so', () => {
    const game = makeGame()
    const swaps: string[] = []
    class SwapOnCollide extends Component {
      static override componentName = 'SwapOnCollide'
      scene = ''
      override onCollide(): void {
        swaps.push(this.scene)
        game.loadSceneByName(this.scene)
      }
    }
    const components = { Hitbox, SwapOnCollide }
    game.registerSceneCatalog({
      scenes: {
        first: { waicaScene: 3, entities: [{ name: 'First' }] },
        second: { waicaScene: 3, entities: [{ name: 'Second' }] },
      },
      registry: { components },
    })
    // Two doors the player is touching at once: both resolve in the same
    // dispatchCollisions, so both ask for a swap before either can apply.
    loadScene(
      game,
      {
        waicaScene: 3,
        entities: [
          { name: 'Player', components: [{ type: 'Hitbox' }] },
          {
            name: 'DoorA',
            components: [{ type: 'Hitbox' }, { type: 'SwapOnCollide', props: { scene: 'first' } }],
          },
          {
            name: 'DoorB',
            components: [{ type: 'Hitbox' }, { type: 'SwapOnCollide', props: { scene: 'second' } }],
          },
        ],
      },
      { components },
    )

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    step(game)
    expect(swaps.length).toBeGreaterThan(1)
    expect(warn.mock.calls.some((call) => String(call[0]).includes('already queued'))).toBe(true)
    step(game)

    // The first request wins; the loser never silently overrode it.
    expect(game.sceneName).toBe(swaps[0])
    warn.mockRestore()
    game.dispose()
  })

  it('lets an out-of-frame load override a swap queued earlier that frame', () => {
    const game = makeGame()
    class SwapOnCollide extends Component {
      static override componentName = 'SwapOnCollide'
      override onCollide(): void {
        game.loadSceneByName('cave')
      }
    }
    const components = { Hitbox, SwapOnCollide }
    game.registerSceneCatalog({
      scenes: {
        cave: { waicaScene: 3, entities: [{ name: 'Torch' }] },
        town: { waicaScene: 3, entities: [{ name: 'Well' }] },
      },
      registry: { components },
    })
    loadScene(
      game,
      {
        waicaScene: 3,
        entities: [
          { name: 'A', components: [{ type: 'Hitbox' }, { type: 'SwapOnCollide' }] },
          { name: 'B', components: [{ type: 'Hitbox' }] },
        ],
      },
      { components },
    )

    step(game) // a transition queues "cave"
    // Between frames — this is the Runtime Bridge's `scene` operation. It
    // applies now and must not be undone by the queued swap next frame.
    expect(game.loadSceneByName('town')).toBe(true)
    expect(game.sceneName).toBe('town')

    step(game)
    expect(game.sceneName).toBe('town')
    expect(game.find('Well')).toBeDefined()
    expect(game.find('Torch')).toBeUndefined()
    game.dispose()
  })

  it('drops a queued swap when the scene is explicitly unloaded', () => {
    const game = makeGame()
    class SwapOnCollide extends Component {
      static override componentName = 'SwapOnCollide'
      override onCollide(): void {
        game.loadSceneByName('cave')
        game.unloadScene()
      }
    }
    const components = { Hitbox, SwapOnCollide }
    game.registerSceneCatalog({
      scenes: { cave: { waicaScene: 3, entities: [{ name: 'Torch' }] } },
      registry: { components },
    })
    loadScene(
      game,
      {
        waicaScene: 3,
        entities: [
          { name: 'A', components: [{ type: 'Hitbox' }, { type: 'SwapOnCollide' }] },
          { name: 'B', components: [{ type: 'Hitbox' }] },
        ],
      },
      { components },
    )

    step(game)
    step(game)
    // "No scene" means no scene: the queued swap must not resurrect one.
    expect(game.entities).toHaveLength(0)
    expect(game.sceneName).toBeNull()
    game.dispose()
  })
})

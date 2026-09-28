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
  authoringDefaults,
  Game,
  StateMachine,
  type Component,
  type Entity,
  type SceneJson,
} from '@waica/engine'
import { Interactable } from './interactable'
import { SceneTransition } from './scene-transition'

interface StubEntity extends Entity {
  addStub(component: Component): void
}

function makeGame(): Game {
  return {
    loadSceneByName: vi.fn(),
    cameraEffects: { fade: vi.fn() },
  } as unknown as Game
}

function makeEntity(game: Game, name: string): StubEntity {
  const components: Component[] = []
  const entity = {
    name,
    game,
    alive: true,
    get(Class: new () => Component) {
      return components.find((component) => component instanceof Class)
    },
    has(Class: new () => Component) {
      return components.some((component) => component instanceof Class)
    },
    addStub(component: Component) {
      component.entity = entity as unknown as Entity
      component.game = game
      components.push(component)
    },
  } as unknown as StubEntity
  return entity
}

function playerEntity(game: Game): Entity {
  const player = makeEntity(game, 'Player')
  const machine = new StateMachine()
  machine.role = 'player'
  player.addStub(machine)
  return player
}

describe('SceneTransition', () => {
  it('fires on overlap with the player by default (CA-10)', () => {
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.scene = 'cave'
    door.addStub(transition)

    transition.onCollide?.(playerEntity(game))

    expect(game.loadSceneByName).toHaveBeenCalledWith('cave')
    // fadeSeconds 0 (the default) is today's hard cut: no fade at all.
    expect(game.cameraEffects.fade).not.toHaveBeenCalled()
  })

  it('trusts the authored overlap mask instead of rechecking player identity', () => {
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.scene = 'cave'
    door.addStub(transition)

    transition.onCollide?.(makeEntity(game, 'Rock'))

    expect(game.loadSceneByName).toHaveBeenCalledWith('cave')
  })

  it('does not fire on overlap when trigger is "interact"', () => {
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.scene = 'cave'
    transition.trigger = 'interact'
    door.addStub(new Interactable())
    door.addStub(transition)

    transition.onCollide?.(playerEntity(game))

    expect(game.loadSceneByName).not.toHaveBeenCalled()
  })

  it('fires from a sibling Interactable interaction when trigger is "interact" (CA-11)', () => {
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.scene = 'cave'
    transition.trigger = 'interact'
    door.addStub(new Interactable())
    door.addStub(transition)

    transition.onInteract?.(playerEntity(game))

    expect(game.loadSceneByName).toHaveBeenCalledWith('cave')
  })

  it('does not fire from an interaction when trigger is "overlap"', () => {
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.scene = 'cave'
    door.addStub(transition)

    transition.onInteract?.(playerEntity(game))

    expect(game.loadSceneByName).not.toHaveBeenCalled()
  })

  it('warns at ready time with trigger "interact" and no sibling Interactable (CA-11)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.trigger = 'interact'
    door.addStub(transition)

    transition.onReady?.()

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('Door')
    warn.mockRestore()
  })

  it('does not warn at ready time in overlap mode, or with the sibling present', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = makeGame()

    const doorA = makeEntity(game, 'DoorA')
    const overlapTransition = new SceneTransition()
    doorA.addStub(overlapTransition)
    overlapTransition.onReady?.()

    const doorB = makeEntity(game, 'DoorB')
    const interactTransition = new SceneTransition()
    interactTransition.trigger = 'interact'
    doorB.addStub(new Interactable())
    doorB.addStub(interactTransition)
    interactTransition.onReady?.()

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const registry = { components: { SceneTransition, Interactable } }

function doorScene(props: Record<string, unknown>, extra: SceneJson['entities'] = []): SceneJson {
  return {
    waicaScene: 3,
    entities: [
      { name: 'Door', components: [{ type: 'SceneTransition', props: { scene: 'cave', ...props } }] },
      { name: 'Player' },
      ...extra,
    ],
  }
}

function makeRealGame(main: SceneJson, extraScenes: Record<string, SceneJson> = {}): Game {
  const host = document.createElement('div')
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  host.append(canvas)
  document.body.append(host)
  const game = new Game({ canvas })
  game.registerSceneCatalog({
    scenes: { main, cave: { waicaScene: 3, entities: [{ name: 'Torch' }] }, ...extraScenes },
    registry,
  })
  game.loadSceneByName('main')
  return game
}

/** One render frame running one Simulation Step. */
function frame(game: Game): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(1)
}

function door(game: Game): SceneTransition {
  return game.find('Door')!.get(SceneTransition)!
}

describe('SceneTransition with a fade (issue #74 CA-15)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('with fadeSeconds 0 loads the destination on the same step, with no fade', () => {
    const game = makeRealGame(doorScene({}))
    frame(game)

    door(game).onCollide?.(game.find('Player')!)

    expect(game.sceneName).toBe('cave')
    expect(game.cameraEffects.state.fade.opacity).toBe(0)
    game.dispose()
  })

  it('fades out over fadeSeconds, swaps, then clears over fadeSeconds in the incoming scene; retriggers do nothing', () => {
    const game = makeRealGame(doorScene({ fadeSeconds: 0.25, fadeColor: '#ff0000' }))
    const load = vi.spyOn(game, 'loadSceneByName')
    let simulated = 0
    game.onUpdate(() => (simulated += 1))
    frame(game)
    frame(game)
    const player = game.find('Player')!

    door(game).onCollide?.(player)

    const seen: Array<{ scene: string | null; opacity: number }> = []
    for (let n = 1; n <= 30; n += 1) {
      // Retriggers during the outgoing fade are ignored.
      if (n <= 10) door(game).onCollide?.(player)
      frame(game)
      seen.push({ scene: game.sceneName, opacity: game.cameraEffects.state.fade.opacity })
    }

    // Outgoing: 15 steps of a rising fade to the authored color, still "main".
    for (let n = 1; n <= 14; n += 1) {
      expect(seen[n - 1]!.scene).toBe('main')
      expect(seen[n - 1]!.opacity).toBeCloseTo(n / 15, 12)
    }
    expect(seen[14]).toEqual({ scene: 'main', opacity: 1 })
    expect(game.cameraEffects.state.fade.color).toBe('#ff0000')
    // The swap, then 15 steps of clearing in "cave".
    for (let n = 16; n <= 30; n += 1) {
      expect(seen[n - 1]!.scene).toBe('cave')
      expect(seen[n - 1]!.opacity).toBeCloseTo((30 - n) / 15, 12)
    }
    expect(seen[29]!.opacity).toBe(0)
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('cave')
    // Simulation never froze.
    expect(simulated).toBe(32)
    game.dispose()
  })

  it('defaults fadeColor to black and fires the same way from an interaction', () => {
    const main = doorScene({ fadeSeconds: 0.1, trigger: 'interact' })
    main.entities[0]!.components!.unshift({ type: 'Interactable' })
    const game = makeRealGame(main)
    frame(game)

    door(game).onInteract?.(game.find('Player')!)
    frame(game)

    expect(game.sceneName).toBe('main')
    expect(game.cameraEffects.state.fade.color).toBe('#000000')
    expect(game.cameraEffects.state.fade.opacity).toBeCloseTo(1 / 6, 12)
    for (let n = 0; n < 6; n += 1) frame(game)
    expect(game.sceneName).toBe('cave')
    game.dispose()
  })

  it('a mid-fade scene change does not leave the fade stuck at opacity 1 (issue #74 review)', () => {
    const game = makeRealGame(doorScene({ fadeSeconds: 0.25 }), {
      town: { waicaScene: 3, entities: [{ name: 'Mayor' }] },
    })
    frame(game)
    const player = game.find('Player')!

    door(game).onCollide?.(player)
    for (let n = 0; n < 5; n += 1) frame(game)
    expect(game.sceneName).toBe('main')
    expect(game.cameraEffects.state.fade.opacity).toBeGreaterThan(0)
    expect(game.cameraEffects.state.fade.opacity).toBeLessThan(1)

    // Something else changes the scene mid-fade: e.g. the Runtime Bridge's
    // `scene` control operation, called synchronously outside a frame.
    game.loadSceneByName('town')
    expect(game.sceneName).toBe('town')

    // Run well past the door's own fadeSeconds: the fade must still clear,
    // in whichever scene ended up live, instead of staying stuck.
    for (let n = 0; n < 40; n += 1) frame(game)

    expect(game.sceneName).toBe('town')
    expect(game.cameraEffects.state.fade.opacity).toBe(0)
    game.dispose()
  })

  it('the door being destroyed mid-fade does not leave the fade stuck at opacity 1 (issue #74 review)', () => {
    const game = makeRealGame(doorScene({ fadeSeconds: 0.25 }))
    frame(game)
    const player = game.find('Player')!

    door(game).onCollide?.(player)
    for (let n = 0; n < 5; n += 1) frame(game)
    expect(game.cameraEffects.state.fade.opacity).toBeGreaterThan(0)
    expect(game.cameraEffects.state.fade.opacity).toBeLessThan(1)

    // The door entity itself is destroyed mid-fade (e.g. a hard reset script).
    game.find('Door')!.destroy()

    for (let n = 0; n < 40; n += 1) frame(game)

    // No swap: the door that would have triggered it is gone.
    expect(game.sceneName).toBe('main')
    expect(game.cameraEffects.state.fade.opacity).toBe(0)
    game.dispose()
  })
})

describe('SceneTransition params reach tooling (issue #74 CA-16)', () => {
  it('lists fadeSeconds and fadeColor with their defaults', () => {
    expect(Object.keys(SceneTransition.params)).toEqual(['scene', 'trigger', 'fadeSeconds', 'fadeColor'])
    expect(authoringDefaults(SceneTransition)).toEqual({
      scene: '',
      trigger: 'overlap',
      fadeSeconds: 0,
      fadeColor: 'black',
    })
  })
})

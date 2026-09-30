// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// @waica/engine resolves its own nested `three` copy, so the mock has to
// target that exact module: the WebGLRenderer is the one thing happy-dom
// cannot host.
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
  installArchetype,
  installDirectionalAnimation,
  ParticleEmitter,
  resetRegistries,
  type Entity,
} from '@waica/engine'
import { Health, IsoMotor } from '@waica/behaviors'
import { ARCHETYPE } from './manifest'
import { defined } from '../../engine/src/test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const DT = 1 / 60

/** A new isometric project's demo, straight from the archetype's scenes, prefabs and registry. */
function makeDemo(sceneName = 'main') {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  installArchetype(ARCHETYPE.bundle)
  installDirectionalAnimation(ARCHETYPE.animation)
  const game = new Game({ canvas, bindings: ARCHETYPE.bindings })
  game.registerSceneCatalog({
    scenes: { main: ARCHETYPE.scene, ...ARCHETYPE.extraScenes },
    registry: ARCHETYPE.registry,
  })
  expect(game.loadSceneByName(sceneName)).toBe(true)
  const demo = {
    game,
    find: (name: string): Entity => defined(game.find(name), `entity "${name}"`),
    emitter: (name: string): ParticleEmitter =>
      defined(demo.find(name).get(ParticleEmitter), `a ParticleEmitter on "${name}"`),
    frame() {
      ;(game as unknown as { runFrame(steps: number): void }).runFrame(1)
    },
    frames(seconds: number) {
      for (let t = 0; t < seconds - 1e-9; t += DT) demo.frame()
    },
  }
  return demo
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetRegistries()
})

describe('the isometric archetype combat particles', () => {
  it('throws sparks from the player on a swing, and none while idle', () => {
    const demo = makeDemo()
    const sparks = demo.emitter('Player')
    demo.frames(0.5)
    expect(sparks.active).toBe(0)

    expect(demo.game.input.injectAction('attack', 'press')).toBe(true)
    demo.frame()
    expect(sparks.active).toBeGreaterThan(0)

    // A short-lived flash: gone before the next swing could start.
    demo.frames(1)
    expect(sparks.active).toBe(0)
  })

  it('puffs hurt smoke where a strike lands on the orc', () => {
    const demo = makeDemo()
    const orc = demo.find('Orc')
    const player = demo.find('Player')
    const smoke = demo.emitter('HurtSmoke')
    expect(smoke.active).toBe(0)

    player.position.set(orc.position.x - 0.85, orc.position.y + 0.85, 0)
    defined(player.get(IsoMotor)).facing = 'e'
    expect(demo.game.input.injectAction('attack', 'press')).toBe(true)
    let struckAt: number[] = []
    demo.game.events.on('damage', () => {
      struckAt = [orc.position.x, orc.position.y]
    })
    demo.frame()

    expect(defined(orc.get(Health)).current).toBe(1)
    expect(smoke.active).toBeGreaterThan(0)
    const smokeAt = demo.find('HurtSmoke').position
    expect([smokeAt.x, smokeAt.y]).toEqual(struckAt)
  })
})

describe('the isometric archetype hurt smoke on the player', () => {
  it('puffs hurt smoke where the orc touches the player', () => {
    const demo = makeDemo()
    const orc = demo.find('Orc')
    const player = demo.find('Player')
    const smoke = demo.emitter('HurtSmoke')
    let hitAt: number[] = []
    demo.game.events.on('damage', () => {
      hitAt = [player.position.x, player.position.y]
    })

    player.position.set(orc.position.x - 0.5, orc.position.y, 0)
    demo.frame()

    expect(defined(player.get(Health)).current).toBe(2)
    expect(smoke.active).toBeGreaterThan(0)
    const smokeAt = demo.find('HurtSmoke').position
    expect([smokeAt.x, smokeAt.y]).toEqual(hitAt)
  })
})

describe('the isometric archetype ambience', () => {
  it('blows wind across the main scene continuously', () => {
    const demo = makeDemo()
    const wind = demo.emitter('Wind')

    demo.frames(1)
    for (let second = 0; second < 5; second++) {
      expect(wind.active).toBeGreaterThan(0)
      demo.frames(1)
    }
    expect(wind.emitting).toBe(true)
    expect(wind.space).toBe('world')
  })

  it('keeps the cave windless, with drifting dust instead', () => {
    const demo = makeDemo('cave')

    expect(demo.game.find('Wind')).toBeUndefined()
    const dust = demo.emitter('Dust')
    demo.frames(2)
    expect(dust.active).toBeGreaterThan(0)
  })
})

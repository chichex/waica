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
  StateMachine,
  type Entity,
} from '@waica/engine'
import { ARCHETYPE } from './manifest'
import { defined } from '../../engine/src/test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const DT = 1 / 60

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetRegistries()
})

/** A new topdown project's demo, straight from the archetype's scene, prefabs and registry. */
function makeDemo() {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  installArchetype(ARCHETYPE.bundle)
  installDirectionalAnimation(ARCHETYPE.animation)
  const game = new Game({ canvas, bindings: ARCHETYPE.bindings })
  game.registerSceneCatalog({ scenes: { main: ARCHETYPE.scene }, registry: ARCHETYPE.registry })
  expect(game.loadSceneByName('main')).toBe(true)
  const player: Entity = defined(game.find('Player'), 'the Player')
  const demo = {
    game,
    dust: defined(player.get(ParticleEmitter), 'a ParticleEmitter on the Player'),
    state: () => defined(player.get(StateMachine)).current,
    frame() {
      ;(game as unknown as { runFrame(steps: number): void }).runFrame(1)
    },
    frames(seconds: number) {
      for (let t = 0; t < seconds - 1e-9; t += DT) demo.frame()
    },
  }
  return demo
}

describe('the topdown archetype dust trail', () => {
  it('trails dust only while the player walks', () => {
    const demo = makeDemo()
    demo.frames(1)
    expect(demo.state()).toBe('idle')
    expect(demo.dust.emitting).toBe(false)
    expect(demo.dust.active).toBe(0)

    expect(demo.game.input.injectAction('right', 'hold')).toBe(true)
    demo.frames(0.5)
    expect(demo.state()).toBe('walk')
    expect(demo.dust.emitting).toBe(true)
    expect(demo.dust.active).toBeGreaterThan(0)

    expect(demo.game.input.injectAction('right', 'release')).toBe(true)
    demo.frames(1.5)
    expect(demo.state()).toBe('idle')
    expect(demo.dust.emitting).toBe(false)
    expect(demo.dust.active).toBe(0)
  })
})

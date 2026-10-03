// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// @waica/engine resolves its own nested `three` copy, so the mock has to
// target that exact module: the WebGPURenderer is the one thing happy-dom
// cannot host.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import {
  Game,
  installArchetype,
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

/** A new platformer project's demo, straight from the archetype's scene, prefabs and registry. */
function makeDemo() {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  installArchetype(ARCHETYPE.bundle)
  const game = new Game({ canvas, bindings: ARCHETYPE.bindings })
  game.registerSceneCatalog({ scenes: { main: ARCHETYPE.scene }, registry: ARCHETYPE.registry })
  expect(game.loadSceneByName('main')).toBe(true)
  const player: Entity = defined(game.find('Player'), 'the Player')
  const demo = {
    game,
    player,
    dust: defined(player.get(ParticleEmitter), 'a ParticleEmitter on the Player'),
    state: () => defined(player.get(StateMachine)).current,
    frame() {
      ;(game as unknown as { runFrame(steps: number): void }).runFrame(1)
    },
    frames(seconds: number) {
      for (let t = 0; t < seconds - 1e-9; t += DT) demo.frame()
    },
    until(state: string, seconds = 3) {
      for (let t = 0; t < seconds && demo.state() !== state; t += DT) demo.frame()
      expect(demo.state()).toBe(state)
    },
  }
  return demo
}

/** Lets the spawn drop land and its dust settle: the player stands still on the ground. */
function settle(demo: ReturnType<typeof makeDemo>): void {
  demo.until('idle')
  demo.frames(1)
  expect(demo.dust.active).toBe(0)
}

describe('the platformer archetype dust', () => {
  it('puffs dust when the player takes off from the ground', () => {
    const demo = makeDemo()
    settle(demo)

    expect(demo.game.input.injectAction('jump', 'press')).toBe(true)
    demo.until('jump', DT)

    expect(demo.dust.active).toBeGreaterThan(0)
  })

  it('bursts dust when the player lands after a drop, and none on the way down', () => {
    const demo = makeDemo()
    settle(demo)
    demo.player.position.y += 3

    demo.until('fall')
    for (let t = 0; t < 3 && demo.state() === 'fall'; t += DT) {
      expect(demo.dust.active).toBe(0)
      demo.frame()
    }

    expect(demo.state()).toBe('idle')
    expect(demo.dust.active).toBeGreaterThan(0)
  })
})

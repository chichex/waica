// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The example has no dependency on three of its own, so the mock targets the
// engine's copy: the WebGLRenderer is the one thing happy-dom cannot host.
vi.mock(
  new URL('../../../packages/engine/node_modules/three/build/three.module.js', import.meta.url)
    .pathname,
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
  collectModuleComponents,
  Game,
  installArchetype,
  mergeRegistryComponents,
  ParticleEmitter,
  resetRegistries,
  StateMachine,
  type Entity,
  type PrefabJson,
  type SceneJson,
} from '@waica/engine'
import { PLATFORMER_BUNDLE, PLATFORMER_REGISTRY } from '@waica/archetype-platformer'
import controls from './controls.json'
import stats from './stats.json'
import { defined } from '../../../packages/engine/src/test-support'

// The example's OWN files, globbed the way main.ts globs them: these tests
// are about what `pnpm dev` plays, not the archetype's defaults.
const sceneFiles = import.meta.glob<SceneJson>('./scenes/*.scene.json', {
  eager: true,
  import: 'default',
})
const prefabFiles = import.meta.glob<PrefabJson>(
  ['./characters/*.character.json', './objects/*.object.json', './tiles/*.tile.json'],
  { eager: true, import: 'default' },
)
const projectModules = import.meta.glob<Record<string, unknown>>(
  ['./components/*.ts', '!**/*.test.ts'],
  { eager: true },
)

function byName<T>(files: Record<string, T>, name: (path: string) => string): Record<string, T> {
  return Object.fromEntries(Object.entries(files).map(([path, file]) => [name(path), file]))
}

const scenes = byName(sceneFiles, (path) => path.slice('./scenes/'.length, -'.scene.json'.length))
const prefabs = byName(prefabFiles, (path) => path.slice(2, path.indexOf('.', 2)))

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const DT = 1 / 60

/** The shipped example, booted the way main.ts boots it, on its own scene and prefabs. */
function makeDemo() {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  installArchetype(PLATFORMER_BUNDLE)
  const registry = mergeRegistryComponents(
    { ...PLATFORMER_REGISTRY, prefabs },
    collectModuleComponents(Object.values(projectModules)),
  )
  const game = new Game({ canvas, bindings: controls.bindings, stats: stats.stats })
  game.registerSceneCatalog({ scenes, registry })
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
    /** Steps until the player's state machine sits in `state`, at most `seconds`. */
    until(state: string, seconds = 3) {
      for (let t = 0; t < seconds && demo.state() !== state; t += DT) demo.frame()
      expect(demo.state()).toBe(state)
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

/** Lets the spawn drop land and its dust settle: the player stands still on the ground. */
function settle(demo: ReturnType<typeof makeDemo>): void {
  demo.until('idle')
  demo.frames(1)
  expect(demo.dust.active).toBe(0)
}

describe('the platformer demo kicks up dust', () => {
  it('puffs a little dust under the player when it jumps', () => {
    const demo = makeDemo()
    settle(demo)

    expect(demo.game.input.injectAction('jump', 'press')).toBe(true)
    demo.until('jump', DT)

    expect(demo.dust.active).toBeGreaterThan(0)
  })

  it('bursts dust when the player lands after a fall, not while it is airborne', () => {
    const demo = makeDemo()
    settle(demo)
    // Lifted straight up: a plain drop, no jump puff to confuse the landing.
    demo.player.position.y += 3

    demo.until('fall')
    for (let t = 0; t < 3 && demo.state() === 'fall'; t += DT) {
      expect(demo.dust.active).toBe(0)
      demo.frame()
    }

    expect(demo.state()).toBe('idle')
    expect(demo.dust.active).toBeGreaterThan(0)
  })

  it('leaves no dust while the player simply runs along the ground', () => {
    const demo = makeDemo()
    settle(demo)

    expect(demo.game.input.injectAction('right', 'hold')).toBe(true)
    demo.until('run')
    demo.frames(0.3)
    expect(demo.state()).toBe('run')

    expect(demo.dust.active).toBe(0)
  })
})

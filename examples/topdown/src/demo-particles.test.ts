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
  installDirectionalAnimation,
  mergeRegistryComponents,
  ParticleEmitter,
  resetRegistries,
  StateMachine,
  type Entity,
  type PrefabJson,
  type SceneJson,
} from '@waica/engine'
import { ARCHETYPE } from '@waica/archetype-topdown'
import controls from './controls.json'
import stats from './stats.json'
import { defined } from '../../../packages/engine/src/test-support'

// The example's OWN files, globbed the way main.ts globs them: these tests
// are about what `pnpm dev:topdown` plays, not the archetype's defaults.
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
  installArchetype(ARCHETYPE.bundle)
  installDirectionalAnimation(ARCHETYPE.animation ?? null)
  const registry = mergeRegistryComponents(
    { ...ARCHETYPE.registry, prefabs },
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

describe('the topdown demo leaves a dust trail', () => {
  it('raises no dust while the player stands still', () => {
    const demo = makeDemo()

    demo.frames(1)

    expect(demo.state()).toBe('idle')
    expect(demo.dust.emitting).toBe(false)
    expect(demo.dust.active).toBe(0)
  })

  it('trails dust for as long as the player walks, and lets it settle after', () => {
    const demo = makeDemo()
    demo.frames(0.2)

    expect(demo.game.input.injectAction('right', 'hold')).toBe(true)
    demo.until('walk')
    demo.frames(0.5)
    expect(demo.state()).toBe('walk')
    expect(demo.dust.emitting).toBe(true)
    expect(demo.dust.active).toBeGreaterThan(0)

    expect(demo.game.input.injectAction('right', 'release')).toBe(true)
    demo.until('idle')
    expect(demo.dust.emitting).toBe(false)
    demo.frames(1.5)
    expect(demo.dust.active).toBe(0)
  })
})

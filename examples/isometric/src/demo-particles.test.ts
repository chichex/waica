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
  type Entity,
  type PrefabJson,
  type SceneJson,
} from '@waica/engine'
import { Health, IsoMotor } from '@waica/behaviors'
import { ARCHETYPE } from '@waica/archetype-isometric'
import controls from './controls.json'
import stats from './stats.json'
import { defined } from '../../../packages/engine/src/test-support'

// The example's OWN files, globbed the way main.ts globs them: these tests
// are about what `pnpm dev:isometric` plays, not the archetype's defaults.
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

/** The shipped example, booted the way main.ts boots it, on its own scenes and prefabs. */
function makeDemo(sceneName = 'main') {
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
  expect(game.loadSceneByName(sceneName)).toBe(true)
  const demo = {
    game,
    find(name: string): Entity {
      return defined(game.find(name), `entity "${name}"`)
    },
    emitter(name: string): ParticleEmitter {
      return defined(demo.find(name).get(ParticleEmitter), `a ParticleEmitter on "${name}"`)
    },
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

/** Where `target` stood each time it took damage, in hit order. */
function hitPositions(demo: ReturnType<typeof makeDemo>, target: Entity): Array<[number, number]> {
  const hits: Array<[number, number]> = []
  demo.game.events.on('damage', (payload) => {
    const { entity } = payload as { entity: Entity }
    if (entity === target) hits.push([entity.position.x, entity.position.y])
  })
  return hits
}

describe('the isometric demo sword swing', () => {
  it('throws a burst of sparks on every swing, and none while idle', () => {
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
})

describe('the isometric demo hurt smoke', () => {
  it('puffs smoke where a sword strike lands on the orc', () => {
    const demo = makeDemo()
    const orc = demo.find('Orc')
    const player = demo.find('Player')
    const smoke = demo.emitter('HurtSmoke')
    const hits = hitPositions(demo, orc)
    expect(smoke.active).toBe(0)

    player.position.set(orc.position.x - 0.85, orc.position.y + 0.85, 0)
    defined(player.get(IsoMotor)).facing = 'e'
    expect(demo.game.input.injectAction('attack', 'press')).toBe(true)
    demo.frame()

    expect(defined(orc.get(Health)).current).toBe(1)
    expect(hits).toHaveLength(1)
    expect(smoke.active).toBeGreaterThan(0)
    const smokeAt = demo.find('HurtSmoke').position
    expect([smokeAt.x, smokeAt.y]).toEqual(hits[0])
  })

  it('puffs smoke on the player when the orc hurts it', () => {
    const demo = makeDemo()
    const orc = demo.find('Orc')
    const player = demo.find('Player')
    const smoke = demo.emitter('HurtSmoke')
    const hits = hitPositions(demo, player)

    player.position.set(orc.position.x - 0.5, orc.position.y, 0)
    demo.frame()

    expect(defined(player.get(Health)).current).toBe(2)
    expect(hits).toHaveLength(1)
    expect(smoke.active).toBeGreaterThan(0)
    const smokeAt = demo.find('HurtSmoke').position
    expect([smokeAt.x, smokeAt.y]).toEqual(hits[0])
  })
})

describe('the isometric demo ambience', () => {
  it('blows wind across the main scene continuously, in world space', () => {
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

  it('keeps the cave windless, with slow dust motes instead', () => {
    const demo = makeDemo('cave')

    expect(demo.game.find('Wind')).toBeUndefined()
    const dust = demo.emitter('Dust')
    demo.frames(2)
    expect(dust.active).toBeGreaterThan(0)
  })
})

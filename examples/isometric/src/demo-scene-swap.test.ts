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

import { Game, installArchetype, installDirectionalAnimation, resetRegistries, type Entity } from '@waica/engine'
import { ARCHETYPE, ISOMETRIC_CAVE_SCENE, ISOMETRIC_SCENE } from '@waica/archetype-isometric'
import controls from './controls.json'
import stats from './stats.json'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const DT = 1 / 60

/**
 * The shipped demo, booted exactly as main.ts now boots it: the archetype
 * bundle and directional contract installed, both demo scenes registered in
 * a catalog, and the Game loading "main" by name (CA-17's mechanism).
 */
function makeDemo() {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  installArchetype(ARCHETYPE.bundle)
  installDirectionalAnimation(ARCHETYPE.animation ?? null)
  const game = new Game({ canvas, bindings: controls.bindings, stats: stats.stats })
  game.registerSceneCatalog({
    scenes: { main: ISOMETRIC_SCENE, cave: ISOMETRIC_CAVE_SCENE },
    registry: ARCHETYPE.registry,
  })
  game.loadSceneByName('main')
  return {
    game,
    find(name: string): Entity {
      const entity = game.entities.find((candidate) => candidate.name === name)
      if (!entity) throw new Error(`no entity "${name}"`)
      return entity
    },
    frame(dt = DT) {
      ;(game as unknown as { runFrame(value: number): void }).runFrame(dt)
    },
  }
}

/** Overlaps the Door's Hitbox exactly, the same deterministic-setup style demo-combat.test.ts uses. */
function walkOntoDoor(demo: ReturnType<typeof makeDemo>): void {
  const door = demo.find('Door')
  demo.find('Player').position.set(door.position.x, door.position.y, 0)
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetRegistries()
})

describe('the isometric demo scene swap, as shipped (CA-18 happy-dom counterpart)', () => {
  it('boots on "main"', () => {
    const demo = makeDemo()

    expect(demo.game.sceneName).toBe('main')
    expect(demo.find('Player')).toBeDefined()
    expect(demo.find('Orc')).toBeDefined()
  })

  it('crossing the Door swaps to "cave" only from the next frame, carrying a stat set before crossing', () => {
    const demo = makeDemo()
    // "points" (unlike "health") is never rewritten by a fresh component's
    // onReady, so it cleanly isolates the swap's own retention behavior.
    demo.game.stats.set('points', 4)
    walkOntoDoor(demo)

    demo.frame() // dispatches the collision: SceneTransition enqueues the swap
    expect(demo.game.sceneName).toBe('main')
    expect(demo.find('Player')).toBeDefined()

    demo.frame() // flushes the enqueued swap at this frame's start (CA-7)
    expect(demo.game.sceneName).toBe('cave')
    // The outgoing map's own entities are gone.
    expect(demo.game.entities.some((entity) => entity.name === 'Orc')).toBe(false)
    expect(demo.game.entities.some((entity) => entity.name === 'Villager')).toBe(false)
    // The incoming scene authored its own Player.
    expect(demo.find('Player')).toBeDefined()
    // A stat set before crossing survives the swap (session-scoped, ADR 0011).
    expect(demo.game.stats.get('points')).toBe(4)
  })

  it('crossing the caves Door returns to "main", with a fresh Player there', () => {
    const demo = makeDemo()
    walkOntoDoor(demo)
    demo.frame()
    demo.frame()
    expect(demo.game.sceneName).toBe('cave')

    walkOntoDoor(demo)
    demo.frame()
    demo.frame()

    expect(demo.game.sceneName).toBe('main')
    expect(demo.find('Player')).toBeDefined()
    expect(demo.find('Orc')).toBeDefined()
    expect(demo.game.entities.some((entity) => entity.name === 'Villager')).toBe(true)
  })
})

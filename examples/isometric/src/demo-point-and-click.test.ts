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
  Game,
  StateMachine,
  installArchetype,
  installDirectionalAnimation,
  loadScene,
  resetRegistries,
  type Entity,
} from '@waica/engine'
import { ClickToMove, Health } from '@waica/behaviors'
import { ARCHETYPE, ISOMETRIC_SCENE } from '@waica/archetype-isometric'
import controls from './controls.json'
import stats from './stats.json'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const DT = 1 / 60

/** Same shipped-demo harness as demo-combat.test.ts. */
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
  loadScene(game, ISOMETRIC_SCENE, ARCHETYPE.registry)
  const find = (name: string): Entity => {
    const entity = game.entities.find((candidate) => candidate.name === name)
    if (!entity) throw new Error(`no entity "${name}"`)
    return entity
  }
  return {
    game,
    player: find('Player'),
    villager: find('Villager'),
    orc: find('Orc'),
    frame(dt = DT) {
      ;(game as unknown as { runFrame(value: number): void }).runFrame(dt)
    },
    frames(seconds: number) {
      for (let t = 0; t < seconds - 1e-9; t += DT) this.frame()
    },
    click(x: number, y: number) {
      game.pointer.injectClick(x, y)
    },
  }
}

function machineOf(entity: Entity): StateMachine {
  return entity.get(StateMachine)!
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetRegistries()
})

describe('point-and-click for the isometric demo player (CA-4..CA-8)', () => {
  it('walks to a ground click and clears the order and marker on arrival', () => {
    const demo = makeDemo()
    const clickToMove = demo.player.get(ClickToMove)!

    // Open grass, clear of every prop/tilemap solid in the shipped scene.
    demo.click(13, 13)
    demo.frame()

    expect(clickToMove.order?.kind).toBe('ground')
    expect(clickToMove.marker).not.toBeNull()
    const markerName = clickToMove.marker!.name

    demo.frames(3)

    // The snap-on-arrival fix (CA-4) lands exactly on the cell center —
    // no coasting overshoot — well inside the spec's ~0.2-cell tolerance.
    expect(demo.player.position.x).toBeCloseTo(13.5, 5)
    expect(demo.player.position.y).toBeCloseTo(13.5, 5)
    expect(clickToMove.order).toBeNull()
    expect(clickToMove.marker).toBeNull()
    expect(demo.game.entities.some((entity) => entity.name === markerName)).toBe(false)
  })

  it('replaces the order (and its marker) on a new click', () => {
    const demo = makeDemo()
    const clickToMove = demo.player.get(ClickToMove)!

    demo.click(13, 13)
    demo.frame()
    const firstMarker = clickToMove.marker!

    demo.click(3, 13)
    demo.frame()

    expect(clickToMove.marker).not.toBe(firstMarker)
    expect(firstMarker.alive).toBe(false)
    expect(demo.game.entities).not.toContain(firstMarker)
  })

  it('cancels the order immediately on keyboard movement', () => {
    const demo = makeDemo()
    const clickToMove = demo.player.get(ClickToMove)!

    demo.click(13, 13)
    demo.frame()
    expect(clickToMove.order).not.toBeNull()

    demo.game.input.injectAction('right', 'hold')
    demo.frame()

    expect(clickToMove.order).toBeNull()
    expect(clickToMove.marker).toBeNull()
  })

  it('walks to the villager and triggers its line without pressing interact', () => {
    const demo = makeDemo()
    const clickToMove = demo.player.get(ClickToMove)!

    demo.click(demo.villager.position.x, demo.villager.position.y)
    demo.frame()
    expect(clickToMove.order?.kind).toBe('npc')
    expect(clickToMove.marker).toBeNull() // no marker for entity-target orders (CA-8)

    demo.frames(5)

    expect(demo.game.stats.get('npcLine')).toBe('The water sparkles, but it blocks the trail.')
    expect(demo.game.ui.isVisible('npc-line')).toBe(true)
    expect(clickToMove.order).toBeNull()
  })

  it('walks into range of the orc and keeps re-attacking until it dies', () => {
    const demo = makeDemo()
    const clickToMove = demo.player.get(ClickToMove)!

    demo.click(demo.orc.position.x, demo.orc.position.y)
    demo.frame()
    expect(clickToMove.order?.kind).toBe('attack')
    expect(clickToMove.marker).toBeNull() // no marker for entity-target orders (CA-8)

    demo.frames(10)

    expect(demo.game.entities.some((entity) => entity.name === 'Orc')).toBe(false)
  })

  it('pauses the order while hurt, resuming instead of dropping it after the stun', () => {
    const demo = makeDemo()
    const clickToMove = demo.player.get(ClickToMove)!

    demo.click(8, 3)
    demo.frame()
    expect(clickToMove.order).not.toBeNull()

    // Same technique as the shipped combat test: overlap the orc to force a hurt.
    demo.player.position.set(demo.orc.position.x - 0.5, demo.orc.position.y, 0)
    demo.frame()
    demo.frame()
    expect(machineOf(demo.player).current).toBe('hurt')
    const orderDuringHurt = clickToMove.order
    expect(orderDuringHurt).not.toBeNull()

    demo.frames(0.2) // still inside the 0.3s stun
    expect(clickToMove.order).toBe(orderDuringHurt) // untouched — update() never ran

    demo.frames(0.2) // stun clears — resuming may reach walkThreshold within a frame or two
    expect(machineOf(demo.player).current).not.toBe('hurt')
    expect(clickToMove.order).not.toBeNull() // resumed, not silently dropped
  })

  it('cancels the order and its marker outright when the player dies', () => {
    const demo = makeDemo()
    const clickToMove = demo.player.get(ClickToMove)!

    demo.click(8, 3)
    demo.frame()
    expect(clickToMove.order).not.toBeNull()
    const marker = clickToMove.marker
    expect(marker).not.toBeNull()

    demo.player.get(Health)!.damage(Infinity)
    demo.frame()
    demo.frame()

    expect(machineOf(demo.player).current).toBe('dead')
    expect(clickToMove.order).toBeNull()
    expect(clickToMove.marker).toBeNull()
    expect(demo.game.entities.some((entity) => entity.name === marker!.name)).toBe(false)
  })
})

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
  AnimatedSprite,
  Game,
  StateMachine,
  installArchetype,
  installDirectionalAnimation,
  loadScene,
  resetRegistries,
  type Entity,
} from '@waica/engine'
import { Health, IsoMotor, Patrol } from '@waica/behaviors'
import { ARCHETYPE, ISOMETRIC_SCENE } from '@waica/archetype-isometric'
import controls from './controls.json'
import stats from './stats.json'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const DT = 1 / 60

/**
 * The shipped demo, exactly as main.ts boots it: archetype bundle and
 * directional contract installed, the real scene loaded through the
 * archetype registry, the project's own controls and stats.
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
  loadScene(game, ISOMETRIC_SCENE, ARCHETYPE.registry)
  const find = (name: string): Entity => {
    const entity = game.entities.find((candidate) => candidate.name === name)
    if (!entity) throw new Error(`no entity "${name}"`)
    return entity
  }
  return {
    game,
    player: find('Player'),
    orc: find('Orc'),
    frame(dt = DT) {
      ;(game as unknown as { runFrame(value: number): void }).runFrame(dt)
    },
    frames(seconds: number) {
      for (let t = 0; t < seconds - 1e-9; t += DT) this.frame()
    },
    press(action: string) {
      expect(game.input.injectAction(action, 'press')).toBe(true)
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

describe('the isometric demo, as shipped', () => {
  it('starts with three hearts on the HUD', () => {
    const demo = makeDemo()

    demo.frame()

    expect(demo.game.stats.get('health')).toBe(3)
    expect(demo.game.ui.isVisible('health')).toBe(true)
    expect(demo.game.ui.isVisible('crate-counter')).toBe(true)
  })

  it('lets the player kill the orc with two sword strikes', () => {
    const demo = makeDemo()
    const orcHealth = demo.orc.get(Health)!
    const motor = demo.player.get(IsoMotor)!
    // Stand screen-west of the orc — logical (−x, +y) — out of contact range,
    // and face it.
    const faceOrc = () => {
      demo.player.position.set(demo.orc.position.x - 0.85, demo.orc.position.y + 0.85, 0)
      motor.facing = 'e'
    }

    faceOrc()
    demo.press('attack')
    demo.frame()
    expect(machineOf(demo.player).current).toBe('attack')
    expect(demo.player.get(AnimatedSprite)!.current).toBe('attack-e')
    expect(orcHealth.current).toBe(1)
    demo.frame()
    expect(machineOf(demo.orc).current).toBe('hurt')
    expect(demo.player.get(Health)!.current).toBe(3)

    demo.frames(0.4)
    expect(machineOf(demo.player).current).toBe('idle')
    faceOrc()
    demo.press('attack')
    demo.frame()
    expect(orcHealth.current).toBe(0)
    demo.frame()
    expect(machineOf(demo.orc).current).toBe('dead')
    expect(demo.orc.alive).toBe(true)

    demo.frames(0.6)
    expect(demo.orc.alive).toBe(false)
    expect(demo.game.entities.some((entity) => entity.name === 'Orc')).toBe(false)
  })

  it('makes an orc touch visible: a heart lost, a stun, a shove and a blink', () => {
    const demo = makeDemo()
    const health = demo.player.get(Health)!
    // Overlapping the orc from its −x side.
    demo.player.position.set(demo.orc.position.x - 0.5, demo.orc.position.y, 0)

    demo.frame()
    expect(health.current).toBe(2)
    expect(demo.game.stats.get('health')).toBe(2)
    demo.frame()
    expect(machineOf(demo.player).current).toBe('hurt')
    expect(health.blinking).toBe(true)
    expect(demo.player.get(AnimatedSprite)!.current).toMatch(/^hurt-/)
    const struckAt = demo.player.position.x

    demo.frames(0.3)
    expect(demo.player.position.x).toBeLessThan(struckAt - 0.5)
    expect(demo.player.position.x).toBeLessThan(demo.orc.position.x - 0.8)
    demo.frames(0.1)
    expect(machineOf(demo.player).current).toBe('idle')
    expect(health.current).toBe(2)
  })

  it('shows the orc walking where it goes: south-east down its rail, north-west back', () => {
    const demo = makeDemo()
    const sprite = demo.orc.get(AnimatedSprite)!
    const patrol = demo.orc.get(Patrol)!
    const start = demo.orc.position.x

    demo.frame()
    expect(demo.orc.position.x).toBeGreaterThan(start)
    expect(patrol.getAnimationFacing()).toBe('se')
    expect(sprite.current).toBe('walk-se')
    expect(sprite.flipX).toBe(false)
    expect(demo.orc.scale.x).toBe(1)

    // The rail is 2.5 units each way at 1.5 units/s: well past the far end.
    demo.frames(2)
    expect(demo.orc.position.x).toBeLessThan(start + 2.5)
    expect(patrol.getAnimationFacing()).toBe('nw')
    expect(sprite.current).toBe('walk-ne')
    expect(sprite.flipX).toBe(true)
    expect(demo.orc.scale.x).toBe(1)
  })
})

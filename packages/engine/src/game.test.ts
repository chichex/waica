// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
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
})

import { Component } from './component'
import { Hitbox } from './components/hitbox'
import type { Entity } from './entity'
import { Game } from './game'

const observers: ResizeObserverStub[] = []

class ResizeObserverStub {
  readonly disconnect = vi.fn()
  constructor() {
    observers.push(this)
  }
  observe(): void {}
}

class VelocityProbe extends Component {
  vx = 5
}

class CollisionProbe extends Component {
  readonly hits: Entity[] = []
  override onCollide(other: Entity): void {
    this.hits.push(other)
  }
}

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas })
}

beforeEach(() => {
  observers.length = 0
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Game glue characterization', () => {
  it('discovers camera velocity through the mover component vx seam', () => {
    const game = makeGame()
    const target = game.spawn('Player')
    target.add(VelocityProbe)
    game.setSceneCamera({ follow: 'Player', lookahead: 2, smoothing: 20 })

    ;(game as unknown as { updateSceneCamera(dt: number): void }).updateSceneCamera(0.1)

    expect(game.camera.position.x).toBeGreaterThan(target.position.x)
    game.dispose()
  })

  it('dispatches an overlap to components on both live entities', () => {
    const game = makeGame()
    const first = game.spawn('First')
    const second = game.spawn('Second')
    first.add(Hitbox)
    second.add(Hitbox)
    const firstProbe = first.add(CollisionProbe)
    const secondProbe = second.add(CollisionProbe)

    ;(game as unknown as { dispatchCollisions(): void }).dispatchCollisions()

    expect(firstProbe.hits).toEqual([second])
    expect(secondProbe.hits).toEqual([first])
    game.dispose()
  })

  it('disconnects the constructor ResizeObserver on dispose', () => {
    const game = makeGame()
    const observer = observers[0]

    game.dispose()

    expect(observer?.disconnect).toHaveBeenCalledOnce()
  })
})

// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('three', async (importOriginal) => {
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
})

import { Component } from './component'
import { Game } from './game'
import { spawnFromJson } from './scene'

class Walker extends Component {
  static override componentName = 'Walker'
  speed = 1
  readyWith = 0
  override onReady(): void {
    this.readyWith = this.speed
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  return new Game({ canvas })
}

it('applies scene props before onReady', () => {
  const game = makeGame()
  const entity = spawnFromJson(
    game,
    { name: 'W', components: [{ type: 'Walker', props: { speed: 4 } }] },
    { components: { Walker } },
  )
  const walker = entity.get(Walker)
  expect(walker?.speed).toBe(4)
  expect(walker?.readyWith).toBe(4)
  game.dispose()
})

it('never lets a scene prop overwrite a Component member, and says so', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const game = makeGame()
  const entity = spawnFromJson(
    game,
    {
      name: 'W',
      components: [{ type: 'Walker', props: { speed: 2, entity: 'nobody', onReady: 'boom' } }],
    },
    { components: { Walker } },
  )
  const walker = entity.get(Walker)
  expect(walker?.entity).toBe(entity)
  expect(walker?.speed).toBe(2)
  expect(walker?.readyWith).toBe(2)
  expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
    '[waica] component "Walker" on "W" ignores scene props that name Component members: entity, onReady',
  ])
  game.dispose()
})

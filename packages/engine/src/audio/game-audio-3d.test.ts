// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Game, loadScene, type SceneJson } from '../index.js'
import { FakeAudioBackend, flush } from './test-helpers.js'
import { defined } from '../test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(backend: FakeAudioBackend): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  return new Game({ canvas, audio: backend })
}

function runFrame(game: Game): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(1)
}

const SCENE_3D: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 0, 10], target: [0, 0, 0], fov: 60 },
  entities: [],
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function play(backend: FakeAudioBackend, game: Game, at: { x: number; y: number; z?: number }): Promise<void> {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
  game.audio.play('hit.ogg', { at })
  await flush()
  runFrame(game)
  expect(backend.playbacks.length).toBeGreaterThan(0)
}

describe('spatial audio in a 3d scene (CA-6, inference 25)', () => {
  it('attenuates by the 3D distance from the camera, z included', async () => {
    const backend = new FakeAudioBackend()
    const game = makeGame(backend)
    loadScene(game, SCENE_3D, { components: {} })
    await play(backend, game, { x: 4, y: 0, z: 0 })
    // hypot(4, 0, 10) from the camera, through the engine's linear 3..16 curve.
    const distance = Math.hypot(4, 0, 10)
    expect(backend.playbacks[0]?.setVolumeCalls.at(-1)).toBeCloseTo(1 - (distance - 3) / 13, 5)
    game.dispose()
  })

  it('pans by where the source lands on screen: right of centre pans right, left pans left', async () => {
    const backend = new FakeAudioBackend()
    const game = makeGame(backend)
    loadScene(game, SCENE_3D, { components: {} })
    await play(backend, game, { x: 4, y: 0, z: 0 })
    await play(backend, game, { x: -4, y: 0, z: 0 })
    const right = defined(backend.playbacks[0]?.setPanCalls.at(-1))
    const left = defined(backend.playbacks[1]?.setPanCalls.at(-1))
    expect(right).toBeGreaterThan(0)
    expect(left).toBeCloseTo(-right, 5)
    game.dispose()
  })

})

describe('spatial audio at the edges (CA-6)', () => {
  it('pans a source behind the camera to the centre', async () => {
    const backend = new FakeAudioBackend()
    const game = makeGame(backend)
    loadScene(game, SCENE_3D, { components: {} })
    await play(backend, game, { x: 4, y: 0, z: 30 })
    expect(backend.playbacks[0]?.setPanCalls.at(-1)).toBe(0)
    game.dispose()
  })

  it('leaves a 2d scene on the flat x/y model: a z on the point changes nothing', async () => {
    const backend = new FakeAudioBackend()
    const game = makeGame(backend)
    await play(backend, game, { x: 8, y: 0, z: 50 })
    expect(backend.playbacks[0]?.setVolumeCalls.at(-1)).toBeCloseTo(8 / 13, 5)
    game.dispose()
  })
})

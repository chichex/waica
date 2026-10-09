// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import type { AnchoredPieceHandle } from './anchored-pieces'
import { Game } from './game'
import { loadScene, type SceneJson } from './scene'
import { defined } from './test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

/** A Game on an 800×600 canvas drawing a 3D scene whose camera sits at (0, 0, 10) looking at the origin. */
function makeGame3d(): Game {
  const host = document.createElement('div')
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } })
  host.append(canvas)
  document.body.append(host)
  const game = new Game({ canvas })
  game.ui.define('tag', '<div class="tag">tag</div>')
  const scene: SceneJson = {
    waicaScene: 3,
    render: { space: '3d' },
    camera: { kind: 'perspective', position: [0, 0, 10], target: [0, 0, 0], fov: 60 },
    entities: [],
  }
  loadScene(game, scene, { components: {} })
  return game
}

function frame(game: Game): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(0)
}

function host(handle: AnchoredPieceHandle): HTMLElement {
  return (defined(handle.element).getRootNode() as ShadowRoot).host as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Anchored Pieces in a 3d scene (CA-6)', () => {
  it('places a piece through the perspective camera, z included', () => {
    const game = makeGame3d()
    const orc = game.spawn('Orc')
    const tag = game.ui.attach('tag', orc)
    frame(game)
    expect([host(tag).style.left, host(tag).style.top]).toEqual(['400px', '300px'])

    orc.position.set(2, 0, 0)
    frame(game)
    const atDepthZero = Number.parseFloat(host(tag).style.left)
    expect(atDepthZero).toBeGreaterThan(400)

    // Nearer the camera the same x lands farther from the centre.
    orc.position.set(2, 0, 5)
    frame(game)
    expect(Number.parseFloat(host(tag).style.left)).toBeGreaterThan(atDepthZero)
  })

  it('hides a piece whose anchor is behind the camera, and shows it again in front', () => {
    const game = makeGame3d()
    const orc = game.spawn('Orc')
    const tag = game.ui.attach('tag', orc)
    orc.position.set(0, 0, 30)
    frame(game)
    expect(host(tag).style.visibility).toBe('hidden')
    orc.position.set(0, 0, 0)
    frame(game)
    expect(host(tag).style.visibility).not.toBe('hidden')
  })

  it('sets --waica-unit from the perspective camera at the depth of the origin', () => {
    const game = makeGame3d()
    const orc = game.spawn('Orc')
    game.ui.attach('tag', orc)
    frame(game)
    const layer = defined(document.querySelector<HTMLElement>('[style*="--waica-unit"]'))
    // Half the view height at distance 10 with a 60 degree fov is 10 * tan(30deg); 600 px cover twice that.
    const expected = 600 / (2 * 10 * Math.tan(Math.PI / 6))
    expect(Number.parseFloat(layer.style.getPropertyValue('--waica-unit'))).toBeCloseTo(expected, 3)
  })
})

// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// A real Game builds a three.js renderer; happy-dom has no GPU, so the mock
// targets the engine's own copy of three (see viewport-scene-swap.test.tsx).
vi.mock(
  new URL('../../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { EMISSIVE_LAYER, Game, Light, loadScene, type SceneRenderJson, type THREE } from '@waica/engine'
import { createLightGizmos } from './viewport-light-gizmos'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function gameWithLight(render: SceneRenderJson | undefined): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  const game = new Game({ canvas })
  loadScene(game, {
    waicaScene: 3,
    ...(render ? { render } : {}),
    entities: [{ name: 'Torch', position: [2, 1], components: [{ type: 'Light', props: { radius: 3, offsetX: 1 } }] }],
  }, { components: { Light } })
  return game
}

function gizmoLines(game: Game): THREE.Line[] {
  return game.scene.children.filter((child): child is THREE.Line => child.name === 'waica:light-gizmo' && child.visible)
}

it('Light radius gizmo (CA-13): circles each Light in edit mode at its logical position plus offset', () => {
  const game = gameWithLight(undefined)
  createLightGizmos(game).sync('edit')
  const [line] = gizmoLines(game)
  expect(gizmoLines(game)).toHaveLength(1)
  expect(line?.position.x).toBe(3)
  expect(line?.position.y).toBe(1)
  expect([line?.scale.x, line?.scale.y]).toEqual([3, 3])
  game.dispose()
})

it('Light radius gizmo (CA-13): is a 2:1 ellipse around the projected position in an isometric scene', () => {
  const game = gameWithLight({ projection: 'isometric' })
  createLightGizmos(game).sync('edit')
  const [line] = gizmoLines(game)
  expect(line?.position.x).toBe(2)
  expect(line?.position.y).toBe(-2)
  expect(line?.scale.x).toBeCloseTo(3 * Math.SQRT2, 10)
  expect(line?.scale.y).toBeCloseTo((3 * Math.SQRT2) / 2, 10)
  game.dispose()
})

it('Light radius gizmo (CA-13): is never darkened by the light-map and hides in play mode', () => {
  const game = gameWithLight({ lighting: { ambient: { intensity: 0.1 } } })
  const gizmos = createLightGizmos(game)
  gizmos.sync('edit')
  expect(gizmoLines(game)[0]?.layers.mask).toBe(1 << EMISSIVE_LAYER)
  gizmos.sync('play')
  expect(gizmoLines(game)).toEqual([])
  game.dispose()
})

it('Light radius gizmo (CA-13): drops the gizmo of a destroyed Light', () => {
  const game = gameWithLight(undefined)
  const gizmos = createLightGizmos(game)
  gizmos.sync('edit')
  game.find('Torch')?.destroy()
  gizmos.sync('edit')
  expect(gizmoLines(game)).toEqual([])
  game.dispose()
})

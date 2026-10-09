// @vitest-environment happy-dom
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Same seam as viewport-pointer-characterization.test.tsx: happy-dom cannot
// host WebGL, so the engine's own copy of three gets an inert renderer.
vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { installArchetype, installDirectionalAnimation, isPerspectiveCamera, projectIsometric, type Game, type SceneJson } from '@waica/engine'
import { ARCHETYPE } from '@waica/archetype-isometric'
import { defined } from '../../../engine/src/test-support'
import { installViewportHost, liveGame, mountViewport, removeViewportHost } from './test-viewport'

beforeEach(() => {
  installViewportHost()
  installArchetype(ARCHETYPE.bundle)
  installDirectionalAnimation(ARCHETYPE.animation)
})
afterEach(removeViewportHost)

/** Client coordinates of a render-space world point through the live edit camera. */
function clientAt(
  game: Game,
  canvas: HTMLCanvasElement,
  [wx, wy]: readonly [number, number],
): { clientX: number; clientY: number } {
  const c = game.camera
  if (isPerspectiveCamera(c)) throw new Error('expected the orthographic edit camera')
  const rect = canvas.getBoundingClientRect()
  return {
    clientX: ((wx - (c.position.x + c.left)) / (c.right - c.left)) * rect.width,
    clientY: ((c.position.y + c.top - wy) / (c.top - c.bottom)) * rect.height,
  }
}

/** Clicks the render-space point `offset` away from `entity`'s projected position; returns what got selected. */
function clickNear(scene: SceneJson, entity: string, offset: readonly [number, number]): unknown {
  const onSelect = vi.fn()
  const mounted = mountViewport({ scene, registry: ARCHETYPE.registry, onSelect })
  const game = liveGame(mounted)
  const position = defined(game.find(entity), entity).position
  const at = projectIsometric(position.x, position.y)
  const point = clientAt(game, mounted.canvas, [at.x + offset[0], at.y + offset[1]])
  fireEvent.pointerDown(mounted.canvas, { ...point, pointerId: 1 })
  fireEvent.pointerUp(mounted.canvas, { ...point, pointerId: 1 })
  return onSelect.mock.calls.at(-1)?.[0]
}

describe('picking particle-effect objects in the default isometric scenes', () => {
  it("selects the Player when its feet are clicked, not an emitter's particle-sized box", () => {
    expect(clickNear(ARCHETYPE.scene, 'Player', [0, 0.1])).toBe('Player')
  })

  it('selects the cave Dust through the fallback marker, away from its exact center', () => {
    expect(clickNear(defined(ARCHETYPE.extraScenes.cave), 'Dust', [0.25, 0])).toBe('Dust')
  })
})

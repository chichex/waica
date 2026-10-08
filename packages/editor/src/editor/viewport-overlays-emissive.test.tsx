// @vitest-environment happy-dom
import { act } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import { EMISSIVE_LAYER, type Game, type THREE } from '@waica/engine'
import { CAMERA_NODE } from '../scene/ops'
import { fakeRendering } from '../../../engine/src/test-renderer'
import { HERO_AND_FOE, installViewportHost, liveGame, mountViewport, removeViewportHost } from './test-viewport'

/** Lets the live Game's renderer init settle, then runs one frame of its loop. */
async function tick(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const loop = fakeRendering.renderers.find((renderer) => !renderer.disposed && renderer.loop)?.loop
  if (!loop) throw new Error('the Viewport started no Game loop')
  act(() => loop(16))
}

/** The objects the editor draws over the Game: everything under the scene that no entity owns. */
function overlayObjects(game: Game): THREE.Object3D[] {
  const owned = new Set<THREE.Object3D>(game.entities.map((entity) => entity.node))
  return game.scene.children.filter((child) => !owned.has(child) && child.name !== 'waica:sprite-batches')
}

beforeEach(installViewportHost)
afterEach(removeViewportHost)

it('edit overlays (review #4): grid, selection and camera frame sit on the Emissive layer, never darkened by the light-map', async () => {
  const mounted = mountViewport({ showCamera: true, selected: 'Hero' })
  await tick()
  mounted.rerender({ selected: CAMERA_NODE })
  await tick()
  const overlays = overlayObjects(liveGame(mounted))
  expect(overlays.length).toBeGreaterThanOrEqual(5)
  for (const overlay of overlays) expect(overlay.layers.mask, overlay.type).toBe(1 << EMISSIVE_LAYER)
})

it('edit overlays (review #4): the scene under them is untouched', async () => {
  const mounted = mountViewport({ scene: HERO_AND_FOE, selected: 'Hero' })
  await tick()
  for (const entity of liveGame(mounted).entities) expect(entity.node.layers.mask).toBe(1)
})

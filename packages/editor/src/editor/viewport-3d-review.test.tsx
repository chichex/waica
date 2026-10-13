// @vitest-environment happy-dom
// Review fixes of the 3D edit view (PR #176): what a 2D scene pays for it, and the per-scene pose memory.
import { act, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import { THREE, type SceneJson } from '@waica/engine'
import { fakeRendering } from '../../../engine/src/test-renderer'
import { defined } from '../../../engine/src/test-support'
import { HERO_AND_FOE, installViewportHost, liveGame, mountViewport, removeViewportHost } from './test-viewport'

const SCENE_3D: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 4, 12], target: [0, 0, 0], fov: 50 },
  entities: [{ name: 'Hero', position: [0, 0, 0] }],
}

beforeEach(installViewportHost)
afterEach(() => {
  removeViewportHost()
  vi.unstubAllGlobals()
})

const liveLoop = (): ((time: number) => void) | null | undefined =>
  fakeRendering.renderers.find((renderer) => !renderer.disposed && renderer.loop)?.loop

async function tick(): Promise<void> {
  await act(async () => {
    await vi.waitFor(
      () => {
        if (!liveLoop()) throw new Error('the Viewport started no Game loop')
      },
      { timeout: 5_000 },
    )
  })
  const loop = liveLoop()
  if (!loop) throw new Error('the Viewport started no Game loop')
  act(() => loop(16))
}

const round = (values: readonly number[]): number[] => values.map((value) => Math.round(value * 1000) / 1000 + 0)

function perspectiveOf(camera: unknown): THREE.PerspectiveCamera {
  if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error('expected a perspective camera')
  return camera
}

/** Presses `key` on the focused viewport element. */
function press(key: string, modifiers: { shiftKey?: boolean } = {}): void {
  const surface = defined(document.querySelector<HTMLElement>('.ed-viewport'), 'the viewport element')
  surface.focus()
  fireEvent.keyDown(surface, { key, ...modifiers })
}

describe('a 2D scene under the edit view (PR #176 finding 1)', () => {
  it('builds no 3D overlay, icon included, until the live scene is 3D', async () => {
    const mounted = mountViewport({ scene: HERO_AND_FOE, scenePath: 'src/scenes/a.scene.json', project: 'game' })
    await tick()
    const names: string[] = []
    liveGame(mounted).scene.traverse((object) => names.push(object.name))
    expect(names.filter((name) => name.startsWith('waica:editor-'))).toEqual([])
  })
})

describe('F over a 2D scene (PR #176 review note)', () => {
  it('keeps the key\'s default: there is nothing to frame', async () => {
    mountViewport({ scene: HERO_AND_FOE, scenePath: 'src/scenes/a.scene.json', project: 'game', selected: 'Hero' })
    await tick()
    expect(fireEvent.keyDown(document.body, { key: 'f' })).toBe(true)
  })
})

describe('the remembered pose per scene (PR #176 finding 8)', () => {
  it('keeps every scene\'s pose for the session when storage throws: A, then B, then A again (PR #176 finding 8)', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    const mounted = mountViewport({ scene: SCENE_3D, scenePath: 'src/scenes/a.scene.json', project: 'game', showCamera: true, onGridChange: () => {} })
    await tick()
    const game = liveGame(mounted)
    press('ArrowRight', { shiftKey: true })
    const poseA = round(perspectiveOf(game.camera).position.toArray())
    mounted.rerender({ scene: SCENE_3D, scenePath: 'src/scenes/b.scene.json' })
    await tick()
    press('ArrowLeft', { shiftKey: true })
    expect(round(perspectiveOf(game.camera).position.toArray())).not.toEqual(poseA)
    mounted.rerender({ scene: SCENE_3D, scenePath: 'src/scenes/a.scene.json' })
    await tick()
    expect(round(perspectiveOf(game.camera).position.toArray())).toEqual(poseA)
  })
})

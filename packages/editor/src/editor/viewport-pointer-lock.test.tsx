// @vitest-environment happy-dom
import { act, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import type { SceneJson } from '@waica/engine'
import { fakeRendering } from '../../../engine/src/test-renderer'
import { installViewportHost, mountViewport, removeViewportHost } from './test-viewport'

// Issue #181 CA-34: the pointer lock in the editor's Play, never in edit mode.

const FOLLOWING: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 4, 12], target: [0, 0, 0], follow: 'Hero' },
  entities: [{ name: 'Hero', position: [0, 0, 0] }],
}

let locked: Element | null = null
const requests: Element[] = []
const exit = vi.fn(() => {
  locked = null
})

beforeEach(() => {
  installViewportHost()
  locked = null
  requests.length = 0
  exit.mockClear()
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked })
  Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: exit })
  Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
    configurable: true,
    value(this: HTMLCanvasElement) {
      requests.push(this)
      locked = requests.at(-1) ?? null
      return Promise.resolve()
    },
  })
})

afterEach(() => {
  removeViewportHost()
  Reflect.deleteProperty(document, 'pointerLockElement')
  Reflect.deleteProperty(document, 'exitPointerLock')
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'requestPointerLock')
})

/** Waits for the live Game's loop, as the Viewport starts it after the renderer and Rapier settle. */
async function started(): Promise<void> {
  await act(async () => {
    await vi.waitFor(() => {
      if (!fakeRendering.renderers.some((renderer) => !renderer.disposed && renderer.loop)) throw new Error('no Game loop yet')
    }, { timeout: 5_000 })
  })
}

it('locks the pointer to the viewport canvas on a click in Play over a following camera (CA-34)', async () => {
  const mounted = mountViewport({ scene: FOLLOWING, mode: 'play' })
  await started()

  fireEvent.pointerDown(mounted.canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 1, pointerType: 'mouse' })

  expect(requests).toEqual([mounted.canvas])
})

it('never asks for the lock in edit mode, where the Editor Camera owns the mouse (CA-34)', async () => {
  const mounted = mountViewport({ scene: FOLLOWING, mode: 'edit' })
  await started()

  fireEvent.pointerDown(mounted.canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 1, pointerType: 'mouse' })

  expect(requests).toEqual([])
})

it('releases the lock when Play stops (CA-34)', async () => {
  const mounted = mountViewport({ scene: FOLLOWING, mode: 'play' })
  await started()
  fireEvent.pointerDown(mounted.canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 1, pointerType: 'mouse' })
  expect(locked).toBe(mounted.canvas)

  mounted.rerender({ mode: 'edit' })
  await started()

  expect(exit).toHaveBeenCalledOnce()
  expect(locked).toBeNull()
})

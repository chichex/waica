// @vitest-environment happy-dom
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(
      await importOriginal<Record<string, unknown>>(),
    ),
)

import { Animator, Model, StateMachine, type Game, type SceneEntityJson, type SceneJson } from '@waica/engine'
import { fakeRendering } from '../../../engine/src/test-renderer'
import { RIG_URL, serveRig } from '../../../engine/src/test-rig'
import { defined } from '../../../engine/src/test-support'
import { installViewportHost, liveGame, mountViewport, removeViewportHost, type MountedViewport } from './test-viewport'

// Issue 205 CA-21: the stage plays a blend on one live Animator in edit mode, one step per frame.

beforeEach(() => {
  installViewportHost()
  serveRig()
})
afterEach(removeViewportHost)

const MOVE = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }, { clip: 'jump', at: 2 }], smoothing: 0 }
const rigged = (name: string, x: number): SceneEntityJson => ({
  name,
  position: [x, 0, 0],
  components: [{ type: 'Model', props: { src: RIG_URL } }, { type: 'Animator', props: { initialClip: 'idle', blends: { Move: MOVE } } }],
})
const SCENE: SceneJson = { waicaScene: 3, render: { space: '3d' }, camera: { kind: 'perspective' }, entities: [rigged('Hero', 0), rigged('Foe', 3)] }
const REGISTRY = { components: { Model, Animator, StateMachine } }

const liveLoop = (): ((time: number) => void) | undefined => fakeRendering.renderers.find((renderer) => !renderer.disposed && renderer.loop)?.loop ?? undefined

/** Waits for the live Game's loop and for both rigs' Animators to load. */
async function mountRigs(overrides: Parameters<typeof mountViewport>[0] = {}): Promise<{ mounted: MountedViewport; game: Game }> {
  const mounted = mountViewport({ scene: SCENE, registry: REGISTRY, project: 'game', ...overrides })
  await act(async () => {
    await vi.waitFor(
      () => {
        if (!liveLoop() || !['Hero', 'Foe'].every((name) => animatorOf(liveGame(mounted), name).inspectState().loaded)) throw new Error('not loaded yet')
      },
      { timeout: 5_000 },
    )
  })
  return { mounted, game: liveGame(mounted) }
}

const animatorOf = (game: Game, name: string): Animator => defined(defined(game.find(name)).get(Animator))

/** Runs `frames` frames of the live loop, returning each named rig's pose hash after each. */
function frames(game: Game, count: number, names: readonly string[]): Record<string, string[]> {
  const hashes: Record<string, string[]> = Object.fromEntries(names.map((name) => [name, []]))
  for (let frame = 0; frame < count; frame += 1) {
    act(() => defined(liveLoop(), 'the live loop')(16 * (frame + 1)))
    for (const name of names) hashes[name]?.push(animatorOf(game, name).inspectState().poseHash)
  }
  return hashes
}

describe('the stage previews a blend on the selected entity alone (issue 205 CA-21)', () => {
  it('plays the blend at the value on that Animator, a step per frame, and leaves the others still', async () => {
    const { mounted, game } = await mountRigs()

    expect(mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 1.5 })).toBe(true)
    // Past the 0.15 s fade from idle into the blend.
    const hashes = frames(game, 12, ['Hero', 'Foe'])

    expect(animatorOf(game, 'Hero').inspectState()).toMatchObject({ current: 'Move', weights: { walk: 0.5, jump: 0.5 } })
    expect(new Set(hashes.Hero).size).toBe(12)
    expect(new Set(hashes.Foe).size).toBe(1)
    expect(game.simulate).toBe(false)
  })

  it('moves the value of a running preview, and ends it back on the initial clip', async () => {
    const { mounted, game } = await mountRigs()
    mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 0.5 })
    frames(game, 2, ['Hero'])
    mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 2 })
    frames(game, 10, ['Hero'])
    expect(animatorOf(game, 'Hero').inspectState().weights).toEqual({ jump: 1 })

    mounted.handle().stopBlendPreview()
    const after = frames(game, 3, ['Hero'])
    expect(animatorOf(game, 'Hero').current).toBe('idle')
    expect(new Set(after.Hero).size).toBe(1)
  })

})

describe('the stage refuses or drops a blend preview (issue 205 CA-21)', () => {
  it('refuses a preview with no live Animator able to play the blend, or in Play', async () => {
    const { mounted } = await mountRigs()
    expect(mounted.handle().previewBlend({ entity: 'Nobody', blend: 'Move', param: 'speed', value: 1 })).toBe(false)
    expect(mounted.handle().previewBlend({ entity: 'Hero', blend: 'Gone', param: 'speed', value: 1 })).toBe(false)
    removeViewportHost()
    installViewportHost()
    serveRig()

    const play = await mountRigs({ mode: 'play' })
    expect(play.mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 1 })).toBe(false)
  })

  it('drops the preview when the stage rebuilds its Game', async () => {
    const { mounted, game } = await mountRigs()
    mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 1.5 })
    frames(game, 1, ['Hero'])

    mounted.rerender({ epoch: 2 })
    const rebuilt = await vi.waitFor(() => {
      const next = liveGame(mounted)
      if (next === game || !animatorOf(next, 'Hero').inspectState().loaded || !liveLoop()) throw new Error('not rebuilt yet')
      return next
    })
    const hashes = frames(rebuilt, 3, ['Hero'])
    expect(animatorOf(rebuilt, 'Hero').current).toBe('idle')
    expect(new Set(hashes.Hero).size).toBe(1)
  })
})

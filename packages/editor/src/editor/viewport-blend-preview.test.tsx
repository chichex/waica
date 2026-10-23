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
const rigged = (name: string, x: number, initialClip = 'idle'): SceneEntityJson => ({
  name,
  position: [x, 0, 0],
  components: [{ type: 'Model', props: { src: RIG_URL } }, { type: 'Animator', props: { initialClip, blends: { Move: MOVE } } }],
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

/** The stage's clock in milliseconds: what the live loop is called with and the preview measures (performance.now). */
let clock = 0

/** Runs `count` frames of the live loop, `frameMs` apart (16 by default), returning each named rig's pose hash after each. */
function frames(game: Game, names: readonly string[], { count, frameMs = 16 }: { count: number; frameMs?: number }): Record<string, string[]> {
  const hashes: Record<string, string[]> = Object.fromEntries(names.map((name) => [name, []]))
  const now = vi.spyOn(performance, 'now').mockImplementation(() => clock)
  try {
    for (let frame = 0; frame < count; frame += 1) {
      clock += frameMs
      act(() => defined(liveLoop(), 'the live loop')(clock))
      for (const name of names) hashes[name]?.push(animatorOf(game, name).inspectState().poseHash)
    }
  } finally {
    now.mockRestore()
  }
  return hashes
}

describe('the stage previews a blend on the selected entity alone (issue 205 CA-21)', () => {
  it('plays the blend at the value on that Animator, a step per frame, and leaves the others still', async () => {
    const { mounted, game } = await mountRigs()

    expect(mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 1.5 })).toBeNull()
    // Past the 0.15 s fade from idle into the blend.
    const hashes = frames(game, ['Hero', 'Foe'], { count: 12 })

    expect(animatorOf(game, 'Hero').inspectState()).toMatchObject({ current: 'Move', weights: { walk: 0.5, jump: 0.5 } })
    expect(new Set(hashes.Hero).size).toBe(12)
    expect(new Set(hashes.Foe).size).toBe(1)
    expect(game.simulate).toBe(false)
  })

  it('moves the value of a running preview, and ends it back on the initial clip', async () => {
    const { mounted, game } = await mountRigs()
    mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 0.5 })
    frames(game, ['Hero'], { count: 2 })
    mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 2 })
    frames(game, ['Hero'], { count: 10 })
    expect(animatorOf(game, 'Hero').inspectState().weights).toEqual({ jump: 1 })

    mounted.handle().stopBlendPreview({ entity: 'Hero', blend: 'Move' })
    const after = frames(game, ['Hero'], { count: 3 })
    expect(animatorOf(game, 'Hero').current).toBe('idle')
    expect(new Set(after.Hero).size).toBe(1)
  })

  it('steps the preview by the real time between frames, at most 0.1 s, not by a fixed step per frame', async () => {
    const { mounted, game } = await mountRigs()
    mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 1 })
    // The preview's first frame takes the host's nominal step; then a 30 Hz display.
    frames(game, ['Hero'], { count: 1, frameMs: 1000 / 30 })
    frames(game, ['Hero'], { count: 5, frameMs: 1000 / 30 })
    // walk alone: the blend's time is the seconds it has played, within its 0.8 s cycle.
    expect(animatorOf(game, 'Hero').inspectState().time).toBeCloseTo(1 / 60 + 5 / 30, 4)
    frames(game, ['Hero'], { count: 1, frameMs: 5_000 })

    expect(animatorOf(game, 'Hero').inspectState().time).toBeCloseTo(1 / 60 + 5 / 30 + 0.1, 4)
  })
})

describe('the stage ends a blend preview (issue 205 CA-21)', () => {
  it('as a freshly built stage starts: the parameter forgotten and the rig back in its pose, with a blend as initial clip or none', async () => {
    const scene: SceneJson = { ...SCENE, entities: [rigged('Hero', 0, 'Move'), rigged('Foe', 3, '')] }
    const { mounted, game } = await mountRigs({ scene })
    const before = { Hero: animatorOf(game, 'Hero').inspectState().poseHash, Foe: animatorOf(game, 'Foe').inspectState().poseHash }
    for (const name of ['Hero', 'Foe'] as const) {
      mounted.handle().previewBlend({ entity: name, blend: 'Move', param: 'speed', value: 2 })
      expect(new Set(frames(game, [name], { count: 12 })[name]).has(before[name])).toBe(false)
      mounted.handle().stopBlendPreview({ entity: name, blend: 'Move' })
      frames(game, [name], { count: 2 })
    }

    expect(animatorOf(game, 'Hero').inspectState()).toMatchObject({ current: 'Move', params: { speed: 0 }, poseHash: before.Hero })
    expect(animatorOf(game, 'Foe').inspectState()).toMatchObject({ current: null, poseHash: before.Foe })
  })

  it('only for the blend it was asked to stop', async () => {
    const { mounted, game } = await mountRigs()
    mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 1.5 })
    frames(game, ['Hero'], { count: 2 })
    mounted.handle().stopBlendPreview({ entity: 'Hero', blend: 'Other' })
    mounted.handle().stopBlendPreview({ entity: 'Foe', blend: 'Move' })

    expect(new Set(frames(game, ['Hero'], { count: 4 }).Hero).size).toBe(4)
    expect(animatorOf(game, 'Hero').current).toBe('Move')
  })
})

describe('the stage refuses or drops a blend preview (issue 205 CA-21)', () => {
  it('refuses a preview, saying why: no Animator loaded, a blend or param its build lacks, or Play', async () => {
    const { mounted } = await mountRigs()
    expect(mounted.handle().previewBlend({ entity: 'Nobody', blend: 'Move', param: 'speed', value: 1 })).toBe('not-loaded')
    expect(mounted.handle().previewBlend({ entity: 'Hero', blend: 'Gone', param: 'speed', value: 1 })).toBe('not-built')
    expect(mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'pace', value: 1 })).toBe('not-built')
    removeViewportHost()
    installViewportHost()
    serveRig()

    const play = await mountRigs({ mode: 'play' })
    expect(play.mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 1 })).toBe('play')
  })

  it('drops the preview when the stage rebuilds its Game', async () => {
    const { mounted, game } = await mountRigs()
    mounted.handle().previewBlend({ entity: 'Hero', blend: 'Move', param: 'speed', value: 1.5 })
    frames(game, ['Hero'], { count: 1 })

    mounted.rerender({ epoch: 2 })
    const rebuilt = await vi.waitFor(() => {
      const next = liveGame(mounted)
      if (next === game || !animatorOf(next, 'Hero').inspectState().loaded || !liveLoop()) throw new Error('not rebuilt yet')
      return next
    })
    const hashes = frames(rebuilt, ['Hero'], { count: 3 })
    expect(animatorOf(rebuilt, 'Hero').current).toBe('idle')
    expect(new Set(hashes.Hero).size).toBe(1)
  })
})

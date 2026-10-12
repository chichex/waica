// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { flush } from '../assets/test-helpers.js'
import { authoringDefaults } from '../authoring-defaults.js'
import { loadScene } from '../scene.js'
import { StateMachine } from '../state/state-machine.js'
import { ready3dGame, registryOf, use3dTestEnvironment } from '../test-game-3d.js'
import { bonesOf, quaternionOf, rigEntity, rigGame, step } from '../test-rig.js'
import { defined } from '../test-support.js'
import { Animator } from './animator.js'
import { Model } from './model.js'

use3dTestEnvironment()

afterEach(() => {
  vi.unstubAllGlobals()
})

const BIND = [0, 0, 0, 1]

/** The Animator of the named entity, and its bones. */
async function readyRig(animator: Record<string, unknown>) {
  const game = await rigGame([rigEntity('Rig', animator)])
  await game.assets.ready()
  const entity = defined(game.find('Rig'))
  return { game, entity, animator: defined(entity.get(Animator)), bones: bonesOf(entity) }
}

describe('Animator plays the clips of the Model beside it (issue #166 CA-7)', () => {
  it('declares its name, space, schedule, params and defaults', () => {
    expect(Animator.componentName).toBe('Animator')
    expect(Animator.space).toBe('3d')
    expect(Animator.updateAfter).toEqual(['StateMachine'])
    expect(Animator.params).toEqual({
      initialClip: { label: 'Initial clip' },
      fade: { label: 'Fade (s)', min: 0, max: 1, step: 0.05 },
    })
    expect(authoringDefaults(Animator)).toEqual({ initialClip: '', fade: 0.15, clips: {} })
  })

  it('lists the clips once loaded and moves leg.L away from its bind pose and from leg.R after 48 steps of walk', async () => {
    const { game, animator, bones } = await readyRig({})
    expect(animator.clipNames).toEqual(['idle', 'walk', 'jump'])
    expect(animator.current).toBeUndefined()

    animator.play('walk')
    expect(animator.current).toBe('walk')
    step(game, 48)

    const [, legL, legR] = bones.map(quaternionOf)
    expect(legL).not.toEqual(BIND)
    expect(legL).not.toEqual(legR)
  })

})

describe('Animator one-shots: loop: false, speed and the restart (issue #166 CA-7)', () => {
  it('reports a loop: false clip finished at step 31, not at step 29, and holds its last pose', async () => {
    const { game, animator, bones } = await readyRig({ clips: { jump: { loop: false } } })
    animator.play('jump')
    step(game, 29)
    expect(animator.clipFinished).toBe(false)
    step(game, 2)
    expect(animator.clipFinished).toBe(true)
    const held = quaternionOf(defined(bones[1]))
    expect(held).not.toEqual(BIND)

    step(game, 30)
    expect(quaternionOf(defined(bones[1]))).toEqual(held)
    expect(animator.clipFinished).toBe(true)
  })

  it('finishes jump in half the steps at speed 2', async () => {
    const { game, animator } = await readyRig({ clips: { jump: { loop: false, speed: 2 } } })
    animator.play('jump')
    step(game, 15)
    expect(animator.clipFinished).toBe(false)
    step(game, 1)
    expect(animator.clipFinished).toBe(true)
  })

  it('clears clipFinished on the next play and restarts a finished clip on play(same)', async () => {
    const { game, animator, bones } = await readyRig({ clips: { jump: { loop: false } } })
    animator.play('jump')
    step(game, 31)
    expect(animator.clipFinished).toBe(true)

    animator.play('jump')
    expect(animator.clipFinished).toBe(false)
    step(game, 1)
    const restarted = quaternionOf(defined(bones[1]))
    // One step into the tuck, far from the held 70° pose.
    expect(Math.abs(defined(restarted[0]))).toBeLessThan(0.1)
  })
})

describe('Animator fade, independence and pending plays (issue #166 CA-7)', () => {
  it('switches in one step with fade 0 and blends with a fade', async () => {
    const game = await rigGame([rigEntity('Cut', { fade: 0 }), rigEntity('Blend', { fade: 0.15 }), rigEntity('Fresh', { fade: 0 })])
    await game.assets.ready()
    const animatorOf = (name: string): Animator => defined(defined(game.find(name)).get(Animator))
    for (const name of ['Cut', 'Blend']) animatorOf(name).play('walk')
    step(game, 10)
    for (const name of ['Cut', 'Blend', 'Fresh']) animatorOf(name).play('jump')
    step(game, 1)

    const legOf = (name: string): number[] => quaternionOf(defined(bonesOf(defined(game.find(name)))[1]))
    expect(legOf('Cut')).toEqual(legOf('Fresh'))
    expect(legOf('Blend')).not.toEqual(legOf('Fresh'))
  })

  it('animates two entities on the same glb independently', async () => {
    const game = await rigGame([rigEntity('Walker', { initialClip: 'walk' }), rigEntity('Jumper', { initialClip: 'jump' })])
    await game.assets.ready()
    step(game, 20)

    const legOf = (name: string): number[] => quaternionOf(defined(bonesOf(defined(game.find(name)))[1]))
    expect(legOf('Walker')).not.toEqual(legOf('Jumper'))
    expect(legOf('Walker')).not.toEqual(BIND)
  })

})

describe('Animator pending plays and unknown clips (issue #166 CA-7)', () => {
  it('remembers a play made before the model loaded and applies it on settle; initialClip only when none was requested', async () => {
    const game = await rigGame([rigEntity('Early', { initialClip: 'idle' }), rigEntity('Late', { initialClip: 'idle' })])
    const early = defined(defined(game.find('Early')).get(Animator))
    expect(early.clipNames).toEqual([])
    early.play('walk')
    expect(early.current).toBeUndefined()

    await game.assets.ready()
    expect(early.current).toBe('walk')
    expect(defined(defined(game.find('Late')).get(Animator)).current).toBe('idle')
    step(game, 20)
    expect(quaternionOf(defined(bonesOf(defined(game.find('Early')))[1]))).not.toEqual(BIND)
  })

  it('warns once for an unknown clip and changes nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { animator } = await readyRig({ initialClip: 'idle' })
    animator.play('nope')
    animator.play('nope')
    expect(animator.current).toBe('idle')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('[waica] "Rig": no clip "nope"')
  })
})

describe('Animator guards (issue #166 CA-7)', () => {
  it('creates nothing in a 2D scene and play is a no-op there', async () => {
    const { game } = await ready3dGame()
    loadScene(game, { waicaScene: 3, entities: [] }, registryOf({ Model, Animator, StateMachine }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const entity = game.spawn('Flat')
    entity.add(Model, { src: '/rig.glb' })
    const animator = entity.add(Animator, { initialClip: 'idle' })

    animator.play('walk')
    step(game, 2)
    expect(animator.current).toBeUndefined()
    expect(animator.clipNames).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once in onReady without a Model beside it, or with a primitive one', async () => {
    const game = await rigGame([])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    game.spawn('Bare').add(Animator)
    const box = game.spawn('Box')
    box.add(Model, { shape: 'box' })
    box.add(Animator)
    step(game, 2)
    // The primitive warns at onReady; the absent one at the first step, once a later Model is ruled out.
    expect(warn.mock.calls.map(([message]) => String(message)).sort()).toEqual([
      '[waica] "Bare": Animator needs a Model with a src beside it; nothing plays',
      '[waica] "Box": Animator needs a Model with a src beside it; nothing plays',
    ])
  })

})

describe('Animator attach order and destroy (issue #166 CA-7)', () => {
  it('attaches to a Model spawned after it in the component order', async () => {
    const game = await rigGame([{ name: 'Reversed', components: [{ type: 'Animator', props: { initialClip: 'walk' } }, { type: 'Model', props: { src: '/rig.glb' } }] }])
    await game.assets.ready()
    // The first step attaches; its settle reaction runs before the next frame, as between real frames.
    step(game, 1)
    await flush()
    step(game, 20)
    const entity = defined(game.find('Reversed'))
    expect(defined(entity.get(Animator)).current).toBe('walk')
    expect(quaternionOf(defined(bonesOf(entity)[1]))).not.toEqual(BIND)
  })

  it('stops every action on destroy and keeps stepping without it', async () => {
    const { game, entity, animator } = await readyRig({ initialClip: 'walk' })
    step(game, 5)
    entity.destroy()
    expect(() => step(game, 5)).not.toThrow()
    expect(animator.clipNames).toEqual([])
  })
})

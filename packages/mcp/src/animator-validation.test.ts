import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject, type ProjectValidationReport } from './validation.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const RIG = path.resolve(here, '../../engine/fixtures/rig.glb')

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

/** The scene JSON of one 3D scene whose Player holds the given components. */
function scene3d(components: unknown[], space: '2d' | '3d' = '3d'): string {
  return JSON.stringify({
    waicaScene: 3,
    render: { space },
    ...(space === '3d' ? { camera: { kind: 'perspective' } } : {}),
    entities: [{ name: 'Player', components }],
  })
}

/** A project with the rig under src/art and the given main scene. */
async function rigProject(scene: string, extra: Record<string, string | Uint8Array> = {}): Promise<ProjectValidationReport> {
  const project = await makeProject({ 'src/art/rig.glb': new Uint8Array(await readFile(RIG)), 'src/scenes/main.scene.json': scene, ...extra })
  roots.push(project)
  return validateProject(project)
}

/** The scene JSON of one 3D scene holding the given entities. */
function sceneOf(entities: unknown[]): string {
  return JSON.stringify({ waicaScene: 3, render: { space: '3d' }, camera: { kind: 'perspective' }, entities })
}

/** A character prefab holding the given components. */
function prefabOf(components: unknown[]): string {
  return JSON.stringify({ waicaPrefab: 1, type: 'character', components })
}

const MODEL = { type: 'Model', props: { src: 'src/art/rig.glb' } }
const machine = (states: Record<string, unknown>) => ({ type: 'StateMachine', props: { initial: 'idle', states } })

const codes = (result: ProjectValidationReport, code: string) => result.findings.filter((finding) => finding.code === code)

describe('validate_project knows the Animator (issue #166 CA-9)', () => {
  it('reports animator-without-model for an Animator with no Model src beside it', async () => {
    const bare = await rigProject(scene3d([{ type: 'Animator' }]))
    expect(codes(bare, 'animator-without-model')).toMatchObject([{ severity: 'error', file: 'src/scenes/main.scene.json', ref: 'Player' }])
    const primitive = await rigProject(scene3d([{ type: 'Model', props: { shape: 'box' } }, { type: 'Animator' }]))
    expect(codes(primitive, 'animator-without-model')).toHaveLength(1)
    const fine = await rigProject(scene3d([MODEL, { type: 'Animator' }]))
    expect(codes(fine, 'animator-without-model')).toEqual([])
  })

  it("checks a sibling machine's state clips against the glb: a warning for a state's own name, an error for an explicit clip", async () => {
    const result = await rigProject(scene3d([MODEL, { type: 'Animator' }, machine({ idle: {}, walk: {}, attack: {}, dash: { clip: 'Dash' } })]))
    expect(codes(result, 'missing-clip').map(({ severity, ref, message }) => ({ severity, ref, message }))).toEqual([
      { severity: 'warning', ref: 'Player', message: 'State "attack" uses missing animation clip "attack".' },
      { severity: 'error', ref: 'StateMachine.states.dash.clip', message: 'State "dash" uses missing animation clip "Dash".' },
    ])
  })

  it('checks initialClip and every clips override key against the glb, as errors', async () => {
    const result = await rigProject(scene3d([MODEL, { type: 'Animator', props: { initialClip: 'Idle', clips: { jump: { loop: false }, Fly: { speed: 2 } } } }]))
    expect(codes(result, 'missing-clip').map(({ severity, ref }) => ({ severity, ref }))).toEqual([
      { severity: 'error', ref: 'Animator.initialClip' },
      { severity: 'error', ref: 'Animator.clips.Fly' },
    ])
  })

})

describe('validate_project knows the Animator: loops, .gltf, absent files, 2D (issue #166 CA-9)', () => {
  it('takes the loop source for clip-end-on-looping-clip from the clips overrides', async () => {
    const looping = await rigProject(scene3d([MODEL, { type: 'Animator' }, machine({ idle: {}, jump: { transitions: [{ on: 'clip:end', to: 'idle' }] } })]))
    expect(codes(looping, 'clip-end-on-looping-clip')).toHaveLength(1)
    const oneShot = await rigProject(scene3d([MODEL, { type: 'Animator', props: { clips: { jump: { loop: false } } } }, machine({ idle: {}, jump: { transitions: [{ on: 'clip:end', to: 'idle' }] } })]))
    expect(codes(oneShot, 'clip-end-on-looping-clip')).toEqual([])
  })

  it('reads a .gltf as JSON, and reports only missing-model for a file that is absent', async () => {
    const gltf = JSON.stringify({ asset: { version: '2.0' }, animations: [{ name: 'Idle' }], buffers: [] })
    const result = await rigProject(scene3d([{ type: 'Model', props: { src: 'src/art/hero.gltf' } }, { type: 'Animator', props: { initialClip: 'Idle' } }, machine({ idle: { clip: 'Idle' }, walk: {} })]), { 'src/art/hero.gltf': gltf })
    expect(codes(result, 'missing-clip').map(({ ref }) => ref)).toEqual(['Player'])

    const absent = await rigProject(scene3d([{ type: 'Model', props: { src: 'src/art/gone.glb' } }, { type: 'Animator', props: { initialClip: 'Idle' } }, machine({ idle: {} })]))
    expect(codes(absent, 'missing-model')).toHaveLength(1)
    expect(codes(absent, 'missing-clip')).toEqual([])
    expect(codes(absent, 'animator-without-model')).toEqual([])
  })

  it('is a component-space-mismatch in a 2D scene', async () => {
    const result = await rigProject(scene3d([MODEL, { type: 'Animator' }], '2d'))
    expect(codes(result, 'component-space-mismatch').map(({ message }) => message)).toEqual(
      expect.arrayContaining([expect.stringContaining('"Animator"')]),
    )
  })
})

describe('validate_project, the Animator and prefabs (review of PR #168)', () => {
  it('reports a missing initialClip once, for the prefab, not again for each plain instance', async () => {
    const result = await rigProject(sceneOf([{ name: 'A', prefab: 'characters/hero' }, { name: 'B', prefab: 'characters/hero' }]), {
      'src/characters/hero.character.json': prefabOf([MODEL, { type: 'Animator', props: { initialClip: 'Idle' } }]),
    })

    expect(codes(result, 'missing-clip').map(({ file, ref }) => [file, ref])).toEqual([['src/characters/hero.character.json', 'Animator.initialClip']])
  })

  it('reports animator-without-model per entity, like the physics composition: an instance that completes the prefab passes, a plain one reports under its name', async () => {
    const result = await rigProject(
      sceneOf([
        { name: 'Skinned', prefab: 'characters/bare', overrides: { Model: { src: 'src/art/rig.glb' } } },
        { name: 'Inline', prefab: 'characters/naked', components: [MODEL] },
        { name: 'Bare', prefab: 'characters/bare' },
      ]),
      {
        'src/characters/bare.character.json': prefabOf([{ type: 'Model' }, { type: 'Animator' }]),
        'src/characters/naked.character.json': prefabOf([{ type: 'Animator' }]),
      },
    )

    expect(codes(result, 'animator-without-model').map(({ file, ref }) => [file, ref])).toEqual([['src/scenes/main.scene.json', 'Bare']])
  })

  it('keeps the prefab-level state findings single when an override touches Model.color or Animator.fade, and re-checks an instance whose Model.src changes the clips', async () => {
    const gltf = JSON.stringify({ asset: { version: '2.0' }, animations: [{ name: 'idle' }, { name: 'attack' }], buffers: [] })
    const result = await rigProject(
      sceneOf([
        { name: 'Tinted', prefab: 'characters/hero', overrides: { Model: { color: 16711680 } } },
        { name: 'Soft', prefab: 'characters/hero', overrides: { Animator: { fade: 0.3 } } },
        { name: 'Reskinned', prefab: 'characters/hero', overrides: { Model: { src: 'src/art/other.gltf' } } },
      ]),
      {
        'src/characters/hero.character.json': prefabOf([MODEL, { type: 'Animator', props: { initialClip: 'idle' } }, machine({ idle: {}, attack: {} })]),
        'src/art/other.gltf': gltf,
      },
    )

    expect(codes(result, 'missing-clip').map(({ file, ref, message }) => [file, ref, message])).toEqual([
      ['src/characters/hero.character.json', 'characters/hero', 'State "attack" uses missing animation clip "attack".'],
    ])
  })
})

/** A blend over two of the rig's clips. */
const BLEND = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }] }
const animatorWith = (props: Record<string, unknown>) => ({ type: 'Animator', props })
const findingsOf = (result: ProjectValidationReport, code: string) => codes(result, code).map(({ severity, file, ref }) => ({ severity, file, ref }))
const SCENE = 'src/scenes/main.scene.json'

describe('validate_project counts an Animator’s blends as its clips (issue #205 CA-12)', () => {
  it('accepts a blend of the same Animator as initialClip, as a clips key and as a state’s clip', async () => {
    const animator = animatorWith({ initialClip: 'Move', clips: { Move: { fade: 0.1 } }, blends: { Move: BLEND } })
    const result = await rigProject(scene3d([MODEL, animator, machine({ idle: { clip: 'Move' }, walk: {}, jump: {} })]))

    expect(codes(result, 'missing-clip')).toEqual([])
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([])
  })

  it('warns clip-end-on-looping-clip for a state that leaves on clip:end while it plays a blend', async () => {
    const states = { idle: { clip: 'Move', transitions: [{ on: 'clip:end', to: 'walk' }] }, walk: {}, jump: {} }
    const result = await rigProject(scene3d([MODEL, animatorWith({ blends: { Move: BLEND } }), machine(states)]))

    expect(findingsOf(result, 'clip-end-on-looping-clip')).toEqual([{ severity: 'warning', file: SCENE, ref: 'Player' }])
    expect(codes(result, 'clip-end-on-looping-clip').map(({ message }) => message)).toEqual([
      'State "idle" leaves on clip:end, but its clip "Move" is a blend, which never ends; leave this state on another trigger.',
    ])
  })

})

describe('validate_project and the clips entry of a blend (issue #205 CA-12)', () => {
  it('warns blend-clip-override-ignored for a clips entry on a blend that sets more than its fade', async () => {
    const clips = { Move: { fade: 0.1, speed: 2, loop: false }, Stride: { fade: 0.2 }, walk: { speed: 2 } }
    const result = await rigProject(scene3d([MODEL, animatorWith({ clips, blends: { Move: BLEND, Stride: BLEND } })]))

    expect(codes(result, 'blend-clip-override-ignored').map(({ severity, ref, message }) => ({ severity, ref, message }))).toEqual([
      { severity: 'warning', ref: 'Animator.clips.Move', message: 'Animator clips.Move is a blend: only its fade applies, so speed and loop are ignored (a blend plays each point at its own clip\'s speed).' },
    ])
  })
})

describe('validate_project checks each blend’s points against the glb (issue #205 CA-13)', () => {
  it('reports missing-clip for a point whose clip the glb lacks, a point naming another blend included', async () => {
    const points = [{ clip: 'idle', at: 0 }, { clip: 'run', at: 1 }, { clip: 'Other', at: 2 }]
    const result = await rigProject(scene3d([MODEL, animatorWith({ blends: { Move: { param: 'speed', points }, Other: BLEND } })]))

    expect(findingsOf(result, 'missing-clip')).toEqual([
      { severity: 'error', file: SCENE, ref: 'Animator.blends.Move.points.1.clip' },
      { severity: 'error', file: SCENE, ref: 'Animator.blends.Move.points.2.clip' },
    ])
    expect(codes(result, 'missing-clip').map(({ message }) => message)).toEqual([
      'Animator blend "Move" point 1 names missing animation clip "run".',
      'Animator blend "Move" point 2 names missing animation clip "Other" (a blend; blends do not nest).',
    ])
  })

  it('reports a blend named like a clip of the glb', async () => {
    const result = await rigProject(scene3d([MODEL, animatorWith({ blends: { walk: BLEND } })]))

    expect(findingsOf(result, 'blend-name-collides-with-clip')).toEqual([{ severity: 'error', file: SCENE, ref: 'Animator.blends.walk' }])
  })

  it('warns about a point whose clip plays once', async () => {
    const points = [{ clip: 'idle', at: 0 }, { clip: 'jump', at: 1 }]
    const result = await rigProject(scene3d([MODEL, animatorWith({ clips: { jump: { loop: false } }, blends: { Move: { param: 'speed', points } } })]))

    expect(findingsOf(result, 'blend-point-one-shot')).toEqual([{ severity: 'warning', file: SCENE, ref: 'Animator.blends.Move.points.1.clip' }])
  })
})

describe('validate_project checks each blend’s shape (issue #205 CA-13)', () => {
  it('reports thresholds that do not strictly increase', async () => {
    const tied = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }, { clip: 'jump', at: 1 }] }
    const reversed = { param: 'speed', points: [{ clip: 'walk', at: 1 }, { clip: 'idle', at: 0 }] }
    const result = await rigProject(scene3d([MODEL, animatorWith({ blends: { Tied: tied, Reversed: reversed, Move: BLEND } })]))

    expect(findingsOf(result, 'blend-thresholds-not-increasing')).toEqual([
      { severity: 'error', file: SCENE, ref: 'Animator.blends.Tied' },
      { severity: 'error', file: SCENE, ref: 'Animator.blends.Reversed' },
    ])
  })

  it('reports a malformed blend: no param, no points, a point with no clip, a negative or non-numeric at, a negative or non-numeric smoothing', async () => {
    const blends = {
      NoParam: { points: BLEND.points },
      NoPoints: { param: 'speed', points: [] },
      Clipless: { param: 'speed', points: [{ at: 0 }, { clip: 'walk', at: 1 }] },
      Below: { param: 'speed', points: [{ clip: 'idle', at: -1 }, { clip: 'walk', at: 1 }] },
      Wordy: { param: 'speed', points: [{ clip: 'idle', at: 'zero' }, { clip: 'walk', at: 1 }] },
      Backwards: { ...BLEND, smoothing: -0.1 },
      Slow: { ...BLEND, smoothing: 'slow' },
      Move: { ...BLEND, smoothing: 0 },
    }
    const result = await rigProject(scene3d([MODEL, animatorWith({ blends })]))

    expect(findingsOf(result, 'invalid-blend').map(({ ref }) => ref)).toEqual(['NoParam', 'NoPoints', 'Clipless', 'Below', 'Wordy', 'Backwards', 'Slow'].map((name) => `Animator.blends.${name}`))
    expect(codes(result, 'invalid-blend').every((finding) => finding.severity === 'error')).toBe(true)
    // The point with no clip is invalid-blend's alone: no missing-clip besides.
    expect(codes(result, 'missing-clip').map(({ ref }) => ref)).toEqual([])
  })

  it('reports a per-clip fade that is negative or not a number, wherever the glb stands', async () => {
    const clips = { walk: { fade: -0.1 }, jump: { fade: 'fast' }, idle: { fade: 0 } }
    const result = await rigProject(scene3d([{ type: 'Model', props: { src: 'src/art/gone.glb' } }, animatorWith({ clips })]))

    expect(findingsOf(result, 'invalid-clip-fade')).toEqual([
      { severity: 'error', file: SCENE, ref: 'Animator.clips.walk.fade' },
      { severity: 'error', file: SCENE, ref: 'Animator.clips.jump.fade' },
    ])
  })
})

describe('validate_project and a blends prop that is not an object (issue #205 CA-13)', () => {
  it('reports invalid-blend for a blends prop that is not an object of blends by name', async () => {
    const result = await rigProject(
      sceneOf([
        { name: 'Listed', components: [MODEL, animatorWith({ blends: [BLEND] })] },
        { name: 'Worded', components: [MODEL, animatorWith({ blends: 'Move' })] },
        { name: 'Fine', components: [MODEL, animatorWith({ blends: { Move: BLEND } })] },
      ]),
    )

    expect(codes(result, 'invalid-blend').map(({ severity, ref, message }) => ({ severity, ref, message }))).toEqual([
      { severity: 'error', ref: 'Animator.blends', message: 'Animator blends must be an object of blends by name; none plays.' },
      { severity: 'error', ref: 'Animator.blends', message: 'Animator blends must be an object of blends by name; none plays.' },
    ])
  })

})

describe('validate_project re-checks only the Animator props an instance changes (issue #205 CA-13)', () => {
  it('reports a prefab’s bad fade and malformed blend once, not again for instances that only change initialClip or Model.src', async () => {
    const animator = animatorWith({ clips: { walk: { fade: -1 } }, blends: { NoParam: { points: BLEND.points } } })
    const result = await rigProject(
      sceneOf([
        { name: 'Idle', prefab: 'characters/hero', overrides: { Animator: { initialClip: 'idle' } } },
        { name: 'Walk', prefab: 'characters/hero', overrides: { Animator: { initialClip: 'walk' } } },
        { name: 'Reskinned', prefab: 'characters/hero', overrides: { Model: { src: 'src/art/rig.glb' } } },
      ]),
      { 'src/characters/hero.character.json': prefabOf([MODEL, animator]) },
    )

    const prefab = 'src/characters/hero.character.json'
    expect(codes(result, 'invalid-clip-fade').map(({ file }) => file)).toEqual([prefab])
    expect(codes(result, 'invalid-blend').map(({ file }) => file)).toEqual([prefab])
  })

  it('re-checks the fades of an instance that overrides clips, and the blends of one that overrides blends', async () => {
    const result = await rigProject(
      sceneOf([
        { name: 'Faded', prefab: 'characters/hero', overrides: { Animator: { clips: { walk: { fade: -1 } } } } },
        { name: 'Bent', prefab: 'characters/hero', overrides: { Animator: { blends: { NoParam: { points: BLEND.points } } } } },
      ]),
      { 'src/characters/hero.character.json': prefabOf([MODEL, animatorWith({})]) },
    )

    expect(codes(result, 'invalid-clip-fade').map(({ file, ref }) => [file, ref])).toEqual([[SCENE, 'Animator.clips.walk.fade']])
    expect(codes(result, 'invalid-blend').map(({ file, ref }) => [file, ref])).toEqual([[SCENE, 'Animator.blends.NoParam']])
  })
})

describe('validate_project, blends and prefab instances (issue #205 CA-13)', () => {
  it('re-checks a scene instance that overrides blends: its points and the states that play them', async () => {
    const result = await rigProject(
      sceneOf([
        { name: 'Plain', prefab: 'characters/hero' },
        { name: 'Broken', prefab: 'characters/hero', overrides: { Animator: { blends: { Move: { param: 'speed', points: [{ clip: 'run', at: 0 }] } } } } },
        { name: 'Renamed', prefab: 'characters/hero', overrides: { Animator: { blends: { Stride: BLEND } } } },
      ]),
      { 'src/characters/hero.character.json': prefabOf([MODEL, animatorWith({ blends: { Move: BLEND } }), machine({ idle: { clip: 'Move' }, walk: {}, jump: {} })]) },
    )

    expect(codes(result, 'missing-clip').map(({ file, ref }) => [file, ref])).toEqual([
      [SCENE, 'Animator.blends.Move.points.0.clip'],
      [SCENE, 'StateMachine.states.idle.clip'],
    ])
  })
})

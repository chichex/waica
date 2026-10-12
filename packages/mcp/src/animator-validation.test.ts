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

import type { ArchetypeArt } from '@waica/engine'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, tempDir, writeTree } from './test-helpers.js'
import {
  isBoundAction,
  projectSoundRefs,
  resolveParamReference,
  type ParamReferenceResolutionContext,
} from './param-reference-resolution.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const BASE_CONTEXT: ParamReferenceResolutionContext = {
  prefabRefs: new Set(['objects/target']),
  animation: undefined,
  bindings: { shoot: ['KeyF'], empty: [] },
  declaredStats: new Set(['health']),
  soundRefs: new Set(['waica:iso-hit', 'src/art/hurt.ogg']),
}

function check(
  overrides: Partial<Parameters<typeof resolveParamReference>[0]>,
): Parameters<typeof resolveParamReference>[0] {
  return {
    componentType: 'RefComponent',
    param: 'target',
    ref: 'prefab',
    value: '',
    clips: undefined,
    file: 'src/objects/owner.object.json',
    field: 'RefComponent.target',
    ...overrides,
  }
}

describe('resolveParamReference', () => {
  it('accepts a prefab ref that exists and flags one that does not', () => {
    expect(
      resolveParamReference(check({ ref: 'prefab', value: 'objects/target' }), BASE_CONTEXT),
    ).toBeUndefined()

    expect(
      resolveParamReference(check({ ref: 'prefab', value: 'objects/missing' }), BASE_CONTEXT),
    ).toEqual({
      severity: 'error',
      code: 'broken-prefab-ref',
      message: 'Component "RefComponent" param "target" references missing prefab "objects/missing".',
      file: 'src/objects/owner.object.json',
      ref: 'RefComponent.target',
    })
  })

  it('accepts a clip present on the sibling AnimatedSprite and flags one that is missing', () => {
    const clips = new Set(['idle'])
    expect(
      resolveParamReference(check({ ref: 'clip', value: 'idle', clips }), BASE_CONTEXT),
    ).toBeUndefined()

    expect(
      resolveParamReference(check({ ref: 'clip', value: 'run', clips }), BASE_CONTEXT),
    ).toEqual({
      severity: 'error',
      code: 'missing-clip',
      message: 'Component "RefComponent" param "target" references missing animation clip "run".',
      file: 'src/objects/owner.object.json',
      ref: 'RefComponent.target',
    })
  })

  it('skips a clip check entirely when there is no sibling AnimatedSprite', () => {
    expect(
      resolveParamReference(check({ ref: 'clip', value: 'anything', clips: undefined }), BASE_CONTEXT),
    ).toBeUndefined()
  })

  it('accepts a bound action and warns on an unbound one', () => {
    expect(
      resolveParamReference(check({ ref: 'action', value: 'shoot' }), BASE_CONTEXT),
    ).toBeUndefined()

    expect(
      resolveParamReference(check({ ref: 'action', value: 'jump' }), BASE_CONTEXT),
    ).toEqual({
      severity: 'warning',
      code: 'input-action-unbound',
      message: 'Component "RefComponent" param "target" references unbound input action "jump".',
      file: 'src/objects/owner.object.json',
      ref: 'RefComponent.target',
    })
  })

  it('accepts a declared stat and warns on an undeclared one', () => {
    expect(
      resolveParamReference(check({ ref: 'stat', value: 'health' }), BASE_CONTEXT),
    ).toBeUndefined()

    expect(
      resolveParamReference(check({ ref: 'stat', value: 'mana' }), BASE_CONTEXT),
    ).toEqual({
      severity: 'warning',
      code: 'undeclared-stat',
      message: 'Component "RefComponent" param "target" references undeclared stat "mana"; runtime writes may still create it.',
      file: 'src/objects/owner.object.json',
      ref: 'RefComponent.target',
    })
  })

  it('accepts a sound ref resolved either through the archetype uri or a project src/art/ path, and flags neither', () => {
    expect(
      resolveParamReference(check({ ref: 'sound', value: 'waica:iso-hit' }), BASE_CONTEXT),
    ).toBeUndefined()
    expect(
      resolveParamReference(check({ ref: 'sound', value: 'src/art/hurt.ogg' }), BASE_CONTEXT),
    ).toBeUndefined()

    expect(
      resolveParamReference(check({ ref: 'sound', value: 'src/art/missing.ogg' }), BASE_CONTEXT),
    ).toEqual({
      severity: 'error',
      code: 'missing-sound',
      message: 'Component "RefComponent" param "target" references missing sound "src/art/missing.ogg".',
      file: 'src/objects/owner.object.json',
      ref: 'RefComponent.target',
    })
  })
})

describe('isBoundAction', () => {
  it('is true only for an own key with a non-empty binding array', () => {
    const bindings = { shoot: ['KeyF'], empty: [] }
    expect(isBoundAction(bindings, 'shoot')).toBe(true)
    expect(isBoundAction(bindings, 'empty')).toBe(false)
    expect(isBoundAction(bindings, 'missing')).toBe(false)
  })

  it('does not mistake an inherited Object.prototype member for a binding', () => {
    expect(isBoundAction({ shoot: ['KeyF'] }, 'constructor')).toBe(false)
    expect(isBoundAction({ shoot: ['KeyF'] }, 'toString')).toBe(false)
  })
})

const SOUND_ART: ArchetypeArt[] = [
  { file: 'sprite.png', uri: 'waica:sprite', kind: 'image' },
  { file: 'hit.ogg', uri: 'waica:hit', kind: 'sound' },
  { file: 'bed.ogg', uri: 'waica:bed', kind: 'sound' },
]

describe('projectSoundRefs', () => {
  it('includes only the archetype art entries of kind "sound", by their registry uri', async () => {
    const project = await tempDir()
    roots.push(project)

    const refs = await projectSoundRefs(project, SOUND_ART)

    expect(refs).toEqual(new Set(['waica:hit', 'waica:bed']))
  })

  it('adds every .ogg file directly under the project src/art/, as its src/art/ path — not recursively, and not other extensions', async () => {
    // Matches what the shipped runtime can actually resolve:
    // `import.meta.glob('./art/*')` (examples/isometric/src/main.ts and
    // packages/editor/template/src/main.ts) never crosses a `/`, so a
    // sound nested under src/art/Sounds/ 404s exactly like a non-.ogg
    // file would never decode as one — this validator must not bless
    // either.
    const project = await tempDir()
    roots.push(project)
    await writeTree(project, {
      'src/art/swing.ogg': new Uint8Array([1, 2, 3]),
      'src/art/Sounds/boom.ogg': new Uint8Array([4, 5, 6]),
      'src/art/sprite.png': new Uint8Array([7]),
    })

    const refs = await projectSoundRefs(project, [])

    expect(refs).toEqual(new Set(['src/art/swing.ogg']))
  })

  it('tolerates a missing src/art/ directory and returns just the archetype refs', async () => {
    const project = await tempDir()
    roots.push(project)

    const refs = await projectSoundRefs(project, SOUND_ART)

    expect(refs).toEqual(new Set(['waica:hit', 'waica:bed']))
  })
})

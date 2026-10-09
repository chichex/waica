import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { projectModelRefs } from './model-reference-validation.js'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'

// A checkout without built @waica dists compiles the package sources once per
// process before its first project-component load (project-component-fallbacks.ts).
beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46])

function threeD(entities: unknown[]): string {
  return JSON.stringify({
    waicaScene: 3,
    render: { space: '3d' },
    camera: { kind: 'perspective' },
    entities,
  })
}

const model = (props: Record<string, unknown>) => ({ name: 'Tree', components: [{ type: 'Model', props }] })

async function modelFindings(files: Record<string, string | Uint8Array>) {
  const project = await makeProject(files)
  roots.push(project)
  const result = await validateProject(project)
  return result.findings.filter((finding) => finding.code === 'missing-model' || finding.code === 'model-shape-ignored')
}

describe('Model.src references (CA-15)', () => {
  it('accepts a .glb or .gltf directly under src/art, and an empty src', async () => {
    const findings = await modelFindings({
      'src/art/tree.glb': GLB,
      'src/art/rock.gltf': '{}',
      'src/scenes/main.scene.json': threeD([
        model({ src: 'src/art/tree.glb' }),
        { ...model({ src: 'src/art/rock.gltf' }), name: 'Rock' },
        { ...model({ shape: 'sphere' }), name: 'Ball' },
      ]),
    })
    expect(findings).toEqual([])
  })

  it('reports a missing file as an error naming the component, the param and the value', async () => {
    const findings = await modelFindings({
      'src/scenes/main.scene.json': threeD([model({ src: 'src/art/gone.glb' })]),
    })
    expect(findings).toEqual([
      {
        severity: 'error',
        code: 'missing-model',
        message: 'Component "Model" param "src" references missing model "src/art/gone.glb".',
        file: 'src/scenes/main.scene.json',
        ref: 'Model.src',
      },
    ])
  })

})

describe('Model.src references, what is not blessed (CA-15)', () => {
  it('does not bless a model one folder deeper, under public/, or of another extension', async () => {
    const findings = await modelFindings({
      'src/art/deep/tree.glb': GLB,
      'public/tree.glb': GLB,
      'src/art/tree.png': GLB,
      'src/scenes/main.scene.json': threeD([
        model({ src: 'src/art/deep/tree.glb' }),
        { ...model({ src: 'public/tree.glb' }), name: 'B' },
        { ...model({ src: 'src/art/tree.png' }), name: 'C' },
      ]),
    })
    expect(findings.map((finding) => finding.code)).toEqual(['missing-model', 'missing-model', 'missing-model'])
  })

  it('checks a prefab\'s Model too, reporting it at the prefab file', async () => {
    const findings = await modelFindings({
      'src/objects/tree.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [{ type: 'Model', props: { src: 'src/art/gone.glb' } }],
      }),
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ code: 'missing-model', file: 'src/objects/tree.object.json', ref: 'Model.src' })
  })
})

describe('Model with both src and shape (inference 10)', () => {
  it('warns that src wins when a scene declares both', async () => {
    const findings = await modelFindings({
      'src/art/tree.glb': GLB,
      'src/scenes/main.scene.json': threeD([model({ src: 'src/art/tree.glb', shape: 'sphere' })]),
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ severity: 'warning', code: 'model-shape-ignored', ref: 'Tree' })
  })

  it('stays quiet when only one of them is declared', async () => {
    const findings = await modelFindings({
      'src/art/tree.glb': GLB,
      'src/scenes/main.scene.json': threeD([model({ src: 'src/art/tree.glb' }), { ...model({ shape: 'box' }), name: 'B' }]),
    })
    expect(findings).toEqual([])
  })
})

describe('projectModelRefs (CA-15)', () => {
  it('lists the archetype\'s model art by registry uri and the project\'s own .glb/.gltf by path', async () => {
    const project = await makeProject({ 'src/art/tree.glb': GLB, 'src/art/hero.png': GLB, 'src/art/sub/deep.glb': GLB })
    roots.push(project)

    const refs = await projectModelRefs(project, [
      { file: 'tree.glb', uri: 'waica:tree', kind: 'model' },
      { file: 'hero.png', uri: 'waica:hero', kind: 'image' },
    ])

    expect([...refs].sort()).toEqual(['src/art/tree.glb', 'waica:tree'])
  })
})

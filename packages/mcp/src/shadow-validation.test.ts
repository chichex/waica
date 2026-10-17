import { afterEach, beforeAll, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'

beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const messageContaining = (text: string): unknown => expect.stringContaining(text)

it('validate_project reports an unknown shadow profile at its scene field (issue #203 CA-3)', async () => {
  const project = await makeProject({
    'src/scenes/main.scene.json': JSON.stringify({
      waicaScene: 3,
      render: { space: '3d', shadows: { quality: 'ultra' } },
      camera: { kind: 'perspective' },
      entities: [],
    }),
  })
  roots.push(project)

  const { findings } = await validateProject(project)

  expect(findings.filter((finding) => finding.code === 'invalid-scene-render')).toEqual([
    expect.objectContaining({
      severity: 'error',
      file: 'src/scenes/main.scene.json',
      ref: 'render.shadows.quality',
      message: messageContaining('ultra'),
    }),
  ])
})

it('reports invalid shadow parameters in inline, prefab, instance and parameter-file data (CA-3)', async () => {
  const project = await makeProject({
    'src/scenes/main.scene.json': JSON.stringify({
      waicaScene: 3,
      render: { space: '3d', shadows: { quality: 'off' } },
      camera: { kind: 'perspective' },
      entities: [
        { name: 'Inline', components: [{ type: 'Sun', props: { shadowMapSize: 300 } }] },
        { name: 'Lamp', prefab: 'objects/lamp', overrides: { PointLight: { shadowRadius: 9 } } },
      ],
    }),
    'src/objects/lamp.object.json': JSON.stringify({
      waicaPrefab: 1,
      type: 'object',
      components: [{ type: 'PointLight', props: { shadowMaxDistance: -1 } }],
    }),
    'public/waica.params.json': JSON.stringify({ Inline: { Model: { receiveShadows: 'false' } } }),
  })
  roots.push(project)

  const { findings } = await validateProject(project)
  const shadows = findings.filter((finding) => finding.code === 'invalid-shadow-param')

  expect(shadows).toHaveLength(4)
  expect(shadows).toEqual(expect.arrayContaining([
    expect.objectContaining({ file: 'src/scenes/main.scene.json', ref: 'Inline', message: messageContaining('shadowMapSize') }),
    expect.objectContaining({ file: 'src/scenes/main.scene.json', ref: 'Lamp', message: messageContaining('shadowRadius') }),
    expect.objectContaining({ file: 'src/objects/lamp.object.json', ref: 'objects/lamp', message: messageContaining('shadowMaxDistance') }),
    expect.objectContaining({ file: 'public/waica.params.json', ref: 'Inline', message: messageContaining('receiveShadows') }),
  ]))
})

it('accepts inherited null, explicit zero and false without changing the scene policy (CA-3)', async () => {
  const project = await makeProject({
    'src/scenes/main.scene.json': JSON.stringify({
      waicaScene: 3,
      render: { space: '3d', shadows: { quality: 'off', maxDistance: 40 } },
      camera: { kind: 'perspective' },
      entities: [
        { name: 'Ground', components: [{ type: 'Model', props: { castShadows: false, receiveShadows: false } }] },
        { name: 'Sun', components: [{ type: 'Sun', props: { shadowMapSize: null, shadowBias: 0, shadowNormalBias: 0, shadowRadius: 0 } }] },
        { name: 'Lamp', prefab: 'objects/lamp', overrides: { PointLight: { shadowMapSize: null } } },
      ],
    }),
    'src/objects/lamp.object.json': JSON.stringify({
      waicaPrefab: 1,
      type: 'object',
      components: [{ type: 'PointLight', props: { shadowMapSize: 1024, shadowMaxDistance: 0.01 } }],
    }),
    'public/waica.params.json': JSON.stringify({ Lamp: { PointLight: { castShadows: false, shadowRadius: null } } }),
  })
  roots.push(project)

  const { findings } = await validateProject(project)

  expect(findings.filter((finding) => finding.code === 'invalid-shadow-param' || finding.code === 'invalid-scene-render')).toEqual([])
})

it('reports scene shadows in 2D and still validates fields when the profile is Off (CA-3)', async () => {
  const project = await makeProject({
    'src/scenes/main.scene.json': JSON.stringify({
      waicaScene: 3,
      render: { shadows: { quality: 'off', maxDistance: -1 } },
      entities: [],
    }),
  })
  roots.push(project)

  const { findings } = await validateProject(project)

  expect(findings.filter((finding) => finding.code === 'invalid-scene-render').map((finding) => finding.ref)).toEqual([
    'render.shadows', 'render.shadows.maxDistance',
  ])
})

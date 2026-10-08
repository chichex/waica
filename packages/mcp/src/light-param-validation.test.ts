import { afterEach, expect, it } from 'vitest'
import { cleanup, makeProject } from './test-helpers.js'
import { lightParamFindings } from './light-param-validation.js'
import { validateProject } from './validation.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

it('lightParamFindings (review, inference 12): names each Light param outside its range', () => {
  expect(lightParamFindings({ radius: -1, intensity: -0.5, bands: 40, softness: 3, color: 0xffffff }, 'f.json', 'Torch')).toEqual([
    { severity: 'error', code: 'invalid-light-param', message: 'Light "Torch": radius must be at least 0; got -1.', file: 'f.json', ref: 'Torch' },
    { severity: 'error', code: 'invalid-light-param', message: 'Light "Torch": intensity must be at least 0; got -0.5.', file: 'f.json', ref: 'Torch' },
    { severity: 'error', code: 'invalid-light-param', message: 'Light "Torch": bands must be an integer from 0 to 16; got 40.', file: 'f.json', ref: 'Torch' },
    { severity: 'error', code: 'invalid-light-param', message: 'Light "Torch": softness must be a number from 0 to 1; got 3.', file: 'f.json', ref: 'Torch' },
  ])
  expect(lightParamFindings({ bands: 2.5 }, 'f.json', 'Torch').map((finding) => finding.message)).toEqual([
    'Light "Torch": bands must be an integer from 0 to 16; got 2.5.',
  ])
  expect(lightParamFindings({ radius: 4, intensity: 2, bands: 3, softness: 0.5 }, 'f.json', 'Torch')).toEqual([])
  expect(lightParamFindings(undefined, 'f.json', 'Torch')).toEqual([])
})

it('validate_project reports out-of-range Light params in prefabs, inline components and scene overrides (review)', async () => {
  const project = await makeProject({
    'src/objects/torch.object.json': JSON.stringify({
      waicaPrefab: 1,
      type: 'object',
      components: [{ type: 'Light', props: { softness: 2 } }],
    }),
    'src/scenes/main.scene.json': JSON.stringify({
      waicaScene: 3,
      entities: [
        { name: 'Inline', components: [{ type: 'Light', props: { bands: -1 } }] },
        { name: 'Override', prefab: 'objects/torch', overrides: { Light: { radius: -3 } } },
      ],
    }),
  })
  roots.push(project)
  const result = await validateProject(project)
  const found = result.findings
    .filter((finding) => finding.code === 'invalid-light-param')
    .map(({ file, ref, message }) => ({ file, ref, message }))
  expect(found).toEqual(expect.arrayContaining([
    { file: 'src/objects/torch.object.json', ref: 'objects/torch', message: 'Light "objects/torch": softness must be a number from 0 to 1; got 2.' },
    { file: 'src/scenes/main.scene.json', ref: 'Inline', message: 'Light "Inline": bands must be an integer from 0 to 16; got -1.' },
    { file: 'src/scenes/main.scene.json', ref: 'Override', message: 'Light "Override": radius must be at least 0; got -3.' },
  ]))
  expect(found).toHaveLength(3)
})

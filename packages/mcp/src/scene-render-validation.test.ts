import { afterEach, expect, it } from 'vitest'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function renderFindings(render: unknown): Promise<unknown[]> {
  const project = await makeProject({
    'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, render, entities: [] }),
  })
  roots.push(project)
  const result = await validateProject(project)
  return result.findings.filter((finding) => finding.code === 'invalid-scene-render')
}

it('validate_project rejects each out-of-range lighting and post field with a field-specific error (CA-2)', async () => {
  const findings = await renderFindings({
    lighting: { ambient: { intensity: 2 } },
    post: { vignette: { intensity: 0.5, radius: -1 }, colorGrade: { contrast: 9 } },
  })
  expect(findings).toEqual([
    {
      severity: 'error',
      code: 'invalid-scene-render',
      message: 'render.lighting.ambient.intensity must be a number from 0 to 1; got 2.',
      file: 'src/scenes/main.scene.json',
      ref: 'render.lighting.ambient.intensity',
    },
    {
      severity: 'error',
      code: 'invalid-scene-render',
      message: 'render.post.vignette.radius must be a number from 0 to 1; got -1.',
      file: 'src/scenes/main.scene.json',
      ref: 'render.post.vignette.radius',
    },
    {
      severity: 'error',
      code: 'invalid-scene-render',
      message: 'render.post.colorGrade.contrast must be a number from 0 to 2; got 9.',
      file: 'src/scenes/main.scene.json',
      ref: 'render.post.colorGrade.contrast',
    },
  ])
})

it('validate_project accepts in-range lighting and post blocks (CA-2)', async () => {
  expect(await renderFindings({
    lighting: { ambient: { color: '#203040', intensity: 0.2 } },
    post: { vignette: { intensity: 0.4, radius: 0.5 }, colorGrade: { tint: '#ffeedd', saturation: 1.2 } },
  })).toEqual([])
})

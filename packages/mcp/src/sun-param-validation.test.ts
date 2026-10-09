import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { sunParamFindings } from './sun-param-validation.js'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'

// A checkout without built @waica dists compiles the package sources once per
// process before its first project-component load (project-component-fallbacks.ts).
beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

describe('sunParamFindings (issue #154 CA-11)', () => {
  it('accepts three finite numbers that are not all zero, and an absent direction', () => {
    expect(sunParamFindings({ direction: [-1, -2, -1] }, 'f.json', 'Sun')).toEqual([])
    expect(sunParamFindings({ direction: [0, 0, -0.5] }, 'f.json', 'Sun')).toEqual([])
    expect(sunParamFindings({ color: 0xffffff }, 'f.json', 'Sun')).toEqual([])
    expect(sunParamFindings(undefined, 'f.json', 'Sun')).toEqual([])
  })

  it.each([
    ['all zero', [0, 0, 0]],
    ['a NaN (the inspector\'s empty field)', [Number.NaN, -1, 0]],
    ['an infinity', [Number.POSITIVE_INFINITY, 0, 0]],
    ['two numbers', [0, -1]],
    ['four numbers', [0, -1, 0, 1]],
    ['a string', 'abc'],
    ['a number', 3],
    ['null', null],
    ['strings in the array', ['0', '-1', '0']],
  ])('reports a direction that is %s', (_label, direction) => {
    const findings = sunParamFindings({ direction }, 'src/scenes/main.scene.json', 'Daylight')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      severity: 'error',
      code: 'invalid-sun-param',
      file: 'src/scenes/main.scene.json',
      ref: 'Daylight',
    })
    expect(findings[0]?.message).toContain('Sun "Daylight": direction must be three finite numbers, not all zero')
  })
})

describe('validate_project on Sun.direction', () => {
  async function sunFindings(entities: unknown[], prefabs: Record<string, string> = {}) {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, render: { space: '3d' }, camera: { kind: 'perspective' }, entities }),
      ...prefabs,
    })
    roots.push(project)
    return (await validateProject(project)).findings.filter((finding) => finding.code === 'invalid-sun-param')
  }

  it('reports a zero direction in a scene entity', async () => {
    const findings = await sunFindings([{ name: 'Daylight', components: [{ type: 'Sun', props: { direction: [0, 0, 0] } }] }])
    expect(findings.map((finding) => finding.ref)).toEqual(['Daylight'])
  })

  it('reports it in a prefab and in an override too', async () => {
    const findings = await sunFindings(
      [{ name: 'Daylight', prefab: 'objects/sun', overrides: { Sun: { direction: [Number.NaN, 0, 0] } } }, { name: 'Moon', prefab: 'objects/bad' }],
      {
        'src/objects/sun.object.json': JSON.stringify({ components: [{ type: 'Sun', props: { direction: [0, -1, 0] } }] }),
        'src/objects/bad.object.json': JSON.stringify({ components: [{ type: 'Sun', props: { direction: 'abc' } }] }),
      },
    )
    expect(findings.map((finding) => finding.file).sort()).toEqual(['src/objects/bad.object.json', 'src/scenes/main.scene.json'])
  })

  it('stays quiet for a valid Sun', async () => {
    expect(await sunFindings([{ name: 'Daylight', components: [{ type: 'Sun', props: { direction: [0, -1, 0] } }] }])).toEqual([])
  })
})

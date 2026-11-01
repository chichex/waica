import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { spotParamFindings } from './spot-param-validation.js'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'

// A checkout without built @waica dists compiles the package sources once per
// process before its first project-component load (project-component-fallbacks.ts).
beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

describe('spotParamFindings (issue #204 CA-3)', () => {
  it('accepts an aimable direction, angles from 1 to 89, penumbras from 0 to 1, and absent props', () => {
    expect(spotParamFindings({ direction: [0, -1, 0], angle: 1, penumbra: 0 }, 'f.json', 'Beam')).toEqual([])
    expect(spotParamFindings({ direction: [0, 0, -0.5], angle: 89, penumbra: 1 }, 'f.json', 'Beam')).toEqual([])
    expect(spotParamFindings({ angle: 30.5, penumbra: 0.2 }, 'f.json', 'Beam')).toEqual([])
    expect(spotParamFindings({ color: 0xffffff }, 'f.json', 'Beam')).toEqual([])
    expect(spotParamFindings(undefined, 'f.json', 'Beam')).toEqual([])
  })

  it('reports each invalid prop with its own exact message, in prop order', () => {
    expect(spotParamFindings({ direction: [0, 0, 0], angle: 90, penumbra: -0.1 }, 'src/scenes/main.scene.json', 'Beam')).toEqual([
      {
        severity: 'error', code: 'invalid-spot-param', file: 'src/scenes/main.scene.json', ref: 'Beam',
        message: 'SpotLight "Beam": direction must be three finite numbers, not all zero; got [0,0,0].',
      },
      {
        severity: 'error', code: 'invalid-spot-param', file: 'src/scenes/main.scene.json', ref: 'Beam',
        message: 'SpotLight "Beam": angle must be a finite number of degrees from 1 to 89; got 90.',
      },
      {
        severity: 'error', code: 'invalid-spot-param', file: 'src/scenes/main.scene.json', ref: 'Beam',
        message: 'SpotLight "Beam": penumbra must be a finite number from 0 to 1; got -0.1.',
      },
    ])
  })
})

describe('spotParamFindings, each rejected value (issue #204 CA-3)', () => {
  it.each([
    ['all zero', [0, 0, 0]],
    ['a NaN (the inspector\'s empty field)', [Number.NaN, -1, 0]],
    ['two numbers', [0, -1]],
    ['a string', 'down'],
    ['null', null],
  ])('reports a direction that is %s', (_label, direction) => {
    const findings = spotParamFindings({ direction }, 'f.json', 'Beam')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('SpotLight "Beam": direction must be three finite numbers, not all zero')
  })

  it.each([0, 0.5, 89.5, 120, -30, Number.NaN, Number.POSITIVE_INFINITY, '30', null, true])('reports an angle of %s', (angle) => {
    const findings = spotParamFindings({ angle }, 'f.json', 'Beam')
    expect(findings.map((finding) => finding.message)).toEqual([
      expect.stringContaining('SpotLight "Beam": angle must be a finite number of degrees from 1 to 89; got '),
    ])
  })

  it.each([-1, 1.5, Number.NaN, Number.NEGATIVE_INFINITY, '0.2', null, false])('reports a penumbra of %s', (penumbra) => {
    const findings = spotParamFindings({ penumbra }, 'f.json', 'Beam')
    expect(findings.map((finding) => finding.message)).toEqual([
      expect.stringContaining('SpotLight "Beam": penumbra must be a finite number from 0 to 1; got '),
    ])
  })

  it('shows unreadable numbers as they are, not as JSON null', () => {
    expect(spotParamFindings({ angle: Number.NaN }, 'f.json', 'Beam')[0]?.message).toMatch(/got NaN\.$/)
    expect(spotParamFindings({ penumbra: '0.2' }, 'f.json', 'Beam')[0]?.message).toMatch(/got "0\.2"\.$/)
  })
})

async function spotFindings(entities: unknown[], files: Record<string, string> = {}) {
  const project = await makeProject({
    'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, render: { space: '3d' }, camera: { kind: 'perspective' }, entities }),
    ...files,
  })
  roots.push(project)
  return (await validateProject(project)).findings.filter((finding) => ['invalid-spot-param', 'invalid-shadow-param'].includes(finding.code))
}

describe('validate_project on SpotLight params', () => {
  it('reports invalid spot and shadow props inline, in a prefab and in an instance override', async () => {
    const findings = await spotFindings(
      [
        { name: 'Inline', components: [{ type: 'SpotLight', props: { angle: 0, shadowMapSize: 300 } }] },
        { name: 'Override', prefab: 'objects/spot', overrides: { SpotLight: { penumbra: 2, shadowRadius: 9 } } },
        { name: 'Prefabbed', prefab: 'objects/bad' },
      ],
      {
        'src/objects/spot.object.json': JSON.stringify({ components: [{ type: 'SpotLight', props: { angle: 45 } }] }),
        'src/objects/bad.object.json': JSON.stringify({ components: [{ type: 'SpotLight', props: { direction: [0, 0, 0] } }] }),
      },
    )
    expect(findings.map(({ code, file, ref }) => ({ code, file, ref }))).toEqual(expect.arrayContaining([
      { code: 'invalid-spot-param', file: 'src/scenes/main.scene.json', ref: 'Inline' },
      { code: 'invalid-shadow-param', file: 'src/scenes/main.scene.json', ref: 'Inline' },
      { code: 'invalid-spot-param', file: 'src/scenes/main.scene.json', ref: 'Override' },
      { code: 'invalid-shadow-param', file: 'src/scenes/main.scene.json', ref: 'Override' },
      expect.objectContaining({ code: 'invalid-spot-param', file: 'src/objects/bad.object.json' }),
    ]))
    expect(findings).toHaveLength(5)
    expect(findings.find((finding) => finding.ref === 'Override' && finding.code === 'invalid-shadow-param')?.message)
      .toContain('SpotLight "Override": shadowRadius must be a finite number from 0 to 8; got 9.')
  })

  it('stays quiet for a valid SpotLight with inherited null shadow overrides and castShadows false', async () => {
    expect(await spotFindings([{
      name: 'Beam',
      components: [{
        type: 'SpotLight',
        props: { direction: [0, -1, 0], angle: 30, penumbra: 0, castShadows: false, shadowMapSize: null, shadowBias: 0 },
      }],
    }])).toEqual([])
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanup, makeProject, stubPackage, tempDir, writeTree } from './test-helpers.js'
import { createProject } from './create-project.js'
import { scaffoldRole } from './scaffolds.js'
import { validateProject } from './validation.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const ALL_CODES = [
  'unknown-component',
  'broken-prefab-ref',
  'override-key-not-in-prefab',
  'missing-clip',
  'dangling-transition-target',
  'unreachable-state',
  'no-state-code',
  'input-action-unbound',
  'undeclared-stat',
  'unknown-ui-piece',
  'camera-follow-unknown-entity',
  'unparseable-json',
  'component-load-failed',
  'component-load-unsupported',
]

describe('validateProject', () => {
  it('reports every stable finding through result data and keeps validating after bad JSON', async () => {
    const project = await makeProject({
      'src/components/project.ts': `
export class ProjectThing {
  static componentName = 'ProjectThing'
}
`,
      'src/components/broken-load.ts': 'export const broken = ;\n',
      'src/components/asset-load.ts': "import './sprite.png'\n",
      'src/components/sprite.png': new Uint8Array([137, 80, 78, 71]),
      'src/states/present.ts': '// textual state code is enough\n',
      'src/characters/hero.character.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'character',
        components: [
          { type: 'UnknownBuiltin' },
          { type: 'ProjectThing' },
          { type: 'AnimatedSprite', props: { clips: { idle: { frames: [0] } } } },
          {
            type: 'StateMachine',
            props: {
              role: 'player',
              initial: 'idle',
              states: {
                idle: {
                  clip: 'missing',
                  transitions: [
                    { on: 'input:dash', to: 'ghost' },
                    { on: 'signal:go', to: 'present' },
                  ],
                },
                lonely: {},
                present: {},
              },
            },
          },
        ],
      }),
      'src/objects/broken.object.json': '{ definitely not json',
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        camera: { follow: 'Nobody' },
        entities: [
          {
            name: 'Hero',
            prefab: 'characters/hero',
            overrides: { NotInPrefab: { speed: 4 } },
          },
          { name: 'Missing', prefab: 'characters/not-there' },
        ],
        ui: ['hud', 'missing-hud'],
      }),
      'src/scenes/bad.scene.json': '{ nope',
      'src/ui/hud.html':
        '<style>.x { content: "{{css-only}}" }</style><div title="{{attribute-only}}">{{points}} {{coins}}</div>',
      'src/stats.json': JSON.stringify({ waicaStats: 1, stats: { points: 0 } }),
      'src/controls.json': JSON.stringify({ waicaControls: 1, bindings: { dash: [] } }),
      'public/waica.params.json': JSON.stringify({ Hero: { UnknownParamComponent: { speed: 2 } } }),
    })
    roots.push(project)

    const result = await validateProject(project)
    const codes = [...new Set(result.findings.map((finding) => finding.code))].sort()

    expect(codes).toEqual([...ALL_CODES].sort())
    expect(result.ok).toBe(false)
    expect(result.summary).toEqual({
      errors: result.findings.filter((finding) => finding.severity === 'error').length,
      warnings: result.findings.filter((finding) => finding.severity === 'warning').length,
      infos: result.findings.filter((finding) => finding.severity === 'info').length,
    })
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'info',
          code: 'unknown-component',
          message: expect.stringMatching(/project-owned, not validated/i),
          file: 'src/characters/hero.character.json',
          ref: 'characters/hero',
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'unparseable-json',
          file: 'src/scenes/bad.scene.json',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'undeclared-stat',
          file: 'src/ui/hud.html',
          ref: 'coins',
        }),
      ]),
    )
    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'undeclared-stat', ref: 'css-only' }),
        expect.objectContaining({ code: 'undeclared-stat', ref: 'attribute-only' }),
      ]),
    )
    expect(result.notes).toContain(
      'The shipped runtime loads src/scenes/main.scene.json; other scenes are validated but are not loaded automatically.',
    )
    for (const finding of result.findings) {
      expect(finding).toMatchObject({
        severity: expect.stringMatching(/^(error|warning|info)$/),
        code: expect.any(String),
        message: expect.any(String),
        file: expect.any(String),
      })
    }
  })

  it('validates object scene entities even when their name is missing', async () => {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          {
            prefab: 'characters/not-there',
            components: [{ type: 'DefinitelyUnknown' }],
          },
        ],
      }),
    })
    roots.push(project)

    const result = await validateProject(project)

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'broken-prefab-ref', ref: 'characters/not-there' }),
        expect.objectContaining({ code: 'unknown-component', ref: 'entity[0]' }),
      ]),
    )
    expect(result.ok).toBe(false)
  })

  it('ignores primitive scene entity entries instead of aborting validation', async () => {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [null, 42, {}, { name: 'Valid', components: [] }],
      }),
    })
    roots.push(project)

    const result = await validateProject(project)

    expect(result.ok).toBe(true)
  })

  it('does not report missing clips when a state machine has no animated sprite', async () => {
    const project = await makeProject({
      'src/objects/switch.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [
          {
            type: 'StateMachine',
            props: { role: 'switch', initial: 'idle', states: { idle: {} } },
          },
        ],
      }),
    })
    roots.push(project)

    const result = await validateProject(project)

    expect(result.findings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'missing-clip' })]),
    )
  })

  it('shape-checks inherited prefab components when applying state overrides', async () => {
    const project = await makeProject({
      'src/characters/hero.character.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'character',
        components: [
          null,
          { type: 'AnimatedSprite', props: { clips: { idle: { frames: [0] } } } },
          {
            type: 'StateMachine',
            props: { role: 'player', initial: 'idle', states: { idle: {} } },
          },
        ],
      }),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          {
            name: 'Hero',
            prefab: 'characters/hero',
            overrides: { StateMachine: { initial: 'idle' } },
          },
        ],
      }),
    })
    roots.push(project)

    await expect(validateProject(project)).resolves.toMatchObject({ ok: true })
  })

  it('recognizes state code included by a scaffolded role file', async () => {
    const project = await makeProject({
      'src/characters/guard.character.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'character',
        components: [
          { type: 'AnimatedSprite', props: { clips: { idle: { frames: [0] } } } },
          {
            type: 'StateMachine',
            props: { role: 'guard', initial: 'idle', states: { idle: {} } },
          },
        ],
      }),
    })
    roots.push(project)
    await scaffoldRole(project, 'guard')

    const result = await validateProject(project)

    expect(result.findings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'no-state-code' })]),
    )
  })

  it('does not duplicate prefab state findings for unrelated entity overrides', async () => {
    const project = await makeProject({
      'src/characters/hero.character.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'character',
        components: [
          { type: 'AnimatedSprite', props: { clips: {} } },
          {
            type: 'StateMachine',
            props: { role: 'player', initial: 'idle', states: { idle: {} } },
          },
          { type: 'PlatformerMotor' },
        ],
      }),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          {
            name: 'Hero',
            prefab: 'characters/hero',
            overrides: { PlatformerMotor: { speed: 10 } },
          },
        ],
      }),
    })
    roots.push(project)

    const result = await validateProject(project)

    expect(result.findings.filter((finding) => finding.code === 'missing-clip')).toHaveLength(1)
  })

  it('validates every fixed project JSON file that is present', async () => {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, entities: [] }),
      'src/controls.json': '{',
      'src/stats.json': '{',
      'public/waica.params.json': '{',
    })
    roots.push(project)
    // Keep the marker while making game.json malformed.
    await writeTree(project, { 'src/game.json': '{' })

    const result = await validateProject(project)
    expect(
      result.findings
        .filter((finding) => finding.code === 'unparseable-json')
        .map((finding) => finding.file)
        .sort(),
    ).toEqual([
      'public/waica.params.json',
      'src/controls.json',
      'src/game.json',
      'src/stats.json',
    ])
  })

  it('reports malformed package.json through findings instead of aborting', async () => {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, entities: [] }),
    })
    roots.push(project)
    await stubPackage(project, '@waica/engine')
    await writeFile(path.join(project, 'package.json'), '{')

    const result = await validateProject(project)

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'unparseable-json',
        file: 'package.json',
      }),
    )
    expect(result.ok).toBe(false)
  })

  it('does not crash when an archetype manifest declares no bindings', async () => {
    // discoverArchetypes only runtime-validates manifest.id (archetypes.ts),
    // so a third-party archetype package can reach validateProject with no
    // `bindings` object at all; that must not throw.
    const project = await makeProject()
    roots.push(project)
    const manifest = `
module.exports.ARCHETYPE = {
  id: 'fixture', label: 'Fixture', scene: { waicaScene: 3, entities: [] },
  blankScene: { waicaScene: 3, entities: [] },
  registry: { components: {}, prefabs: {}, ui: {} }, palette: [], prefabs: {}, art: [],
  entityIcons: {}, actionLabels: {}, bundle: { roles: {} }
}
`
    await stubPackage(project, '@waica/archetype-fixture', { manifest })
    const pkgPath = path.join(project, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { dependencies: Record<string, string> }
    pkg.dependencies['@waica/archetype-fixture'] = '^9.0.0'
    await writeFile(pkgPath, JSON.stringify(pkg))
    await writeFile(
      path.join(project, 'src/game.json'),
      JSON.stringify({ waicaGame: 1, archetype: 'fixture' }),
    )

    await expect(validateProject(project)).resolves.toMatchObject({ ok: true })
  })

  it('does not infer platformer when the accepted project marker has no game.json', async () => {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, entities: [] }),
    })
    roots.push(project)
    await rm(path.join(project, 'src/game.json'))

    await expect(validateProject(project)).rejects.toThrow(/active archetype|game\.json/i)
  })

  it('returns ok for an untouched generated demo', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const project = path.join(parent, 'valid-game')
    await createProject(project)

    const result = await validateProject(project)

    expect(result.findings).toEqual([])
    expect(result.summary).toEqual({ errors: 0, warnings: 0, infos: 0 })
    expect(result.ok).toBe(true)
  })
})

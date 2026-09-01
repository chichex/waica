import { afterEach, describe, expect, it } from 'vitest'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanup, makeProject, stubPackage, tempDir, writeTree } from './test-helpers.js'
import { createProject } from './create-project.js'
import { scaffoldRole } from './scaffolds.js'
import { validateProject } from './validation.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function workspaceVersion(packageDir: string): Promise<string> {
  const manifestUrl = new URL(`../../${packageDir}/package.json`, import.meta.url)
  return (JSON.parse(await readFile(manifestUrl, 'utf8')) as { version: string }).version
}

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
  'duplicate-component',
  'invalid-update-constraint',
  'component-update-cycle',
]

describe('validateProject', () => {
  it('preserves the complete healthy project-module validation result', async () => {
    const project = await makeProject({
      'src/components/parity.ts': `
import { Component } from '@waica/engine'
class UpdatingBase extends Component {
  onUpdate() {}
}
export class RefAndSchedule extends UpdatingBase {
  static componentName = 'RefAndSchedule'
  static params = {
    target: { ref: 'prefab' },
    literal: { ref: 'prefab', options: ['literal'] },
  }
  static updateAfter = ['PassiveTarget']
  target = 'objects/missing'
  literal = 'not-a-prefab'
}
export class PassiveDeclarer extends Component {
  static componentName = 'PassiveDeclarer'
  static updateAfter = ['RefAndSchedule']
}
export class PassiveTarget extends Component {
  static componentName = 'PassiveTarget'
}
`,
      'src/objects/parity.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [
          { type: 'RefAndSchedule' },
          { type: 'PassiveDeclarer' },
          { type: 'PassiveTarget' },
        ],
      }),
    })
    roots.push(project)

    const result = await validateProject(project)

    // Characterization golden captured against the pre-isolation loader.
    // Keep this literal: deriving it from the implementation would make the
    // parity check tautological.
    expect(result).toEqual({
      findings: [
        {
          severity: 'error',
          code: 'invalid-update-constraint',
          message:
            'Passive component "PassiveDeclarer" declares updateAfter but does not implement onUpdate.',
          file: 'src/components/parity.ts',
          ref: 'PassiveDeclarer',
        },
        {
          severity: 'info',
          code: 'unknown-component',
          message: 'Component "RefAndSchedule" is project-owned, not validated.',
          file: 'src/objects/parity.object.json',
          ref: 'objects/parity',
        },
        {
          severity: 'info',
          code: 'unknown-component',
          message: 'Component "PassiveDeclarer" is project-owned, not validated.',
          file: 'src/objects/parity.object.json',
          ref: 'objects/parity',
        },
        {
          severity: 'info',
          code: 'unknown-component',
          message: 'Component "PassiveTarget" is project-owned, not validated.',
          file: 'src/objects/parity.object.json',
          ref: 'objects/parity',
        },
        {
          severity: 'error',
          code: 'broken-prefab-ref',
          message:
            'Component "RefAndSchedule" param "target" references missing prefab "objects/missing".',
          file: 'src/objects/parity.object.json',
          ref: 'RefAndSchedule.target',
        },
        {
          severity: 'error',
          code: 'invalid-update-constraint',
          message:
            'Component "RefAndSchedule" declares updateAfter target "PassiveTarget", but "PassiveTarget" does not implement onUpdate.',
          file: 'src/components/parity.ts',
          ref: 'RefAndSchedule',
        },
      ],
      summary: { errors: 3, warnings: 0, infos: 3 },
      ok: false,
      notes: [
        'Project marker src/scenes/main.scene.json is missing; src/game.json was accepted.',
        'The shipped runtime boots on src/scenes/main.scene.json and registers every scene under src/scenes/ in a catalog; a SceneTransition or control_runtime operation:"scene" can load any of them by name.',
      ],
      provenance: [
        { package: '@waica/engine', version: await workspaceVersion('engine'), source: 'bundled' },
        { package: '@waica/behaviors', version: await workspaceVersion('behaviors'), source: 'bundled' },
        {
          package: '@waica/archetype-isometric',
          version: await workspaceVersion('archetype-isometric'),
          source: 'bundled',
        },
        {
          package: '@waica/archetype-platformer',
          version: await workspaceVersion('archetype-platformer'),
          source: 'bundled',
        },
        {
          package: '@waica/archetype-topdown',
          version: await workspaceVersion('archetype-topdown'),
          source: 'bundled',
        },
      ],
      warnings: [],
    })
  })

  it('reports every stable finding through result data and keeps validating after bad JSON', async () => {
    const project = await makeProject({
      'src/components/project.ts': `
import { Component } from '@waica/engine'
export class ProjectThing extends Component {
  static componentName = 'ProjectThing'
}
export class PassiveSchedule extends Component {
  static componentName = 'PassiveSchedule'
  static updateAfter = ['StateMachine']
}
export class CycleLeft extends Component {
  static componentName = 'CycleLeft'
  static updateAfter = ['CycleRight']
  onUpdate() {}
}
export class CycleRight extends Component {
  static componentName = 'CycleRight'
  static updateAfter = ['CycleLeft']
  onUpdate() {}
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
          { type: 'PassiveSchedule' },
          { type: 'CycleLeft' },
          { type: 'CycleRight' },
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
          { type: 'StateMachine' },
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
      'The shipped runtime boots on src/scenes/main.scene.json and registers every scene under src/scenes/ in a catalog; a SceneTransition or control_runtime operation:"scene" can load any of them by name.',
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

  it.each(['constructor', 'toString', 'valueOf'])(
    'uses own-property binding semantics for the state-transition action %s',
    async (action) => {
      const machine = JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [
          {
            type: 'StateMachine',
            props: {
              role: 'fixture',
              initial: 'idle',
              states: {
                idle: { transitions: [{ on: `input:${action}`, to: 'idle' }] },
              },
            },
          },
        ],
      })
      const unbound = await makeProject({
        'src/controls.json': JSON.stringify({
          waicaControls: 1,
          bindings: { shoot: ['KeyF'] },
        }),
        'src/objects/machine.object.json': machine,
      })
      const bound = await makeProject({
        'src/controls.json': JSON.stringify({
          waicaControls: 1,
          bindings: { [action]: ['KeyX'] },
        }),
        'src/objects/machine.object.json': machine,
      })
      roots.push(unbound, bound)

      const [unboundResult, boundResult] = await Promise.all([
        validateProject(unbound),
        validateProject(bound),
      ])

      expect(
        unboundResult.findings.filter(
          (finding) => finding.code === 'input-action-unbound' && finding.ref === action,
        ),
      ).toEqual([
        {
          severity: 'warning',
          code: 'input-action-unbound',
          message: `Input action "${action}" has no bindings.`,
          file: 'src/objects/machine.object.json',
          ref: action,
        },
      ])
      expect(
        boundResult.findings.filter(
          (finding) => finding.code === 'input-action-unbound' && finding.ref === action,
        ),
      ).toEqual([])
    },
  )

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

  it('validates package and executable project update metadata with minimal attribution', async () => {
    const project = await makeProject({
      'src/components/schedule.ts': `
import { Component } from '@waica/engine'
export class PassiveDeclarer extends Component {
  static componentName = 'PassiveDeclarer'
  static updateAfter = ['StateMachine']
}
export class CycleA extends Component {
  static componentName = 'CycleA'
  static updateAfter = ['CycleB']
  onUpdate() {}
}
export class CycleB extends Component {
  static componentName = 'CycleB'
  static updateAfter = ['CycleA']
  onUpdate() {}
}
export class AfterKnownAbsent extends Component {
  static componentName = 'AfterKnownAbsent'
  static updateAfter = ['Health']
  onUpdate() {}
}
`,
      'src/objects/broken.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [
          { type: 'CycleA' },
          { type: 'CycleB' },
          { type: 'PassiveDeclarer' },
          { type: 'StateMachine' },
          { type: 'StateMachine' },
        ],
      }),
      'src/objects/known.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [{ type: 'AfterKnownAbsent' }],
      }),
      'src/objects/cycle-half.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [{ type: 'CycleA' }],
      }),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          { name: 'Broken one', prefab: 'objects/broken' },
          { name: 'Broken two', prefab: 'objects/broken' },
          {
            name: 'Inline duplicate',
            prefab: 'objects/known',
            components: [{ type: 'AfterKnownAbsent' }],
          },
          {
            name: 'Inline cycle',
            prefab: 'objects/cycle-half',
            components: [{ type: 'CycleB' }],
          },
        ],
      }),
    })
    roots.push(project)

    const result = await validateProject(project)
    const scheduleFindings = result.findings.filter((finding) =>
      ['duplicate-component', 'invalid-update-constraint', 'component-update-cycle'].includes(
        finding.code,
      ),
    )

    expect(scheduleFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'invalid-update-constraint',
          file: 'src/components/schedule.ts',
          ref: 'PassiveDeclarer',
          message: expect.stringMatching(/PassiveDeclarer.*onUpdate/),
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'component-update-cycle',
          file: 'src/objects/broken.object.json',
          ref: 'objects/broken',
          message: expect.stringMatching(/CycleA.*CycleB/),
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'duplicate-component',
          file: 'src/objects/broken.object.json',
          ref: 'objects/broken',
          message: expect.stringMatching(/StateMachine.*2/),
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'duplicate-component',
          file: 'src/scenes/main.scene.json',
          ref: 'Inline duplicate',
          message: expect.stringMatching(/AfterKnownAbsent.*2/),
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'component-update-cycle',
          file: 'src/scenes/main.scene.json',
          ref: 'Inline cycle',
          message: expect.stringMatching(/CycleA.*CycleB/),
        }),
      ]),
    )
    expect(scheduleFindings.filter((finding) => finding.code === 'component-update-cycle')).toHaveLength(2)
    expect(scheduleFindings.some((finding) => /Broken one|Broken two/.test(finding.ref ?? ''))).toBe(false)
    expect(
      scheduleFindings.some(
        (finding) =>
          finding.code === 'invalid-update-constraint' &&
          finding.message.includes('AfterKnownAbsent'),
      ),
    ).toBe(false)
    expect(result.ok).toBe(false)
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

  it('reports no unknown-scene-transition-target for the generated isometric demo (CA-13, CA-16)', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const project = path.join(parent, 'valid-iso-game')
    await createProject(project, 'demo', 'isometric')

    const result = await validateProject(project)

    // Both Doors (main -> cave, cave -> main) resolve real scenes: neither
    // Door contributes a finding, whatever else the isometric demo reports.
    expect(
      result.findings.filter((finding) => finding.code === 'unknown-scene-transition-target'),
    ).toEqual([])
    expect(result.summary.errors).toBe(0)
    expect(result.ok).toBe(true)
  })

  it('warns naming the entity when a SceneTransition targets a scene the Project does not have (CA-16)', async () => {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          {
            name: 'Door',
            components: [
              { type: 'Hitbox' },
              { type: 'SceneTransition', props: { scene: 'dungeon' } },
            ],
          },
        ],
      }),
    })
    roots.push(project)

    const result = await validateProject(project)

    expect(result.findings).toContainEqual({
      severity: 'warning',
      code: 'unknown-scene-transition-target',
      message: 'SceneTransition on "Door" names unknown scene "dungeon".',
      file: 'src/scenes/main.scene.json',
      ref: 'dungeon',
    })
    expect(result.ok).toBe(true)
  })

  it('warns naming the prefab when its own SceneTransition targets a scene the Project does not have (CA-16)', async () => {
    const project = await makeProject({
      'src/objects/door.object.json': JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [
          { type: 'Hitbox' },
          { type: 'SceneTransition', props: { scene: 'dungeon' } },
        ],
      }),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [{ name: 'Door', prefab: 'objects/door' }],
      }),
    })
    roots.push(project)

    const result = await validateProject(project)

    expect(result.findings).toContainEqual({
      severity: 'warning',
      code: 'unknown-scene-transition-target',
      message: 'SceneTransition on "objects/door" names unknown scene "dungeon".',
      file: 'src/objects/door.object.json',
      ref: 'dungeon',
    })
    // A plain prefab instance with no scene override: reported once, on the prefab.
    expect(
      result.findings.filter((finding) => finding.code === 'unknown-scene-transition-target'),
    ).toHaveLength(1)
    expect(result.ok).toBe(true)
  })
})

/**
 * The directional archetypes name their art `<state>-<dir>` and let the
 * engine resolve the plain state name at runtime through the manifest's
 * DirectionalAnimation. Validation has to know that contract, or every
 * character in a top-down or isometric project is reported as missing
 * animations it actually ships.
 */
describe('validateProject against a directional animation contract', () => {
  const TOPDOWN_GAME = JSON.stringify({ waicaGame: 1, archetype: 'topdown' })

  function directionalSprite(clips: Record<string, unknown>): Record<string, unknown> {
    return { type: 'AnimatedSprite', props: { texture: 'hero', clips } }
  }

  function frames(clips: readonly string[]): Record<string, unknown> {
    return Object.fromEntries(clips.map((clip, index) => [clip, { frames: [index] }]))
  }

  function machine(states: Record<string, unknown>): Record<string, unknown> {
    return { type: 'StateMachine', props: { role: 'player', initial: 'idle', states } }
  }

  function character(components: unknown[]): string {
    return JSON.stringify({ waicaPrefab: 1, type: 'character', components })
  }

  function clipFindings(
    findings: Array<{ code: string; severity: string; ref?: string }>,
  ): Array<{ severity: string; ref?: string }> {
    return findings
      .filter((finding) => finding.code === 'missing-clip')
      .map(({ severity, ref }) => ({ severity, ref }))
  }

  it('accepts implicit and explicit clips that resolve in every declared direction', async () => {
    // The stock sheets only draw n/s/e; TOPDOWN_ANIMATION mirrors w from e.
    const project = await makeProject({
      'src/game.json': TOPDOWN_GAME,
      'src/characters/hero.character.json': character([
        directionalSprite(
          frames([
            'idle-n',
            'idle-s',
            'idle-e',
            'walk-n',
            'walk-s',
            'walk-e',
            'death-n',
            'death-s',
            'death-e',
          ]),
        ),
        machine({ idle: {}, walk: {}, dead: { clip: 'death' } }),
      ]),
    })
    roots.push(project)

    const result = await validateProject(project)

    expect(clipFindings(result.findings)).toEqual([])
  })

  it('still reports a clip that dead-ends in a declared direction, at the same severity', async () => {
    // "ko" and "sprint" are outside the contract's state fallbacks, so nothing
    // rescues them: ko-e (and w, mirrored from it) and every sprint-<dir> are
    // absent.
    const project = await makeProject({
      'src/game.json': TOPDOWN_GAME,
      'src/characters/hero.character.json': character([
        directionalSprite(frames(['idle-n', 'idle-s', 'idle-e', 'ko-n', 'ko-s'])),
        machine({ idle: {}, sprint: {}, dead: { clip: 'ko' } }),
      ]),
    })
    roots.push(project)

    const result = await validateProject(project)

    expect(clipFindings(result.findings)).toEqual([
      { severity: 'warning', ref: 'characters/hero' },
      { severity: 'error', ref: 'StateMachine.states.dead.clip' },
    ])
  })

  it('keeps the literal check for an archetype that declares no contract', async () => {
    // The very same prefab under the platformer archetype: without a
    // contract there is nothing to resolve, so the directional names stay
    // unreachable and every state is reported.
    const project = await makeProject({
      'src/characters/hero.character.json': character([
        directionalSprite(frames(['idle-n', 'idle-s', 'idle-e'])),
        machine({ idle: {}, dead: { clip: 'death' } }),
      ]),
    })
    roots.push(project)

    const result = await validateProject(project)

    expect(clipFindings(result.findings)).toEqual([
      { severity: 'warning', ref: 'characters/hero' },
      { severity: 'error', ref: 'StateMachine.states.dead.clip' },
    ])
  })

  it('leaves the untouched generated demo of every directional archetype clip-clean', async () => {
    // Scoped to missing-clip on purpose: these demos carry unrelated
    // pre-existing findings (an unbound "attack" action, an undeclared
    // npcLine stat), and fixing those is not this change's business. What
    // must hold is that the explicit death clip no longer flips ok to false.
    for (const archetype of ['topdown', 'isometric'] as const) {
      const parent = await tempDir()
      roots.push(parent)
      const project = path.join(parent, `${archetype}-game`)
      await createProject(project, 'demo', archetype)

      const result = await validateProject(project)

      expect(clipFindings(result.findings), archetype).toEqual([])
      expect(result.ok, archetype).toBe(true)
    }
  })
})

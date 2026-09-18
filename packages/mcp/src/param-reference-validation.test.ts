import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, makeProject, stubPackage } from './test-helpers.js'
import { validateProject, type ValidationFinding } from './validation.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const PARAM_CODES = new Set([
  'broken-prefab-ref',
  'missing-clip',
  'input-action-unbound',
  'undeclared-stat',
  'missing-sound',
  'unknown-ui-piece',
])

function prefab(components: unknown[]): string {
  return JSON.stringify({ waicaPrefab: 1, type: 'object', components })
}

function refComponent(
  ref: 'prefab' | 'stat' | 'action' | 'clip' | 'sound' | 'ui',
  defaultValue = '',
  options?: string[],
): string {
  return `
import { Component } from '@waica/engine'
export class RefComponent extends Component {
  static componentName = 'RefComponent'
  static params = {
    target: { ref: '${ref}'${options ? `, options: ${JSON.stringify(options)}` : ''} },
  }
  target = ${JSON.stringify(defaultValue)}
}
`
}

async function refProject(
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<string> {
  const project = await makeProject(files)
  roots.push(project)
  await stubPackage(project, '@waica/engine', {
    root: 'class Component {}\nexports.Component = Component\n',
  })
  return project
}

function paramFindings(findings: ValidationFinding[]): Array<
  Pick<ValidationFinding, 'severity' | 'code' | 'file' | 'ref'>
> {
  return findings
    .filter((finding) => PARAM_CODES.has(finding.code))
    .map(({ severity, code, file, ref }) => ({ severity, code, file, ref }))
}

describe('validateProject parameter references', () => {
  it('resolves prefab refs from the complete prefab tree and ignores empty refs', async () => {
    const project = await refProject({
      'src/components/ref.ts': refComponent('prefab'),
      'src/objects/a-valid.object.json': prefab([
        { type: 'RefComponent', props: { target: 'objects/z-target' } },
      ]),
      'src/objects/b-broken.object.json': prefab([
        { type: 'RefComponent', props: { target: 'objects/not-there' } },
      ]),
      'src/objects/c-empty.object.json': prefab([
        { type: 'RefComponent', props: { target: '' } },
      ]),
      'src/objects/z-target.object.json': prefab([]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'broken-prefab-ref',
        file: 'src/objects/b-broken.object.json',
        ref: 'RefComponent.target',
      },
    ])
  })

  it('resolves package component stat refs and preserves undeclared-stat severity', async () => {
    const project = await refProject({
      'src/stats.json': JSON.stringify({ waicaStats: 1, stats: { points: 0 } }),
      'src/objects/a-valid.object.json': prefab([
        { type: 'Collectible', props: { stat: 'points' } },
      ]),
      'src/objects/b-broken.object.json': prefab([
        { type: 'Collectible', props: { stat: 'missing' } },
      ]),
      'src/objects/c-empty.object.json': prefab([
        { type: 'Collectible', props: { stat: '' } },
      ]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'warning',
        code: 'undeclared-stat',
        file: 'src/objects/b-broken.object.json',
        ref: 'Collectible.stat',
      },
    ])
  })

  it('resolves actions from controls.json only, not archetype defaults', async () => {
    // The shipped runtime installs exactly controls.json's bindings (template
    // main.ts passes controls.bindings raw; engine DEFAULT_BINDINGS is {}),
    // so an action the archetype binds by default but controls.json drops
    // (here "left", never mentioned in controls.json below) is genuinely
    // unbound at runtime and must be flagged like any other unbound action.
    const project = await refProject({
      'src/components/ref.ts': refComponent('action'),
      'src/controls.json': JSON.stringify({
        waicaControls: 1,
        bindings: { shoot: ['KeyF'], jump: [] },
      }),
      'src/objects/a-default.object.json': prefab([
        { type: 'RefComponent', props: { target: 'left' } },
      ]),
      'src/objects/b-project.object.json': prefab([
        { type: 'RefComponent', props: { target: 'shoot' } },
      ]),
      'src/objects/c-unbound.object.json': prefab([
        { type: 'RefComponent', props: { target: 'jump' } },
      ]),
      'src/objects/d-empty.object.json': prefab([
        { type: 'RefComponent', props: { target: '' } },
      ]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'warning',
        code: 'input-action-unbound',
        file: 'src/objects/a-default.object.json',
        ref: 'RefComponent.target',
      },
      {
        severity: 'warning',
        code: 'input-action-unbound',
        file: 'src/objects/c-unbound.object.json',
        ref: 'RefComponent.target',
      },
    ])
  })

  it('flags an action ref named after an inherited Object property as unbound', async () => {
    // bindings is a plain object indexed by an untrusted action name; a
    // component author could plausibly name a stat-like action "constructor"
    // or "toString". Object.prototype's own members resolve through the
    // prototype chain (with a function's non-zero .length) and must not be
    // mistaken for a real binding array.
    const project = await refProject({
      'src/components/ref.ts': refComponent('action'),
      'src/controls.json': JSON.stringify({ waicaControls: 1, bindings: { shoot: ['KeyF'] } }),
      'src/objects/a-prototype.object.json': prefab([
        { type: 'RefComponent', props: { target: 'constructor' } },
      ]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'warning',
        code: 'input-action-unbound',
        file: 'src/objects/a-prototype.object.json',
        ref: 'RefComponent.target',
      },
    ])
  })

  it('resolves clip refs against the sibling AnimatedSprite and skips entities without one', async () => {
    const withTarget = (target: string): string =>
      prefab([
        { type: 'AnimatedSprite', props: { clips: { idle: { frames: [0] } } } },
        { type: 'RefComponent', props: { target } },
      ])
    const project = await refProject({
      'src/components/ref.ts': refComponent('clip'),
      'src/objects/a-valid.object.json': withTarget('idle'),
      'src/objects/b-broken.object.json': withTarget('missing'),
      'src/objects/c-empty.object.json': withTarget(''),
      'src/objects/d-no-sprite.object.json': prefab([
        { type: 'RefComponent', props: { target: 'missing' } },
      ]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'missing-clip',
        file: 'src/objects/b-broken.object.json',
        ref: 'RefComponent.target',
      },
    ])
  })

  it('uses instance defaults and validates inline scene components', async () => {
    const project = await refProject({
      'src/components/ref.ts': refComponent('prefab', 'objects/not-there'),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [{ name: 'Inline', components: [{ type: 'RefComponent' }] }],
      }),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'broken-prefab-ref',
        file: 'src/scenes/main.scene.json',
        ref: 'RefComponent.target',
      },
    ])
  })

  it('validates effective inherited props when a scene overrides a prefab component', async () => {
    const project = await refProject({
      'src/components/ref.ts': refComponent('prefab'),
      'src/objects/owner.object.json': prefab([
        { type: 'RefComponent', props: { target: 'objects/target' } },
      ]),
      'src/objects/target.object.json': prefab([]),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          {
            name: 'Owner',
            prefab: 'objects/owner',
            overrides: { RefComponent: { target: 'objects/missing' } },
          },
        ],
      }),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'broken-prefab-ref',
        file: 'src/scenes/main.scene.json',
        ref: 'RefComponent.target',
      },
    ])
  })

  it('does not duplicate a prefab-level param finding for a param an override never touched', async () => {
    // RefComponent has two ref params. The prefab only sets `target`
    // (valid); `other` falls back to its broken class default and is
    // reported once, at the prefab. The scene override only touches
    // `target` (with a still-valid value) — it must not cause `other` to be
    // re-checked and re-reported a second time under the scene file.
    const project = await refProject({
      'src/components/ref.ts': `
import { Component } from '@waica/engine'
export class RefComponent extends Component {
  static componentName = 'RefComponent'
  static params = {
    target: { ref: 'prefab' },
    other: { ref: 'prefab' },
  }
  target = ''
  other = 'objects/missing'
}
`,
      'src/objects/owner.object.json': prefab([
        { type: 'RefComponent', props: { target: 'objects/target' } },
      ]),
      'src/objects/target.object.json': prefab([]),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          {
            name: 'Owner',
            prefab: 'objects/owner',
            overrides: { RefComponent: { target: 'objects/target' } },
          },
        ],
      }),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'broken-prefab-ref',
        file: 'src/objects/owner.object.json',
        ref: 'RefComponent.other',
      },
    ])
  })

  it('revalidates inherited clip refs when a scene changes the sibling clip set', async () => {
    const project = await refProject({
      'src/components/ref.ts': refComponent('clip'),
      'src/objects/owner.object.json': prefab([
        { type: 'AnimatedSprite', props: { clips: { idle: { frames: [0] } } } },
        { type: 'RefComponent', props: { target: 'idle' } },
      ]),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          {
            name: 'Owner',
            prefab: 'objects/owner',
            overrides: {
              AnimatedSprite: { clips: { run: { frames: [1] } } },
            },
          },
        ],
      }),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'missing-clip',
        file: 'src/scenes/main.scene.json',
        ref: 'RefComponent.target',
      },
    ])
  })

  it('CA-13: resolves sound refs against files actually present under the project src/art/', async () => {
    const project = await refProject({
      'src/components/ref.ts': refComponent('sound'),
      'src/art/hit.ogg': new Uint8Array([0, 1, 2]),
      'src/objects/a-valid.object.json': prefab([
        { type: 'RefComponent', props: { target: 'src/art/hit.ogg' } },
      ]),
      'src/objects/b-broken.object.json': prefab([
        { type: 'RefComponent', props: { target: 'src/art/missing.ogg' } },
      ]),
      'src/objects/c-empty.object.json': prefab([
        { type: 'RefComponent', props: { target: '' } },
      ]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'missing-sound',
        file: 'src/objects/b-broken.object.json',
        ref: 'RefComponent.target',
      },
    ])
  })

  it('CA-13: resolves sound refs against the active archetype\'s own declared sound art', async () => {
    const project = await refProject({
      'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'isometric' }),
      'src/components/ref.ts': refComponent('sound'),
      'src/objects/a-valid.object.json': prefab([
        { type: 'RefComponent', props: { target: 'waica:iso-hit' } },
      ]),
      'src/objects/b-broken.object.json': prefab([
        { type: 'RefComponent', props: { target: 'waica:not-a-sound' } },
      ]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'missing-sound',
        file: 'src/objects/b-broken.object.json',
        ref: 'RefComponent.target',
      },
    ])
  })

  it('flags a sound ref that names a file nested under a src/art/ subfolder, since the shipped runtime glob is not recursive', async () => {
    // Runtime evidence: examples/isometric/src/main.ts and
    // packages/editor/template/src/main.ts both build resolveAsset from
    // `import.meta.glob('./art/*')`, and Vite's `*` never crosses `/` — a
    // sound one folder deeper than src/art/ never resolves at runtime, so
    // this validator must not bless the uri either.
    const project = await refProject({
      'src/components/ref.ts': refComponent('sound'),
      'src/art/sfx/hit.ogg': new Uint8Array([0, 1, 2]),
      'src/objects/a-nested.object.json': prefab([
        { type: 'RefComponent', props: { target: 'src/art/sfx/hit.ogg' } },
      ]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'missing-sound',
        file: 'src/objects/a-nested.object.json',
        ref: 'RefComponent.target',
      },
    ])
  })

  it('flags a sound ref that names a non-.ogg file under src/art/', async () => {
    const project = await refProject({
      'src/components/ref.ts': refComponent('sound'),
      'src/art/waica-hero.png': new Uint8Array([0, 1, 2]),
      'src/objects/a-wrong-kind.object.json': prefab([
        { type: 'RefComponent', props: { target: 'src/art/waica-hero.png' } },
      ]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'missing-sound',
        file: 'src/objects/a-wrong-kind.object.json',
        ref: 'RefComponent.target',
      },
    ])
  })

  it('CA-17: resolves a project component\'s ui refs against the project src/ui/ pieces', async () => {
    const project = await refProject({
      'src/components/ref.ts': refComponent('ui'),
      'src/ui/damage-number.html': '<div class="n"></div>',
      'src/ui/nested/health-bar.html': '<div></div>',
      'src/objects/a-valid.object.json': prefab([
        { type: 'RefComponent', props: { target: 'damage-number' } },
      ]),
      'src/objects/b-broken.object.json': prefab([
        { type: 'RefComponent', props: { target: 'speech-bubble' } },
      ]),
      'src/objects/c-empty.object.json': prefab([
        { type: 'RefComponent', props: { target: '' } },
      ]),
      'src/objects/d-nested.object.json': prefab([
        { type: 'RefComponent', props: { target: 'health-bar' } },
      ]),
    })

    const result = await validateProject(project)

    expect(result.findings.filter((finding) => finding.code === 'component-load-failed')).toEqual([])
    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'warning',
        code: 'unknown-ui-piece',
        file: 'src/objects/b-broken.object.json',
        ref: 'RefComponent.target',
      },
      {
        severity: 'warning',
        code: 'unknown-ui-piece',
        file: 'src/objects/d-nested.object.json',
        ref: 'RefComponent.target',
      },
    ])
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        message: 'Component "RefComponent" param "target" references unknown UI piece "speech-bubble".',
      }),
    )
  })

  it('CA-17: resolves ui refs on inline scene components and on scene overrides of a prefab', async () => {
    const project = await refProject({
      'src/components/ref.ts': refComponent('ui'),
      'src/ui/damage-number.html': '<div></div>',
      'src/ui/health-bar.html': '<div></div>',
      'src/objects/owner.object.json': prefab([
        { type: 'RefComponent', props: { target: 'damage-number' } },
      ]),
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          { name: 'Inline', components: [{ type: 'RefComponent', props: { target: 'npc-bubble' } }] },
          { name: 'Broken', prefab: 'objects/owner', overrides: { RefComponent: { target: 'hp' } } },
          { name: 'Valid', prefab: 'objects/owner', overrides: { RefComponent: { target: 'health-bar' } } },
          { name: 'Off', prefab: 'objects/owner', overrides: { RefComponent: { target: '' } } },
        ],
      }),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'warning',
        code: 'unknown-ui-piece',
        file: 'src/scenes/main.scene.json',
        ref: 'RefComponent.target',
      },
      {
        severity: 'warning',
        code: 'unknown-ui-piece',
        file: 'src/scenes/main.scene.json',
        ref: 'RefComponent.target',
      },
    ])
    expect(
      result.findings
        .filter((finding) => finding.code === 'unknown-ui-piece')
        .map((finding) => finding.message),
    ).toEqual([
      'Component "RefComponent" param "target" references unknown UI piece "npc-bubble".',
      'Component "RefComponent" param "target" references unknown UI piece "hp".',
    ])
  })

  it('ignores ref metadata when a param also declares options', async () => {
    const project = await refProject({
      'src/components/ref.ts': refComponent('prefab', 'literal', ['literal']),
      'src/objects/options.object.json': prefab([{ type: 'RefComponent' }]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([])
  })

  it('treats an explicit StateJson.clip as an error-level clip reference', async () => {
    const project = await refProject({
      'src/objects/machine.object.json': prefab([
        { type: 'AnimatedSprite', props: { clips: { idle: { frames: [0] } } } },
        {
          type: 'StateMachine',
          props: {
            role: 'fixture',
            initial: 'idle',
            states: { idle: { clip: 'missing' } },
          },
        },
      ]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'missing-clip',
        file: 'src/objects/machine.object.json',
        ref: 'StateMachine.states.idle.clip',
      },
    ])
  })

  it('treats an explicit empty StateJson.clip as a missing-clip reference, not "no reference"', async () => {
    // Unlike Collectible.stat, the runtime does not treat '' as unset here:
    // state-machine.ts resolves `this.states[state]?.clip ?? state`, and ''
    // survives that nullish coalesce, so it is looked up literally and the
    // sprite freezes on state entry with no matching clip.
    const project = await refProject({
      'src/objects/machine.object.json': prefab([
        { type: 'AnimatedSprite', props: { clips: { idle: { frames: [0] } } } },
        {
          type: 'StateMachine',
          props: {
            role: 'fixture',
            initial: 'idle',
            states: { idle: { clip: '' } },
          },
        },
      ]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'missing-clip',
        file: 'src/objects/machine.object.json',
        ref: 'StateMachine.states.idle.clip',
      },
    ])
  })

  it('resolves a clip ref through the archetype directional contract', async () => {
    // Same rule as the StateMachine state loop: under a contract the plain
    // name is what the runtime asks for, and `<state>-<dir>` art answers it.
    const project = await refProject({
      'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'topdown' }),
      'src/components/ref.ts': refComponent('clip'),
      'src/objects/a-directional.object.json': prefab([
        {
          type: 'AnimatedSprite',
          props: {
            clips: {
              'idle-n': { frames: [0] },
              'idle-s': { frames: [1] },
              'idle-e': { frames: [2] },
            },
          },
        },
        { type: 'RefComponent', props: { target: 'idle' } },
      ]),
      'src/objects/b-unreachable.object.json': prefab([
        {
          type: 'AnimatedSprite',
          props: { clips: { 'idle-n': { frames: [0] }, 'idle-s': { frames: [1] } } },
        },
        { type: 'RefComponent', props: { target: 'idle' } },
      ]),
    })

    const result = await validateProject(project)

    expect(paramFindings(result.findings)).toEqual([
      {
        severity: 'error',
        code: 'missing-clip',
        file: 'src/objects/b-unreachable.object.json',
        ref: 'RefComponent.target',
      },
    ])
  })
})

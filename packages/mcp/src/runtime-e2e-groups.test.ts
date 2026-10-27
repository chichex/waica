import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

type RunOptions = Record<string, boolean>
interface Leg {
  readonly backend: string
  readonly options: RunOptions
  /** selectedSubLegs(options): none means test-runtime-e2e.mjs skips this leg. */
  readonly subLegs: readonly string[]
}
/** What `pnpm test:e2e <args>` hands runRuntimeE2e on each Render Backend, or the error its arguments raise. */
type Selection = { readonly legs: readonly Leg[] } | { readonly error: string }
interface Probe {
  readonly groups: readonly string[]
  /** RUNTIME_E2E_SUB_LEGS, the sub-legs runtime-e2e.mjs declares. */
  readonly subLegs: readonly string[]
  /** runRuntimeE2e's own `include*` parameters, read from its source. */
  readonly parameters: readonly string[]
  /** selectedSubLegs({}): what counts as selected when no option is given. */
  readonly leftOut: readonly string[]
  readonly selections: readonly Selection[]
}

function unexpected(what: string, value: unknown): never {
  throw new Error(`unexpected ${what} in the probe's output: ${JSON.stringify(value)}`)
}

function fields(value: unknown, what: string): Map<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return unexpected(what, value)
  return new Map(Object.entries(value))
}

function items(value: unknown, what: string): unknown[] {
  return Array.isArray(value) ? value.map((item: unknown) => item) : unexpected(what, value)
}

function strings(value: unknown, what: string): string[] {
  return items(value, what).map((item) => (typeof item === 'string' ? item : unexpected(what, item)))
}

function legOf(value: unknown): Leg {
  const leg = fields(value, 'leg')
  const backend = leg.get('backend')
  const options = [...fields(leg.get('options'), 'options')].map(([name, on]) => [name, typeof on === 'boolean' ? on : unexpected(name, on)] as const)
  return {
    backend: typeof backend === 'string' ? backend : unexpected('backend', backend),
    options: Object.fromEntries(options),
    subLegs: strings(leg.get('subLegs'), 'sub-legs'),
  }
}

function selectionOf(value: unknown): Selection {
  const selection = fields(value, 'selection')
  const error = selection.get('error')
  return typeof error === 'string' ? { error } : { legs: items(selection.get('legs'), 'legs').map(legOf) }
}

/**
 * One native Node process: the policy's groups, the declared sub-legs,
 * runRuntimeE2e's `include*` parameters, and what `pnpm test:e2e <args>`
 * hands runRuntimeE2e for each args list.
 */
function probe(argsLists: ReadonlyArray<readonly string[]>): Probe {
  const script = `
    import { RUNTIME_E2E_GROUPS, runtimeE2eRunOptions, selectedSubLegs } from './scripts/runtime-e2e-policy.mjs';
    import { RENDER_BACKEND_LEGS, RUNTIME_E2E_SUB_LEGS, runRuntimeE2e } from './scripts/runtime-e2e.mjs';
    const source = runRuntimeE2e.toString();
    const parameters = [...new Set(source.slice(0, source.indexOf(') {')).match(/\\binclude[A-Z]\\w*/g))];
    const legOn = (backend, args) => {
      const options = runtimeE2eRunOptions(backend, args);
      return { backend, options, subLegs: selectedSubLegs(options) };
    };
    const select = (args) => {
      try {
        return { legs: RENDER_BACKEND_LEGS.map(({ backend }) => legOn(backend, args)) };
      } catch (error) {
        return { error: error.message };
      }
    };
    const selections = ${JSON.stringify(argsLists)}.map(select);
    const leftOut = selectedSubLegs({});
    console.log(JSON.stringify({ groups: Object.keys(RUNTIME_E2E_GROUPS), subLegs: RUNTIME_E2E_SUB_LEGS, parameters, leftOut, selections }));
  `
  const output: unknown = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  }))
  const probed = fields(output, 'probe')
  return {
    groups: strings(probed.get('groups'), 'groups'),
    subLegs: strings(probed.get('subLegs'), 'sub-legs'),
    parameters: strings(probed.get('parameters'), 'parameters'),
    leftOut: strings(probed.get('leftOut'), 'left-out sub-legs'),
    selections: items(probed.get('selections'), 'selections').map(selectionOf),
  }
}

const REJECTED: ReadonlyArray<readonly string[]> = [
  ['--group'],
  ['--group', '--webgpu-shadows'],
  ['--group', 'no-such-group'],
  ['--group=third-person'],
  ['--groups', 'third-person'],
]

/** Every args list the tests below read, given the policy's groups. */
function argsListsFor(groups: readonly string[]): string[][] {
  const [first = '', second = ''] = groups
  return [
    [], ['--'], ['--webgpu-shadows'], ['--', '--group', first, '--group', second],
    ...groups.flatMap((group) => [['--group', group], ['--group', group, '--webgpu-shadows']]),
    ...REJECTED.map((args) => [...args]),
  ]
}

/** The shadow policy (runtime-e2e-policy.mjs), which governs pixels inside sub-legs rather than running one. */
const SHADOW_POLICY = ['includeShadows', 'includeEditorShadows']

let groups: readonly string[] = []
let subLegs: readonly string[] = []
let leftOut: readonly string[] = []
/** Every sub-leg runRuntimeE2e can run, as its `include*` parameter: what the default run must turn on. */
let everyLeg: readonly string[] = []
const selections = new Map<string, Selection>()

// Two processes in all: the groups, then every selection the tests read.
beforeAll(() => {
  groups = probe([]).groups
  const argsLists = argsListsFor(groups)
  const probed = probe(argsLists)
  subLegs = probed.subLegs
  leftOut = probed.leftOut
  everyLeg = probed.parameters.filter((name) => !SHADOW_POLICY.includes(name)).sort()
  argsLists.forEach((args, index) => {
    const selected = probed.selections[index]
    if (selected) selections.set(JSON.stringify(args), selected)
  })
})

/** The legs `pnpm test:e2e <args>` hands runRuntimeE2e, as probed; throws the error its arguments raise. */
function selection(args: readonly string[]): readonly Leg[] {
  const selected = selections.get(JSON.stringify(args))
  if (selected === undefined) throw new Error(`the probe did not select ${JSON.stringify(args)}`)
  if ('error' in selected) throw new Error(selected.error)
  return selected.legs
}

function optionsOn(legs: readonly Leg[], backend: string): RunOptions {
  const leg = legs.find((candidate) => candidate.backend === backend)
  if (!leg) throw new Error(`no ${backend} leg in ${JSON.stringify(legs)}`)
  return leg.options
}

/** The sub-legs a selection turns on, as `include*` option names. */
function included(options: RunOptions): string[] {
  return Object.entries(options).filter(([name, on]) => on && !SHADOW_POLICY.includes(name)).map(([name]) => name).sort()
}

it('declares every sub-leg runRuntimeE2e can run, so none runs in every group unnoticed', () => {
  expect(everyLeg.length).toBeGreaterThan(0)
  expect(subLegs.map((leg) => `include${leg}`).sort()).toEqual(everyLeg)
})

it('runs every sub-leg on both Render Backends by default, with the shadow pixels required on WebGL2 only', () => {
  const selected = selection([])
  expect(included(optionsOn(selected, 'webgl2'))).toEqual(everyLeg)
  expect(included(optionsOn(selected, 'webgpu'))).toEqual(everyLeg.filter((leg) => leg !== 'includeShadowLeg'))
  expect(optionsOn(selected, 'webgl2')).toMatchObject({ includeShadows: true, includeEditorShadows: true })
  expect(optionsOn(selected, 'webgpu')).toMatchObject({ includeShadows: false, includeEditorShadows: false })
  expect(selection(['--'])).toEqual(selected)
})

it('keeps --webgpu-shadows: the standalone shadow cases then run on WebGPU too', () => {
  const selected = selection(['--webgpu-shadows'])
  expect(included(optionsOn(selected, 'webgpu'))).toEqual(everyLeg)
  expect(optionsOn(selected, 'webgpu')).toMatchObject({ includeShadows: true, includeEditorShadows: true })
})

it('splits the sub-legs into disjoint groups whose union is the default run', () => {
  expect(groups.length).toBeGreaterThan(1)
  const perGroup = groups.map((group) => included(optionsOn(selection(['--group', group, '--webgpu-shadows']), 'webgpu')))
  for (const legs of perGroup) expect(legs.length).toBeGreaterThan(0)
  const all = perGroup.flat().sort()
  expect(all).toEqual(everyLeg)
  expect(new Set(all).size).toBe(all.length)
})

it('runs the third-person group on both Render Backends, so its pose hashes still meet in one process', () => {
  const selected = selection(['--group', 'third-person'])
  for (const backend of ['webgl2', 'webgpu']) expect(included(optionsOn(selected, backend))).toEqual(['includeThirdPerson'])
  expect(optionsOn(selected, 'webgl2').includeShadows).toBe(true)
})

it('runs the third-person fight and respawn as groups of their own, each on both Render Backends', () => {
  const parts: ReadonlyArray<readonly [string, string]> = [['third-person-combat', 'includeThirdPersonCombat'], ['third-person-respawn', 'includeThirdPersonRespawn']]
  for (const [group, leg] of parts) {
    const selected = selection(['--group', group])
    for (const backend of ['webgl2', 'webgpu']) expect(included(optionsOn(selected, backend))).toEqual([leg])
  }
})

it('selects the union of repeated groups and accepts a leading pnpm separator', () => {
  const [first, second] = groups
  if (first === undefined || second === undefined) throw new Error('the e2e needs at least two groups')
  const union = selection(['--', '--group', first, '--group', second])
  const expected = [...included(optionsOn(selection(['--group', first]), 'webgl2')), ...included(optionsOn(selection(['--group', second]), 'webgl2'))].sort()
  expect(included(optionsOn(union, 'webgl2'))).toEqual(expected)
})

/** Every Render Backend leg of every probed selection the arguments accept, with those arguments. */
function probedLegs(): Array<{ readonly args: string, readonly leg: Leg }> {
  return [...selections].flatMap(([args, selected]) => ('legs' in selected ? selected.legs.map((leg) => ({ args, leg })) : []))
}

it('asks for the reload and alias checks only with the happy path they run inside', () => {
  const orphaned = probedLegs().filter(({ leg: { options } }) => (options.includeReload || options.includeAlias) && !options.includeHappyPath)
  expect(orphaned).toEqual([])
})

it('skips a Render Backend leg only when it selects no sub-leg: WebGPU in the shadows group without --webgpu-shadows', () => {
  for (const { leg } of probedLegs()) expect(leg.subLegs.map((name) => `include${name}`).sort()).toEqual(included(leg.options))
  expect(leftOut).toEqual(subLegs)
  const skipped = probedLegs().filter(({ leg }) => leg.subLegs.length === 0).map(({ args, leg }) => `${leg.backend} ${args}`)
  expect(skipped).toEqual([`webgpu ${JSON.stringify(['--group', 'shadows'])}`])
})

it.each(REJECTED.map((args) => [args]))('rejects a mistyped or missing group instead of silently running less: %j', (args) => {
  expect(() => selection(args)).toThrow(/runtime e2e/)
})

const NO_SESSION = 'no Run Session in this probe'

/**
 * runThirdPersonLeg over fake helpers in native Node, once per `parts`: the
 * browsers it launches before its first Run Session, which the fake `call`
 * refuses to start, and the error it ends with.
 */
function thirdPersonParts(partsLists: ReadonlyArray<readonly string[]>): unknown {
  const script = `
    import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
    import { tmpdir } from 'node:os';
    import path from 'node:path';
    import { runThirdPersonLeg } from './scripts/runtime-e2e-third-person.mjs';
    const project = await mkdtemp(path.join(tmpdir(), 'waica-third-person-parts-'));
    await mkdir(path.join(project, 'src/scenes'), { recursive: true });
    const entities = ['Player', 'Skeleton Gate', 'Skeleton West'].map((name) => ({ name }));
    await writeFile(path.join(project, 'src/scenes/main.scene.json'), JSON.stringify({ entities }));
    const run = async (parts) => {
      const launched = [];
      const helpers = {
        makeDemoProject: async () => project,
        openPngInspector: async () => { launched.push('png-inspector'); return { close: async () => {} }; },
        call: async () => { throw new Error(${JSON.stringify(NO_SESSION)}); },
        keepScreenshot: async () => {},
      };
      const leg = { helpers, parts, chrome: { executablePath: 'chrome' }, label: 'probe' };
      const error = await runThirdPersonLeg(leg).then(() => 'none', (failure) => failure.message);
      return { launched, error };
    };
    try {
      const runs = [];
      for (const parts of ${JSON.stringify(partsLists)}) runs.push(await run(parts));
      console.log(JSON.stringify(runs));
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  }))
}

it('plays the third-person fight or respawn alone without launching the PNG inspector, and names an unknown part', () => {
  expect(thirdPersonParts([['combat'], ['respawn'], ['fight']])).toEqual([
    { launched: [], error: NO_SESSION },
    { launched: [], error: NO_SESSION },
    { launched: [], error: 'unknown third-person part: fight (known: look, combat, respawn)' },
  ])
})

/** The lines of one top-level job of ci.yml, from its key to the next job's. */
function jobBlock(workflow: string, job: string): string {
  const lines = workflow.split('\n')
  const start = lines.findIndex((line) => line === `  ${job}:`)
  if (start < 0) throw new Error(`ci.yml has no ${job} job`)
  const end = lines.findIndex((line, index) => index > start && /^ {2}[a-z][\w-]*:$/.test(line))
  return lines.slice(start, end < 0 ? undefined : end).join('\n')
}

it('runs every e2e group as its own CI job, on both backends, and verify needs them all', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8')
  const e2e = jobBlock(workflow, 'e2e')
  const matrix = /^ {8}group: \[([^\]]*)\]$/m.exec(e2e)?.[1]
  expect(matrix?.split(',').map((group) => group.trim())).toEqual(groups)
  expect(e2e).toContain('run: pnpm test:e2e --group ${{ matrix.group }}')
  expect(e2e).not.toMatch(/--backend|--webgpu-shadows/)
  const needs = /^ {4}needs: \[([^\]]*)\]$/m.exec(jobBlock(workflow, 'verify'))?.[1]
  expect(needs?.split(',').map((job) => job.trim())).toContain('e2e')
})

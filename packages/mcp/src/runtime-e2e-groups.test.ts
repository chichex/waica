import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

type RunOptions = Record<string, boolean>
interface Selection {
  readonly groups: readonly string[]
  readonly legs: ReadonlyArray<{ readonly backend: string, readonly options: RunOptions }>
}

/** What `pnpm test:e2e <args>` hands runRuntimeE2e on each Render Backend, through native Node. */
function selection(args: readonly string[]): Selection {
  const script = `
    import { RUNTIME_E2E_GROUPS, runtimeE2eRunOptions } from './scripts/runtime-e2e-policy.mjs';
    import { RENDER_BACKEND_LEGS } from './scripts/runtime-e2e.mjs';
    const args = ${JSON.stringify(args)};
    console.log(JSON.stringify({
      groups: Object.keys(RUNTIME_E2E_GROUPS),
      legs: RENDER_BACKEND_LEGS.map(({ backend }) => ({ backend, options: runtimeE2eRunOptions(backend, args) })),
    }));
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  })) as Selection
}

function optionsOn(selected: Selection, backend: string): RunOptions {
  const leg = selected.legs.find((candidate) => candidate.backend === backend)
  if (!leg) throw new Error(`no ${backend} leg in ${JSON.stringify(selected)}`)
  return leg.options
}

/** The sub-legs a selection turns on, as `include*` option names. */
function included(options: RunOptions): string[] {
  return Object.entries(options).filter(([name, on]) => on && name !== 'includeShadows' && name !== 'includeEditorShadows').map(([name]) => name).sort()
}

const EVERY_LEG = [
  'includeAlias', 'includeBatchParity', 'includeEditor3d', 'includeHappyPath', 'includeIsometric', 'includeLighting',
  'includeNegative', 'includeProjection', 'includeReload', 'includeSceneFade', 'includeSceneSwap', 'includeShadowLeg',
  'includeSignalShutdown', 'includeThirdPerson', 'includeTopdown',
]

it('runs every sub-leg on both Render Backends by default, with the shadow pixels required on WebGL2 only', () => {
  const selected = selection([])
  expect(included(optionsOn(selected, 'webgl2'))).toEqual(EVERY_LEG)
  expect(included(optionsOn(selected, 'webgpu'))).toEqual(EVERY_LEG.filter((leg) => leg !== 'includeShadowLeg'))
  expect(optionsOn(selected, 'webgl2')).toMatchObject({ includeShadows: true, includeEditorShadows: true })
  expect(optionsOn(selected, 'webgpu')).toMatchObject({ includeShadows: false, includeEditorShadows: false })
  expect(selection(['--'])).toEqual(selected)
})

it('keeps --webgpu-shadows: the standalone shadow cases then run on WebGPU too', () => {
  const selected = selection(['--webgpu-shadows'])
  expect(included(optionsOn(selected, 'webgpu'))).toEqual(EVERY_LEG)
  expect(optionsOn(selected, 'webgpu')).toMatchObject({ includeShadows: true, includeEditorShadows: true })
})

it('splits the sub-legs into disjoint groups whose union is the default run', () => {
  const { groups } = selection([])
  expect(groups.length).toBeGreaterThan(1)
  const perGroup = groups.map((group) => included(optionsOn(selection(['--group', group, '--webgpu-shadows']), 'webgpu')))
  for (const legs of perGroup) expect(legs.length).toBeGreaterThan(0)
  const all = perGroup.flat().sort()
  expect(all).toEqual(EVERY_LEG)
  expect(new Set(all).size).toBe(all.length)
})

it('runs the third-person group on both Render Backends, so its pose hashes still meet in one process', () => {
  const selected = selection(['--group', 'third-person'])
  for (const backend of ['webgl2', 'webgpu']) expect(included(optionsOn(selected, backend))).toEqual(['includeThirdPerson'])
  expect(optionsOn(selected, 'webgl2').includeShadows).toBe(true)
})

it('selects the union of repeated groups and accepts a leading pnpm separator', () => {
  const [first, second] = selection([]).groups
  if (first === undefined || second === undefined) throw new Error('the e2e needs at least two groups')
  const union = selection(['--', '--group', first, '--group', second])
  const expected = [...included(optionsOn(selection(['--group', first]), 'webgl2')), ...included(optionsOn(selection(['--group', second]), 'webgl2'))].sort()
  expect(included(optionsOn(union, 'webgl2'))).toEqual(expected)
})

it.each([
  [['--group']],
  [['--group', '--webgpu-shadows']],
  [['--group', 'no-such-group']],
  [['--group=third-person']],
  [['--groups', 'third-person']],
])('rejects a mistyped or missing group instead of silently running less: %j', (args) => {
  expect(() => selection(args)).toThrow(/runtime e2e/)
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
  const workflow = readFileSync(new URL('.github/workflows/ci.yml', `file://${ROOT}`), 'utf8')
  const e2e = jobBlock(workflow, 'e2e')
  const matrix = /^ {8}group: \[([^\]]*)\]$/m.exec(e2e)?.[1]
  expect(matrix?.split(',').map((group) => group.trim())).toEqual(selection([]).groups)
  expect(e2e).toContain('run: pnpm test:e2e --group ${{ matrix.group }}')
  expect(e2e).not.toMatch(/--backend|--webgpu-shadows/)
  const needs = /^ {4}needs: \[([^\]]*)\]$/m.exec(jobBlock(workflow, 'verify'))?.[1]
  expect(needs?.split(',').map((job) => job.trim())).toContain('e2e')
})

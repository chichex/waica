import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanup, makeProject, stubPackage } from './test-helpers.js'
import {
  loadProjectComponents,
  nodeSupportsModuleHooks,
  unsupportedNodeFailure,
} from './project-component-loader.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function makeModuleProject(
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<string> {
  const project = await makeProject({
    'package.json': JSON.stringify({
      name: 'loader-fixture',
      private: true,
      type: 'module',
      dependencies: { '@waica/engine': '^9.0.0' },
    }),
    ...files,
  })
  roots.push(project)
  await stubPackage(project, '@waica/engine', {
    root: 'class Component {}\nexports.Component = Component\n',
  })
  return project
}

function componentSource(target: string, ref: 'prefab' | 'stat' = 'prefab'): string {
  return `
import { Component } from '@waica/engine'
export class Target extends Component {
  static componentName = 'Target'
  static params = { target: { ref: '${ref}' } }
  target = '${target}'
}
`
}

describe('loadProjectComponents', () => {
  it('runs sorted direct entries sequentially in fresh child processes that inherit the host cwd', async () => {
    // Build the source separately so the fixture records the absolute path
    // without relying on the child process working directory.
    const project = await makeModuleProject({})
    const logFile = path.join(project, 'entry-processes.ndjson')
    const source = (label: string, className: string): string => `
import { appendFileSync } from 'node:fs'
const record = (event) => appendFileSync(
  ${JSON.stringify(logFile)},
  JSON.stringify({ event, label: ${JSON.stringify(label)}, pid: process.pid, cwd: process.cwd() }) + '\\n',
)
record('start')
await new Promise((resolve) => setTimeout(resolve, 20))
record('end')
export class ${className} { static componentName = ${JSON.stringify(className)} }
`
    await Promise.all(
      ['components', 'roles', 'states'].map((directory) =>
        mkdir(path.join(project, 'src', directory), { recursive: true }),
      ),
    )
    await Promise.all([
      writeFile(path.join(project, 'src/components/b.ts'), source('component-b', 'ComponentB')),
      writeFile(path.join(project, 'src/components/a.ts'), source('component-a', 'ComponentA')),
    ])
    await Promise.all([
      writeFile(path.join(project, 'src/roles/a.ts'), source('role-a', 'RoleA')),
      writeFile(path.join(project, 'src/states/a.ts'), source('state-a', 'StateA')),
    ])

    const first = await loadProjectComponents(project)
    const second = await loadProjectComponents(project)
    const records = (await readFile(logFile, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as {
        event: 'start' | 'end'
        label: string
        pid: number
        cwd: string
      })

    expect(first.failures).toEqual([])
    expect(second.failures).toEqual([])
    const expectedLabels = ['component-a', 'component-b', 'role-a', 'state-a']
    expect(records.map(({ event, label }) => `${event}:${label}`)).toEqual(
      [expectedLabels, expectedLabels].flatMap((labels) =>
        labels.flatMap((label) => [`start:${label}`, `end:${label}`]),
      ),
    )
    const firstPids = records.slice(0, 8).filter(({ event }) => event === 'start').map(({ pid }) => pid)
    const secondPids = records.slice(8).filter(({ event }) => event === 'start').map(({ pid }) => pid)
    expect(new Set(firstPids).size).toBe(4)
    expect(new Set(secondPids).size).toBe(4)
    expect(new Set([...firstPids, ...secondPids]).size).toBe(8)
    expect(records.every(({ pid }) => pid !== process.pid)).toBe(true)
    expect(records.every(({ cwd }) => cwd === process.cwd())).toBe(true)
  })

  it('exposes static params and instance defaults from all three project module directories', async () => {
    const project = await makeModuleProject({
      'src/components/target.ts': componentSource('objects/default'),
      'src/roles/role-component.ts': componentSource('objects/from-role').replaceAll(
        'Target',
        'RoleTarget',
      ),
      'src/states/state-component.ts': componentSource('objects/from-state').replaceAll(
        'Target',
        'StateTarget',
      ),
    })

    const result = await loadProjectComponents(project)

    expect(result.failures).toEqual([])
    expect(result.components).toMatchObject({
      Target: {
        file: 'src/components/target.ts',
        params: { target: { ref: 'prefab' } },
        defaults: { target: 'objects/default' },
      },
      RoleTarget: {
        file: 'src/roles/role-component.ts',
        defaults: { target: 'objects/from-role' },
      },
      StateTarget: {
        file: 'src/states/state-component.ts',
        defaults: { target: 'objects/from-state' },
      },
    })
  })

  it('falls back to the MCP-bundled engine when project dependencies are not installed', async () => {
    const project = await makeProject({
      'src/components/target.ts': componentSource('objects/bundled'),
    })
    roots.push(project)

    const result = await loadProjectComponents(project)

    expect(result.failures).toEqual([])
    expect(result.components.Target?.defaults).toEqual({ target: 'objects/bundled' })
  })

  it('falls back to the MCP-bundled archetype-platformer when project dependencies are not installed', async () => {
    // @waica/archetype-platformer is a declared dependency of every generated
    // project (create_project), but a freshly created project has not run
    // `npm install` yet — the same uninstalled state the engine/behaviors
    // fallback above already supports.
    const project = await makeProject({
      'src/components/target.ts': `
import { PLATFORMER_BINDINGS } from '@waica/archetype-platformer'
export class Target {
  static componentName = 'Target'
  static params = { target: { ref: 'stat' } }
  target = typeof PLATFORMER_BINDINGS
}
`,
    })
    roots.push(project)

    const result = await loadProjectComponents(project)

    expect(result.failures).toEqual([])
    expect(result.components.Target?.defaults).toEqual({ target: 'object' })
  })

  it('resolves directory imports to their index file', async () => {
    const project = await makeModuleProject({
      'src/components/lib/index.ts': `export const libTarget: string = 'objects/from-index'\n`,
      'src/components/target.ts': `
import { Component } from '@waica/engine'
import { libTarget } from './lib'
export class Target extends Component {
  static componentName = 'Target'
  static params = { target: { ref: 'prefab' } }
  target = libTarget
}
`,
    })

    const result = await loadProjectComponents(project)

    expect(result.failures).toEqual([])
    expect(result.components.Target?.defaults).toEqual({ target: 'objects/from-index' })
  })

  it('resolves multi-dot relative specifiers, not only fully extensionless ones', async () => {
    const project = await makeModuleProject({
      'src/components/foo.helper.ts': `export const helperTarget: string = 'objects/from-helper'\n`,
      'src/components/target.ts': `
import { Component } from '@waica/engine'
import { helperTarget } from './foo.helper'
export class Target extends Component {
  static componentName = 'Target'
  static params = { target: { ref: 'prefab' } }
  target = helperTarget
}
`,
    })

    const result = await loadProjectComponents(project)

    expect(result.failures).toEqual([])
    expect(result.components.Target?.defaults).toEqual({ target: 'objects/from-helper' })
  })

  it('resolves extensionless relative imports', async () => {
    const project = await makeModuleProject({
      'src/components/default-target.ts': `export const defaultTarget: string = 'objects/helper'\n`,
      'src/components/target.ts': `
import { Component } from '@waica/engine'
import { defaultTarget } from './default-target'
export class Target extends Component {
  static componentName = 'Target'
  static params = { target: { ref: 'prefab' } }
  target = defaultTarget
}
`,
    })

    const result = await loadProjectComponents(project)

    expect(result.failures).toEqual([])
    expect(result.components.Target?.defaults).toEqual({ target: 'objects/helper' })
  })

  it('isolates genuine module failures and keeps loading every other file', async () => {
    const project = await makeModuleProject({
      'src/components/broken.ts': `export const broken = ;\n`,
      'src/components/healthy.ts': componentSource('objects/healthy').replaceAll(
        'Target',
        'Healthy',
      ),
    })

    const result = await loadProjectComponents(project)

    expect(result.components.Healthy?.defaults).toEqual({ target: 'objects/healthy' })
    expect(result.failures).toEqual([
      expect.objectContaining({
        code: 'component-load-failed',
        file: 'src/components/broken.ts',
        message: expect.any(String),
      }),
    ])
  })

  it('classifies asset imports as unsupported by Node rather than broken project code', async () => {
    const project = await makeModuleProject({
      'src/components/hero.png': new Uint8Array([137, 80, 78, 71]),
      'src/components/asset.ts': `
import sprite from './hero.png'
void sprite
`,
    })

    const result = await loadProjectComponents(project)

    expect(result.failures).toEqual([
      expect.objectContaining({
        code: 'component-load-unsupported',
        file: 'src/components/asset.ts',
      }),
    ])
  })

  it('classifies TypeScript syntax unsupported by strip-only mode separately', async () => {
    const project = await makeModuleProject({
      'src/components/enum.ts': `
enum Mode { On }
export const mode = Mode.On
`,
    })

    const result = await loadProjectComponents(project)

    expect(result.failures).toEqual([
      expect.objectContaining({
        code: 'component-load-unsupported',
        file: 'src/components/enum.ts',
      }),
    ])
  })

  it('does not classify a genuine defect as unsupported just because the file also contains an "@" line', async () => {
    // Regression: the old fallback classified ANY load error as
    // component-load-unsupported whenever any line of the file started with
    // '@' (CSS-in-TS template literals, decorators...), steering an agent
    // away from a real defect like this module-scope throw.
    const project = await makeModuleProject({
      'src/components/broken.ts': `
const style = \`@media (max-width: 600px) { .x { color: red } }\`
void style
throw new Error('module scope exploded')
`,
    })

    const result = await loadProjectComponents(project)

    expect(result.failures).toEqual([
      expect.objectContaining({
        code: 'component-load-failed',
        file: 'src/components/broken.ts',
        message: expect.stringContaining('module scope exploded'),
      }),
    ])
  })

  it('re-executes an unchanged module in a fresh process on every validation', async () => {
    const marker = `waicaCacheMarker_${Math.random().toString(36).slice(2)}`
    const source = `
const g = globalThis
g.${marker} = (g.${marker} ?? 0) + 1
export class Target {
  static componentName = 'Target'
  static params = { target: { ref: 'stat' } }
  target = String(g.${marker})
}
`
    const project = await makeModuleProject({ 'src/components/target.ts': source })

    const first = await loadProjectComponents(project)
    const second = await loadProjectComponents(project)

    expect(first.components.Target?.defaults).toEqual({ target: '1' })
    expect(second.components.Target?.defaults).toEqual({ target: '1' })
  })

  it('instantiates a fresh module when the file content changes', async () => {
    const marker = `waicaCacheMarker_${Math.random().toString(36).slice(2)}`
    const source = (label: string): string => `
const g = globalThis
g.${marker} = (g.${marker} ?? 0) + 1
export class Target {
  static componentName = 'Target'
  static params = { target: { ref: 'stat' } }
  target = ${JSON.stringify(label)} + ':' + g.${marker}
}
`
    const project = await makeModuleProject({ 'src/components/target.ts': source('first') })

    const first = await loadProjectComponents(project)
    await writeFile(path.join(project, 'src/components/target.ts'), source('second'))
    const second = await loadProjectComponents(project)

    expect(first.components.Target?.defaults).toEqual({ target: 'first:1' })
    expect(second.components.Target?.defaults).toEqual({ target: 'second:1' })
  })

  it('uses a fresh module URL on each load so edits are visible in one process', async () => {
    const project = await makeModuleProject({
      'src/components/target.ts': componentSource('objects/first'),
    })

    const first = await loadProjectComponents(project)
    await writeFile(
      path.join(project, 'src/components/target.ts'),
      componentSource('points', 'stat'),
    )
    const second = await loadProjectComponents(project)

    expect(first.components.Target).toMatchObject({
      params: { target: { ref: 'prefab' } },
      defaults: { target: 'objects/first' },
    })
    expect(second.components.Target).toMatchObject({
      params: { target: { ref: 'stat' } },
      defaults: { target: 'points' },
    })
  })

  it('reports module-scope throws as genuine failures', async () => {
    const project = await makeModuleProject({
      'src/components/throws.ts': `throw new Error('scope exploded')\n`,
    })

    const result = await loadProjectComponents(project)

    expect(result.failures).toEqual([
      expect.objectContaining({
        code: 'component-load-failed',
        file: 'src/components/throws.ts',
        message: expect.stringContaining('scope exploded'),
      }),
    ])
  })
})

describe('nodeSupportsModuleHooks', () => {
  it('detects registerHooks by feature, not by Node version', () => {
    expect(nodeSupportsModuleHooks({})).toBe(false)
    expect(nodeSupportsModuleHooks({ registerHooks: undefined })).toBe(false)
    expect(nodeSupportsModuleHooks({ registerHooks: () => undefined })).toBe(true)
  })

  it('agrees with the real node:module on this host', () => {
    // This dev/CI environment runs a Node new enough for registerHooks; the
    // false branch above is what a Node 20.19-22.14 host actually takes at
    // module load, which cannot be reproduced without an old Node binary.
    expect(nodeSupportsModuleHooks()).toBe(true)
  })
})

describe('unsupportedNodeFailure', () => {
  it('names the Node requirement and the host version, without crashing the server', () => {
    const failure = unsupportedNodeFailure('20.19.0')

    expect(failure.code).toBe('component-load-unsupported')
    expect(failure.message).toContain('20.19.0')
    expect(failure.message).toMatch(/22\.15/)
    expect(failure.message).toMatch(/validate_project|list_components/)
  })
})

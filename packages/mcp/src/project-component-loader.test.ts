import { afterEach, describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanup, makeProject, stubPackage } from './test-helpers.js'
import { loadProjectComponents } from './project-component-loader.js'

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

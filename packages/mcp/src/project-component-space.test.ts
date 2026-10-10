import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { loadProjectComponents } from './project-component-loader.js'
import { cleanup, makeProject, stubPackage } from './test-helpers.js'
import { validateProject } from './validation.js'

// A checkout without built @waica dists compiles the package sources once per
// process before its first project-component load (project-component-fallbacks.ts).
beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function spaceProject(files: Readonly<Record<string, string>>): Promise<string> {
  const project = await makeProject(files)
  roots.push(project)
  await stubPackage(project, '@waica/engine', {
    root: 'class Component {}\nexports.Component = Component\n',
  })
  return project
}

function component(name: string, space?: string): string {
  const marker = space === undefined ? '' : `  static space = ${JSON.stringify(space)}\n`
  return `
import { Component } from '@waica/engine'
export class ${name} extends Component {
  static componentName = ${JSON.stringify(name)}
${marker}}
`
}

const THREE_D_SCENE = JSON.stringify({
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 5, 10], target: [0, 0, 0] },
  entities: [
    { name: 'Flat', components: [{ type: 'FlatOnly' }] },
    { name: 'Both', components: [{ type: 'Anywhere' }] },
    { name: 'Plain', components: [{ type: 'Unmarked' }] },
  ],
})

describe('project-owned components carry the space marker through the runner (CA-4)', () => {
  it('reflects static space as 2d, 3d or both, and an absent marker as none', async () => {
    const project = await spaceProject({
      'src/components/flat-only.ts': component('FlatOnly', '2d'),
      'src/components/solid-only.ts': component('SolidOnly', '3d'),
      'src/components/anywhere.ts': component('Anywhere', 'both'),
      'src/components/unmarked.ts': component('Unmarked'),
    })

    const result = await loadProjectComponents(project)

    expect(result.failures).toEqual([])
    expect(result.components.FlatOnly?.Class.space).toBe('2d')
    expect(result.components.SolidOnly?.Class.space).toBe('3d')
    expect(result.components.Anywhere?.Class.space).toBe('both')
    expect(result.components.Unmarked?.Class.space).toBeUndefined()
  })

  it('fails a file whose static space is not 2d, 3d or both, naming the component and the marker', async () => {
    const project = await spaceProject({
      'src/components/sideways.ts': component('Sideways', '3D'),
      'src/components/fine.ts': component('Fine', '2d'),
    })

    const result = await loadProjectComponents(project)

    expect(result.components.Fine?.Class.space).toBe('2d')
    expect(result.components.Sideways).toBeUndefined()
    expect(result.failures).toEqual([
      {
        code: 'component-load-failed',
        file: 'src/components/sideways.ts',
        message: `Component "Sideways" space must be '2d', '3d' or 'both'; got "3D".`,
      },
    ])
  })

  it('reports a 2d project component in a 3d scene through validate_project, and nothing for the others', async () => {
    const project = await spaceProject({
      'src/components/flat-only.ts': component('FlatOnly', '2d'),
      'src/components/anywhere.ts': component('Anywhere', 'both'),
      'src/components/unmarked.ts': component('Unmarked'),
      'src/scenes/main.scene.json': THREE_D_SCENE,
    })

    const { findings } = await validateProject(project)
    const mismatches = findings.filter((finding) => finding.code === 'component-space-mismatch')

    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]).toMatchObject({ severity: 'error', ref: 'Flat' })
    expect(mismatches[0]?.message).toContain('"FlatOnly"')
  })
})

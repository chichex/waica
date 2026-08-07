import { describe, expect, it } from 'vitest'
import { MemFS } from '../fs/project-fs'
import {
  componentFilePath,
  componentFileTemplate,
  listComponentFiles,
  scaffoldComponentFile,
} from './components'

describe('project component files', () => {
  it('maps a component name to src/components/<name>.ts', () => {
    expect(componentFilePath('Gun')).toBe('src/components/gun.ts')
    expect(componentFilePath('Enemy Projectile')).toBe('src/components/enemy-projectile.ts')
  })

  it('rejects the engine base class name, which the template cannot emit', () => {
    // The template imports Component: `class Component extends Component`
    // would not parse, and never-overwrite would make it unrepairable.
    expect(() => componentFilePath('Component')).toThrow(/base class/)
    expect(() => componentFilePath('component')).toThrow(/base class/)
  })

  it('lists only TypeScript files in src/components', async () => {
    const fs = new MemFS('demo', {
      'src/components/gun.ts': '// code',
      'src/components/readme.md': 'notes',
      'src/states/idle.ts': '// state',
    })

    expect(await listComponentFiles(fs)).toEqual(['gun.ts'])
  })

  it('returns an empty list when src/components does not exist', async () => {
    const fs = new MemFS('demo', { 'src/main.ts': '// entry' })
    expect(await listComponentFiles(fs)).toEqual([])
  })

  it('generates an exported Component subclass with a stable name and an empty update stub', () => {
    const code = componentFileTemplate('Gun')

    expect(code).toContain("import { Component } from '@waica/engine'")
    expect(code).toContain('export class Gun extends Component')
    expect(code).toContain("static override componentName = 'Gun'")
    expect(code).toContain('override onUpdate(dt: number): void')
    expect(code).toContain("// Add this component's per-frame behavior here.")
  })

  it('invents no state: the starter carries neither a placeholder field nor its params entry', () => {
    // Every component written in a real session deleted the speed placeholder
    // and the params block that described it — the starter stopped shipping them.
    const code = componentFileTemplate('Gun')

    expect(code).not.toContain('params')
    expect(code).not.toContain('speed')
    expect(code).not.toContain('updateAfter')
  })

  it('scaffolds once and never overwrites an existing file', async () => {
    const fs = new MemFS('demo', {})

    expect(await scaffoldComponentFile(fs, 'Gun')).toEqual({
      path: 'src/components/gun.ts',
      created: true,
    })
    const generated = await fs.readText('src/components/gun.ts')
    await fs.writeText('src/components/gun.ts', '// user code')

    expect(await scaffoldComponentFile(fs, 'Gun')).toEqual({
      path: 'src/components/gun.ts',
      created: false,
    })
    expect(generated).toContain('export class Gun')
    expect(await fs.readText('src/components/gun.ts')).toBe('// user code')
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { cleanup, makeProject, stubPackage, writeTree } from './test-helpers.js'
import {
  PackageResolver,
  mixedSourceWarnings,
  provenanceRows,
} from './package-resolver.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

describe('PackageResolver', () => {
  it('loads a project node_modules copy before the bundled dependency', async () => {
    const project = await makeProject()
    roots.push(project)
    await stubPackage(project, '@waica/engine', {
      version: '9.1.0',
      root: `module.exports = { marker: 'project-engine' }\n`,
    })

    const loaded = await new PackageResolver(project).load<{ marker: string }>('@waica/engine')

    expect(loaded.module.marker).toBe('project-engine')
    expect(loaded.provenance).toEqual({
      package: '@waica/engine',
      version: '9.1.0',
      source: 'project',
    })
    expect(loaded.packageRoot).toBe(path.join(project, 'node_modules/@waica/engine'))
  })

  it('honors a package hoisted above the project directory', async () => {
    const parent = await makeProject()
    const project = path.join(parent, 'games', 'nested-game')
    roots.push(parent)
    await writeTree(project, {
      'package.json': JSON.stringify({ name: 'nested-game', dependencies: { '@waica/engine': '^6.0.0' } }),
      'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'platformer' }),
    })
    await stubPackage(parent, '@waica/engine', {
      version: '6.0.0',
      root: `module.exports = { marker: 'hoisted-engine' }\n`,
    })

    const loaded = await new PackageResolver(project).load<{ marker: string }>('@waica/engine')

    expect(loaded.module.marker).toBe('hoisted-engine')
    expect(loaded.provenance).toEqual({
      package: '@waica/engine',
      version: '6.0.0',
      source: 'project',
    })
    expect(loaded.packageRoot).toBe(path.join(parent, 'node_modules/@waica/engine'))
  })

  it('rejects a project package whose resolved entry escapes the reported package root', async () => {
    const project = await makeProject()
    roots.push(project)
    await stubPackage(project, '@waica/engine', { version: '5.0.0' })
    const packageRoot = path.join(project, 'node_modules/@waica/engine')
    const escapedRoot = path.join(project, 'escaped-engine')
    await writeTree(escapedRoot, {
      'package.json': JSON.stringify({ name: '@waica/engine', version: '99.0.0' }),
      'index.cjs': `module.exports = { marker: 'escaped' }\n`,
    })
    await rm(path.join(packageRoot, 'index.cjs'))
    await symlink(path.join(escapedRoot, 'index.cjs'), path.join(packageRoot, 'index.cjs'))

    await expect(new PackageResolver(project).load('@waica/engine')).rejects.toThrow(
      /resolved.*outside|does not match|package root/i,
    )
  })

  it('falls back package-by-package and reports mixed provenance', async () => {
    const project = await makeProject()
    roots.push(project)
    await stubPackage(project, '@waica/engine', { version: '8.0.0' })

    const resolver = new PackageResolver(project)
    const engine = await resolver.load('@waica/engine')
    const behaviors = await resolver.load('@waica/behaviors')
    const archetype = await resolver.load('@waica/archetype-platformer', './manifest')
    const rows = provenanceRows([engine, behaviors, archetype])

    expect(rows).toEqual([
      { package: '@waica/engine', version: '8.0.0', source: 'project' },
      { package: '@waica/behaviors', version: '0.1.0', source: 'bundled' },
      { package: '@waica/archetype-platformer', version: '0.1.0', source: 'bundled' },
    ])
    expect(mixedSourceWarnings(rows)).toEqual([
      'Mixed @waica package sources: @waica/engine from the project; @waica/behaviors, @waica/archetype-platformer from the MCP bundle.',
    ])
  })

  it('reports only one row for a package resolved more than once', async () => {
    const project = await makeProject()
    roots.push(project)
    const resolver = new PackageResolver(project)
    const first = await resolver.load('@waica/engine')
    const second = await resolver.load('@waica/engine')
    expect(provenanceRows([first, second])).toEqual([
      { package: '@waica/engine', version: '0.1.0', source: 'bundled' },
    ])
  })

  it('does not silently fall back when a present project package is unloadable', async () => {
    const project = await makeProject()
    roots.push(project)
    const packageRoot = path.join(project, 'node_modules/@waica/engine')
    await writeTree(packageRoot, {
      'package.json': JSON.stringify({
        name: '@waica/engine',
        version: '7.0.0',
        type: 'module',
        exports: './src/index.ts',
      }),
      'src/index.ts': `export interface ImpossibleToStrip { value: string }\nexport const marker = 'typescript-source'\n`,
    })

    await expect(new PackageResolver(project).load('@waica/engine')).rejects.toThrow(
      /@waica\/engine.*7\.0\.0.*project.*(TypeScript|strip|ERR_)/i,
    )
  })
})

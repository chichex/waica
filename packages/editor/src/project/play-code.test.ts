import { describe, expect, it } from 'vitest'
import { Component, defineStates, logicSet, type ArchetypeBundle } from '@waica/engine'
import { MemFS } from '../fs/project-fs'
import { loadPlayCode, rewriteImports, type PlayCodeRunner } from './play-code'

const URLS = { '@waica/engine': 'blob:engine', '@waica/behaviors': 'blob:behaviors' }
const EMPTY_BUNDLE: ArchetypeBundle = { roles: {} }

describe('rewriteImports', () => {
  it('rewrites static, side-effect and dynamic imports of known modules', () => {
    const js =
      `import { defineStates } from '@waica/engine'\n` +
      `import '@waica/behaviors'\n` +
      `const lazy = await import("@waica/engine")\n`
    const out = rewriteImports(js, URLS)
    expect(out).toContain(`from 'blob:engine'`)
    expect(out).toContain(`import 'blob:behaviors'`)
    expect(out).toContain(`import("blob:engine")`)
  })

  it("rewrites a multi-line import's closing `} from` line", () => {
    const js = `import {\n  defineStates,\n} from '@waica/engine'\n`
    expect(rewriteImports(js, URLS)).toContain(`} from 'blob:engine'`)
  })

  it('rewrites a project-relative import when its module URL is known', () => {
    const js = `import { Gun } from '../components/gun'\n`
    expect(rewriteImports(js, { '../components/gun': 'blob:gun' })).toContain(
      `from 'blob:gun'`,
    )
  })

  it('leaves unknown bare specifiers for the browser to report', () => {
    const js = `import helper from 'third-party-helper'\n`
    expect(rewriteImports(js, URLS)).toBe(js)
  })

  it('never touches lookalikes inside plain strings', () => {
    const js = `const s = "no import here from '@waica/engine' really"\n`
    expect(rewriteImports(js, URLS)).toBe(js)
  })
})

interface CreatedModule {
  path: string
  js: string
  imports: Record<string, string>
}

function runner(over: Partial<PlayCodeRunner> = {}): {
  created: Map<string, CreatedModule>
  executed: string[]
  runner: PlayCodeRunner
} {
  const created = new Map<string, CreatedModule>()
  const executed: string[] = []
  return {
    created,
    executed,
    runner: {
      transpile: async (source) => `js:${source}`,
      createModule: async (js, path, imports) => {
        const url = `blob:${path}`
        created.set(url, { path, js, imports })
        return url
      },
      execute: async (_url, path) => {
        executed.push(path)
        return {}
      },
      ...over,
    },
  }
}

describe('loadPlayCode', () => {
  it('runs components before every state and role file and reports them loaded', async () => {
    const fs = new MemFS('demo', {
      'src/components/gun.ts': 'gun-code',
      'src/states/dash.ts': 'dash-code',
      'src/roles/guard.ts': 'guard-code',
      'src/main.ts': 'entry',
    })
    const harness = runner()
    const result = await loadPlayCode(fs, harness.runner, EMPTY_BUNDLE)

    expect(result.loaded).toEqual([
      'src/components/gun.ts',
      'src/states/dash.ts',
      'src/roles/guard.ts',
    ])
    expect(result.errors).toEqual([])
    expect(harness.executed).toEqual(result.loaded)
  })

  it('reports a component transpile failure and keeps running the rest', async () => {
    const fs = new MemFS('demo', {
      'src/components/broken.ts': 'broken',
      'src/components/fine.ts': 'fine',
      'src/states/idle.ts': 'idle',
    })
    const harness = runner({
      transpile: async (source, path) => {
        if (path.endsWith('broken.ts')) throw new Error('syntax error')
        return `js:${source}`
      },
    })

    const result = await loadPlayCode(fs, harness.runner, EMPTY_BUNDLE)

    expect(result.loaded).toEqual(['src/components/fine.ts', 'src/states/idle.ts'])
    expect(result.errors).toEqual([
      { path: 'src/components/broken.ts', message: 'syntax error' },
    ])
  })

  it('reports a component execute failure exactly like a state failure', async () => {
    const fs = new MemFS('demo', {
      'src/components/broken.ts': 'broken',
      'src/states/fine.ts': 'fine',
    })
    const harness = runner({
      execute: async (_url, path) => {
        if (path.endsWith('broken.ts')) throw new Error('top-level throw')
        harness.executed.push(path)
        return {}
      },
    })

    const result = await loadPlayCode(fs, harness.runner, EMPTY_BUNDLE)

    expect(result.loaded).toEqual(['src/states/fine.ts'])
    expect(result.errors).toEqual([
      { path: 'src/components/broken.ts', message: 'top-level throw' },
    ])
  })

  it('resolves a state import against the transpiled component module', async () => {
    class Gun extends Component {
      static override componentName = 'Gun'
    }
    const fs = new MemFS('demo', {
      'src/components/gun.ts': `export class Gun {}`,
      'src/states/armed.ts': `import { Gun } from '../components/gun'\nvoid Gun`,
    })
    const harness = runner({
      transpile: async (source) => source,
      execute: async (url, path) => {
        const module = harness.created.get(url)
        if (path === 'src/states/armed.ts') {
          const gunUrl = module?.imports['../components/gun']
          if (!gunUrl || !harness.executed.includes('src/components/gun.ts')) {
            throw new Error('gun module was not available')
          }
        }
        harness.executed.push(path)
        return path === 'src/components/gun.ts' ? { Gun } : {}
      },
    })

    const result = await loadPlayCode(fs, harness.runner, EMPTY_BUNDLE)
    const stateModule = harness.created.get('blob:src/states/armed.ts')

    expect(result.errors).toEqual([])
    expect(stateModule?.imports['../components/gun']).toBe('blob:src/components/gun.ts')
    expect(result.components.Gun).toBe(Gun)
    expect(result.componentPaths.Gun).toBe('src/components/gun.ts')
  })

  it('reports an unmatched project-relative import against its importing file', async () => {
    const fs = new MemFS('demo', {
      'src/states/broken.ts': `import '../components/missing'`,
    })
    const harness = runner({ transpile: async (source) => source })

    const result = await loadPlayCode(fs, harness.runner, EMPTY_BUNDLE)

    expect(result.loaded).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.path).toBe('src/states/broken.ts')
    expect(result.errors[0]?.message).toContain('../components/missing')
    expect(harness.executed).toEqual([])
  })

  it('resets to the archetype bundle before each Play so deleted role code disappears', async () => {
    const baseline: ArchetypeBundle = {
      roles: {
        player: { description: 'Baseline player.', states: { walk: {} } },
      },
    }
    const fs = new MemFS('demo', { 'src/roles/old-player.ts': 'old-player-code' })
    const harness = runner({
      execute: async (_url, path) => {
        if (path === 'src/roles/old-player.ts') defineStates('player', { deletedState: {} })
        return {}
      },
    })

    await loadPlayCode(fs, harness.runner, baseline)
    expect(logicSet('player')?.deletedState).toBeDefined()

    await fs.deleteFile('src/roles/old-player.ts')
    await loadPlayCode(fs, harness.runner, baseline)

    expect(Object.keys(logicSet('player') ?? {})).toEqual(['walk'])
    expect(logicSet('player')?.deletedState).toBeUndefined()
  })
})

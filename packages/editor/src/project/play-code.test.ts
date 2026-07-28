import { describe, expect, it } from 'vitest'
import { defineStates, logicSet, type ArchetypeBundle } from '@waica/engine'
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

  it('leaves unknown specifiers for the browser to report', () => {
    const js = `import helper from './helper'\n`
    expect(rewriteImports(js, URLS)).toBe(js)
  })

  it('never touches lookalikes inside plain strings', () => {
    const js = `const s = "no import here from '@waica/engine' really"\n`
    expect(rewriteImports(js, URLS)).toBe(js)
  })
})

function runner(over: Partial<PlayCodeRunner> = {}): { ran: string[]; runner: PlayCodeRunner } {
  const ran: string[] = []
  return {
    ran,
    runner: {
      transpile: async (source) => `js:${source}`,
      execute: async (js) => {
        ran.push(js)
      },
      ...over,
    },
  }
}

describe('loadPlayCode', () => {
  it('runs every state and role file and reports them loaded', async () => {
    const fs = new MemFS('demo', {
      'src/states/dash.ts': 'dash-code',
      'src/roles/guard.ts': 'guard-code',
      'src/main.ts': 'entry',
    })
    const { ran, runner: r } = runner()
    const result = await loadPlayCode(fs, r, EMPTY_BUNDLE)
    expect(result.loaded).toEqual(['src/states/dash.ts', 'src/roles/guard.ts'])
    expect(result.errors).toEqual([])
    expect(ran).toEqual(['js:dash-code', 'js:guard-code'])
  })

  it('reports a failing file and keeps running the rest', async () => {
    const fs = new MemFS('demo', {
      'src/states/broken.ts': 'broken',
      'src/states/fine.ts': 'fine',
    })
    const { runner: base } = runner()
    const result = await loadPlayCode(
      fs,
      {
        ...base,
        execute: async (js) => {
          if (js.includes('broken')) throw new Error('syntax error')
        },
      },
      EMPTY_BUNDLE,
    )
    expect(result.loaded).toEqual(['src/states/fine.ts'])
    expect(result.errors).toEqual([{ path: 'src/states/broken.ts', message: 'syntax error' }])
  })

  it('resets to the archetype bundle before each Play so deleted role code disappears', async () => {
    const baseline: ArchetypeBundle = {
      roles: {
        player: { description: 'Baseline player.', states: { walk: {} } },
      },
    }
    const fs = new MemFS('demo', { 'src/roles/old-player.ts': 'old-player-code' })
    const { runner: base } = runner()
    const projectRunner: PlayCodeRunner = {
      ...base,
      execute: async (js) => {
        if (js.includes('old-player-code')) defineStates('player', { deletedState: {} })
      },
    }

    await loadPlayCode(fs, projectRunner, baseline)
    expect(logicSet('player')?.deletedState).toBeDefined()

    await fs.deleteFile('src/roles/old-player.ts')
    await loadPlayCode(fs, projectRunner, baseline)

    expect(Object.keys(logicSet('player') ?? {})).toEqual(['walk'])
    expect(logicSet('player')?.deletedState).toBeUndefined()
  })
})

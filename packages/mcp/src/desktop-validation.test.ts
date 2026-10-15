import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { cleanup, makeProject } from './test-helpers.js'
import { match } from '../../engine/src/test-support.js'
import { validateProject, type ValidationFinding } from './validation.js'

// Paid once, bounded, so the one-time source compile never lands inside a test's timeout (as in the other validation tests).
beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const DESKTOP_CODES = new Set(['invalid-desktop-config', 'unknown-achievement-id'])

async function desktopFindings(files: Record<string, string>): Promise<ValidationFinding[]> {
  const project = await makeProject(files)
  roots.push(project)
  return (await validateProject(project)).findings.filter((finding) => DESKTOP_CODES.has(finding.code))
}

function game(desktop: unknown): Record<string, string> {
  return { 'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'platformer', ...(desktop === undefined ? {} : { desktop }) }) }
}

const STEAM = { appId: 480, achievements: ['first-kill'], stats: ['kills'] }

describe('validate_project checks the desktop block (issue #200 CA-21)', () => {
  it.each([
    [{ scale: 0 }, 'scale'],
    [{ fullscreen: 'yes' }, 'fullscreen'],
    [{ steam: { appId: -1 } }, 'steam.appId'],
    [{ steam: { appId: 480, achievements: ['a', 'a'] } }, 'steam.achievements'],
    [{ steam: { appId: 480, stats: ['kills', 'kills'] } }, 'steam.stats'],
  ])('reports %j as an invalid-desktop-config error on desktop.%s', async (desktop, field) => {
    const findings = await desktopFindings(game(desktop))
    expect(findings).toEqual([
      { severity: 'error', code: 'invalid-desktop-config', message: match.stringContaining(`desktop.${field}`), file: 'src/game.json', ref: `game.json:desktop.${field}` },
    ])
  })

  it('reports nothing for a valid block, or for no block', async () => {
    expect(await desktopFindings(game({ fullscreen: true, scale: 1.5, steam: STEAM }))).toEqual([])
    expect(await desktopFindings(game(undefined))).toEqual([])
  })
})

describe('validate_project warns about undeclared achievement ids (issue #200 CA-22)', () => {
  const code = [
    "game.achievements.unlock('first-kill')",
    "game.achievements.unlock('speedrun')",
    'game.achievements.setStat("kills", 1)',
    "game.achievements.setStat('deaths', 2)",
    "void game.achievements.getStat('time')",
    'game.achievements.unlock(id)',
    'game.achievements.setStat(`${prefix}kills`, 3)',
  ].join('\n')

  it('names every literal id missing from desktop.steam.achievements or stats, and the file it is in', async () => {
    const findings = await desktopFindings({ ...game({ steam: STEAM }), 'src/components/score.ts': code, 'src/roles/boss/phase.ts': "game.achievements.unlock('boss')" })
    expect(findings.map(({ severity, code: findingCode, file, ref }) => ({ severity, code: findingCode, file, ref }))).toEqual([
      { severity: 'warning', code: 'unknown-achievement-id', file: 'src/components/score.ts', ref: 'speedrun' },
      { severity: 'warning', code: 'unknown-achievement-id', file: 'src/components/score.ts', ref: 'deaths' },
      { severity: 'warning', code: 'unknown-achievement-id', file: 'src/components/score.ts', ref: 'time' },
      { severity: 'warning', code: 'unknown-achievement-id', file: 'src/roles/boss/phase.ts', ref: 'boss' },
    ])
    expect(findings[0]?.message).toMatch(/unlock\('speedrun'\).*desktop\.steam\.achievements/)
    expect(findings[1]?.message).toMatch(/desktop\.steam\.stats/)
  })

  it('reports nothing when every literal id is declared, or every argument is not a literal', async () => {
    const declared = "game.achievements.unlock('first-kill')\ngame.achievements.setStat('kills', 2)\ngame.achievements.unlock(name)"
    expect(await desktopFindings({ ...game({ steam: STEAM }), 'src/components/score.ts': declared })).toEqual([])
  })
})

describe('validate_project reads null as absent, as waica export desktop does (review of #217)', () => {
  it.each([[null], [{ steam: null }], [{ fullscreen: null, scale: null }], [{ steam: { appId: null, achievements: ['a'] } }]])(
    'reports nothing for %j',
    async (desktop) => {
      expect(await desktopFindings(game(desktop))).toEqual([])
    },
  )
})

describe('unknown-achievement-id without noise (review of #217)', () => {
  it('reports an id once per file and method, however many calls repeat it', async () => {
    const code = "game.achievements.unlock('speedrun')\ngame.achievements.unlock('speedrun')\ngame.achievements.unlock('speedrun')"
    const findings = await desktopFindings({ ...game({ steam: STEAM }), 'src/components/score.ts': code })
    expect(findings.map(({ ref }) => ref)).toEqual(['speedrun'])
  })

  it('skips calls inside comments, and still finds one after a string that holds //', async () => {
    const code = [
      "// TODO: game.achievements.unlock('secret')",
      "/* game.achievements.setStat('old', 1) */",
      "const store = 'https://store.example'; game.achievements.unlock('real')",
    ].join('\n')
    const findings = await desktopFindings({ ...game({ steam: STEAM }), 'src/components/score.ts': code })
    expect(findings.map(({ ref }) => ref)).toEqual(['real'])
  })

  it('adds no id warnings on top of a broken game.json or desktop block', async () => {
    const code = "game.achievements.unlock('speedrun')"
    expect((await desktopFindings({ ...game({ steam: 'on' }), 'src/components/score.ts': code })).map(({ code: c }) => c)).toEqual([
      'invalid-desktop-config',
    ])
    expect(await desktopFindings({ 'src/game.json': '{ not json', 'src/components/score.ts': code })).toEqual([])
  })
})

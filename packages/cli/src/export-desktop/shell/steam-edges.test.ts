// What Steam would take silently (issue #200, review of PR #216): a stat
// outside Steam's int32, and a call Steamworks refuses for an id the Project
// declares but the Steamworks backend does not have.
import { describe, expect, it } from 'vitest'
import { startSteam } from './steam.js'

const SETTINGS = { appId: 480, achievements: ['first-kill'], stats: ['score'] }

/** A steamworks.js stand-in whose client answers every call with `ok`. */
function steamworks(ok: boolean) {
  const setInts: [string, number][] = []
  const module = {
    init: () => ({
      achievement: { activate: () => ok },
      stats: {
        getInt: () => null,
        setInt: (id: string, value: number) => setInts.push([id, value]) > 0 && ok,
        store: () => ok,
      },
    }),
    electronEnableSteamOverlay: () => {},
  }
  return { module, setInts }
}

describe("a stat outside Steam's int32 (review of #216)", () => {
  it.each([3_000_000_000, 2 ** 32 + 5, -(2 ** 31) - 1])('warns and sends nothing for %d', (value) => {
    const fake = steamworks(true)
    const warnings: string[] = []
    startSteam(SETTINGS, () => fake.module, (line) => warnings.push(line)).setStat('score', value)
    expect(fake.setInts).toEqual([])
    expect(warnings).toEqual([expect.stringMatching(/"score".*-2147483648 to 2147483647/)])
  })

  it('sends the bounds themselves', () => {
    const fake = steamworks(true)
    const steam = startSteam(SETTINGS, () => fake.module, () => {})
    steam.setStat('score', 2 ** 31 - 1)
    steam.setStat('score', -(2 ** 31))
    expect(fake.setInts).toEqual([
      ['score', 2147483647],
      ['score', -2147483648],
    ])
  })
})

describe('a call Steamworks refuses (review of #216)', () => {
  it('warns when activate, setInt or store answer false', () => {
    const warnings: string[] = []
    const steam = startSteam(SETTINGS, () => steamworks(false).module, (line) => warnings.push(line))
    steam.unlock('first-kill')
    steam.setStat('score', 7)
    expect(warnings).toEqual([
      expect.stringMatching(/Steam refused achievement "first-kill".*Steamworks/),
      expect.stringMatching(/Steam refused stat "score".*Steamworks/),
    ])
  })

  it('stays quiet when Steam accepts', () => {
    const warnings: string[] = []
    const steam = startSteam(SETTINGS, () => steamworks(true).module, (line) => warnings.push(line))
    steam.unlock('first-kill')
    steam.setStat('score', 7)
    expect(warnings).toEqual([])
  })
})

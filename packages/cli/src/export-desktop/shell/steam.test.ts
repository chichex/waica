import { afterEach, describe, expect, it } from 'vitest'
import type { DesktopShellConfig } from '../desktop-config.js'
import { createDesktopApi } from './desktop-bridge.js'
import { startSteam } from './steam.js'
import { cleanupShellDirs, CONFIG, FakeWindow, listener, rendererIpc, started } from './test-shell.js'

afterEach(cleanupShellDirs)

const STEAM_CONFIG: DesktopShellConfig = { ...CONFIG, steam: { appId: 480, achievements: ['first-kill'], stats: ['kills'] } }

/** A stand-in for steamworks.js: records the order of calls, the activated achievements and the stored stats. */
function fakeSteamworks(options: { initThrows?: boolean } = {}) {
  const calls: string[] = []
  const activated: string[] = []
  const stats = new Map<string, number>()
  const stored: Record<string, number>[] = []
  const module = {
    init: (appId: number) => {
      calls.push(`init(${appId})`)
      if (options.initThrows) throw new Error('Steam is not running')
      return {
        achievement: { activate: (id: string) => activated.push(id) > 0 },
        stats: {
          getInt: (id: string) => stats.get(id) ?? null,
          setInt: (id: string, value: number) => stats.set(id, value).size > 0,
          store: () => stored.push(Object.fromEntries(stats)) > 0,
        },
      }
    },
    electronEnableSteamOverlay: () => calls.push('electronEnableSteamOverlay()'),
  }
  return { module, calls, activated, stats, stored }
}

describe('Steam init and overlay (issue #200 CA-17)', () => {
  it('calls init(appId), then electronEnableSteamOverlay()', () => {
    const steamworks = fakeSteamworks()
    const steam = startSteam(STEAM_CONFIG.steam, () => steamworks.module, () => {})
    expect(steamworks.calls).toEqual(['init(480)', 'electronEnableSteamOverlay()'])
    expect(steam.available).toBe(true)
  })

  it('never loads steamworks.js for an export without Steam', () => {
    let loaded = false
    const steam = startSteam(null, () => (loaded = true), () => {})
    expect(loaded).toBe(false)
    expect(steam.available).toBe(false)
  })

  it('without a Steam client: one warning, achievements unavailable, and the game still opens', async () => {
    const steamworks = fakeSteamworks({ initThrows: true })
    const shell = await started({ config: STEAM_CONFIG, loadSteamworks: () => steamworks.module })
    expect(shell.warnings).toHaveLength(1)
    expect(shell.warnings[0]).toMatch(/Steam is not running/)
    expect(createDesktopApi(rendererIpc(shell.ipc)).achievements.available).toBe(false)
    expect(FakeWindow.created).toHaveLength(1)
    expect(shell.window.loaded).toEqual(['app://game/'])
  })

  it('reports a steamworks.js that does not load as unavailable, with one warning', () => {
    const warnings: string[] = []
    const steam = startSteam(STEAM_CONFIG.steam, () => {
      throw new Error('Cannot find module steamworks.js')
    }, (line) => warnings.push(line))
    expect(steam.available).toBe(false)
    expect(warnings).toHaveLength(1)
  })
})

describe('achievements and stats over the bridge (issue #200 CA-18)', () => {
  async function bridge() {
    const steamworks = fakeSteamworks()
    const shell = await started({ config: STEAM_CONFIG, loadSteamworks: () => steamworks.module })
    return { steamworks, shell, api: createDesktopApi(rendererIpc(shell.ipc)) }
  }

  it('unlocks, sets and stores, and reads a declared stat through the preload API', async () => {
    const { steamworks, shell, api } = await bridge()
    expect(api.achievements.available).toBe(true)
    api.achievements.unlock('first-kill')
    api.achievements.setStat('kills', 3)
    await expect(api.achievements.getStat('kills')).resolves.toBe(3)
    expect(steamworks.activated).toEqual(['first-kill'])
    expect(steamworks.stored).toEqual([{ kills: 3 }])
    expect(shell.warnings).toEqual([])
  })

  it('warns once per call in the main process and forwards nothing for an undeclared id', async () => {
    const { steamworks, shell, api } = await bridge()
    api.achievements.unlock('speedrun')
    api.achievements.setStat('deaths', 1)
    await expect(api.achievements.getStat('deaths')).resolves.toBeUndefined()
    expect(steamworks.activated).toEqual([])
    expect(steamworks.stats.size).toBe(0)
    expect(steamworks.stored).toEqual([])
    expect(shell.warnings).toHaveLength(3)
    expect(shell.warnings[0]).toMatch(/"speedrun".*desktop\.steam\.achievements/)
    expect(shell.warnings[1]).toMatch(/"deaths".*desktop\.steam\.stats/)
  })

  it('ignores a stat value that is not a finite number', async () => {
    const { steamworks, shell } = await bridge()
    listener(shell.ipc, 'on:waica:stat-set')({ returnValue: undefined }, 'kills', 'lots')
    expect(steamworks.stored).toEqual([])
    expect(shell.warnings).toHaveLength(1)
  })
})

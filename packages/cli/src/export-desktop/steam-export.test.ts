import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseExportArgs } from './args.js'
import { exportDesktop } from './export.js'
import { appResources, cleanupTemp, fakeDeps, makeProject } from './test-export.js'

afterEach(cleanupTemp)

const STEAM = { appId: 480, achievements: ['first-kill'], stats: ['kills'] }

/** A fake `npm install`: writes the package it was asked for into the staged app's node_modules. */
function fakeInstaller() {
  const installs: { appDir: string; spec: string }[] = []
  const installSteamworks = async (appDir: string, spec: string) => {
    installs.push({ appDir, spec })
    const [name, version] = spec.split(/@(?=[^@]*$)/)
    const root = path.join(appDir, 'node_modules', name ?? spec)
    await mkdir(root, { recursive: true })
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name, version }))
  }
  return { installs, installSteamworks }
}

async function exportLinux(dir: string, flags: string[] = []) {
  const installer = fakeInstaller()
  const fake = await fakeDeps({ installSteamworks: installer.installSteamworks })
  await exportDesktop({ ...parseExportArgs([dir, ...flags]), platforms: ['linux'] }, fake.deps)
  const app = appResources(path.join(dir, 'export', 'hero-quest-linux-x64'), 'linux', 'hero-quest')
  const config = JSON.parse(await readFile(path.join(app, 'waica-desktop.json'), 'utf8')) as { steam: unknown }
  return { app, installs: installer.installs, steam: config.steam }
}

async function stagedSteamworks(app: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(app, 'node_modules', 'steamworks.js', 'package.json'), 'utf8')) as unknown
}

describe('Steam is opt-in (issue #200 CA-16)', () => {
  it("includes steamworks.js@0.4.0 and steam_appid.txt when game.json declares desktop.steam", async () => {
    const dir = await makeProject({ desktop: { steam: STEAM } })
    const { app, installs, steam } = await exportLinux(dir)
    expect(installs.map(({ spec }) => spec)).toEqual(['steamworks.js@0.4.0'])
    expect(await stagedSteamworks(app)).toEqual({ name: 'steamworks.js', version: '0.4.0' })
    expect(await readFile(path.join(app, 'steam_appid.txt'), 'utf8')).toBe('480')
    expect(steam).toEqual(STEAM)
  })

  it('takes the app id from --steam-app-id, with or without a desktop.steam block', async () => {
    const declared = await exportLinux(await makeProject({ desktop: { steam: STEAM } }), ['--steam-app-id', '123'])
    expect(await readFile(path.join(declared.app, 'steam_appid.txt'), 'utf8')).toBe('123')
    expect(declared.steam).toEqual({ ...STEAM, appId: 123 })
    const bare = await exportLinux(await makeProject(), ['--steam-app-id', '123'])
    expect(await readFile(path.join(bare.app, 'steam_appid.txt'), 'utf8')).toBe('123')
    expect(await stagedSteamworks(bare.app)).toEqual({ name: 'steamworks.js', version: '0.4.0' })
    expect(bare.steam).toEqual({ appId: 123, achievements: [], stats: [] })
  })

  it('leaves everything Steam-related out with --no-steam', async () => {
    const { app, installs, steam } = await exportLinux(await makeProject({ desktop: { steam: STEAM } }), ['--no-steam'])
    expect(installs).toEqual([])
    expect(existsSync(path.join(app, 'steam_appid.txt'))).toBe(false)
    expect(existsSync(path.join(app, 'node_modules'))).toBe(false)
    expect(steam).toBeNull()
  })

  it('leaves everything Steam-related out without a desktop.steam block', async () => {
    const { app, installs, steam } = await exportLinux(await makeProject({ desktop: { scale: 1 } }))
    expect(installs).toEqual([])
    expect(existsSync(path.join(app, 'steam_appid.txt'))).toBe(false)
    expect(existsSync(path.join(app, 'node_modules'))).toBe(false)
    expect(steam).toBeNull()
  })
})

import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCli } from '../run-cli.js'
import { parseExportArgs } from './args.js'
import { runExportCommand } from './command.js'
import { exportDesktop, readElectronVersion, type PackagerCall } from './export.js'
import { DEFAULT_ICON_DIR } from './icons.js'
import { appResources, cleanupTemp, fakeDeps, makePng, makeProject, sha256, tempDir, treeDigests, zipEntries } from './test-export.js'

afterEach(cleanupTemp)

/** Runs `waica export desktop …` as the binary does, capturing stderr and the exit code. */
async function exportCli(argv: string[], deps: Awaited<ReturnType<typeof fakeDeps>>['deps']) {
  const lines: string[] = []
  const exit: { exitCode?: number } = {}
  await runCli(() => runExportCommand(['desktop', ...argv], deps), {
    stderr: { write: (text: string) => lines.push(text) },
    process: exit,
  })
  return { lines, exitCode: exit.exitCode }
}

describe('waica export desktop: preflight (issue #200 CA-7)', () => {
  it('refuses a directory without src/game.json before building anything', async () => {
    const dir = await tempDir()
    const fake = await fakeDeps()
    const { lines, exitCode } = await exportCli([dir], fake.deps)
    expect(exitCode).toBe(1)
    expect(lines).toEqual([`waica: export desktop: not a waica project: ${dir}\n`])
    expect(fake.builds).toEqual([])
    expect(fake.packaged).toEqual([])
  })
})

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown
}

describe('waica export desktop: build and staging (issue #200 CA-8)', () => {
  it("runs the Project's own build into a temporary directory and removes it afterwards", async () => {
    const dir = await makeProject()
    const fake = await fakeDeps()
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['linux'] }, fake.deps)
    expect(fake.builds).toHaveLength(1)
    const [build] = fake.builds
    expect(build?.project).toBe(dir)
    expect(build?.outDir.startsWith(os.tmpdir())).toBe(true)
    expect(build?.outDir.startsWith(dir)).toBe(false)
    expect(existsSync(build?.outDir ?? '')).toBe(false)
  })

  it('stages resources/app with dist/, the shell, the preload, package.json and waica-desktop.json', async () => {
    const dir = await makeProject()
    const fake = await fakeDeps()
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['linux'] }, fake.deps)
    const app = appResources(path.join(dir, 'export', 'hero-quest-linux-x64'), 'linux', 'hero-quest')
    expect((await readdir(app)).sort()).toEqual(
      ['dist', 'icon.png', 'main.js', 'package.json', 'preload.js', 'shell.js', 'waica-desktop.json'].sort(),
    )
    expect((await readdir(path.join(app, 'dist'), { recursive: true })).sort()).toEqual(
      ['assets', 'assets/index-abc.js', 'index.html', 'waica.params.json'].sort(),
    )
    expect(await readJson(path.join(app, 'package.json'))).toEqual({
      name: 'hero-quest',
      productName: 'hero-quest',
      version: '1.2.3',
      main: 'main.js',
      type: 'module',
      private: true,
    })
    expect(await readJson(path.join(app, 'waica-desktop.json'))).toEqual({
      name: 'hero-quest',
      desktop: { fullscreen: false, scale: 2 },
      resolution: { width: 640, height: 360 },
      steam: null,
    })
    expect(await readFile(path.join(app, 'preload.js'), 'utf8')).toContain("exposeInMainWorld('waicaDesktop'")
  })

})

describe('waica export desktop: waica-desktop.json (issue #200 CA-8)', () => {
  it("bakes game.json's desktop block and Steam settings into waica-desktop.json", async () => {
    const dir = await makeProject({
      desktop: { fullscreen: true, scale: 3, steam: { appId: 480, achievements: ['first-kill'], stats: ['kills'] } },
    })
    // Steam's own staging is CA-16's (steam-export.test.ts); here only waica-desktop.json matters.
    const fake = await fakeDeps({ installSteamworks: () => Promise.resolve() })
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['linux'] }, fake.deps)
    const app = appResources(path.join(dir, 'export', 'hero-quest-linux-x64'), 'linux', 'hero-quest')
    expect(await readJson(path.join(app, 'waica-desktop.json'))).toEqual({
      name: 'hero-quest',
      desktop: { fullscreen: true, scale: 3 },
      resolution: { width: 640, height: 360 },
      steam: { appId: 480, achievements: ['first-kill'], stats: ['kills'] },
    })
  })

  it('falls back to no resolution when game.json declares none', async () => {
    const dir = await makeProject({ resolution: undefined })
    const fake = await fakeDeps()
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['linux'] }, fake.deps)
    const app = appResources(path.join(dir, 'export', 'hero-quest-linux-x64'), 'linux', 'hero-quest')
    expect(await readJson(path.join(app, 'waica-desktop.json'))).toMatchObject({ resolution: null })
  })

  it.each([
    [{ desktop: { scale: 0 } }, /desktop\.scale/],
    [{ desktop: { fullscreen: 'yes' } }, /desktop\.fullscreen/],
    [{ desktop: { steam: { appId: 1.5 } } }, /desktop\.steam\.appId/],
    [{ desktop: { steam: { appId: 480, achievements: [3] } } }, /desktop\.steam\.achievements/],
  ])('refuses an invalid desktop block %j before building', async (game, message) => {
    const dir = await makeProject(game)
    const fake = await fakeDeps()
    await expect(exportDesktop(parseExportArgs([dir]), fake.deps)).rejects.toThrow(message)
    expect(fake.builds).toEqual([])
  })
})

describe('waica export desktop: app metadata (issue #200 CA-11)', () => {
  it("names and versions the app from the Project's package.json, and --name overrides the name", async () => {
    const dir = await makeProject()
    const fake = await fakeDeps()
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['win32'] }, fake.deps)
    await exportDesktop({ ...parseExportArgs([dir, '--name', 'Hero Quest']), platforms: ['win32'] }, fake.deps)
    expect(fake.packaged.map(({ name, executableName, appVersion, win32metadata }) => ({ name, executableName, appVersion, win32metadata }))).toEqual([
      // The real packager refuses a Windows target without a CompanyName (it would read package.json's author).
      { name: 'hero-quest', executableName: 'hero-quest', appVersion: '1.2.3', win32metadata: { CompanyName: 'hero-quest', ProductName: 'hero-quest', FileDescription: 'hero-quest' } },
      { name: 'Hero Quest', executableName: 'Hero Quest', appVersion: '1.2.3', win32metadata: { CompanyName: 'Hero Quest', ProductName: 'Hero Quest', FileDescription: 'Hero Quest' } },
    ])
    expect(existsSync(path.join(dir, 'export', 'Hero Quest-win32-x64', 'Hero Quest.exe'))).toBe(true)
  })

})

describe('waica export desktop: icons (issue #200 CA-11)', () => {
  it('pins the Electron version and hands packager an icon whose .ico and .icns sit beside it', async () => {
    const dir = await makeProject()
    const fake = await fakeDeps({
      packager: async (call) => {
        const base = call.icon.replace(/\.png$/, '')
        icons.push({ png: await sha256(call.icon), ico: await readFile(`${base}.ico`), icns: await readFile(`${base}.icns`) })
        return (await fakeDeps()).deps.packager(call)
      },
    })
    const icons: { png: string; ico: Buffer; icns: Buffer }[] = []
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['darwin'] }, fake.deps)
    const [icon] = icons
    expect(icon?.png).toBe(await sha256(path.join(DEFAULT_ICON_DIR, 'icon.png')))
    expect(icon?.ico.equals(await readFile(path.join(DEFAULT_ICON_DIR, 'icon.ico')))).toBe(true)
    expect(icon?.icns.equals(await readFile(path.join(DEFAULT_ICON_DIR, 'icon.icns')))).toBe(true)
  })

})

describe('waica export desktop: a custom icon (issue #200 CA-11)', () => {
  it('takes src/art/icon.png over the default, and --icon over both, converting the PNG to .ico and .icns', async () => {
    const artIcon = makePng(64, [200, 30, 30])
    const flagIcon = makePng(48, [30, 200, 30])
    const dir = await makeProject({}, { 'src/art/icon.png': artIcon })
    const flagFile = path.join(await tempDir(), 'logo.png')
    await writeFile(flagFile, flagIcon)
    const seen: { png: Buffer; ico: Buffer; icns: Buffer }[] = []
    const fake = await fakeDeps()
    const record = async (call: PackagerCall) => {
      const base = call.icon.replace(/\.png$/, '')
      seen.push({ png: await readFile(call.icon), ico: await readFile(`${base}.ico`), icns: await readFile(`${base}.icns`) })
      return fake.deps.packager(call)
    }
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['linux'] }, { ...fake.deps, packager: record })
    await exportDesktop({ ...parseExportArgs([dir, '--icon', flagFile]), platforms: ['linux'] }, { ...fake.deps, packager: record })
    expect(seen[0]?.png.equals(artIcon)).toBe(true)
    expect(seen[1]?.png.equals(flagIcon)).toBe(true)
    for (const { ico, icns } of seen) {
      expect(ico.subarray(0, 4).toString('hex')).toBe('00000100')
      expect(icns.subarray(0, 4).toString('ascii')).toBe('icns')
    }
    const app = appResources(path.join(dir, 'export', 'hero-quest-linux-x64'), 'linux', 'hero-quest')
    expect((await readFile(path.join(app, 'icon.png'))).equals(flagIcon)).toBe(true)
  })

  it('refuses an --icon that is not a PNG, before building', async () => {
    const dir = await makeProject()
    const notPng = path.join(await tempDir(), 'logo.png')
    await writeFile(notPng, 'GIF89a')
    const fake = await fakeDeps()
    await expect(exportDesktop(parseExportArgs([dir, '--icon', notPng]), fake.deps)).rejects.toThrow(/is not a PNG image/)
    expect(fake.builds).toEqual([])
  })
})

describe('waica export desktop: output (issue #200 CA-12)', () => {
  it('writes one folder and one zip per platform under <project>/export', async () => {
    const dir = await makeProject()
    const fake = await fakeDeps()
    await exportDesktop(parseExportArgs([dir]), fake.deps)
    expect((await readdir(path.join(dir, 'export'))).sort()).toEqual([
      'hero-quest-darwin-arm64',
      'hero-quest-darwin-arm64.zip',
      'hero-quest-linux-x64',
      'hero-quest-linux-x64.zip',
      'hero-quest-win32-x64',
      'hero-quest-win32-x64.zip',
    ])
    expect(fake.packaged.map(({ platform, arch, electronVersion }) => `${platform}-${arch}@${electronVersion}`)).toEqual([
      'linux-x64@44.7.2',
      'win32-x64@44.7.2',
      'darwin-arm64@44.7.2',
    ])
  })

  it('writes to --out instead', async () => {
    const dir = await makeProject()
    const out = path.join(await tempDir(), 'builds')
    await exportDesktop({ ...parseExportArgs([dir, '--out', out]), platforms: ['linux'] }, (await fakeDeps()).deps)
    expect((await readdir(out)).sort()).toEqual(['hero-quest-linux-x64', 'hero-quest-linux-x64.zip'])
    expect(existsSync(path.join(dir, 'export'))).toBe(false)
  })

})

describe('waica export desktop: replacing an export (issue #200 CA-12)', () => {
  it('zips the folder as the archive’s top-level entry', async () => {
    const dir = await makeProject()
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['linux'] }, (await fakeDeps()).deps)
    const names = zipEntries(await readFile(path.join(dir, 'export', 'hero-quest-linux-x64.zip'))).map((entry) => entry.name)
    expect(names).toContain('hero-quest-linux-x64/hero-quest')
    expect(names).toContain('hero-quest-linux-x64/resources/app/dist/index.html')
    expect(names.every((name) => name.startsWith('hero-quest-linux-x64'))).toBe(true)
  })

  it("re-exporting only linux replaces linux's folder and zip and leaves the others byte-identical", async () => {
    const dir = await makeProject()
    const fake = await fakeDeps()
    await exportDesktop(parseExportArgs([dir]), fake.deps)
    const before = await treeDigests(path.join(dir, 'export'))
    await exportDesktop(parseExportArgs([dir, '--platform', 'linux']), fake.deps)
    const after = await treeDigests(path.join(dir, 'export'))
    const changed = Object.keys(after).filter((file) => after[file] !== before[file])
    expect(changed.sort()).toEqual(['hero-quest-linux-x64.zip', 'hero-quest-linux-x64/build-stamp.txt'])
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort())
  })

  it('leaves no scratch folder behind in the output directory', async () => {
    const dir = await makeProject()
    const fake = await fakeDeps({ packager: () => Promise.reject(new Error('download failed')) })
    await expect(exportDesktop({ ...parseExportArgs([dir]), platforms: ['linux'] }, fake.deps)).rejects.toThrow('download failed')
    expect(await readdir(path.join(dir, 'export'))).toEqual([])
  })

  it("adds export/ to the template's .gitignore, which create_project and the editor both write", async () => {
    const gitignore = await readFile(path.resolve(import.meta.dirname, '../../../editor/template/_gitignore'), 'utf8')
    expect(gitignore.split('\n')).toContain('export/')
  })
})

describe('waica export desktop: Windows from another host (issue #200 CA-13)', () => {
  it('writes the Windows folder and zip, and exits 0, with no wine on PATH', async () => {
    const dir = await makeProject()
    const fake = await fakeDeps()
    const { lines, exitCode } = await exportCli([dir, '--platform', 'win32'], fake.deps)
    expect(exitCode).toBeUndefined()
    expect(lines).toEqual([])
    expect(existsSync(path.join(dir, 'export', 'hero-quest-win32-x64', 'hero-quest.exe'))).toBe(true)
    expect(existsSync(path.join(dir, 'export', 'hero-quest-win32-x64.zip'))).toBe(true)
    expect(fake.lines.warn).toEqual([])
  })
})

describe('the pinned Electron version (issue #200 inference 3)', () => {
  it("reads the build's electron-version.json, and the package manifest in a checkout", async () => {
    const built = await tempDir()
    await writeFile(path.join(built, 'electron-version.json'), JSON.stringify({ devDependencies: { electron: '44.7.2' } }))
    await expect(readElectronVersion(built)).resolves.toBe('44.7.2')
    const manifest = JSON.parse(await readFile(path.resolve(import.meta.dirname, '../../package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
    }
    await expect(readElectronVersion(import.meta.dirname)).resolves.toBe(manifest.devDependencies['electron'])
  })

  it('refuses a range instead of an exact version', async () => {
    const built = await tempDir()
    await writeFile(path.join(built, 'electron-version.json'), JSON.stringify({ devDependencies: { electron: '^44.0.0' } }))
    await expect(readElectronVersion(built)).rejects.toThrow(/pinned Electron version/)
  })
})

// The export's edges (issue #200, review of PR #215): `waica export --help`,
// a display name with characters a file name cannot hold, progress while
// packager works, the error for a `desktop` that is not an object, and a
// Project whose vite.config.ts sets its own `base`.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCli } from '../run-cli.js'
import { parseExportArgs } from './args.js'
import { runExportCommand } from './command.js'
import { resolveShellConfig } from './desktop-config.js'
import { exportDesktop } from './export.js'
import { appResources, cleanupTemp, fakeDeps, makeProject, tempDir, writeTree } from './test-export.js'
import { viteBuild } from './vite-build.js'

afterEach(cleanupTemp)

describe('waica export --help (review of #215)', () => {
  it('prints the help for `waica export --help` and exits 0', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const stderr: string[] = []
    const exit: { exitCode?: number } = {}
    await runCli(() => runExportCommand(['--help']), { stderr: { write: (text: string) => stderr.push(text) }, process: exit })
    expect(exit.exitCode).toBeUndefined()
    expect(stderr).toEqual([])
    expect(String(log.mock.calls[0]?.[0])).toContain('export desktop')
  })
})

describe('a display name a file name cannot hold (review of #215)', () => {
  it('titles the window and names the product "Hero: Quest", and keeps "Hero- Quest" for files', async () => {
    const dir = await makeProject()
    const fake = await fakeDeps()
    await exportDesktop({ ...parseExportArgs([dir, '--name', 'Hero: Quest']), platforms: ['win32'] }, fake.deps)
    const [call] = fake.packaged
    expect(call).toMatchObject({
      name: 'Hero- Quest',
      executableName: 'Hero- Quest',
      win32metadata: { CompanyName: 'Hero: Quest', ProductName: 'Hero: Quest', FileDescription: 'Hero: Quest' },
    })
    const app = appResources(path.join(dir, 'export', 'Hero- Quest-win32-x64'), 'win32', 'Hero- Quest')
    const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(path.join(app, file), 'utf8'))
    expect(await readJson('waica-desktop.json')).toMatchObject({ name: 'Hero: Quest' })
    expect(await readJson('package.json')).toMatchObject({ productName: 'Hero: Quest' })
  })
})

describe('progress while packager works (review of #215)', () => {
  it('says which platform it packages before packager starts (it may download Electron first)', async () => {
    const dir = await makeProject()
    const fake = await fakeDeps()
    const seenBeforePackaging: string[][] = []
    const packager = fake.deps.packager.bind(fake.deps)
    fake.deps.packager = (call) => {
      seenBeforePackaging.push([...fake.lines.info])
      return packager(call)
    }
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['linux', 'darwin'] }, fake.deps)
    expect(seenBeforePackaging[0]?.at(-1)).toMatch(/packaging linux-x64/)
    expect(seenBeforePackaging[1]?.at(-1)).toMatch(/packaging darwin-arm64/)
  })
})

describe("game.json's desktop block that is not an object (review of #215)", () => {
  it.each([[3], ['on'], [[1]]])('names the block itself for %j', (desktop: unknown) => {
    expect(() => resolveShellConfig({ desktop }, 'game', { enabled: true, appId: null })).toThrow(
      /^game\.json desktop must be an object$/,
    )
  })
})

describe("the Project's own vite build (review of #215)", () => {
  it('builds with base "/" whatever vite.config.ts says, since the shell serves dist/ at app://game/', async () => {
    const project = await tempDir()
    const argvFile = path.join(project, 'argv.json')
    await writeTree(project, {
      'node_modules/vite/bin/vite.js': `require('node:fs').writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)))\n`,
    })
    await viteBuild(project, path.join(project, 'out'))
    const argv: unknown = JSON.parse(await readFile(argvFile, 'utf8'))
    expect(argv).toEqual(['build', '--outDir', path.join(project, 'out'), '--emptyOutDir', '--base', '/'])
  })
})

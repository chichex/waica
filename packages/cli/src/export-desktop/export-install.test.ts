// A Project without node_modules: the export installs it with the manager its
// lockfile names, before the build (the maintainer reversed H-20 of issue
// #200); --no-install keeps the strict preflight. Fake installer, see fakeDeps.
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCli } from '../run-cli.js'
import { parseExportArgs } from './args.js'
import { runExportCommand } from './command.js'
import { exportDesktop } from './export.js'
import { cleanupTemp, fakeDeps, makeProject } from './test-export.js'

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

async function uninstalledProject(lockfile?: string): Promise<string> {
  const dir = await makeProject()
  await rm(path.join(dir, 'node_modules'), { recursive: true })
  if (lockfile !== undefined) await writeFile(path.join(dir, lockfile), '')
  return dir
}

describe('waica export desktop --no-install', () => {
  it('refuses a Project without node_modules under --no-install, naming the command to run', async () => {
    const dir = await uninstalledProject()
    const fake = await fakeDeps()
    const { lines, exitCode } = await exportCli([dir, '--no-install'], fake.deps)
    expect(exitCode).toBe(1)
    expect(lines).toEqual([`waica: export desktop: run npm install in ${dir} first (or drop --no-install)\n`])
    expect(fake.installs).toEqual([])
    expect(fake.builds).toEqual([])
  })

  it("names the Project's own package manager in that command", async () => {
    const dir = await uninstalledProject('pnpm-lock.yaml')
    const { lines } = await exportCli([dir, '--no-install'], (await fakeDeps()).deps)
    expect(lines).toEqual([`waica: export desktop: run pnpm install in ${dir} first (or drop --no-install)\n`])
  })
})

describe('waica export desktop: installs missing dependencies', () => {
  it('installs before the build, after saying so, when node_modules is missing', async () => {
    const dir = await uninstalledProject()
    const fake = await fakeDeps()
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['linux'] }, fake.deps)
    expect(fake.installs).toEqual([{ dir, manager: 'npm' }])
    expect(fake.calls).toEqual(['install', 'build'])
    expect(fake.lines.info[0]).toBe('installing dependencies (npm install)…')
  })

  it.each([
    [undefined, 'npm'],
    ['package-lock.json', 'npm'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
  ] as const)('with lockfile %s installs with %s', async (lockfile, manager) => {
    const dir = await uninstalledProject(lockfile)
    const fake = await fakeDeps()
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['linux'] }, fake.deps)
    expect(fake.installs).toEqual([{ dir, manager }])
    expect(fake.lines.info[0]).toBe(`installing dependencies (${manager} install)…`)
  })

  it('does not reinstall when node_modules already exists', async () => {
    const dir = await makeProject({}, { 'pnpm-lock.yaml': '' })
    const fake = await fakeDeps()
    await exportDesktop({ ...parseExportArgs([dir]), platforms: ['linux'] }, fake.deps)
    expect(fake.installs).toEqual([])
    expect(fake.calls).toEqual(['build'])
    expect(fake.lines.info.some((line) => line.startsWith('installing dependencies'))).toBe(false)
  })

  it('stops with the installer\'s one-line failure and never builds', async () => {
    const dir = await uninstalledProject()
    const fake = await fakeDeps({ installDependencies: () => Promise.reject(new Error('npm install failed (exit 3)')) })
    const { lines, exitCode } = await exportCli([dir], fake.deps)
    expect(exitCode).toBe(1)
    expect(lines).toEqual(['waica: export desktop: npm install failed (exit 3)\n'])
    expect(fake.builds).toEqual([])
    expect(fake.packaged).toEqual([])
  })
})


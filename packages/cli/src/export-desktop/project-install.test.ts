// The real dependency install of an exported Project (issue #200 H-20, reversed
// by the maintainer): the package manager comes from the lockfile, runs in the
// Project, and a missing binary or a failed install says which command broke.
// Stand-in binaries on PATH, like steam-install.test.ts.
import { chmod, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectPackageManager, installCommand, installDependencies, type PackageManager } from './project-install.js'
import { cleanupTemp, tempDir, writeTree } from './test-export.js'

afterEach(async () => {
  vi.unstubAllEnvs()
  await cleanupTemp()
})

/** A directory holding a `manager` that records its cwd and arguments and exits with `code`. */
async function fakeManager(manager: PackageManager, code: number): Promise<{ bin: string; recordFile: string }> {
  const bin = await tempDir()
  const recordFile = path.join(bin, 'record.txt')
  await writeTree(bin, { [manager]: `#!/bin/sh\necho "$PWD|$@" > ${JSON.stringify(recordFile)}\nexit ${code}\n` })
  await chmod(path.join(bin, manager), 0o755)
  return { bin, recordFile }
}

describe('the package manager of a Project', () => {
  it.each([
    [[], 'npm'],
    [['package-lock.json'], 'npm'],
    [['pnpm-lock.yaml'], 'pnpm'],
    [['yarn.lock'], 'yarn'],
    [['package-lock.json', 'yarn.lock'], 'yarn'],
  ] as const)('with lockfiles %j is %s', async (lockfiles, manager) => {
    const dir = await tempDir()
    for (const lockfile of lockfiles) await writeFile(path.join(dir, lockfile), '')
    expect(detectPackageManager(dir)).toBe(manager)
  })
})

describe('installing the dependencies of a Project', () => {
  it.each(['npm', 'pnpm', 'yarn'] as const)('runs `%s install` with the Project as its cwd', async (manager) => {
    const fake = await fakeManager(manager, 0)
    vi.stubEnv('PATH', fake.bin)
    const dir = await tempDir()
    await installDependencies(dir, manager)
    expect((await readFile(fake.recordFile, 'utf8')).trim()).toBe(`${await realpathOf(dir)}|install`)
  })

  it('says the manager is missing from PATH, keeping the cause', async () => {
    vi.stubEnv('PATH', await tempDir())
    const failure = installDependencies(await tempDir(), 'pnpm')
    await expect(failure).rejects.toThrow(/^pnpm install needs pnpm on PATH/)
    await expect(failure).rejects.toHaveProperty('cause.code', 'ENOENT')
  })

  it('names the command and its exit code when the install fails', async () => {
    const fake = await fakeManager('yarn', 3)
    vi.stubEnv('PATH', fake.bin)
    await expect(installDependencies(await tempDir(), 'yarn')).rejects.toThrow(
      /^yarn install failed \(exit 3\); its output above says why$/,
    )
  })
})

describe('the install command line per platform (DEP0190)', () => {
  it('passes arguments on Linux and macOS, and one command line through cmd.exe on Windows', () => {
    expect(installCommand('linux', 'pnpm')).toEqual({ file: 'pnpm', args: ['install'], shell: false })
    expect(installCommand('darwin', 'yarn')).toEqual({ file: 'yarn', args: ['install'], shell: false })
    expect(installCommand('win32', 'npm')).toEqual({ file: 'npm.cmd install', args: [], shell: true })
    expect(installCommand('win32', 'pnpm')).toEqual({ file: 'pnpm.cmd install', args: [], shell: true })
  })
})

async function realpathOf(dir: string): Promise<string> {
  const { realpath } = await import('node:fs/promises')
  return realpath(dir)
}

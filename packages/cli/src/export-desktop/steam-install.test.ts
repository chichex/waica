// The real `npm install` of steamworks.js (issue #200 inference 11, review of
// PR #216), against a stand-in `npm` on PATH: lifecycle scripts never run,
// a missing npm or a failed install says what happened, and Windows gets one
// command line instead of arguments through a shell (DEP0190).
import { chmod, readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { npmCommand, npmInstall } from './steam-install.js'
import { cleanupTemp, tempDir, writeTree } from './test-export.js'

afterEach(async () => {
  vi.unstubAllEnvs()
  await cleanupTemp()
})

/** A directory holding an `npm` that records its arguments and exits with `code`. */
async function fakeNpm(code: number): Promise<{ bin: string; argvFile: string }> {
  const bin = await tempDir()
  const argvFile = path.join(bin, 'argv.txt')
  await writeTree(bin, { npm: `#!/bin/sh\necho "$@" > ${JSON.stringify(argvFile)}\nexit ${code}\n` })
  await chmod(path.join(bin, 'npm'), 0o755)
  return { bin, argvFile }
}

describe('npm install of steamworks.js (review of #216)', () => {
  it('never runs lifecycle scripts', async () => {
    const npm = await fakeNpm(0)
    vi.stubEnv('PATH', npm.bin)
    await npmInstall(await tempDir(), 'steamworks.js@0.4.0')
    expect((await readFile(npm.argvFile, 'utf8')).trim().split(' ')).toContain('--ignore-scripts')
  })

  it('says npm is missing from PATH, keeping the cause', async () => {
    vi.stubEnv('PATH', await tempDir())
    const failure = npmInstall(await tempDir(), 'steamworks.js@0.4.0')
    await expect(failure).rejects.toThrow(/needs npm on PATH/)
    await expect(failure).rejects.toHaveProperty('cause.code', 'ENOENT')
  })

  it('names the exit code and points at npm\'s own output, not only the network', async () => {
    const npm = await fakeNpm(3)
    vi.stubEnv('PATH', npm.bin)
    await expect(npmInstall(await tempDir(), 'steamworks.js@0.4.0')).rejects.toThrow(
      /npm install steamworks\.js@0\.4\.0 failed \(exit 3\); npm's output above says why/,
    )
  })
})

describe('the npm command line per platform (review of #216)', () => {
  it('passes arguments on Linux and macOS, and one command line through cmd.exe on Windows', () => {
    expect(npmCommand('linux', ['install', 'x'])).toEqual({ file: 'npm', args: ['install', 'x'], shell: false })
    expect(npmCommand('win32', ['install', 'x'])).toEqual({ file: 'npm.cmd install x', args: [], shell: true })
  })
})

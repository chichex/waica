import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/** The package managers an exported Project can have installed itself with. */
export type PackageManager = 'npm' | 'pnpm' | 'yarn'

/**
 * The manager that wrote the Project's lockfile: `pnpm-lock.yaml` is pnpm,
 * `yarn.lock` is yarn, and `package-lock.json` or none is npm.
 */
export function detectPackageManager(dir: string): PackageManager {
  if (existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(path.join(dir, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

/**
 * How to spawn `<manager> install` on `platform`. On Windows the managers are
 * `.cmd` shims, which Node runs only through a shell, and a shell takes one
 * command line: arguments beside `shell: true` are deprecated (DEP0190). The
 * line is built from constants only.
 */
export function installCommand(platform: NodeJS.Platform, manager: PackageManager): { file: string; args: string[]; shell: boolean } {
  return platform === 'win32' ? { file: `${manager}.cmd install`, args: [], shell: true } : { file: manager, args: ['install'], shell: false }
}

/**
 * Runs `<manager> install` in the Project, its output on the console. It
 * installs exactly what the Project's package.json and lockfile say, scripts
 * included, as running the same command by hand would.
 */
export async function installDependencies(dir: string, manager: PackageManager): Promise<void> {
  const command = installCommand(process.platform, manager)
  const child = spawn(command.file, command.args, { cwd: dir, stdio: ['ignore', 'inherit', 'inherit'], shell: command.shell })
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', (error) => reject(new Error(`${manager} install needs ${manager} on PATH (${error.message})`, { cause: error })))
    child.once('exit', resolve)
  })
  if (code !== 0) throw new Error(`${manager} install failed (exit ${String(code)}); its output above says why`)
}

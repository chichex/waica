import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SteamSettings } from './desktop-config.js'

/** The steamworks.js an export with Steam ships; its package carries the prebuilt binaries for all three platforms. */
export const STEAMWORKS = 'steamworks.js@0.4.0'

/**
 * How to spawn npm on `platform`. On Windows npm is npm.cmd, which Node runs
 * only through a shell, and a shell takes one command line: arguments beside
 * `shell: true` are deprecated (DEP0190). Every argument here is a constant.
 */
export function npmCommand(platform: NodeJS.Platform, args: string[]): { file: string; args: string[]; shell: boolean } {
  return platform === 'win32' ? { file: ['npm.cmd', ...args].join(' '), args: [], shell: true } : { file: 'npm', args, shell: false }
}

/**
 * `npm install <spec>` into the staged app (issue #200 inference 11): it
 * downloads, so it needs the network. Lifecycle scripts never run: the
 * package carries prebuilt binaries, and nothing it pulls in should execute
 * on the machine that exports.
 */
export async function npmInstall(appDir: string, spec: string): Promise<void> {
  const args = ['install', spec, '--omit=dev', '--save-exact', '--no-package-lock', '--ignore-scripts', '--no-audit', '--no-fund']
  const command = npmCommand(process.platform, args)
  const child = spawn(command.file, command.args, { cwd: appDir, stdio: ['ignore', 'inherit', 'inherit'], shell: command.shell })
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', (error) => reject(new Error(`installing ${spec} for Steam needs npm on PATH (${error.message})`, { cause: error })))
    child.once('exit', resolve)
  })
  if (code !== 0) {
    throw new Error(`npm install ${spec} failed (exit ${String(code)}); npm's output above says why (Steam needs the network at export time)`)
  }
}

/**
 * Adds Steam to a staged app (CA-16): steam_appid.txt with the app id, and
 * steamworks.js in its node_modules. The shell hands steamworks.js the id
 * through `init(appId)`, which needs no file; steam_appid.txt sits in
 * resources/app, beside the app's package.json, as CA-16 asks, not beside
 * the executable, where Steamworks itself would look for one.
 * docs/desktop-export.md says to leave it out of the build uploaded to Steam.
 */
export async function stageSteam(
  appDir: string,
  steam: SteamSettings,
  install: (appDir: string, spec: string) => Promise<void>,
): Promise<void> {
  await writeFile(path.join(appDir, 'steam_appid.txt'), String(steam.appId))
  await install(appDir, STEAMWORKS)
}

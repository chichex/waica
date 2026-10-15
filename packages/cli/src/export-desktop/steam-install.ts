import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SteamSettings } from './desktop-config.js'

/** The steamworks.js an export with Steam ships; its package carries the prebuilt binaries for all three platforms. */
export const STEAMWORKS = 'steamworks.js@0.4.0'

/** `npm install <spec>` into the staged app (issue #200 inference 11): it downloads, so it needs the network. */
export async function npmInstall(appDir: string, spec: string): Promise<void> {
  const windows = process.platform === 'win32'
  const args = ['install', spec, '--omit=dev', '--save-exact', '--no-package-lock', '--no-audit', '--no-fund']
  // npm is npm.cmd on Windows, which Node runs only through a shell.
  const child = spawn(windows ? 'npm.cmd' : 'npm', args, { cwd: appDir, stdio: ['ignore', 'inherit', 'inherit'], shell: windows })
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  if (code !== 0) throw new Error(`npm install ${spec} failed (exit ${String(code)}): Steam needs the network at export time`)
}

/** Adds Steam to a staged app (CA-16): steam_appid.txt with the app id, and steamworks.js in its node_modules. */
export async function stageSteam(
  appDir: string,
  steam: SteamSettings,
  install: (appDir: string, spec: string) => Promise<void>,
): Promise<void> {
  await writeFile(path.join(appDir, 'steam_appid.txt'), String(steam.appId))
  await install(appDir, STEAMWORKS)
}

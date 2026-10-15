import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ExportArgs, ExportPlatform } from './args.js'
import { resolveShellConfig } from './desktop-config.js'
import { prepareIcons } from './icons.js'
import { readDesktopProject } from './project.js'
import { stageApp } from './stage.js'
import { npmInstall, stageSteam } from './steam-install.js'
import { viteBuild } from './vite-build.js'
import { zipDirectory } from './zip.js'

/** What the export hands @electron/packager for one platform. */
export interface PackagerCall {
  dir: string
  out: string
  name: string
  executableName: string
  appVersion: string
  platform: ExportPlatform
  arch: 'x64' | 'arm64'
  electronVersion: string
  icon: string
  /** Windows version resources: packager reads package.json's author for CompanyName otherwise, and fails without one. */
  win32metadata: { CompanyName: string }
  overwrite: true
  prune: false
  asar: false
  quiet: true
}

/** The export's boundaries: the Project's build, the packager and the console. Tests pass fakes. */
export interface ExportDeps {
  build(project: string, outDir: string): Promise<void>
  packager(call: PackagerCall): Promise<string[]>
  /** Installs a package (`steamworks.js@0.4.0`) into the staged app's node_modules. */
  installSteamworks(appDir: string, spec: string): Promise<void>
  log: { info(line: string): void; warn(line: string): void }
  /** The compiled shell modules (dist/export-desktop/shell). */
  shellDir: string
  electronVersion: string
}

/** One architecture per platform in this delivery (issue #200 inference 7). */
const ARCH: Record<ExportPlatform, PackagerCall['arch']> = { linux: 'x64', win32: 'x64', darwin: 'arm64' }

/** The app name as a file name: no path separators or characters Windows refuses. */
function fileSafeName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, '-').trim()
  return safe === '' ? 'game' : safe
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The exact Electron version the CLI pins (`devDependencies.electron`, which
 * Dependabot bumps): the build writes it next to this module, and a checkout
 * run reads the manifest itself.
 */
export async function readElectronVersion(here = import.meta.dirname): Promise<string> {
  const built = path.join(here, 'electron-version.json')
  const source = existsSync(built) ? built : path.resolve(here, '..', '..', 'package.json')
  const parsed: unknown = JSON.parse(await readFile(source, 'utf8'))
  const version = isRecord(parsed) && isRecord(parsed['devDependencies']) ? parsed['devDependencies']['electron'] : undefined
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`cannot read the pinned Electron version from ${source}`)
  }
  return version
}

async function realDeps(): Promise<ExportDeps> {
  const { packager } = await import('@electron/packager')
  return {
    build: viteBuild,
    packager: (call) => packager(call),
    installSteamworks: npmInstall,
    log: { info: (line) => console.log(line), warn: (line) => console.warn(line) },
    shellDir: path.join(import.meta.dirname, 'shell'),
    electronVersion: await readElectronVersion(),
  }
}

interface PlatformJob {
  platform: ExportPlatform
  appDir: string
  iconPng: string
  name: string
  version: string
  out: string
}

/**
 * Packages one platform into a scratch folder beside the output, then
 * replaces `<out>/<name>-<platform>-<arch>/` and its .zip with it: every other
 * platform's folder and zip stay byte-identical (CA-12).
 */
async function packagePlatform(job: PlatformJob, deps: ExportDeps): Promise<void> {
  const arch = ARCH[job.platform]
  const target = path.join(job.out, `${job.name}-${job.platform}-${arch}`)
  const scratch = await mkdtemp(path.join(job.out, '.waica-packaging-'))
  try {
    const [packaged] = await deps.packager({
      dir: job.appDir,
      out: scratch,
      name: job.name,
      executableName: job.name,
      appVersion: job.version,
      platform: job.platform,
      arch,
      electronVersion: deps.electronVersion,
      icon: job.iconPng,
      win32metadata: { CompanyName: job.name },
      overwrite: true,
      prune: false,
      asar: false,
      quiet: true,
    })
    if (packaged === undefined) throw new Error(`@electron/packager produced no app for ${job.platform}-${arch}`)
    await rm(target, { recursive: true, force: true })
    await rm(`${target}.zip`, { force: true })
    await rename(packaged, target)
    await zipDirectory(target, `${target}.zip`)
    deps.log.info(`  ✔ ${job.platform}-${arch}: ${target} (+ .zip)`)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/** Packages the Project in `args.dir` once per platform (CA-7 to CA-13). */
export async function exportDesktop(args: ExportArgs, deps?: ExportDeps): Promise<void> {
  const project = await readDesktopProject(args.dir)
  const name = fileSafeName(args.name ?? project.packageName)
  const config = resolveShellConfig(project.game, name, { enabled: args.steam, appId: args.steamAppId })
  const resolved = deps ?? (await realDeps())
  const out = path.resolve(args.out ?? path.join(project.dir, 'export'))
  const work = await mkdtemp(path.join(os.tmpdir(), 'waica-export-'))
  try {
    const iconPng = await prepareIcons(project.dir, args.icon, path.join(work, 'icons'))
    const distDir = path.join(work, 'dist')
    await resolved.build(project.dir, distDir)
    const appDir = path.join(work, 'app')
    const { shellDir } = resolved
    await stageApp({ appDir, distDir, shellDir, config, packageName: project.packageName, version: project.version, iconPng })
    if (config.steam) await stageSteam(appDir, config.steam, (dir, spec) => resolved.installSteamworks(dir, spec))
    await mkdir(out, { recursive: true })
    for (const platform of args.platforms) {
      await packagePlatform({ platform, appDir, iconPng, name, version: project.version, out }, resolved)
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

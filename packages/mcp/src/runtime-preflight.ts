import { constants } from 'node:fs'
import { access, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  RuntimeToolError,
  type StartRuntimeInput,
} from './runtime-service.js'

export type RuntimePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'
const RUNTIME_PORT_ARGUMENT = '__WAICA_RUNTIME_PORT__'

export interface RuntimePreflightAdapters {
  platform: NodeJS.Platform
  commandAvailable(command: string): Promise<boolean>
  discoverBrowser(explicitPath?: string): Promise<string | undefined>
}

export interface RuntimePreflightResult {
  projectPath: string
  packageManager: RuntimePackageManager
  command: string
  args: string[]
  viewport: { width: number; height: number }
  timeoutMs: number
  headless: boolean
  browserExecutablePath: string
  engine: { package: '@waica/engine'; version: string; source: 'project' }
}

interface ProjectManifest {
  scripts?: Record<string, unknown>
  dependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
  packageManager?: unknown
}

function runtimeError(
  projectPath: string,
  stage: 'project' | 'package-manager' | 'dependencies' | 'browser',
  message: string,
): RuntimeToolError {
  return new RuntimeToolError({
    code: 'runtime-prerequisite-missing',
    stage,
    message,
    projectPath,
  })
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function defaultCommandAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore' })
    child.once('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') resolve(false)
      else resolve(false)
    })
    child.once('spawn', () => {
      child.once('close', () => resolve(true))
    })
  })
}

const MAC_BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]

const LINUX_BROWSERS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

async function defaultDiscoverBrowser(explicitPath?: string): Promise<string | undefined> {
  const candidates = explicitPath
    ? [explicitPath]
    : process.platform === 'darwin'
      ? MAC_BROWSERS
      : LINUX_BROWSERS
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK)
      return realpath(candidate)
    } catch {
      // Continue deterministic discovery.
    }
  }
  return undefined
}

export const DEFAULT_RUNTIME_PREFLIGHT_ADAPTERS: RuntimePreflightAdapters = {
  platform: process.platform,
  commandAvailable: defaultCommandAvailable,
  discoverBrowser: defaultDiscoverBrowser,
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function validateViewport(
  projectPath: string,
  value: unknown,
  label: string,
): { width: number; height: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { width, height } = value as { width?: unknown; height?: unknown }
  if (!isPositiveInteger(width) || !isPositiveInteger(height) || width * height > 1_000_000) {
    if (label === 'explicit') {
      throw runtimeError(
        projectPath,
        'project',
        'viewport width and height must be positive integers totaling at most 1,000,000 pixels.',
      )
    }
    return null
  }
  return { width, height }
}

async function projectViewport(
  projectPath: string,
  explicit?: { width: number; height: number },
): Promise<{ width: number; height: number }> {
  if (explicit) return validateViewport(projectPath, explicit, 'explicit')!
  try {
    const game = JSON.parse(await readFile(path.join(projectPath, 'src/game.json'), 'utf8')) as {
      resolution?: unknown
    }
    return validateViewport(projectPath, game.resolution, 'project') ?? { width: 640, height: 360 }
  } catch {
    return { width: 640, height: 360 }
  }
}

async function selectPackageManager(
  projectPath: string,
  manifest: ProjectManifest,
): Promise<RuntimePackageManager> {
  if (manifest.packageManager !== undefined) {
    if (typeof manifest.packageManager !== 'string') {
      throw runtimeError(projectPath, 'package-manager', 'packageManager must be a string such as pnpm@11.4.0.')
    }
    const match = /^(npm|pnpm|yarn|bun)@[^\s]+$/.exec(manifest.packageManager)
    if (!match) {
      throw runtimeError(
        projectPath,
        'package-manager',
        `Unsupported or invalid packageManager "${manifest.packageManager}"; use npm, pnpm, yarn or bun with a version.`,
      )
    }
    return match[1] as RuntimePackageManager
  }

  const locks: Array<[string, RuntimePackageManager]> = [
    ['package-lock.json', 'npm'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
  ]
  const present: Array<[string, RuntimePackageManager]> = []
  for (const lock of locks) {
    if (await exists(path.join(projectPath, lock[0]))) present.push(lock)
  }
  if (present.length > 1) {
    throw runtimeError(
      projectPath,
      'package-manager',
      `Conflicting root lockfiles: ${present.map(([file]) => file).join(', ')}. Keep exactly one.`,
    )
  }
  return present[0]?.[1] ?? 'npm'
}

function devArgs(manager: RuntimePackageManager): string[] {
  const viteArgs = [
    '--host',
    '127.0.0.1',
    '--port',
    RUNTIME_PORT_ARGUMENT,
    '--strictPort',
  ]
  return manager === 'yarn'
    ? ['run', 'dev', ...viteArgs]
    : ['run', 'dev', '--', ...viteArgs]
}

async function packageRootFromEntry(entry: string, packageName: string): Promise<string> {
  for (let current = path.dirname(entry); ; current = path.dirname(current)) {
    try {
      const manifest = JSON.parse(await readFile(path.join(current, 'package.json'), 'utf8')) as {
        name?: unknown
      }
      if (manifest.name === packageName) return current
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parent = path.dirname(current)
    if (parent === current) throw new Error(`could not locate package root for ${packageName}`)
  }
}

async function verifyDependencies(
  projectPath: string,
  manifest: ProjectManifest,
): Promise<RuntimePreflightResult['engine']> {
  const dependencies = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
  }
  const names = Object.keys(dependencies).sort()
  if (!names.includes('@waica/engine')) {
    throw runtimeError(
      projectPath,
      'dependencies',
      'The Project must declare and install @waica/engine before it can run.',
    )
  }
  const anchoredRequire = createRequire(path.join(projectPath, 'package.json'))
  const entries = new Map<string, string>()
  for (const name of names) {
    try {
      entries.set(name, anchoredRequire.resolve(name))
    } catch (error) {
      throw runtimeError(
        projectPath,
        'dependencies',
        `Project dependency ${name} is not resolvable; install dependencies before starting. (${error instanceof Error ? error.message : String(error)})`,
      )
    }
  }
  const engineRoot = await packageRootFromEntry(entries.get('@waica/engine')!, '@waica/engine')
  const engineManifest = JSON.parse(await readFile(path.join(engineRoot, 'package.json'), 'utf8')) as {
    version?: unknown
  }
  if (typeof engineManifest.version !== 'string' || engineManifest.version.length === 0) {
    throw runtimeError(projectPath, 'dependencies', 'Installed @waica/engine has no valid version.')
  }
  return { package: '@waica/engine', version: engineManifest.version, source: 'project' }
}

export async function preflightRuntimeProject(
  input: StartRuntimeInput,
  adapters: RuntimePreflightAdapters = DEFAULT_RUNTIME_PREFLIGHT_ADAPTERS,
): Promise<RuntimePreflightResult> {
  if (adapters.platform === 'win32') {
    throw new RuntimeToolError({
      code: 'runtime-unsupported-host',
      stage: 'project',
      message: 'Run Sessions support macOS and Linux; Windows is not supported in this MVP.',
      projectPath: input.projectPath,
    })
  }
  if (adapters.platform !== 'darwin' && adapters.platform !== 'linux') {
    throw new RuntimeToolError({
      code: 'runtime-unsupported-host',
      stage: 'project',
      message: `Run Sessions do not support host platform ${adapters.platform}.`,
      projectPath: input.projectPath,
    })
  }

  let projectPath: string
  try {
    projectPath = await realpath(input.projectPath)
  } catch (error) {
    throw runtimeError(
      input.projectPath,
      'project',
      `Project path is not accessible: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (
    !(await exists(path.join(projectPath, 'src/game.json'))) &&
    !(await exists(path.join(projectPath, 'src/scenes/main.scene.json')))
  ) {
    throw runtimeError(
      projectPath,
      'project',
      'Not a Waica Project: expected src/game.json or src/scenes/main.scene.json.',
    )
  }

  let manifest: ProjectManifest
  try {
    const parsed = JSON.parse(await readFile(path.join(projectPath, 'package.json'), 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected an object')
    manifest = parsed as ProjectManifest
  } catch (error) {
    throw runtimeError(
      projectPath,
      'project',
      `package.json must be readable JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const dev = manifest.scripts?.dev
  if (typeof dev !== 'string' || dev.trim().length === 0) {
    throw runtimeError(projectPath, 'project', 'package.json scripts.dev must be a nonempty string.')
  }

  const packageManager = await selectPackageManager(projectPath, manifest)
  if (!(await adapters.commandAvailable(packageManager))) {
    throw runtimeError(
      projectPath,
      'package-manager',
      `Package-manager executable "${packageManager}" is not available on PATH.`,
    )
  }
  const engine = await verifyDependencies(projectPath, manifest)
  const browserExecutablePath = await adapters.discoverBrowser(input.browserExecutablePath)
  if (!browserExecutablePath) {
    throw runtimeError(
      projectPath,
      'browser',
      input.browserExecutablePath
        ? `Browser executable is not available: ${input.browserExecutablePath}`
        : 'No compatible system Chrome or Chromium executable was found.',
    )
  }

  const timeoutMs = input.timeoutMs ?? 30_000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw runtimeError(projectPath, 'project', 'timeout_ms must be an integer from 1,000 through 120,000.')
  }

  return {
    projectPath,
    packageManager,
    command: packageManager,
    args: devArgs(packageManager),
    viewport: await projectViewport(projectPath, input.viewport),
    timeoutMs,
    headless: input.headless ?? true,
    browserExecutablePath,
    engine,
  }
}

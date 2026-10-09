import { execFile } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { copyFile, cp, mkdir, mkdtemp } from 'node:fs/promises'
import * as nodeModule from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { KNOWN_ARCHETYPES } from './known-archetypes.js'

/**
 * Package entries a checkout runner falls back to when a Project has no
 * installed @waica packages: the checkout's built dist, or — for a TypeScript
 * runner — a one-time compile of the package sources.
 */

const FALLBACK_PACKAGE_DIRECTORIES: ReadonlyArray<readonly [string, string]> = [
  ['@waica/engine', 'engine'],
  ['@waica/behaviors', 'behaviors'],
  ...KNOWN_ARCHETYPES.map(({ packageName, directory }) => [packageName, directory] as const),
]
const execFileAsync = promisify(execFile)
/** A checkout fallback `tsc` compile that has not finished in two minutes is killed. */
const FALLBACK_COMPILE_TIMEOUT_MS = 120_000
let sourceFallbackEntries: Promise<Record<string, string>> | undefined

function checkoutPackagesRoot(): string | undefined {
  const candidate = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
  )
  return FALLBACK_PACKAGE_DIRECTORIES.every(([, directory]) =>
    existsSync(path.join(candidate, directory, 'package.json')),
  )
    ? candidate
    : undefined
}

async function compileSourceFallbacks(packagesRoot: string): Promise<Record<string, string>> {
  const repositoryRoot = path.dirname(packagesRoot)
  const requireFromLoader = nodeModule.createRequire(import.meta.url)
  const typescriptRoot = path.dirname(requireFromLoader.resolve('typescript/package.json'))
  const compiler = path.join(typescriptRoot, 'bin', 'tsc')
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'waica-mcp-fallback-'))
  try {
    await Promise.all(
      FALLBACK_PACKAGE_DIRECTORIES.map(async ([, directory]) => {
        const sourceRoot = path.join(packagesRoot, directory)
        const destinationRoot = path.join(outputRoot, directory)
        await mkdir(destinationRoot, { recursive: true })
        await Promise.all([
          execFileAsync(
            process.execPath,
            [
              compiler,
              '-p',
              path.join(sourceRoot, 'tsconfig.build.json'),
              '--outDir',
              path.join(destinationRoot, 'dist'),
              '--declaration',
              'false',
            ],
            { cwd: repositoryRoot, timeout: FALLBACK_COMPILE_TIMEOUT_MS },
          ),
          copyFile(
            path.join(sourceRoot, 'package.json'),
            path.join(destinationRoot, 'package.json'),
          ),
          ...(existsSync(path.join(sourceRoot, 'assets'))
            ? [
                cp(path.join(sourceRoot, 'assets'), path.join(destinationRoot, 'assets'), {
                  recursive: true,
                }),
              ]
            : []),
        ])
      }),
    )
    const entries: Record<string, string> = Object.fromEntries(
      FALLBACK_PACKAGE_DIRECTORIES.map(([specifier, directory]) => [
        specifier,
        path.join(outputRoot, directory, 'dist', 'index.js'),
      ]),
    )
    Object.assign(entries, threeEntries(packagesRoot))
    if (Object.values(entries).some((entry) => !existsSync(entry))) {
      throw new Error('TypeScript fallback compilation did not emit every package entry.')
    }
    process.once('exit', () => rmSync(outputRoot, { recursive: true, force: true }))
    return entries
  } catch (error) {
    rmSync(outputRoot, { recursive: true, force: true })
    throw error
  }
}

/** Every specifier the engine imports three with: the builds (ADR 0025) and the addons its glTF loading uses (ADR 0027). */
const THREE_SPECIFIERS = [
  'three',
  'three/webgpu',
  'three/tsl',
  'three/addons/loaders/GLTFLoader.js',
  'three/addons/utils/SkeletonUtils.js',
]

/** The engine's own copy of three, by every specifier the engine imports it with. */
function threeEntries(packagesRoot: string): Record<string, string> {
  const engineRequire = nodeModule.createRequire(path.join(packagesRoot, 'engine', 'package.json'))
  return Object.fromEntries(THREE_SPECIFIERS.map((specifier) => [specifier, engineRequire.resolve(specifier)]))
}

export async function fallbackEntriesFor(runnerPath: string): Promise<Record<string, string>> {
  const packagesRoot = checkoutPackagesRoot()
  if (!packagesRoot) return {}
  const built: Record<string, string> = Object.fromEntries(
    FALLBACK_PACKAGE_DIRECTORIES.map(([specifier, directory]) => [
      specifier,
      path.join(packagesRoot, directory, 'dist', 'index.js'),
    ]),
  )
  Object.assign(built, threeEntries(packagesRoot))
  if (Object.values(built).every((entry) => existsSync(entry))) return built
  if (!runnerPath.endsWith('.ts')) return {}
  sourceFallbackEntries ??= compileSourceFallbacks(packagesRoot)
  return sourceFallbackEntries
}


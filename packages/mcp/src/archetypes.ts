import type { ArchetypeManifest } from '@waica/engine'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  PackageResolver,
  PackageUnavailableError,
  type LoadedPackage,
} from './package-resolver.js'
import { WaicaToolError } from './project-path.js'

export interface ResolvedArchetype {
  packageName: string
  loaded: LoadedPackage<{ ARCHETYPE: ArchetypeManifest }>
  manifest: ArchetypeManifest
}

async function dependencyNames(projectPath: string): Promise<string[]> {
  const file = path.join(projectPath, 'package.json')
  try {
    const pkg = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
    const names = new Set<string>()
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const dependencies = pkg[section]
      if (!dependencies || typeof dependencies !== 'object') continue
      for (const name of Object.keys(dependencies)) {
        if (name.startsWith('@waica/archetype-')) names.add(name)
      }
    }
    return [...names].sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error(`Cannot read project dependencies from ${file}: ${(error as Error).message}`)
  }
}

export async function activeArchetypeId(projectPath: string): Promise<string> {
  const relative = 'src/game.json'
  let source: string
  try {
    source = await readFile(path.join(projectPath, relative), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'platformer'
    throw new Error(`Cannot read ${relative}: ${(error as Error).message}`, { cause: error })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source) as unknown
  } catch (error) {
    throw new Error(`Cannot parse ${relative}: ${(error as Error).message}`, { cause: error })
  }
  if (!parsed || typeof parsed !== 'object') return 'platformer'
  const archetype = (parsed as { archetype?: unknown }).archetype
  return typeof archetype === 'string' && archetype ? archetype : 'platformer'
}

export async function discoverArchetypes(
  projectPath: string,
  resolver = new PackageResolver(projectPath),
  warnings: string[] = [],
): Promise<ResolvedArchetype[]> {
  const packages = new Set(await dependencyNames(projectPath))
  packages.add('@waica/archetype-platformer')
  const resolved: ResolvedArchetype[] = []
  for (const packageName of [...packages].sort()) {
    try {
      const loaded = await resolver.load<{ ARCHETYPE: ArchetypeManifest }>(packageName, './manifest')
      const manifest = loaded.module.ARCHETYPE
      if (!manifest || typeof manifest.id !== 'string') {
        throw new Error(`${packageName}/manifest does not export ARCHETYPE with a string id`)
      }
      resolved.push({ packageName, loaded, manifest })
    } catch (error) {
      if (!(error instanceof PackageUnavailableError)) throw error
      warnings.push(`Declared archetype package ${packageName} is not installed; it was skipped.`)
    }
  }
  return resolved
}

export function pickArchetype(
  available: readonly ResolvedArchetype[],
  id: string,
  projectPath: string,
): ResolvedArchetype {
  const selected = available.find((entry) => entry.manifest.id === id)
  if (selected) return selected
  const ids = available.map((entry) => entry.manifest.id).sort()
  throw new WaicaToolError({
    code: 'unknown-archetype',
    message: `Unknown archetype "${id}". Available ids: ${ids.join(', ')}.`,
    projectPath,
    available: ids,
  })
}

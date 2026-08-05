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

async function dependencyNames(projectPath: string, warnings: string[]): Promise<string[]> {
  const file = path.join(projectPath, 'package.json')
  let source: string
  try {
    source = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error(`Cannot read project dependencies from ${file}: ${(error as Error).message}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source) as unknown
  } catch (error) {
    warnings.push(
      `Cannot parse project package.json; archetype dependency discovery was skipped: ${(error as Error).message}`,
    )
    return []
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const pkg = parsed as Record<string, unknown>
  const names = new Set<string>()
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const dependencies = pkg[section]
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue
    for (const name of Object.keys(dependencies)) {
      if (name.startsWith('@waica/archetype-')) names.add(name)
    }
  }
  return [...names].sort()
}

export async function activeArchetypeId(projectPath: string): Promise<string | null> {
  const relative = 'src/game.json'
  let source: string
  try {
    source = await readFile(path.join(projectPath, relative), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error(`Cannot read ${relative}: ${(error as Error).message}`, { cause: error })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source) as unknown
  } catch (error) {
    throw new Error(`Cannot parse ${relative}: ${(error as Error).message}`, { cause: error })
  }
  if (!parsed || typeof parsed !== 'object') return null
  const archetype = (parsed as { archetype?: unknown }).archetype
  return typeof archetype === 'string' && archetype ? archetype : null
}

export async function discoverArchetypes(
  projectPath: string,
  resolver = new PackageResolver(projectPath),
  warnings: string[] = [],
  requiredIds: readonly string[] = [],
): Promise<ResolvedArchetype[]> {
  const packages = new Set(await dependencyNames(projectPath, warnings))
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
      if (error instanceof PackageUnavailableError) {
        warnings.push(`Declared archetype package ${packageName} is not installed; it was skipped.`)
      } else if (
        packageName === '@waica/archetype-platformer' ||
        requiredIds.includes(packageName.slice('@waica/archetype-'.length))
      ) {
        throw error
      } else {
        warnings.push(
          `Declared archetype package ${packageName} could not be loaded and was skipped: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }
  return resolved
}

export function pickArchetype(
  available: readonly ResolvedArchetype[],
  id: string | null,
  projectPath: string,
): ResolvedArchetype {
  const selected = id ? available.find((entry) => entry.manifest.id === id) : undefined
  if (selected) return selected
  const ids = available.map((entry) => entry.manifest.id).sort()
  throw new WaicaToolError({
    code: 'unknown-archetype',
    message: id
      ? `Unknown archetype "${id}". Available ids: ${ids.join(', ')}.`
      : `The active archetype is unknown because src/game.json is missing or does not declare one. Available ids: ${ids.join(', ')}.`,
    projectPath,
    available: ids,
  })
}

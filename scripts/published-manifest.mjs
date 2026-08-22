// The shape a workspace library takes when it leaves this repo, derived from
// its checkout manifest the way `pnpm publish` derives it: publishConfig wins,
// workspace ranges become real versions, and build-time-only fields go away.
//
// Two callers need that shape to be identical. packages/cli/bundle-mcp.mjs
// vendors the libraries inside the published CLI, and scripts/prepare-publish
// .mjs hands them to `npm publish` in CI. If they drifted, the copies the MCP
// server falls back to would describe a different package than the one on npm.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The published libraries, in dependency order — behaviors needs engine. */
export const PUBLISHED_LIBRARIES = [
  'engine',
  'behaviors',
  'archetype-platformer',
  'archetype-topdown',
  'archetype-isometric',
]

export const packagesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
)

/** Reads the published library manifests off the checkout, in dependency order. */
export function readLibraryManifests() {
  return PUBLISHED_LIBRARIES.map((directory) => {
    const root = path.join(packagesRoot, directory)
    return {
      directory,
      root,
      source: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')),
    }
  })
}

/** Package name → version, for resolving `workspace:^` into a real range. */
export function libraryVersions(manifests) {
  return new Map(manifests.map(({ source }) => [source.name, source.version]))
}

export function publishedManifest(source, versions) {
  const { publishConfig = {}, scripts, devDependencies, ...rest } = source
  const manifest = { ...rest, ...publishConfig }
  if (manifest.dependencies) {
    manifest.dependencies = Object.fromEntries(
      Object.entries(manifest.dependencies).map(([name, range]) => {
        if (range !== 'workspace:^') return [name, range]
        const version = versions.get(name)
        // Silently emitting "^" here would publish an uninstallable package,
        // so an unknown workspace dependency has to stop the build instead.
        if (!version) {
          throw new Error(`${source.name} depends on ${name}, which is not a published library`)
        }
        return [name, `^${version}`]
      }),
    )
  }
  return manifest
}

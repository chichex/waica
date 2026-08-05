// Copies the built MCP server into dist/mcp so `waica mcp` ships inside the
// published CLI, together with the @waica libraries it falls back to when the
// user's project has no node_modules of its own. Those libraries land in a real
// node_modules tree next to the server, which is what makes the resolver's
// createRequire find them exactly the way it finds installed dependencies.
// Runs after tsc in this package's build script; pnpm's topological ordering
// (via the @waica/mcp devDependency) guarantees the server is built first.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  libraryVersions,
  publishedManifest,
  readLibraryManifests,
} from '../../scripts/published-manifest.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const packages = path.join(here, '..')
const mcpDist = path.join(packages, 'mcp', 'dist')
const target = path.join(here, 'dist', 'mcp')

function fail(message) {
  console.error(`waica: ${message}`)
  process.exit(1)
}

if (!existsSync(path.join(mcpDist, 'stdio.js'))) {
  fail('MCP build not found — run `pnpm --filter @waica/mcp build` first')
}
if (!existsSync(path.join(mcpDist, 'template', 'package.json.tpl'))) {
  fail('MCP build is missing its bundled project template')
}

rmSync(target, { recursive: true, force: true })
cpSync(mcpDist, target, { recursive: true })

// The vendored copies must describe the packages npm serves, not the checkout:
// the resolver reads `version` and `exports` off these manifests. Sharing the
// rewrite with the publish step is what keeps the two descriptions the same.
const manifests = readLibraryManifests()
const versions = libraryVersions(manifests)

for (const { directory, root, source } of manifests) {
  const destination = path.join(target, 'node_modules', ...source.name.split('/'))
  mkdirSync(destination, { recursive: true })

  for (const published of source.files) {
    const from = path.join(root, published)
    if (!existsSync(from)) fail(`${source.name} is missing its published ${published}/ directory`)
    cpSync(from, path.join(destination, published), { recursive: true })
  }
  if (!existsSync(path.join(destination, 'dist', 'index.js'))) {
    fail(`${source.name} was not built — run \`pnpm --filter @waica/${directory} build\` first`)
  }

  writeFileSync(
    path.join(destination, 'package.json'),
    `${JSON.stringify(publishedManifest(source, versions), null, 2)}\n`,
  )
}

console.log(`waica: bundled MCP server and ${manifests.length} @waica packages from ${path.relative(process.cwd(), mcpDist)}`)

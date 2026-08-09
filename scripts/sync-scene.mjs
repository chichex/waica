// Syncs the archetype's defaults (source of truth in TS) to the project
// JSONs — the scene plus one file per prefab (src/<key>.<type>.json, the
// same layout the editor's projectFiles() emits) plus the stock art PNGs
// (src/art/<file>) — into the repo example and the editor's project template.
// Each target declares its archetype in src/game.json; the matching
// packages/archetype-<id> manifest drives the sync.
// Requires built dists: pnpm -r build (archetype, behaviors, engine)
//
//   node scripts/sync-scene.mjs

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// Workspace packages export their TS source for bundlers; node needs the
// built dist (pnpm -r build). Same for the dists' extensionless relative
// imports ('./scene-default'): append '.js' here.
const WORKSPACE_DIST = ['behaviors', 'engine']
registerHooks({
  resolve(specifier, context, nextResolve) {
    const pkg = WORKSPACE_DIST.find((name) => specifier === `@waica/${name}`)
    if (pkg) {
      const dist = pathToFileURL(join(root, 'packages', pkg, 'dist', 'index.js')).href
      return nextResolve(dist, context)
    }
    if (specifier.startsWith('.') && !specifier.endsWith('.js') && !specifier.endsWith('.json')) {
      return nextResolve(`${specifier}.js`, context)
    }
    return nextResolve(specifier, context)
  },
})

// The target's archetype id, from its game.json ('platformer' when absent —
// the same legacy default the editor applies). A game.json that exists but
// fails to parse is a real error, not a silent platformer sync: swallowing
// it would overwrite an unrelated archetype's project with platformer content.
function archetypeIdOf(srcDir) {
  const gamePath = join(srcDir, 'game.json')
  if (!existsSync(gamePath)) return 'platformer'
  let game
  try {
    game = JSON.parse(readFileSync(gamePath, 'utf8'))
  } catch (err) {
    throw new Error(`Malformed ${gamePath}: ${err.message}`)
  }
  return typeof game.archetype === 'string' && game.archetype ? game.archetype : 'platformer'
}

// One Node-safe manifest (the ARCHETYPE export) per archetype id, cached.
const manifests = new Map()
function manifestFor(id) {
  if (!manifests.has(id)) {
    const entry = pathToFileURL(
      join(root, 'packages', `archetype-${id}`, 'dist', 'manifest.js'),
    ).href
    manifests.set(
      id,
      import(entry).then((module) => module.ARCHETYPE),
    )
  }
  return manifests.get(id)
}

// Projects own components the archetype knows nothing about (src/components/*.ts,
// e.g. the example's Gun). The archetype can never define them — that is the
// product line — so regenerating a prefab must keep whatever the target added
// on top instead of silently deleting the mechanic.
function keepProjectComponents(target, prefab) {
  if (!existsSync(target)) return prefab
  let existing
  try {
    existing = JSON.parse(readFileSync(target, 'utf8'))
  } catch {
    return prefab
  }
  const generated = new Set(prefab.components.map((c) => c.type))
  const extra = (existing.components ?? []).filter((c) => !generated.has(c.type))
  if (extra.length === 0) return prefab
  console.log(`keep → ${target}: ${extra.map((c) => c.type).join(', ')}`)
  return { ...prefab, components: [...prefab.components, ...extra] }
}

const TARGETS = [
  join(root, 'examples', 'platformer', 'src'),
  join(root, 'packages', 'editor', 'template', 'src'),
]
for (const srcDir of TARGETS) {
  const id = archetypeIdOf(srcDir)
  const archetype = await manifestFor(id)

  // Materialized projects own their art as files: registry URIs ('waica:dog')
  // become project paths ('src/art/waica-dog.png'), same as projectFiles().
  const uriToPath = Object.fromEntries(
    archetype.art.map((art) => [art.uri, `src/art/${art.file}`]),
  )
  const toJson = (value) =>
    JSON.stringify(value, (_key, v) => (typeof v === 'string' ? (uriToPath[v] ?? v) : v), 2) +
    '\n'

  // String values are written verbatim (the UI pieces' HTML); the rest as JSON.
  const files = { 'scenes/main.scene.json': archetype.scene }
  const prefabFiles = new Set()
  for (const [key, prefab] of Object.entries(archetype.prefabs)) {
    const rel = `${key}.${prefab.type}.json`
    files[rel] = prefab
    prefabFiles.add(rel)
  }
  for (const [name, html] of Object.entries(archetype.registry.ui ?? {})) {
    files[`ui/${name}.html`] = html
  }

  for (const [rel, data] of Object.entries(files)) {
    const target = join(srcDir, rel)
    mkdirSync(dirname(target), { recursive: true })
    const value = prefabFiles.has(rel) ? keepProjectComponents(target, data) : data
    writeFileSync(target, typeof value === 'string' ? value : toJson(value))
    console.log(`sync → ${target}`)
  }
  for (const art of archetype.art) {
    const target = join(srcDir, 'art', art.file)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(root, 'packages', `archetype-${id}`, 'assets', art.file), target)
    console.log(`sync → ${target}`)
  }
}

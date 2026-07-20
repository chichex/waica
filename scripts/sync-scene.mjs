// Syncs the archetype's defaults (source of truth in TS) to the project
// JSONs — the scene plus one file per prefab (src/<key>.<type>.json, the
// same layout the editor's projectFiles() emits) — into the repo example
// and the wizard template.
// Requires the archetype build: pnpm --filter @waica/archetype-platformer build
//
//   node scripts/sync-scene.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The archetype dist targets bundlers: its relative imports are extensionless
// ('./scene-default'), which node's ESM resolver rejects. Append '.js' here.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !specifier.endsWith('.js')) {
      return nextResolve(`${specifier}.js`, context)
    }
    return nextResolve(specifier, context)
  },
})

const { PLATFORMER_SCENE } = await import('../packages/archetype-platformer/dist/scene-default.js')
const { PLATFORMER_PREFABS } = await import('../packages/archetype-platformer/dist/prefabs.js')
const { PLATFORMER_UI } = await import('../packages/archetype-platformer/dist/ui.js')

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// String values are written verbatim (the UI pieces' HTML); the rest as JSON.
const FILES = { 'scenes/main.scene.json': PLATFORMER_SCENE }
for (const [key, prefab] of Object.entries(PLATFORMER_PREFABS)) {
  FILES[`${key}.${prefab.type}.json`] = prefab
}
for (const [name, html] of Object.entries(PLATFORMER_UI)) {
  FILES[`ui/${name}.html`] = html
}

const TARGETS = [
  join(root, 'examples', 'platformer', 'src'),
  join(root, 'packages', 'create-waica', 'template', 'src'),
]
for (const srcDir of TARGETS) {
  for (const [rel, data] of Object.entries(FILES)) {
    const target = join(srcDir, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n')
    console.log(`sync → ${target}`)
  }
}

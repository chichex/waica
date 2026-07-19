// Sincroniza la escena default del arquetipo (fuente de verdad en TS) a
// los JSON de proyecto: el example del repo y el template del wizard.
// Requiere el build del arquetipo: pnpm --filter @waica/archetype-platformer build
//
//   node scripts/sync-scene.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLATFORMER_SCENE } from '../packages/archetype-platformer/dist/scene-default.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const json = JSON.stringify(PLATFORMER_SCENE, null, 2) + '\n'

const TARGETS = [
  join(root, 'examples', 'platformer', 'src', 'scenes', 'main.scene.json'),
  join(root, 'packages', 'create-waica', 'template', 'src', 'scenes', 'main.scene.json'),
]
for (const target of TARGETS) {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, json)
  console.log(`escena → ${target}`)
}

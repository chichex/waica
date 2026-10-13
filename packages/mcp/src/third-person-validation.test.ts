import { afterAll, beforeAll, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ARCHETYPE } from '../../archetype-third-person/src/manifest.js'
import { createProject } from './create-project.js'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { cleanup, tempDir } from './test-helpers.js'
import { validateProject } from './validation.js'

// Issue #181 CA-25 (each prefab in a 3D scene) and CA-26 (both scenes), through validate_project.

let parent = ''
let project = ''

beforeAll(async () => {
  await fallbackEntriesFor('project-component-runner.ts')
  parent = await tempDir()
  project = path.join(parent, 'tp-validation')
  await createProject(project, 'demo', 'third-person')
}, 120_000)

afterAll(async () => cleanup(parent))

const SCENE = path.join('src', 'scenes', 'main.scene.json')
const ART_PATHS = Object.fromEntries(ARCHETYPE.art.map((art) => [art.uri, `src/art/${art.file}`]))

/** JSON with the archetype's art uris turned into the project's own src/art/ paths, as create_project writes it. */
const asProjectJson = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) => (typeof entry === 'string' ? (ART_PATHS[entry] ?? entry) : entry))

/** Validates `scene` with every prefab file written from this checkout's sources (createProject may read the built dist). */
async function errorsFor(scene: unknown): Promise<unknown[]> {
  for (const [ref, prefab] of Object.entries(ARCHETYPE.prefabs)) {
    await writeFile(path.join(project, 'src', `${ref}.${prefab.type}.json`), asProjectJson(prefab))
  }
  await writeFile(path.join(project, SCENE), asProjectJson(scene))
  const { findings } = await validateProject(project)
  return findings.filter((finding) => finding.severity === 'error')
}

it.each(Object.keys(ARCHETYPE.prefabs))('validates the %s prefab in a 3D scene with zero errors (CA-25)', async (prefab) => {
  const { camera, render, simulation } = ARCHETYPE.scene
  const entities = [{ name: 'Player', prefab: 'characters/player', position: [0, 0, 0] }, { name: 'Subject', prefab, position: [3, 0, 3] }]

  expect(await errorsFor({ waicaScene: 3, render, simulation, camera, entities })).toEqual([])
}, 60_000)

it.each([
  ['demo', ARCHETYPE.scene],
  ['blank', ARCHETYPE.blankScene],
])('validates the %s scene with zero errors (CA-26)', async (_name, scene) => {
  expect(await errorsFor(scene)).toEqual([])
}, 60_000)

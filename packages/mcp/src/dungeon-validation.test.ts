import { afterEach, beforeAll, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createProject } from './create-project.js'
import { cleanup, tempDir } from './test-helpers.js'
import { validateProject } from './validation.js'

// A checkout without built @waica dists compiles the package sources once per
// process before its first project-component load (project-component-fallbacks.ts).
// Paid here, bounded like the compile itself, so it never lands inside a test's
// own timeout — the same guard as server.test.ts (PR #149).
beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function isometricDemo(): Promise<string> {
  const parent = await tempDir()
  roots.push(parent)
  const target = path.join(parent, 'iso-demo')
  await createProject(target, 'demo', 'isometric')
  return target
}

it('the isometric demo’s dungeon scene validates with no error, and its transitions resolve (CA-14)', async () => {
  const project = await isometricDemo()
  const scene = JSON.parse(await readFile(path.join(project, 'src/scenes/dungeon.scene.json'), 'utf8')) as {
    render?: { lighting?: unknown }
  }
  expect(scene.render?.lighting).toBeDefined()
  const result = await validateProject(project)
  const dungeon = result.findings.filter((finding) => finding.file === 'src/scenes/dungeon.scene.json')
  expect(dungeon).toEqual([])
  expect(result.findings.filter((finding) => finding.code === 'unknown-scene-transition-target')).toEqual([])
  expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([])
}, 60_000)

it('the isometric demo’s dungeon reports an out-of-range Ambient Light once edited (CA-2, CA-14)', async () => {
  const project = await isometricDemo()
  const file = path.join(project, 'src/scenes/dungeon.scene.json')
  const scene = JSON.parse(await readFile(file, 'utf8')) as { render: { lighting: { ambient: { intensity: number } } } }
  scene.render.lighting.ambient.intensity = 3
  await writeFile(file, JSON.stringify(scene))
  const result = await validateProject(project)
  expect(result.findings.filter((finding) => finding.code === 'invalid-scene-render').map((finding) => finding.ref)).toEqual([
    'render.lighting.ambient.intensity',
  ])
}, 60_000)

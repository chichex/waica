import { afterEach, beforeAll, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { createProject } from './create-project.js'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { cleanup, tempDir } from './test-helpers.js'
import { validateProject } from './validation.js'

// Issue #181 CA-29: create_project with archetype "third-person", demo and blank.

beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function created(start: 'demo' | 'blank'): Promise<string> {
  const parent = await tempDir()
  roots.push(parent)
  const target = path.join(parent, `tp-${start}`)
  await createProject(target, start, 'third-person')
  return target
}

const errorsOf = async (project: string): Promise<unknown[]> =>
  (await validateProject(project)).findings.filter((finding) => finding.severity === 'error')

it.each(['demo', 'blank'] as const)('writes a %s project validate_project accepts with zero errors (CA-29)', async (start) => {
  const project = await created(start)

  expect(await errorsOf(project)).toEqual([])
  expect(JSON.parse(await readFile(path.join(project, 'src/game.json'), 'utf8'))).toMatchObject({ archetype: 'third-person' })
  expect(await readFile(path.join(project, 'package.json'), 'utf8')).toContain('"@waica/archetype-third-person"')
  // The template's three alias: the engine draws with three/webgpu.
  expect(await readFile(path.join(project, 'vite.config.ts'), 'utf8')).toMatch(/find: \/\^three\$\/, replacement: 'three\/webgpu'/)
}, 120_000)

it('copies the demo’s art to src/art/ and rewrites its uris there (CA-29)', async () => {
  const project = await created('demo')

  const art = (await readdir(path.join(project, 'src/art'))).sort()
  expect(art).toEqual([
    'dungeon-banner.glb',
    'dungeon-chest.glb',
    'dungeon-floor.glb',
    'dungeon-foundation.glb',
    'dungeon-pillar.glb',
    'dungeon-torch.glb',
    'dungeon-wall.glb',
    'knight.glb',
    'skeleton-warrior.glb',
  ])
  const player = await readFile(path.join(project, 'src/characters/player.character.json'), 'utf8')
  expect(player).toContain('"src/art/knight.glb"')
  expect(player).not.toContain('waica:')
}, 120_000)

it('gives a blank project only what its blank scene uses: the player prefab, its HUD and the Knight (CA-29)', async () => {
  const project = await created('blank')

  expect(await readdir(path.join(project, 'src/art'))).toEqual(['knight.glb'])
  expect(await readdir(path.join(project, 'src/characters'))).toEqual(['player.character.json'])
  expect((await readdir(path.join(project, 'src/ui'))).sort()).toEqual(['controls-hint.html', 'player-health.html'])
  const scene = await readFile(path.join(project, 'src/scenes/main.scene.json'), 'utf8')
  expect(scene).toContain('"characters/player"')
}, 120_000)

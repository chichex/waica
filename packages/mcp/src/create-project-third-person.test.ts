import { afterEach, beforeAll, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { resolveEntityComponents, type PrefabJson } from '@waica/engine'
import { isPrefabJson, parseSceneJson } from '../../editor/src/scene/scene-file.js'
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
  await expectProjectShadows(project, start)
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

async function projectPrefabs(project: string): Promise<Record<string, PrefabJson>> {
  const src = path.join(project, 'src')
  const files = (await readdir(src, { recursive: true })).filter((file) => /\.(character|object|tile)\.json$/.test(file))
  const prefabs: Record<string, PrefabJson> = {}
  for (const file of files) {
    const parsed: unknown = JSON.parse(await readFile(path.join(src, file), 'utf8'))
    if (!isPrefabJson(parsed)) throw new Error(`Invalid generated prefab: ${file}`)
    const ref = file.split(path.sep).join('/').replace(/\.(character|object|tile)\.json$/, '')
    prefabs[ref] = parsed
  }
  return prefabs
}

/** CA-16: check the materialized JSON on the same Project CA-29 generates and validates. */
async function expectProjectShadows(project: string, start: 'demo' | 'blank'): Promise<void> {
  const modelCount = start === 'demo' ? 60 : 2
  const torches = start === 'demo' ? ['Torch NW', 'Torch NE', 'Torch SW', 'Torch SE'] : []
  const scene = parseSceneJson(await readFile(path.join(project, 'src/scenes/main.scene.json'), 'utf8'))
  const prefabs = await projectPrefabs(project)
  expect(scene.render?.shadows).toEqual({ quality: 'medium', maxDistance: 40 })

  const components = scene.entities.flatMap((entity) => {
    if (entity.prefab) expect(prefabs, entity.name).toHaveProperty(entity.prefab)
    return resolveEntityComponents(entity, prefabs).map((component) => ({ name: entity.name, ...component }))
  })
  const models = components.filter((component) => component.type === 'Model')
  expect(models).toHaveLength(modelCount)
  for (const model of models) expect(model.props, model.name).toMatchObject({ castShadows: true, receiveShadows: true })
  expect(models.find((model) => model.name === 'Player')?.props?.src).toBe('src/art/knight.glb')
  expect(models.filter((model) => model.props?.shape === 'plane').map((model) => model.name)).toEqual(start === 'blank' ? ['Ground'] : [])
  expect(components.filter((component) => component.type === 'PointLight').map((component) => component.name)).toEqual(torches)
  const lights = components.filter((component) => component.type === 'Sun' || component.type === 'PointLight')
  expect(lights).toHaveLength(torches.length + 1)
  for (const light of lights) expect(light.props, light.name).toHaveProperty('castShadows', true)
}

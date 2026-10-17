import { expect, it } from 'vitest'
import { resolveEntityComponents } from '@waica/engine'
import { readFileSync } from 'node:fs'
import { ARCHETYPE as BROWSER_ARCHETYPE } from './index'
import { ARCHETYPE } from './manifest'

// Issue #203 CA-16: public starts declare their shadow policy rather than relying on runtime defaults.
it.each([
  ['Node demo', ARCHETYPE.scene],
  ['Node blank', ARCHETYPE.blankScene],
  ['browser demo', BROWSER_ARCHETYPE.scene],
  ['browser blank', BROWSER_ARCHETYPE.blankScene],
])('publishes explicit Medium/40 shadows in the %s start', (_name, scene) => {
  expect(scene.render?.shadows).toEqual({ quality: 'medium', maxDistance: 40 })
})

it.each([
  { start: 'demo', scene: ARCHETYPE.scene, modelCount: 60, torches: ['Torch NW', 'Torch NE', 'Torch SW', 'Torch SE'] },
  { start: 'blank', scene: ARCHETYPE.blankScene, modelCount: 2, torches: [] },
])('keeps every Model, Sun and torch in the resolved $start shadow topology', ({ scene, modelCount, torches }) => {
  const components = scene.entities.flatMap((entity) =>
    resolveEntityComponents(entity, ARCHETYPE.prefabs).map((component) => ({ name: entity.name, ...component })),
  )
  const models = components.filter((component) => component.type === 'Model')
  expect(models).toHaveLength(modelCount)
  for (const model of models) expect(model.props, model.name).toMatchObject({ castShadows: true, receiveShadows: true })

  const suns = components.filter((component) => component.type === 'Sun')
  const points = components.filter((component) => component.type === 'PointLight')
  expect(suns.map((component) => component.name)).toEqual(['Sun'])
  expect(points.map((component) => component.name)).toEqual(torches)
  for (const light of [...suns, ...points]) expect(light.props, light.name).toHaveProperty('castShadows', true)
})

it.each(Object.entries(ARCHETYPE.prefabs))('publishes both explicit Model shadow flags in the %s prefab', (_ref, prefab) => {
  const models = prefab.components.filter((component) => component.type === 'Model')
  expect(models).toHaveLength(1)
  expect(models[0]?.props).toMatchObject({ castShadows: true, receiveShadows: true })
})

it('keeps public manifest data unchanged when palette builders create shadow overrides', () => {
  const publicData = (): string => JSON.stringify([ARCHETYPE.scene, ARCHETYPE.blankScene, ARCHETYPE.prefabs])
  const before = publicData()
  for (const template of ARCHETYPE.palette) {
    const entity = template.make()
    entity.overrides = { Model: { castShadows: false, receiveShadows: false }, PointLight: { castShadows: false } }
    const overridden = resolveEntityComponents(entity, ARCHETYPE.prefabs)
    expect(overridden.find((component) => component.type === 'Model')?.props).toMatchObject({ castShadows: false, receiveShadows: false })
    const fresh = resolveEntityComponents(template.make(), ARCHETYPE.prefabs)
    expect(fresh.find((component) => component.type === 'Model')?.props).toMatchObject({ castShadows: true, receiveShadows: true })
  }
  expect(publicData()).toBe(before)
})

const EXAMPLE = new URL('../../../examples/third-person/src/', import.meta.url)
const ART_PATHS: Readonly<Record<string, string>> = Object.fromEntries(ARCHETYPE.art.map((art) => [art.uri, `src/art/${art.file}`]))

function exampleJson(file: string): unknown {
  return JSON.parse(readFileSync(new URL(file, EXAMPLE), 'utf8'))
}

/** The example owns its art: compare all data after replacing manifest URIs with project paths. */
function projectData(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, entry: unknown) => typeof entry === 'string' ? (ART_PATHS[entry] ?? entry) : entry))
}

it('syncs the actual example scene from the manifest, including its shadow policy', () => {
  expect(exampleJson('scenes/main.scene.json')).toEqual(projectData(ARCHETYPE.scene))
})

it.each(Object.entries(ARCHETYPE.prefabs))('syncs the actual example %s prefab, shadows and project art paths', (ref, prefab) => {
  expect(exampleJson(`${ref}.${prefab.type}.json`)).toEqual(projectData(prefab))
})
